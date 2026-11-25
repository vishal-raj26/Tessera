# Static Geist fonts for Blender (it can't read the app's variable .woff2): 500, 600 and 700 weights.
#   pip install fonttools brotli && python make_fonts.py
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'web', 'node_modules', '@fontsource-variable', 'geist', 'files', 'geist-latin-wght-normal.woff2')
os.makedirs(os.path.join(HERE, 'fonts'), exist_ok=True)
for w in (500, 600, 700):
    f = TTFont(SRC); f.flavor = None
    instancer.instantiateVariableFont(f, {'wght': w}).save(os.path.join(HERE, 'fonts', f'geist-{w}.ttf'))
