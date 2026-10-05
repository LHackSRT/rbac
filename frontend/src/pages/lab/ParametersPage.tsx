import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Can } from '../../auth/Can';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { thresholdLabel } from '../../lib/format';
import { PARAMETER_CATEGORY_LABEL } from '../../lib/labels';
import { useParameters } from '../../lib/queries';
import type { Parameter, ParameterCategory } from '../../lib/types';

const emptyForm = { code: '', name: '', unit: '', category: 'PHYSICOCHEMICAL' as ParameterCategory, minValue: '', maxValue: '', active: true };

function toNumber(value: string) {
  return value.trim() === '' ? null : Number(value.replace(',', '.'));
}

function ParameterModal({ open, onClose, parameter }: { open: boolean; onClose: () => void; parameter: Parameter | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    if (!open) return;
    setForm(
      parameter
        ? {
            code: parameter.code,
            name: parameter.name,
            unit: parameter.unit,
            category: parameter.category,
            minValue: parameter.minValue?.toString() ?? '',
            maxValue: parameter.maxValue?.toString() ?? '',
            active: parameter.active,
          }
        : emptyForm,
    );
  }, [open, parameter]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        unit: form.unit,
        category: form.category,
        minValue: toNumber(form.minValue),
        maxValue: toNumber(form.maxValue),
        active: form.active,
      };
      return parameter
        ? api(`/parameters/${parameter.id}`, { method: 'PATCH', body })
        : api('/parameters', { method: 'POST', body: { ...body, code: form.code } });
    },
    onSuccess: () => {
      toast.success(parameter ? 'Paramètre modifié' : 'Paramètre créé');
      void queryClient.invalidateQueries({ queryKey: ['parameters'] });
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
      title={parameter ? `Modifier ${parameter.name}` : 'Nouveau paramètre'}
      description="Les seuils déterminent la conformité des résultats (bornes incluses)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="parameter-form" loading={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="parameter-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Majuscules, ex. NO3">
          <Input required disabled={!!parameter} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Nom">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Unité">
          <Input required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </Field>
        <Field label="Catégorie">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ParameterCategory })}>
            {Object.entries(PARAMETER_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seuil minimum" hint="Vide = pas de minimum">
          <Input inputMode="decimal" value={form.minValue} onChange={(e) => setForm({ ...form, minValue: e.target.value })} />
        </Field>
        <Field label="Seuil maximum" hint="Vide = pas de maximum">
          <Input inputMode="decimal" value={form.maxValue} onChange={(e) => setForm({ ...form, maxValue: e.target.value })} />
        </Field>
        <Checkbox className="sm:col-span-2" label="Actif (proposé lors de l'enregistrement des échantillons)" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </form>
    </Modal>
  );
}

export function ParametersPage() {
  const queryClient = useQueryClient();
  const parameters = useParameters(true);
  const [editing, setEditing] = useState<Parameter | null>(null);
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (parameter: Parameter) => api(`/parameters/${parameter.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Paramètre supprimé');
      void queryClient.invalidateQueries({ queryKey: ['parameters'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        icon={<Gauge className="size-5" />}
        title="Paramètres et seuils"
        description="Grandeurs mesurées et limites de conformité (gérées par le responsable qualité)."
        actions={
          <Can all={['parameter:manage']}>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Nouveau paramètre
            </Button>
          </Can>
        }
      />
      <Card>
        {parameters.isLoading && <Spinner />}
        {parameters.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(parameters.error)}</Alert>
          </div>
        )}
        {parameters.data && (
          <div className="overflow-x-auto">
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.th}>Code</th>
                  <th className={t.th}>Nom</th>
                  <th className={t.th}>Catégorie</th>
                  <th className={t.th}>Seuil de conformité</th>
                  <th className={t.th}>Statut</th>
                  <th className={t.th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parameters.data.map((parameter) => (
                  <tr key={parameter.id} className={t.row}>
                    <td className={`${t.td} font-mono text-xs`}>{parameter.code}</td>
                    <td className={`${t.td} font-medium text-slate-900`}>{parameter.name}</td>
                    <td className={t.td}>
                      <Badge tone={parameter.category === 'MICROBIOLOGICAL' ? 'violet' : 'blue'}>{PARAMETER_CATEGORY_LABEL[parameter.category]}</Badge>
                    </td>
                    <td className={t.td}>{thresholdLabel(parameter.minValue, parameter.maxValue, parameter.unit)}</td>
                    <td className={t.td}>{parameter.active ? <Badge tone="green">Actif</Badge> : <Badge>Inactif</Badge>}</td>
                    <td className={`${t.td} text-right`}>
                      <Can all={['parameter:manage']}>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil className="size-3.5" />}
                            onClick={() => {
                              setEditing(parameter);
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
                            onClick={() => window.confirm(`Supprimer ${parameter.name} ?`) && remove.mutate(parameter)}
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
      <ParameterModal open={open} onClose={() => setOpen(false)} parameter={editing} />
    </>
  );
}
