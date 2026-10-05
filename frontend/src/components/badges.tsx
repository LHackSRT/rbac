import { Lock, ShieldCheck, ShieldOff } from 'lucide-react';
import { SAMPLE_STATUS_LABEL, USER_STATUS_LABEL } from '../lib/labels';
import type { Effect, SampleStatus, UserStatus } from '../lib/types';
import { Badge } from './ui';

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  const tone = status === 'VALIDATED' ? 'green' : status === 'ANALYZED' ? 'amber' : 'blue';
  return <Badge tone={tone}>{SAMPLE_STATUS_LABEL[status]}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const tone = status === 'ACTIVE' ? 'green' : status === 'LOCKED' ? 'amber' : 'red';
  return (
    <Badge tone={tone}>
      {status === 'LOCKED' && <Lock className="size-3" />}
      {USER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function RoleBadge({ code, name, inactive }: { code: string; name?: string; inactive?: boolean }) {
  return (
    <Badge tone={inactive ? 'slate' : code === 'SUPER_ADMIN' ? 'violet' : 'brand'} title={name} className={inactive ? 'line-through' : undefined}>
      {code}
    </Badge>
  );
}

export function EffectBadge({ effect }: { effect: Effect }) {
  return effect === 'ALLOW' ? (
    <Badge tone="green">
      <ShieldCheck className="size-3" /> ALLOW
    </Badge>
  ) : (
    <Badge tone="red">
      <ShieldOff className="size-3" /> DENY
    </Badge>
  );
}

export function ComplianceBadge({ compliant }: { compliant: boolean | null }) {
  if (compliant === null) return <Badge tone="slate">—</Badge>;
  return compliant ? <Badge tone="green">Conforme</Badge> : <Badge tone="red">Non conforme</Badge>;
}
