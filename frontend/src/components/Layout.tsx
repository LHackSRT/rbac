import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bug,
  ChevronDown,
  ClipboardCheck,
  Droplets,
  FileBarChart,
  FlaskConical,
  Gauge,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useGate } from '../auth/Can';
import { useDebug } from '../auth/debug';
import { useMe, useSession } from '../auth/session';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { fullName, initials } from '../lib/format';
import type { DemoAccounts } from '../lib/types';
import { RoleBadge } from './badges';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  all?: string[];
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Laboratoire',
    items: [
      { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, all: ['sample:read'] },
      { to: '/samples', label: 'Échantillons', icon: FlaskConical, all: ['sample:read'] },
      { to: '/validation', label: 'À valider', icon: ClipboardCheck, all: ['sample:read', 'result:validate'] },
      { to: '/reports', label: 'Rapports', icon: FileBarChart, all: ['result:read'] },
      { to: '/parameters', label: 'Paramètres et seuils', icon: Gauge, all: ['parameter:read'] },
      { to: '/sampling-points', label: 'Points de prélèvement', icon: MapPin, all: ['sampling-point:read'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/users', label: 'Utilisateurs', icon: Users, all: ['user:read'] },
      { to: '/admin/roles', label: 'Rôles et héritage', icon: ShieldCheck, all: ['role:read'] },
      { to: '/admin/matrix', label: 'Matrice des droits', icon: Grid3x3, all: ['role:read', 'permission:read'] },
      { to: '/admin/access-tester', label: "Testeur d'accès", icon: SearchCheck, all: ['user:read', 'permission:read'] },
      { to: '/admin/audit', label: "Journal d'audit", icon: ScrollText, all: ['audit:read'] },
    ],
  },
  {
    title: 'Mon compte',
    items: [{ to: '/me', label: 'Mes droits', icon: KeyRound }],
  },
];

function NavEntry({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const gate = useGate({ all: item.all });
  if (!gate.visible) return null;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={gate.debugOnly ? gate.reason : undefined}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
          gate.debugOnly && 'border border-dashed border-red-400/80',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {gate.debugOnly && <span className="ml-auto text-[10px] font-semibold uppercase text-red-300">masqué</span>}
    </NavLink>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { canAll } = useSession();
  const { debug } = useDebug();
  const sections = NAV_SECTIONS.filter((section) => section.items.some((item) => debug || canAll(item.all ?? [])));
  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-brand-600 p-1.5 text-white">
          <Droplets className="size-5" />
        </div>
        <div>
          <p className="font-semibold leading-tight text-white">AquaLab</p>
          <p className="text-xs text-slate-400">Analyses de l'eau · RBAC</p>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavEntry key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function AccountMenu() {
  const me = useMe();
  const { login, logout } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api<DemoAccounts>('/auth/demo-accounts'), staleTime: 60_000 });

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const switchTo = async (email: string) => {
    setOpen(false);
    try {
      await logout();
      await login(email, demo.data!.password!);
      navigate('/');
      toast.success(`Connecté en tant que ${email}`);
    } catch (error) {
      toast.error(errorMessage(error));
      navigate('/login');
    }
  };

  const activeRoles = me.roles.filter((role) => role.active);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
          {initials(me)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-slate-900">{fullName(me)}</span>
          <span className="block truncate text-xs text-slate-500">
            {activeRoles.length ? activeRoles.map((role) => role.code).join(', ') : 'Aucun rôle'}
          </span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{fullName(me)}</p>
            <p className="text-xs text-slate-500">{me.email}</p>
          </div>
          {demo.data?.enabled && (
            <div className="max-h-80 overflow-y-auto py-1">
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Changer de compte de démo
              </p>
              {demo.data.accounts.map((account) => (
                <button
                  key={account.email}
                  disabled={account.email === me.email}
                  onClick={() => switchTo(account.email)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-slate-50 disabled:bg-brand-50/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">{fullName(account)}</span>
                    <span className="block truncate text-xs text-slate-500">{account.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {account.roles.map((role) => (
                      <RoleBadge key={role.code} code={role.code} name={role.name} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

function DebugToggle() {
  const { debug, setDebug } = useDebug();
  return (
    <button
      onClick={() => setDebug(!debug)}
      title="Affiche les éléments masqués faute de permission, pour vérifier que l'API les refuse (403)"
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        debug ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      <Bug className="size-4" />
      <span className="hidden md:inline">Mode debug</span>
      <span className={clsx('h-4 w-7 rounded-full p-0.5 transition-colors', debug ? 'bg-red-500' : 'bg-slate-300')}>
        <span className={clsx('block size-3 rounded-full bg-white transition-transform', debug && 'translate-x-3')} />
      </span>
    </button>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { debug } = useDebug();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <div className="min-h-full">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">Laboratoire d'analyses biochimiques de l'eau</div>
          <div className="flex items-center gap-2">
            <DebugToggle />
            <AccountMenu />
          </div>
        </header>
        {debug && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">
            Mode debug actif : les éléments encadrés en rouge sont normalement masqués. Utilisez-les pour vérifier que l'API répond 403.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
