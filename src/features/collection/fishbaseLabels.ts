// FishBase publishes habitat and migration as fixed technical terms (its own controlled vocabulary). These turn
// them into plain words for display; unknown terms are shown as published.

const ENVIRONMENT: Record<string, string> = {
  demersal: 'Lives near the bottom',
  bathydemersal: 'Lives deep, near the bottom',
  benthopelagic: 'Lives near the bottom and in open water',
  pelagic: 'Lives in open water',
  'pelagic-neritic': 'Lives in open coastal water',
  'pelagic-oceanic': 'Lives in the open ocean',
  bathypelagic: 'Lives in deep open water',
  'reef-associated': 'Lives around reefs',
};

const MIGRATION: Record<string, string> = {
  anadromous: 'Lives at sea, spawns in fresh water',
  catadromous: 'Lives in fresh water, spawns at sea',
  amphidromous: 'Moves between fresh and salt water',
  potamodromous: 'Migrates within fresh water',
  oceanodromous: 'Migrates within the sea',
  oceano: 'Migrates within the sea',
  'non-migratory': 'Stays put',
};

export const environmentLabel = (v: unknown) =>
  typeof v === 'string' && v ? (ENVIRONMENT[v.toLowerCase()] ?? v) : null;

export const migrationLabel = (v: unknown) =>
  typeof v === 'string' && v ? (MIGRATION[v.toLowerCase()] ?? v) : null;
