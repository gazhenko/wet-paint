# What was checked, 4 October 2026

Everything below was run on the code in this repository on the day it was written, by the
tools in `tools/`. Nothing here is a human playtest.

## The route, end to end

`W=640 H=360 STEP=15 node tools/shoot.mjs route …` flies the broom on autopilot from the
opening view through all seven addresses at a fixed 15 Hz simulation step in headless Chromium
(SwiftShader):

| Parcel | Address | Landed at (game time) |
| --- | --- | --- |
| 1 | the harbourmaster, end of the pier | 0:10 |
| 2 | the clockmaker, under the tower | 0:31 |
| 3 | Tombo's hangar, on the beach | 1:08 |
| 4 | Madame's villa, up the hill | ~1:20 |
| 5 | Ursula's cabin, in the forest | 1:34 |
| 6 | the lighthouse keeper, on the headland | 1:48 |
| 7 | the airship, over the bay | 2:01 |

The finale wash and the sky pour ran, the screen faded to paper, the town was rendered into
the painting, the studio built and the easel reveal played; "Fly on" returned to the town at
dusk. 2,130 simulated frames, 832 s of wall time, zero page errors, zero WebGL errors. A
second run of just the ending (`shoot.mjs ending`) confirmed the finale camera, the neutral
studio light and the fly-on heading after those were fixed.

Earlier runs found and fixed: the autopilot stopping 8 m short of the ribbon because braking
went to a dead stop (braking now keeps a 1.5 m/s glide, so landings are approaches); the
broom sinking below the pier deck (quay, pier and fountain added to the clearance grid); the
climb over the clock tower not being followed by a dive (the autopilot no longer brakes while
it is too high).

## The picture

`shoot.mjs look` renders eight fixed views at 1280×720 and 1920×1080: the opening sketch, the
harbour painted, the pier, the afternoon square, the sunset with the page complete, the
lighthouse at sunset, dusk with the lamps, the airship at night. `shoot.mjs close` renders Kiki
from the front, side and three-quarter, the bakery windows, the tower, the pier, the hangar,
the villa, the cabin, the lighthouse and the airship. `shoot.mjs debug` writes the colour,
normal, coverage, edge and depth buffers for one view.

Things these views caught and that were fixed before release: reversed-argument `smoothstep`
calls (undefined in GLSL; blotches on ANGLE), the sky wash test inverted, a 1.2 m shadow
lookup wobble (acne), first-difference depth edges firing on every surface seen at a grazing
angle (fixed by second differences of reciprocal depth), terrain height sampled from a noise
lattice without interpolation (2 m steps), the bumpy terrain interleaving with the flat quay,
sea tone bands flickering at low sun (now relative to flat water), the hair covering the face,
clouds painted by ground blooms instead of the sky wash, smoke puffs the size of balloons, the
HUD hint rendering at the top instead of the bottom.

## Frame rate on real GPUs

| Machine | Browser | Renderer string | 1920×1080 |
| --- | --- | --- | --- |
| MacBook Pro, Apple M1 Pro | Chrome (headless, `tools/gpu-probe.mjs`) | ANGLE Metal, Apple M1 Pro | 60 fps, vsync-capped, over a 10 s flight |
| Omarchy desktop, RTX 3080 | Chromium 152 in Hyprland (`tools/omarchy-check.sh` + `tools/remote-probe.mjs` over CDP) | ANGLE OpenGL ES 3.2, NVIDIA RTX 3080 | 120 fps, vsync-capped, flight and boosted sunset flight |

82 draw calls a frame (two shadow passes, the scene pass, the post pass). The uncapped frame
time was not measured; both machines sat at their display's refresh rate.

## The deliverables

- `dist/WetPaint.html` (single file, ~2.1 MB) boots from `file://` in headless Chromium with no
  errors and reaches the title screen (`tools/single-check.mjs`).
- https://gazhenko.dev/wet-paint/ boots over the network with no errors (`tools/live-check.mjs`).

## Not checked

- Nobody has played it with a keyboard or a gamepad; the controls were exercised only by the
  autopilot and scripted input through the check API.
- Sound: the Web Audio graph starts without exceptions in headless Chromium, but nobody has
  listened to it.
- Firefox and Safari were not run; the game uses WebGL 2, multiple render targets, GLSL ES 3.0,
  depth textures and multisampled render targets, all of which both support, but that is a
  claim and not a measurement.
- Window sizes other than 1280×720 and 1920×1080, and device pixel ratios above 1 (the game
  caps its own at 1.5).
- Touch screens are unsupported by design.
