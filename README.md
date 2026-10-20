# Malmödle

A daily map quiz about Malmö: <https://malmodle.se>

Ten questions a day, the same for everyone, on a map of Malmö with the names
taken off. [malmoe.damk.eu](https://malmoe.damk.eu) has the same game without
the day's statistics.

## How it's built

- No framework, bundler or runtime dependencies. The browser loads the modules
  as written, and the game logic is tested with `node --test`. `package.json`
  holds only the tools for working on it: a browser driver and Wrangler.
- Its own map: vector tiles of Malmö cut from OpenStreetMap, served with the
  site, about 10 MB.
- The day's set comes from the date, so everyone gets the same one without
  asking a server. It works offline and installs on the home screen.
- A small Cloudflare Worker collects the day's scores for the comparison at
  the end.

## What is stored

Your browser keeps today's round and a random id. When a round ends, its
scores are sent with that id. The server stores a hash of the id, the day's
set, the scores and when the round ended, nothing else. Everyone can read the
day's numbers: how many scored each total and how each question went, and
while fewer than 10 have played, when each of them finished. No accounts,
cookies or analytics.

## Running it

Needs Node, nothing to install:

```
node scripts/fetch-app-assets.mjs
node scripts/build-style.mjs
node scripts/build-quiz.mjs
node scripts/serve.mjs               # http://127.0.0.1:8080
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the data, the map pipeline and the
hosting.

## Found a mistake?

Use "Rapportera ett fel" in the game, or open an issue. The places and their
descriptions are plain JSON in `learn/` and `places/`.

Map data © OpenMapTiles © OpenStreetMap contributors.
