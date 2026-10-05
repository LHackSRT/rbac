import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, EyeOff, Pencil, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useGate } from '../../auth/Can';
import { useSession } from '../../auth/session';
import { ComplianceBadge, SampleStatusBadge } from '../../components/badges';
import { Alert, Button, Card, CardHeader, Field, Input, Modal, Spinner, Textarea, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatNumber, fullName, thresholdLabel } from '../../lib/format';
import { PARAMETER_CATEGORY_LABEL, SAMPLING_POINT_TYPE_LABEL } from '../../lib/labels';
import type { SampleDetail } from '../../lib/types';
import { SampleFormModal } from './SampleFormModal';

function parseValue(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

function GatedButton({ gate, children }: { gate: ReturnType<typeof useGate>; children: ReactNode }) {
  if (!gate.visible) return null;
  return gate.debugOnly ? (
    <span className="debug-hidden inline-flex" title={gate.reason}>
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me, can } = useSession();
  const sampleQuery = useQuery({ queryKey: ['sample', id], queryFn: () => api<SampleDetail>(`/samples/${id}`) });
  const sample = sampleQuery.data;

  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!sample) return;
    setValues(Object.fromEntries(sample.results.map((result) => [result.parameter.id, result.value === null ? '' : String(result.value)])));
  }, [sample]);

  const isOwner = sample?.collectedBy.id === me?.id;
  const enteredByMe = sample?.results.some((result) => result.enteredBy?.id === me?.id) || sample?.analyzedBy?.id === me?.id;
  const status = sample?.status;

  const editGate = useGate({
    any: ['sample:update:own', 'sample:update:any'],
    when: can('sample:update:any') || isOwner,
    whenReason: "vous n'êtes pas le préleveur (sample:update:any requis)",
  });
  const deleteGate = useGate({ all: ['sample:delete'] });
  const enterGate = useGate({ all: ['result:enter'] });
  const validateGate = useGate({
    all: ['result:validate'],
    when: !enteredByMe,
    whenReason: 'principe des 4 yeux : vous avez saisi ou soumis ces résultats',
  });
  const rejectGate = useGate({ all: ['result:validate'] });

  const parsed = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([parameterId, raw]) => [parameterId, parseValue(raw)])),
    [values],
  );
  const invalid = Object.values(parsed).some((value) => Number.isNaN(value));
  const dirty = sample?.results.some((result) => (parsed[result.parameter.id] ?? null) !== result.value) ?? false;

  const onSuccess = (message: string) => (updated: SampleDetail | void) => {
    toast.success(message);
    if (updated) queryClient.setQueryData(['sample', id], updated);
    void queryClient.invalidateQueries({ queryKey: ['samples'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const onError = (error: unknown) => {
    toast.error(errorMessage(error));
    void sampleQuery.refetch();
  };

  const saveResults = () =>
    api<SampleDetail>(`/samples/${id}/results`, {
      method: 'PUT',
      body: { results: Object.entries(parsed).map(([parameterId, value]) => ({ parameterId, value })) },
    });

  const saveMutation = useMutation({ mutationFn: saveResults, onSuccess: onSuccess('Résultats enregistrés'), onError });
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await saveResults();
      return api<SampleDetail>(`/samples/${id}/submit`, { method: 'POST' });
    },
    onSuccess: onSuccess('Analyse soumise pour validation'),
    onError,
  });
  const validateMutation = useMutation({
    mutationFn: () => api<SampleDetail>(`/samples/${id}/validate`, { method: 'POST' }),
    onSuccess: onSuccess('Résultats validés'),
    onError,
  });
  const rejectMutation = useMutation({
    mutationFn: () => api<SampleDetail>(`/samples/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: (updated) => {
      onSuccess('Résultats rejetés : échantillon renvoyé en analyse')(updated);
      setRejecting(false);
      setReason('');
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => api(`/samples/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onSuccess('Échantillon supprimé')();
      navigate('/samples');
    },
    onError,
  });

  if (sampleQuery.isLoading) return <Spinner />;
  if (sampleQuery.error || !sample) return <Alert tone="danger">{errorMessage(sampleQuery.error)}</Alert>;

  const editableResults = status === 'REGISTERED' && enterGate.visible;

  return (
    <>
      <Link to="/samples" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Échantillons
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{sample.reference}</h1>
            <SampleStatusBadge status={sample.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {sample.samplingPoint.name} · {SAMPLING_POINT_TYPE_LABEL[sample.samplingPoint.type]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'REGISTERED' && (
            <GatedButton gate={editGate}>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Modifier
              </Button>
            </GatedButton>
          )}
          {status !== 'VALIDATED' && (
            <GatedButton gate={deleteGate}>
              <Button
                variant="secondary"
                className="text-red-600"
                icon={<Trash2 className="size-4" />}
                loading={deleteMutation.isPending}
                onClick={() => window.confirm(`Supprimer ${sample.reference} ?`) && deleteMutation.mutate()}
              >
                Supprimer
              </Button>
            </GatedButton>
          )}
          {status === 'ANALYZED' && (
            <>
              <GatedButton gate={rejectGate}>
                <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setRejecting(true)}>
                  Rejeter
                </Button>
              </GatedButton>
              <GatedButton gate={validateGate}>
                <Button variant="success" icon={<CheckCircle2 className="size-4" />} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
                  Valider les résultats
                </Button>
              </GatedButton>
            </>
          )}
        </div>
      </div>

      {sample.rejectionReason && sample.status === 'REGISTERED' && (
        <Alert tone="warning" title="Résultats rejetés lors de la validation" className="mb-4">
          {sample.rejectionReason}
        </Alert>
      )}
      {status === 'ANALYZED' && can('result:validate') && enteredByMe && (
        <Alert tone="info" title="Principe des 4 yeux" className="mb-4">
          Vous avez saisi ou soumis ces résultats : une autre personne habilitée doit les valider.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Informations" />
          <dl className="space-y-4 px-5 py-4">
            <InfoRow label="Point de prélèvement">
              {sample.samplingPoint.code} · {sample.samplingPoint.name}
            </InfoRow>
            <InfoRow label="Prélevé le">{formatDateTime(sample.sampledAt)}</InfoRow>
            <InfoRow label="Préleveur">
              {fullName(sample.collectedBy)} {isOwner && <span className="text-xs text-brand-700">(vous)</span>}
            </InfoRow>
            <InfoRow label="Analyse soumise">
              {sample.analyzedBy ? `${fullName(sample.analyzedBy)} — ${formatDateTime(sample.analyzedAt)}` : '—'}
            </InfoRow>
            <InfoRow label="Validation">
              {sample.validatedBy ? `${fullName(sample.validatedBy)} — ${formatDateTime(sample.validatedAt)}` : '—'}
            </InfoRow>
            <InfoRow label="Observations">{sample.notes || '—'}</InfoRow>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Résultats d'analyse"
            description={`${sample.enteredCount} / ${sample.parameterCount} paramètre(s) saisi(s)`}
            actions={
              editableResults && (
                <>
                  <GatedButton gate={enterGate}>
                    <Button
                      variant="secondary"
                      icon={<Save className="size-4" />}
                      disabled={!dirty || invalid}
                      loading={saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                    >
                      Enregistrer
                    </Button>
                  </GatedButton>
                  <GatedButton gate={enterGate}>
                    <Button icon={<Send className="size-4" />} disabled={invalid} loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
                      Soumettre pour validation
                    </Button>
                  </GatedButton>
                </>
              )
            }
          />
          {!sample.resultsVisible ? (
            <div className="p-5">
              <Alert tone="info" title="Résultats masqués">
                <span className="inline-flex items-center gap-1">
                  <EyeOff className="size-3.5" /> Avec vos permissions, les résultats ne sont visibles qu'une fois validés.
                </span>
              </Alert>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.th}>Paramètre</th>
                  <th className={t.th}>Valeur</th>
                  <th className={t.th}>Seuil</th>
                  <th className={t.th}>Conformité</th>
                  <th className={t.th}>Saisi par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sample.results.map((result) => {
                  const draft = parsed[result.parameter.id];
                  return (
                    <tr key={result.id}>
                      <td className={t.td}>
                        <span className="block font-medium text-slate-900">{result.parameter.name}</span>
                        <span className="text-xs text-slate-500">{PARAMETER_CATEGORY_LABEL[result.parameter.category]}</span>
                      </td>
                      <td className={t.td}>
                        {editableResults && sample.resultsVisible ? (
                          <div className="flex items-center gap-2">
                            <Input
                              inputMode="decimal"
                              className={`w-28 ${Number.isNaN(draft) ? 'border-red-400' : ''}`}
                              value={values[result.parameter.id] ?? ''}
                              onChange={(e) => setValues((current) => ({ ...current, [result.parameter.id]: e.target.value }))}
                            />
                            <span className="text-xs text-slate-500">{result.parameter.unit}</span>
                          </div>
                        ) : sample.resultsVisible ? (
                          <span className="font-mono">
                            {formatNumber(result.value)} <span className="text-xs text-slate-500">{result.value !== null && result.parameter.unit}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">{result.entered ? '•••' : '—'}</span>
                        )}
                      </td>
                      <td className={`${t.td} whitespace-nowrap text-xs text-slate-600`}>
                        {thresholdLabel(result.parameter.minValue, result.parameter.maxValue, result.parameter.unit)}
                      </td>
                      <td className={t.td}>
                        <ComplianceBadge compliant={result.compliant} />
                      </td>
                      <td className={`${t.td} text-xs text-slate-500`}>
                        {result.enteredBy ? (
                          <>
                            {fullName(result.enteredBy)}
                            <br />
                            {formatDateTime(result.enteredAt)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SampleFormModal open={editing} onClose={() => setEditing(false)} sample={sample} onSaved={(updated) => queryClient.setQueryData(['sample', id], updated)} />
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Rejeter ${sample.reference}`}
        description="L'échantillon retourne en analyse ; les valeurs saisies sont conservées pour correction."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Annuler
            </Button>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
              Rejeter
            </Button>
          </>
        }
      >
        <Field label="Motif du rejet">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : valeur incohérente, refaire la mesure" />
        </Field>
      </Modal>
    </>
  );
}
