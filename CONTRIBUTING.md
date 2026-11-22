# Working on Malmödle

How to run it, where the data lives, how the map is built and how the site
is hosted. [`BRIEF.md`](BRIEF.md) is what the game is meant to be, and
[`plans/`](plans) holds the reasoning behind the end screen and the backend.

## Running it locally

Needs Node 22 or later. `npm install` fetches the tools: `playwright-core` for
the browser tests and `wrangler` for the Worker. The site itself needs neither.

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
that fills up as you click, and <http://127.0.0.1:8080/dev/week.html>, which
lays the coming days' sets out in a strip above the map, with each answer and
its text, draws the options and the points a tap or a near option gives on
the map, and flags what looks wrong. <http://127.0.0.1:8080/dev/frame.html>
shows the game at a phone, tablet or desktop size, with a button that starts
the day over. `dev/` is never part of the built site.

<http://127.0.0.1:8080/bygg/> is the day builder, which the site also serves at
malmodle.se/bygg. The end screen links to it once the player has unlocked it,
with a full score, fifteen days in a row, or a place in the top percent of a
day with at least a hundred players (`UNLOCK` in `app/crowd.mjs`), and says
why on the day it happens. A narrow screen is asked to open it on a computer.
It makes a day by hand: pick each
question's target and type, and the game builds the rest the way it always
does. The map beside the questions shows everything in the data, what
the game can ask and what it never does, a table says how the day compares
with the days the game deals, and the day can be played through and
kept as a link. Anything on the map can go into the day, which suggests it for
the game, and anything can be marked as belonging in the game or not, or as
looking wrong. A finished day of ten is sent to the Worker with the
suggestions, the builder's name if they like, and the player id the game
keeps in the same browser. The Worker stores it in the `handmade` table under
the same player key as that browser's results, and a day that is no good is
deleted there. The builder's data is
`node scripts/build-quiz.mjs --all --out build/data/quiz-all.json`, which the
site build needs too. The builder stays out of the offline worker and out of
the name of the game's code cache, so changing it never sends players a new
version.

```
node scripts/handmade.mjs                   # the days sent in, newest first, each with a link to it in the builder
node scripts/handmade.mjs take 12           # play day 12 on the first date from a week ahead that fits
node scripts/handmade.mjs take 12 2027-01-05  # or on that date, if it fits
node scripts/handmade.mjs --db file.db      # the same from serve.mjs's database instead of D1
```

Reading D1 goes through `wrangler`, so it needs a login to the Cloudflare
account. A day can be played once its targets are all in `core.json` by that
date. A date fits when the day builds with the types it was made with, none of
its targets has been asked within a week (an area) or two (a street or a
place) before it, and the game asks each question as the builder showed it.
What it shows on the map may be asked on the days around it. `take` writes it into `learn/days.json` under
that date with the builder's name, and the game plays it in place of the day
it would deal, says on the end screen who made it, and deals every deck anew
from the next day, with what was asked lately at the back. The first question
and the end screen name who made it. Commit it a week
or more ahead, like a date in `since`.

`build-quiz.mjs` needs the map data in `build/data/` and `data/cache/`. Either
rebuild it (below) or fetch a prebuilt copy with
`node scripts/fetch-dev-assets.mjs`, which needs the `gh` CLI.

## The data

- `learn/core.json`: which places the app asks about.
- `learn/pending.json`: what is on its way in, kept apart so nothing waiting
  touches the files the game and the map are built from. `areas`, `streets`
  and `bridges` list names the curated data already has, and `landmarks` holds
  whole place entries, shaped like those in `places/places.json`. The build
  checks every one, gives them to the day builder, and leaves them out of the
  game, so descriptions can be written and fact-checked first. A name goes live
  with `scripts/join.mjs`, below. A waiting place stays a decoy as before,
  since decoys follow only the places the game asks. Once it goes live it
  leaves the decoys and adds its own around it, which changes "Vad ligger
  här?" on days before its date, so for now only areas, streets and bridges
  can join on a date.
- `learn/played.json`: the set id of every day already played. A test deals
  each of them from the built data and fails if one differs, and if a date in
  `since`, `changes` or `days.json` falls on or before the last.
  `join.mjs` pins the days up to today before it dates anything, and
  `node scripts/played.mjs` does it on its own.
- `learn/sources.json`: a link for a name whose entry has none, and
  `unlinked`, the names shown without "Läs mer". A link stays only when the
  page is about exactly that thing: its own Swedish Wikipedia article, its
  page on malmo.se, or the place's own site. A page about a neighbour, a
  list, a guide or one that cannot be fetched means no link. English
  Wikipedia will do where there is no Swedish article. A place without a
  link gets one to Google Maps instead, and a street, area or bridge none.
  The entry keeps its `source`, which says where the description came from.
- `learn/`: bridges, streets, descriptions and sources, and `regions.json`,
  the delområden in each of the ten stadsdelar. The build merges them into the
  outlines a chain is asked within.
- `places/places.json`: the places the game asks about, by category, with their
  OpenStreetMap ids. `places/longlist.json` is the wider pool they came from,
  and `places/parked.json` holds art kept for a later picture question.
  `build-quiz.mjs` takes the long list's places that the game does not ask
  about as decoys for "Vad ligger här?", the ten nearest of each category
  around every place it asks about, and keeps out the kinds and names in
  `DECOY_KINDS` and `DECOY_SKIP`. A chain lists its branches under
  `branches`, each with `lat` and `lon`, in the order of its `osm` ids, and
  says how it is asked under `asked` ("ett Systembolag"). Only branches inside
  Malmö's stadsdelar belong there. A place the game already asks can change
  on a date: `changes` maps a date to the fields that change then, among
  `asked`, `osm`, `lat`, `lon`, `branches`, `district`, `description` and
  `source`, with `null` to drop one. Every day before the date sees the place
  as it was, and the deal carries on as if nothing changed; what decides how a
  place is dealt, its name, category and `apart`, cannot change.
- `learn/days.json`: days made by hand, under the date they are played, with
  the name to credit and each question's target, type and seed.
- `config/bbox.json`: the part of the world the map covers.

Everything is hand-edited. `build-quiz.mjs --all` builds every place rather than
only the ones in `core.json`.

## Going live

```
node scripts/join.mjs areas streets bridges          # every waiting name of those kinds, a week from today
node scripts/join.mjs streets --on 2026-12-08        # on that date, if it is far enough ahead
node scripts/join.mjs --names "Kroksbäck, Hamngatan" # only these
node scripts/join.mjs areas --dry                    # say what would happen, write nothing
```

`join.mjs` pins the days played up to today, picks the names from
`learn/pending.json`, and refuses a place, a name whose description is
missing or not `verified`, and a date less than `SOONEST` days ahead
(`scripts/lib/made.mjs`). It moves the names to the end of their section in
`learn/core.json` and under the date in `since`, builds the quiz from that,
and stops if a day already played would change. It says how many names join
each deck and when each is first asked over the 60 days from the date. Then
rebuild the quiz, run the tests, and merge the pull request at least
`SOONEST` days before the date.

The Check runs `node scripts/check-dates.mjs`, which compares the dates in
`since`, in places' `changes` and in `learn/days.json` with `main`. A date
that is new, changed or removed fails if it is less than `SOONEST` days away
or on or before the last day in `learn/played.json`, and so does a pin that
ends more than `SOONEST` days back. The deploy runs it against what `main`
was before the push, so a pull request that sat after its Check passed is
stopped before anything is live, and the fix is to move the date. Run it by
hand with `--base` for another commit to compare with.

## Rebuilding the map data

Needs `osmium` and Java 21. The deploy workflow runs the same steps on GitHub
and publishes the result as a release. The release is named after a hash of
everything these steps read: the scripts below, the modules they import, and
the files they open, such as `places/places.json` and `config/bbox.json`
(`scripts/lib/dev-assets.mjs` finds them by the paths written in the scripts, so
an input opened through a computed path has to be written out somewhere in the
script to count). A JSON file counts without its `description`, `source`,
`verified` and `why`, which the steps never read, so a new text or link
rebuilds nothing. Changing anything else rebuilds the map
data on the next deploy, and `fetch-dev-assets.mjs` fetches the new release
once it is published. Until then the Check of a pull request that changes an
input fails at the fetch: when the change cannot alter what the steps build,
publish the current release's files under the new name.

Refresh the data every few months, and before asking people to build days.
OpenStreetMap keeps changing, and the day builder tells people to add what is
missing there. `node scripts/places-collect.mjs --refresh` fetches the long
list anew; committing the changed `places/longlist.json` makes the next deploy
rebuild the map data from a fresh OpenStreetMap extract. Locally,
`build-basemap.sh` downloads a new extract once the one it has is a month old.

```
scripts/build-basemap.sh             # OpenStreetMap → data/cache/malmo.pmtiles
node scripts/build-districts.mjs     # → build/data/districts.geojson
node scripts/build-streets.mjs       # → data/cache/streets.json
node scripts/build-shapes.mjs        # → data/cache/shapes.json, outlines and street addresses of places and bridges
node scripts/places-shapes.mjs       # → places/shapes.json, an outline for everything in the long list
```

## Tests

```
npm test                             # node --test 'test/*.test.mjs'
npm run test:live                    # node --test 'test/live/*.test.mjs'
```

Tests that need built data or a browser skip when those are missing. The browser
is driven by `playwright-core` from `npm install`, using its own Chromium or
else the installed Chrome.

The deploy runs the first set before it releases anything, and stops if a
single test skips. Once both sites are out, it runs the second set against
them: it waits until each serves the build just released, answers all but the
last question on phone and desktop, boots every style, opens the site offline
after one visit, and checks the API turns away a broken result. It never
finishes a day, so it never posts a result or counts as a player; posting is
covered by the browser tests before the release, against the same Worker code
on SQLite. Each check gets a second try in a fresh browser, so a passing blip on
the host does not fail the deploy; the first failure stays in the log. A
failure there means fixing forward; nothing is rolled back. `SITES` picks the sites (malmodle.se by
default) and `BUILD` the built site to compare with.

## Hosting

The site and its API run as one Cloudflare Worker (`wrangler.jsonc`): the
built site as static assets, `worker/` for `/api/`, a D1 database for
the results, and an R2 bucket at data.malmodle.se for the day's numbers the
end screen polls. Setting up the bucket is in `plans/live.md`. Pushing to
`main` builds and tests the site once, then migrates the database and deploys
the Worker, and publishes the same build to GitHub Pages at malmoe.damk.eu
(`.github/workflows/deploy.yml`). `node scripts/build-site.mjs` builds the
same folder locally in `build/site`. Addresses the site no longer has, listed in `MOVED` in
`scripts/lib/site.mjs`, get a page that sends the visitor to the start page
with the same hash, since GitHub Pages cannot redirect.

A player gets a new build the next time they open the site. The service worker
answers from the cache of the version the page started with, and fetches and
installs the new one in the background; the page switches to it and reloads if
nothing has been answered since it loaded, or else once it is hidden. Locally,
`serve.mjs` names the version after the files it serves, so an edit arrives
the same way.

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

`.github/workflows/watch.yml` checks the live site every half hour: that the
page and `quiz.json` load and that the Worker answers a bad post with 400. It
writes nothing. A failed run is emailed to whoever last changed its schedule,
and GitHub turns it off after 60 days without a push.
