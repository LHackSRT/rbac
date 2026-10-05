import clsx from 'clsx';
import { ReactNode } from 'react';
import { useDebug } from './debug';
import { useSession } from './session';

export interface Gate {
  /** The user holds the permissions (or the extra condition holds). */
  allowed: boolean;
  /** The element should be rendered (allowed, or hidden but shown by the debug mode). */
  visible: boolean;
  /** Visible only thanks to the debug mode. */
  debugOnly: boolean;
  reason: string;
}

export interface GateOptions {
  /** Every listed permission is required. */
  all?: string[];
  /** At least one listed permission is required. */
  any?: string[];
  /** Extra business condition (ownership, status, four-eyes…). */
  when?: boolean;
  /** Explanation shown in debug mode when `when` is false. */
  whenReason?: string;
}

export function useGate({ all = [], any = [], when = true, whenReason }: GateOptions): Gate {
  const { canAll, canAny } = useSession();
  const { debug } = useDebug();
  const permissionsOk = canAll(all) && (any.length === 0 || canAny(any));
  const allowed = permissionsOk && when;
  let reason = '';
  if (!permissionsOk) {
    const list = [...all, ...(any.length ? [any.join(' ou ')] : [])].join(', ');
    reason = `Masqué : permission manquante (${list})`;
  } else if (!when) {
    reason = `Masqué : ${whenReason ?? 'condition métier non remplie'}`;
  }
  return { allowed, visible: allowed || debug, debugOnly: !allowed && debug, reason };
}

/** Renders its children only when allowed; in debug mode hidden children are shown with a red outline. */
export function Can({ children, className, ...options }: GateOptions & { children: ReactNode; className?: string }) {
  const gate = useGate(options);
  if (!gate.visible) return null;
  if (!gate.debugOnly) return <>{children}</>;
  return (
    <span className={clsx('debug-hidden inline-flex', className)} title={gate.reason}>
      {children}
    </span>
  );
}
