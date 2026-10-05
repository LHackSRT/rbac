import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Grid3x3 } from 'lucide-react';
import { Fragment } from 'react';
import { toast } from 'sonner';
import { useGate } from '../../auth/Can';
import { useDebug } from '../../auth/debug';
import { useSession } from '../../auth/session';
import { Alert, Card, Code, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { RESOURCE_LABEL } from '../../lib/labels';
import { usePermissions, useRoles } from '../../lib/queries';
import { orderByHierarchy } from '../../lib/rbac';
import type { Permission, Role } from '../../lib/types';

export function MatrixPage() {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { debug } = useDebug();
  const manageGate = useGate({ all: ['role:manage'] });
  const roles = useRoles();
  const permissions = usePermissions();

  const toggle = useMutation({
    mutationFn: ({ role, permission }: { role: Role; permission: string }) => {
      const next = role.permissions.includes(permission)
        ? role.permissions.filter((code) => code !== permission)
        : [...role.permissions, permission];
      return api(`/roles/${role.id}/permissions`, { method: 'PUT', body: { permissions: next } });
    },
    onSuccess: () => toast.success('Matrice mise à jour'),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (roles.isLoading || permissions.isLoading) return <Spinner />;
  if (roles.error || permissions.error) return <Alert tone="danger">{errorMessage(roles.error ?? permissions.error)}</Alert>;

  const grouped = new Map<string, Permission[]>();
  for (const permission of permissions.data!) {
    grouped.set(permission.resource, [...(grouped.get(permission.resource) ?? []), permission]);
  }
  const columns = orderByHierarchy(roles.data!);

  return (
    <>
      <PageHeader
        icon={<Grid3x3 className="size-5" />}
        title="Matrice des droits"
        description="Rôles × permissions. Cliquez sur une case pour ajouter ou retirer une permission propre au rôle."
      />
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-4 rounded bg-brand-700" /> Permission propre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-4 rounded border-2 border-brand-400 bg-brand-50" /> Héritée d'un rôle parent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-4 rounded bg-violet-200" /> Via <Code>*</Code>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-4 rounded border border-slate-200 bg-white" /> Non accordée
        </span>
      </div>
      {!manageGate.visible && (
        <Alert tone="info" className="mb-4">
          Lecture seule : la modification nécessite <Code>role:manage</Code>.
        </Alert>
      )}
      <Card className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 min-w-64 border-b border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Permission
              </th>
              {columns.map((role) => (
                <th key={role.id} className="border-b border-l border-slate-100 px-2 py-3 text-center" title={role.name}>
                  <span className="block font-mono text-[11px] font-semibold text-slate-700">{role.code}</span>
                  <span className="block text-[10px] font-normal text-slate-400">{role.parents.map((parent) => `← ${parent.code}`).join(' ') || ' '}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([resource, items]) => (
              <Fragment key={resource}>
                <tr>
                  <td colSpan={columns.length + 1} className="sticky left-0 bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {RESOURCE_LABEL[resource] ?? resource}
                  </td>
                </tr>
                {items.map((permission) => (
                  <tr key={permission.code} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 border-b border-slate-100 bg-white px-4 py-2" title={permission.description}>
                      <Code>{permission.code}</Code>
                      <span className="mt-0.5 block text-xs text-slate-500">{permission.description}</span>
                    </td>
                    {columns.map((role) => {
                      const effective = role.effectivePermissions.find((entry) => entry.permission === permission.code);
                      const ownGrant = role.permissions.includes(permission.code);
                      const viaWildcard = !ownGrant && !!effective && !effective.inherited;
                      const editable =
                        role.code !== 'SUPER_ADMIN' && permission.code !== '*' && manageGate.visible && (can(permission.code) || debug);
                      const title = ownGrant
                        ? `Propre à ${role.code}`
                        : effective
                          ? effective.inherited
                            ? `Héritée de ${effective.fromRoleCode}`
                            : 'Via *'
                          : 'Non accordée';
                      return (
                        <td key={role.id} className="border-b border-l border-slate-100 p-1 text-center">
                          <button
                            disabled={!editable || toggle.isPending}
                            title={editable ? `${title} — cliquer pour ${ownGrant ? 'retirer' : 'ajouter'}` : title}
                            onClick={() => toggle.mutate({ role, permission: permission.code })}
                            className={clsx(
                              'mx-auto block size-6 rounded transition',
                              ownGrant && 'bg-brand-700',
                              !ownGrant && effective && !viaWildcard && 'border-2 border-brand-400 bg-brand-50',
                              viaWildcard && 'bg-violet-200',
                              !effective && !ownGrant && 'border border-slate-200 bg-white',
                              editable ? 'cursor-pointer hover:ring-2 hover:ring-brand-300' : 'cursor-default',
                              editable && manageGate.debugOnly && 'outline-dashed outline-1 outline-red-400',
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
