// Angler-friendly groups for the species collection, by scientific family.
export type DexGroup = { key: string; label: string; families: string[] };

export const DEX_GROUPS: DexGroup[] = [
  { key: 'trout-salmon', label: 'Trout & Salmon', families: ['Salmonidae'] },
  { key: 'bass-sunfish', label: 'Bass & Sunfish', families: ['Centrarchidae', 'Moronidae'] },
  { key: 'perch-walleye', label: 'Perch & Walleye', families: ['Percidae'] },
  { key: 'pike', label: 'Pike & Muskie', families: ['Esocidae'] },
  { key: 'catfish', label: 'Catfish', families: ['Ictaluridae'] },
  { key: 'sturgeon', label: 'Sturgeon & Gar', families: ['Acipenseridae', 'Lepisosteidae', 'Amiidae', 'Polyodontidae'] },
  { key: 'cod-burbot', label: 'Cod & Burbot', families: ['Gadidae', 'Lotidae', 'Merlucciidae'] },
  { key: 'rockfish', label: 'Rockfish & Lingcod', families: ['Sebastidae', 'Hexagrammidae', 'Anoplopomatidae'] },
  { key: 'flatfish', label: 'Flatfish', families: ['Pleuronectidae', 'Paralichthyidae', 'Bothidae', 'Scophthalmidae'] },
  { key: 'minnows-suckers', label: 'Minnows & Suckers', families: ['Cyprinidae', 'Leuciscidae', 'Catostomidae'] },
  { key: 'sculpins', label: 'Sculpins', families: ['Cottidae', 'Psychrolutidae', 'Agonidae'] },
  { key: 'sharks-rays', label: 'Sharks & Rays', families: ['Squalidae', 'Rajidae', 'Lamnidae', 'Carcharhinidae', 'Hexanchidae', 'Somniosidae', 'Arhynchobatidae', 'Dasyatidae', 'Triakidae', 'Cetorhinidae', 'Alopiidae'] },
];

const byFamily = new Map(DEX_GROUPS.flatMap((g) => g.families.map((f) => [f, g.key] as const)));
export const groupOf = (family: string | null | undefined) => (family && byFamily.get(family)) || 'other';
export const groupLabel = (key: string) => DEX_GROUPS.find((g) => g.key === key)?.label ?? 'Other Fish';
