import { useMutation } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { useMe } from '../auth/session';
import { EffectBadge, RoleBadge, UserStatusBadge } from '../components/badges';
import { EffectivePermissions } from '../components/EffectivePermissions';
import { Button, Card, CardHeader, Code, EmptyState, Field, Input, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, fullName } from '../lib/format';

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const change = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: form }),
    onSuccess: () => {
      toast.success('Mot de passe modifié');
      setForm({ currentPassword: '', newPassword: '' });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };
  return (
    <Card>
      <CardHeader title="Changer mon mot de passe" />
      <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
        <Field label="Mot de passe actuel">
          <Input type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, une minuscule, une majuscule et un chiffre.">
          <Input type="password" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Button type="submit" icon={<Save className="size-4" />} loading={change.isPending}>
          Modifier
        </Button>
      </form>
    </Card>
  );
}

export function MyAccessPage() {
  const me = useMe();
  return (
    <>
      <PageHeader icon={<KeyRound className="size-5" />} title="Mes droits" description="Vos rôles, vos privilèges et le détail de vos permissions effectives." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title={fullName(me)} description={me.email} actions={<UserStatusBadge status={me.status} />} />
            <div className="space-y-4 px-5 py-4 text-sm">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Rôles</p>
                {me.roles.length === 0 && <p className="text-slate-400">Aucun rôle</p>}
                <ul className="space-y-1.5">
                  {me.roles.map((role) => (
                    <li key={role.roleId} className="flex flex-wrap items-center gap-2">
                      <RoleBadge code={role.code} inactive={!role.active} />
                      <span>{role.name}</span>
                      {role.expiresAt && <span className="text-xs text-slate-500">jusqu'au {formatDateTime(role.expiresAt)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Privilèges individuels</p>
                {me.privileges.length === 0 && <p className="text-slate-400">Aucun</p>}
                <ul className="space-y-2">
                  {me.privileges.map((privilege) => (
                    <li key={privilege.id} className={privilege.active ? undefined : 'opacity-60'}>
                      <div className="flex flex-wrap items-center gap-2">
                        <EffectBadge effect={privilege.effect} />
                        <Code>{privilege.permission}</Code>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {privilege.reason ?? 'Sans motif'}
                        {privilege.expiresAt && ` · ${privilege.active ? 'expire le' : 'expiré le'} ${formatDateTime(privilege.expiresAt)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <ChangePassword />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title={`Permissions effectives (${me.permissions.length})`} description="Pour chaque permission : d'où elle vient (rôle, héritage, privilège) ou pourquoi elle est refusée." />
          {me.decisions.length === 0 ? <EmptyState title="Aucune permission" /> : <EffectivePermissions decisions={me.decisions} />}
        </Card>
      </div>
    </>
  );
}
