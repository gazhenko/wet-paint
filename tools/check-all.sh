#!/usr/bin/env bash
# The whole check set, as run before a release. Needs `npm run serve` in another terminal.
#   tools/check-all.sh <outdir>
set -euo pipefail
out="${1:-shots}"; mkdir -p "$out"
echo "== single file";  node tools/build.mjs && node tools/single-check.mjs "$out/single-title.png"
echo "== look 720p";    node tools/shoot.mjs look "$out/look"
echo "== close-ups";    node tools/shoot.mjs close "$out/close"
echo "== route";        W=640 H=360 STEP=15 node tools/shoot.mjs route "$out/route"
echo "== ending";       node tools/shoot.mjs ending "$out/ending"
echo "== gpu";          node tools/gpu-probe.mjs
