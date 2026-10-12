# Plan: a photo and a description for every place in Grunden

`plans/photos.md` and `plans/descriptions.md` describe the pipelines. This is
the loop that runs them until coverage is good enough, and what is left for a
person to do.

## Photos

1. **More sources.** Look for more freely licensed photos (Commons, Openverse,
   Mapillary for streets and areas, municipal and museum archives with open
   licences) and for cheap stock photos with a licence that allows use in the
   app. Note the licence and credit each source needs.
2. **Fill in the missing.** Run the collectors on the places that have no
   photo approved, starting with the categories that rank highest by gap
   (category share of daily questions times what is missing).
3. **Confidence.** For each candidate, an agent reads the title, description,
   categories and date with the image and gives a percentage for how likely
   the photo shows the intended place as it is today. Low ones are dropped,
   the rest are ordered by it.
4. **Repeat** steps 1 to 3 until a round adds little: few new candidates above
   the threshold, or only places no source covers.

## Descriptions

5. **Fact check.** Run more check rounds on the descriptions, first those with
   `verified: false` (written from web searches), then the rest. A statement
   that cannot be backed is removed.

## By hand

6. **Review by Oskar** on the review page (`node scripts/photos-review.mjs`):
   one photo per place, approved or marked as none.
7. **Photo walks by bike.** The places still without a photo, mostly krogar
   and kaféer, are photographed on site and added with their own credit.
