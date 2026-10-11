# Plan: a photo for every place

Give every item in the quiz at least one photo, ideally a few. After an answer
the photo shows what the place looks like. The same photos then work in
reverse: "Var är jag?" shows a photo and the answer is where the camera stood.

Run the collecting from a machine with open network access. The cloud sandbox
cannot reach the sources below.

## What a photo needs

- **A free licence**: CC0, public domain, CC BY or CC BY-SA. Not NC or ND:
  resizing is a derivative. Each photo keeps its author, licence and source
  URL, and the app shows them.
- **A camera point**: where the photographer stood, not just "Malmö". A
  heading is a bonus, not a requirement.
- **Something recognisable**: the place itself, not a portrait, a concert or a
  product shot that happens to be geotagged there.
- **No public art as the subject.** The Swedish Supreme Court ruled in 2016
  (Bildupphovsrätt i Sverige v. Wikimedia Sverige) that freedom of panorama
  does not cover putting photos of public artworks in an online database.
  Buildings and streets are fine. Statues and sculptures whose artist died
  less than 70 years ago are out, even when Commons hosts them.
- **No identifiable person as the subject.** Mapillary blurs faces and plates.

## Sources per kind

Each kind gets the source that fits what its photo has to show.

| Kind | Main source | Fallback | Why |
| --- | --- | --- | --- |
| Landmark (sevärdhet, kyrka, station) | The landmark's Commons category (Wikidata `P373`) and its Wikidata image (`P18`) | Flickr, searched by name, free licence, geotagged | A category is already sorted by subject, so its photos show the landmark rather than something near it |
| Torg, park | Commons category, then Commons photos taken inside it | Mapillary from its edge | A place you stand in, so the camera point is the answer to "Var är jag?" |
| Bridge | Commons category, which shows the bridge from outside | Mapillary from on the bridge | Two questions: "which bridge is this?" and "where am I?" |
| Street | Mapillary, one image each way at the street's middle, plus each crossing with another street in the quiz | Commons photos within 15 m of the line | Coverage follows the streets the cars drive, and the image direction picks both ways |
| Area | Commons photos taken inside the area, picked for typical buildings | Mapillary for the thin outer areas | Commons already covers every area, thinly at the edges |
| Places from `plans/places.md` | Commons or Wikidata when they have one | Mapillary of the frontage from the street | Small places rarely have a category, but are visible from the street |
| Then and now (special) | Malmö Museer via Europeana | | Free and official, but located only by title, so for curated questions |

Leave out Malmö stad's and Visit Malmö's image banks: their terms are for
marketing Malmö, not CC reuse, so each photo would need permission. Leave out
Google Street View, Instagram and Google Maps photos: their terms forbid it.

### What the sources hold

Measured against the 139 items in `quiz.json` (48 areas, 30 landmarks,
6 bridges, 55 streets):

- **Wikimedia Commons.** About 5,400 free, raster, at least 800 px files with
  a camera point inside the districts. Of those at 1,200 px, about 1,400 have
  a heading, all in the `{{Location|…|heading:…}}` wikitext and none in
  structured data. A random sample was about half recognisable places, a
  quarter one Mapillary import burst, and the rest products, events and
  portraits.
  - Areas: all 48 have at least one photo inside, 39 have three or more.
    Bulltofta, Nydala, Toftanäs, Hermodsdal and Mellanheden have one each.
    Gamla Staden has about 1,250 and Västra Hamnen about 840.
  - Landmarks: all 30 have photos within 100 m. 26 have one whose title or
    categories name it; Malmö Stadsteater, Malmö universitet, Triangeln
    station and Hyllie station do not.
  - Bridges: all 6 have photos near them. Öresundsbron and Slottsbron have
    named photos, but those were taken from further away.
  - Streets: 50 of 55 have a photo within 15 m, 40 have three or more.
    Stadiongatan, Stockholmsvägen, Agnesfridsvägen, Dalaplan and Jägersrovägen
    have none. About ten thoroughfares have one or two.
- **Mapillary.** CC BY-SA 4.0, a camera point and a compass angle per image,
  faces and plates blurred. Not yet measured. Needs a free client token
  (mapillary.com → Developers → register an app).
- **Flickr.** The public search page gives 5,522 photos of "malmö" with a free
  licence (4, 5, 7, 9, 10) and a geotag. Mostly modern and much of it already
  imported to Commons. The API needs a free key.
- **Malmö Museer via Europeana.** About 121,000 photos, all public domain or
  CC BY 4.0, served at 800 px. The coordinates are the municipality centroid
  (55.583332, 13.0), so the place comes from the title ("Stortorget /
  Södergatan"). Mostly 1920s–1940s.
- **RAÄ via K-samsök.** About 1,300 Malmö photos of churches, buildings and
  monuments, full resolution, public domain or CC BY. No camera point, but
  about 750 link to a building or monument record with an exact point.
- **Skip DigitaltMuseum**: Malmö Museer is not there, its coordinates are
  nearly all centroids, and the demo key returns ten rows per request.

### Access

- **Commons.** `list=geosearch` with `gsbbox` and `gsnamespace=6` returns at
  most 500 files and does not page, so split the bbox into tiles and split a
  tile again when it returns 500. About 100 requests cover the bbox. Licence,
  author and size come from `prop=imageinfo&iiprop=size|mime|extmetadata`,
  50 titles per request; the heading from the wikitext via `prop=revisions`.
  A landmark's own files: `list=categorymembers&cmtype=file` on its `P373`
  category. Send a User-Agent with a contact URL and keep requests sequential
  and spaced, or the API answers with a rate-limit page instead of JSON.
- **Commons point clusters.** Many files share one point. Some are Flickr
  imports on a generic city point (55.604981, 13.003822), but most are real
  batch uploads (151 cemetery photos, 83 at the arena). Drop the generic
  points, not every cluster.
- **Mapillary.** `https://graph.mapillary.com/images?bbox=…&fields=id,geometry,compass_angle,captured_at,thumb_2048_url,creator`
  with `access_token`. Query a small bbox around each sample point.
- **Flickr.** `flickr.photos.search` with
  `bbox=12.85,55.50,13.15,55.65&license=4,5,7,9,10&has_geo=1&accuracy=16&content_types=0&extras=geo,license,url_l,owner_name,date_taken`.
  A bbox query stops at about 4,000 results, so split it. For a landmark, add
  `text=<name>`.
- **Europeana.** `wskey=api2demo` works. `query=Malmö&reusability=open&media=true&qf=DATA_PROVIDER:"Malmö Museer"`,
  cursor paging. Change `http` to `https` in `edmIsShownBy`.

## Pipeline

All build-time, plain Node, no dependencies, same style as
`scripts/resolve-landmarks.mjs`.

1. **Collect** (`scripts/photos-collect.mjs`): fetch each source into
   `data/cache/photos/<source>.json` (git-ignored), throttled, with the same
   User-Agent and cache pattern as `scripts/lib/nominatim.mjs`. One record per
   photo: source, id, camera point, heading if any, width, height, licence,
   author, source URL, image URL, title, categories.
2. **Suggest** (`scripts/photos-suggest.mjs`): for each item, list candidates
   by its kind's rule above. Inside the polygon for areas and squares, within
   15 m of the line for streets, in the category or named and within 100 m
   for landmarks and bridges. For streets, sample the line's midpoint and the
   crossings with other quiz streets, and take the Mapillary image closest to
   each, one per direction. Drop the generic points, small files, NC/ND, and
   titles that look like products, events or portraits. Write
   `data/cache/photos/candidates.json`.
3. **Pick by hand.** Go through each item's candidates and keep one to three.
   A small local page that shows the candidates per item with keep buttons
   makes this an evening, not a week. Write the picks to `photos/photos.json`
   (committed): item name, then per photo the source, id, camera point,
   heading, licence, author and source URL.
4. **Fetch and resize** (in `scripts/build-quiz.mjs` or its own script):
   download each picked photo, resize to WebP at a phone-friendly width, and
   put it under `build/`. Add each item's photos to `quiz.json` with the
   credit.

## Into the game

- **After an answer.** Show the item's photo with "Foto: <author>, <licence>"
  linking to the source. More than one photo: swipe or step through.
- **"Var är jag?"** A new type in `TYPES` and `MIX` in `app/questions.mjs`.
  Show a photo, the player taps the map, graded by distance to the camera
  point like the other point questions. Any picked photo works, so its pool is
  every item's photos. A variant asks "which street/area is this?" with the
  item as the answer.
- **Credits** in `learn/sources.json`: one line per source, and per photo in
  the app.
- **Offline.** `app/sw.js` decides whether photos are cached. They are larger
  than the rest of the data, so cache on view rather than up front.

## Open questions

- Where the resized photos live: committed under `photos/`, or fetched in the
  build like the map data. At about 100 KB each, 300 photos is 30 MB.
- Whether "Var är jag?" uses only street and area photos, which are taken
  from where people stand, or landmark photos too, which are often taken from
  far away.
- Whether CC BY-SA photos need a page listing all credits, or the credit line
  per photo is enough.

## Done when

- Every item in `quiz.json` has at least one picked photo with its credit.
- The answer screen shows it, on phone and desktop.
- "Var är jag?" is in the daily mix.
- `node --test 'test/*.test.mjs'` passes with nothing skipped.
- This plan is deleted.
