# Releasing a batch of names

Names wait in `learn/pending.json` until they join the game on a date. This
plan is for making that a routine: one command, a check that cannot be
forgotten, and nothing a player notices except new questions.

## What holds already

- A name under a date in `since` in `learn/core.json` joins on that date.
  Every day before it is dealt as if the name were not there
  (`app/daily.mjs`).
- `learn/played.json` pins the set id of every day played. A test fails if
  the data or the deal changes one, or if a date in `since`, `changes` or
  `learn/days.json` falls on or before the last pinned day
  (`test/data.test.mjs`). `node scripts/played.mjs` pins up to today.
- The build refuses a place under `since`, since the decoys of "Vad ligger
  här?" do not follow dates yet (`scripts/build-quiz.mjs`).
- A description or a link can change without rebuilding the map data
  (`scripts/lib/dev-assets.mjs`).

## What is missing

Three things can still go wrong, and each is a person forgetting something:

- **A date too close.** A date that is tomorrow, or past by the time the
  deploy lands, changes a day people are playing. A browser still on the old
  version on the date deals the old set, and its result is refused, so the
  further ahead the date, the fewer that happens to.
- **Played days not pinned.** `played.json` protects only the days someone
  has pinned. If it ends three weeks ago, a date two weeks ago passes.
- **The move itself.** A batch is 95 names cut from one file and pasted into
  two places in another.

## To build

### 1. `scripts/join.mjs`

```
node scripts/join.mjs areas streets bridges        # every waiting name of those kinds, in 7 days
node scripts/join.mjs streets --on 2026-12-08      # on that date, if it is far enough ahead
node scripts/join.mjs --names "Kroksbäck, Hamngatan"   # only these
node scripts/join.mjs areas --dry                  # say what would happen, write nothing
```

In order, stopping at the first thing that is wrong:

1. Run what `scripts/played.mjs` does, so the pin reaches today. Move its
   body into `scripts/lib/played.mjs` and call it from both.
2. Pick the names: the given sections of `learn/pending.json`, or `--names`.
   `landmarks` is refused with the reason the build gives.
3. Pick the date: `--on`, or today plus `LEAD`. Refuse one closer than
   `SOONEST` days. Put both in `scripts/lib/made.mjs` beside the made days'
   `LEAD`, which is the same idea: `LEAD = 7`, `SOONEST = 3`.
4. Refuse a name without a description, or one whose description is not
   `verified`. Find where each kind keeps both in `plans/descriptions.md`.
5. Move the names: out of their section in `pending.json`, onto the end of
   the same section in `core.json`, and under the date in `since`, after any
   names already there. Keep both files formatted as they are; write a
   function for each file's shape, as `written` in `scripts/lib/made.mjs`
   does for `days.json`, and test that reading and writing an untouched file
   gives the same bytes.
6. Build the quiz to a temporary file, and from it print: how many names
   join each deck, that every pinned day still has its set id, the first
   date each new name is asked over the next 60 days, and the names not
   asked within those 60.
7. Say what is left to do: rebuild, run the tests, commit, open a pull
   request, and merge it at least `SOONEST` days before the date.

`--dry` does everything but write the three files.

### 2. A date check in the Check

A test cannot compare a date with today: it would pass on the day it was
written and fail a month later. So the comparison is with `main`.

`scripts/check-dates.mjs`, run as a step of `.github/workflows/check.yml`
after the quiz is built, and by hand:

- Reads `learn/core.json`, `places/places.json` and `learn/days.json` from
  the working tree and from `origin/main` (`git show origin/main:path`; the
  workflow's checkout needs `fetch-depth: 0` or a fetch of `main`).
- Collects every date: the keys of `since`, of each place's `changes`, and
  of `days`. A date is new if `main` does not have it, or has it with other
  names, another change or another day under it.
- Fails if a new date is closer than `SOONEST` days to today, naming the
  date and the file.
- Fails if a new date is on or before the last day in `learn/played.json`.
  The data test checks that for every date; this says it sooner and names
  what is new.
- Fails if `learn/played.json` ends more than `SOONEST` days before today
  while there is a new date, saying to run `node scripts/played.mjs`.

Put what it decides in `scripts/lib/dates.mjs` as a pure function of the two
versions of the three files, the pin's last day and today, and test that:
no new date passes, a new date far ahead passes, one too close fails, one
changed under an old key counts as new, and a stale pin fails only when
there is a new date. The script itself only reads the files and prints.

The deploy runs the same step. A pull request that sat for a week after its
Check passed is stopped there, before anything is live, and the fix is to
move the date.

### 3. Docs

- `CONTRIBUTING.md`: "going live" becomes the command, with the manual steps
  it replaces removed.
- `CLAUDE.md`: the command in the list, and `scripts/lib/dates.mjs` beside
  `scripts/lib/made.mjs`.
- `plans/pending.md` and `plans/streets.md`: their "going live" sections
  point here.

## Not in this plan

- **Places.** They need decoys that follow dates and a way for a new place
  to be kept apart from a live one (`plans/pending.md`). Each changes the
  deal's inputs and is its own plan.
- **Konditori Katarina as a chain** (`plans/chains.md`). It goes under
  `changes`, which the date check covers, but `join.mjs` does not write it.
- **Refreshing the map data.** A scheduled workflow that rebuilds from fresh
  OpenStreetMap data, runs the tests against the pin and opens a pull
  request. Shapes move and scores with them; sets do not.
- **`handmade.mjs take`.** It already refuses a date closer than `LEAD`. It
  could call the pin first, as `join.mjs` does.

## Done when

- `node scripts/join.mjs areas streets bridges --dry` on a clean checkout
  prints 95 names, a date a week ahead and every pinned day unchanged, and
  writes nothing.
- The same without `--dry` leaves a tree where the build passes, every test
  passes with none skipped, and `git diff --stat` touches only
  `learn/core.json`, `learn/pending.json` and `learn/played.json`.
- With that tree, `node scripts/check-dates.mjs` passes, and fails when the
  date in `since` is edited to tomorrow.
- Nothing under `app/` or `worker/` has changed.

## The first use

The 46 areas, 37 streets and 12 bridges. The work above is one pull request
with no date in it. The batch is a second one, made by running the command,
and its date is the owner's to choose: the pull request is opened, not
merged.

## Open

- Whether `SOONEST` should be 3 days or more. The offline worker updates
  before the first answer of a page load, so only a tab left open across the
  date, or a phone offline since before the deploy, is still old.
- Whether a batch should be spread over several dates. 95 names at once
  deals three decks anew on one day; in the simulation 92 are asked within
  40 days.
