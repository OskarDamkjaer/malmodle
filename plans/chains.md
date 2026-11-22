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

## Open

- Konditori Katarina should be a chain instead of "det ursprungliga Konditori
  Katarina": asked as "ett Konditori Katarina" at its six branches,
  Sallerupsvägen (the original), Triangeln, Stora Nygatan, Hamngatan, Hyllie
  and Limhamn. It is live, so the switch waits for a date, a few days after
  the deploy that carries it. Its entry in `places/places.json` then gains:

  ```json
  "changes": {
    "YYYY-MM-DD": {
      "asked": "ett Konditori Katarina",
      "osm": ["node/2405585968", "node/3051074368", "node/3361577188", "way/1091108929", "node/13667033601", "node/8735620819"],
      "lat": null,
      "lon": null,
      "branches": [
        { "lat": 55.60038, "lon": 13.04065 },
        { "lat": 55.59718, "lon": 13.00136 },
        { "lat": 55.60379, "lon": 13.00433 },
        { "lat": 55.60712, "lon": 13.00013 },
        { "lat": 55.56459, "lon": 12.97243 },
        { "lat": 55.57388, "lon": 12.9338 }
      ],
      "description": "Konditorikedja som började på Sallerupsvägen 1959 och har drivits av samma familj sedan 1968. Den första filialen öppnade 2004 på Stora Nygatan."
    }
  }
  ```

- Grand Italian is on the 25th floor of the Malmö Live hotel. Keeping the two
  off the same day needs an `apart` group on Malmö Live, which is live.
- More chains that fit: Lidl, Willys, Coop, H&M, Lindex, Stadium, Apoteket,
  Joe & The Juice. 7-Eleven and Pressbyrån sit almost all in Centrum.
