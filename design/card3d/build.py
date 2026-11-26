# Tessera plan card, modelled in Blender and exported as a glTF model (card.glb) for the app.
#
# A thick card with rounded corners and bevelled rims (real geometry, not a texture), three materials
# (satin black front, holographic back, glossy edge), and the emblem and plan names as raised geometry:
# polished silver on the front, dark ink on the back. Every plan name is in the file; the app shows the
# one for the plan on screen. Two thin "decal" planes carry the small print, which the app draws.
#
# Coordinates: the card lies in the XY plane, front facing +Z, centred on the origin, 1 unit tall
# (three.js uses the same: +Y up, front towards a camera on +Z).
#
#   blender -b -P build.py            or   python build.py   (with the bpy module)
import math, os, sys
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

W, H = 0.63, 1.0          # card size (same proportions as the app's card)
T = 0.026                 # thickness
R = 0.075                 # corner radius
BEVEL = 0.008             # rounded rim on both faces
LIFT = 0.0012             # raised print height
PLANS = [('Pro', 'Pro'), ('Max5', 'Max 5×'), ('Max20', 'Max 20×')]
FONT = os.path.join(HERE, 'fonts', 'geist-600.ttf')
FONT_SMALL = os.path.join(HERE, 'fonts', 'geist-500.ttf')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------- materials ----------
def principled(name, color, rough, metal=0.0, coat=0.0, coat_rough=0.1, image=None, film=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = coat_rough
    if film and 'Thin Film Thickness' in p.inputs:
        p.inputs['Thin Film Thickness'].default_value = film
        p.inputs['Thin Film IOR'].default_value = 1.45
    if image:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(image)
        tex.image.colorspace_settings.name = 'sRGB'
        tex.extension = 'MIRROR'
        nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if film:
            holo_motion(nt, tex, p)
    return m

def holo_motion(nt, tex, p):
    """Make the foil live: where you look from moves the colours across it (the view direction, in the
    card's own space, offsets the texture), they drift slowly by themselves (the Mapping node's
    location is animated: 'HoloDrift'), and a rainbow sheen rides the glancing angle."""
    uv = nt.nodes.new('ShaderNodeTexCoord')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    to_obj = nt.nodes.new('ShaderNodeVectorTransform')
    to_obj.vector_type = 'VECTOR'; to_obj.convert_from = 'WORLD'; to_obj.convert_to = 'OBJECT'
    nt.links.new(geo.outputs['Incoming'], to_obj.inputs['Vector'])
    k = nt.nodes.new('ShaderNodeVectorMath'); k.operation = 'SCALE'; k.inputs['Scale'].default_value = 0.55
    nt.links.new(to_obj.outputs['Vector'], k.inputs[0])
    add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'
    nt.links.new(uv.outputs['UV'], add.inputs[0]); nt.links.new(k.outputs['Vector'], add.inputs[1])
    mp = nt.nodes.new('ShaderNodeMapping'); mp.name = 'HoloDrift'
    nt.links.new(add.outputs['Vector'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    # rainbow sheen at glancing angles
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    # the sheen in the product's warm tones (Claude: clay, peach, gold, cream)
    cr.elements[0].position, cr.elements[0].color = 0.0, (*srgb('#D97757'), 1)
    cr.elements[1].position, cr.elements[1].color = 1.0, (*srgb('#D97757'), 1)
    for pos, c in ((0.25, (*srgb('#F3B096'), 1)), (0.5, (*srgb('#E3C38E'), 1)), (0.75, (*srgb('#F7E9D7'), 1))):
        e = cr.elements.new(pos); e.color = c
    # the sheen's colour also moves with the view
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(to_obj.outputs['Vector'], sep.inputs[0])
    hue = nt.nodes.new('ShaderNodeMath'); hue.operation = 'MULTIPLY_ADD'
    hue.inputs[1].default_value = 0.8; hue.inputs[2].default_value = 0.0
    nt.links.new(sep.outputs['X'], hue.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'ADD'
    nt.links.new(lw.outputs['Facing'], fr.inputs[0]); nt.links.new(hue.outputs[0], fr.inputs[1])
    fract = nt.nodes.new('ShaderNodeMath'); fract.operation = 'FRACT'
    nt.links.new(fr.outputs[0], fract.inputs[0]); nt.links.new(fract.outputs[0], ramp.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'OVERLAY'
    nt.links.new(lw.outputs['Facing'], mix.inputs['Factor'])
    nt.links.new(tex.outputs['Color'], mix.inputs['A']); nt.links.new(ramp.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

M_FRONT = principled('CardFront', srgb('#060607'), 0.38, 0.0, coat=0.25, coat_rough=0.12)
M_HOLO = principled('CardHolo', (1, 1, 1), 0.25, 0.1, coat=0.35, coat_rough=0.06, image=os.path.join(HERE, 'holo-claude.png'), film=420)
M_EDGE = principled('CardEdge', srgb('#1c1c1f'), 0.2, 0.55, coat=0.5, coat_rough=0.05)
M_SILVER = principled('Silver', srgb('#e4e1dc'), 0.16, 1.0)
M_PRINT = principled('Print', srgb('#b9b5ae'), 0.4, 0.6)
M_INK = principled('Ink', srgb('#3a3640'), 0.35, 0.3, coat=0.4)


# ---------- card body ----------
def rounded_rect(w, h, r, seg=14):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

bm = bmesh.new()
outline = [bm.verts.new((x, y, -T / 2)) for x, y in rounded_rect(W, H, R)]
bottom = bm.faces.new(outline[::-1])
ext = bmesh.ops.extrude_face_region(bm, geom=[bottom])
top_verts = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
bmesh.ops.translate(bm, verts=top_verts, vec=(0, 0, T))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6 and len(e.link_faces) == 2
        and any(abs(f.normal.z) > 0.99 for f in e.link_faces)]
bmesh.ops.bevel(bm, geom=rims, offset=BEVEL, segments=6, profile=0.5, affect='EDGES')
# triangulate the flat faces nicely (a fan from one corner looks fine, but grid-fill shades better)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if abs(f.normal.z) > 0.999])

uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    n = f.normal
    f.material_index = 0 if n.z > 0.999 else 1 if n.z < -0.999 else 2
    f.smooth = abs(n.z) < 0.999
    for l in f.loops:
        x, y = l.vert.co.x, l.vert.co.y
        u = (x + W / 2) / W
        l[uv].uv = (1 - u if f.material_index == 1 else u, (y + H / 2) / H)

mesh = bpy.data.meshes.new('CardBody')
bm.to_mesh(mesh)
bm.free()
body = bpy.data.objects.new('CardBody', mesh)
scene.collection.objects.link(body)
for m in (M_FRONT, M_HOLO, M_EDGE):
    mesh.materials.append(m)


# ---------- raised print ----------
def to_mesh(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active

def place(obj, front=True):
    """Put a print object (modelled at z=0, reading on +Z) on the front face, or mirrored onto the back."""
    if front:
        obj.location.z = T / 2
    else:
        obj.rotation_euler.y = math.pi
        obj.location.x = -obj.location.x
        obj.location.z = -T / 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

def emblem(name, size, cy, stroke, material, front=True):
    """The Tessera mark: four rounded squares turned 45 degrees, drawn as outlines (like the app's SVG)."""
    k = size / 24
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    curve.extrude = LIFT / 2
    for cx, cy2 in ((12, 5), (19, 12), (12, 19), (5, 12)):
        for half in (3 + stroke / 2, 3 - stroke / 2):
            r = max(0.2, 1.6 + (half - 3))
            pts = rounded_rect(half * 2, half * 2, r, seg=6)
            sp = curve.splines.new('POLY')
            sp.points.add(len(pts) - 1)
            ca, sa = math.cos(math.pi / 4), math.sin(math.pi / 4)
            for i, (x, y) in enumerate(pts):
                xr, yr = x * ca - y * sa, x * sa + y * ca
                sp.points[i].co = ((cx - 12) * k + xr * k, (12 - cy2) * k + yr * k + cy, 0, 1)
            sp.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.location.z = LIFT / 2
    obj = to_mesh(obj)
    obj.name = name
    place(obj, front)
    return obj

def text(name, s, size, x, y, material, font=FONT, align='LEFT', fit=None, track=-0.06, front=True, depth=LIFT):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = s
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = size
    cu.space_character = 1 + track
    cu.align_x = align
    cu.extrude = depth / 2
    cu.bevel_depth = depth * 0.25 if size > 0.1 else 0
    cu.bevel_resolution = 1
    cu.resolution_u = 3
    obj = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.update()
    if fit and obj.dimensions.x > fit:
        cu.size = size * fit / obj.dimensions.x
    obj.location = (x, y, depth / 2)
    obj = to_mesh(obj)
    obj.name = name
    place(obj, front)
    return obj

L = -W / 2 + 0.05       # left margin
# front: emblem and the plan name in polished silver
emblem('Emblem', W * 0.42, 0.06, 1.15, M_SILVER)
emblem('BackEmblem', W * 0.42, 0.06, 1.15, M_INK, front=False)
for key, label in PLANS:
    size = 0.36 if len(label) <= 4 else 0.2
    n = text(f'Name_{key}', label, size, L - 0.01, -H / 2 + 0.11, M_SILVER, fit=W - 0.08)
    b = text(f'BackName_{key}', label, size, L - 0.01, -H / 2 + 0.11, M_INK, fit=W - 0.08, front=False)
# the small print, as geometry for the studio renders (hidden in the app, which draws it on the decals
# so it can change: store, credit, term)
text('Print_Top', 'App Store credit for Claude', 0.03, 0, H / 2 - 0.075, M_PRINT, font=FONT_SMALL, align='CENTER', track=0, depth=LIFT * 0.4)
text('Print_Credit', 'Credit $25', 0.028, L, -H / 2 + 0.05, M_PRINT, font=FONT_SMALL, track=0, depth=LIFT * 0.4)
text('Print_Term', '1 month', 0.028, W / 2 - 0.05, -H / 2 + 0.05, M_PRINT, font=FONT_SMALL, align='RIGHT', track=0, depth=LIFT * 0.4)
# the wordmark at the top of the back (the app draws it on the back decal; geometry for the renders)
text('Print_BackWordmark', 'Tessera', 0.042, 0, H / 2 - 0.085, M_INK, font=FONT_SMALL, align='CENTER', track=0, front=False)

# decals for the small print (store, credit, term): planes just above each face, drawn by the app
def decal(name, front=True):
    bm = bmesh.new()
    z = T / 2 + LIFT * 0.3
    vs = [bm.verts.new((x, y, z)) for x, y in ((-W / 2, -H / 2), (W / 2, -H / 2), (W / 2, H / 2), (-W / 2, H / 2))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new('UVMap')
    for l, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uvl].uv = (u, v)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    try: m.blend_method = 'BLEND'
    except Exception: pass
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Alpha'].default_value = 0.0
    p.inputs['Roughness'].default_value = 0.5
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    place(o, front)
    return o

decal('DecalFront')
decal('DecalBack', front=False)

# group everything under one root, so the app can turn the whole card
root = bpy.data.objects.new('TesseraCard', None)
scene.collection.objects.link(root)
for o in list(scene.collection.objects):
    if o is not root:
        o.parent = root
# stand it up: Blender is Z-up, so the card goes in the XZ plane with its front towards -Y; exported
# with +Y up, that is a card standing upright with its front towards +Z in three.js
root.rotation_euler.x = math.pi / 2

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'card.blend'))
# the app's model: no studio-only small print, and no images (the holographic picture is the product's
# own, loaded by the app: web/public/models/holo-<product>.jpg)
for o in scene.objects:
    o.select_set(not o.name.startswith('Print_'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'card.glb'), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_image_format='NONE')
print('built', [o.name for o in scene.collection.objects])
