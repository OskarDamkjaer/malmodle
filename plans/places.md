# Plan: places people know

Find well-known restaurants, pubs, bars, venues and cultural landmarks to add
to the quiz. Build a ranked list of candidates from several independent
sources, then pick the final set by hand.

Run this from a machine with open network access. The cloud sandbox cannot
reach the sources below.

## What we are looking for

A place belongs in the quiz if a Malmö resident would know where it is, would
use it to give directions ("vid X"), and it will still be there in a few years.
Popularity on its own is not the bar: a new restaurant with lots of hype
fails the "still there" test.

Two tracks, because they have different signals:

- **Krogar och scener**: restaurants, pubs, bars, cafés, nightclubs, music
  venues, food halls. Main signal: showing up in several independent guides.
- **Kulturella landmärken**: public art, buildings, monuments, plaques,
  squares. Main signal: how many people photograph them.

## Sources

Keep only names, coordinates and which source listed them. Never copy guide
text into the repo. Descriptions are written by us from sources, as for the
current landmarks.

| Source | Track | Gives | How |
| --- | --- | --- | --- |
| White Guide | krogar | listed + level | site, Malmö filter |
| Michelin Guide | krogar | listed + distinction | site, Malmö page |
| Wikivoyage (sv, en) | both | listed under Äta, Dricka, Se, Göra | MediaWiki API, wikitext |
| Visit Malmö | both | listed | site |
| Wikipedia / Wikidata | both | has article, sitelinks, inception (P571), dissolved (P576), Commons category (P373) | SPARQL, items within the bbox |
| Wikipedia page views | both | monthly views, last 12 months | Wikimedia REST pageviews API |
| Wikimedia Commons | both | geotagged files within 50 m | API `list=geosearch`, `gsnamespace=6` |
| OpenStreetMap | both | candidates, `wikidata`, `start_date`, `brand`, edit count | Overpass, bbox from `config/bbox.json` |
| Overture Places | krogar | `confidence` that the place still exists | GeoParquet on S3, via the DuckDB CLI |
| Malmö stad open data | kultur | public art, culture venues, if published | check what exists first |

Skip Google, Tripadvisor and other commercial map APIs: their terms forbid
storing the data, which is what a static build does.

If a guide's site renders with JavaScript and cannot be fetched, copy the
names by hand into its source file. A one-off copy of ~50 names is fine.

## Pipeline

All build-time, plain Node, no dependencies, same style as
`scripts/resolve-landmarks.mjs`. DuckDB is an external CLI like osmium, only
needed for the Overture step, and that step is optional.

1. **Collect** (`scripts/places-collect.mjs`): fetch each source into
   `data/cache/places/<source>.json` (git-ignored), throttled, with the same
   User-Agent and cache pattern as `scripts/lib/nominatim.mjs`.
2. **Normalise and match**: OSM is the spine. Match each source's entries to
   an OSM object by Wikidata id first, then by normalised name (lowercase,
   strip "restaurang", "bar", "&", accents compared loosely) within 150 m.
   Unmatched entries are listed, not dropped, so they can be fixed by hand.
3. **Signals per candidate**:
   - `sources`: which independent lists include it (guides, Wikivoyage,
     Visit Malmö, Wikipedia article)
   - `photos`: Commons files within 50 m, plus files in its Commons category
   - `views`: Wikipedia page views over the last 12 months
   - `since`: earliest of Wikidata inception, OSM `start_date`, first OSM
     version with this name
   - `open`: not dissolved in Wikidata, not `disused:`/`was:` in OSM, Overture
     confidence if available
   - `chain`: has `brand` or `brand:wikidata` in OSM
4. **Rank** (`scripts/places-rank.mjs`): drop chains and closed places. Sort
   by number of sources, then photos, then views, then age. Keep the scoring
   readable in one function so the weights are easy to argue with.
5. **Write** `places/candidates.json` (committed): name, track, coordinates,
   OSM id, every signal and source. Commit it, so the choices can be reviewed
   and re-run later.
6. **Pick by hand.** Go through the top ~100 per track and keep the ones that
   pass the bar above.

Photo density is the main signal for the cultural track, and a tie-breaker for
krogar. Expect it to favour old buildings, art and venues over ordinary
restaurants.

## Into the game

Decide before step 6:

- **Kinds.** Either add to `landmarks/landmarks.json`, or add new kinds (for
  example `krog` and `konst`). New kinds give fairer "Vad är det här?" decoys
  (a pub among pubs, not among churches), and the mix in `app/daily.mjs`
  already keeps rare kinds from showing up every day. A new kind needs:
  `TYPES`/`MIX` in `app/questions.mjs` (including `TOLERANCE` and `REACH`),
  `scripts/build-quiz.mjs`, entries in `learn/core.json`, `learn/about.json`
  and `learn/sources.json`, an icon, and tests.
- **Size.** Start with 20–40 per kind. Fewer good ones beat many weak ones.

Each picked place gets a sourced Swedish description, like the current
landmarks. If no source supports a description, the place probably isn't
well known enough.

## Open questions

- Who it is for: places most Malmö residents know, or places a newcomer
  should learn. This plan assumes the first.
- One new kind or two, or folded into landmarks.
- Whether places in Lund, Lomma and Burlöv inside the bbox count.

## Done when

- `places/candidates.json` exists with both tracks and all signals filled
  where the source has data.
- The top of each list looks right to someone who lives in Malmö. If it does
  not, adjust the scoring before picking.
- The picked places are in the game data with descriptions and sources, and
  `node --test 'test/*.test.mjs'` passes with nothing skipped.
- This plan is deleted.
