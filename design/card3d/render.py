# Studio renders of out/card.blend (Cycles): a dark backdrop with soft beams, a big soft key light from
# the top left, a cool rim light, and the card turned to show the light moving across it.
#   python render.py <name> <turn degrees> <tilt degrees> [samples] [width]
import math, os, sys
import bpy
HERE = os.path.dirname(os.path.abspath(__file__))
name, turn, tilt = sys.argv[-5], float(sys.argv[-4]), float(sys.argv[-3])
samples, width = int(sys.argv[-2]), int(sys.argv[-1])
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'out', 'card.blend'))
sc = bpy.context.scene
for o in sc.objects:
    if o.name.startswith(('Name_Max', 'BackName_Max', 'Decal')):
        o.hide_render = True
root = sc.objects['TesseraCard']
root.rotation_euler = (math.pi / 2 + math.radians(tilt), math.radians(-6), math.radians(turn))

# camera
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
sc.collection.objects.link(cam)
cam.data.lens = 105
cam.location = (0, -4.6, 0.05)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc.camera = cam

# backdrop: an emissive plane behind the card, filling the frame
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 3, 0), rotation=(math.pi / 2, 0, 0))
bd = bpy.context.active_object
bd.scale = (4.2, 5.25, 1)
m = bpy.data.materials.new('Backdrop'); m.use_nodes = True
nt = m.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
em = nt.nodes.new('ShaderNodeEmission'); tx = nt.nodes.new('ShaderNodeTexImage')
tx.image = bpy.data.images.load(os.path.join(HERE, 'backdrop.png'))
nt.links.new(tx.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.6
nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
bd.data.materials.append(m)
bd.visible_shadow = False
if os.environ.get('CLEAR'):
    # transparent background, but the backdrop still lights the card and shows in its reflections
    bd.visible_camera = False
    sc.render.film_transparent = True
    # a soft white board behind the camera, for the silver to reflect
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-0.6, -7, 1.6), rotation=(math.radians(78), 0, math.radians(-5)))
    rf = bpy.context.active_object; rf.scale = (5, 2.2, 1); rf.visible_camera = False
    rm = bpy.data.materials.new('Reflector'); rm.use_nodes = True; rn = rm.node_tree
    rn.nodes.remove(rn.nodes['Principled BSDF']); e2 = rn.nodes.new('ShaderNodeEmission'); e2.inputs['Strength'].default_value = 1.2
    rn.links.new(e2.outputs['Emission'], rn.nodes['Material Output'].inputs['Surface']); rf.data.materials.append(rm)
    # softer polish, so the foil catches the big lights from any angle
    bpy.data.materials['Silver'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.34

# lights
def area(name, loc, rot, size, power, color=(1, 1, 1), sx=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = power; l.size = size; l.color = color
    if sx: l.shape = 'RECTANGLE'; l.size, l.size_y = size, sx
    o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = rot
    sc.collection.objects.link(o)
    o.visible_camera = False
key = area('Key', (-2.6, -1.0, 2.8), (math.radians(40), 0, math.radians(-70)), 2.0, 260)
area('Strip', (-1.6, -1.2, 0.2), (math.radians(90), 0, math.radians(-60)), 0.25, 140, (1, 1, 1), sx=3)
area('Rim', (2.2, 0.8, 1.2), (math.radians(70), 0, math.radians(110)), 1.2, 220, (0.8, 0.85, 1.0))
area('Fill', (1.5, -3, -0.8), (math.radians(100), 0, math.radians(25)), 2.5, 18, (0.9, 0.9, 1))
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.004, 0.006, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.render.resolution_x = width
sc.render.resolution_y = int(width * 1.25)
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'; sc.view_settings.exposure = -0.6
sc.render.filepath = os.path.join(HERE, 'out', name + '.png')
bpy.ops.render.render(write_still=True)
print('rendered', sc.render.filepath)
