import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Pagination, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { AUDIT_ACTION_LABEL } from '../../lib/labels';
import type { AuditLog, Page } from '../../lib/types';

function actionTone(action: string) {
  if (action === 'ACCESS_DENIED' || action.includes('FAILED') || action.includes('LOCKED') || action.includes('REUSED')) return 'red';
  if (action.startsWith('USER_') || action.startsWith('ROLE_')) return 'violet';
  if (action.startsWith('AUTH_')) return 'slate';
  return 'brand';
}

function Details({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const text = JSON.stringify(value, null, 2);
  const preview = JSON.stringify(value);
  return (
    <button onClick={() => setOpen(!open)} className="max-w-md text-left">
      <pre className={clsx('whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600', !open && 'line-clamp-2')}>{open ? text : preview}</pre>
    </button>
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState({ action: '', search: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const actions = useQuery({ queryKey: ['audit-actions'], queryFn: () => api<string[]>('/audit-logs/actions') });
  const query = {
    action: filters.action,
    search: filters.search,
    from: filters.from ? new Date(filters.from).toISOString() : '',
    to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : '',
    page,
    pageSize: 30,
  };
  const logs = useQuery({
    queryKey: ['audit', query],
    queryFn: () => api<Page<AuditLog>>('/audit-logs', { query }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  const update = (patch: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <>
      <PageHeader
        icon={<ScrollText className="size-5" />}
        title="Journal d'audit"
        description="Traçabilité des connexions, des changements de droits, des actions du laboratoire et des accès refusés."
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Action">
            <Select value={filters.action} onChange={(e) => update({ action: e.target.value })}>
              <option value="">Toutes</option>
              {actions.data?.map((action) => (
                <option key={action} value={action}>
                  {AUDIT_ACTION_LABEL[action] ?? action}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Acteur (e-mail)">
            <Input value={filters.search} onChange={(e) => update({ search: e.target.value })} placeholder="ex. admin@" />
          </Field>
          <Field label="Du">
            <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field label="Au">
            <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
          </Field>
        </div>
        {logs.isLoading && <Spinner />}
        {logs.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(logs.error)}</Alert>
          </div>
        )}
        {logs.data &&
          (logs.data.items.length === 0 ? (
            <EmptyState icon={<ScrollText className="size-10" />} title="Aucune entrée" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={t.th}>Date</th>
                      <th className={t.th}>Acteur</th>
                      <th className={t.th}>Action</th>
                      <th className={t.th}>Cible</th>
                      <th className={t.th}>Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.data.items.map((log) => (
                      <tr key={log.id} className={t.row}>
                        <td className={`${t.td} whitespace-nowrap text-xs`}>{formatDateTime(log.createdAt)}</td>
                        <td className={`${t.td} text-xs`}>
                          {log.actorEmail ?? <span className="text-slate-400">anonyme</span>}
                          {log.ip && <span className="block text-slate-400">{log.ip}</span>}
                        </td>
                        <td className={t.td}>
                          <Badge tone={actionTone(log.action)} title={log.action}>
                            {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                          </Badge>
                        </td>
                        <td className={`${t.td} text-xs`}>
                          {log.targetType ? (
                            <>
                              {log.targetType}
                              <span className="block font-mono text-[10px] text-slate-400">{log.targetId?.slice(0, 8)}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={t.td}>
                          <Details value={log.details} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={30} total={logs.data.total} onPage={setPage} />
            </>
          ))}
      </Card>
    </>
  );
}
