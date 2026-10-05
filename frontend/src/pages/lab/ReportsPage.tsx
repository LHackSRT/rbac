import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileBarChart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Can } from '../../auth/Can';
import { ComplianceBadge } from '../../components/badges';
import { Alert, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Pagination, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatNumber, thresholdLabel } from '../../lib/format';
import { useParameters, useSamplingPoints } from '../../lib/queries';
import type { Page, ReportRow } from '../../lib/types';

export function ReportsPage() {
  const points = useSamplingPoints(true);
  const parameters = useParameters(true);
  const [filters, setFilters] = useState({ samplingPointId: '', parameterId: '', from: '', to: '', nonCompliantOnly: false });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const query = {
    ...filters,
    from: filters.from ? new Date(filters.from).toISOString() : '',
    to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : '',
  };
  const rows = useQuery({
    queryKey: ['reports', query, page],
    queryFn: () => api<Page<ReportRow>>('/reports/results', { query: { ...query, page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

  const update = (patch: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await api<Response>('/reports/results/export', { query, raw: true });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'resultats-analyses.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export CSV téléchargé');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={<FileBarChart className="size-5" />}
        title="Rapports"
        description="Résultats validés, un paramètre par ligne."
        actions={
          <Can all={['report:export']}>
            <Button variant="secondary" icon={<Download className="size-4" />} loading={exporting} onClick={exportCsv}>
              Exporter en CSV
            </Button>
          </Can>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Point">
            <Select value={filters.samplingPointId} onChange={(e) => update({ samplingPointId: e.target.value })}>
              <option value="">Tous</option>
              {points.data?.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.code} · {point.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paramètre">
            <Select value={filters.parameterId} onChange={(e) => update({ parameterId: e.target.value })}>
              <option value="">Tous</option>
              {parameters.data?.map((parameter) => (
                <option key={parameter.id} value={parameter.id}>
                  {parameter.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Du">
            <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field label="Au">
            <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Non-conformités uniquement" checked={filters.nonCompliantOnly} onChange={(e) => update({ nonCompliantOnly: e.target.checked })} />
          </div>
        </div>
        {rows.isLoading && <Spinner />}
        {rows.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(rows.error)}</Alert>
          </div>
        )}
        {rows.data &&
          (rows.data.items.length === 0 ? (
            <EmptyState icon={<FileBarChart className="size-10" />} title="Aucun résultat validé pour ces critères" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={t.th}>Échantillon</th>
                      <th className={t.th}>Point</th>
                      <th className={t.th}>Prélevé le</th>
                      <th className={t.th}>Paramètre</th>
                      <th className={t.th}>Valeur</th>
                      <th className={t.th}>Seuil</th>
                      <th className={t.th}>Conformité</th>
                      <th className={t.th}>Validé par</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.data.items.map((row, index) => (
                      <tr key={`${row.sampleId}-${row.parameter.code}-${index}`} className={t.row}>
                        <td className={t.td}>
                          <Link to={`/samples/${row.sampleId}`} className="font-medium text-brand-800 hover:underline">
                            {row.reference}
                          </Link>
                        </td>
                        <td className={t.td}>{row.samplingPoint.code}</td>
                        <td className={t.td}>{formatDateTime(row.sampledAt)}</td>
                        <td className={t.td}>{row.parameter.name}</td>
                        <td className={`${t.td} font-mono`}>
                          {formatNumber(row.value)} <span className="text-xs text-slate-500">{row.parameter.unit}</span>
                        </td>
                        <td className={`${t.td} text-xs text-slate-600`}>{thresholdLabel(row.parameter.minValue, row.parameter.maxValue)}</td>
                        <td className={t.td}>
                          <ComplianceBadge compliant={row.compliant} />
                        </td>
                        <td className={`${t.td} text-xs`}>{row.validatedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={25} total={rows.data.total} onPage={setPage} />
            </>
          ))}
      </Card>
    </>
  );
}
