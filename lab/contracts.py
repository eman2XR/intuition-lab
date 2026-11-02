"""Small, provider-independent contracts. Model output is data, never executable code."""
import math


def obj(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}


STR = {'type': 'string'}
BOOL = {'type': 'boolean'}
NUM = {'type': 'number'}
STRINGS = {'type': 'array', 'items': STR}
SCENE_SCHEMA = obj({
    'title': STR, 'subtitle': STR, 'why': STR,
    'beats': {'type': 'array', 'items': obj({'title': STR, 'body': STR})},
    'mass': NUM, 'distance': NUM, 'ray_count': {'type': 'integer'},
    'show_reference': BOOL, 'show_labels': BOOL,
    'accent': {'type': 'string', 'enum': ['mint', 'gold', 'blue']},
    'line_width': NUM, 'duration': NUM, 'takeaway': STR,
    'controls': {'type': 'string', 'enum': ['none', 'first', 'second', 'both']},
})
RESEARCH_SCHEMA = obj({
    'claim': STR, 'explanation': STR, 'assumptions': STRINGS,
    'prediction': STR, 'falsifier': STR, 'limitations': STRINGS,
    'misconceptions': STRINGS,
    'questions': {'type': 'array', 'items': obj({'q': STR, 'a': STR})},
    'sources': {'type': 'array', 'items': obj({'title': STR, 'url': STR, 'supports': STR})},
})
# The designer's brief: how the guide will make its one idea intuitive, decided before any narration is written.
DESIGN_SCHEMA = obj({
    'idea': STR, 'start': STR, 'belief': STR, 'reason': STR,
    'chapters': {'type': 'array', 'items': obj({'show': STR, 'changes': STR, 'label': STR})},
    'try': STR, 'fits_engine': BOOL, 'missing': STR,
})
REVIEW_SCHEMA = obj({
    'pass': BOOL, 'score': NUM, 'summary': STR, 'changes': STRINGS,
    'blocking_issues': STRINGS,
})


def validate(value, schema, path='output'):
    typ = schema['type']
    if typ == 'object':
        if not isinstance(value, dict) or set(value) != set(schema['required']):
            raise ValueError(f'{path}: missing or unexpected fields')
        for key, spec in schema['properties'].items():
            validate(value[key], spec, f'{path}.{key}')
    elif typ == 'array':
        if not isinstance(value, list) or len(value) > 30:
            raise ValueError(f'{path}: expected a bounded array')
        for item in value:
            validate(item, schema['items'], path)
    elif typ == 'string':
        if not isinstance(value, str) or len(value) > 5000:
            raise ValueError(f'{path}: invalid string')
        if 'enum' in schema and value not in schema['enum']:
            raise ValueError(f'{path}: invalid choice')
    elif typ == 'boolean':
        if type(value) is not bool:
            raise ValueError(f'{path}: expected boolean')
    elif typ in ('number', 'integer'):
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f'{path}: expected finite number')
        if typ == 'integer' and type(value) is not int:
            raise ValueError(f'{path}: expected integer')


def validate_scene(scene):
    validate(scene, SCENE_SCHEMA)
    for key, lo, hi in [('mass', 0, 1), ('distance', 1, 2.5), ('ray_count', 1, 5),
                        ('line_width', 1, 5), ('duration', 15, 45)]:
        if not lo <= scene[key] <= hi:
            raise ValueError(f'{key} must be between {lo} and {hi}')
    if not 3 <= len(scene['beats']) <= 4:
        raise ValueError('Three or four teaching beats required')
    for beat in scene['beats']:
        if len(beat['title']) > 90 or len(beat['body']) > 380:
            raise ValueError('Teaching beat exceeds layout limits')
    if len(scene['title']) > 100 or len(scene['subtitle']) > 250:
        raise ValueError('Heading exceeds layout limits')
    if len(scene['why']) > 220:
        raise ValueError('Introduction exceeds layout limits')
    return scene


MODEL_NOTES = '''Renderer is fixed: a 2D weak-field light-deflection diagram, not full spacetime.
Coordinates use an arbitrary length unit, m=GM/c^2=0.025*mass, impact parameter b=distance.
y(x)=b-2*m/b*(sqrt(x*x+b*b)+x), -7<=x<=7, to first order in m/b.
Asymptotic deflection 4*m/b radians; m/b <=0.025. The paths are drawn for six times the model mass so
the bend can be seen; the readout gives the model value for the nearest ray. No black hole, horizon, orbit, or numerical
Einstein solver. A central sphere stands for the compact mass. ray_count (1 to 5) sets how many light paths pass the mass,
each 0.4 farther out than the one before. In the last chapter the passing distance moves to its scene value plus 1, at most 2.5.
The background is a tilted mesh of the optical geometry: distance on it is light travel time
timed by a distant clock (weak-field index n = 1 + 2m/r), embedded as a surface whose straightest
lines are the drawn light paths; its dip is drawn for six times the model mass. Near the mass
clocks run slow and space is stretched, so there is more distance for light there. The dip is
not a downhill slope: never say light or anything rolls into it, and it is not a rubber sheet
sagging under weight. The light pulse is a moving marker, not a measurement of coordinate speed. The three beats are:
1 no mass/straight reference, 2 add mass/bending, 3 compare and experiment.
All controls remain inside weak-field regime. Explain null geodesics in plain language;
light has no rest mass and is locally measured at c. More mass or a closer pass increases
bending. Do not imply light bends because it slows locally, or a dent pulls it downward.
The animation cannot independently verify general relativity. Numeric checks verify
only the implemented approximation. Keep claims appropriately scoped.'''


# Character limits for the design brief, about 20 characters above what the designer's prompt (pipeline.DESIGNER)
# asks for, so a brief that runs slightly long is not thrown away.
DESIGN_LIMITS = {'idea': 320, 'start': 320, 'belief': 320, 'reason': 500, 'try': 320, 'missing': 500}
DESIGN_CHAPTER_LIMIT = 400


def validate_design(design):
    """A design brief within the bounds the writer and reviewers rely on."""
    validate(design, DESIGN_SCHEMA)
    if not 3 <= len(design['chapters']) <= 6:
        raise ValueError('A design brief needs three to six chapters')
    limits = DESIGN_LIMITS
    if any(len(design[k]) > n for k, n in limits.items()) or not design['idea'].strip():
        raise ValueError('Design brief exceeds its bounds')
    for chapter in design['chapters']:
        if len(chapter['show']) > DESIGN_CHAPTER_LIMIT or len(chapter['changes']) > DESIGN_CHAPTER_LIMIT or len(chapter['label'].split()) > 5:
            raise ValueError('Design brief chapter exceeds its bounds')
    return design
