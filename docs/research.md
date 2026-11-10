# Data sources & feature research (2026-11-10)

Research pass for the features in the design brief (species collection, catch dossier, offline map, tackle box, knot guide, species ID). Every source below was opened or queried; items marked *unverified* were not. Licences matter: the app is **non-commercial** (FishBase, Open-Meteo free tier, OpenFreeMap terms assume that).

## Where each kind of data lives

| Kind | Where | Why |
|---|---|---|
| Slow-changing reference data (species facts, species per lake, stocking, lake names) | Imported into Supabase tables by scripts in `scripts/`, versioned, synced or queried | Fast, offline-capable, no third-party calls at runtime |
| Live/time-based data (water temp, weather, water level) | Supabase **Edge Function** that calls the public APIs, caches in Postgres, and stamps results onto the catch | Hides keys, merges sources, caches, survives offline (runs after the catch uploads) |
| Large map files (depth contours, base map packs) | Pre-built files in object storage, downloaded per region to the phone | Too big for Postgres (free tier 500 MB) |
| Static content (knots, rigs, lure taxonomy) | Bundled JSON/SVG in the app | Fully offline, no server |
| Secrets (Fishial, Anthropic keys) | Edge Function secrets | Never in the app |

## Species content (for dossiers + mystery hints) — all 1,394 species join on `fishbase_id`

- **FishBase v26.06** parquet (`data.source.coop/cboettig/fishbase/fb/v26.06/parquet/<table>.parquet`, CC BY-NC). Coverage across our species / game fish:
  `species.Comments` (habitat/biology) 1,288/312 · depth range 1,196/260 · `ecology` habitat flags + text 1,090/293 · `estimate` temp preference 1,189/245, trophic level 1,392 · `spawning` months 530/232 · `morphdat` ID features (adipose fin, spines, similar species) 996/256 · `country` C_Code 124 Canadian distribution + native/introduced 1,096/283 · diet/food items 977 · `stocks` IUCN 1,390.
- **Wikidata** (CC0): property P938 = FishBase ID → matched 1,387. Gives enwiki (1,019) / frwiki (508) article, Commons image P18 (1,011), iNaturalist ID P3151 (1,370).
- **Wikipedia summaries**: `https://{en|fr}.wikipedia.org/api/rest_v1/page/summary/{title}` (CC BY-SA 4.0: link + licence notice).
- **Images**: Wikimedia Commons via P18 + `commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata` (always free licences; store author + licence). iNaturalist photos are mostly CC BY-NC; FishBase pictures are per-image (only 192 of ours are "free use").
- **Lure recommendations**: no open dataset exists. Standard approach: small hand-written starter table for top game fish, then learn from our own catch logs (species × lure category × month/water temp), with minimum sample sizes.

## Species ID from a photo

| Option | Notes |
|---|---|
| **Fishial.ai Recognition API v2** (`api-recognition.fishial.ai`, client id/secret) | Free plan; 865 species in production model; covers 184/312 of our game fish (misses mostly marine + minnows/darters). Returns candidates with certainty. Uses some newer names (e.g. *Micropterus nigricans*) → synonym map. Model weights MIT. Commercial terms unclear (ask). |
| **Claude vision** (Edge Function) | No published fish benchmark; general VLMs do far better with a short candidate list (e.g. 4-way choice) than open naming. Pass province species + Fishial candidates, ask for structured JSON. |
| iNaturalist CV | No public API. |
| On-device | Nothing ready for Canadian fish. Standard: queue photo, identify when back online. |

Recommendation: Edge Function `identify` = Fishial first (accept if certainty ≥ 0.8 and maps to our species), else Claude with candidate list; user always confirms; store confirmations to measure accuracy.

## Moon / sun / solunar
`suncalc` v2 (BSD-2, ~566k weekly downloads): sun/moon rise-set, moon `transit`/`lowerTransit`, illumination + phase. Runs on the phone (offline). Solunar major/minor periods are a well-known method (major ≈ 2 h around moon transits, minor around moonrise/set); ~50 lines on top of suncalc.

## Water temperature, level, flow (Canada)

Free history windows are short (buoys ~30–45 days, ECCC real-time 30 days), so conditions are captured **when the catch is logged/uploaded**, not later.

| Need | Source | Access |
|---|---|---|
| Inland lake surface temp | **MUR SST v4.1** (NASA JPL), ~1 km daily, includes lakes (`open_lake` mask), 2002–present, 1–4 day latency | NOAA ERDDAP `coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.csv?analysed_sst[(t)][(lat)][(lon)]`, no key; cache server-side |
| Great Lakes temp | **NOAA GLERL GLSEA (ACSPO)** ~1.4 km daily, ~1 day latency | `apps.glerl.noaa.gov/erddap/griddap/GLSEA_ACSPO_GCS.csv`, no key |
| Buoy temp (Simcoe, Nipissing, Lake of the Woods, Winnipeg, Great Slave, Georgian Bay, coasts) | ECCC/DFO buoys: NDBC feed `ndbc.noaa.gov/data/realtime2/{id}.txt` (45 days); history via CIOOS ERDDAP `DFO_MEDS_BUOYS` (1970–, OGL-Canada) | No key |
| Coastal/ocean temp | Open-Meteo Marine `sea_surface_temperature` (no key, non-commercial free tier); NOAA OISST via ERDDAP | No key |
| River temp (some stations) | Wateroffice CSV parameter code 5 | No key |
| Water level & flow | **ECCC OGC API** `api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=…` (30 days, 2,627 stations), stations via `hydrometric-stations`; Wateroffice CSV (18 months); HYDAT daily means (to 2024) | No key |
| Weather at catch time | Open-Meteo forecast + historical archive (already used) | No key |
| Rejected | Open-Meteo `soil_temperature_0cm` over lakes (behaves like land on small lakes); ECCC HRDPS water-temp layer (−1 °C on Lake of the Woods); ERA5-Land/Copernicus LSWT (account + queued NetCDF jobs, 10-day composites) | — |
| Later, optional | air2water model (standard, but needs per-lake calibration against MUR/CCI) for "estimated" temps | — |

## Lakes: names, depth maps, species present, stocking

| Need | Best sources | Licence |
|---|---|---|
| Lake name at a GPS point | **NRCan Geoname API** `geogratis.gc.ca/services/geoname/en/geonames.json?lat=&lon=&radius=&concise=LAKE&sort-field=distance` (points, not outlines) | OGL-Canada |
| Lake outlines | BC Freshwater Atlas (WFS), Ontario LIO waterbodies, NHN (unmaintained since 2022), HydroLAKES (≥10 ha, global, CC-BY) | OGL / CC-BY |
| Depth contours (vector) | **Ontario** Bathymetry Line: 250,962 contours, ~3,537 lakes (OGL-ON, 220 MB fgdb); **Quebec** GBLQ: 2,210 lakes vector (CC-BY 4.0, GPKG 1.2 GB); NB depth points (18k); Manitoba ~215 lakes (vector tiles only); Alberta 169 lakes (contours in m a.s.l.) | Not for navigation |
| Depth maps (scanned PDF) | **BC** 2,741 PDFs / 2,216 lakes (OGL-BC); Ontario 11,000+ historic maps; Saskatchewan 945 | — |
| Big lakes | CHS NONNA (Great Lakes, Winnipeg, Great Slave; chart datum), NOAA Great Lakes grids | CHS licence / US PD |
| Modelled depth (any lake ≥10 ha) | HydroLAKES mean depth (CC-BY), GLOBathy rasters (CC0, modelled) | — |
| **Species present in a lake** | **Ontario ARA**: 19,288 lakes with species lists (`FISH_SPECIES_SUMMARY`, OGL-ON); **BC Known Fish Observations**: 382,527 records by waterbody (OGL-BC, daily); Nova Scotia 833 waterbodies (OGL-NS). Alberta FWMIS prohibits redistribution. Quebec: no per-lake open data. | |
| Stocking | Ontario 2016–2026 (12,832 records, FeatureServer, OGL-ON) + 1900–2012 historical; Nova Scotia 1976–2025 (OGL-NS); Alberta CSV 2009–2021; BC via FIDQ (Access Only) | |

Join keys: Ontario `WBY_LID` links bathymetry index ↔ species ↔ stocking; BC `WBODY_ID` links FWA lakes ↔ observations ↔ stocking.

## Maps (offline)

- **SDK**: `@maplibre/maplibre-react-native` v11 (new-architecture only, Expo config plugin, dev builds). `OfflineManager.createPack({ mapStyle, bounds, minZoom, maxZoom })` for base-map packs; clustered `GeoJSONSource` + bundled `Images` for pins. Verify on RN 0.88 early.
- **Base map tiles**: **OpenFreeMap** (vector, no key, attribution required). Offline downloads allowed up to 3,000 tiles / 50 MB per download, ≤4 parallel requests, unique User-Agent. Rejected: OSM tiles (offline forbidden), MapTiler/Stadia free (non-commercial + limited caching), Esri, OpenTopoMap (unclear).
- **Depth overlays**: build our own from the government contours above (`ogr2ogr` → `tippecanoe` → PMTiles or per-lake GeoJSON), host in object storage, download per lake/region. PMTiles can't go in offline packs; load a downloaded file directly (`pmtiles://file://…`, needs device testing) or per-lake GeoJSON (supported everywhere).
- **Terrain/hillshade** (later): Mapterhorn elevation tiles (NRCan 2 m in Canada).
- **Hosting**: Supabase Storage supports HTTP range requests, but free plan caps files at 50 MB and ~5 GB egress; Cloudflare R2 is the usual alternative.

## Knots, rigs, tackle

- No open fishing-knot dataset or lure catalogue exists. Animated Knots, NetKnots, state and Ontario guides are not reusable.
- Usable images: Wikimedia Commons public-domain/CC0/CC BY (Nail, Bimini, Albright, Texas rig, drop shot, Carolina, USFWS improved clinch, Palomar photo set). CC BY-SA ones (Uni, Snell) need share-alike on edits. FG, Double Uni, wacky, Ned: draw our own.
- Steps: write our own text (methods aren't copyrightable; specific text/drawings are).
- Strength: no peer-reviewed standard; cite Sport Fishing 2015 (Instron, IGFA line) and Field & Stream tests as ranges with line type.
- Lure taxonomy: standard categories (soft plastic, crankbait, jerkbait, topwater, swimbait, spinnerbait, bladed jig, inline spinner, spoon, jig, blade bait, metal jig, fly, live bait) with subtypes; rigs as a separate list (Texas, Carolina, drop shot, wacky, Ned, neko, split shot, float, three-way). Gear item = category, brand, product, colour, size, weight, hook size, quantity, notes (Fishbrain uses category → brand → product → variant).
- Reference facts: IGFA line classes, hook size order (#32…#1, 1/0…), tippet "rule of 11".

---

# BC deep-dive (2026-11-10)

## Lakes
- **Lake at a point**: BC Freshwater Atlas `pub:WHSE_BASEMAPPING.FWA_LAKES_POLY` (OGL-BC), WFS `openmaps.gov.bc.ca/geo/pub/wfs` with `CQL_FILTER=INTERSECTS(GEOMETRY, SRID=4326;POINT(lon lat))` or `DWITHIN(..., 500, meters)`. 386,025 polygons; 7,125 named (12.4 MB GeoJSON simplified to 10 m). Bulk: `fwa_lakes_poly.parquet` (150 MB) from the fwapg mirror.
- **Join key**: 1:50K waterbody code (`WATERBODY_KEY_GROUP_CODE_50K` = `WATERBODY_IDENTIFIER`) links lakes ↔ fish observations (97% match) ↔ bathymetry (99%).
- **Species per lake**: Known BC Fish Observations `WHSE_FISH.FISS_FISH_OBSRVTN_PNT_SP` (OGL-BC, updated daily). 138,757 lake observations → 17,591 (lake, species) rows over 5,625 lakes, 154 species. Pull via WFS CSV paging (14 calls).
- **Measured depth**: `WHSE_FISH.FISS_LAKE_SURVEYS_SVW` (OGL-BC) 5,318 surveys with max/mean depth.
- **Depth maps**: "Bathymetric Maps – Open" (OGL-BC): 2,741 sheets / 2,216 lakes as PDF. **Not georeferenced** (plain scans, not GeoPDF, often rotated). 697 sheets (517 lakes) also have `.e00` vectors in local sheet coordinates via the Access-Only layer. Only 26 lakes exist as georeferenced contours (Access Only). Turning sheets into map overlays needs per-sheet georeferencing (no standard automated pipeline) → ship the official PDF per lake (offline-cacheable) + measured max depth; overlays only with GeoBC permission.
- **Stocking**: `FISH_RELEASES_PUBLIC_VW` and FIDQ exports are **Access Only** ("reproduction is not permitted without written permission"); GoFishBC is All Rights Reserved → link out per lake, or request permission (forms.gov.bc.ca/copyright-permission-request/).
- Not for navigation: carry the caution with depth maps.

## Conditions at catch time (looked up by `caught_at`, not upload time)

| Data | Source | How far back | Notes |
|---|---|---|---|
| Tide height, high/low, rising/falling | CHS IWLS `api-iwls.dfo-mpo.gc.ca/api/v1/stations/{id}/data?time-series-code=wlp|wlo|wlp-hilo` | Predictions to 2018, observed to 2020 | No nearest-station query: cache the 370 PAC stations. 30 req/min/IP. Non-commercial + "not for navigation" notice required. |
| Tidal current | IWLS `wcsp1`/`wcdp1`/`wcp1-events` (27 BC stations) | Same | Only near passes/narrows |
| Coastal sea temp | ECCC_MSC_BUOYS (CIOOS Pacific ERDDAP, 10-min, ~45 min lag); DFO_MEDS_BUOYS (hourly, ~20 h lag); Open-Meteo Marine (from Dec 2022, null in inlets); MUR | Years | NDBC files for Canadian buoys hold only ~24 h |
| Lake temp | ECCC lake gauges via Wateroffice param 5 (Okanagan, Kalamalka, Nicola, Babine, Williston, Cowichan, Comox…); MUR SST (1 km; big lakes only, snap to nearest lake cell; small lakes like Lac Le Jeune → none) | Gauges 30 days; MUR 2002– (1–2 day lag) | ERDDAP throttles (503) → backoff + cache |
| River level/flow/temp | ECCC `hydrometric-realtime` (434 BC real-time stations); Wateroffice param 5 (302 report temp) | **30 days** | HYDAT lags >1 year |
| Weather | Open-Meteo forecast (92 days back), then archive (1940–) | | ECCC climate-hourly as observed alternative (datetime is local standard time) |
| Sun/moon/solunar | `suncalc` v2 on device | Any time | v2 changed units (degrees) and `utcOffset` |

Sources with lag (MUR, MEDS) need a scheduled retry after upload.

## BC gap-narrowing pass (2026-11-10, direct API checks)
- **Georeferenced lake contours**: `WHSE_FISH.BATH_LAKE_BATHYMETRIC_SP` (ArcGIS `.../bcgw_pub_whse_fish/MapServer/12`, WFS/WMS) = 137 depth polygons, **26 lakes** (Aeroplane, Airline, Bednesti, Charlie, Cunningham, Dall, Fox, Fraser, Frog, Gwillim, Maxhamish, Nakinilerak, Narrow, Obo, Pinchi, Solitary, South Gataga, Stony, Summit, Swan, Tacheeda, Tezzeron, Wahleach, Weissener, Whitefish, Yellowhead). Fields include CONTOUR_DEPTH_M, LAKE_MAX/MEAN_DEPTH_M, volume, survey date. Access Only → use live from the public service (that's what "access" permits) + on-device cache; don't rehost.
- **Cariboo contour linework** `REG_IMAGERY_AND_BASE_MAPS.BATHYMETRIC_LAKES_CAR_LINE` exists (georeferenced, depth in m) but "export is not enabled" and it isn't on any public WFS/WMS/ArcGIS service → needs a GeoBC request.
- **`.e00` sheet vectors** (517 lakes): TIC control points are sheet-local (0,0)-(2000,1425), no real-world coordinates → can't be placed without custom per-sheet shape matching. Not a standard pipeline; skipped.
- **Stocking**: GoFishBC is WordPress + reCAPTCHA with no API; provincial data Access Only → link out / request permission.
- **Fishial coverage of BC**: 40/46 BC freshwater game fish; 56/122 Pacific game fish; **92% of BC lake fish observations** after normalising old spellings (clarki→clarkii, dolomieui→dolomieu). Misses: whitefish/cisco/inconnu, green sturgeon, minnows, sculpins.
- **Species content (BC)**: freshwater game fish 46/46 habitat text, ecology, diet, photo and enwiki; 44/46 spawning; 36/46 ID features. Pacific game fish 122: habitat 122, photo 109, enwiki 109.
- **Lake water temperature**: 47 ECCC real-time BC lake/lake-outlet stations report temperature. **BC EnMoDS** (OGL-BC; `coms.api.gov.bc.ca` gzip CSVs, temperature = codes TEMF/0013, unit degC) has depth-profile samples at 187 lake sites in the last 2 years alone (plus 2–5, 5–10, >10 year files) → per-lake, per-month typical temperature for small lakes with no live source.
- **Topo contours**: BC TRIM contours are Access Only (WMS available) → online overlay only.
