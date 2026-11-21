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
- **Bridges (13).** Every curated bridge the game did not ask.
- **Churches (2).** Inside Malmö, an article of their own, and over 500 page
  views a year or a guide listing, picked 15. Of those, Sankt Andreas kyrka
  and Sankt Matteus kyrka.
- **Sports (5).** None has an article. Picked as places people go to: Malmö
  Roddklubb, Kanotföreningen Öresund, Laserdome, Gokart City Malmö, Bounce.
- **Squares (8).** A stop of their own name (Kirsebergs torg, Nydalatorget,
  Almtorget, Persborgstorget), or at least 15 places of the long list within
  150 m (Södra Fisketorget, Posthusplatsen, Hovrättstorget, Dockplatsen).
- **Buildings (6).** Over 1,000 page views a year, without the stations,
  whose names are also areas. Hippodromen is left out: it is the building
  Malmö Stadsteater plays in.
- **Streets, shops, cafés, restaurants and chains.** `plans/streets.md` and
  `plans/chains.md`.

## Descriptions

Written from collected facts, checked by `descriptions-check.mjs` and by a
cold read, and merged where both passed: all 46 areas, 16 of 37 streets, 1
of 13 bridges and 34 of the places. Six bridges keep an older text with no
source, for the fact check to confirm or replace. The rest have none, because
nothing collected says anything about them.

Still to do: step 5 of `plans/descriptions.md`, the fact check on the web,
for every waiting name. It confirms, corrects or removes each text, and writes
one from the web where there is none.

## Before it goes live

Areas, streets and bridges can go once their descriptions are fact-checked.
Places need two changes to the build first:

- **Decoys by date.** A place that joins the game leaves the decoys of "Vad
  ligger här?" and adds its own around it, which changes that question on
  days before its date. The decoys need dates the way the deal has them.
- **Apart from a live place.** U3 must not come on the same day as Teknikens
  och sjöfartens hus, nor Caroli kyrka as Kv. Caroli. Neither live place has
  an `apart`, and giving it one changes days already dealt. A new place should
  be able to name a live place as its partner without touching it.
- **Länsresidenset** is "Länsresidenset Malmö" on the long list. That entry
  has to be tied to it, or it stays a decoy beside itself.
- **A live place that becomes a chain**, such as Konditori Katarina, needs a
  dated switch of its own (`plans/chains.md`).

## Going live

A batch moves from `learn/pending.json` into `learn/core.json`, a place's
entry into `places/places.json`, and the names go under a date in `since` a
few days after the deploy that carries them. The build fails if `core.json`
has a `pending` section, and a test fails if a waiting name reaches
`quiz.json`.
