import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Can } from '../../auth/Can';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { SAMPLING_POINT_TYPE_LABEL } from '../../lib/labels';
import { useSamplingPoints } from '../../lib/queries';
import type { SamplingPoint, SamplingPointType } from '../../lib/types';

const emptyForm = { code: '', name: '', type: 'GROUNDWATER' as SamplingPointType, location: '', active: true };

function SamplingPointModal({ open, onClose, point }: { open: boolean; onClose: () => void; point: SamplingPoint | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    if (open) setForm(point ? { code: point.code, name: point.name, type: point.type, location: point.location ?? '', active: point.active } : emptyForm);
  }, [open, point]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, type: form.type, location: form.location, active: form.active };
      return point
        ? api(`/sampling-points/${point.id}`, { method: 'PATCH', body })
        : api('/sampling-points', { method: 'POST', body: { ...body, code: form.code } });
    },
    onSuccess: () => {
      toast.success(point ? 'Point modifié' : 'Point créé');
      void queryClient.invalidateQueries({ queryKey: ['sampling-points'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={point ? `Modifier ${point.code}` : 'Nouveau point de prélèvement'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="point-form" loading={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="point-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Ex. FOR-02">
          <Input required disabled={!!point} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SamplingPointType })}>
            {Object.entries(SAMPLING_POINT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nom" className="sm:col-span-2">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Localisation" className="sm:col-span-2">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Checkbox className="sm:col-span-2" label="Actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </form>
    </Modal>
  );
}

export function SamplingPointsPage() {
  const queryClient = useQueryClient();
  const points = useSamplingPoints(true);
  const [editing, setEditing] = useState<SamplingPoint | null>(null);
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (point: SamplingPoint) => api(`/sampling-points/${point.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Point supprimé');
      void queryClient.invalidateQueries({ queryKey: ['sampling-points'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        icon={<MapPin className="size-5" />}
        title="Points de prélèvement"
        description="Lieux où l'eau est prélevée pour analyse."
        actions={
          <Can all={['sampling-point:manage']}>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Nouveau point
            </Button>
          </Can>
        }
      />
      <Card>
        {points.isLoading && <Spinner />}
        {points.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(points.error)}</Alert>
          </div>
        )}
        {points.data && (
          <div className="overflow-x-auto">
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.th}>Code</th>
                  <th className={t.th}>Nom</th>
                  <th className={t.th}>Type</th>
                  <th className={t.th}>Localisation</th>
                  <th className={t.th}>Échantillons</th>
                  <th className={t.th}>Statut</th>
                  <th className={t.th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {points.data.map((point) => (
                  <tr key={point.id} className={t.row}>
                    <td className={`${t.td} font-mono text-xs`}>{point.code}</td>
                    <td className={`${t.td} font-medium text-slate-900`}>{point.name}</td>
                    <td className={t.td}>{SAMPLING_POINT_TYPE_LABEL[point.type]}</td>
                    <td className={t.td}>{point.location ?? '—'}</td>
                    <td className={t.td}>{point.sampleCount}</td>
                    <td className={t.td}>{point.active ? <Badge tone="green">Actif</Badge> : <Badge>Inactif</Badge>}</td>
                    <td className={`${t.td} text-right`}>
                      <Can all={['sampling-point:manage']}>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil className="size-3.5" />}
                            onClick={() => {
                              setEditing(point);
                              setOpen(true);
                            }}
                          >
                            Modifier
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            icon={<Trash2 className="size-3.5" />}
                            onClick={() => window.confirm(`Supprimer ${point.name} ?`) && remove.mutate(point)}
                          />
                        </div>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SamplingPointModal open={open} onClose={() => setOpen(false)} point={editing} />
    </>
  );
}
