# Streets

Which streets the game asks about, and why. The asked ones are `core.streets`
in `learn/core.json`, the ones on their way in wait under `streets` in `learn/pending.json`,
and every street the build knows is listed in `learn/streets.json`.

## Decisions

- **Known, not just big.** A street is worth asking when people use its name:
  they ride a bus along it, shop on it, or give directions by it. Road class
  alone lets in the country roads at the city's edge (Särslövsvägen,
  Bjärshögsvägen, Törringevägen), which is where most obscure names come from.
- **Three signals, none enough alone.** From the OpenStreetMap extract:

  | | Core (54) | Listed, not core (120) | Every other street (2,153) |
  | --- | --- | --- | --- |
  | A city bus line along it | 37 | 74 | 90 |
  | Businesses at its addresses, median | 7 | 0 | 0 |
  | Named on a bus stop | 3 | 20 | 90 |

  Core streets cross a median of four other game streets, the rest of the
  city none. Bus lines find the main roads, but also short links at the hubs
  (Prostgatan, Torggatan, Mäster Nilsgatan carry seven lines on under 300 m),
  so a bus counts only along 300 m or more. Businesses find the shopping
  streets without buses (Södergatan, Engelbrektsgatan, Friisgatan), but
  addresses in OSM are patchy. Crossings mean little in the old town, where
  every alley crosses three game streets.
- **The rule.** A candidate crosses at least two game streets and has a bus
  along 300 m or more, five or more businesses at its addresses, or an entry
  in `learn/streets.json`. That gives about forty; the pick among them is by
  hand, by someone who knows the city.
- **No street alone.** "Vad ligger här?" offers the nearest game streets as
  wrong answers and "Från A till B" the nearest that do not join its ends, so
  a street with no game street near it is easy by elimination. An isolated
  street comes with a neighbour: Geijersgatan and Kalkbrottsgatan cross
  Linnégatan, Norra Skolgatan crosses Södra Skolgatan, and Västra Varvsgatan
  is asked rather than Lilla Varvsgatan, which crosses none.
- **Bus stops are not a signal.** A stop is named after the street it stands
  on, often a small one (Aktrisgatan, Buskmätaregatan, Tenorgatan). The
  busiest stops (Södervärn, Triangeln, Gustav Adolfs torg, Dalaplan,
  Davidshall, Värnhem, Nobeltorget) are already in the game as areas or places.
- **One name, one street.** The build takes the instance of a name with the
  highest road class. Of the pending streets only Kalkbrottsgatan exists
  twice, and the build takes the one in Limhamn. A place with the same name as
  a street wins in the build, which leaves the street's entry unused
  (Dalaplan, Triangeln, Dockplatsen).
- **Short is fine.** Hamngatan (120 m), Södra Skolgatan (160 m) and Mäster
  Johansgatan (210 m) are about as short as Skomakaregatan (136 m), which is
  core.
- **Left out.** Country roads that pass only on bus lines (Käglingevägen,
  Elisedalsvägen, Arrievägen, Gottorpsvägen). Old-town alleys that pass only
  on crossings (Gråbrödersgatan, Frans Suellsgatan, Bruksgatan, Torggatan,
  Studentgatan). Skånegatan, as the only one in the data is in Sibbarp. Next
  in line: Östra Farmvägen, Hyllievångsvägen, Fredsgatan, Claesgatan,
  Bangatan, and Järnvägsgatan in Limhamn.

## How the counts are made

From `data/cache/malmo.osm.pbf` and `data/cache/streets-raw.geojson`, with
osmium and a short script:

- Bus lines: the named highway ways in `route=bus` relations, a line counted
  as a city line when its `ref` is one or two digits, and the length of the
  street on a route.
- Businesses: objects with `addr:street` and a `shop`, `amenity`, `craft`,
  `office`, `tourism` or `healthcare` tag, parking and recycling left out.
- Crossings: the game streets within 15 m of a street's lines; nearby, those
  within 300 m. Same-name ways are grouped as in `build-streets.mjs`, by a
  500 m gap.

## Descriptions

Every street that joins has a text, fact-checked on the web. 17 have a
Swedish Wikipedia article. For the rest the main source is Leif Ljungberg,
*Gatunamnen i Malmö* (1960, published by Malmö stad), digitised at
<https://slaegtsbibliotek.dk/2025/947337.pdf>, for when and after what a
street was named.

## Going live

A street joins with `node scripts/join.mjs streets`, which moves it from
`streets` in `learn/pending.json` to `core.streets` and under a date in
`since` (`plans/release.md`). No date is needed while it waits.

## Open

- Hyllie boulevard crosses only Annetorpsvägen and Pildammsvägen.
  Hyllievångsvägen would give it a neighbour.
- Page views on Swedish Wikipedia would be an independent check of the pick,
  as `plans/places.md` uses for places.
