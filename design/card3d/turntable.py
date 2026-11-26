# Studio renders of out/card.blend (Cycles): a dark backdrop with soft beams, a big soft key light from
# the top left, a cool rim light, and the card turned to show the light moving across it.
#   python render.py <name> <turn degrees> <tilt degrees> [samples] [width]
import math, os, sys
import bpy
HERE = os.path.dirname(os.path.abspath(__file__))
samples, width, frames = int(sys.argv[-3]), int(sys.argv[-2]), int(sys.argv[-1])
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'out', 'card.blend'))
sc = bpy.context.scene
for o in sc.objects:
    if o.name.startswith(('Name_Max', 'BackName_Max', 'Decal')):
        o.hide_render = True
root = sc.objects['TesseraCard']
# one slow turn with eased start and end, a gentle tilt and roll, like a card turned in the hand
for f in range(frames + 1):
    t = f / frames
    e = t * t * (3 - 2 * t)                  # ease in and out
    turn = -20 + 360 * e
    tilt = 8 * math.cos(2 * math.pi * t)
    roll = -6 * math.cos(2 * math.pi * t) + 4 * math.sin(4 * math.pi * t)
    root.rotation_euler = (math.pi / 2 + math.radians(tilt), math.radians(roll), math.radians(turn))
    root.keyframe_insert('rotation_euler', frame=f + 1)
# the foil's colours drift on their own as well
drift = bpy.data.materials['CardHolo'].node_tree.nodes['HoloDrift']
for f, (x, y) in ((1, (0, 0)), (frames // 2, (0.18, -0.25)), (frames, (0.32, -0.1))):
    drift.inputs['Location'].default_value = (x, y, 0)
    drift.inputs['Location'].keyframe_insert('default_value', frame=f)
sc.frame_start, sc.frame_end = 1, frames
sc.render.fps = 24

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
sc.render.filepath = os.path.join(HERE, 'out', 'turn', '')
sc.render.image_settings.file_format = 'PNG'
bpy.ops.render.render(animation=True)
print('rendered animation')
