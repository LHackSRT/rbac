import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { fromLocalInput, thresholdLabel, toLocalInput } from '../../lib/format';
import { PARAMETER_CATEGORY_LABEL } from '../../lib/labels';
import { useParameters, useSamplingPoints } from '../../lib/queries';
import type { ParameterCategory, SampleDetail } from '../../lib/types';

export function SampleFormModal({
  open,
  onClose,
  sample,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  sample?: SampleDetail;
  onSaved?: (sample: SampleDetail) => void;
}) {
  const queryClient = useQueryClient();
  const points = useSamplingPoints(false, open);
  const parameters = useParameters(false, open);
  const [samplingPointId, setSamplingPointId] = useState('');
  const [sampledAt, setSampledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [parameterIds, setParameterIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSamplingPointId(sample?.samplingPoint.id ?? '');
    setSampledAt(toLocalInput(sample?.sampledAt ?? new Date()));
    setNotes(sample?.notes ?? '');
    setParameterIds(sample?.results.map((result) => result.parameter.id) ?? []);
  }, [open, sample]);

  const save = useMutation({
    mutationFn: () => {
      const body = { samplingPointId, sampledAt: fromLocalInput(sampledAt), notes, parameterIds };
      return sample
        ? api<SampleDetail>(`/samples/${sample.id}`, { method: 'PATCH', body })
        : api<SampleDetail>('/samples', { method: 'POST', body });
    },
    onSuccess: (saved) => {
      toast.success(sample ? 'Échantillon modifié' : `Échantillon ${saved.reference} enregistré`);
      void queryClient.invalidateQueries({ queryKey: ['samples'] });
      void queryClient.invalidateQueries({ queryKey: ['sample', saved.id] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const byCategory = (category: ParameterCategory) => (parameters.data ?? []).filter((p) => p.category === category);
  const toggle = (id: string) =>
    setParameterIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const selectCategory = (categories: ParameterCategory[]) =>
    setParameterIds((parameters.data ?? []).filter((p) => categories.includes(p.category)).map((p) => p.id));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={sample ? `Modifier ${sample.reference}` : 'Nouvel échantillon'}
      description="Point de prélèvement, date et paramètres à analyser."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="sample-form" loading={save.isPending}>
            {sample ? 'Enregistrer' : "Enregistrer l'échantillon"}
          </Button>
        </>
      }
    >
      <form id="sample-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Point de prélèvement">
            <Select required value={samplingPointId} onChange={(e) => setSamplingPointId(e.target.value)}>
              <option value="">— Choisir —</option>
              {points.data?.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.code} · {point.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date et heure du prélèvement">
            <Input type="datetime-local" required value={sampledAt} onChange={(e) => setSampledAt(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Paramètres à analyser</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => selectCategory(['PHYSICOCHEMICAL'])}>
                Physico-chimique
              </Button>
              <Button size="sm" variant="secondary" onClick={() => selectCategory(['MICROBIOLOGICAL'])}>
                Microbiologique
              </Button>
              <Button size="sm" variant="secondary" onClick={() => selectCategory(['PHYSICOCHEMICAL', 'MICROBIOLOGICAL'])}>
                Complet
              </Button>
            </div>
          </div>
          <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
            {(['PHYSICOCHEMICAL', 'MICROBIOLOGICAL'] as const).map((category) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{PARAMETER_CATEGORY_LABEL[category]}</p>
                {byCategory(category).map((parameter) => (
                  <Checkbox
                    key={parameter.id}
                    checked={parameterIds.includes(parameter.id)}
                    onChange={() => toggle(parameter.id)}
                    label={parameter.name}
                    description={thresholdLabel(parameter.minValue, parameter.maxValue, parameter.unit)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <Field label="Observations">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions de prélèvement, remarques…" />
        </Field>
      </form>
    </Modal>
  );
}
