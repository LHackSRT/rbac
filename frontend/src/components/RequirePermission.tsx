import { ShieldAlert } from 'lucide-react';
import { ReactNode } from 'react';
import { useGate } from '../auth/Can';
import { Alert, Card, Code, EmptyState } from './ui';

/** Page-level guard. In debug mode the page is rendered anyway so the API refusals can be observed. */
export function RequirePermission({ all, any, children }: { all?: string[]; any?: string[]; children: ReactNode }) {
  const gate = useGate({ all, any });
  const required = [...(all ?? []), ...(any?.length ? [any.join(' ou ')] : [])];
  if (gate.allowed) return <>{children}</>;
  if (gate.debugOnly) {
    return (
      <>
        <Alert tone="danger" title="Mode debug : page normalement inaccessible" className="mb-4">
          Il vous manque {required.map((code) => <Code key={code}>{code}</Code>)}. Les appels à l'API devraient être refusés (403).
        </Alert>
        {children}
      </>
    );
  }
  return (
    <Card>
      <EmptyState icon={<ShieldAlert className="size-10" />} title="Accès refusé">
        Cette page nécessite {required.map((code) => <Code key={code} className="mx-0.5">{code}</Code>)}. Activez le mode debug pour
        l'afficher malgré tout et constater le refus de l'API.
      </EmptyState>
    </Card>
  );
}
