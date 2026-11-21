# Days made by hand

How the builder is meant to work, and what is still open. It is for people
outside the project: they build a day of ten, suggest changes to what the
game asks about, and send both in. The questions, what a usual day looks
like and what is sent live in `dev/handmade.mjs`, the page in `dev/builder.js`, and
`/dev/builder.html` on the local server shows it. A day made here is never
played by anyone: the game deals its own day, and nothing the builder does
reaches it.

## Decisions

- **Written for people outside the project.** The page speaks of what things
  are in the game, never of files, formats or the project's own names for
  its data.
- **Desktop first.** Questions on the left, the map on the right. Phones come
  once people other than the owner build days.
- **Nothing is generated.** A day starts empty and every question is picked.
  There is no "start from the day the game would deal".
- **Target and type, the rest from the game.** Each question is a target, a
  type and a seed. The options, the neighbour and its direction, and the ends
  of a street come from the same `build` the game uses, with the same rule
  that nothing the day asks about is named on the map. "En annan variant"
  turns to a seed that builds something different, and is offered only when
  one does.
- **Chains as the game asks them.** A place with several branches is drawn
  at each of them. Pointing at it is asked anywhere in Malmö or within a
  district, as the game builds it, and "En annan variant" turns between
  them; the question then shows the district and the branches in it.
  "Vad ligger här?" cannot take a chain, and says why.
- **Only types that can be built.** A type the target cannot take is shown
  disabled with the reason, including when it fails only because the area or
  place it would name is asked elsewhere in the day.
- **What is usual, not rules.** "Hur en dag brukar se ut" comes first: that
  the first question points at an area, and a table of how many areas,
  streets and places a day has and of which types, with the restaurants
  among the places, beside the ranges the game deals. It is worked out from
  the same numbers as `plan` in `daily.mjs`, and a test checks that every day
  the game plans for itself is usual. A count is marked only when it is over
  its range, or under it once the day has ten questions, and nothing unusual
  stops a day from being sent. Its heading folds it to one line, which then
  counts how many things differ, and the browser remembers it folded.
- **Problems on the question.** One thing asked twice, two that belong
  together, and a question that cannot be built are flagged on the questions
  themselves, and the header counts the questions to look over and goes to
  the first. These are the only things the page calls wrong.
- **Ten slots.** The list always shows ten. The next empty one is the search,
  the rest are placeholders that lead to it, and a full day hides the search
  until a target is swapped. Each row leads with its target and says the type
  under it. What lies further from building the day is folded away: what the
  target is, the place categories above the map, the keyboard shortcuts
  behind `?`, and the suggestions until there is one: suggesting is found
  from the map and the questions. The link to OpenStreetMap sits on the map,
  since it is about what the map lacks.
- **Sending is one button.** "Skicka in" sits in the header, fills as the day
  does and opens only once the day has ten questions that build. It opens a
  dialog with the name and the note, and afterwards says "Inskickad" until
  something in the day changes.
- **The whole data on the map, named by what it is in the game.** "Kan
  frågas" is Grunden. "Frågas aldrig" is the rest of the curated areas,
  streets and bridges, and the long list's places that can stand as a wrong
  option in "Vad ligger här?". "Visas aldrig" is the rest of the long list,
  where a place counts once however many categories list it, and a chain's
  branches count apart. Each of these, each kind and each category of place
  can be turned on and off, with ⌥-click to show only one, and each counts
  what it would show with the others as they are, so every row adds up to
  what is on the map. What is shown is always named, streets along the line
  the way the basemap names them, and the basemap's own labels stay hidden.
  What each of the three means is in a tooltip on its chip and on the badge
  in a map popup, and each question type is explained the same way where it
  is chosen and in the table.
- **Anything can go in the day.** Where the line between what the game asks
  and what it never does was drawn may be wrong, so a target can come from
  anywhere on the map or the search, which lists the game's own first and
  tags the rest "inte i spelet än". One the game never asks about is built
  like the rest and is suggested for the game when the day is sent in.
- **Suggestions on anything.** From the map or a question, anything can be
  suggested for the game or out of it, by what it is now, or marked as
  looking wrong, each with a comment. Suggested things are ringed on the map.
  Something missing from the map altogether is for OpenStreetMap, and the
  page says so, with a link to the same place there.
- **Sent to the Worker, by a player.** A day of ten that all build is
  posted to `/api/handmade` with its suggestions, those the day makes itself
  included, a note and the builder's name if they want credit. With it goes
  the player id the game keeps in the same browser, made then if there is
  none, and the Worker stores it hashed the way it stores results, so a day
  can be held against how the one who sent it plays. Every day sent is kept,
  up to `PER_DAY` a day per player. The page says when a day has gone in, and
  keeps saying so until something in it changes.
- **The link is the day.** The address holds the target, type and seed of
  each question and the suggestions, so a link gives someone else exactly the
  same day, and the browser keeps the latest draft with the name and note.

## Open

- **Builders other than the owner.** The page only runs on the local server.
  Invited people need it hosted. How the credit shows on the end screen is
  not decided.
- **Who may send.** The player key is kept so a day can be held to a streak
  or a high score before it is taken. Which, and whether the page should say
  so or stop someone before they build, is not decided. A player is a
  browser: someone who plays on the phone and builds on a computer is two
  players, and a new id resets the limit per day.
- **Reading what is sent.** The days are rows in `handmade` in D1, read with
  `wrangler d1 execute`. Nothing lists them or says one has come in, and a
  row's `slots` and `notes` open in the builder only once packed into a link.
- **Acting on suggestions.** A suggestion for the game means adding the name
  to `learn/core.json`, and for a place on the long list curating it first.
  Nothing does that from what is sent in yet.
- **Putting a day into the schedule.** The game's day is worked out from the
  date alone. Playing a made day on a date needs `daily.mjs` to take it in
  place of the dealt one, the Worker's `sets.mjs` to agree, and a decision on
  what happens to the decks around it, which would otherwise deal the same
  targets a few days later.
- **Keeping the data current.** People are sent to OpenStreetMap to add what
  is missing, which reaches the builder only when the data is refreshed;
  `CONTRIBUTING.md` says how. How often is not decided.
- **Days around it.** A made day is checked on its own. The game also keeps
  what a day names on the map from being asked within `SHOWN_GAP` days, and
  spaces each deck so a target waits most of a round. Neither is checked
  until a made day has a date.
