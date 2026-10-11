# Lär dig Malmö

A daily quiz for getting to know Malmö: <https://malmoe.damk.eu>

Every day there is a new set of places, the same for everyone. You find them on
a map with no labels, or pick the right name from a list, and you score points
for how close you get. Afterwards you see the day's places with a few words
about each, can copy your result to share it, and can open the full map to look
around on your own.

It runs in the browser, works offline once loaded, and stores nothing about
you.

Other styles are kept for trying out at their own addresses:
[Papper](https://malmoe.damk.eu/papper/), [Natt](https://malmoe.damk.eu/natt/)
and [Klar](https://malmoe.damk.eu/klar/). Running locally, a switcher on the
left edge moves between them.

## Running it locally

Needs Node. There is nothing to install.

```
node scripts/fetch-app-assets.mjs    # map library, fonts and icons
node scripts/build-style.mjs         # the map style
node scripts/build-quiz.mjs          # the places, from learn/, landmarks/ and the map data
node scripts/serve.mjs               # http://127.0.0.1:8080
```

`build-quiz.mjs` needs the map data in `build/data/` and `data/cache/`. Either
rebuild it (below) or fetch a prebuilt copy with
`node scripts/fetch-dev-assets.mjs`, which needs the `gh` CLI.

## The data

- `learn/core.json`: which places the app asks about.
- `learn/`: bridges, streets, descriptions and sources.
- `landmarks/landmarks.json`: sights and parks.
- `config/bbox.json`: the part of the world the map covers.

Everything is hand-edited. `build-quiz.mjs --all` builds every place rather than
only the ones in `core.json`.

## Rebuilding the map data

Needs `osmium` and Java 21. The deploy workflow runs the same steps on GitHub
whenever the release pinned in `fetch-dev-assets.mjs` does not exist yet, and
publishes it, so bumping that tag is how the map data gets rebuilt.

```
scripts/build-basemap.sh             # OpenStreetMap → data/cache/malmo.pmtiles
node scripts/build-districts.mjs     # → build/data/districts.geojson
node scripts/build-streets.mjs       # → data/cache/streets.json
node scripts/resolve-landmarks.mjs   # fills in missing coordinates in landmarks.json
```

## Tests

```
node --test 'test/*.test.mjs'
```

Tests that need built data or a browser skip when those are missing.

## Hosting

Pushing to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). `node scripts/build-site.mjs` builds the same
folder locally in `build/site`.

Map data © OpenMapTiles © OpenStreetMap contributors.
