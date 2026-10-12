#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CACHE=data/cache
SRC="$CACHE/sweden-latest.osm.pbf"
CLIP="$CACHE/malmo.osm.pbf"
OUT="$CACHE/malmo.pmtiles"
JAR=tools/planetiler.jar
GEOFABRIK="https://download.geofabrik.de/europe/sweden-latest.osm.pbf"

mkdir -p "$CACHE" tools

read -r WEST SOUTH EAST NORTH < <(node -e '
  const b=require("./config/bbox.json").bbox;
  console.log(`${b.west} ${b.south} ${b.east} ${b.north}`);')
echo "bbox: W$WEST S$SOUTH E$EAST N$NORTH"

if [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
  export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
fi
command -v java >/dev/null || { echo "FATAL: java not found (need 21+)"; exit 1; }
command -v osmium >/dev/null || { echo "FATAL: osmium not found"; exit 1; }

PLANETILER_VERSION=v0.10.2
if [ ! -f "$JAR" ]; then
  echo "downloading planetiler.jar $PLANETILER_VERSION ..."
  curl -fSL -o "$JAR.tmp" "https://github.com/onthegomap/planetiler/releases/download/$PLANETILER_VERSION/planetiler.jar"
  mv "$JAR.tmp" "$JAR"
fi

if [ -f "$SRC" ] && [ -z "$(find "$SRC" -mtime +30)" ]; then
  echo "using cached Sweden extract ($(ls -l "$SRC" | awk '{printf "%.0f MB", $5/1024/1024}'), < 30 days old)"
else
  echo "downloading Sweden extract (~772 MB) ..."
  curl -fSL --retry 3 -o "$SRC.tmp" "$GEOFABRIK"
  mv "$SRC.tmp" "$SRC"
fi

echo "clipping to bbox ..."
osmium extract -b "$WEST,$SOUTH,$EAST,$NORTH" "$SRC" -o "$CLIP" --overwrite

MINZ=$(node -e 'process.stdout.write(String(require("./config/bbox.json").minzoom))')
MAXZ=$(node -e 'process.stdout.write(String(require("./config/bbox.json").maxzoom))')
echo "tiling z$MINZ-$MAXZ ..."
java -Xmx4g -jar "$JAR" \
  --osm-path="$CLIP" \
  --bounds="$WEST,$SOUTH,$EAST,$NORTH" \
  --minzoom="$MINZ" --maxzoom="$MAXZ" --download --force \
  --exclude-layers=poi,housenumber,mountain_peak,aeroway \
  --output="$CACHE/malmo.tmp.pmtiles"
mv "$CACHE/malmo.tmp.pmtiles" "$OUT"

SIZE=$(ls -l "$OUT" | awk '{printf "%.1f MB", $5/1024/1024}')
echo "OK: $OUT ($SIZE)"
