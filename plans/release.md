# Releasing a batch of names

Names wait in `learn/pending.json` until they join the game on a date. This
plan makes that a routine: one command, a check that cannot be forgotten,
and nothing a player notices except new questions.

## What it guards against

- **A date too close.** A date that is tomorrow, or past by the time the
  deploy lands, changes a day people are playing. A browser still on the old
  version on the date deals the old set, and its result is refused, so the
  further ahead the date, the fewer that happens to.
- **Played days not pinned.** `learn/played.json` protects only the days
  someone has pinned. If it ends three weeks ago, a date two weeks ago passes.
- **The move itself.** A batch is dozens of names cut from one file and
  pasted into two places in another.

## What holds

- A name under a date in `since` in `learn/core.json` joins on that date.
  Every day before it is dealt as if the name were not there
  (`app/daily.mjs`).
- `learn/played.json` pins the set id of every day played. A test fails if
  the data or the deal changes one, or if a date in `since`, `changes` or
  `learn/days.json` falls on or before the last pinned day
  (`test/data.test.mjs`). `node scripts/played.mjs` pins up to today, through
  `scripts/lib/played.mjs`.
- The decoys of "Vad ligger här?" follow the dates too, so a place joins on
  a date like any name and the days before keep their decoys
  (`scripts/build-quiz.mjs`).
- A description or a link can change without rebuilding the map data
  (`scripts/lib/dev-assets.mjs`).

## The command

```
node scripts/join.mjs areas streets bridges        # every waiting name of those kinds, in 7 days
node scripts/join.mjs landmarks --on 2026-12-08    # every waiting place, on that date, if it is far enough ahead
node scripts/join.mjs --names "Kroksbäck, Hamngatan"   # only these
node scripts/join.mjs areas --dry                  # say what would happen, write nothing
```

In order, stopping at the first thing that is wrong:

1. Build the quiz from the data as it is, and pin the days played up to
   today with it.
2. Pick the names: the given sections of `learn/pending.json`, `--names`, or
   both.
3. Pick the date: `--on`, or today plus `LEAD`. Refuse one closer than
   `SOONEST` days. Both are in `scripts/lib/made.mjs`, beside the made days'
   use of `LEAD`: `LEAD = 7`, `SOONEST = 3`.
4. Refuse a name without a description, or one whose description is not
   `verified`, where `plans/descriptions.md` says each kind keeps them.
5. Move the names: out of their section in `pending.json`, onto the end of
   the same section in `core.json`, and under the date in `since`, after any
   names already there. A place's whole entry goes to the end of
   `places/places.json`. `scripts/lib/join.mjs` writes each file in its own
   shape, `core.json` wrapped at 79 columns, and a test reads and writes the
   three untouched files and gets the same bytes.
6. Build the quiz from the moved files, through `--core`, `--pending` and
   `--places`, to a temporary folder. Stop if a pinned day's set id changes,
   or if a day from today until the date asks anything else than it does
   now, its options included. Print how many
   names join each deck, that every pinned day keeps its set, the first date
   each new name is asked over the 60 days from the date, and the names not
   asked within those 60.
7. Write `core.json`, `pending.json`, `places.json` if a place moved, and
   `played.json`, unless `--dry`, and say what is left to do: rebuild, run
   the tests, commit, open a pull request, and merge it at least `SOONEST`
   days before the date, and for places, that the map data needs a release
   for its new inputs.

## The date check

A test cannot compare a date with today: it would pass on the day it was
written and fail a month later. So the comparison is with `main`.

`scripts/check-dates.mjs` reads `learn/core.json`, `places/places.json` and
`learn/days.json` from the working tree and from `--base` (`origin/main` by
default), and collects every date: the keys of `since`, of each place's
`changes`, and of `days`. A date counts as new if the base does not have it,
has it with other names, another change or another day under it, or has it
and the tree does not. It fails:

- if a new date is closer than `SOONEST` days to today, naming the date and
  the file;
- if a new date is on or before the last day in `learn/played.json`, which
  the data test checks for every date, but this says it sooner and names
  what is new;
- if `learn/played.json` ends more than `SOONEST` days before today while
  there is a new date, saying to run `node scripts/played.mjs`.

What it decides is `scripts/lib/dates.mjs`, a pure function of the two
versions of the three files, the pin's last day and today, tested in
`test/release.test.mjs`. The script only reads the files and prints.

The Check runs it after the quiz is built, against `main` fetched one commit
deep: the whole history is hundreds of megabytes. The deploy runs it against
`github.event.before`, what `main` was before the push, so a pull request
that sat for a week after its Check passed is stopped there, before anything
is live, and the fix is to move the date. A deploy started by hand skips it:
there is no push to compare with, and redeploying what is already out must
not fail on its own dates.

## Not covered

- **Refreshing the map data.** A scheduled workflow that rebuilds from fresh
  OpenStreetMap data, runs the tests against the pin and opens a pull
  request. Shapes move and scores with them; sets do not.

## The first use

The 46 areas, 37 streets and 12 bridges, in a pull request of their own made
by running the command. Its date is the owner's to choose: the pull request
is opened, not merged.

## Open

- Whether `SOONEST` should be 3 days or more. The offline worker updates
  before the first answer of a page load, so only a tab left open across the
  date, or a phone offline since before the deploy, is still old.
- Whether a batch should be spread over several dates. 95 names at once
  deals three decks anew on one day. Joining on 2026-11-29, 44 are asked in
  the first two weeks, 88 in the first 40 days, and the last on day 46.
