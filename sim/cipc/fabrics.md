# Measured fabric parameters, from C-IPC

`docs/11-cloth.md` §8 has always said: *"Nothing is validated against real
fabric. The presets are plausible, not measured."* These are measured. They
come from `Python/Drivers/FEMDiscreteShellBase.py` in C-IPC, which takes them
from the cloth-measurement dataset used across the simulation literature
(Wang et al.'s data-driven elastic models, as also used by ArcSim).

They are recorded here rather than adopted, because adopting them means
deciding how a Young's modulus and a Poisson's ratio map onto this project's
XPBD compliances — which is a real piece of work and not a lookup.

| | areal density | thickness | E | ν | strain limit |
|---|---|---|---|---|---|
| cloth 0 | 150 gsm | 0.318 mm | 0.821 MPa | 0.243 | **6.1 %** |
| cloth 1 | 235 gsm | 0.568 mm | 0.170 MPa | 0.277 | **8.5 %** |
| cloth 2 | 178 gsm | 0.328 mm | 0.076 MPa | 0.071 | **13.4 %** |
| cloth 3 | 165 gsm | 0.252 mm | 0.478 MPa | 0.381 | **6.5 %** |
| cloth 4 | 240 gsm | 0.300 mm | 3000 MPa | 0.3 | 0.5 % |

Areal density is `density × thickness`, which is the unit this project uses;
cloth 4 is a near-rigid control rather than a fabric.

This project's presets, for comparison — the strain limits are the numbers
that decide whether a hole can be forced over a shoulder, and they are
guesses:

| | areal density | strain limit |
|---|---|---|
| cotton poplin | 120 gsm | 4.0 % |
| linen | 190 gsm | 3.0 % |
| wool crepe | 220 gsm | 6.0 % |
| silk habotai | 60 gsm | 4.0 % |
| cotton jersey | 180 gsm | 25.0 % |
| denim | 340 gsm | 2.0 % |
| interfaced twill | 260 gsm | 2.0 % |

**What stands out.** The measured wovens stretch considerably more than this
project assumes — 6 to 13 % against 2 to 4 %. If that is right, several
conclusions in docs/11-cloth.md that turn on the strain limit are drawn
against too stiff a cloth: in particular the hollow-disc experiment, where
"at 8 % it cannot [pass the shoulder], so it stops where the girth matches"
is the whole mechanism of the yoke/slip boundary.

C-IPC's source also carries commented-out weft/warp multipliers — anisotropy,
ratios of 2 to 128 between the two grain directions. That is the bias-cut
problem docs/11-cloth.md calls "a serious limit for the thing this project is
ultimately for", with data attached.
