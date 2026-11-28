---
name: review-days
description: Review the days players sent in from the day builder, suggest a date for each, and open a pull request with the ones the owner accepts. Use when the owner asks about submitted, sent-in or handmade days, or types /review-days.
---

# Review the days sent in

The tooling does the checking; your part is judgment and the pull request.
Nothing here is live until the owner merges the pull request.

## 1. Fetch and plan

Work from an up-to-date, clean `main`. Reading D1 needs a wrangler login
(`npx wrangler whoami`); a web session has none, so stop there and say so.

```
node scripts/handmade.mjs review
```

It reads every row of `handmade` and looks up each sender's played days by
key, never scanning `results`. It rebuilds the quiz data, suggests a date
for each waiting day (the first that fits from a week ahead, at least
`APART` days from every other made day), prints them, and writes
`build/review.json`. Days already in `learn/days.json` (by `sent`) are left
out.

Start `node scripts/serve.mjs` in the background unless something already
answers on port 8080, and point the owner at
http://127.0.0.1:8080/dev/review.html.

## 2. Say what a script cannot

Read `build/review.json` and give the owner a few lines per day, only where
there is something to say:

- The name is shown to every player that day ("Dagens frågor av …"). Flag
  one that looks like someone else's full name, a brand, an insult, or
  anything you would not put on the front page.
- The remark: does it ask for something, or explain a choice?
- A day that is all one corner of town, all one kind, or many from the
  same player (`same`) or from someone who has barely played (`played`).
- Suggestions (`notes`) do not change the day. Worth noting which look
  right; acting on them is a separate change through `learn/pending.json`.

Do not decide for the owner. They choose on the page.

## 3. Take the accepted days

The page's footer gives the commands, for example
`node scripts/handmade.mjs take 3@2026-12-05 7@2026-12-12` and
`node scripts/handmade.mjs decline 4`. The owner pastes them, or says what to
take in words.

```
git switch -c days/sent-<ids>
node scripts/handmade.mjs take <id>[@YYYY-MM-DD] ...
```

`take` pins the played days, checks every date together, and writes
nothing unless all of them fit and no played day or day before the first
date changes. If it refuses one, report why and offer another date or
leaving that day out. A day without a date gets the first that fits.

Then:

```
node --test 'test/*.test.mjs'
node scripts/check-dates.mjs
```

Read the skip count as well as the failures. A failure unrelated to
`learn/days.json` (a flaky browser test, say) is reported, not fixed here.

## 4. Open the pull request

Commit `learn/days.json`, `learn/played.json` and `learn/declined.json` as
`Data: <n> days made by hand from <first date>` with a prose body naming
each day's number, sender and date, using the identity in `git log`.
Push and open the pull request with `gh pr create`. Tell the owner it must
be merged by the date `take` printed (three days before the first day).

## 5. Decline

`decline` writes the numbers into `learn/declined.json` and changes
nothing in D1. Commit it with the taken days, or on its own if nothing was
taken. Nothing in this workflow writes to D1.

## Report

The pull request link, each day with its date, the merge-by date, and
anything you flagged in step 2.
