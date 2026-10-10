# Working in this repo

`BRIEF.md` is what the app is meant to be. `README.md` is for people.

## Commands

```
node --test 'test/*.test.mjs'          # all tests, no runner or config
node scripts/build-quiz.mjs            # build/data/quiz.json
node scripts/serve.mjs                 # http://127.0.0.1:8080
```

Read the skip count, not just the failures. Tests that need `build/`, `data/`
or a browser skip instead of failing, so a green run can be an empty one.

In a web session `.claude/hooks/session-start.sh` builds the style, fetches the
prebuilt map data and app assets, and builds `quiz.json`, so nothing should
skip. Do not run the heavy pipeline there (`build-basemap.sh`,
`build-districts.mjs`, `build-streets.mjs`): it needs osmium, Java and hosts
the sandbox cannot reach.

## Layout

- `app/questions.mjs`: question types. Each one builds itself from the items,
  describes its prompt and what the map shows, and grades an answer.
- `app/daily.mjs`: the day's set, seeded from the local date, and the share text.
- `app/geo.mjs`: distances and containment.
- `app/map.js`: map layers, hiding labels, framing.
- `app/themes.mjs`: the styles. Each has a path, UI colours in `app.css` under
  `[data-theme]`, and a basemap palette applied at load. A new style needs all
  three plus its path in `app/sw.js`; `test/themes.test.mjs` checks them.
- `app/app.js`: boot and the screens.
- `scripts/build-quiz.mjs`: curated data plus map data into `quiz.json`.

`questions.mjs`, `daily.mjs` and `geo.mjs` are pure and tested without a
browser. To add a question type, add it to `TYPES` and to `MIX`.

## Conventions

- No framework, bundler, `package.json` or dependencies. The browser loads the
  modules as written.
- No code comments.
- No version history in docs or code: describe what is, not what was.
- UI text is Swedish.
- Phone and desktop matter equally.
- Commits are `Topic: a lowercase clause` with a prose body. The container's
  git identity is not the owner's, so commit with
  `-c user.name=… -c user.email=…` matching `git log`.
