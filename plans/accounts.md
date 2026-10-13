# Accounts and leaderboards

Not built. What the score comparison already decides for them, and the shape
they are meant to take.

## What is there

- Each browser makes a random secret, `malmodle-player` in localStorage, and
  sends it with the day's scores. The server stores only its SHA-256, so the
  `results` table never holds anything that can be replayed as the player.
- One row per player and day; the first finished round counts.

## Accounts

An account is a player row with a name and a picture, not a new identity:

- `players (id, name, emoji, drawing, created)`, keyed by the same hash as
  `results.player`. Making an account keeps the results already played.
- Moving to another device: the app shows the secret as a short code
  (base32 in groups, like `K7QM-2XPA-…`). Typing it in on the other device
  makes that browser the same player. This is the "device code"; it is a
  bearer key, so it is shown on request only and can be rotated, which writes
  a new hash and moves the rows.
- Google or Apple sign-in later links an external id to the player row
  (`logins (provider, subject, player)`), so a lost device can be recovered.
  The secret stays the key the app uses day to day.

## Leaderboards

The flow: "Skapa en topplista" → make an account if there is none (name, then
an emoji or a small drawing) → get a link to send to people.

- `boards (id, name, owner, created)` and `members (board, player, joined)`.
- The link is `/l/<token>`, a random token per board. Opening it on the end
  screen joins the board after an account exists. The owner can make a new
  link, which stops the old one.
- A board shows the day's totals of its members and a running sum over a
  week or a month, from `results`. Nothing per question is shared on a board
  beyond the squares.

## Open

- Whether a drawing is stored as a small PNG in R2 or as strokes in D1.
- Whether names are unique per board only (simplest) or globally.
- Abuse: the API trusts the scores it is sent. Leaderboards among friends
  can live with that; a public list could not.
