# Days made by hand

How the builder is meant to work, and what is still open. It is for people
outside the project: they build a day of ten, suggest changes to what the
game asks about, and send both in. The questions, what a usual day looks
like and what is sent live in `bygg/handmade.mjs`, the page in
`bygg/builder.js`, and it is served at `/bygg/`, on malmodle.se as on the
local server. Nothing the builder does reaches the game until the owner picks
a day that was sent in and gives it a date.

## Decisions

- **Written for people outside the project.** The page speaks of what things
  are in the game, never of files, formats or the project's own names for
  its data.
- **Hosted, and earned.** The page is part of the site at malmodle.se/bygg.
  The end screen links to it once the player has a full 1000, has played
  fifteen days in a row, or is in the top percent of a day with at least a
  hundred players (`UNLOCK` in `app/crowd.mjs`). The browser remembers it,
  and on the day it happens the link sits in a highlight that says why. The
  streak comes back with each posted result, from at most fifteen rows read
  by key. Anyone with the address can still use the page.
  It loads the game's own modules, the site's `quiz.json` and its own copy of
  everything in the data. The offline worker leaves it to the network, and
  its files are left out of the name of the game's code cache, so a change to
  the builder never sends players a new version.
- **Desktop only.** Questions on the left, the map on the right. A narrow
  screen gets a note to open the page on a computer, with "Visa ändå", and the
  end screen's link says the same on a phone.
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
- **Anyone may send.** The Worker takes a day from any player, up to
  `PER_DAY` a day, and what is no good is deleted from `handmade` in D1.
- **Read and scheduled from the command line.** `scripts/handmade.mjs` lists
  the days sent in, newest first, with the sender's name, how many days they
  have played, their remark and suggestions, and a link that opens the day in
  the builder. `take <id>` gives one a date, the first from a week ahead that
  fits or the one given, and writes it into `learn/days.json`.
- **A made day is played as made.** On its date the game builds each question
  from its target, type and seed the way the builder does, with the items in
  play that day, and keeps from the map what the three days before it ask.
  "Dagens frågor av …" hangs under the first question's card, with the name
  the sender gave or "en spelare" without one, and the end screen says it
  again. The days before it keep their deal,
  and every deck is dealt anew from the day after, with what was asked lately
  at the back, so its targets wait like any other and the dealt targets it
  replaced come soon.
- **A date has to fit.** Its targets must all be in the game by then, every
  question must build with its type, none of its targets may be asked within
  a week (an area) or two (a street or place) before it, and what it shows on
  the map may not be asked within three days of it, or the other way round.
  `scripts/lib/made.mjs` checks this for `take`, and the data tests check it
  over a year for every made day in `learn/days.json`.
- **The link is the day.** The address holds the target, type and seed of
  each question and the suggestions, so a link gives someone else exactly the
  same day, and the browser keeps the latest draft with the name and note.

## Open

- **Acting on suggestions.** A suggestion for the game means adding the name
  to `learn/pending.json`, and for a place on the long list curating its
  entry there. `plans/pending.md` says how a waiting name goes live.
  Nothing does that from what is sent in yet, and a made day with a target
  outside the game cannot be scheduled until that target is in `core.json`.
- **Knowing a day came in.** `scripts/handmade.mjs` lists what is there.
  Nothing says when something new arrives.
- **Keeping the data current.** People are sent to OpenStreetMap to add what
  is missing, which reaches the builder only when the data is refreshed.
  `CONTRIBUTING.md` says every few months and before asking people to build
  days, so the next refresh belongs before the first invitations.
