import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FlaskConical, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Can } from '../../auth/Can';
import { SampleStatusBadge } from '../../components/badges';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Pagination, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, fullName } from '../../lib/format';
import { SAMPLE_STATUS_LABEL } from '../../lib/labels';
import { useSamplingPoints } from '../../lib/queries';
import type { Page, SampleStatus, SampleSummary } from '../../lib/types';
import { SampleFormModal } from './SampleFormModal';

export function SampleTable({ samples, onOpen }: { samples: SampleSummary[]; onOpen: (sample: SampleSummary) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className={t.table}>
        <thead>
          <tr>
            <th className={t.th}>Référence</th>
            <th className={t.th}>Point de prélèvement</th>
            <th className={t.th}>Prélevé le</th>
            <th className={t.th}>Préleveur</th>
            <th className={t.th}>Statut</th>
            <th className={t.th}>Saisie</th>
            <th className={t.th}>Conformité</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {samples.map((sample) => (
            <tr key={sample.id} className={`${t.row} cursor-pointer`} onClick={() => onOpen(sample)}>
              <td className={`${t.td} font-medium text-brand-800`}>{sample.reference}</td>
              <td className={t.td}>
                <span className="block text-slate-900">{sample.samplingPoint.name}</span>
                <span className="text-xs text-slate-500">{sample.samplingPoint.code}</span>
              </td>
              <td className={t.td}>{formatDateTime(sample.sampledAt)}</td>
              <td className={t.td}>{fullName(sample.collectedBy)}</td>
              <td className={t.td}>
                <div className="flex flex-col items-start gap-1">
                  <SampleStatusBadge status={sample.status} />
                  {sample.rejectionReason && <Badge tone="red">Rejeté</Badge>}
                </div>
              </td>
              <td className={t.td}>
                {sample.enteredCount}/{sample.parameterCount}
              </td>
              <td className={t.td}>
                {sample.nonCompliantCount === null ? (
                  <span className="text-xs text-slate-400" title="Résultats non visibles avec vos permissions">
                    Masqué
                  </span>
                ) : sample.enteredCount === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : sample.nonCompliantCount > 0 ? (
                  <Badge tone="red">{sample.nonCompliantCount} non conforme{sample.nonCompliantCount > 1 ? 's' : ''}</Badge>
                ) : (
                  <Badge tone="green">Conforme</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SamplesPage() {
  const navigate = useNavigate();
  const points = useSamplingPoints(true);
  const [status, setStatus] = useState<SampleStatus | ''>('');
  const [samplingPointId, setSamplingPointId] = useState('');
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const query = { status, samplingPointId, search, mine, page, pageSize: 15 };
  const samples = useQuery({
    queryKey: ['samples', query],
    queryFn: () => api<Page<SampleSummary>>('/samples', { query }),
    placeholderData: keepPreviousData,
  });

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        icon={<FlaskConical className="size-5" />}
        title="Échantillons"
        description="Prélèvements enregistrés et avancement de leurs analyses."
        actions={
          <Can all={['sample:create']}>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvel échantillon
            </Button>
          </Can>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Rechercher (référence, point, notes)…" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value as SampleStatus | '')}>
            <option value="">Tous les statuts</option>
            {Object.entries(SAMPLE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={samplingPointId} onChange={(e) => resetPage(setSamplingPointId)(e.target.value)}>
            <option value="">Tous les points</option>
            {points.data?.map((point) => (
              <option key={point.id} value={point.id}>
                {point.code} · {point.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center">
            <Checkbox label="Mes prélèvements uniquement" checked={mine} onChange={(e) => resetPage(setMine)(e.target.checked)} />
          </div>
        </div>
        {samples.isLoading && <Spinner />}
        {samples.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(samples.error)}</Alert>
          </div>
        )}
        {samples.data &&
          (samples.data.items.length === 0 ? (
            <EmptyState icon={<FlaskConical className="size-10" />} title="Aucun échantillon" />
          ) : (
            <>
              <SampleTable samples={samples.data.items} onOpen={(sample) => navigate(`/samples/${sample.id}`)} />
              <Pagination page={page} pageSize={query.pageSize} total={samples.data.total} onPage={setPage} />
            </>
          ))}
      </Card>
      <SampleFormModal open={creating} onClose={() => setCreating(false)} onSaved={(sample) => navigate(`/samples/${sample.id}`)} />
    </>
  );
}
