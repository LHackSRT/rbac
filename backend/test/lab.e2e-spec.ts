import { createTestContext, EMAIL, TestContext } from './helpers';

describe('Laboratory workflow (e2e)', () => {
  let ctx: TestContext;
  let pointId: string;
  let phId: string;
  let no3Id: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    pointId = (await ctx.prisma.samplingPoint.findUniqueOrThrow({ where: { code: 'STA-OUT' } })).id;
    phId = (await ctx.prisma.parameter.findUniqueOrThrow({ where: { code: 'PH' } })).id;
    no3Id = (await ctx.prisma.parameter.findUniqueOrThrow({ where: { code: 'NO3' } })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createSample(email: string = EMAIL.technician1) {
    const token = await ctx.login(email);
    const response = await ctx.http()
      .post('/api/samples')
      .set('Authorization', token)
      .send({ samplingPointId: pointId, sampledAt: new Date().toISOString(), parameterIds: [phId, no3Id], notes: 'Test' })
      .expect(201);
    return response.body;
  }

  async function analyse(sampleId: string, email: string, values = { ph: 7.2, no3: 70 }) {
    const token = await ctx.login(email);
    await ctx.http()
      .put(`/api/samples/${sampleId}/results`)
      .set('Authorization', token)
      .send({ results: [{ parameterId: phId, value: values.ph }, { parameterId: no3Id, value: values.no3 }] })
      .expect(200);
    return ctx.http().post(`/api/samples/${sampleId}/submit`).set('Authorization', token).expect(200);
  }

  it('runs the full workflow: register, analyse, submit, validate', async () => {
    const sample = await createSample();
    expect(sample).toMatchObject({ status: 'REGISTERED', parameterCount: 2, enteredCount: 0 });
    expect(sample.reference).toMatch(/^ECH-\d{5}$/);

    const analyst = await ctx.login(EMAIL.analyst2);
    await ctx.http()
      .put(`/api/samples/${sample.id}/results`)
      .set('Authorization', analyst)
      .send({ results: [{ parameterId: phId, value: 7.2 }] })
      .expect(200);
    const incomplete = await ctx.http().post(`/api/samples/${sample.id}/submit`).set('Authorization', analyst).expect(400);
    expect(incomplete.body).toMatchObject({ code: 'RESULTS_INCOMPLETE', details: { missing: ['NO3'] } });

    const submitted = await analyse(sample.id, EMAIL.analyst2);
    expect(submitted.body.status).toBe('ANALYZED');

    // An analyst without result:validate cannot validate.
    await ctx.http().post(`/api/samples/${sample.id}/validate`).set('Authorization', analyst).expect(403);

    const karim = await ctx.login(EMAIL.labManager);
    const validated = await ctx.http().post(`/api/samples/${sample.id}/validate`).set('Authorization', karim).expect(200);
    expect(validated.body).toMatchObject({ status: 'VALIDATED', nonCompliantCount: 1 });
    const nitrates = validated.body.results.find((result: { parameter: { code: string } }) => result.parameter.code === 'NO3');
    expect(nitrates).toMatchObject({ value: 70, compliant: false });
  });

  it('enforces the four-eyes principle', async () => {
    const sample = await createSample();
    await analyse(sample.id, EMAIL.labManager, { ph: 7, no3: 10 });

    const karim = await ctx.login(EMAIL.labManager);
    const refused = await ctx.http().post(`/api/samples/${sample.id}/validate`).set('Authorization', karim).expect(403);
    expect(refused.body.code).toBe('FOUR_EYES_VIOLATION');

    // Julien holds result:validate through a temporary ALLOW privilege.
    const julien = await ctx.login(EMAIL.analyst1);
    await ctx.http().post(`/api/samples/${sample.id}/validate`).set('Authorization', julien).expect(200);
  });

  it('distinguishes own and any sample updates', async () => {
    const sample = await createSample(EMAIL.technician1);
    const marc = await ctx.login(EMAIL.technician2);
    const thomas = await ctx.login(EMAIL.technician1);
    const karim = await ctx.login(EMAIL.labManager);

    const notOwner = await ctx.http().patch(`/api/samples/${sample.id}`).set('Authorization', marc).send({ notes: 'Marc' }).expect(403);
    expect(notOwner.body.code).toBe('NOT_OWNER');
    await ctx.http().patch(`/api/samples/${sample.id}`).set('Authorization', thomas).send({ notes: 'Thomas' }).expect(200);
    const updated = await ctx.http().patch(`/api/samples/${sample.id}`).set('Authorization', karim).send({ notes: 'Karim' }).expect(200);
    expect(updated.body.notes).toBe('Karim');
  });

  it('only shows validated results to holders of result:read', async () => {
    const sample = await createSample();
    await analyse(sample.id, EMAIL.analyst2);
    const viewer = await ctx.login(EMAIL.viewer);

    const pending = (await ctx.http().get(`/api/samples/${sample.id}`).set('Authorization', viewer).expect(200)).body;
    expect(pending.resultsVisible).toBe(false);
    expect(pending.results.every((result: { value: number | null }) => result.value === null)).toBe(true);

    const karim = await ctx.login(EMAIL.labManager);
    await ctx.http().post(`/api/samples/${sample.id}/validate`).set('Authorization', karim).expect(200);
    const validated = (await ctx.http().get(`/api/samples/${sample.id}`).set('Authorization', viewer).expect(200)).body;
    expect(validated.resultsVisible).toBe(true);
    expect(validated.results.map((result: { value: number }) => result.value).sort()).toEqual([7.2, 70]);
  });

  it('locks validated samples and supports rejection', async () => {
    const karim = await ctx.login(EMAIL.labManager);
    const validated = await createSample();
    await analyse(validated.id, EMAIL.analyst2);
    await ctx.http().post(`/api/samples/${validated.id}/validate`).set('Authorization', karim).expect(200);
    expect((await ctx.http().delete(`/api/samples/${validated.id}`).set('Authorization', karim).expect(409)).body.code).toBe('SAMPLE_LOCKED');
    expect(
      (await ctx.http().patch(`/api/samples/${validated.id}`).set('Authorization', karim).send({ notes: 'x' }).expect(409)).body.code,
    ).toBe('SAMPLE_LOCKED');

    const rejected = await createSample();
    await analyse(rejected.id, EMAIL.analyst2);
    const response = await ctx.http()
      .post(`/api/samples/${rejected.id}/reject`)
      .set('Authorization', karim)
      .send({ reason: 'pH incohérent, refaire la mesure' })
      .expect(200);
    expect(response.body).toMatchObject({ status: 'REGISTERED', rejectionReason: 'pH incohérent, refaire la mesure', enteredCount: 2 });
    await ctx.http().delete(`/api/samples/${rejected.id}`).set('Authorization', karim).expect(204);
  });

  it('restricts the CSV export to report:export', async () => {
    const viewer = await ctx.login(EMAIL.viewer);
    const quality = await ctx.login(EMAIL.quality);
    await ctx.http().get('/api/reports/results').set('Authorization', viewer).expect(200);
    await ctx.http().get('/api/reports/results/export').set('Authorization', viewer).expect(403);

    const csv = await ctx.http().get('/api/reports/results/export?nonCompliantOnly=true').set('Authorization', quality).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Non conforme');
    expect(csv.text).not.toContain(';Conforme;');
  });

  it('restricts threshold management to the quality manager', async () => {
    const karim = await ctx.login(EMAIL.labManager);
    const quality = await ctx.login(EMAIL.quality);
    await ctx.http().patch(`/api/parameters/${no3Id}`).set('Authorization', karim).send({ maxValue: 100 }).expect(403);
    const invalid = await ctx.http()
      .patch(`/api/parameters/${no3Id}`)
      .set('Authorization', quality)
      .send({ minValue: 60, maxValue: 50 })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    await ctx.http().patch(`/api/parameters/${no3Id}`).set('Authorization', quality).send({ maxValue: 50 }).expect(200);
  });

  it('builds a dashboard adapted to the viewer', async () => {
    const viewer = await ctx.login(EMAIL.viewer);
    const dashboard = (await ctx.http().get('/api/dashboard').set('Authorization', viewer).expect(200)).body;
    expect(dashboard.counts.total).toBeGreaterThan(0);
    expect(dashboard.nonCompliantAlerts.every((alert: { status: string }) => alert.status === 'VALIDATED')).toBe(true);
  });
});
