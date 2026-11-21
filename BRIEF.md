# Brief

The agreed shape of the app. Written as guidance for whoever works on it next;
the README is the short public version.

## Purpose

Get familiar with Malmö through a short daily quiz.

## The daily set

- One set a day, the same for everyone. It is derived from today's date in the
  browser's local time, through a hash. No day number is shown.
- Ten questions across three groups: areas, streets and places (bridges count
  as places). Each day draws a split of 3–5 areas, 1–3 streets and 3–5
  places; 4–2–4 is the most common. The first question always points at an
  area.
- Each kind is dealt from a deck: its items shuffled by a hash of the kind and
  the round, so everything comes up once per round before anything repeats.
  Restaurants have their own deck, dealt a little less than one a day.
- Places that sit together (a park and the theatre inside it, a beach and its
  bath house) are never asked on the same day.
- Only names in Grunden (`learn/core.json`, as it is) are used by the app. The
  full curated data stays in the repo and in the build.
- Grunden grows by date. A name waits as pending, out of the game, until its
  description is checked, then joins with a date. Every day before that date
  stays exactly as it was.
- The set can be replayed. Replaying gives the same set, never a new one.

## Questions

Pointing is the most common. Per kind:

- Areas: "Var ligger X?" 1–3, "Vad ligger här?" 1–2, "Direkt söder om" 0–1.
- Streets: "Var ligger X?" 1–3, "Vad ligger här?" 0–2, "Från A till B" 0–1.
- Places: "Var ligger X?", with "Vad ligger här?" for about a quarter to a
  third of them.

- **Peka ut.** "Var ligger X?" A tap sets a pin, and "Gissa" with ✕ beside it
  comes up in a panel at the bottom, which the result and "Nästa" then replace
  where it stands. A tap elsewhere or a drag moves the pin, ✕ takes it away, and a
  pin set behind a panel brings the map along so it shows. Holding the finger still
  on the map guesses there at once, with a ring that shows only once the press
  is clearly a hold. The first question of a round says so at the bottom. One
  guess, no second try. Scored 0–100 on distance. Afterwards: the pin stays
  where you guessed, how far off you were, and what you actually tapped if it
  was something else.
- **Var ligger en X?** A chain, a place with several branches such as
  Systembolaget or McDonald's, is pointed at like any place, and its nearest
  branch counts. It is asked within one of the ten stadsdelar that holds one
  to three of its branches, "Var ligger ett Systembolag i Hyllie?", outlined
  and named on the map, and then only the branches inside it count. A chain
  with up to four branches is asked across the city half the time instead,
  and so is one that no stadsdel fits. Afterwards every branch that counted is
  marked in green, with how many there are, and a pin at a branch outside the
  stadsdel is told so. A chain is never asked or offered in "Vad ligger här?",
  and never names the end of a street in "Från A till B".
- **Vad ligger här?** Something is marked on the map in green, unnamed;
  pick its name from a list of nearby things of the same kind, never one that holds it or sits
  inside it. A place is offered among places of its own category, so a church
  among churches, drawing on places from the long list the game does not ask
  about. Its category is named in the prompt only when every option shares it.
- **Direkt söder om.** "Vilket område ligger direkt söder om X?" Pick one of
  four. X is outlined and named, and the area asked about is marked in
  green, unnamed; the decoys are its other neighbours and nearby areas,
  never one that also lies on that side. Asked for any of the four directions,
  only where exactly one area borders X on that side.
- **Från A till B.** "Vilken gata går från A till B?" Pick one of four. A and
  B are the squares, parks or buildings at the street's ends, or the areas
  they lie in; no decoy also joins them, and a pair belongs to one street.

Every question scores 0–100. A day scores out of 1000. A tap in "Var ligger
X?" scores full marks inside the answer, or within 100 m of a place known only
by a point, and loses about two thirds of what is left with every 900 m past
that. Where many of a kind lie close together in the centre, so that a tap
there would earn a lot without knowing which one, a miss costs more: 500 m for
restaurants and cafés, 700 m for streets, bridges and museums.

A wrong pick in "Vad ligger här?", "Direkt söder om" or "Från A till B" scores
up to 35 by how close it lies to the answer, measured as the average distance
from along the pick to the answer, and nothing below 5. A place a few dozen metres off scores near 30
and one 300 m off a few points; an area that borders the answer about 17,
in the centre or the outskirts. Areas and places with an outline are measured
from whichever of the two lies closer to the other, in step with their size,
so a small beach beside a large headland scores either way round; a
street running alongside more than one that only crosses it. A wrong pick
never leaves the red band.

## The map

- No labels on the map while a question is open. Pan and zoom are allowed.
  On a phone the map is zoomed with two fingers, with no + and − buttons.
- The panels stay where they are from question to result. On a desktop too
  narrow for the place card beside them, they sit left of centre from the
  start.
- Always north-up.
- From the keyboard, tabbing to the map shows a crosshair in its middle and a
  line on how to use it: arrows pan, + and − zoom, Enter answers at the
  crosshair. After a keyboard answer the next map question takes focus by
  itself. Nothing shows for a mouse or a finger.

## After the set

- An end screen with the score, today's names, how each went, and the
  descriptions. Descriptions are only shown here.
- A round that scores 1000 ends in confetti, once 1000 is the number on
  screen: the big score when it has counted up, or your line on the chart when
  it has settled. A replay can earn it too. Returning to a finished day does
  not, and with reduced motion there is none.
- Beside the score, how the day went for everyone. A headline names your
  place when it is near the top (in the top quarter and the first ten, or in
  the top half percent), and otherwise which part of the field you landed in.
  Under it, a softened curve of the day's totals with a line at yours, a bar
  split at your score, and the share of the others you beat. Hovering, tapping
  or the arrow keys read off any score. One line under the chart picks out the
  rarest thing you did well: a question few others got fully right, or one
  where few were closer than you, or else the question where you beat the
  most others. Until ten have played, the chart is a blur
  of the scores so far, with a note on how many more are needed, how many
  others finished in the last quarter hour, and a link to share the game.
  The numbers update by themselves while the screen is open, then pause with
  a button to update. The first finished round of the day is the one that counts;
  a replay shows that one. Offline, or with no answer from the server, the
  section is left out and nothing else changes.
- A button that copies the result as text (score and one square per question),
  like other daily games. If the set is replayed, the latest result is shared.
- A way to open the full labelled map for free practice. Tapping a thing says
  what it is; today's names are marked.
- No memory between days. The browser keeps only today's daily round and a
  random player id: a
  reload resumes it at the next question, or returns to the end screen once it
  is finished. A replay in progress does not replace the finished result until
  it ends. Practice is not kept, and an earlier day's round is ignored and then
  replaced.
- On a phone, after a round, the end screen offers to put the app on the home
  screen: the browser's own install prompt where there is one, the steps on
  iPhone. It is worked out from the browser each time, not remembered, and
  not shown once installed.

## Style

One style, Tidning, for everyone. There is no picker: reading this map is part
of the challenge.

## Constraints

- Static files and one small API on Cloudflare: the end screen sends the
  day's scores under the random player id and gets back the day's spread.
  While it is open it asks again for the spread, which is one file for
  everyone, and stops after half an hour.
  The server keeps a hash of the id, never the id. No accounts, no
  analytics. Accounts and leaderboards are sketched in `plans/accounts.md`.
- Offline PWA.
- No framework, no bundler, nothing the site depends on at run time.
- The UI is in Swedish.
- Phone and desktop matter equally.

## Repo

- Keep the curated sources and the build that turns them into app data.
- No code comments. Short README for humans. Focused CLAUDE.md with no counts.
  No decision log.
- Docs and code describe the app as it is.
