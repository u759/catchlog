// Standard lure/tackle categories (consensus of angling references; see docs/research.md).
export type GearGroup = 'Lures' | 'Flies & bait' | 'Tackle';
export type GearCategory = { key: string; label: string; subtypes: string[]; group: GearGroup };

export const GEAR_CATEGORIES: GearCategory[] = [
  { key: 'soft-plastic', label: 'Soft plastic', subtypes: ['Worm', 'Stickbait (Senko)', 'Creature', 'Craw', 'Grub', 'Tube', 'Fluke', 'Paddle-tail', 'Ned'], group: 'Lures' },
  { key: 'crankbait', label: 'Crankbait', subtypes: ['Square-bill', 'Medium diver', 'Deep diver', 'Lipless'], group: 'Lures' },
  { key: 'jerkbait', label: 'Jerkbait', subtypes: ['Floating', 'Suspending', 'Sinking'], group: 'Lures' },
  { key: 'topwater', label: 'Topwater', subtypes: ['Popper', 'Walking bait', 'Prop bait', 'Buzzbait', 'Frog'], group: 'Lures' },
  { key: 'swimbait', label: 'Swimbait', subtypes: ['Soft', 'Hard', 'Glide'], group: 'Lures' },
  { key: 'spinnerbait', label: 'Spinnerbait', subtypes: [], group: 'Lures' },
  { key: 'bladed-jig', label: 'Bladed jig', subtypes: [], group: 'Lures' },
  { key: 'inline-spinner', label: 'Inline spinner', subtypes: [], group: 'Lures' },
  { key: 'spoon', label: 'Spoon', subtypes: ['Casting', 'Jigging', 'Trolling'], group: 'Lures' },
  { key: 'jig', label: 'Jig', subtypes: ['Flipping', 'Football', 'Swim', 'Finesse', 'Hair', 'Jighead'], group: 'Lures' },
  { key: 'blade-bait', label: 'Blade bait', subtypes: [], group: 'Lures' },
  { key: 'metal-jig', label: 'Metal / vertical jig', subtypes: [], group: 'Lures' },
  { key: 'fly', label: 'Fly', subtypes: ['Dry', 'Nymph', 'Streamer', 'Wet', 'Chironomid'], group: 'Flies & bait' },
  { key: 'live-bait', label: 'Live / natural bait', subtypes: ['Worm', 'Minnow', 'Roe', 'Shrimp', 'Leech', 'Powerbait'], group: 'Flies & bait' },
  { key: 'terminal', label: 'Hooks, weights & terminal', subtypes: ['Hook', 'Weight', 'Swivel', 'Float', 'Leader'], group: 'Tackle' },
  { key: 'rod-reel', label: 'Rod & reel', subtypes: ['Spinning', 'Baitcasting', 'Fly', 'Trolling', 'Ice'], group: 'Tackle' },
  { key: 'other', label: 'Other', subtypes: [], group: 'Tackle' },
];

export const GEAR_GROUPS: GearGroup[] = ['Lures', 'Flies & bait', 'Tackle'];

export const categoryLabel = (key: string) => GEAR_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
/** Categories that are things you catch fish *on* (shown in the Log Catch lure picker). */
export const isLure = (key: string) => !['terminal', 'rod-reel'].includes(key);
/** Colour, lure weight and hook size don't apply to rods and reels. */
export const hasLureDetails = (key: string) => key !== 'rod-reel';
