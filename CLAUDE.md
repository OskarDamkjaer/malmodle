# Working in this repo

`BRIEF.md` is what the app is meant to be. `README.md` is for people who
find the repo, `CONTRIBUTING.md` for working on it.

## Commands

```
node --test 'test/*.test.mjs'          # all tests, no runner or config
node --test 'test/live/*.test.mjs'     # the live site, as the deploy checks it
node scripts/build-quiz.mjs            # build/data/quiz.json
node scripts/serve.mjs                 # http://127.0.0.1:8080, with the API
node scripts/serve.mjs --fake 200      # and 200 made-up players today
node scripts/serve.mjs --trickle 10    # and one more every 10 seconds
```

`/dev/crowd.html` on the local server shows the comparison card for many
made-up crowds, and `/dev/week.html` the coming days' sets on the map, with
`?from=` and `?days=`. `serve.mjs` mounts `dev/` itself, so the site build leaves it out.
`plans/crowd.md` holds the card's decisions and what is still open.

Read the skip count, not just the failures. Tests that need `build/`, `data/`
or a browser skip instead of failing, so a green run can be an empty one.

In a web session `.claude/hooks/session-start.sh` builds the style, fetches the
prebuilt map data and app assets, and builds `quiz.json`, so nothing should
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
- `app/geo.mjs`: distances and containment.
- `app/crowd.mjs`: your view of the day's numbers, the polling schedule, and
  the end screen's comparison in words with every threshold it uses.
- `app/crowd-view.js`: the comparison card on the end screen: the chart, its
  hover and keyboard reading, and the waiting and paused states.
- `app/map.js`: map layers, hiding labels, framing.
- `app/themes.mjs`: the styles. Each has a path, UI colours in `app.css` under
  `[data-theme]`, and a basemap palette applied at load. A new style needs all
  three plus its path in `app/sw.js`; `test/themes.test.mjs` checks them.
- `app/app.js`: boot and the screens.
- `scripts/build-quiz.mjs`: curated data plus map data into `quiz.json`.
- `worker/`: the Cloudflare Worker. `results.mjs` checks a posted result
  against the day's set, which `sets.mjs` works out from `quiz.json`, stores
  it in D1 and answers with your first round and the day's numbers.
  `live.mjs` writes the day's numbers to R2 for polling, from a post or the
  cron. `migrations/` is the schema, whose trigger keeps the running count,
  which `scripts/lib/d1.mjs` also loads into `node:sqlite` for `serve.mjs`
  and the tests; `scripts/lib/r2.mjs` stands in for the bucket. Deployed by
  `wrangler.jsonc`. `plans/live.md` has how the numbers travel and what they
  cost.

`questions.mjs`, `daily.mjs`, `crowd.mjs` and `geo.mjs` are pure and tested without a
browser. To add a question type, add it to `TYPES` and give it slots in
`plan` in `daily.mjs`.

## Conventions

- No framework, bundler, `package.json` or dependencies. The browser loads the
  modules as written. Wrangler runs through `npx` in the deploy only.
- No code comments.
- No version history in docs or code: describe what is, not what was.
- UI text is Swedish.
- Phone and desktop matter equally.
- Commits are `Topic: a lowercase clause` with a prose body. The container's
  git identity is not the owner's, so commit with
  `-c user.name=… -c user.email=…` matching `git log`.
