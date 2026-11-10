// Depth contours for the BC lakes that have digital bathymetry (BC Lake Bathymetric Maps, 26 lakes, ~2.3 MB).
// The dataset is Access Only: it isn't mirrored on our server. The phone downloads it straight from the BC WFS,
// keeps the file for offline use and refreshes it monthly. Which lakes have contours is synced reference data
// (waterbodies.has_contours, set by the `bc-lake-contours` adapter).
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { getState, setState } from '@/lib/sync/db';

const URL_ =
  'https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=pub:WHSE_FISH.BATH_LAKE_BATHYMETRIC_SP&outputFormat=application/json&srsName=EPSG:4326' +
  '&propertyName=CONTOUR_DEPTH_M,LAKE_WSA_WATERBODY_IDENTIFIER,SHAPE';
const REFRESH_MS = 30 * 86_400_000;
const STATE_KEY = 'contours:fetched_at';
/** Contour depths at or above this are the dataset's "no value" marker, not real depths. */
export const CONTOUR_NO_DEPTH = 99999;
/** Contours only show from this zoom (lake scale). */
export const CONTOUR_MIN_ZOOM = 11;

const file = () => new File(Paths.document, 'lake-contours.geojson');
let inFlight: Promise<void> | null = null;

async function refresh() {
  const fetched = Number((await getState(STATE_KEY)) ?? 0);
  if (file().exists && Date.now() - fetched < REFRESH_MS) return;
  const tmp = new File(Paths.cache, 'lake-contours.download.geojson');
  if (tmp.exists) tmp.delete();
  await File.downloadFileAsync(URL_, tmp);
  const dest = file();
  if (dest.exists) dest.delete();
  tmp.move(dest);
  await setState(STATE_KEY, String(Date.now()));
}

/** Local file URI of the contours GeoJSON (null until the first download, which needs signal). */
export function useContoursUri() {
  const [uri, setUri] = useState<string | null>(() => (file().exists ? file().uri : null));
  useEffect(() => {
    let cancelled = false;
    inFlight ??= refresh().finally(() => {
      inFlight = null;
    });
    inFlight
      .then(() => !cancelled && file().exists && setUri(file().uri))
      .catch(() => {}); // offline: keep the file we have (or none)
    return () => {
      cancelled = true;
    };
  }, []);
  return uri;
}
