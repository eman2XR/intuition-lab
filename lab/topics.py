"""Supported visual models constrain what the daily planner may promise."""
from .contracts import MODEL_NOTES

COMMON = '''
Shared player behaviour: a scene has three or four chapters. Chapter 1 automatically sets the first control (field
"mass") to zero; later chapters use the scene values. In the last chapter, unless this model says otherwise, playback
demonstrates the controls: during its first half the first control dips to about half and returns; during its second half
the second control (field "distance") moves to 2.5. Write the last chapter's sentences to describe those changes in that
order. The viewer reads one subtitle sentence at a time below the stage; screenshots show exactly what playback shows.
ray_count is unused unless this model says otherwise. The stage carries no scale or magnification disclaimers: drawings
are illustrations, and each model's caveats are shown once in the investigation details. Never say that a picture is not
to scale, enlarged or magnified, on the stage or in any text: drawings are obviously illustrations. Do not ask for such
labels or sentences.
Field controls chooses which sliders the viewer gets: none, first, second or both. Offer a slider only when moving
it builds intuition beyond what playback already shows; otherwise choose none.
The stage shows only a few short labels (each five words or fewer, at most about a dozen words at once, checked
automatically); the subtitles carry every explanation. Never write a sentence that relies on a label the model notes do
not list, and never ask for extra labels.'''

# Every model's notes end with the shared notes.
LIGHT_NOTES = MODEL_NOTES+COMMON

CLOCK_NOTES = '''CLOCK MODEL. Two stationary clocks outside a spherical, nonrotating mass.
Use Schwarzschild static-clock comparison: m=GM/c^2=.025*mass, lower radius r=distance,
upper radius R=r+2 (arbitrary units). Rate ratio lower/upper=sqrt((1-2m/r)/(1-2m/R)).
Mass 0..1, r 1..2.5. These are supported stationary observers, not freely falling clocks.
Each clock ticks normally locally; the ratio compares proper times over the same Schwarzschild
coordinate-time interval. Do not conflate this with a distant camera's raw view or Doppler effects.
The hands show the rate difference twelve times larger so it can be seen: displayed lower rate=1-12*(1-ratio).
The percentage readout gives the model value.
Three beats: 1 zero mass/equal rates; 2 add mass/two clocks; 3 adjust mass and lower radius.
Increasing mass increases the deficit; moving the pair outward with fixed separation reduces it.
No black holes, Earth-specific numbers, satellite velocities, or full GPS simulation.
Fields named mass/distance control mass/lower radius. The UI label is "Lower radius" with the hint "gap stays 2 units"; refer to it as "Lower radius". Prefer distance=1 initially so the comparison at 2.5 is clear. ray_count and line_width unused.
Explain gravitational time dilation intuitively without saying a clock is malfunctioning.
The lag is determined by the gravitational potential difference, not by the gradient of gravity (tidal forces). For a small fixed gap, the lag scales with local gravitational acceleration times the gap. Never say the lag is independent of gravity strength. No new-discovery claims; checks validate implementation only.'''+COMMON

SPACETIME_NOTES = '''SPACETIME DIAGRAM. Special relativity in flat spacetime, units of years and light-years (light speed 1).
Time runs up the page, space runs right; light moves at 45 degrees, and a shaded light cone from the departure event marks
everything reachable. A home twin stays at rest (vertical worldline, a tick each half year). A traveller leaves at constant
speed v, turns around instantly at home time T and returns at the same speed (straight out-and-back worldline, a dot each half
year of the traveller's own time). Field mass sets v = 0.9*mass (UI "Speed"); field distance sets T = 1.6*distance years
(UI "Trip length"). Moving markers sweep both worldlines upward in step with home time and label each twin's elapsed years.
A dashed line through the traveller shows the traveller's line of simultaneity ("now"); it tilts with speed and swings at
the turnaround. The readout is the real fractional ageing gap 1 - 1/gamma, gamma = 1/sqrt(1-v^2), independent of trip length.
Supported questions: moving clocks tick slowly, relativity of simultaneity, the twin asymmetry (the traveller changes
direction; the paths differ in spacetime length), and why speed stays below light speed (worldlines stay inside the cone).
The instant turnaround is an idealization; no acceleration physics, gravity, Doppler views or what anyone "sees" visually.
Do not claim the traveller feels time slow; each clock ticks normally for its owner. No new-discovery claims.'''+COMMON

INTERFERENCE_NOTES = '''TWO-SOURCE RIPPLE TANK. Top-down view of circular waves of one wavelength from two in-phase point sources,
drawn as crests (accent) and troughs (faint dark), plus a screen strip showing the time-averaged brightness
I = (1 + a^2 + 2a cos(k*path difference)) / (1+a)^2. Field mass sets the second source amplitude a (UI "Second source",
0 means off); field distance sets source spacing 1.6*distance wavelengths (UI "Source spacing"). The readout is fringe
contrast 2a/(1+a^2). Supported questions: superposition (waves add and pass through each other), constructive and
destructive interference, why stripes need two coherent sources, why wider spacing packs stripes closer. Amplitude falls off
as 1/sqrt(distance) (2D). No light/sound specifics beyond analogy, no single-photon claims, no diffraction
from slit width. No new-discovery claims.'''+COMMON

PARTICLE_NOTES = '''ONE-AT-A-TIME TWO-SLIT EXPERIMENT. A source sends particles toward a barrier with two slits; each arrival
appears as one dot on a screen, and a histogram beside the screen fills in. Arrivals are pseudo-random samples drawn from the
predicted probability pattern: a broad single-slit envelope times (1 + a^2 + 2a cos(phase)). Faint ripples spreading from the
source and through each open slit depict the probability amplitude, NOT a particle trajectory; never say the animation shows
which slit a particle used. Field mass sets the second slit's amplitude a (UI "Second slit", 0 closed, 1 fully open);
field distance sets slit spacing (UI "Slit spacing"). show_reference draws the predicted pattern as a dashed curve. The
readout is fringe contrast 2a/(1+a^2). Supported questions: why single particles still build stripes, why closing a slit
removes them, probability amplitudes adding. Do not model measurement/which-path detectors, decoherence, or specific
particles' wavelengths; electrons and photons both show this, but the sketch is generic.
No new-discovery claims.'''+COMMON

ROPE_NOTES = '''STANDING WAVES ON A ROPE. A drawn hand shakes one end of a rope tied to a wall; the rope is simulated
with the damped wave equation (length 1, wave speed 2, a little friction), so the slowest in-step shaking is one shake a
second (all slowed down). Five chapters with fixed choreography and no slider demo: 1 one shake, a hump runs to the wall and
comes back upside down (shown extra slowly); 2 steady shaking at 1 a second, in step, the swing builds to about 6 times
the hand's; 3 shaking at 1.5 a second, out of step, the rope only jiggles; 4 shaking at 2 a second (two loops and a still
point) then, from the chapter's second sentence, 3 a second (three loops); 5 a guitar string, plucked open
(220 Hz) and, from the third sentence, pressed at the middle and plucked again (440 Hz). The rope is silent; only plucks sound. Labels: your hand, tied to a wall, shakes a
second, in step: N loops, still point, out of step. Readout: the steady swing for the current shaking, as a multiple of the
hand's. Sound: a tone at 220 Hz per shake a second, as loud as the rope swings. After playback the field distance sets the
shaking rate 0.5 + 2*(distance - 1) (UI "How fast you shake"); field mass is how hard the hand shakes. Supported questions:
why a string rings only at certain notes, why in-step shaking builds a big swing (like pushing a swing), why still
points appear. No tension, mass density or real instrument acoustics beyond analogy. No new-discovery claims.'''+COMMON

TUNNEL_NOTES = '''QUANTUM BARRIER (TUNNELLING). Exact steady-state solution of the one-dimensional Schrodinger equation
(units hbar = 1, 2m = 1, particle energy E = 1, wavelength 2 pi) for a stream of particles meeting a rectangular barrier.
Drawn: a band for the barrier; the real part of the wave at one instant (line, rotating in phase over time) and its
magnitude (shaded band). Left of the barrier the incoming and reflected waves overlap into ripples; inside it decays (or
oscillates if the barrier is lower than the energy); right of it the transmitted wave is flat in magnitude.
Field mass sets barrier height V = 2*mass*E (UI "Barrier height", shown as a multiple of the energy, 0 = none); field
distance sets width 0.6*distance (UI "Barrier width", shown in wavelengths). The readout is the exact reflected fraction R;
the canvas prints the transmitted percentage T = 1 - R. Supported questions: how a particle can pass a barrier taller than
its energy, why thicker or taller barriers let less through, why some reflects even from a low barrier. This is a steady
stream, not one particle's path; do not say the particle "borrows energy" or travels inside the barrier classically.
No new-discovery claims.'''+COMMON

PACKET_NOTES = '''A BLEND OF WAVES (WHY A SHARP PLACE MEANS A BLURRY SPEED). Exact sums of waves k = 2 + j*pi/16, every
wave at its crest at the centre, with bell-curve amounts (units hbar = 1, drawn at one instant). Top: one row per wave mixed
in, slower (longer) waves at the top; middle: all of them added together, with a shaded band where the particle is likely
to be; bottom: bars showing how much of each wave length (pitch, then speed) is in the mix, on a fixed axis. Four chapters
with fixed choreography and no slider demo: 1 a long beep: one wave, then from the second sentence a second, slightly
higher one, so the sum swells and cancels (marked "line up: loud" and "cancel: quiet"); 2 pitches in between join one by one
and make one short click, marked "all in step" at the centre and "out of step: they cancel" to the sides; 3 the same picture
relabelled as a particle's wave (shaded band; from the second sentence "longer waves: slower", "shorter waves: faster");
4 the rows fade, brackets show how wide the burst is in place and in speed, and from the second sentence the burst is
squeezed (the blend widens) and then spread out (the blend narrows). Readout: how many waves are blended. After playback
field mass sets the blend's width, 0.5*mass (UI "Blend of speeds"; near 0 one wave, spread everywhere). For a bell-curve
blend the burst's width times the blend's width is one half, the smallest allowed. Supported questions: why pinning down
place blurs speed, why a short sound has no clear pitch. Do not describe uncertainty as measurement clumsiness or
disturbance; it is a property of waves. No new-discovery claims.'''+COMMON

WELL_NOTES = '''A WAVE IN A TRAP (WHY ONLY CERTAIN ENERGIES). A particle's wave in a one-dimensional square pit of depth 16
and width 2 (units hbar = 1, 2m = 1), drawn around its energy line with the area between them shaded; the walls and the rock
under the floor are ground. A trial wave starts fading into the left wall; in the walls it can only fade or grow, and only
at the three allowed energies does it fade into the right wall too (exact shooting solution, Physics.wellShoot). Five
chapters with fixed choreography and no slider demo: 1 the symmetric wave inside the trap, its energy rising from the
second sentence so it wiggles more; 2 the same energy with the walls: it fades into the left wall and grows without end
in the right one (warm, cut at the picture's edge), with from the second sentence "impossible" and a dashed "needed:
fades" tail; 3 during the first two sentences the energy rises through every value (almost every wave grows in the right
wall, the counter stays at 0), and with the third it comes back down and stops at each allowed energy (marked "allowed");
4 the three allowed waves with 1, 2 and 3 loops; 5 an atom: from the second sentence three drops between allowed energies,
one at a time, each giving off light of one colour (bigger drop, bluer; colours illustrative) onto a spectrum strip.
Readouts: allowed energies found, allowed energies, colours given off; after playback, whether the chosen energy is allowed.
After playback field mass sets the trial energy (UI "Energy"; it clicks onto an allowed energy when close) and field
distance the trap's width, 1 to 2.5 (UI "Trap width"; a wider trap holds more, lower energies). Supported questions: why a
trapped particle has only certain energies, why atoms glow in certain colours. Energies are to scale.
A square pit is not an atom; no spin or 3D. No new-discovery claims.'''+COMMON

FALL_NOTES = '''MOST-TIME PATH (WHY THINGS FALL). Weak gravity, slow motion, schematic units with effects hugely exaggerated.
Two clocks leave the ground together and meet again a time T later: one is held at the ground, one is thrown up and falls
back. Between those same two events, a path's elapsed (proper) time is T plus the integral of (g h - v^2/2): height gains
time because clocks run faster higher up, speed loses time. Drawn: height against time with
warm shading where clocks run slower, a side view of the same throw straight up, four paths between the same two events
(held at the ground, a low throw, the real throw with apex g T^2 / 8, a high throw at 1.75 times that), and a scoreboard
that builds up each path's height gain and speed loss as the clocks travel, with a tick at the total; the real throw ends
with the most time, a throw twice as high gains nothing. With gravity off, every throw only loses and staying put wins. Field mass sets gravity
g = 0.8*mass (UI "Gravity", 0 = none); field distance sets T = 2 + 2*(distance - 1) (UI "Time in the air"). The readout is
the best path's extra time as a fraction of T, g^2 T^2 / 24 in these units. Supported questions: if gravity slows time,
why do things fall; why free fall is the path of most elapsed time; why gravity is mostly a time effect for slow objects.
This is the weak-field, low-speed limit only; not a black hole, orbit or precise Earth numbers. No new-discovery claims.'''+COMMON

GAP_NOTES = '''SINGLE-GAP DIFFRACTION. Top-down ripple tank: a plane wave of one wavelength arrives at a barrier with one
gap; below the gap the wave is drawn as a Huygens sum of in-phase point sources across the gap (crests accent, troughs faint
dark). A screen strip shows the time-averaged single-slit pattern I = (sin x / x)^2, x = pi * gap * sin(angle) / wavelength,
with dashed lines at the first dark directions sin(angle) = wavelength / gap. Field mass sets the gap: 0 removes the barrier
entirely (no spreading); higher values narrow it from 4.2 to 0.7 units (UI "Gap"). Field distance sets the wavelength
0.7 to 1.15 units (UI "Wavelength"). The readout is the angle of the first dark direction (90 degrees when the gap is
narrower than the wavelength). Supported questions: why waves spread after a narrow gap, why narrower gaps and longer
waves spread more, why sound bends around doorways more than light. No single-photon claims.
No new-discovery claims.'''+COMMON

TWIN_NOTES = '''TWIN TRIP. Special relativity, exact, in years and light-years (light speed 1), drawn as a concrete scene:
Earth on the left, a destination star on the right, and a rocket that flies out at constant speed v, turns around
instantly, and flies back. Below, each twin has an age bar that grows with that twin's own time, with one notch per birthday
and a small clock beside it (one turn per year); at the reunion one line states how many years younger the traveller is.
Field mass sets v = 0.9*mass (UI "Speed", shown as a percentage of light speed; 0 keeps the rocket on Earth); field
distance sets the turnaround at T = 1.6*distance home years (UI "Trip"). The star's distance v*T light-years is labelled.
The readout is the real ageing gap 1 - 1/gamma, independent of trip length. Supported questions: why a moving clock
ticks slowly, why the travelling twin is younger, why nothing can be pushed past light speed (gamma grows without
limit as v approaches 1). Each clock ticks normally for its owner; do not say the traveller feels time slow. The instant
turnaround is an idealization; no acceleration physics, gravity or Doppler views. No new-discovery claims.'''+COMMON

PATHS_NOTES = '''SPACETIME PATHS (WHY THE TRAVELLER IS YOUNGER). Special relativity in flat spacetime, years and light-years
(light speed 1). Each chapter has its own drawing, and there is no slider demo. Chapter 1: a map of space and time (time up,
distance from Earth sideways), light's dotted 45-degree path, one dot per year on each twin's path; the first control is
zero, so both twins share one straight path. Chapter 2: two light clocks (light bouncing between two mirrors, one tick per
crossing), one on Earth and one on a rocket moving at v, seen from Earth: the rocket's light must slant to hit the moving
mirrors, a longer path at the same speed, so each tick takes longer; tick counters and a line "the rocket clock ticks N
times for every 10 on Earth". Chapter 3: the trip on the map, out to a star v*T light-years away and back; the traveller's
slow clock gives fewer dots; readouts "Home twin's clock" and "Traveller's clock" in years, "Each leg: T years pass on Earth,
T/gamma on the traveller's slow clock", and at the reunion how many years younger the traveller is. An optional chapter 4
holds the finished trip for discussion, for example why the home twin is not the younger one: while both coast each sees
the other's clock run slow, but only the traveller turns around and feels it, so only their path bends; between two
meetings the straight path holds the most time, though on the map the bent one looks longer. Field mass sets v = 0.9*mass
(UI "Speed"); field distance sets T = 1.6*distance years (UI "Trip"); the viewer can drag the turnaround. Prefer speeds
where the numbers do not coincide (for example mass 0.9623 gives 87% of light speed and exactly half the time). The
readout is "Traveller's clock counts less by" 1 - 1/gamma, independent of trip length. Define a light-year when it is
used. Each clock ticks normally for its owner. The turnaround is instant; no acceleration physics, gravity or Doppler views.
No new-discovery claims.'''+COMMON
LIGHT_CLOCK_NOTES = '''LIGHT CLOCK (WHY A MOVING CLOCK TICKS SLOWLY). Special relativity; light's speed is the same for every
observer, as experiments since 1887 show. Drawn: two light clocks, each two mirrors with light bouncing between them, one
tick per crossing. Top: a clock on Earth whose light goes straight up and down. Bottom: the same kind of clock on a rocket
moving right at speed v, seen from Earth; its light must slant to hit the moving mirrors, tracing a dashed zigzag, a longer
path at the same speed, so each tick takes longer; the rocket crosses the stage once per chapter. Dots along both light
paths mark equal steps of time, so light visibly covers the same distance per step but needs more steps on the slant. Each
clock's label carries its tick count, and after a few seconds a line says how many times the rocket clock ticks for every
10 on Earth (10/gamma). In the last chapter playback speeds the rocket up to 90% of light speed (no dip), so write that
chapter about approaching light speed. Field mass sets v = 0.9*mass (UI "Speed", shown as a percentage of light speed; 0 parks the rocket and
the clocks agree); field distance is unused, so set controls to "first" or "none". The readout is how much slower the
rocket clock ticks, 1 - 1/gamma. Supported questions: why a moving clock ticks slowly, why the effect only matters near
light speed, why clocks agree again when the rocket stops. Honesty points: the rocket clock ticks normally for anyone on
board; the slowing is how the moving clock runs as measured from Earth, and the crew would say the same of Earth's clocks
while both coast; every kind of clock, and the crew's bodies, slow the same way, or the crew could tell they were moving.
No twin-paradox resolution, acceleration, gravity or Doppler effects. Slowed down for viewing.
No new-discovery claims.'''+COMMON

ATTENTION_NOTES = '''HOW ATTENTION LED TO CHATBOTS. Exact softmax attention (scaled dot products of hand-made four-number vectors, as in
"Attention Is All You Need", 2017) for guessing the next word of "I grew up in France, so I speak fluent ___". Six
chapters with fixed choreography and no slider demo: 1 the sentence types itself and the model guesses "French" (bars for
French, English, Spanish), then adds it and a new blank waits; 2 the clue "France" is marked five words back, then a
one-at-a-time memory reads the words and the clue fades in it, leaving an unsure guess (French 39%, English 34%); 3 equal
lines from the guess back to every earlier word, then "speak fluent" is marked and the guess asks "which language?", then
the lines take their shares (France 63%, speak 13%, fluent 9%), the clue's line glowing, and the guess becomes clear
(French 70%); 4 how it knows: three practice sentences (Spain/Spanish, Japan/Japanese, Brazil/Portuguese) appear and each
language is linked back to its country; 5 every word looks back at the ones before it at once (a faint web), pulsing
together (attention already helped one-at-a-time models; the leap was attention alone), while it still writes
one word at a time; 6 the web stacked in layers (named the Transformer in the paper,
stacked far deeper later), and the answer fills in; the last chapter names ChatGPT and says it also
needed far bigger models and training on people's feedback. After playback field mass sets how much
attention is used (UI "Attention"; 0 is the fading memory alone). Readout: the chance of "French". The guesses come from a
toy rule. Supported questions: how the 2017 paper led to chatbots, what attention does, why it looks at the clue, where
those matches come from, why it allowed training on vast text. Honesty points: hand-made numbers; real models learn them,
split words into pieces and run many heads in dozens of layers; older recurrent models kept more than the fading memory
suggests but could not be trained on all words at once; attention itself is older than 2017; the first GPT came in 2018.
No claims that models understand.'''+COMMON

# Models whose picture explains why, not only what, and that passed owner review and beginner tests.
SPEED_NOTES = '''SPEED LIMIT (WHY NOTHING CAN TRAVEL FASTER THAN LIGHT). Special relativity. The measured facts: light
from a moving source is no faster (CERN 1964: gamma rays from particles moving at 99.975% of light speed still travelled
at light speed), and a moving lab measures light at the same speed in every direction (Michelson and Morley 1887 on the
moving Earth, and far more precise tests since). Four chapters with fixed choreography and no slider demo. 1: a chart
whose top line is light speed and whose steps are equal pushes; in a window above it the rocket fires one push and
coasts, while its speed seen from the ground rises to half light speed on the chart; with the second sentence the window
fades and a dashed line shows everyday adding, half plus half reaching light speed and a third push passing it. 2: the
chart dims and the window shows, from the ground, the rocket coasting at half light speed past a lamp post; as it
passes, its own lamp and the post's lamp flash together, a second before the second sentence starts, and the two flashes
travel side by side at light speed, leaving faint trails back to the post, while the rocket falls behind: the rocket's
speed adds nothing to its light. Write the second sentence about the flashes travelling. 3: the window shows the view
from the rocket (labelled): the rocket stays put, the ground streams back at half light speed, and the crew's lamp
flashes once, early in the first sentence, and the flash pulls away at full light speed, with a faint trail back to the
rocket; with the second sentence the rocket pushes again, the ground streams back faster, and the same flash still pulls
away at exactly the same speed. This is the reason: even the flash already ahead still pulls away at full light speed
after every push, so the crew never gain on light and can never catch it (point to that flash, not to new ones, whose
lamp moves with the crew). Say that both views are right: from the ground the flash pulls ahead of the rocket at only
half light speed, while the crew measure it pulling away at full light speed, because moving clocks and rulers differ
(the light-clock guide). 4: the same push again and again, under the faint dashed line of everyday adding; with the
first sentence the speed seen from the ground goes to 80% and then 93%, with the second to 98%, 99.2% and 99.7%, each
step smaller, all under the light-speed line; after the last step a magnifier above the chart shows the top of it zoomed
in, the last steps clearly below the line. Link it to chapter 3: if speeds simply added, the crew would gain on light.
The rule that keeps light at light speed for everyone also combines the rocket's speeds, so half plus half gives 80%
((0.5+0.5)/(1+0.5x0.5)), not 100%. Define the push as the crew feel it: each one leaves the rocket at half light speed
relative to a marker it dropped just before, and the crew feel every push the same. After playback field mass sets the
number of pushes, 0 to 10 (UI "Pushes"); field distance is unused, so set controls to "first". The readout is the speed
seen from the ground. Exact for equal pushes: after n pushes the speed is tanh(0.549 n), 99.997% after ten. Supported
questions: why nothing can go faster than light, why pushing harder or longer does not help, why light from a moving
lamp is not faster, why this does not show up at everyday speeds. The picture shows no energy; a sentence may add that,
seen from the ground, each push adds more kinetic energy per kilogram than the last, without limit (say per kilogram: a
rocket that burns fuel loses mass; on board every push feels the same), but energy is a consequence, not the reason.
Honesty points: nothing on board gets heavier, and the crew feel no limit or resistance; light speed is not a wall or
ceiling; never claim the crew see the ground's gap; massless things such as light always move at light speed; why
signals cannot outrun light rests on cause and effect and is not covered; distant galaxies can recede faster than light
because space itself expands, which is not motion through space and is not covered here. Motion on screen is slowed for
viewing.'''+COMMON

NIGHT_NOTES = '''DARK NIGHT SKY (OLBERS' PARADOX: WHY IS THE NIGHT SKY DARK?). The belief it confronts: space is dark because it
is empty, or because distant stars are too far and faint to count. Start from what anyone can see: thousands of stars,
black sky between them. The idea: if space were endless, unchanging and evenly filled with stars, a shell of stars twice
as far would hold four times as many stars, each a quarter as bright, so every shell would add the same light; and in
every direction a sight line would sooner or later end on the surface of a star, so the whole sky would be as bright as
the Sun's surface (the half of the sky above you has room for about 92,000 Sun discs). The night is dark mainly because
the universe has a finite age, about 13.8 billion years: light needs time to travel, so only light from within a limited
distance has had time to reach us, and stars only shine for limited times (Edward Harrison's analysis: there is nowhere
near enough time or starlight to fill the sky). The expansion of the universe also stretches and dims distant light, a
smaller effect. So the dark night sky tells us the stars have not been shining forever: one clue that the universe had
a beginning, not a proof (an old, steady, expanding universe could also have a dark sky). Say that light from far
enough away has not had time to reach us; do not say the universe goes on forever or has an edge, and say that every
place has its own such bubble (the farthest places we see are now about 46 billion light-years away). Model numbers
(Physics.nightChecks): Sun-like stars spread evenly, about 10^22 in today's observable universe (a rough count; estimates
run from 10^22 to 10^24); a sight line then typically travels about 2 x 10^24 light-years before meeting a star, over ten
trillion times farther than light travels in 13.8 billion years; within 13.8 billion light-years stars cover about 1 part
in 180 trillion of the sky (out to today's 46.5 billion light-years, about 1 part in 50 trillion). Four chapters with fixed
choreography and no slider demo; the label "you" stands by a person on a hill throughout. 1 (two sentences): a night
landscape; dusk turns to night during the first sentence while the stars and the Milky Way come out; with the second a
dashed ring circles a dark patch between the stars, labelled "dark between stars". 2 (three sentences): the sky dims and
rings of stars around you, a slice through space, appear one after another out to the edge of the stage during the
first sentence (the thought experiment: stars evenly everywhere, forever, never changing); with the second, a nearer
and a farther ring are highlighted, labelled "nearer shell" and "more stars, each dimmer"; with the third, sight lines
spread from you across the sky, each ending on the first star it meets, and then the whole sky blazes warm white,
labelled "as bright as the Sun". In the slice a ring twice as far holds twice as many stars (a full shell, four times):
never ask viewers to count them. 3 (three sentences): the blaze fades and the stars become faint marks; during the first
sentence (the universe began about 13.8 billion years ago and light takes time to travel) a bubble grows around you,
labelled "13.8 billion light-years", and the stars inside it shine; with the second, light from stars beyond it creeps
inward, labelled "light still on its way": those stars may be there, but their light has not arrived; with the third,
sight lines go out again: a few end on stars inside the bubble, the rest cross it and find only darkness, so the night
stays dark. 4 (two or three sentences): the rings fade back into the night landscape during the first sentence (the dark
night tells us the stars have not shone forever, one clue to a beginning); with the last sentence a wave labelled "oldest light" travels from high in the sky to
you, stretching and turning from gold to red as it fades, labelled "stretched out of sight": write that last sentence
about the expansion of the universe stretching the oldest, most distant light into microwaves our eyes cannot see
(the cosmic microwave background). After playback field mass
sets the age of an unchanging universe (UI "Age of the universe"): 0 is no time at all, so no starlight; 0.07 is today's
13.8 billion years; each further 0.01 multiplies the time by about 1.5, up to about 10^26 years. Set mass to 0.07 and
controls to "first"; field distance is unused. The readout is the share of the sky covered by stars whose light has
arrived (about 1 part in 180 trillion today); the sky's glow follows it on a log scale and fills only after about 10^24 to
10^25 years. Supported questions: why the night sky is dark; why more distant stars do not make up for looking dimmer;
why the dark sky shows the universe had a beginning; why we cannot see beyond a certain distance; why dust between the
stars is not the answer (it would absorb starlight, warm up and glow as brightly itself). Honesty points: finite age,
together with the limited lives of stars, is the main reason; expansion and the stretching of light (redshift) are
secondary; looking far away is looking back in time, so the bubble is the region whose light has had time to reach us,
not an edge of space, and nothing here claims the universe is finite in size; 13.8 billion light-years is the distance
light has travelled; because space expanded meanwhile, the farthest places we see are now about 46 billion light-years
away; "a beginning" means the hot, dense early state about 13.8 billion years ago from which everything we see
developed, not an explosion at a point, and say nothing about what came before; the oldest light, from about 380,000
years after the beginning when the whole universe glowed like a star's surface, arrives from every direction stretched
about 1,100 times into microwaves (the cosmic microwave background), far too stretched to see; Kepler (1610) and Olbers
(1823) posed the puzzle, and Edgar Allan Poe guessed the answer in 1848. Suggested sources: Wikipedia "Olbers's paradox"
and "Observable universe"; Edward Harrison, "Darkness at Night: A Riddle of the Universe" (Harvard University Press,
1987); NASA's WMAP pages on the age of the universe and the cosmic microwave background; ESA's Planck results.'''+COMMON

# Only these are planned; the others wait for a redesign. attention (2026-10-29) was added at the owner's request
# for the next run after subagent beginner tests; the owner has not reviewed its picture yet. night-sky (2026-11-01)
# was added at the owner's request for the next run.
READY = {'light-bending', 'gravity-clocks', 'spacetime-paths', 'light-clock', 'interference',
         'diffraction', 'speed-limit', 'night-sky'}
# Not ready (2026-10-28): twin-trip shows what rather than why; spacetime, falling-time and tunneling are graph-style;
# standing-waves, quantum-well (five chapters), attention (six) and wave-packet (four chapters) are hand-made guides
# with fixed choreography, which agent-written scenes would not match;
# two-slit-particles failed a beginner test (faint ripples, slits read as one gap, unexplained screen marks, stripes
# form before the narration says so).

TOPICS = {
    'light-bending': {'label':'Light bending', 'question':'Why does gravity bend light?', 'notes':LIGHT_NOTES},
    'gravity-clocks': {'label':'Gravity and clocks', 'question':'Why do clocks at different heights tick at different rates?', 'notes':CLOCK_NOTES},
    'twin-trip': {'label':'Twin trip', 'question':'Why is the travelling twin younger?', 'notes':TWIN_NOTES},
    'light-clock': {'label':'Light clock', 'question':'Why does a moving clock tick slowly?', 'notes':LIGHT_CLOCK_NOTES},
    'spacetime-paths': {'label':'Paths through spacetime', 'question':'Why is the travelling twin younger?', 'notes':PATHS_NOTES},
    'spacetime': {'label':'Spacetime diagram', 'question':'Why is the travelling twin younger?', 'notes':SPACETIME_NOTES},
    'interference': {'label':'Wave interference', 'question':'What happens when two waves meet?', 'notes':INTERFERENCE_NOTES},
    'two-slit-particles': {'label':'Particles through two slits', 'question':'Why do particles fired one at a time still make stripes?', 'notes':PARTICLE_NOTES},
    'standing-waves': {'label':'Standing waves', 'question':'Why does a guitar string only play certain notes?', 'notes':ROPE_NOTES},
    'tunneling': {'label':'Quantum tunnelling', 'question':'How can a particle pass through a wall it cannot climb over?', 'notes':TUNNEL_NOTES},
    'wave-packet': {'label':'Wave packets and uncertainty', 'question':"Why can't you pin down both where a particle is and how it moves?", 'notes':PACKET_NOTES},
    'falling-time': {'label':'Why things fall', 'question':'If gravity slows time, why do things fall?', 'notes':FALL_NOTES},
    'diffraction': {'label':'Spreading through a gap', 'question':'Why do waves spread out after passing a narrow gap?', 'notes':GAP_NOTES},
    'quantum-well': {'label':'Allowed energies in a well', 'question':'Why can a trapped particle only have certain energies?', 'notes':WELL_NOTES},
    'speed-limit': {'label':'Speed limit', 'question':'Why can nothing travel faster than light?', 'notes':SPEED_NOTES},
    'night-sky': {'label':'Dark night sky', 'question':'Why is the night sky dark?', 'notes':NIGHT_NOTES},
    'attention': {'label':'Attention in language AI', 'question':'What does the “attention” in “Attention Is All You Need” do when an AI reads a sentence?', 'notes':ATTENTION_NOTES},
}
