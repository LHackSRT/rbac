import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, CheckCircle2, Lightbulb, SearchCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { DecisionExplanation } from '../../components/DecisionExplanation';
import { EffectivePermissions } from '../../components/EffectivePermissions';
import { Alert, Button, Card, CardHeader, Code, Field, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { fullName } from '../../lib/format';
import { CHECK_OUTCOME_LABEL, RESOURCE_LABEL } from '../../lib/labels';
import { usePermissions } from '../../lib/queries';
import type { AccessCheck, Page, Permission, Profile, UserListItem } from '../../lib/types';

const SCENARIOS = [
  { email: 'resp.labo@aqualab.test', permission: 'sample:read', label: "Héritage sur 4 niveaux (LAB_MANAGER → … → VIEWER)" },
  { email: 'analyste1@aqualab.test', permission: 'result:validate', label: 'Privilège ALLOW temporaire (intérim)' },
  { email: 'technicien2@aqualab.test', permission: 'sample:create', label: 'Privilège DENY prioritaire sur le rôle' },
  { email: 'admin@aqualab.test', permission: 'result:read', label: "L'administrateur n'a aucun droit labo" },
  { email: 'qualite@aqualab.test', permission: 'sample:create', label: 'Branches sœurs : pas de droit croisé' },
  { email: 'superadmin@aqualab.test', permission: 'audit:read', label: 'Super-admin : permission *' },
];

export function AccessTesterPage() {
  const users = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => api<Page<UserListItem>>('/users', { query: { pageSize: 200 } }),
  });
  const permissions = usePermissions();
  const [userId, setUserId] = useState('');
  const [permission, setPermission] = useState('');

  const check = useMutation({
    mutationFn: (input: { userId: string; permission: string }) => api<AccessCheck>('/authz/check', { method: 'POST', body: input }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const profile = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api<Profile>(`/users/${userId}`),
    enabled: userId !== '',
  });

  const run = (input: { userId: string; permission: string }) => {
    setUserId(input.userId);
    setPermission(input.permission);
    check.mutate(input);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    run({ userId, permission });
  };

  const grouped = new Map<string, Permission[]>();
  for (const item of permissions.data ?? []) grouped.set(item.resource, [...(grouped.get(item.resource) ?? []), item]);
  const result = check.data;

  return (
    <>
      <PageHeader
        icon={<SearchCheck className="size-5" />}
        title="Testeur d'accès"
        description="Vérifiez si un utilisateur détient une permission, et pourquoi."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <form onSubmit={onSubmit} className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <Field label="Utilisateur">
                <Select required value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {users.data?.items.map((user) => (
                    <option key={user.id} value={user.id}>
                      {fullName(user)} ({user.roles.map((role) => role.code).join(', ') || 'aucun rôle'})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Permission">
                <Select required value={permission} onChange={(e) => setPermission(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {[...grouped.entries()].map(([resource, items]) => (
                    <optgroup key={resource} label={RESOURCE_LABEL[resource] ?? resource}>
                      {items.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Button type="submit" loading={check.isPending} icon={<SearchCheck className="size-4" />}>
                Tester
              </Button>
            </form>
          </Card>

          {result && (
            <Card className={clsx('border-2', result.allowed ? 'border-emerald-300' : 'border-red-300')}>
              <div className={clsx('flex items-center gap-3 px-5 py-4', result.allowed ? 'bg-emerald-50' : 'bg-red-50')}>
                {result.allowed ? <CheckCircle2 className="size-8 text-emerald-600" /> : <Ban className="size-8 text-red-600" />}
                <div>
                  <p className={clsx('text-lg font-semibold', result.allowed ? 'text-emerald-800' : 'text-red-800')}>
                    {result.allowed ? 'Accès autorisé' : 'Accès refusé'}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>{fullName(result.user)}</strong> · <Code>{result.permission}</Code> — {CHECK_OUTCOME_LABEL[result.outcome]}
                  </p>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Explication</p>
                <DecisionExplanation decision={result.decision} />
                <Link to={`/admin/users/${result.user.id}`} className="mt-4 inline-block text-sm text-brand-700 hover:underline">
                  Voir la fiche de l'utilisateur →
                </Link>
              </div>
            </Card>
          )}

          {userId && (
            <Card>
              <CardHeader title="Toutes les permissions de l'utilisateur" description="Permissions accordées ou explicitement refusées." />
              {profile.isLoading && <Spinner />}
              {profile.error && (
                <div className="p-4">
                  <Alert tone="danger">{errorMessage(profile.error)}</Alert>
                </div>
              )}
              {profile.data && <EffectivePermissions decisions={profile.data.decisions} />}
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Scénarios suggérés" description="Cliquez pour lancer le test." />
          <ul className="divide-y divide-slate-100">
            {SCENARIOS.map((scenario) => {
              const user = users.data?.items.find((candidate) => candidate.email === scenario.email);
              return (
                <li key={scenario.label}>
                  <button
                    disabled={!user}
                    onClick={() => user && run({ userId: user.id, permission: scenario.permission })}
                    className="flex w-full items-start gap-2.5 px-5 py-3 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <span className="text-sm">
                      <span className="block text-slate-800">{scenario.label}</span>
                      <span className="text-xs text-slate-500">
                        {user ? fullName(user) : scenario.email} · <Code>{scenario.permission}</Code>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
