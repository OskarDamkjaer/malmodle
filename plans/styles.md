# Map styles

The map menu (the layers button under the zoom buttons) offers the styles in
`STYLES` in `app/palette.mjs`. A style colours the map and the marks on it,
nothing else: the panels, the end screen and the chart stay Tidning's.

## Where they stand

None of the styles but Tidning has been looked at on the real map. They were
written without the map data, by colour alone, and are there to be tried and
pruned. Run `node scripts/serve.mjs`, open the menu and click through them, at
the zooms the questions use and on the end screen with its marks.

- **Tidning.** The default, and the only one tuned on the map.
- **Papper.** Warm, with orange and yellow main roads and blue water.
- **Klar.** Like Papper, louder.
- **Terräng.** After the Swedish topographic map: orange and yellow main roads,
  green parks, blue water, grey buildings, purple boundaries.
- **Sjökort.** After a sea chart: buff land, pale blue water, brown roads.
- **Blyerts.** Greys only. Probably the hardest to read.
- **Natt.** Dark, muted roads.
- **Ritning.** A blueprint: blue ground, pale lines, roads without casings.

Light styles use Tidning's marks, so the answer green and the miss red match
the scores in the panels; the context and your tap are both black, as in
Tidning. Natt and Ritning use a lighter set of the same hues, with a blue
context so it parts from the white tap.

## Open

- Which styles to keep. Eight fill the menu; four to six would read better.
- The dark styles beside the light panels: the end screen's veil is the
  page's background colour, which may look odd over a dark map.
- Whether the marks read on each style, the dashed green ask outline above
  all. Terräng keeps its roads orange rather than the topographic red, which
  would read as a miss.
- A palette only sets colours. A style that should change more (line widths,
  hiding buildings) needs `paintFor` to take more than colours.
