// Standard lure/tackle categories (consensus of angling references; see docs/research.md).
export type GearCategory = { key: string; label: string; subtypes: string[] };

export const GEAR_CATEGORIES: GearCategory[] = [
  { key: 'soft-plastic', label: 'Soft plastic', subtypes: ['Worm', 'Stickbait (Senko)', 'Creature', 'Craw', 'Grub', 'Tube', 'Fluke', 'Paddle-tail', 'Ned'] },
  { key: 'crankbait', label: 'Crankbait', subtypes: ['Square-bill', 'Medium diver', 'Deep diver', 'Lipless'] },
  { key: 'jerkbait', label: 'Jerkbait', subtypes: ['Floating', 'Suspending', 'Sinking'] },
  { key: 'topwater', label: 'Topwater', subtypes: ['Popper', 'Walking bait', 'Prop bait', 'Buzzbait', 'Frog'] },
  { key: 'swimbait', label: 'Swimbait', subtypes: ['Soft', 'Hard', 'Glide'] },
  { key: 'spinnerbait', label: 'Spinnerbait', subtypes: [] },
  { key: 'bladed-jig', label: 'Bladed jig', subtypes: [] },
  { key: 'inline-spinner', label: 'Inline spinner', subtypes: [] },
  { key: 'spoon', label: 'Spoon', subtypes: ['Casting', 'Jigging', 'Trolling'] },
  { key: 'jig', label: 'Jig', subtypes: ['Flipping', 'Football', 'Swim', 'Finesse', 'Hair', 'Jighead'] },
  { key: 'blade-bait', label: 'Blade bait', subtypes: [] },
  { key: 'metal-jig', label: 'Metal / vertical jig', subtypes: [] },
  { key: 'fly', label: 'Fly', subtypes: ['Dry', 'Nymph', 'Streamer', 'Wet', 'Chironomid'] },
  { key: 'live-bait', label: 'Live / natural bait', subtypes: ['Worm', 'Minnow', 'Roe', 'Shrimp', 'Leech', 'Powerbait'] },
  { key: 'terminal', label: 'Hooks, weights & terminal', subtypes: ['Hook', 'Weight', 'Swivel', 'Float', 'Leader'] },
  { key: 'rod-reel', label: 'Rod & reel', subtypes: ['Spinning', 'Baitcasting', 'Fly', 'Trolling', 'Ice'] },
  { key: 'other', label: 'Other', subtypes: [] },
];

export const categoryLabel = (key: string) => GEAR_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
/** Categories that are things you catch fish *on* (shown in the Log Catch lure picker). */
export const isLure = (key: string) => !['terminal', 'rod-reel'].includes(key);
