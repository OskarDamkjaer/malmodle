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
- **Recent enough to look like today.** 2021 or later where there is one,
  2018 or later otherwise, nothing older. Before 2018 the cars look dated and
  Hyllie, Västra Hamnen, Nyhavn and Dalaplan have changed. Krogar and kaféer
  need 2021 or later: signs, terraces and tenants change.

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
| Krog, kafé | Commons for the classics that have a category | Mapillary of the frontage, 2021 or later, facing the entrance | Their own photos and Google's are not free; the frontage is what people recognise |
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
  faces and plates blurred. Needs a free client token (mapillary.com →
  Developers → register an app, Read scope only) in `MAPILLARY_TOKEN`, from
  the environment or `.env`. Within 40 m of the point: 93% of quiz streets,
  85% of torg and 81% of krogar have a 2021 or later image. Parks, stadiums
  and large buildings look worse from their centroid, but 36 of 44 such
  places have 2021 or later images within 150 m, so sample around the
  outline. Nothing at all near Jägersro and Limhamns kalkbrott; only 2014 to
  2020 at Ribersborgs Kallbadhus. A bbox much over 300 m in the centre fails
  with "reduce the amount of data", and the same small query can come back
  empty once and full the next time.
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

All build-time, plain Node, no dependencies. One kind at a time, each
reviewed by hand before the next.

1. **Candidates per kind.** One script per kind writes
   `data/cache/photos/candidates/<kind>.json` (git-ignored): per item its
   sample points, and per point the candidate photos with id, camera point,
   heading, date and author. Source responses are cached under
   `data/cache/photos/<source>/`.
   - Streets: `node scripts/photos-streets.mjs [name]`. Samples the line's
     midpoint and its crossings with other quiz streets (merged within 60 m).
     At each point it takes Mapillary images within 25 m, on the street
     (12 m from the line), not panoramas, 2018 or later, facing along the
     street within 30°, up to three per direction from different sequences,
     2021 or later first. The rules are in `scripts/lib/photos.mjs` and tested.
   - Landmarks, bridges, buildings, scener, museer, kyrkor: Commons category
     and Wikidata image, Flickr and Mapillary as fallback.
   - Parks, bad, idrott: Commons inside, then Mapillary sampled around the
     outline facing in.
   - Krogar, kaféer: Commons, then Mapillary of the frontage facing the
     entrance, 2021 or later only.
   - Areas: Commons photos inside the polygon.
   - Streets with no usable Mapillary photo: `node scripts/photos-commons.mjs
     --only <street>,<street> gata`, Commons photos within 15 m of the line.
2. **Vision pre-review.** Sonnet agents look at each street candidate at
   640 px and write `data/cache/photos/verdicts/streets.json` (git-ignored):
   per Mapillary id whether it is sharp, how the road is framed (centred,
   offset, crossing, sideways, blocked, other), a score from 1 to 5 and a
   short note. Agents must pair each verdict with the path they read, not the
   order of results, or ids slip. A photo is a suggestion when it is sharp,
   centred, scores 4 or more and has at least 60 m of the street ahead. Of
   the 54 streets, 51 have a suggestion; bike-basket and dashboard shots are
   the most common reason a photo fails. Deep-pass streets are capped at 60
   reviewed photos each.
3. **Pick by hand.** `node scripts/photos-review.mjs` serves a page on
   http://127.0.0.1:8081 that shows one item at a time: a sketch with the
   sample points and where each photo was taken and which way it faces, then
   the candidates per point and direction. Click to keep, ⤢ to see it large,
   Klar (Enter) for the next unreviewed item, arrows to step. Thumbnails are
   fetched on view and cached. Picks are saved on every click to
   `photos/photos.json` (committed): per item key (`street:Södergatan`) the
   kept photos with source, id, camera point, heading, date, licence, author
   and source URL, and whether the item is reviewed. A reviewed item with no
   photo needs another source.
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
