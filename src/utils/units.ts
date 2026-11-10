// The database stores metric integers (length_mm, weight_g). Everything user-facing goes
// through these helpers so the Imperial/Metric toggle is display-only.
export type Units = 'imperial' | 'metric';

const MM_PER_IN = 25.4;
const G_PER_LB = 453.59237;

export const lengthUnit = (u: Units) => (u === 'imperial' ? 'in' : 'cm');
export const weightUnit = (u: Units) => (u === 'imperial' ? 'lbs' : 'kg');

export function formatLength(mm: number | null | undefined, u: Units): string {
  if (mm == null) return '—';
  return u === 'imperial' ? (mm / MM_PER_IN).toFixed(1) : (mm / 10).toFixed(1);
}

export function formatWeight(g: number | null | undefined, u: Units): string {
  if (g == null) return '—';
  return u === 'imperial' ? (g / G_PER_LB).toFixed(1) : (g / 1000).toFixed(2);
}

/** Parse a user-typed length (in or cm) into mm. Returns null for blank/invalid input. */
export function parseLength(text: string, u: Units): number | null {
  const n = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(u === 'imperial' ? n * MM_PER_IN : n * 10);
}

/** Parse a user-typed weight (lb or kg) into grams. Returns null for blank/invalid input. */
export function parseWeight(text: string, u: Units): number | null {
  const n = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(u === 'imperial' ? n * G_PER_LB : n * 1000);
}

/**
 * Length-weight estimate (FishBase): log10(W g) = a + b·log10(L mm).
 * Returns null when the species has no coefficients.
 */
export function estimateWeightG(
  lengthMm: number | null,
  species: { lw_a: number | null; lw_b: number | null } | undefined,
): number | null {
  if (!lengthMm || species?.lw_a == null || species?.lw_b == null) return null;
  return Math.round(10 ** (species.lw_a + species.lw_b * Math.log10(lengthMm)));
}
