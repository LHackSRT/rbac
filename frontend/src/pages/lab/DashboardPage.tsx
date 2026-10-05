import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FlaskConical, LayoutDashboard, User } from 'lucide-react';
import { Link } from 'react-router';
import { useSession } from '../../auth/session';
import { SampleStatusBadge } from '../../components/badges';
import { Alert, Card, CardHeader, EmptyState, PageHeader, Spinner, Stat } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatNumber, fullName } from '../../lib/format';
import type { Dashboard } from '../../lib/types';

export function DashboardPage() {
  const { me, canAny, can } = useSession();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const seesUnvalidated = canAny(['result:enter', 'result:validate']);

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard className="size-5" />}
        title={`Bonjour ${me?.firstName ?? ''}`}
        description="Vue d'ensemble de l'activité du laboratoire."
      />
      {dashboard.isLoading && <Spinner />}
      {dashboard.error && <Alert tone="danger">{errorMessage(dashboard.error)}</Alert>}
      {dashboard.data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Enregistrés (à analyser)" value={dashboard.data.counts.REGISTERED} icon={<FlaskConical className="size-4" />} />
            <Stat
              label="Analysés (à valider)"
              value={dashboard.data.counts.ANALYZED}
              tone="amber"
              icon={<ClipboardCheck className="size-4" />}
              hint={can('result:validate') ? <Link className="text-brand-700 hover:underline" to="/validation">Voir la file de validation →</Link> : undefined}
            />
            <Stat label="Validés" value={dashboard.data.counts.VALIDATED} tone="green" icon={<CheckCircle2 className="size-4" />} />
            <Stat label="Mes prélèvements" value={dashboard.data.mySamples} tone="slate" icon={<User className="size-4" />} />
          </div>

          <Card>
            <CardHeader
              title="Alertes de non-conformité"
              description={
                seesUnvalidated
                  ? 'Échantillons récents dont au moins un résultat dépasse un seuil (tous statuts).'
                  : 'Vous ne voyez que les résultats validés (permission result:read).'
              }
            />
            {dashboard.data.nonCompliantAlerts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="size-10" />} title="Aucune non-conformité visible" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.data.nonCompliantAlerts.map((alert) => (
                  <li key={alert.id}>
                    <Link to={`/samples/${alert.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="flex min-w-0 items-start gap-3">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {alert.reference} · {alert.samplingPoint.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Prélevé le {formatDateTime(alert.sampledAt)} par {fullName(alert.collectedBy)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {alert.nonCompliantParameters.map((parameter) => (
                          <span key={parameter.code} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-red-200">
                            {parameter.name} : {formatNumber(parameter.value)} {parameter.unit}
                          </span>
                        ))}
                        <SampleStatusBadge status={alert.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
