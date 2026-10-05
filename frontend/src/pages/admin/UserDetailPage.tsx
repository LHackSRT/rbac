import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, KeyRound, Lock, Plus, Power, Save, ShieldCheck, Trash2, Unlock, UserCog } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Can, useGate } from '../../auth/Can';
import { useDebug } from '../../auth/debug';
import { useSession } from '../../auth/session';
import { EffectBadge, RoleBadge, UserStatusBadge } from '../../components/badges';
import { EffectivePermissions } from '../../components/EffectivePermissions';
import { Alert, Badge, Button, Card, CardHeader, Code, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, fromLocalInput, fullName, toLocalInput } from '../../lib/format';
import { RESOURCE_LABEL } from '../../lib/labels';
import { usePermissions, useRoles } from '../../lib/queries';
import { missingPermissionsFor, orderByHierarchy } from '../../lib/rbac';
import type { Effect, Profile } from '../../lib/types';

type Tab = 'account' | 'roles' | 'privileges' | 'permissions';

function useUserMutation<TVariables = void>(userId: string, fn: (variables: TVariables) => Promise<unknown>, message: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      toast.success(message);
      if (data && typeof data === 'object' && 'id' in data) queryClient.setQueryData(['user', userId], data);
      else void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
}

function AccountTab({ user }: { user: Profile }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email });
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState('');
  useEffect(() => setForm({ firstName: user.firstName, lastName: user.lastName, email: user.email }), [user]);

  const update = useUserMutation(user.id, () => api<Profile>(`/users/${user.id}`, { method: 'PATCH', body: form }), 'Profil mis à jour');
  const setStatus = useUserMutation(
    user.id,
    (status: 'ACTIVE' | 'DISABLED') => api<Profile>(`/users/${user.id}/status`, { method: 'PATCH', body: { status } }),
    'Statut mis à jour',
  );
  const unlock = useUserMutation(user.id, () => api<Profile>(`/users/${user.id}/unlock`, { method: 'POST' }), 'Compte déverrouillé');
  const reset = useUserMutation(
    user.id,
    () => api(`/users/${user.id}/reset-password`, { method: 'POST', body: { newPassword: password } }),
    'Mot de passe réinitialisé : sessions révoquées',
  );
  const remove = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Utilisateur supprimé');
      navigate('/admin/users');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profil" />
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom">
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Nom">
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Can all={['user:update']}>
            <Button type="submit" icon={<Save className="size-4" />} loading={update.isPending}>
              Enregistrer le profil
            </Button>
          </Can>
        </form>
      </Card>
      <Card>
        <CardHeader title="Compte et sécurité" />
        <div className="space-y-4 px-5 py-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-slate-500">Statut</dt>
              <dd className="mt-0.5">
                <UserStatusBadge status={user.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Dernière connexion</dt>
              <dd className="mt-0.5">{formatDateTime(user.lastLoginAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Échecs de connexion</dt>
              <dd className="mt-0.5">{user.failedLoginAttempts}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Verrouillé jusqu'au</dt>
              <dd className="mt-0.5">{formatDateTime(user.lockedUntil)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Can all={['user:update']}>
              {user.status === 'DISABLED' ? (
                <Button variant="success" icon={<Power className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate('ACTIVE')}>
                  Réactiver
                </Button>
              ) : (
                <Button variant="secondary" className="text-red-600" icon={<Power className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate('DISABLED')}>
                  Désactiver
                </Button>
              )}
            </Can>
            {(user.status === 'LOCKED' || user.failedLoginAttempts > 0) && (
              <Can all={['user:update']}>
                <Button variant="secondary" icon={<Unlock className="size-4" />} loading={unlock.isPending} onClick={() => unlock.mutate()}>
                  Déverrouiller
                </Button>
              </Can>
            )}
            <Can all={['user:update']}>
              <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setResetOpen(true)}>
                Réinitialiser le mot de passe
              </Button>
            </Can>
            <Can all={['user:delete']}>
              <Button
                variant="ghost"
                className="text-red-600"
                icon={<Trash2 className="size-4" />}
                loading={remove.isPending}
                onClick={() => window.confirm(`Supprimer définitivement ${user.email} ?`) && remove.mutate()}
              >
                Supprimer
              </Button>
            </Can>
          </div>
          <p className="text-xs text-slate-500">La désactivation et la réinitialisation du mot de passe révoquent immédiatement toutes les sessions.</p>
        </div>
      </Card>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Réinitialiser le mot de passe"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={reset.isPending}
              onClick={() =>
                reset.mutate(undefined, {
                  onSuccess: () => {
                    setResetOpen(false);
                    setPassword('');
                  },
                })
              }
            >
              Réinitialiser
            </Button>
          </>
        }
      >
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, une minuscule, une majuscule et un chiffre.">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function RolesTab({ user }: { user: Profile }) {
  const { can } = useSession();
  const { debug } = useDebug();
  const roles = useRoles(can('role:read'));
  const gate = useGate({ all: ['user:assign-role'] });
  const [selection, setSelection] = useState<Record<string, { checked: boolean; expiresAt: string }>>({});

  useEffect(() => {
    setSelection(
      Object.fromEntries(user.roles.map((role) => [role.roleId, { checked: true, expiresAt: toLocalInput(role.expiresAt) }])),
    );
  }, [user]);

  const save = useUserMutation(
    user.id,
    () =>
      api<Profile>(`/users/${user.id}/roles`, {
        method: 'PUT',
        body: {
          roles: Object.entries(selection)
            .filter(([, value]) => value.checked)
            .map(([roleId, value]) => ({ roleId, expiresAt: fromLocalInput(value.expiresAt) })),
        },
      }),
    'Rôles mis à jour',
  );

  return (
    <Card>
      <CardHeader
        title="Rôles attribués"
        description="Un rôle peut être temporaire. Vous ne pouvez attribuer ou retirer que les rôles dont vous possédez toutes les permissions."
        actions={
          gate.visible && (
            <span className={gate.debugOnly ? 'debug-hidden inline-flex' : undefined} title={gate.debugOnly ? gate.reason : undefined}>
              <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                Enregistrer les rôles
              </Button>
            </span>
          )
        }
      />
      {!roles.data ? (
        <div className="px-5 py-4">
          {roles.isLoading ? (
            <Spinner />
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <RoleBadge key={role.roleId} code={role.code} name={role.name} inactive={!role.active} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {orderByHierarchy(roles.data).map((role) => {
            const current = user.roles.find((assignment) => assignment.roleId === role.id);
            const value = selection[role.id] ?? { checked: false, expiresAt: '' };
            const missing = missingPermissionsFor(role, can);
            const locked = (missing.length > 0 && !debug) || !gate.visible;
            return (
              <div key={role.id} className={clsx('flex flex-wrap items-center gap-4 px-5 py-3', value.checked && 'bg-brand-50/40')}>
                <label className={clsx('flex min-w-0 flex-1 items-start gap-3', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-brand-700"
                    checked={value.checked}
                    disabled={locked}
                    onChange={(e) => setSelection({ ...selection, [role.id]: { ...value, checked: e.target.checked } })}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{role.name}</span>
                      <RoleBadge code={role.code} />
                      {current && !current.active && <Badge tone="amber">Expiré</Badge>}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {role.parents.length > 0 && <>Hérite de {role.parents.map((parent) => parent.code).join(', ')} · </>}
                      {role.effectivePermissions.length} permission(s) effective(s)
                      {current?.assignedBy && <> · attribué par {fullName(current.assignedBy)}</>}
                    </span>
                    {missing.length > 0 && (
                      <span className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                        <Lock className="mt-0.5 size-3 shrink-0" /> Anti-escalade : il vous manque {missing.join(', ')}
                      </span>
                    )}
                  </span>
                </label>
                {value.checked && (
                  <Field label="Expire le (optionnel)" className="w-56">
                    <Input
                      type="datetime-local"
                      disabled={locked}
                      value={value.expiresAt}
                      onChange={(e) => setSelection({ ...selection, [role.id]: { ...value, expiresAt: e.target.value } })}
                    />
                  </Field>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PrivilegesTab({ user }: { user: Profile }) {
  const { can } = useSession();
  const { debug } = useDebug();
  const gate = useGate({ all: ['user:manage-privileges'] });
  const permissions = usePermissions(can('permission:read') || debug);
  const [form, setForm] = useState({ permission: '', effect: 'ALLOW' as Effect, reason: '', expiresAt: '' });

  const grant = useUserMutation(
    user.id,
    () =>
      api<Profile>(`/users/${user.id}/privileges`, {
        method: 'POST',
        body: { ...form, reason: form.reason || undefined, expiresAt: fromLocalInput(form.expiresAt) },
      }),
    'Privilège enregistré',
  );
  const revoke = useUserMutation(
    user.id,
    (privilegeId: string) => api<Profile>(`/users/${user.id}/privileges/${privilegeId}`, { method: 'DELETE' }),
    'Privilège retiré',
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    grant.mutate(undefined, { onSuccess: () => setForm({ permission: '', effect: 'ALLOW', reason: '', expiresAt: '' }) });
  };

  const grouped = new Map<string, NonNullable<typeof permissions.data>>();
  for (const permission of permissions.data ?? []) {
    if (permission.code === '*') continue;
    grouped.set(permission.resource, [...(grouped.get(permission.resource) ?? []), permission]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Privilèges individuels" description="Exceptions aux rôles : ALLOW ajoute une permission, DENY la retire (DENY est toujours prioritaire)." />
        {user.privileges.length === 0 ? (
          <EmptyState title="Aucun privilège individuel" />
        ) : (
          <div className="overflow-x-auto">
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.th}>Effet</th>
                  <th className={t.th}>Permission</th>
                  <th className={t.th}>Motif</th>
                  <th className={t.th}>Expiration</th>
                  <th className={t.th}>Accordé par</th>
                  <th className={t.th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {user.privileges.map((privilege) => (
                  <tr key={privilege.id} className={clsx(t.row, !privilege.active && 'opacity-60')}>
                    <td className={t.td}>
                      <EffectBadge effect={privilege.effect} />
                    </td>
                    <td className={t.td}>
                      <Code>{privilege.permission}</Code>
                      <p className="mt-0.5 text-xs text-slate-500">{privilege.permissionDescription}</p>
                    </td>
                    <td className={t.td}>{privilege.reason ?? '—'}</td>
                    <td className={t.td}>
                      {privilege.expiresAt ? formatDateTime(privilege.expiresAt) : 'Permanent'}
                      {!privilege.active && (
                        <Badge tone="slate" className="ml-1">
                          Expiré
                        </Badge>
                      )}
                    </td>
                    <td className={`${t.td} text-xs`}>{fullName(privilege.grantedBy)}</td>
                    <td className={`${t.td} text-right`}>
                      <Can all={['user:manage-privileges']}>
                        <Button size="sm" variant="ghost" className="text-red-600" loading={revoke.isPending && revoke.variables === privilege.id} onClick={() => revoke.mutate(privilege.id)}>
                          Retirer
                        </Button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {gate.visible && (
        <Card className={gate.debugOnly ? 'debug-hidden' : undefined}>
          <CardHeader title="Accorder ou retirer une permission" description="Anti-escalade : vous ne pouvez gérer que les permissions que vous possédez." />
          <form onSubmit={onSubmit} className="grid gap-4 px-5 py-4 md:grid-cols-2">
            <Field label="Permission">
              <Select required value={form.permission} onChange={(e) => setForm({ ...form, permission: e.target.value })}>
                <option value="">— Choisir —</option>
                {[...grouped.entries()].map(([resource, items]) => (
                  <optgroup key={resource} label={RESOURCE_LABEL[resource] ?? resource}>
                    {items.map((permission) => {
                      const held = can(permission.code);
                      return (
                        <option key={permission.code} value={permission.code} disabled={!held && !debug}>
                          {permission.code} — {permission.description}
                          {held ? '' : ' (vous ne la possédez pas)'}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Effet">
              <div className="flex gap-2">
                {(['ALLOW', 'DENY'] as const).map((effect) => (
                  <button
                    type="button"
                    key={effect}
                    onClick={() => setForm({ ...form, effect })}
                    className={clsx(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                      form.effect === effect
                        ? effect === 'ALLOW'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-red-300 bg-red-50 text-red-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {effect === 'ALLOW' ? 'ALLOW — accorder' : 'DENY — interdire'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Motif">
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex. : intérim pendant les congés" />
            </Field>
            <Field label="Expire le (optionnel)" hint="Vide = permanent">
              <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" icon={<Plus className="size-4" />} loading={grant.isPending}>
                Enregistrer le privilège
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('roles');
  const user = useQuery({ queryKey: ['user', id], queryFn: () => api<Profile>(`/users/${id}`) });

  if (user.isLoading) return <Spinner />;
  if (user.error || !user.data) return <Alert tone="danger">{errorMessage(user.error)}</Alert>;

  const tabs: { id: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { id: 'roles', label: 'Rôles', icon: <ShieldCheck className="size-4" />, count: user.data.roles.length },
    { id: 'privileges', label: 'Privilèges', icon: <KeyRound className="size-4" />, count: user.data.privileges.length },
    { id: 'permissions', label: 'Permissions effectives', icon: <ShieldCheck className="size-4" />, count: user.data.permissions.length },
    { id: 'account', label: 'Compte', icon: <UserCog className="size-4" /> },
  ];

  return (
    <>
      <Link to="/admin/users" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Utilisateurs
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{fullName(user.data)}</h1>
        <UserStatusBadge status={user.data.status} />
        <span className="text-sm text-slate-500">{user.data.email}</span>
      </div>
      {me?.id === user.data.id && (
        <Alert tone="warning" title="Il s'agit de votre propre compte" className="mb-4">
          Vous ne pouvez modifier ni vos rôles, ni vos privilèges, ni votre statut : un autre administrateur doit le faire.
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium',
              tab === item.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{item.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'account' && <AccountTab user={user.data} />}
      {tab === 'roles' && <RolesTab user={user.data} />}
      {tab === 'privileges' && <PrivilegesTab user={user.data} />}
      {tab === 'permissions' && (
        <Card>
          <CardHeader title="Permissions effectives" description="Résultat du calcul : rôles + héritage + privilèges ALLOW − privilèges DENY." />
          <EffectivePermissions decisions={user.data.decisions} />
        </Card>
      )}
    </>
  );
}
