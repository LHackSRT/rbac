const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

export function formatDateTime(value: string | Date | null | undefined) {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function formatDate(value: string | Date | null | undefined) {
  return value ? dateOnly.format(new Date(value)) : '—';
}

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : number.format(value);
}

export function fullName(user: { firstName: string; lastName: string } | null | undefined) {
  return user ? `${user.firstName} ${user.lastName}` : '—';
}

export function initials(user: { firstName: string; lastName: string }) {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
}

/** Value for an <input type="datetime-local"> from a date. */
export function toLocalInput(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** ISO string from an <input type="datetime-local"> value (or null when empty). */
export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function thresholdLabel(min: number | null, max: number | null, unit?: string) {
  const suffix = unit ? ` ${unit}` : '';
  if (min !== null && max !== null) return `${formatNumber(min)} – ${formatNumber(max)}${suffix}`;
  if (max !== null) return `≤ ${formatNumber(max)}${suffix}`;
  if (min !== null) return `≥ ${formatNumber(min)}${suffix}`;
  return 'Aucun seuil';
}
