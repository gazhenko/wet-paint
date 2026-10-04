# How the picture is made

Wet Paint renders a 3D town so that it reads as a pencil drawing where the page is bare and as a
watercolour where it has been painted, and lets the border between the two move during play.

## The pipeline

Every frame:

1. **Shadow pass.** The scene is drawn twice from the sun with `MeshDepthMaterial` into depth
   textures: a near cascade, 140 m across and 2048² around the broom, and a far cascade, 640 m
   across at 4096². Only layer 0 (the town and the characters) casts; the sea and sky are on
   layer 1.
2. **Scene pass.** Every material is a custom GLSL 3 shader writing to two colour attachments:
   `outColor` (the shaded wash colour, already hazed with distance) and `outData` (view-space
   normal in RGB, paint coverage in A). The target is multisampled 4× with a depth texture.
3. **Post pass.** A full-screen quad reads colour, data, depth, a tileable noise texture and the
   paper, and composes the page.

### Shading in the scene pass (`paintedMaterial`)
- Lighting is the dot of the normal with the sun, plus a small noise wobble, cut into three
  bands with `smoothstep` edges widened by `fwidth` so they stay crisp at any distance:
  shadow, mid, lit. A cast shadow forces the shadow band. Shadow colour is the base colour
  tinted by the day's shadow tint (a blue-violet in the morning, a purple at sunset).
- Aerial perspective mixes toward the day's haze colour with distance (`1-exp(-d·0.0022)`).
- Coverage is the union of the blooms (below). Just inside a bloom's front the colour is
  darkened by a third: the wet edge, where pigment pools.
- Windows are instanced quads shaded procedurally: frame, mullions, glass that gleams by day
  and warms to lamplight at dusk for a seeded subset.
- The sea displaces its vertices with two sines and stretched noise; its bands follow the wave
  slope toward the sun relative to flat water, so they look the same at noon and at sunset;
  thin horizontal strokes and a glitter path are added in the fragment shader.
- The sky is a gradient with a stepped sun halo and stars; its coverage is a wash poured from
  the top of the page, driven by `uSkyWash`. Clouds and the airship take their coverage from
  the sky wash rather than from the ground blooms.

### Composing the page (`postMaterial`)
- **Line.** With `w = 1/depth`, the second differences `|w1 + w2 − 2w0|` along the two diagonals
  are zero across any plane however steeply it is seen (1/z is linear in screen space on a
  plane) and large at a step; multiplied by depth they become a fraction of the distance, so
  the line does not thicken with depth. Normal differences add creases. The sampling position
  is jittered by noise and the jitter changes six times a second so the line boils gently; a
  second noise modulates pressure. Lines thin with distance.
- **Sketch.** On bare paper the colour is the paper tint, slightly darkened on surfaces that
  face away from the sun, with 45° hatching there, and the line in graphite.
- **Watercolour.** On painted paper the scene colour is granulated by fine noise, darkened a
  little along edges, and the line is laid over in warm ink mixed with the local colour.
- `mix(sketch, paint, coverage)`, then the paper texture multiplies everything, with a soft
  vignette.

## Blooms

A bloom is a disc at an address with a target radius. It grows over seven seconds with an
ease-out, and the shader wobbles its edge with low-frequency noise scaled to the radius, so
the front is ragged and islands of paper survive for a moment inside it. Up to fourteen blooms
are unioned per fragment. The bakery corner is painted when the day begins so the first view
has one patch of colour in it. The last delivery, at the airship, spawns a bloom of radius
5,000 that takes sixteen seconds to cross the whole page, and the sky wash is pushed past the
horizon at the same time.

## The day

Progress (parcels delivered out of seven) drives a keyframed day: sun elevation and azimuth,
sun colour, sky top and horizon, sun glow, haze, shadow tint, sea colours, lamp level and
stars. The day eases toward each new key when a parcel lands. After the ending, "Fly on" sets
the day past sunset: lamps and windows lit, stars out, the sea dark.

## The town

`buildWorld` lays eleven streets (two of them curved), then walks each street on both sides
placing houses with random frontages, two to four storeys, gable or hip roofs with eaves,
chimneys, dormers, shutters, shop doors and awnings on the main streets, and a row of windows
per floor on every side. Footprints are checked against each other, the streets and reserved
ground. Landmarks are placed by hand: the bakery and its courtyard, the clock tower and
fountain on the square, the quay with its wall, bollards, pier and harbourmaster's hut, the
warehouses and crane, Tombo's hangar on the beach, Madame's villa with its terrace, rose
arbours and pond, Ursula's cabin in the forest, the lighthouse and keeper's cottage on the
headland, the airship with its landing deck, and a hill town across the bay in the haze. Trees
are instanced in gardens, the square, the forest and the far shore. Terrain is an analytic
height field: a slope from the quay, flattened at the square and the quay, a headland, the
forest hill, mountains, and the far shore.

A coarse clearance grid (4 m cells) records the highest thing in each cell, so the broom is
pushed up over roofs and the tower instead of flying through them.

## Kiki

The character is a hierarchy of merged vertex-coloured parts: broom (handle, bound straw, loose
straws, radio), legs astride with red shoes, a dress lathe with a white collar, arms reaching
to the handle, head with eyes, blush and mouth, hair as a cap and bob, the bow, the satchel,
and Jiji with ears, eyes, a red bow collar and a tube tail. A `sway` vertex attribute marks the
hem, the hair ends and the straws, which flutter in the vertex shader with speed. The body
leans forward with speed and rolls with bank; the bow and tail swing; the head looks about.

## The flight

An arcade model: speed eases toward 19 m/s, 42 with boost, or a 1.5 m/s glide with Space
(which also sinks, so Space is how you land). Turn input sets a bank that drives the yaw rate;
climb input sets pitch. Altitude is clamped to the clearance grid plus 1.3 m with a soft push
and a bump message when the hit was hard. The chase camera lags behind with a lead on the
look point, widens its field of view with speed, rolls a fraction of the bank, and swings to an
orbit while she is landed.

## The ending

When the airship parcel lands, the final bloom and sky wash run for fifteen seconds while the
camera orbits. The screen fades to paper; the town is rendered once more from a fixed postcard
viewpoint through the whole pipeline into a 1600×1000 texture; a studio scene (floorboards, a
window, an easel, a table with jars and brushes, a stool with a sleeping cat) is built with the
same painted material and the painting is placed on the easel; the camera dollies back from
the canvas over nine seconds; then the title and the time appear, and "Fly on" returns to the
town at dusk.
