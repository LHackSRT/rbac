import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Lock, Plus, ShieldCheck, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Can } from '../../auth/Can';
import { useDebug } from '../../auth/debug';
import { useSession } from '../../auth/session';
import { RoleBadge } from '../../components/badges';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useRoles } from '../../lib/queries';
import { missingPermissionsFor, orderByHierarchy } from '../../lib/rbac';
import type { Role } from '../../lib/types';

function RoleNode({ role, byId, depth }: { role: Role; byId: Map<string, Role>; depth: number }) {
  return (
    <li>
      <Link
        to={`/admin/roles/${role.id}`}
        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"
        style={{ marginLeft: depth * 24 }}
      >
        {depth > 0 && <span className="text-slate-300">└</span>}
        <RoleBadge code={role.code} />
        <span className="truncate text-sm font-medium text-slate-800">{role.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap text-xs text-slate-500">
          <span title="Permissions propres / effectives">
            {role.permissions.length} / {role.effectivePermissions.length} perm.
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {role.userCount}
          </span>
          <ChevronRight className="size-4" />
        </span>
      </Link>
      {role.children.length > 0 && (
        <ul>
          {[...role.children].sort((a, b) => a.code.localeCompare(b.code)).map((child) => {
            const node = byId.get(child.id);
            return node ? <RoleNode key={child.id} role={node} byId={byId} depth={depth + 1} /> : null;
          })}
        </ul>
      )}
    </li>
  );
}

function CreateRoleModal({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: Role[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { debug } = useDebug();
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [parentIds, setParentIds] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api<Role>('/roles', { method: 'POST', body: { ...form, parentIds } }),
    onSuccess: (role) => {
      toast.success(`Rôle ${role.code} créé`);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
      navigate(`/admin/roles/${role.id}`);
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
      title="Nouveau rôle"
      description="Les permissions propres se définissent ensuite sur la fiche du rôle."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="role-form" loading={create.isPending}>
            Créer
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="MAJUSCULES_ET_UNDERSCORES">
            <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
          </Field>
          <Field label="Nom">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Hérite de</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => {
              const missing = missingPermissionsFor(role, can);
              return (
                <Checkbox
                  key={role.id}
                  disabled={missing.length > 0 && !debug}
                  checked={parentIds.includes(role.id)}
                  onChange={(e) => setParentIds(e.target.checked ? [...parentIds, role.id] : parentIds.filter((id) => id !== role.id))}
                  label={role.code}
                  description={missing.length > 0 ? 'Anti-escalade : permissions non détenues' : role.name}
                />
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function RolesPage() {
  const roles = useRoles();
  const [creating, setCreating] = useState(false);
  const byId = new Map((roles.data ?? []).map((role) => [role.id, role]));
  const ordered = orderByHierarchy(roles.data ?? []);
  const roots = ordered.filter((role) => role.parents.length === 0);

  return (
    <>
      <PageHeader
        icon={<ShieldCheck className="size-5" />}
        title="Rôles et héritage"
        description="Un rôle enfant hérite de toutes les permissions de ses rôles parents."
        actions={
          <Can all={['role:manage']}>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau rôle
            </Button>
          </Can>
        }
      />
      {roles.isLoading && <Spinner />}
      {roles.error && <Alert tone="danger">{errorMessage(roles.error)}</Alert>}
      {roles.data && (
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-2">
            <CardHeader title="Hiérarchie" description="Les parents sont en haut, les enfants en dessous." />
            <ul className="p-2">
              {roots.map((role) => (
                <RoleNode key={role.id} role={role} byId={byId} depth={0} />
              ))}
            </ul>
          </Card>
          <div className="space-y-3 xl:col-span-3">
            {ordered.map((role) => (
              <Link key={role.id} to={`/admin/roles/${role.id}`} className="block">
                <Card className="p-4 transition hover:border-brand-300 hover:shadow">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{role.name}</span>
                    <RoleBadge code={role.code} />
                    {role.isSystem && (
                      <Badge tone="slate">
                        <Lock className="size-3" /> Système
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-500">
                      {role.userCount} utilisateur{role.userCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  {role.description && <p className="mt-1 text-sm text-slate-600">{role.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Hérite de : {role.parents.length ? role.parents.map((parent) => parent.code).join(', ') : '—'}</span>
                    <span>
                      {role.permissions.length} permission(s) propre(s), {role.effectivePermissions.length} effective(s)
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
      {roles.data && <CreateRoleModal open={creating} onClose={() => setCreating(false)} roles={roles.data} />}
    </>
  );
}
