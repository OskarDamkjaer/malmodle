# Live numbers on the end screen

The end screen asks for the day's numbers once, when the round ends or the
finished round is reloaded. The waiting text says the statistics appear
"automatiskt", which only holds once the screen asks again by itself. That is
the next step.

## Before real traffic: a running summary

Every posted result reads every row for its day and set to build the reply,
so the rows read grow with the square of the players. D1 bills rows read, and
the free plan allows 5 million a day:

| Players a day | Rows read |
|---|---|
| 1 000 | about 0.5 million |
| 3 000 | about 4.5 million |
| 10 000 | about 50 million |

Polling multiplies it. The fix is a summary row per day and set, updated on
each insert: the totals histogram, the count of each score per question, and
the player count. A reply then reads one row, plus the totals while fewer
than 50 have played. The same row is what a cached polling answer carries.

## Polling (to build)

- A `GET /api/day?day=…&set=…&player=…` that answers with the same summary as
  the POST, without storing anything.
- The end screen asks every 30 to 60 seconds while it is visible, and stops
  when the tab is hidden or the round is left. `crowdCard().update` already
  morphs from one state to the next, so new players flow into the curve.
- The answer is cached at Cloudflare's edge for about 15 seconds per day and
  set, so a thousand open screens cost about one D1 read every 15 seconds. A
  shared answer cannot hold what is about you, so it carries the day instead:
  the totals histogram, the totals list while the crowd is small, and per
  question a count of each score from 0 to 100. The client works out your
  place, share and per-question counts from that and your own scores.
- `app/sw.js` must leave `/api/` alone, or it serves stale numbers.

## Other options

- **"Senaste kvarten."** A line such as "12 spelade klart senaste kvarten",
  counted from `results.at`. Needs nothing new stored.
- **"Spelar just nu."** Counting people mid-round needs a ping when a round
  starts, which is a new kind of data: the server would learn that someone
  started, not just that they finished.
- **Streaming.** Results pushed as they arrive need a Durable Object that every
  new result goes through and that holds the open connections. With the
  WebSocket hibernation API, idle connections are not billed for waiting.
  Server-sent events from a plain Worker cannot do this, since one invocation
  cannot reach connections held by another.
- **Yesterday as the placeholder.** Before anyone else has played, the blurred
  chart could show yesterday's real spread instead of only your own score.

## Abuse

- A Cloudflare rate-limiting rule on `/api/result` blocks an IP for 10
  seconds after 20 requests in 10 seconds. It stops one machine flooding the
  database. A lower limit would block shared addresses (a class on one school
  network, phones behind one carrier address) without stopping much more.
- Fake scores are still easy: each can carry a new player id. If it becomes a
  problem, Cloudflare Turnstile on the POST, checked by the Worker before
  storing, is the cheap defence.
- Bot Fight Mode stays off: it cannot be tuned on the free plan, and a
  challenge on the app's own `fetch` would silently hide the comparison.

Polling gets most of the feeling for little code; streaming is worth it only if
the numbers moving while you watch turns out to matter.
