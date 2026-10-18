# Live numbers on the end screen

The end screen asks for the day's numbers once, when the round ends or the
finished round is reloaded. The waiting text says the statistics appear
"automatiskt", which only holds once the screen asks again by itself. That is
the next step.

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

Polling gets most of the feeling for little code; streaming is worth it only if
the numbers moving while you watch turns out to matter.
