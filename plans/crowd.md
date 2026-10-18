# The day's comparison

How the end screen's comparison card is meant to work, and why. The rules live
in `app/crowd.mjs`, the card in `app/crowd-view.js`, and
`/dev/crowd.html` on the local server shows it for many made-up crowds.

## Decisions

- **One chart.** A softened line of the day's totals in fixed 20-point steps.
  The smoothing is monotone: the line passes through every count and never
  adds a peak or dip. Fixed steps, not ones that adapt to the crowd, so a small
  crowd looks as rough as it is.
- **You are the line, the curve is everyone else.** Your own score is left out
  of the curve, so being best tints all of it.
- **Each share counts everyone but the person it is about.** Your share is of
  the others; a share read on another player's tick is of everyone but them;
  a share read between ticks is of everyone. Shares are rounded down, so they
  never flatter.
- **Exact while small.** Under 50 players the bar shows a tick for each
  total, and readings snap to them and count exactly. Above that, readings
  are taken from 10-point bins. Your own place is exact at any size.
- **Ten before anything.** Until ten have played the card shows the scores so
  far as a blur, counts down, says how many others finished in the last
  quarter hour, and offers a link to share the game. The card keeps its size
  in every state, including the highlight's space.
- **Paused, not hidden.** When polling stops, the chart fades and says since
  when, with a button to update. Before ten have played the same line sits in
  the waiting text.
- **A place only near the top.** The headline names your place in the top
  quarter of the first ten, or in the top half percent however many have
  played. Otherwise it names your part of the field, from "Bland de allra
  bästa" to "Understa fjärdedelen". Your place is always readable by pointing
  at your own line.
- **One fact under the chart, about you.** The rarest question you did well
  on, measured as the share who scored at least as much, if you scored 40 or
  more and at most 30 % matched you. Otherwise the question where you beat the
  most others. Otherwise a tip to try practice. Ties count in your favour in
  the wording.
- **Written for reading.** Numbers up to twelve as words, "idag" as one word
  as in the rest of the app, percentages with a space before "%".

## Open

- **The day's hardest question.** The day's numbers carry every score per
  question, so the share who got each fully right is at hand. A candidate for
  a fact of its own.
- **Very large crowds.** At 20 000 players the top half percent is "Plats 100";
  a cap around 50 may read better.
- **Made-up crowds.** The dev page's tap distances are a guess; real days will
  show how lumpy totals are.
- **Styles.** Only Tidning has been looked at. The others are not shown to
  players.

## Hosting

- malmodle.se runs the Worker `malmodle` with the D1 database `malmodle`. It
  is deployed by hand from a local checkout:

  ```
  node scripts/build-site.mjs
  npx wrangler d1 migrations apply malmodle --remote   # when the schema changes
  npx wrangler deploy
  ```

- On the zone: Always Use HTTPS is on, and the rate limit described in
  `plans/live.md`. For www, a proxied `A` record for `www` (to `192.0.2.1`)
  and the "Redirect from WWW to root" redirect rule are still to add. A
  redirect in the Worker would miss most requests, since static files are
  served without running it.
- The site will deploy from `main` to Cloudflare at malmodle.se, with the API.
- The end screen asks the API and works either way. While it asks, and when
  the card shows, the verdict and the squares are hidden. Without an API, as
  on the GitHub Pages copy, they stay, with a link to malmodle.se that carries
  the round in `#runda=`: the day, the set and each answer, as base64url JSON.
  There it becomes the day's finished round, unless that device already has
  one, and is posted like any other. Scores are easy to fake anyway, so the
  code only keeps the link tidy, not secret.
