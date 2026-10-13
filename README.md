# Malmödle

A daily quiz for getting to know Malmö: <https://malmodle.se>

Every day there is a new set of places, the same for everyone. You find them on
a map with no labels, or pick the right name from a list, and you score points
for how close you get. Afterwards you see the day's places with a few words
about each, how your score compares with everyone else's that day, can copy
your result to share it, and can open the full map to look around on your own.

It runs in the browser and works offline once loaded. Your browser keeps
today's round, so a reload picks up where you were, and a random id. When a
round ends, its scores are sent with that id to get the day's spread back;
the server stores a hash of the id and the scores, nothing else. It can be
installed on the home screen.

Other styles are kept for trying out at their own addresses:
[Papper](https://malmodle.se/papper/), [Natt](https://malmodle.se/natt/)
and [Klar](https://malmodle.se/klar/). Running locally, a switcher on the
left edge moves between them.

## Running it locally

Needs Node. There is nothing to install.

```
node scripts/fetch-app-assets.mjs    # map library, fonts and icons
node scripts/build-style.mjs         # the map style
node scripts/build-quiz.mjs          # the quiz, from learn/, places/ and the map data
node scripts/serve.mjs               # http://127.0.0.1:8080
```

`serve.mjs` also answers the API, from an SQLite database in memory (or
`--db file`). `--fake 200` fills today with 200 made-up players, to see the
end screen with a crowd.

`build-quiz.mjs` needs the map data in `build/data/` and `data/cache/`. Either
rebuild it (below) or fetch a prebuilt copy with
`node scripts/fetch-dev-assets.mjs`, which needs the `gh` CLI.

## The data

- `learn/core.json`: which places the app asks about.
- `learn/`: bridges, streets, descriptions and sources.
- `places/places.json`: the places the game asks about, by category, with their
  OpenStreetMap ids. `places/longlist.json` is the wider pool they came from,
  and `places/parked.json` holds art kept for a later picture question.
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
node scripts/build-shapes.mjs        # → data/cache/shapes.json, outlines of places and bridges
node scripts/places-shapes.mjs       # → places/shapes.json, an outline for everything in the long list
```

## Tests

```
node --test 'test/*.test.mjs'
```

Tests that need built data or a browser skip when those are missing.

## Hosting

The site and its API run as one Cloudflare Worker (`wrangler.jsonc`): the
built site as static assets, `worker/` for `/api/`, and a D1 database for
the results. Pushing to the `cloudflare` branch builds, tests and deploys it
(`.github/workflows/cloudflare.yml`). `node scripts/build-site.mjs` builds the
same folder locally in `build/site`.

Set up once:

```
npx wrangler d1 create malmodle      # put the id in wrangler.jsonc
```

and give the repository the secrets `CLOUDFLARE_API_TOKEN` (Workers, D1 and
the malmodle.se zone, edit) and `CLOUDFLARE_ACCOUNT_ID`. The domain is
attached by the deploy, so the malmodle.se zone has to be on the same
Cloudflare account.

Pushing to `main` still publishes the site without the API to GitHub Pages
(`.github/workflows/deploy.yml`); there the comparison is left out.

Map data © OpenMapTiles © OpenStreetMap contributors.
