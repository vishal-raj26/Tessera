// A real 3D card for the plan carousel: a rounded box with thickness and bevelled edges, a satin
// coated body, and the plan name and emblem in raised, polished foil, lit by a studio environment so
// it shows true reflections, a glint that moves with the tilt and a highlight along its edges.
// Loaded on demand (three.js is a separate chunk), one small WebGL canvas per card.
import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, LinearSRGBColorSpace, Mesh,
  MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Scene, Shape, ShapeGeometry, SRGBColorSpace, WebGLRenderer,
  type BufferGeometry, type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TIERS } from '../tiers';

export interface Face { name: string; credit: string; term: string; top?: string; tier?: number }

const ASPECT = 0.63;          // card width / height
const TEX_W = 720;            // face texture size (kept small: phones have little GPU memory)
const TEX_H = Math.round(TEX_W / ASPECT);
const FONT = "'Geist Variable', -apple-system, system-ui, sans-serif";

/** Draw the face twice: colour (albedo), and "detail" (R = height for the emboss, G = roughness, B = metalness). */
function paintFace(face: Face, back = false) {
  const albedo = document.createElement('canvas');
  const detail = document.createElement('canvas');
  albedo.width = detail.width = TEX_W;
  albedo.height = detail.height = TEX_H;
  const a = albedo.getContext('2d')!;
  const d = detail.getContext('2d')!;
  const W = TEX_W, H = TEX_H, u = W / 100; // u = 1% of the card's width

  const t = TIERS[face.tier ?? 0] ?? TIERS[0];
  // body: the tier's colour with a soft light falloff; satin, slightly metallic
  const g = a.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, t.body[0]); g.addColorStop(0.55, t.body[1]); g.addColorStop(1, t.body[2]);
  a.fillStyle = g; a.fillRect(0, 0, W, H);
  const glow = a.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, W * 0.7);
  glow.addColorStop(0, t.sheen); glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  a.fillStyle = glow; a.fillRect(0, 0, W, H);
  // fine grain, so the surface reads as a material rather than a flat fill
  const grain = a.getImageData(0, 0, W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n;
  }
  a.putImageData(grain, 0, 0);
  d.fillStyle = 'rgb(0, 120, 90)'; // flat, roughness ~0.47, metalness ~0.35
  d.fillRect(0, 0, W, H);

  // print helpers: colour on the albedo, emboss/shine on the detail map
  const ink = (draw: (c: CanvasRenderingContext2D, color: string) => void, color: string, height: number, rough: number, metal: number) => {
    draw(a, color);
    draw(d, `rgb(${height}, ${rough}, ${metal})`);
  };
  const text = (s: string, x: number, y: number, size: number, weight: number, align: CanvasTextAlign, track = 0) =>
    (c: CanvasRenderingContext2D, color: string) => {
      c.font = `${weight} ${size}px ${FONT}`;
      c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = color;
      if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${track}px`;
      c.fillText(s, x, y);
    };

  if (back) {
    // a dark stripe band and a small mark, like the back of a real card
    ink((c, col) => { c.fillStyle = col; c.fillRect(0, H * 0.1, W, H * 0.1); }, t.body[2], 30, 90, 200);
    ink(emblem(W * 0.5, H * 0.55, u * 16, u * 1.1), t.foil[1], 255, 50, 255);
    ink(text('Tessera', W * 0.5, H * 0.7, u * 6, 600, 'center', -u * 0.15), t.foil[1], 255, 50, 255);
    return { albedo, detail };
  }

  ink(text(face.top ?? 'Store credit', W / 2, u * 10.5, u * 4.3, 500, 'center', u * 0.05), t.ink, 140, 90, 160);
  ink(emblem(W / 2, H * 0.43, u * 22, u * 1.25), t.foil[1], 255, 35, 255);
  // the plan name, big and bleeding off the right edge, in polished foil
  const size = u * (face.name.length > 4 ? 25 : 31);
  const nameFill = (c: CanvasRenderingContext2D, color: string) => {
    c.font = `600 ${size}px ${FONT}`;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-size * 0.07}px`;
    if (c === a) {
      const sg = c.createLinearGradient(0, H * 0.9 - size, 0, H * 0.9);
      sg.addColorStop(0, t.foil[0]); sg.addColorStop(0.5, t.foil[1]); sg.addColorStop(1, t.foil[2]);
      c.fillStyle = sg;
    } else c.fillStyle = color;
    c.fillText(face.name, u * 7, H - u * 16);
  };
  ink(nameFill, '', 255, 28, 255);
  ink(text(face.credit, u * 8, H - u * 7.5, u * 4.4, 500, 'left'), t.ink, 140, 90, 160);
  ink(text(face.term, W - u * 8, H - u * 7.5, u * 4.4, 500, 'right'), t.ink, 140, 90, 160);
  return { albedo, detail };
}

/** The Tessera emblem (four rounded tiles set as a diamond, plus a dot), as strokes. */
function emblem(cx: number, cy: number, size: number, line: number) {
  return (c: CanvasRenderingContext2D, color: string) => {
    const s = size / 44; // emblem drawn on a 44-unit grid
    c.save();
    c.translate(cx - 22 * s, cy - 22 * s);
    c.scale(s, s);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = line / s;
    for (const [x, y] of [[15.5, 3.5], [26.5, 15.5], [15.5, 27.5], [4.5, 15.5]]) {
      c.save();
      c.translate(x + 6.5, y + 6.5); c.rotate(Math.PI / 4);
      c.beginPath(); c.roundRect(-6.5, -6.5, 13, 13, 3.6); c.stroke();
      c.restore();
    }
    c.beginPath(); c.arc(22, 22, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
  };
}

export interface CardScene {
  setFace(face: Face): void;
  setTilt(x: number, y: number): void; // -1 … 1 each
  resize(width: number, height: number): void;
  dispose(): void;
}

export async function createCardScene(canvas: HTMLCanvasElement, face: Face): Promise<CardScene> {
  await document.fonts?.ready; // the face is drawn with the app's font
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  // a key light from the upper left: the moving glint as the card tilts
  const key = new DirectionalLight(new Color('#fff1e4'), 1.6);
  key.position.set(-1.4, 2.2, 3);
  scene.add(key);
  const tier = () => TIERS[current.tier ?? 0] ?? TIERS[0];
  let current = face;
  const rim = new DirectionalLight(new Color(tier().rim), 0.9); // the tier's edge light from below right
  rim.position.set(1.8, -1.6, 1.2);
  scene.add(rim);

  // the card: a rounded rectangle given thickness, with bevelled (softened) edges
  const H = 1 / ASPECT, R = 0.075, DEPTH = 0.014, BEVEL = 0.007;
  const outline = new Shape();
  outline.moveTo(-0.5 + R, -H / 2);
  outline.lineTo(0.5 - R, -H / 2); outline.quadraticCurveTo(0.5, -H / 2, 0.5, -H / 2 + R);
  outline.lineTo(0.5, H / 2 - R); outline.quadraticCurveTo(0.5, H / 2, 0.5 - R, H / 2);
  outline.lineTo(-0.5 + R, H / 2); outline.quadraticCurveTo(-0.5, H / 2, -0.5, H / 2 - R);
  outline.lineTo(-0.5, -H / 2 + R); outline.quadraticCurveTo(-0.5, -H / 2, -0.5 + R, -H / 2);
  const body = new ExtrudeGeometry(outline, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL * 0.8, bevelSegments: 4, curveSegments: 10 });
  body.translate(0, 0, -DEPTH / 2);
  // the faces: the same outline as flat sheets just above each side, with UVs spanning the card
  const sheet = (): BufferGeometry => {
    const g = new ShapeGeometry(outline, 10);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) / H + 0.5);
    return g;
  };
  const frontSheet = sheet();
  frontSheet.translate(0, 0, DEPTH / 2 + BEVEL + 0.0006);
  const backSheet = sheet();
  backSheet.rotateY(Math.PI);
  backSheet.translate(0, 0, -DEPTH / 2 - BEVEL - 0.0006);
  const edge = new MeshPhysicalMaterial({ color: tier().edge.color, metalness: tier().edge.metal, roughness: tier().edge.rough, clearcoat: 1, clearcoatRoughness: 0.08 });
  const makeFace = (back: boolean, f: Face) => {
    const { albedo, detail } = paintFace(f, back);
    const map = new CanvasTexture(albedo); map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    const det = new CanvasTexture(detail); det.colorSpace = LinearSRGBColorSpace;
    return new MeshPhysicalMaterial({
      map, roughnessMap: det, metalnessMap: det, bumpMap: det, bumpScale: 1.6,
      roughness: 1, metalness: 1, clearcoat: 0.85, clearcoatRoughness: 0.14, envMapIntensity: 1.15,
    });
  };
  let front = makeFace(false, face);
  let back = makeFace(true, face);
  const frontMesh = new Mesh(frontSheet, front);
  const backMesh = new Mesh(backSheet, back);
  const card = new Group();
  card.add(new Mesh(body, edge), frontMesh, backMesh);
  scene.add(card);

  const camera = new PerspectiveCamera(25, ASPECT, 0.1, 20);
  // the canvas is 1.25x the card, so the card fills 80% of it and has room to tilt
  camera.position.set(0, 0, (H / 0.8) / (2 * Math.tan((25 / 2) * Math.PI / 180)));

  let raf = 0;
  const draw = () => { raf = 0; renderer.render(scene, camera); };
  const request = () => { if (!raf) raf = requestAnimationFrame(draw); };

  const disposeFace = (m: MeshPhysicalMaterial) => { m.map?.dispose(); (m.roughnessMap as Texture | null)?.dispose(); m.dispose(); };
  return {
    setFace(f) {
      const tierChanged = (f.tier ?? 0) !== (current.tier ?? 0);
      current = f;
      const next = makeFace(false, f);
      frontMesh.material = next;
      disposeFace(front);
      front = next;
      if (tierChanged) {
        const nb = makeFace(true, f);
        backMesh.material = nb;
        disposeFace(back);
        back = nb;
        const t = tier();
        edge.color.set(t.edge.color); edge.metalness = t.edge.metal; edge.roughness = t.edge.rough;
        rim.color.set(t.rim);
      }
      request();
    },
    setTilt(x, y) {
      card.rotation.y = x * 0.42;
      card.rotation.x = -y * 0.34;
      // the glint travels against the tilt, like light on a real card
      key.position.set(-1.4 - x * 1.6, 2.2 + y * 1.4, 3);
      request();
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      request();
    },
    dispose() {
      cancelAnimationFrame(raf);
      body.dispose(); frontSheet.dispose(); backSheet.dispose(); edge.dispose(); disposeFace(front); disposeFace(back); env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
