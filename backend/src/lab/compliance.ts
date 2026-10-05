/** A value is compliant when it lies within [minValue, maxValue] (each bound optional). */
export function isCompliant(value: number | null, minValue: number | null, maxValue: number | null): boolean | null {
  if (value === null) return null;
  if (minValue !== null && value < minValue) return false;
  if (maxValue !== null && value > maxValue) return false;
  return true;
}

export function sampleReference(seq: number): string {
  return `ECH-${String(seq).padStart(5, '0')}`;
}
