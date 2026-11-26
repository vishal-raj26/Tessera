# The plan card, in Blender

The app's 3D card (`web/public/models/card.glb`) and the product's holographic picture
(`web/public/models/holo-<product>.jpg`) are made here.

```
pip install bpy==5.3.0 numpy pillow fonttools brotli   # Blender as a Python module (Python 3.13)
python make_fonts.py          # Geist at fixed weights, for the modelled text
python holo.py claude         # the holographic picture in the product's colours -> holo-claude.png
python build.py               # the model -> out/card.glb (and out/card.blend)
python backdrop.py            # the studio backdrop for renders
python render.py <name> <turn°> <tilt°> <samples> <width>    # a still, Cycles
python turntable.py <samples> <width> <frames>              # one slow turn, frames in out/turn/
```

Then copy `out/card.glb` to `web/public/models/`, and save `holo-<product>.png` as a ~640 px wide JPEG
named `holo-<product>.jpg` there. A new product needs its colours added in `holo.py` (and in
`web/src/components/Aurora.tsx` for the light).
