# Plan: descriptions from collected facts

Give every name in Grunden a short Swedish description for the end screen,
written only from source text collected beforehand, and checked automatically
instead of by hand. A missing description is better than an invented one.

## What a description is

One or two sentences, at most about 200 characters, in the dry style of the
existing ones:

> Anlagt på 1530-talet och då Nordens största torg. Rådhuset står på östra
> sidan, Karl X Gustav till häst i mitten.

Brief information about the thing itself: what it is, when, by whom, what it
is known for. No marketing words, no opinions, no "Malmös bästa".

## Scope

Everything in `learn/core.json`:

| Kind | Where the text goes | Field |
| --- | --- | --- |
| Places | `places/places.json` | `description`, `source` |
| Areas | `learn/about.json` | `areas[name].text`, `source` |
| Streets | `learn/streets.json` | `description`, `source` |
| Bridges | `learn/bridges.json` | `description`, `source` |

The existing descriptions go through the same check (step 3) and are rewritten
if they cannot be backed by the facts.

Pictures are handled by another agent in its own file. This work never writes
picture fields, and the picture work never writes descriptions.

## Step 1: collect facts (script, no model)

`scripts/facts-collect.mjs` writes one file per name, `places/facts/<slug>.json`:

```json
{
  "name": "Ribersborgs Kallbadhus",
  "kind": "landmark",
  "category": "bad",
  "thin": false,
  "snippets": [
    { "id": "wp-sv", "source": "https://sv.wikipedia.org/wiki/Ribersborgs_kallbadhus", "text": "…" },
    { "id": "wikidata", "source": "https://www.wikidata.org/wiki/Q…", "text": "inception: 1898; heritage: byggnadsminne" },
    { "id": "osm", "source": "https://www.openstreetmap.org/relation/5698988", "text": "amenity=public_bath; start_date=1898" }
  ]
}
```

Snippets are plain text with their URL. Wikidata and OSM facts are written as
`key: value` lines so they can be quoted. Sources, in order:

1. Swedish Wikipedia intro. From `data/cache/places/wikipedia-intros.json`,
   the `wikipedia` field in `places/longlist.json`, `learn/sources.json` for
   areas and streets, or the item's Wikidata sitelink. Missing intros are
   fetched with the extracts API (`prop=extracts&exintro&explaintext`).
2. English Wikipedia intro, only when there is no Swedish one.
3. Wikivoyage listing text for the name, from
   `data/cache/places/wikivoyage-sv.json` and `wikivoyage-en.json`.
4. Wikidata: inception, dissolved, architect, heritage designation, instance
   of, named after. From `data/cache/places/wikidata.json`, fetched by id when
   missing.
5. OSM tags from `data/cache/places/overpass.json` or the extract:
   `start_date`, `architect`, `cuisine`, `heritage`, `building`, `operator`,
   `description`.
6. Malmö stad's art register, `data/cache/places/malmo-konst.geojson`: title,
   artist, year.
7. For restaurants and cafés: the first year the node appears, from
   `data/cache/places/history/`, written as `first seen in OpenStreetMap: 2009`.
8. Text of the evidence URLs in `places/research/*.json` (malmo.se pages,
   press), and the `about` or front page of the place's own website from the
   OSM `website` tag. Stripped to readable text, capped at 3,000 characters.
9. The `why` note from the research, marked `"id": "research"`. It may be
   quoted only for facts that also appear in another snippet.

Every download is cached under `data/cache/facts/`, so a re-run reads from
disk. A file is `thin` when it has no Wikipedia, Wikivoyage or web snippet.

The script also records the Commons category (Wikidata P373) when there is
one, as `commons`, for the picture work.

## Step 2: write (Sonnet agents)

Batches of about 15 names, grouped by kind and category. Each agent gets the
batch's facts files and this prompt, and nothing else: no web access.

> Write a short Swedish description for each name below, for the end screen of
> a quiz about Malmö. One or two sentences, at most 200 characters. Dry and
> factual, like: "Anlagt på 1530-talet och då Nordens största torg. Rådhuset
> står på östra sidan, Karl X Gustav till häst i mitten."
>
> Use only the snippets in the facts file. Every statement must be backed by a
> quote copied word for word from a snippet. Do not use anything you know
> yourself, even if you are sure. Do not quote the `research` snippet unless
> another snippet says the same.
>
> If the facts are thin, write one short sentence. If they say nothing worth
> telling, return `null`.
>
> No opinions, no marketing words (bästa, mysig, populär, måste, perfekt,
> unik), no addresses, no opening hours, no prices.

Output, one file per batch, `places/descriptions/<batch>.json`:

```json
[
  {
    "name": "Ribersborgs Kallbadhus",
    "text": "Kallbadhuset på piren vid Ribersborgsstranden, byggt 1898 och öppet året om.",
    "source": "https://sv.wikipedia.org/wiki/Ribersborgs_kallbadhus",
    "claims": [
      { "snippet": "wp-sv", "quote": "…" },
      { "snippet": "wikidata", "quote": "inception: 1898" }
    ]
  }
]
```

`source` is the URL of the snippet most of the text comes from.

## Step 3: check (script, then a second agent)

`scripts/descriptions-check.mjs` rejects a description when:

- a quote is not found word for word in the named snippet (whitespace and case
  folded);
- a year, number or capitalised name in the text does not appear in any of its
  quotes (names written differently in Swedish and English count if one
  appears in the other's snippet);
- the text is over 220 characters, or contains a banned word;
- it quotes only the `research` snippet for a fact;
- it says where a fact comes from ("på kartan", "enligt webbplatsen") instead
  of stating it. The first year a node appears in OpenStreetMap is not when
  the place opened, and is not used.

Then a second Sonnet agent reads each surviving description with its facts
file, cold:

> For each description, list every statement in it. For each statement, say
> whether the facts file supports it. Answer `supported`, or `unsupported`
> with the statement. Be strict: a statement that is plausible but not in the
> snippets is unsupported. So is a statement about another branch or venue of
> the same name, promotion taken from the place's own website, a weekly
> schedule, or a text that never says what the place is.

A rejected or unsupported description goes back to step 2 once, with the
reason. If it fails again it is dropped and the name keeps no description.

## Step 4: merge

`scripts/descriptions-merge.mjs` writes the descriptions that passed into the
files in the scope table, with `source`, and sets `verified: true` where the
file has that field. Names without a passing description get `null`, and the
end screen shows nothing for them. It prints how many names in each kind have
a description.

## Step 5: fact check on the web

The merged texts are checked once more, this time against the web. Batches of
about 26 names go to `places/factcheck/batch-N.json`, and an agent per batch
follows `places/factcheck/prompt.txt`: split each text into statements, back
each one on Swedish Wikipedia, malmo.se, museum and heritage pages, the press
or the place's own site, and make sure the source is about this place in Malmö.
The verdict is `ok`, `fix` with a corrected text that keeps only what could be
backed, or `remove`. A name with no description at all can go through the same
step with `text: null`, and the agent writes one from web sources.

`scripts/descriptions-factcheck.mjs` writes the verdicts from
`places/factcheck/out-N.json` into the files in the scope table, matching on
kind so a place and an area with the same name stay apart, and sets
`verified: true`.

## Running it

```
node scripts/facts-collect.mjs           # places/facts/*.json, --only a,b for some names
                                         # step 2: writer agents, one per batch
node scripts/descriptions-check.mjs      # rejects and reasons per batch
                                         # step 3: checker agents on what passed
                                         # step 2 again for the rejected, once
node scripts/descriptions-merge.mjs      # into places.json, about.json, …
                                         # step 5: fact-check agents, one per batch
node scripts/descriptions-factcheck.mjs  # their verdicts into the same files
node scripts/build-quiz.mjs
node --test 'test/*.test.mjs'
```

About 250 names, so about 17 writer batches and as many checker batches. Expect
solid descriptions where there is a Wikipedia article or a Wikivoyage listing;
for many restaurants, cafés and small places only a type and a year
("Irländsk pub, med sedan 1990-talet."), and some with none.

`places/facts/`, `places/descriptions/` and `places/factcheck/` are working files
and stay out of the repo. The merged text is what gets committed.
