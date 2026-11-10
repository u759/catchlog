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

const M_PER_FT = 0.3048;
const G_PER_OZ = 28.349523125;

// Water depth (stored in metres).
export const depthUnit = (u: Units) => (u === 'imperial' ? 'ft' : 'm');
export function formatDepth(m: number | null | undefined, u: Units): string {
  if (m == null) return '—';
  return String(Math.round(u === 'imperial' ? m / M_PER_FT : m));
}
export function parseDepth(text: string, u: Units): number | null {
  const n = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((u === 'imperial' ? n * M_PER_FT : n) * 10) / 10;
}

// Lure / tackle weight (stored in grams).
export const lureWeightUnit = (u: Units) => (u === 'imperial' ? 'oz' : 'g');
export function formatLureWeight(g: number | null | undefined, u: Units): string {
  if (g == null) return '';
  return u === 'imperial' ? String(Math.round((g / G_PER_OZ) * 100) / 100) : String(Math.round(g * 10) / 10);
}
export function parseLureWeight(text: string, u: Units): number | null {
  const n = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((u === 'imperial' ? n * G_PER_OZ : n) * 10) / 10;
}

/** Distance (metres) for display: m/km or ft/mi. */
export function formatDistance(m: number, u: Units): string {
  if (u === 'imperial') {
    const ft = m / M_PER_FT;
    return ft < 1000 ? `${Math.round(ft)} ft` : `${(m / 1609.344).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
