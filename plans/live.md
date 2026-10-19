# Live numbers on the end screen

The end screen keeps the day's numbers fresh by itself: new players flow into
the curve, and while fewer than ten have played the waiting text says how many
others finished in the last quarter hour.

## How the numbers travel

- **A running summary.** D1 keeps one row per day and set in `days`: the
  player count, the count of each exact total, and per question the count of
  each score. A trigger on `results` updates it inside the insert, so a replay
  or a repeated post never counts twice. Nothing reads every row.
- **Two rows written a post.** Measured on D1: a post writes the result and
  updates the `days` row, two rows written however many have played.
  `results` is a `WITHOUT ROWID` table keyed on `(day, player)` with no other
  index, so no index entry is written beside the row. The first post of a day
  and set writes two more, the new `days` row and its key. A repeated post
  writes nothing.
- **One round trip a post.** The Worker sends a post's statements to D1 as
  one batch, which runs them in order as one transaction: the insert, your
  first round, the claim on the file write, and the `days` row. The last
  three find the set by your first round, so a replay from another set
  answers with the one you played.
- **One file for everyone.** The day's numbers are the same for every player,
  so they are a file, `<day>/<set>.json` in the R2 bucket `malmodle`,
  served at `data.malmodle.se` through Cloudflare's cache for 15 seconds.
  Polls never run the Worker: a cache hit is free, and R2 is read about once
  per 15 seconds per data centre.
- **Your view on the client.** The post answers with your first round, the
  day's numbers and the file's address. `summarize(day, you)` in
  `app/crowd.mjs` works out your place, share and per-question counts.
- **One post per player and day.** The device keeps the answer to its first
  post under `malmodle-posted`, with how many players it saw. A reload or a
  replay that day reads the file instead of posting, and the chart draws
  replays as thin lines from the totals in the save, which never leave the
  device. It posts again only without a kept answer, or when the file is
  missing or has fewer players than the post saw and so may not count you
  yet; the server keeps the first round anyway. A post that fails on the
  network or with a server error is tried once more after three seconds;
  after that the end screen keeps its verdict, and the next visit posts.
- **Writing the file, at most every 15 seconds.** A post claims the write in
  the `days` row only if the file is behind and was written more than 15
  seconds ago. A cron trigger every minute writes any file still behind, so
  the last results of a quiet spell show within a minute. That caps the
  writes at about four a minute per day and set, whatever the crowd.
- **The last quarter hour.** While fewer than ten have played, the trigger
  appends each finish time to `finished` in the `days` row, and the file lists
  them. The client counts the others in the last 15 minutes against its own
  clock. From ten players on the list stops growing and the file says `null`.
  The ten in the trigger is `FEWEST_TO_RANK` in `app/crowd.mjs`, and a test
  keeps the two the same.

## Polling

- Every 20 seconds for the first five minutes, then every one, two and five
  minutes, and after half an hour it stops.
- It stops while the tab is hidden, and asks once when it is shown again.
- Stopped, the chart fades and says "Automatisk uppdatering pausad" with the
  time and an "Uppdatera" button that asks again and restarts the schedule.
  Before ten have played it sits in the waiting text instead.
- An answer with fewer players than the one shown is an older copy and is
  ignored.

## Cost

Checked against Cloudflare's pricing in October 2026. Per player and day: one
Worker request and two D1 rows written. Claiming the file write adds one row,
at most four a minute per day and set, under 6 000 a day. Free limits: 100 000 Worker
requests and 100 000 D1 rows written a day, R2 1 million writes and 10 million
reads a month.

| | Free plan holds | All of Malmö, 360 000 a day |
|---|---|---|
| Worker | about 98 000 rounds a day, after the cron | 11 million a month, in the $5 plan's 10 million plus about $0.30 |
| D1 | about 47 000 rounds a day | 22 million rows written a month, in the $5 plan's 50 million |
| R2 writes | about 175 000 a month at the cap | the same |
| R2 reads | a few thousand a day | the same, with the cache rule |
| Polls | free | free |

Without the cache rule on `data.malmodle.se`, Cloudflare does not cache
`.json`, and every poll is an R2 read: at all of Malmö about $65 a month.

## Setup

- R2 bucket `malmodle`, Standard storage, with the custom domain
  `data.malmodle.se`.
- A CORS policy on the bucket allowing `GET` and `HEAD` from
  `https://malmodle.se`.
- A cache rule on the zone: hostname `data.malmodle.se`, eligible for cache,
  edge and browser TTL from the origin's `Cache-Control`, and a cache key that
  ignores the query string, so `?anything` cannot bypass the cache into R2.
- `wrangler.jsonc` binds the bucket as `LIVE`, sets `LIVE_URL`, runs the
  cron every minute, and turns on Workers Logs. Errors and failed requests
  show there by themselves; the cron logs each file it found behind, so a
  set id from before a mid-day deploy shows up as a line of its own.

## Options

- **Senaste kvarten always.** The file could carry the finish times of the
  last quarter hour at any size. That needs a `(day, set_id, at)` index on
  `results` to read them by, one more row written a post.
- **"Spelar just nu."** A ping after the first question, dropped if the round
  is not finished within ten minutes. A new kind of data: the server would
  learn that someone started.
- **Streaming.** A Durable Object holding WebSockets with the hibernation API
  would push each result as it arrives. Worth it only if polling feels slow.
- **Yesterday as the placeholder.** The `days` rows are kept, so the blurred
  chart could show yesterday's spread before anyone else has played.

## Abuse

- The Worker only takes the day's own set, which it works out from
  `quiz.json` in its static assets the way the browser does, or a set that
  already has a `days` row that day, so players who loaded the site before a
  deploy that changed the deck still count. A made-up set id is refused with
  409 before anything is written, so it cannot add rows, files or cron work.
- A Cloudflare rate-limiting rule on `/api/result` blocks an IP for 10
  seconds after 20 requests in 10 seconds. It stops one machine flooding the
  database. A lower limit would block shared addresses (a class on one school
  network, phones behind one carrier address) without stopping much more.
- Fake scores are still easy: each can carry a new player id. If it becomes a
  problem, Cloudflare Turnstile on the POST, checked by the Worker before
  storing, is the cheap defence.
- Bot Fight Mode stays off: it cannot be tuned on the free plan, and a
  challenge on the app's own `fetch` would silently hide the comparison.
