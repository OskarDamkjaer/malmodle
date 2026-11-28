# What waits to join the game

`learn/pending.json` holds what is on its way in. The build checks it, the
day builder shows it, and `quiz.json` leaves it out, so nothing here changes
a live day. This plan records how each part was chosen, how far its
descriptions have come, and what has to happen before it goes live.

## How it was chosen

- **Areas (46).** The game asked 46 of the 129 delområden. Added: every
  delområde with a transit stop of its own name inside it or within 400 m,
  less the three working harbours (Mellersta, Norra and Östra Hamnen), plus
  the eleven whose stop carries the everyday name instead (Norra and Södra
  Sofielund, Norra, Västra and Östra Sorgenfri, Östra and Västra Söderkulla,
  Oxie Kyrkby, Tygelsjö by, Gamla Limhamn, Lindeborg). That makes 92 of 129.
  Left out: the industrial areas, the harbours, the cemetery, Pildammsparken
  and the delområden with neither a stop nor an article.
- **Bridges (12).** Every curated bridge the game did not ask, but
  Varvsbron, which nothing on the web says anything about.
- **Churches (2).** Inside Malmö, an article of their own, and over 500 page
  views a year or a guide listing, picked 15. Of those, Sankt Andreas kyrka
  and Sankt Matteus kyrka.
- **Sports (4).** None has an article. Picked as places people go to: Malmö
  Roddklubb, Kanotföreningen Öresund, Laserdome, Gokart City Malmö. Bounce
  is left out: it went bankrupt in 2020.
- **Squares (8).** A stop of their own name (Kirsebergs torg, Nydalatorget,
  Almtorget, Persborgstorget), or at least 15 places of the long list within
  150 m (Södra Fisktorget, Posthusplatsen, Hovrättstorget, Dockplatsen).
- **Buildings (6).** Over 1,000 page views a year, without the stations,
  whose names are also areas. Hippodromen is left out: it is the building
  Malmö Stadsteater plays in.
- **Streets, shops, cafés, restaurants and chains.** `plans/streets.md` and
  `plans/chains.md`.

## Descriptions

Written from collected facts, checked by `descriptions-check.mjs` and by a
cold read, then fact-checked on the web (step 5 of `plans/descriptions.md`),
which confirmed, corrected or wrote a text for every name. It also settled
what some places are called:

- **Södra Fisktorget** is spelled so on Swedish Wikipedia, malmo.se and with
  Planteringsföreningen. The long list keeps OpenStreetMap's "Södra
  Fisketorget".
- **Mikkeller Moriskans Trädgård** is the beer garden at Moriska paviljongen.
  The long list has it as "Mikkeller Pop Up | Moriskans Trädgård".
- **Tanken** is a small art gallery in an old petrol station, so it is a
  museum, as Malmö Konsthall is, and not a stage.
- **Hotel Kramer** keeps its name, the building's and its Wikipedia article's.
  Scandic runs it as Scandic Kramer.
- **Västerbron, Paulibron, Turbinbron and Slussbron** rest on what Ljungberg
  says of how they were named in 1938, which is all that is written of them.

## What the build does for them

The descriptions are fact-checked, and the build keeps a new place from
touching the days before its date:

- **Decoys by date.** A place that joins leaves the decoys of "Vad ligger
  här?" and brings its own. The build works the decoys out again on each date
  a place joins or changes, and a decoy that comes or leaves on one carries
  it as `since` or `until`, so every day before keeps the decoys it had
  (`scripts/build-quiz.mjs`, `decoysOn` in `app/daily.mjs`).
- **Apart from a live place.** U3 names Teknikens och sjöfartens hus, Caroli
  kyrka names Kv. Caroli and Grand Italian names Malmö Live, and none of the
  three has an `apart`. A place named by another joins its group on the day
  both are asked (`grouped`), so the live place keeps every day it had.
  Rådhuskällaren, Mikkeller Moriskans Trädgård and Grand Italian are krogar
  in a group, and a krog in a group is dealt from the place deck, which keeps
  a group apart; the krogar's own deck knows nothing of the places.
- **Tied by id.** Länsresidenset is "Länsresidenset Malmö" on the long list,
  Södra Fisktorget "Södra Fisketorget", and the chains' branches go by other
  names. A place that joins on a date, or still waits, is tied to the long
  list's entries by its OpenStreetMap ids, so they leave the decoys on its
  date, and the builder shows it once rather than with a second dot.

The 60 places join on 2026-12-06, moved by `node scripts/join.mjs landmarks
--on 2026-12-06`: 21 to the krogar's deck and 39 to the places', with every
day already played keeping its set and every day until the date asking what
it did, decoys included. No group shares a day over the two years the data
test deals.

## Going live

Areas, streets, bridges and places go live with `node scripts/join.mjs`,
which moves them from `learn/pending.json` into `learn/core.json` under a
date in `since`, and a place's entry to the end of `places/places.json`;
`plans/release.md` has how and why. The build fails if `core.json` has a
`pending` section, and a test fails if a waiting name reaches `quiz.json`.
