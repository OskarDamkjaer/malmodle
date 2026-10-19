# Working on Malmödle

How to run it, where the data lives, how the map is built and how the site
is hosted. [`BRIEF.md`](BRIEF.md) is what the game is meant to be, and
[`plans/`](plans) holds the reasoning behind the end screen and the backend.

## Running it locally

Needs Node. There is nothing to install.

```
node scripts/fetch-app-assets.mjs    # map library, fonts and icons
node scripts/build-style.mjs         # the map style
node scripts/build-quiz.mjs          # the quiz, from learn/, places/ and the map data
node scripts/serve.mjs               # http://127.0.0.1:8080
```

`serve.mjs` also answers the API, from an SQLite database in memory (or
`--db file`), and the day's numbers under `/live/` in place of the R2 bucket.
`--fake 200` fills today with 200 made-up players, to see the end screen with
a crowd, and `--trickle 10` adds one more every 10 seconds, to see it update. It also serves <http://127.0.0.1:8080/dev/crowd.html>,
which draws the end screen's comparison for a few dozen made-up crowds, and one
that fills up as you click. `dev/` is never part of the built site.

`build-quiz.mjs` needs the map data in `build/data/` and `data/cache/`. Either
rebuild it (below) or fetch a prebuilt copy with
`node scripts/fetch-dev-assets.mjs`, which needs the `gh` CLI.

## Styles

Tidning is the style players see. Others are kept for trying out at their own
paths: [Papper](https://malmodle.se/papper/), [Natt](https://malmodle.se/natt/)
and [Klar](https://malmodle.se/klar/).

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
built site as static assets, `worker/` for `/api/`, a D1 database for
the results, and an R2 bucket at data.malmodle.se for the day's numbers the
end screen polls. Setting up the bucket is in `plans/live.md`. Pushing to
`main` builds and tests the site once, then migrates the database and deploys
the Worker, and publishes the same build to GitHub Pages at malmoe.damk.eu
(`.github/workflows/deploy.yml`). `node scripts/build-site.mjs` builds the
same folder locally in `build/site`.

Set up once:

```
npx wrangler d1 create malmodle      # put the id in wrangler.jsonc
```

and give the repository the secrets `CLOUDFLARE_API_TOKEN` (Workers, D1, R2 and
the malmodle.se zone, edit) and `CLOUDFLARE_ACCOUNT_ID`. The domain is
attached by the deploy, so the malmodle.se zone has to be on the same
Cloudflare account.

On GitHub Pages there is no API: the post is refused, and the end screen
leaves the comparison out.
