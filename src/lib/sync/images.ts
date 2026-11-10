import { Image } from 'expo-image';

import { db, getState, setState } from './db';

/**
 * Species photos come from Wikimedia Commons. Text (summaries, facts) is synced to SQLite; photos are kept in
 * expo-image's disk cache. After each sync we download, ahead of time, the card photos of species you're
 * likely to look at offline: species recorded in any lake on the phone and species you've caught (plus the
 * large photo for those you've caught). ~80 species ≈ 5 MB. Everything else is cached the first time it's
 * viewed. Only runs again when that set of URLs changes.
 */
export async function prefetchSpeciesImages() {
  const rows = await db.getAllAsync<{ url: string }>(
    `SELECT p.image_thumb_url AS url FROM species_profiles p
     WHERE p.image_thumb_url IS NOT NULL
       AND (p.species_id IN (SELECT species_id FROM waterbody_species)
            OR p.species_id IN (SELECT species_id FROM catches WHERE deleted_at IS NULL))
     UNION
     SELECT p.image_url FROM species_profiles p
     WHERE p.image_url IS NOT NULL AND p.species_id IN (SELECT species_id FROM catches WHERE deleted_at IS NULL)
     ORDER BY 1`,
  );
  const urls = rows.map((r) => r.url);
  const signature = `${urls.length}:${urls.join('|').length}:${urls[0] ?? ''}:${urls[urls.length - 1] ?? ''}`;
  if (!urls.length || signature === (await getState('images:prefetched'))) return;
  if (await Image.prefetch(urls, 'disk')) await setState('images:prefetched', signature);
}
