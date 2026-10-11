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
- The set can be replayed. Replaying gives the same set, never a new one.

## Questions

Pointing is the most common. Per kind:

- Areas: "Var ligger X?" 1–3, "Vad ligger här?" 1–2, "Direkt söder om" 0–1.
- Streets: "Var ligger X?" 1–3, "Vad ligger här?" 0–2, "Från A till B" 0–1.
- Places: "Var ligger X?", with "Vad ligger här?" for about a quarter to a
  third of them.

- **Peka ut.** "Var ligger X?" One tap, no second try. Scored 0–100 on distance.
  Afterwards: how far off you were, and what you actually tapped if it was
  something else.
- **Vad ligger här?** Something is highlighted on the map; pick its name from a
  list of nearby things of the same kind.
- **Direkt söder om.** "Vilket område ligger direkt söder om X?" Pick one of
  four. X is highlighted; the decoys are its other neighbours and nearby areas,
  never one that also lies on that side. Asked for any of the four directions,
  only where exactly one area borders X on that side.
- **Från A till B.** "Vilken gata går från A till B?" Pick one of four. A and
  B are the squares, parks or buildings at the street's ends, or the areas
  they lie in; no decoy also joins them, and a pair belongs to one street.

Every question scores 0–100. A day scores out of 1000. A wrong pick in "Vad är
det här?", "Direkt söder om" or "Från A till B" scores 25 when it is close to
the answer: an area that borders it, a street that meets it, or a place within
300 m.

## The map

- No labels on the map while a question is open. Pan and zoom are allowed.
- Always north-up.

## After the set

- An end screen with the score, today's names, how each went, and the
  descriptions. Descriptions are only shown here.
- A button that copies the result as text (score and one square per question),
  like other daily games. If the set is replayed, the latest result is shared.
- Practice by kind: a set of "Var ligger X?" for one kind, never shared.
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
