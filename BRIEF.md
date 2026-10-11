# Brief

The agreed shape of the app. Written as guidance for whoever works on it next;
the README is the short public version.

## Purpose

Get familiar with Malmö through a short daily quiz.

## The daily set

- One set a day, the same for everyone. It is derived from today's date in the
  browser's local time, through a hash. No day number is shown.
- Ten questions, mixed across the kinds in the data. The mix follows how much
  there is of each kind, so rare kinds (bridges, sights) do not appear every day.
- Only names in Grunden (`learn/core.json`, as it is) are used by the app. The
  full curated data stays in the repo and in the build.
- The set can be replayed. Replaying gives the same set, never a new one.

## Questions

The code supports many question types. Pointing is the vast majority, and
every day asks to point at at least two areas; then "what is this", then one
of the rest.

- **Peka ut.** "Var ligger X?" One tap, no second try. Scored 0–100 on distance.
  A tap on another street scores at most 70, however close it is.
  Afterwards: how far off you were, and what you actually tapped if it was
  something else.
- **Vad är det här?** Something is highlighted on the map; pick its name from a
  list of nearby things of the same kind.
- **Närmast.** "Vilken ligger närmast X?" Pick one of four.
- **Direkt söder om.** "Vilket område ligger direkt söder om X?" Pick one of
  four. X is highlighted; the decoys are its other neighbours and nearby areas,
  never one that also lies on that side. Asked for any of the four directions,
  only where exactly one area borders X on that side.

Every question scores 0–100. A day scores out of 1000. A wrong pick in "Vad är
det här?" or "Direkt söder om" scores 25 when it is close to the answer: an
area that borders it, a street that meets it, or a place within 300 m.
"Närmast" is right or wrong.

## The map

- No labels on the map while a question is open. Pan and zoom are allowed.
- Always north-up.

## After the set

- An end screen with the score, today's names, how each went, and the
  descriptions. Descriptions are only shown here.
- A button that copies the result as text (score and one square per question),
  like other daily games. If the set is replayed, the latest result is shared.
- A way to open the full labelled map for free practice. Tapping a thing says
  what it is; today's names are marked.
- No memory between days. Nothing is stored.

## Styles

The app has one style for players, Tidning, served at the root. Papper, Natt
and Klar are kept at their own paths from the same code for trying out, and a
switcher between them shows only when running locally. A style changes
colours, type and the basemap palette, never the game.

## Constraints

- Static files, no backend, no accounts, no analytics.
- Offline PWA.
- No framework, no bundler, no dependencies.
- The UI is in Swedish.
- Phone and desktop matter equally.

## Repo

- Keep the curated sources and the build that turns them into app data.
- No code comments. Short README for humans. Focused CLAUDE.md with no counts.
  No decision log.
- Docs and code describe the app as it is.
