import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Lock, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Can, useGate } from '../../auth/Can';
import { useDebug } from '../../auth/debug';
import { useSession } from '../../auth/session';
import { RoleBadge, UserStatusBadge } from '../../components/badges';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Code, Field, Input, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { fullName } from '../../lib/format';
import { RESOURCE_LABEL } from '../../lib/labels';
import { usePermissions, useRoles } from '../../lib/queries';
import { missingPermissionsFor } from '../../lib/rbac';
import type { Page, UserListItem } from '../../lib/types';

function useRoleMutation(fn: () => Promise<unknown>, message: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function RoleDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { debug } = useDebug();
  const manageGate = useGate({ all: ['role:manage'] });
  const roles = useRoles();
  const permissions = usePermissions(can('permission:read') || debug);
  const users = useQuery({
    queryKey: ['users', { roleId: id }],
    queryFn: () => api<Page<UserListItem>>('/users', { query: { roleId: id, pageSize: 100 } }),
    enabled: can('user:read'),
  });
  const role = roles.data?.find((candidate) => candidate.id === id);

  const [info, setInfo] = useState({ name: '', description: '' });
  const [own, setOwn] = useState<string[]>([]);
  const [parentIds, setParentIds] = useState<string[]>([]);
  useEffect(() => {
    if (!role) return;
    setInfo({ name: role.name, description: role.description ?? '' });
    setOwn(role.permissions);
    setParentIds(role.parents.map((parent) => parent.id));
  }, [role]);

  const saveInfo = useRoleMutation(() => api(`/roles/${id}`, { method: 'PATCH', body: info }), 'Rôle mis à jour');
  const savePermissions = useRoleMutation(() => api(`/roles/${id}/permissions`, { method: 'PUT', body: { permissions: own } }), 'Permissions mises à jour');
  const saveParents = useRoleMutation(() => api(`/roles/${id}/parents`, { method: 'PUT', body: { parentIds } }), 'Héritage mis à jour');
  const remove = useMutation({
    mutationFn: () => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Rôle supprimé');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      navigate('/admin/roles');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (roles.isLoading) return <Spinner />;
  if (roles.error) return <Alert tone="danger">{errorMessage(roles.error)}</Alert>;
  if (!role) return <Alert tone="danger">Rôle introuvable.</Alert>;

  const isSuperAdmin = role.code === 'SUPER_ADMIN';
  const readOnly = !manageGate.visible || (isSuperAdmin && !debug);
  const inherited = new Map(role.effectivePermissions.filter((entry) => entry.inherited).map((entry) => [entry.permission, entry.fromRoleCode]));
  const grouped = new Map<string, { code: string; description: string }[]>();
  for (const permission of permissions.data ?? []) {
    grouped.set(permission.resource, [...(grouped.get(permission.resource) ?? []), permission]);
  }
  const debugClass = manageGate.debugOnly ? 'debug-hidden inline-flex' : undefined;

  return (
    <>
      <Link to="/admin/roles" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Rôles
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{role.name}</h1>
        <RoleBadge code={role.code} />
        {role.isSystem && (
          <Badge tone="slate">
            <Lock className="size-3" /> Rôle système
          </Badge>
        )}
        {!role.isSystem && (
          <Can all={['role:manage']} className="ml-auto">
            <Button variant="secondary" className="text-red-600" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => window.confirm(`Supprimer ${role.code} ?`) && remove.mutate()}>
              Supprimer le rôle
            </Button>
          </Can>
        )}
      </div>
      {isSuperAdmin && (
        <Alert tone="info" className="mb-4" title="Rôle protégé">
          Le rôle super-administrateur détient <Code>*</Code> et ne peut pas être modifié.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Informations" />
            <div className="space-y-4 px-5 py-4">
              <Field label="Nom">
                <Input disabled={readOnly} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <Textarea disabled={readOnly} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} />
              </Field>
              {!readOnly && (
                <span className={debugClass}>
                  <Button size="sm" icon={<Save className="size-3.5" />} loading={saveInfo.isPending} onClick={() => saveInfo.mutate()}>
                    Enregistrer
                  </Button>
                </span>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Hérite de" description="Le rôle reçoit toutes les permissions de ses parents." />
            <div className="space-y-2 px-5 py-4">
              {roles.data!
                .filter((candidate) => candidate.id !== role.id)
                .map((candidate) => {
                  const missing = missingPermissionsFor(candidate, can);
                  return (
                    <Checkbox
                      key={candidate.id}
                      disabled={readOnly || (missing.length > 0 && !debug)}
                      checked={parentIds.includes(candidate.id)}
                      onChange={(e) => setParentIds(e.target.checked ? [...parentIds, candidate.id] : parentIds.filter((value) => value !== candidate.id))}
                      label={candidate.code}
                      description={missing.length > 0 ? 'Anti-escalade : permissions non détenues' : candidate.name}
                    />
                  );
                })}
              {!readOnly && (
                <span className={debugClass}>
                  <Button size="sm" className="mt-2" icon={<Save className="size-3.5" />} loading={saveParents.isPending} onClick={() => saveParents.mutate()}>
                    Enregistrer l'héritage
                  </Button>
                </span>
              )}
            </div>
          </Card>
          {users.data && (
            <Card>
              <CardHeader title={`Utilisateurs (${users.data.total})`} />
              <ul className="divide-y divide-slate-100">
                {users.data.items.map((user) => (
                  <li key={user.id}>
                    <Link to={`/admin/users/${user.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-slate-50">
                      <span>{fullName(user)}</span>
                      <UserStatusBadge status={user.status} />
                    </Link>
                  </li>
                ))}
                {users.data.total === 0 && <li className="px-5 py-3 text-sm text-slate-400">Aucun utilisateur</li>}
              </ul>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Permissions"
            description="Cochez les permissions propres au rôle. Les permissions héritées sont indiquées et se gèrent sur le rôle parent."
            actions={
              !readOnly && (
                <span className={debugClass}>
                  <Button icon={<Save className="size-4" />} loading={savePermissions.isPending} onClick={() => savePermissions.mutate()}>
                    Enregistrer les permissions
                  </Button>
                </span>
              )
            }
          />
          {!permissions.data ? (
            <div className="px-5 py-4 text-sm text-slate-500">
              {permissions.isLoading ? <Spinner /> : role.effectivePermissions.map((entry) => <Code key={entry.permission} className="mr-1">{entry.permission}</Code>)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...grouped.entries()].map(([resource, items]) => (
                <div key={resource} className="px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{RESOURCE_LABEL[resource] ?? resource}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {items.map((permission) => {
                      const from = inherited.get(permission.code);
                      const held = can(permission.code);
                      return (
                        <div key={permission.code} className={clsx('rounded-lg border px-3 py-2', own.includes(permission.code) ? 'border-brand-200 bg-brand-50/50' : 'border-slate-100')}>
                          <Checkbox
                            disabled={readOnly || (!held && !debug)}
                            checked={own.includes(permission.code)}
                            onChange={(e) => setOwn(e.target.checked ? [...own, permission.code] : own.filter((code) => code !== permission.code))}
                            label={<Code>{permission.code}</Code>}
                            description={
                              <>
                                {permission.description}
                                {from && <span className="mt-0.5 block text-brand-700">Hérité de {from}</span>}
                                {!held && <span className="mt-0.5 block text-amber-700">Vous ne la possédez pas (anti-escalade)</span>}
                              </>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
