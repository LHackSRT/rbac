import { Loader2 } from 'lucide-react';
import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './auth/session';
import { Layout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';
import { Card, EmptyState } from './components/ui';
import { AccessTesterPage } from './pages/admin/AccessTesterPage';
import { AuditPage } from './pages/admin/AuditPage';
import { MatrixPage } from './pages/admin/MatrixPage';
import { RoleDetailPage } from './pages/admin/RoleDetailPage';
import { RolesPage } from './pages/admin/RolesPage';
import { UserDetailPage } from './pages/admin/UserDetailPage';
import { UsersPage } from './pages/admin/UsersPage';
import { DashboardPage } from './pages/lab/DashboardPage';
import { ParametersPage } from './pages/lab/ParametersPage';
import { ReportsPage } from './pages/lab/ReportsPage';
import { SampleDetailPage } from './pages/lab/SampleDetailPage';
import { SamplesPage } from './pages/lab/SamplesPage';
import { SamplingPointsPage } from './pages/lab/SamplingPointsPage';
import { ValidationPage } from './pages/lab/ValidationPage';
import { LoginPage } from './pages/LoginPage';
import { MyAccessPage } from './pages/MyAccessPage';

function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      <Loader2 className="mr-2 size-5 animate-spin" /> Chargement de la session…
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { status, loggedOut } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={loggedOut ? undefined : { from: location.pathname }} />;
  return <>{children}</>;
}

function Home() {
  const { can } = useSession();
  return <Navigate to={can('sample:read') ? '/dashboard' : '/me'} replace />;
}

function guard(element: ReactNode, all: string[]) {
  return <RequirePermission all={all}>{element}</RequirePermission>;
}

export function App() {
  const { status } = useSession();
  return (
    <Routes>
      <Route
        path="/login"
        element={status === 'loading' ? <FullScreenLoader /> : status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="dashboard" element={guard(<DashboardPage />, ['sample:read'])} />
        <Route path="samples" element={guard(<SamplesPage />, ['sample:read'])} />
        <Route path="samples/:id" element={guard(<SampleDetailPage />, ['sample:read'])} />
        <Route path="validation" element={guard(<ValidationPage />, ['sample:read', 'result:validate'])} />
        <Route path="reports" element={guard(<ReportsPage />, ['result:read'])} />
        <Route path="parameters" element={guard(<ParametersPage />, ['parameter:read'])} />
        <Route path="sampling-points" element={guard(<SamplingPointsPage />, ['sampling-point:read'])} />
        <Route path="admin/users" element={guard(<UsersPage />, ['user:read'])} />
        <Route path="admin/users/:id" element={guard(<UserDetailPage />, ['user:read'])} />
        <Route path="admin/roles" element={guard(<RolesPage />, ['role:read'])} />
        <Route path="admin/roles/:id" element={guard(<RoleDetailPage />, ['role:read'])} />
        <Route path="admin/matrix" element={guard(<MatrixPage />, ['role:read', 'permission:read'])} />
        <Route path="admin/access-tester" element={guard(<AccessTesterPage />, ['user:read', 'permission:read'])} />
        <Route path="admin/audit" element={guard(<AuditPage />, ['audit:read'])} />
        <Route path="me" element={<MyAccessPage />} />
        <Route
          path="*"
          element={
            <Card>
              <EmptyState title="Page introuvable">Cette adresse ne correspond à aucune page.</EmptyState>
            </Card>
          }
        />
      </Route>
    </Routes>
  );
}
