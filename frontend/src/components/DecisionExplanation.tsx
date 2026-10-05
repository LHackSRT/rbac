import { ArrowRight, Ban, CheckCircle2, CircleSlash, KeyRound, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import type { Decision } from '../lib/types';
import { Code } from './ui';

/** Explains, in French, why a permission is granted or refused. */
export function DecisionExplanation({ decision, compact }: { decision: Decision; compact?: boolean }) {
  const lines = decision.grants.map((grant, index) => {
    if (grant.type === 'PRIVILEGE') {
      return (
        <li key={index} className="flex items-start gap-1.5">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          <span>
            Privilège individuel <strong>ALLOW</strong>
            {grant.reason && <> — « {grant.reason} »</>}
            {grant.expiresAt && <> — expire le {formatDateTime(grant.expiresAt)}</>}
          </span>
        </li>
      );
    }
    return (
      <li key={index} className="flex items-start gap-1.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-700" />
        <span>
          {grant.wildcard ? (
            <>
              Rôle <strong>{grant.roleCode}</strong> via la permission <Code>*</Code>
            </>
          ) : (
            <>
              Rôle <strong>{grant.roleCode}</strong>
              {!compact && <span className="text-slate-500"> ({grant.roleName})</span>}
            </>
          )}
          {grant.via.length > 1 && (
            <span className="ml-1 inline-flex flex-wrap items-center gap-1 text-xs text-slate-500">
              — hérité :
              {grant.via.map((code, i) => (
                <span key={code} className="inline-flex items-center gap-1">
                  {i > 0 && <ArrowRight className="size-3" />}
                  <Code>{code}</Code>
                </span>
              ))}
            </span>
          )}
        </span>
      </li>
    );
  });

  return (
    <div className="space-y-1.5 text-sm">
      {decision.denial && (
        <p className="flex items-start gap-1.5 text-red-700">
          <Ban className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Refusé par un privilège <strong>DENY</strong>
            {decision.denial.reason && <> — « {decision.denial.reason} »</>}
            {decision.denial.expiresAt && <> — jusqu'au {formatDateTime(decision.denial.expiresAt)}</>}
            {decision.grants.length > 0 && <span className="text-red-600/80"> (prioritaire sur les accords ci-dessous)</span>}
          </span>
        </p>
      )}
      {lines.length > 0 ? (
        <ul className={decision.denial ? 'space-y-1 text-slate-400 line-through decoration-slate-300' : 'space-y-1 text-slate-700'}>{lines}</ul>
      ) : (
        !decision.denial && (
          <p className="flex items-center gap-1.5 text-slate-500">
            <CircleSlash className="size-3.5" /> Aucun rôle ni privilège n'accorde cette permission.
          </p>
        )
      )}
    </div>
  );
}

export function DecisionIcon({ allowed }: { allowed: boolean }) {
  return allowed ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Ban className="size-4 text-red-500" />;
}
