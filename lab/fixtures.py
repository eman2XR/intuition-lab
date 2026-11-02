"""Hand-authored offline example; NEVER represented as live agent output."""
from copy import deepcopy

RESEARCH = {
    'claim': 'A massive object changes the path of light passing nearby.',
    'explanation': 'General relativity describes gravity through the geometry of spacetime. Light follows a null geodesic: the natural path for light in that geometry. Near a mass, that path can look bent when viewed from far away.',
    'assumptions': ['An isolated, spherical, non-rotating mass.', 'Light passes far outside the strong-gravity region.', 'A first-order weak-field approximation; source and observer are treated as distant.'],
    'prediction': 'At the same passing distance, doubling the mass doubles the small deflection angle. At the same mass, doubling the passing distance halves it.',
    'falsifier': 'A precise measurement of light deflection inconsistent with the predicted angle, after accounting for the mass, geometry and measurement uncertainty, would challenge this model in its stated regime.',
    'misconceptions': ['Gravity pulls on light the way it pulls on a ball.', 'Light slows down near a mass.'],
    'questions': [{'q': 'Does light slow down as it passes the mass?', 'a': 'No; measured right beside it, it still moves at light speed.'},
                  {'q': 'Would a closer pass bend the light more or less?', 'a': 'More.'},
                  {'q': 'Does light need to have weight to be bent?', 'a': 'No; it follows the straightest path the geometry allows.'}],
    'limitations': ['Bending is magnified six times in the drawing.', 'This is not a black-hole simulation or a literal picture of curved spacetime.', 'The moving dot illustrates a path; its screen speed is not a physical measurement.', 'Passing these checks does not establish a new scientific result.'],
    'sources': [
        {'title': 'Einstein Online · Gravitational deflection of light', 'url': 'https://www.einstein-online.info/en/spotlight/light_deflection/', 'supports': 'General relativity predicts gravitational light deflection, tested with astronomical observations.'},
        {'title': 'Einstein Online · The equivalence principle and light', 'url': 'https://www.einstein-online.info/en/spotlight/equivalence_light/', 'supports': 'Local equivalence alone does not determine the full deflection; spacetime geometry matters.'},
    ],
}
SCENE = {
    'title': 'Light takes the natural path.\nGravity changes the geometry.',
    'subtitle': 'An introduction to general relativity, one beam of light at a time.',
    'why': 'Light bending around the Sun was the first test of Einstein’s gravity, and it lets telescopes weigh galaxies.',
    'beats': [
        {'title': 'First, a universe without this mass.', 'body': 'Follow the beam. With no nearby mass in this model, its path is straight. The faint line is our reference: where the light would go without the object.'},
        {'title': 'Now put something massive in its way.', 'body': 'The mass changes the geometry of spacetime around it. Light follows a natural path through that geometry. From this distant view, the path bends toward the mass.'},
        {'title': 'Same light. A different route.', 'body': 'Increase the mass, then move the beam farther away. More mass means more bending; a more distant pass means less. Light still travels at the speed of light when measured locally.'},
    ],
    'mass': 0.7, 'distance': 1.25, 'ray_count': 3,
    'show_reference': True, 'show_labels': True, 'accent': 'mint',
    'line_width': 2.5, 'duration': 24, 'controls': 'both',
    'takeaway': 'Gravity does not need to give light a rest mass. It changes the spacetime geometry that light travels through.',
}


class FixtureProvider:
    name = 'fixture'
    calls = 0
    usage = []

    def generate(self, role, prompt, schema=None, images=(), research=False):
        self.calls += 1
        if role == 'planner':
            # Choose the first model the coordinator allows.
            topic = (schema or {}).get('properties', {}).get('topic', {}).get('enum', ['gravity-clocks'])[0]
            return {'topic':topic,'question':'Why does a lower clock accumulate less time?', 'reason':'Compare two stationary clocks.', 'request':0}
        if role == 'scout':
            return 'OFFLINE FIXTURE: no live search performed. https://example.org/fixture-note'
        if role == 'architect':
            return {'proposals': [{'title': 'Fixture proposal', 'area': 'website', 'problem': 'Offline example.',
                    'proposal': 'Offline example.', 'benefit': 'None; fixture only.', 'effort': 'small', 'risk': 'None.',
                    'evidence': ['https://example.org/fixture-note']}]}
        if role == 'researcher':
            return 'OFFLINE FIXTURE: hand-authored source notes, no live search performed.'
        if role == 'scientist':
            return deepcopy(CLOCK_RESEARCH if 'CLOCK MODEL' in prompt else RESEARCH)
        if role == 'designer':
            return {'idea': 'Fixture idea: compare the paths.', 'start': 'Fixture start.', 'belief': 'Fixture belief.',
                    'reason': 'Fixture reason: the reference path shows the difference.', 'try': 'Fixture try.',
                    'chapters': [{'show': f'Fixture chapter {n}.', 'changes': 'Fixture change.', 'label': ''} for n in (1, 2, 3)],
                    'fits_engine': True, 'missing': ''}
        if role == 'writer':
            match = next((s for key, s in ENGINE_SCENES.items() if key in prompt), None)
            scene = deepcopy(match or (CLOCK_SCENE if 'CLOCK MODEL' in prompt else SCENE))
            if 'Previous scene' not in prompt:
                scene.update(show_reference=False, show_labels=False, line_width=1)
            return scene
        if role == 'visual_reviewer' and '"show_reference": false' in prompt:
            return {'pass': False, 'score': 5, 'summary': 'Fixture critique: the bent path has no baseline for comparison.', 'changes': ['Enable the straight reference path and labels.', 'Increase line width to 2.5 for small screens.'], 'blocking_issues': ['Missing visual comparison.']}
        return {'pass': True, 'score': 8, 'summary': 'Fixture review only: scripted acceptance exercises the pipeline.', 'changes': [], 'blocking_issues': []}

CLOCK_RESEARCH = {
    'claim':'Stationary clocks closer to a spherical mass accumulate less proper time than clocks farther out.',
    'explanation':'Each clock operates normally nearby. Comparing their elapsed times reveals the gravitational difference.',
    'assumptions':['Stationary, supported clocks outside a nonrotating spherical mass.', 'Comparison over the same coordinate-time interval.'],
    'prediction':'Increasing mass increases the relative rate difference; moving both clocks outward reduces it.',
    'falsifier':'A corrected comparison of stationary clocks inconsistent with this rate ratio would challenge the model.',
    'misconceptions':['The lower clock is broken or badly made.'],
    'questions':[{'q':'Is the lower clock faulty?','a':'No; each clock ticks normally where it is.'},
                 {'q':'Does more mass make the difference bigger?','a':'Yes.'},
                 {'q':'What happens with no mass?','a':'The clocks agree.'}],
    'limitations':['Animated rate differences are magnified 12 times.', 'Distances are schematic, in arbitrary units.', 'No velocity effects or Earth-specific predictions.'],
    'sources':[{'title':'NIST: Relativity and Optical Clocks','url':'https://www.nist.gov/publications/relativity-and-optical-clocks','supports':'Measurements of gravitational time dilation using optical clocks.'}],
}
CLOCK_SCENE = {**deepcopy(SCENE),
    'title':'Same clocks. Different elapsed time.',
    'subtitle':'Compare two stationary clocks at different distances from a mass.',
    'why':'Satellite navigation corrects for this effect every day.',
    'beats':[
        {'title':'Start with matching clocks.', 'body':'Without this mass, both hands move together. We start them at the same position.'},
        {'title':'Add the mass. Watch the lower hand.', 'body':'The lower clock accumulates less time over the comparison. Each clock still ticks normally for someone right beside it.'},
        {'title':'Move both clocks farther out.', 'body':'Increase the lower clock radius: both clocks move outward, keeping the same separation. The rate difference shrinks. The hand-speed difference is exaggerated to make it visible.'},
    ],
    'takeaway':'Gravity changes how much time stationary clocks accumulate between comparisons.'}

def _engine_scene(title, beats, accent, mass=1, distance=1.25, duration=27):
    return {**deepcopy(SCENE), 'title': title, 'subtitle': 'Offline example scene for checking this renderer.',
            'why': 'Offline fixture introduction; not an agent investigation.',
            'beats': [{'title': t, 'body': b} for t, b in beats], 'mass': mass, 'distance': distance,
            'accent': accent, 'ray_count': 1, 'duration': duration, 'takeaway': 'Offline fixture scene; not an agent investigation.'}

# Keyed by a phrase that appears only in the matching model notes.
ENGINE_SCENES = {
    'SPEED LIMIT': _engine_scene('Why nothing can travel faster than light', [
        ('Push again and again', 'One push brings the rocket to half light speed. Everyday adding says a second push reaches light speed and a third goes faster.'),
        ('Light does not add', 'As the rocket passes a lamp on the ground, both lamps flash together. Seen from the ground, the two flashes travel side by side at light speed.'),
        ('The crew’s view', 'The crew time their flash too: it pulls away from them at full light speed. They push again, and the same flash still pulls away at that speed, so they never gain on it.'),
        ('Each push adds less', 'The crew feel every push the same, yet from the ground a second push brings the rocket to 80%, a third to 93%. Every push adds less, creeping toward light speed but never reaching it.')], 'blue', mass=1, duration=40),
    'SPACETIME DIAGRAM': _engine_scene('Two twins, two paths through spacetime', [
        ('Nobody moves: the twins age together.', 'With zero speed the traveller never leaves. Both columns of ticks line up.'),
        ('Now the traveller flies out and back.', 'The traveller’s dots are spaced farther apart. Fewer of them fit before the twins meet again.'),
        ('Change the speed and the trip.', 'Faster trips widen the gap. A longer trip adds years, but the percentage stays the same.')], 'blue', .8),
    'SPACETIME PATHS': _engine_scene('Two paths between one goodbye and one reunion', [
        ('Nobody leaves: one shared path.', 'With zero speed the traveller stays on Earth. Both twins follow the same straight path up through time.'),
        ('The traveller takes a detour.', 'Out to the star and back, the traveller’s path bends. Moving through space counts against time, so the bent path holds fewer years.'),
        ('Drag the turnaround.', 'A wider detour holds less time. Bring it back to the home path and the twins agree again.')], 'blue', 8/9, 2.5),
    'TWO-SOURCE RIPPLE TANK': _engine_scene('When two waves meet', [
        ('One source: smooth rings.', 'A single source sends out rings. The screen is evenly lit.'),
        ('Add a second source.', 'Where crests meet crests the water swings harder. Where crests meet troughs it stays calm.'),
        ('Move the sources apart.', 'Wider spacing packs the bright and dark stripes closer together.')], 'blue'),
    'ONE-AT-A-TIME TWO-SLIT': _engine_scene('Stripes from single particles', [
        ('One slit open.', 'Particles land one at a time in a single broad patch.'),
        ('Open the second slit.', 'Each particle still lands at one spot, but the arrivals slowly build stripes.'),
        ('Change the slit spacing.', 'Closer slits give wider stripes. The pattern belongs to the possibilities, not to any single path.')], 'mint'),
    'QUANTUM BARRIER (TUNNELLING)': _engine_scene('Through a wall it cannot climb', [
        ('No barrier: everything passes.', 'The wave flows on unchanged. Nothing bounces back.'),
        ('Raise a barrier taller than the energy.', 'Most of the wave reflects, but a little leaks out the far side.'),
        ('Make the barrier thicker.', 'A thicker barrier lets through much less. The leak shrinks fast.')], 'blue', 1, 1.3),
    'WAVE PACKET AND UNCERTAINTY': _engine_scene('Pinning down a particle', [
        ('One pure wave.', 'Its momentum is exact, but it is spread over all of space.'),
        ('Blend in more wavelengths.', 'The waves cancel almost everywhere, leaving one compact packet.'),
        ('Trade one spread for the other.', 'A narrower packet needs a wider mix of momenta.')], 'mint', .7, 1.5),
    'FINITE SQUARE WELL (ALLOWED ENERGIES)': _engine_scene('Only certain energies fit', [
        ('No well: nothing is trapped.', 'Without a well, the particle can have any energy at all.'),
        ('Dig a well.', 'Only a few energy levels fit. Each one is a wave that matches the walls.'),
        ('Make it deeper and wider.', 'A bigger well holds more levels, packed closer together.')], 'gold', 1, 1.6),
    'MOST-TIME PATH (WHY THINGS FALL)': _engine_scene('The path that keeps the most time', [
        ('No gravity: stay put.', 'Without gravity, the clock that stays where it is keeps the most time.'),
        ('Turn gravity on.', 'Higher clocks run faster, so going up gains time. Moving fast loses time.'),
        ('Find the best compromise.', 'The path that keeps the most time is exactly the arc a thrown ball follows.')], 'blue', 1, 1.6),
    'SINGLE-GAP DIFFRACTION': _engine_scene('Squeezing a wave through a gap', [
        ('No barrier: straight on.', 'The wave keeps going in a straight band. Nothing spreads.'),
        ('Add a gap.', 'Past the gap the wave fans out. The screen shows bright and dark bands.'),
        ('Narrow the gap, lengthen the waves.', 'A narrower gap or longer waves make the spreading wider.')], 'blue', .6, 1.4),
    'LIGHT CLOCK (WHY A MOVING': _engine_scene('Why a moving clock ticks slowly', [
        ('A parked rocket: the clocks agree.', 'With the rocket at rest, both light clocks tick together.'),
        ('The rocket moves.', 'Seen from Earth, the rocket clock\u2019s light must slant to hit its moving mirrors, so it ticks less often.'),
        ('Slow down, then speed up.', 'At low speed the clocks nearly agree; near light speed the rocket clock nearly stops.')], 'blue', .9),
    'TWIN TRIP.': _engine_scene('Two twins, one trip', [
        ('Nobody leaves.', 'With the rocket on Earth, both clocks and both rows of birthdays keep pace.'),
        ('The traveller flies to a star and back.', 'The traveller’s clock turns more slowly. Fewer birthdays pile up.'),
        ('Change the speed and the trip.', 'Faster trips widen the gap. A longer trip adds years, but not a bigger percentage.')], 'blue', .8),
    'STANDING WAVES ON A ROPE': _engine_scene('Why a rope only swings big at certain speeds', [
        ('One shake.', 'A hump runs to the wall and comes back upside down.'),
        ('Shake in step.', 'Each hump returns just as the hand shakes again, so the swing grows.'),
        ('Shake out of step.', 'The humps come back at the wrong moment, so the rope only jiggles.'),
        ('Twice and three times as fast.', 'In step again: two loops, then three.')], 'gold', 1, 2.25),
    'ATTENTION (WHICH WORDS MATTER': _engine_scene('How “it” finds the word it means', [
        ('No focus: every word counts the same.', 'With focus off, “it” gives every word the same share. It takes in a muddy mix of everything.'),
        ('Match the question to each word.', '“it” asks which thing here could be tired. “animal” matches best, so it gets most of the attention.'),
        ('Take in the best matches.', 'Now “it” carries mostly the meaning of “animal”. That is how the AI links “it” to the right word.'),
        ('Soften the focus, then change one word.', 'With less focus the shares spread out. Swap “tired” for “wide” and the attention moves to “street”.')], 'blue', 1, 1),
}
