#!/usr/bin/env bash
# Builds the single file, writes checksums, and publishes a GitHub release.
#   Tools: tools/release.sh v1.0.0
set -euo pipefail
tag="${1:?tag, e.g. v1.0.0}"
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
node tools/build.mjs
out="dist/release"; rm -rf "$out"; mkdir -p "$out"
cp dist/WetPaint.html "$out/WetPaint.html"
(cd dist/site && zip -qr "../release/wet-paint-$tag-site.zip" .)
(cd "$out" && shasum -a 256 WetPaint.html "wet-paint-$tag-site.zip" > SHA256SUMS.txt && cat SHA256SUMS.txt)
notes="$root/docs/RELEASE_NOTES.md"
gh release create "$tag" "$out/WetPaint.html" "$out/wet-paint-$tag-site.zip" "$out/SHA256SUMS.txt" --title "Wet Paint $tag" --notes-file "$notes"
