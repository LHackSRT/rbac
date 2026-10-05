import { RESOURCE_LABEL, resourceOf } from '../lib/labels';
import type { Decision } from '../lib/types';
import { DecisionExplanation, DecisionIcon } from './DecisionExplanation';
import { Code, EmptyState } from './ui';

/** Effective permissions of a user grouped by resource, each with its explanation. */
export function EffectivePermissions({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return <EmptyState title="Aucune permission">Cet utilisateur n'a aucun rôle actif ni privilège.</EmptyState>;
  }
  const groups = new Map<string, Decision[]>();
  for (const decision of decisions) {
    const resource = resourceOf(decision.permission);
    groups.set(resource, [...(groups.get(resource) ?? []), decision]);
  }
  return (
    <div className="divide-y divide-slate-100">
      {[...groups.entries()].map(([resource, items]) => (
        <div key={resource} className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{RESOURCE_LABEL[resource] ?? resource}</p>
          <ul className="space-y-3">
            {items.map((decision) => (
              <li key={decision.permission} className="grid gap-1 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
                <div className="flex items-start gap-2">
                  <DecisionIcon allowed={decision.allowed} />
                  <div className="min-w-0">
                    <Code>{decision.permission}</Code>
                    {decision.description && <p className="mt-0.5 text-xs text-slate-500">{decision.description}</p>}
                  </div>
                </div>
                <DecisionExplanation decision={decision} compact />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
