---
name: review-days
description: Take the days players sent in from the day builder into the game, one per Friday, and open a pull request the owner only has to look over. Use when the owner asks about submitted, sent-in or handmade days, or types /review-days.
---

# Review the days sent in

The owner wants to look, not to choose. Do everything up to a pull request,
show them the page, and change what they ask for. Nothing is live until
they merge.

## 1. Fetch

Work from an up-to-date, clean `main`, on a branch `days/sent-<ids>`.
Reading D1 needs a wrangler login (`npx wrangler whoami`); a web session
has none, so stop there and say so.

```
node scripts/handmade.mjs review
```

It lists every day that waits and every day already scheduled ahead, and
writes `build/review.json`. Nothing writes to D1.

## 2. Bring in what the days ask for

A day that says `not in the game yet` asks names the game lacks. Those
join first, in a pull request of their own, since a name must be in the
game before a day can ask it:

- An area, street or bridge the map data has goes into its section of
  `learn/pending.json` by name, with a description in `learn/about.json`,
  `learn/streets.json` or `learn/bridges.json` marked `verified`.
- A place comes from `places/longlist.json` under the same name, with its
  `category`, `osm` ids split into a list, `lat`, `lon`, a `why`, and a
  `description` and `source`. `node scripts/facts-collect.mjs --only
  "<names>"` gathers what there is to write from; look the rest up on the
  web. `plans/descriptions.md` has the style. A missing fact is left out,
  never guessed.
- `node scripts/join.mjs areas streets landmarks` dates them a week ahead.
  New places change the map data's inputs: run
  `node scripts/build-shapes.mjs`, and publish the release the Check asks
  for as `CONTRIBUTING.md` describes. Ask the owner before publishing.

The days that need them wait until that pull request is merged.

## 3. Take every day that can be played

```
node scripts/handmade.mjs take all
```

Each day gets the first free Friday that fits, a week ahead or more, in
the order they were sent, except that one sender does not get two Fridays
in a row while someone else's day waits. A day that cannot be played yet is left waiting
and named. `take` pins the played days and writes nothing if a played day
or a day before the first date would change.

Then:

```
node scripts/handmade.mjs review
node --test 'test/*.test.mjs'
node scripts/check-dates.mjs
```

Read the skip count as well as the failures.

## 4. Open the pull request and show the page

Commit `learn/days.json` and `learn/played.json` as
`Data: <n> days made by hand from <first date>` with a prose body naming
each day's number, sender and date. Push and open the pull request.

Start `node scripts/serve.mjs` in the background unless something already
answers on port 8080, and give the owner
http://127.0.0.1:8080/dev/review.html with the pull request link and the
date it must be merged by (three days before the first day).

Say what a script cannot, a line per day and only where there is
something: a name that looks like someone else's full name, a brand or an
insult, since it is shown to every player that day; a remark that asks for
something; a day that is all one corner of town or all one kind; several
days from one player, or one from someone who has barely played.

## 5. Change what the owner asks for

They answer in words. Each change is an edit to the branch, then
`review`, the tests and a push:

- **Another date:** move the day's entry to that date in `learn/days.json`.
- **Another question:** change that slot's `target`, `type` or `seed` in
  the day's entry. The build refuses a target that is not in the game or a
  type it cannot be asked as, and `/dev/week.html?from=<date>` shows the
  day as it will be played.
- **Another name, or none:** change `by`, or set it to `null`.
- **Not this day:** remove its entry from `learn/days.json` and run
  `node scripts/handmade.mjs decline <id>`, which lists it in
  `learn/declined.json` so it does not come back.
- **A suggestion** (`notes`) never changes the day. Acting on one is a
  change to the game's data through `learn/pending.json`; dropping one
  needs nothing.

## Report

The pull request link, each day with its Friday, the merge-by date, the
days left waiting and why, and anything flagged in step 4.
