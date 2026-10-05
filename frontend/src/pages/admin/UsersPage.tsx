import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Can, useGate } from '../../auth/Can';
import { useDebug } from '../../auth/debug';
import { useSession } from '../../auth/session';
import { RoleBadge, UserStatusBadge } from '../../components/badges';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, tableClasses as t } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, fullName } from '../../lib/format';
import { USER_STATUS_LABEL } from '../../lib/labels';
import { useRoles } from '../../lib/queries';
import { missingPermissionsFor, orderByHierarchy } from '../../lib/rbac';
import type { Page, Profile, UserListItem, UserStatus } from '../../lib/types';

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { debug } = useDebug();
  const assignGate = useGate({ all: ['user:assign-role', 'role:read'] });
  const roles = useRoles(open && can('role:read'));
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', password: '' });
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api<Profile>('/users', { method: 'POST', body: { ...form, roleIds } }),
    onSuccess: (user) => {
      toast.success(`Utilisateur ${user.email} créé`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
      navigate(`/admin/users/${user.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvel utilisateur"
      description="Le mot de passe doit contenir 8 caractères, une minuscule, une majuscule et un chiffre."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="user-form" loading={create.isPending}>
            Créer
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom">
            <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Nom">
            <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="E-mail">
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mot de passe initial">
          <Input type="text" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {assignGate.visible && roles.data && (
          <div className={assignGate.debugOnly ? 'debug-hidden p-2' : undefined} title={assignGate.debugOnly ? assignGate.reason : undefined}>
            <p className="mb-2 text-sm font-medium text-slate-700">Rôles initiaux</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {orderByHierarchy(roles.data).map((role) => {
                const missing = missingPermissionsFor(role, can);
                return (
                  <Checkbox
                    key={role.id}
                    disabled={missing.length > 0 && !debug}
                    checked={roleIds.includes(role.id)}
                    onChange={(e) => setRoleIds(e.target.checked ? [...roleIds, role.id] : roleIds.filter((id) => id !== role.id))}
                    label={
                      <>
                        {role.name} <span className="font-mono text-xs text-slate-400">{role.code}</span>
                      </>
                    }
                    description={missing.length > 0 ? `Anti-escalade : il vous manque ${missing.length} permission(s)` : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const roles = useRoles(can('role:read'));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const query = { search, status, roleId, page, pageSize: 20 };
  const users = useQuery({
    queryKey: ['users', query],
    queryFn: () => api<Page<UserListItem>>('/users', { query }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        icon={<Users className="size-5" />}
        title="Utilisateurs"
        description="Comptes, rôles attribués et privilèges individuels."
        actions={
          <Can all={['user:create']}>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvel utilisateur
            </Button>
          </Can>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Input placeholder="Rechercher (nom, e-mail)…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <Select value={status} onChange={(e) => { setStatus(e.target.value as UserStatus | ''); setPage(1); }}>
            <option value="">Tous les statuts</option>
            {Object.entries(USER_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }} disabled={!roles.data}>
            <option value="">Tous les rôles</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.code} · {role.name}
              </option>
            ))}
          </Select>
        </div>
        {users.isLoading && <Spinner />}
        {users.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(users.error)}</Alert>
          </div>
        )}
        {users.data &&
          (users.data.items.length === 0 ? (
            <EmptyState icon={<Users className="size-10" />} title="Aucun utilisateur" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={t.th}>Utilisateur</th>
                      <th className={t.th}>Rôles</th>
                      <th className={t.th}>Privilèges</th>
                      <th className={t.th}>Statut</th>
                      <th className={t.th}>Dernière connexion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.data.items.map((user) => (
                      <tr key={user.id} className={`${t.row} cursor-pointer`} onClick={() => navigate(`/admin/users/${user.id}`)}>
                        <td className={t.td}>
                          <span className="block font-medium text-slate-900">{fullName(user)}</span>
                          <span className="text-xs text-slate-500">{user.email}</span>
                        </td>
                        <td className={t.td}>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length === 0 && <span className="text-xs text-slate-400">Aucun</span>}
                            {user.roles.map((role) => (
                              <RoleBadge key={role.id} code={role.code} name={role.name} inactive={!role.active} />
                            ))}
                          </div>
                        </td>
                        <td className={t.td}>{user.privilegeCount > 0 ? <Badge tone="amber">{user.privilegeCount}</Badge> : <span className="text-slate-400">—</span>}</td>
                        <td className={t.td}>
                          <UserStatusBadge status={user.status} />
                        </td>
                        <td className={t.td}>{formatDateTime(user.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={20} total={users.data.total} onPage={setPage} />
            </>
          ))}
      </Card>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
