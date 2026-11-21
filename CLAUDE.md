# Working in this repo

`BRIEF.md` is what the app is meant to be. `README.md` is for people who
find the repo, `CONTRIBUTING.md` for working on it.

## Commands

```
npm install                            # the tools: playwright-core, wrangler
node --test 'test/*.test.mjs'          # all tests, no runner or config
node --test 'test/live/*.test.mjs'     # the live site, as the deploy checks it
node scripts/build-quiz.mjs            # build/data/quiz.json
node scripts/build-quiz.mjs --all --out build/data/quiz-all.json  # and everything outside Grunden, for the builder
node scripts/serve.mjs                 # http://127.0.0.1:8080, with the API
node scripts/serve.mjs --fake 200      # and 200 made-up players today
node scripts/serve.mjs --trickle 10    # and one more every 10 seconds
```

`/dev/crowd.html` on the local server shows the comparison card for many
made-up crowds, `/dev/week.html` the coming days' sets on the map, with
`?from=` and `?days=`, `/dev/frame.html` the game at a phone, tablet or
desktop size, with a button that starts the day over, and `/dev/builder.html`
a day made by hand on a map of everything in the data, core or not, sent in
with suggested changes to what the game asks.
`serve.mjs` mounts `dev/` and the builder's data itself (`DEV_MOUNTS` in
`scripts/lib/site.mjs`), so the site build leaves them out.
`plans/handmade.md` holds the builder's decisions and what is still open.
`plans/crowd.md` holds the card's decisions and what is still open.
`plans/pending.md` holds what waits to join the game, how it was chosen, and
what has to happen before it goes live.
`plans/streets.md` holds how streets are chosen and what is still open.

Read the skip count, not just the failures. Tests that need `build/`, `data/`
or a browser skip instead of failing, so a green run can be an empty one.

In a web session `.claude/hooks/session-start.sh` builds the style, fetches the
prebuilt map data and app assets, and builds `quiz.json` and `quiz-all.json`, so nothing should
skip. Do not run the heavy pipeline there (`build-basemap.sh`,
`build-districts.mjs`, `build-streets.mjs`, `build-shapes.mjs`): it needs
osmium, Java and hosts the sandbox cannot reach.

## Layout

- `app/questions.mjs`: question types. Each one builds itself from the items,
  describes its prompt and what the map shows, and grades an answer.
- `app/daily.mjs`: the day's set, seeded from the local date, and the share text.
  From `SPACED` on, each deck is dealt so a target waits most of a round before
  it comes back, and nothing named on the map is asked within `SHOWN_GAP` days.
  Days before `SPACED` keep the deal they were played with, and a test pins them.
  A name listed under a date in `since` in `learn/core.json` joins on that
  date: every day before it is dealt and built as if it were not there, and
  the deck it joins is dealt anew from then, with the new names spread among
  the rest and what was asked lately at the back. Decks that gain nothing carry on.
  Names and places in `learn/pending.json` are checked by the build, shown in the
  builder and kept out of `quiz.json` until they move into `core.json` with a date.
- `app/geo.mjs`: distances and containment.
- `app/crowd.mjs`: your view of the day's numbers, the polling schedule, and
  the end screen's comparison in words with every threshold it uses.
- `app/crowd-view.js`: the comparison card on the end screen: the chart, its
  hover and keyboard reading, and the waiting and paused states.
- `app/confetti.js`: the confetti for a score of 1000, loaded only when it is
  thrown.
- `app/map.js`: map layers, hiding labels, framing, and the pin a guess is
  set with.
- `app/palette.mjs`: the basemap palette and the answer colours, applied at
  load. The UI colours are in `app.css`. `test/palette.test.mjs` checks that
  every coloured basemap layer is recoloured.
- `app/app.js`: boot and the screens.
- `app/sw.js`: the offline worker. Each version answers only from its own
  cache, so a page never mixes versions. A new one waits until the page asks
  for it, which `app.js` does before the first answer of a page load or while
  the page is hidden, and then reloads; a reload resumes the saved day. Taking
over from a worker without that handshake, it reloads the old pages itself. The
  build stamps its cache names, and `serve.mjs` stamps them per request.
- `scripts/build-quiz.mjs`: curated data plus map data into `quiz.json`, with
  the long list's other places as `decoys` for "Vad ligger här?".
- `worker/`: the Cloudflare Worker. `results.mjs` checks a posted result
  against the day's set, which `sets.mjs` works out from `quiz.json`, stores
  it in D1 and answers with your first round and the day's numbers.
  `live.mjs` writes the day's numbers to R2 for polling, from a post or the
  cron. `handmade.mjs` stores a day sent from the builder under the same
  player key as the sender's results, a few a day per player.
  `migrations/` is the schema, whose trigger keeps the running count,
  which `scripts/lib/d1.mjs` also loads into `node:sqlite` for `serve.mjs`
  and the tests; `scripts/lib/r2.mjs` stands in for the bucket. Deployed by
  `wrangler.jsonc`. `plans/live.md` has how the numbers travel and what they
  cost.

`questions.mjs`, `daily.mjs`, `crowd.mjs` and `geo.mjs` are pure and tested without a
browser, and so is `dev/handmade.mjs`, the builder's questions, what a usual
day looks like, and what it sends:
`test/site.mjs` resolves the site's absolute imports the way `serve.mjs` mounts
them. To add a question type, add it to `TYPES` and give it slots in
`plan` in `daily.mjs`.

## Conventions

- No framework, bundler or runtime dependencies. The browser loads the modules
  as written, and nothing under `app/` or `worker/` imports from `node_modules`.
  `package.json` holds the tools only, pinned exactly: `playwright-core` and
  `wrangler`. A new one needs a reason the standard library cannot meet.
- No code comments.
- No version history in docs or code: describe what is, not what was.
- UI text is Swedish.
- Phone and desktop matter equally.
- `main` takes changes only through a pull request whose Check passes, so
  work on a branch and open one.
- Commits are `Topic: a lowercase clause` with a prose body. The container's
  git identity is not the owner's, so commit with
  `-c user.name=… -c user.email=…` matching `git log`.
