# 10 — The Body

Step one, and it stands alone: no tiles, no gores, no pattern. `app/js/body.js`.

The parameter set is the one a made-to-measure service actually asks for, because
those are the measurements a person can take with a tape and a mirror.

## 1. What goes in

| Numeric | Categorical |
|---|---|
| units (cm / in) | belly protuberance **A–F** |
| height | buttocks shape **very curvy → very flat** |
| bust | posture **hollow back / military / round shoulders / saddle back / straight back** |
| underbust | shoulder slope **square / normal / slightly / very sloping** |
| waist | |
| low hip | |
| neck circumference | |
| back length (nape → waist, down the back) | |
| bust height from centre back neck point | |
| front length from centre back neck point | |
| back width | |
| apex to apex | |

Plus standard sizes EU 32–52 (with US / UK / FR / IT / RU labels), the asymmetry fields
no size chart offers, and the arms of §5.

Note what is **not** asked for: **bust projection**. It is nearly impossible to measure
on yourself, so the form asks instead for two lengths taken over the shoulder from the
centre back neck point and infers prominence from them. That is the classic
patternmaking trick, and it is why this parametrisation is better than the one it
replaced.

## 2. What comes out

Every measurement is reproduced to **under a tenth of a millimetre**:

```
bust               asked    92 -> model   92.00   err  0.004 cm
underBust          asked    76 -> model   76.00   err  0.002 cm
waist              asked    72 -> model   72.00   err  0.002 cm
lowHip             asked    98 -> model   98.00   err  0.003 cm
neckCircumference  asked    36 -> model   36.00   err  0.002 cm
backLength         asked    41 -> model   41.00   err -0.000 cm
apexToApex         asked    19 -> model   19.00   err -0.000 cm
apex to waist, front     24.0 -> model   24.00   err  0.000 cm
```

That is the only honest test of a body generator: **measure the model the way a tape
would, and check it against what you typed.** `measure()` does exactly that, and the
viewer has a *measure the model* button that prints the table.

Derived, not measured: bust projection **5.38 cm** and the apex at **21.9 cm above the
waist**. Both fall out of the solves.

## 3. How it is built

A stack of horizontal rings — low hip, high hip, waist, underbust, bust, chest,
shoulder, neck — each a superellipse solved to its girth, lofted, then displaced by the
shape fields.

Four things are solved numerically, by bisection, because each is monotone in its own
parameter:

1. **Neck height** from the back length (arc down the centre back to the waist).
2. **Bust apex height** from `front length − bust height`, which cancels the
   over-the-shoulder detour that a lofted torso has no shelf for.
3. **Bust projection** from the bust girth.
4. **Every ring's scale**, so its *measured* girth equals the measurement.

## 4. Four mistakes worth recording

**Double counting the bust.** The first version sized the bust ring to the measured bust
girth *and then added apex bumps on top*. The projection solve promptly railed into its
lower bound at 0.2 cm, because the ring was already as big as the measurement. The ring
at bust level is the **ribcage**; the apices are what take it from there to the measured
bust. Removing the double count also removed a calibration constant.

**Rings do not measure what they are named.** Even with the ribcage fix, the underbust
read **82 cm against 76 asked**, because the bust bumps bleed down onto the ring below.
A ring's nominal girth is not its measured girth once anything is added to the surface,
so each ring is now scaled until the tape agrees — and the arc solves are re-run,
because moving a ring moves the arcs that located it. Three rounds converge.

**Catmull-Rom gives the body wings.** The taper from the shoulder ring to the neck ring
is very sharp, and a Catmull-Rom spline overshoots on sharp turns, so the first render
had two pointed flanges where the shoulders should be. Replaced with a monotone cubic
(Fritsch–Carlson), which cannot overshoot: the surface now stays inside the
measurements that define it, and the test suite checks that nothing is wider than the
widest ring.

**The leg taper was zero at both ends.** The parameter that should run 0 at the crotch
and 1 at the knee read `(crotchDepth + y)` with `y` negative, so it hit 0 at the crotch
and clamped to 0 at the knee as well: every envelope ring from knee to crotch came out
identical, and the lower body was a straight tube. Visible instantly in a table of ring
widths, invisible in a render.

A fifth, from the previous model and found only when the new tests exercised it:
**`shoulderDrop` had never worked** — `point()` declared `y` with `const` and then
assigned to it, so the field threw the instant it was non-zero. Nothing had ever set it.

## 5. The lower body

Hips cannot be fitted from a tube that stops at the low hip, and skirts and dresses need
the legs. The ring stack now runs **knee to neck**:

```
ring         y      half-w  half-d   girth
knee       -58.0     10.9     6.2    57.2
midThigh   -40.0     12.8     8.3    70.1
crotch     -27.0     14.2     9.8    79.6
lowHip     -20.0     17.3    12.2    98.0     <- measured
highHip    -10.0     14.8    10.6    86.3
waist        0.0     12.6     9.1    72.0     <- measured
underBust   13.9     12.9     9.6    76.0     <- measured
bust        21.9     14.0    10.7    92.0     <- measured
chest       27.9     13.4    10.0    84.8
shoulder    33.6     19.6    10.4   103.0
neck        38.0      5.6     5.0    36.0     <- measured
```

**The body is a tube from the crotch up, and stops there.** Above the crotch a torso
really is one closed loop at every height; below it a body is *two* loops, one per leg,
and a tube parametrisation cannot express that. So below the crotch the body is legs:
articulated tapered tubes, not a surface.

Above the nape a short **neck column** continues, so that necklines and collars have
something to be cut against. No garment band reaches into it — `band()` tops out at the
nape — but it is there to cut against.

### What used to be there, and why it went

An earlier version carried the tube down to the knee as an *envelope* around both legs,
on the grounds that a skirt genuinely is that shape. It is. But a body is not, and
conflating the two had a visible cost: pose the legs and the envelope stayed put, so a
seated figure rendered as a vertical column with legs sticking out of it sideways. It
also made `landmarkV('knee')` mean something, which it should not.

The envelope is gone. A skirt is now drafted on the body **down to the crotch** and
extended to length with a chosen flare, which is how skirts are really drafted: below
the hip the body dictates nothing except how much room the legs need to move. That room
is still measured, by `legSpanAt()` off the leg tubes — it never needed the envelope.

`landmarkV('knee')` now refuses, with a message saying why.

New measurements: `thighGirth`, `kneeGirth`, `midThighGirth` (0 = taper smoothly),
`waistToHip`, `crotchDepth` (the rise), `waistToKnee`, `neckHeight`.

### Breadth and depth

A girth alone does not say what **shape** a cross section is: 98 cm of hip can be wide
and flat or narrow and deep, and they need different patterns. So the hip and the waist
take an optional breadth/depth pair.

Naming here follows apparel practice, which disagrees both with anthropometry and with
itself, so to be unambiguous:

| field | what it is | other names |
|---|---|---|
| `hipWidth` | low hip, side to side | *bitrochanteric breadth* (the bony version), *across hip* |
| `hipThickness` | low hip, front to back | *buttock depth*, *abdominal depth* |
| `waistToHip` | the **vertical** drop, waist to low hip | several drafting books call this one *hip depth* — which is exactly why the front-to-back measurement above is called thickness |

Giving a girth *and* a breadth *and* a depth over-determines the ellipse, so **girth wins
and sets the size, breadth and depth set the aspect ratio**, and `measure()` reports what
was achieved so the disagreement is visible:

```
hip 98 cm asked as 38 x 24  ->  36.0 x 22.9   girth still 98.0
hip 98 cm asked as 32 x 30  ->  30.6 x 28.9   girth still 98.0
```

### Named landmarks

Adding rings below the waist moved **every numeric `v`**. Anything holding a literal
silently started pointing somewhere else on the body, so landmarks now have names:

```js
body.landmarkV('waist')      // not 2/7, and no longer 2/7
body.band('skirt')           // { vLo, vHi } from knee to waist
body.bandArea('bodice')      // 0.525 m2, vs 0.822 m2 for the whole body
```

`band()` knows `bodice`, `skirt`, `dress`, `torso` and `full`. All three draft cleanly
off the same body:

`band()` knows `bodice` (low hip → nape), `skirt` (crotch → waist), `dress`
(crotch → nape), `torso` and `full`.

## 6. Arms, shoulders and poses

A full skinned game rig would buy animation this project has no use for. What it needs
from arms is an **armhole** and the ability to **move** and see what binds. So:

- The torso stays a clean `(u,v)` tube — everything downstream depends on that — and the
  arms are **jointed capsules** attached at shoulder joints derived from the back width
  and the shoulder slope, with a radius from the upper arm girth.
- Two pose angles: **abduction** (raise) and **flexion** (forward).
- The **armscye is found, not drawn**: it is the curve on the torso where the arm
  capsule comes within a margin of it. So it responds to back width, shoulder slope and
  pose instead of being an oval that has to be redrawn whenever the body changes.
- `includeArms` puts the arms into the collision test, so cloth cannot pass through a
  limb.

**The legs articulate the same way**: `legSpread` (abduction), `legForward` (hip
flexion, as in sitting) and `stride` (antisymmetric flexion, one leg forward and one
back). The garment surface stays the standing envelope and the limbs move through it.

Eleven predefined poses, which is what "movement" needs to be here — a handful of named
positions a garment has to survive, not an animation system:

```
pose                 armscye  cloth in the arm   fit on the torso alone
                        (cm)   verts   deepest   median gap  tension  verdict
Rest (arms down)        39.9      14      3.61         0.99     0.31  good fit
Arms forward            42.0      12      3.39         0.99     0.31  good fit
Reach across            54.3      10      3.22         0.95     0.26  good fit
Arms raised             39.0      12      4.08         0.99     0.31  good fit
Arms overhead           39.0      12      4.16         0.99     0.31  good fit
Slouched                39.8      12      3.69         0.99     0.39  tight
```

`node tools/poses.mjs`. Read it as three findings:

- **The armscye opens from 40 cm to 54 cm when you reach across.** That 14 cm is the
  range of motion a sleeve head and an armhole have to absorb, and it is measured here
  rather than taken on faith.
- **The gores survive every posture on the torso alone** (0.26–0.39 % tension). Only
  *Slouched* reads tight, which is right: round shoulders stretch the back.
- **10–14 garment vertices sit inside the arm, up to 4.2 cm deep.** That is the armhole
  the pattern still does not have — deepest with the arm overhead, so the hole has to be
  cut for the worst pose, not the resting one.

### What a skirt has to survive

For a skirt the question is not whether it fits standing — it is whether you can walk or
sit in it. `legSpanAt(y)` returns the convex hull of both leg cross sections at a height:
**the smallest circumference that can pass over them**. `clearanceProfile()` compares
that against what the garment offers, at every height it covers.

`node tools/skirt_poses.mjs`, on an 8-gore knee-length skirt with 1.2 cm ease:

```
pose                worst spare   at height   needs   offers
Rest (standing)            9.6         -58     61.3     70.9
Walking stride           -19.6         -56     91.7     72.1   <-- BINDS
Long stride              -44.7         -52    119.2     74.5   <-- BINDS
Climbing stairs          -26.7         -48    103.7     77.0   <-- BINDS
Legs apart               -23.9         -56     95.9     72.1   <-- BINDS
Sitting                    n/a    legs near horizontal
```

Negative spare is **what a vent, a pleat or a slit exists to fix**, quantified. And note
where the binding happens: at −56 and −52 cm, *not* at the −58 cm hem. Stride and the
knee rises, so the hem clears while the thigh is jammed — which is why the metric has to
profile the whole band rather than check the hem.

Three corrections were needed to get there, all of which made the number look fine while
being wrong:

- **The cross section was sampled in a vertical window** rather than as a true plane
  intersection, so the taper across the window inflated the radius and the legs came out
  fatter than the envelope containing them. A horizontal plane cuts a tilted cylinder in
  an **ellipse**: semi-minor is the radius, semi-major is radius ÷ cos(tilt).
- **The envelope assumed perfectly vertical legs.** Two degrees of spread moves them a
  centimetre apart by the knee, and the envelope was then narrower than its own contents.
- **Sitting reported −182 cm of deficit.** Past about 70° from vertical a horizontal
  plane slices the thigh along its *length*, and the hull it returns is not a girth
  anything has to pass over: a skirt drapes across a lap, it does not thread over it.
  Now flagged rather than reported as a number that looks like one.

That last line is the honest limit of the current state. Draping with arm collision
switched on is meaningless until the gores are trimmed against the armscye: the cloth
has nowhere to go, gets pinned between torso and limb, and every pose reports a
disaster. So `tools/poses.mjs` drapes against the torso alone and uses the arms only for
what they can honestly answer. **Trimming the gores against the armscye loop is the next
piece of work**, and it is a 2D boolean against the panel outlines (`python3-shapely`,
or the same offsetting code already in `panels.js`).
