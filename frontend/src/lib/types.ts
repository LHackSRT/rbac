export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';
export type Effect = 'ALLOW' | 'DENY';
export type SampleStatus = 'REGISTERED' | 'ANALYZED' | 'VALIDATED';
export type SamplingPointType =
  | 'GROUNDWATER'
  | 'SURFACE_WATER'
  | 'TREATMENT_PLANT'
  | 'RESERVOIR'
  | 'DISTRIBUTION_NETWORK';
export type ParameterCategory = 'PHYSICOCHEMICAL' | 'MICROBIOLOGICAL';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserRef {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type Grant =
  | { type: 'ROLE'; roleCode: string; roleName: string; via: string[]; wildcard: boolean }
  | { type: 'PRIVILEGE'; privilegeId: string; reason: string | null; expiresAt: string | null };

export interface Denial {
  privilegeId: string;
  reason: string | null;
  expiresAt: string | null;
}

export interface Decision {
  permission: string;
  allowed: boolean;
  grants: Grant[];
  denial: Denial | null;
  description?: string | null;
}

export interface RoleAssignment {
  roleId: string;
  code: string;
  name: string;
  assignedAt: string;
  expiresAt: string | null;
  active: boolean;
  assignedBy: UserRef | null;
}

export interface Privilege {
  id: string;
  permission: string;
  permissionDescription: string;
  effect: Effect;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  grantedBy: UserRef | null;
}

export interface Profile extends UserRef {
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: RoleAssignment[];
  privileges: Privilege[];
  permissions: string[];
  decisions: Decision[];
}

export interface UserListItem extends UserRef {
  status: UserStatus;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; code: string; name: string; expiresAt: string | null; active: boolean }[];
  privilegeCount: number;
}

export interface RoleRef {
  id: string;
  code: string;
  name: string;
}

export interface Role extends RoleRef {
  description: string | null;
  isSystem: boolean;
  parents: RoleRef[];
  children: RoleRef[];
  permissions: string[];
  effectivePermissions: { permission: string; inherited: boolean; fromRoleCode: string }[];
  userCount: number;
}

export interface Permission {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string;
  roles: RoleRef[];
}

export interface DemoAccounts {
  enabled: boolean;
  password: string | null;
  accounts: {
    email: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
    description: string;
    roles: { code: string; name: string }[];
  }[];
}

export interface SamplingPoint {
  id: string;
  code: string;
  name: string;
  type: SamplingPointType;
  location: string | null;
  active: boolean;
  sampleCount: number;
}

export interface Parameter {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: ParameterCategory;
  minValue: number | null;
  maxValue: number | null;
  active: boolean;
}

export interface SampleSummary {
  id: string;
  reference: string;
  samplingPoint: { id: string; code: string; name: string; type: SamplingPointType };
  sampledAt: string;
  notes: string | null;
  status: SampleStatus;
  collectedBy: UserRef;
  analyzedBy: UserRef | null;
  analyzedAt: string | null;
  validatedBy: UserRef | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  parameterCount: number;
  enteredCount: number;
  resultsVisible: boolean;
  nonCompliantCount: number | null;
}

export interface SampleResult {
  id: string;
  parameter: Omit<Parameter, 'active'>;
  value: number | null;
  compliant: boolean | null;
  entered: boolean;
  enteredBy: UserRef | null;
  enteredAt: string | null;
}

export interface SampleDetail extends SampleSummary {
  results: SampleResult[];
}

export interface Dashboard {
  counts: Record<SampleStatus, number> & { total: number };
  mySamples: number;
  activeSamplingPoints: number;
  activeParameters: number;
  nonCompliantAlerts: (SampleSummary & {
    nonCompliantParameters: { code: string; name: string; value: number; unit: string }[];
  })[];
}

export interface ReportRow {
  sampleId: string;
  reference: string;
  samplingPoint: { code: string; name: string };
  sampledAt: string;
  validatedAt: string | null;
  validatedBy: string | null;
  parameter: { code: string; name: string; unit: string; minValue: number | null; maxValue: number | null };
  value: number;
  compliant: boolean;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
}

export type CheckOutcome = 'GRANTED' | 'DENIED_BY_PRIVILEGE' | 'NOT_GRANTED' | 'USER_DISABLED' | 'UNKNOWN_PERMISSION';

export interface AccessCheck {
  user: UserRef & { status: UserStatus };
  permission: string;
  allowed: boolean;
  outcome: CheckOutcome;
  decision: Decision;
}
