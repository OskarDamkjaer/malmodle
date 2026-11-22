# Chains

A chain is one place entry with its branches under `branches`, asked as
"Var ligger en X?" with `asked` giving the phrase ("ett Systembolag"). The
nearest branch counts. How it is asked is in `BRIEF.md`; the data shape in
`CONTRIBUTING.md`.

## Decisions

- The areas a chain is asked within are the ten stadsdelar in
  `learn/regions.json`, merged from their delområden at build time, because
  people name them and the five official stadsområden read oddly ("i Söder").
- A stadsdel is offered only when it holds one to three branches, so the
  question is never "anywhere in Centrum". A chain with up to four branches is
  asked across the city half the time.
- The stadsdel is drawn from the day and the chain's name, never from the
  day's shared draw, so a place that becomes a chain leaves the rest of its
  day as it was. A test pins this.
- Only branches inside Malmö's stadsdelar are listed.
- Åhléns has one department store left in Malmö, so it is a single place.
- A chain brings no decoys of its own, since "Vad ligger här?" never asks
  one, and its branches leave the decoys by their OpenStreetMap ids. The 50 m
  rule that keeps a single place's other entries out would take in a
  branch's neighbours: around the Espresso House and Burger King branches it
  would drop other cafés and food-court stalls.
- Grand Italian is on the 25th floor of the Malmö Live hotel, so it names
  Malmö Live as its partner (`apart`). Malmö Live joins the group on the day
  Grand Italian is asked, and a krog in a group is dealt from the place deck,
  so the two never come on the same day.

## Open

- More chains that fit: Lidl, Willys, Coop, H&M, Lindex, Stadium, Apoteket,
  Joe & The Juice. 7-Eleven and Pressbyrån sit almost all in Centrum.
