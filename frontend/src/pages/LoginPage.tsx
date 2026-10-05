import { useQuery } from '@tanstack/react-query';
import { Droplets, FlaskConical, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { RoleBadge } from '../components/badges';
import { Alert, Button, Code, Field, Input } from '../components/ui';
import { api } from '../lib/api';
import { errorCode, errorMessage } from '../lib/errors';
import { fullName } from '../lib/format';
import type { DemoAccounts } from '../lib/types';

export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api<DemoAccounts>('/auth/demo-accounts') });

  const signIn = async (emailValue: string, passwordValue: string) => {
    setPending(emailValue);
    setError(null);
    try {
      await login(emailValue, passwordValue);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (caught) {
      setError(caught);
      void demo.refetch();
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn(email, password);
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-8 py-10 text-white lg:w-[42%] lg:px-12">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2">
            <Droplets className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">AquaLab</p>
            <p className="text-sm text-brand-100/80">Laboratoire d'analyses biochimiques de l'eau</p>
          </div>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Démonstrateur de gestion des utilisateurs et des droits (RBAC)</h1>
          <p className="mt-4 text-brand-100/90">
            Connectez-vous avec différents profils pour tester les rôles hiérarchiques, les privilèges individuels, la séparation des
            tâches et la protection contre l'escalade de privilèges.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-brand-50/90">
            <li className="flex gap-2">
              <ShieldCheck className="size-4 shrink-0 text-brand-200" /> Rôles avec héritage et permissions <Code className="bg-white/10 text-white">ressource:action</Code>
            </li>
            <li className="flex gap-2">
              <KeyRound className="size-4 shrink-0 text-brand-200" /> Privilèges ALLOW / DENY temporaires par utilisateur
            </li>
            <li className="flex gap-2">
              <FlaskConical className="size-4 shrink-0 text-brand-200" /> Circuit d'analyse avec validation « 4 yeux »
            </li>
          </ul>
        </div>
        <p className="text-xs text-brand-100/60">Environnement de démonstration — données fictives.</p>
      </div>

      <div className="flex flex-1 items-start justify-center px-6 py-10 lg:items-center">
        <div className="w-full max-w-2xl">
          <div className="mx-auto max-w-sm">
            <h2 className="text-xl font-semibold text-slate-900">Connexion</h2>
            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <Field label="E-mail">
                <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Mot de passe">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error !== null && (
                <Alert tone={errorCode(error) === 'ACCOUNT_LOCKED' ? 'warning' : 'danger'}>{errorMessage(error)}</Alert>
              )}
              <Button type="submit" className="w-full" loading={pending === email && email !== ''} icon={<LogIn className="size-4" />}>
                Se connecter
              </Button>
            </form>
          </div>

          {demo.data?.enabled && (
            <div className="mt-10">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Comptes de démonstration</h3>
                <p className="text-xs text-slate-500">
                  Mot de passe commun : <Code>{demo.data.password}</Code> — cliquez pour vous connecter
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {demo.data.accounts.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => signIn(account.email, demo.data!.password!)}
                    disabled={pending !== null}
                    className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-800">{fullName(account)}</p>
                        <p className="truncate text-xs text-slate-500">{account.email}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {account.roles.map((role) => (
                          <RoleBadge key={role.code} code={role.code} name={role.name} />
                        ))}
                        {account.status !== 'ACTIVE' && <RoleBadge code={account.status} inactive />}
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{account.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
