// The plan card in 3D, from a real model made in Blender (public/models/card.glb, built by
// design/card3d/build.py): a thick card with rounded, bevelled edges; a satin black front with the
// emblem and plan name raised in polished silver; a holographic back in the product's own colours
// (public/models/holo-<product>.jpg) whose colours slide as the card turns and drift slowly on their
// own; a glossy edge that catches the light. The small print (store, credit, term) is drawn on thin
// decals so it can change. Tap turns the card over (Card3D).
//
// Everything heavy happens once and is shared by every card: one WebGL renderer (one context, shaders
// compiled once, one studio environment), the model and the pictures. Each card has its own scene.
// Only the front card is live: the renderer's own canvas sits in it and is drawn straight to the
// screen. The other cards show a still picture on a 2D canvas, copied once when they change (copying
// a WebGL picture makes the browser wait for the GPU, so it never happens per frame).
// preloadCards() starts all of it as the app opens, so the 3D card is ready by the time plans arrive.
import {
  ACESFilmicToneMapping, CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, Color, DirectionalLight, Group, MathUtils, Mesh, MeshPhysicalMaterial,
  MirroredRepeatWrapping, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, TextureLoader, WebGLRenderer,
  type Material, type Object3D, type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Face { name: string; credit: string; term: string; top?: string; tier?: number; product?: string }

const ASPECT = 0.63;          // card width / height (the model is 0.63 x 1)
const H = 1;
const FONT = "'Geist Variable', -apple-system, system-ui, sans-serif";
/** plan names that are modelled in the file (Name_<key>); any other name is printed on the decal */
const MODELLED: Record<string, string> = { 'Pro': 'Pro', 'Max 5×': 'Max5', 'Max 20×': 'Max20' };
const BASE = import.meta.env.BASE_URL ?? '/';

interface Shared { renderer: WebGLRenderer; env: Texture; lost: boolean; onLost: Set<() => void>; owner: Live | null }
/** the card that currently has the renderer's canvas on screen */
interface Live { redraw(): void; release(): void }
let shared: Shared | null = null;
function getShared(): Shared {
  if (shared && !shared.lost) return shared;
  const canvas = document.createElement('canvas');
  // (no preserveDrawingBuffer: still pictures are copied in the same task as their render, so the
  // buffer is still there, and phones skip a copy every frame)
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(1); // sizes below are already in device pixels
  // don't stop to read each shader's error log (a development aid that makes the browser wait)
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  canvas.className = 'card3d-canvas';
  const s: Shared = { renderer, env, lost: false, onLost: new Set(), owner: null };
  // phones can drop a WebGL context under memory pressure: every card goes back to its 2D card
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); s.lost = true; for (const f of s.onLost) f(); }, { once: true });
  shared = s;
  return s;
}

let model: Promise<GLTF> | null = null;
const loadModel = () => (model ??= new GLTFLoader().loadAsync(`${BASE}models/card.glb`));
const holos = new Map<string, Promise<Texture>>();
const loadHolo = (product: string) => {
  let p = holos.get(product);
  if (!p) {
    p = new TextureLoader().loadAsync(`${BASE}models/holo-${product}.jpg`)
      .catch(() => new TextureLoader().loadAsync(`${BASE}models/holo-claude.jpg`));
    holos.set(product, p);
  }
  return p;
};

/** The small print for one side, on a transparent canvas the size of the card. */
function paintDecal(face: Face, back: boolean, printName: boolean) {
  const W = 512, Hp = Math.round(W / ASPECT);
  const c = document.createElement('canvas');
  c.width = W; c.height = Hp;
  const g = c.getContext('2d')!;
  const u = W / 63; // one hundredth of the card's height, in pixels (the model is 63 x 100)
  const text = (s: string, x: number, y: number, size: number, weight: number, align: CanvasTextAlign, color: string) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = color;
    g.fillText(s, x, y);
  };
  if (back) {
    text('Tessera', W / 2, 9.4 * u, 4.4 * u, 500, 'center', 'rgba(40, 36, 44, 0.85)');
  } else {
    const ink = 'rgba(205, 200, 192, 0.82)';
    text(face.top ?? 'Store credit', W / 2, 8.6 * u, 3.1 * u, 500, 'center', ink);
    text(face.credit, 5 * u, Hp - 4.3 * u, 2.9 * u, 500, 'left', ink);
    text(face.term, W - 5 * u, Hp - 4.3 * u, 2.9 * u, 500, 'right', ink);
    if (printName) {
      // a plan without a modelled name: print it in the same place, in a silver gradient
      const size = (face.name.length > 6 ? 15 : 22) * u;
      const sg = g.createLinearGradient(0, Hp - 11 * u - size, 0, Hp - 11 * u);
      sg.addColorStop(0, '#fffaf2'); sg.addColorStop(0.55, '#d9d2c5'); sg.addColorStop(1, '#8f877d');
      g.font = `600 ${size}px ${FONT}`; g.textAlign = 'left'; g.fillStyle = sg;
      g.fillText(face.name, 4 * u, Hp - 11 * u, W - 8 * u);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.flipY = false; // glTF texture coordinates run top-down
  return t;
}

// Lighter materials where the extra layers can't be seen (a phone draws every pixel of these each
// frame the card moves): plain standard materials for the black face, the edge, the foil and the ink;
// the clear coat only on the holographic side, whose colours slide with the angle on their own.
function makeMats(holo: Texture): Record<string, MeshStandardMaterial> {
  return {
    CardFront: new MeshPhysicalMaterial({ color: '#000000', roughness: 0.55, specularIntensity: 0.35, envMapIntensity: 0.1 }), // no clear coat: still cheap
    CardHolo: new MeshPhysicalMaterial({ map: holo, roughness: 0.25, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.06, envMapIntensity: 0.9 }),
    CardEdge: new MeshStandardMaterial({ color: '#1c1c1f', metalness: 0.55, roughness: 0.2 }),
    Silver: new MeshStandardMaterial({ color: '#e4e1dc', metalness: 1, roughness: 0.16, envMapIntensity: 1.35 }),
    Ink: new MeshStandardMaterial({ color: '#3a3640', metalness: 0.3, roughness: 0.3 }),
  };
}

/** Start loading the model and pictures and set up the renderer, before any card is on screen. */
export function preloadCards(product = 'claude') {
  let gl: Shared;
  try { gl = getShared(); } catch { return; /* no WebGL: the 2D cards stay */ }
  // once the model is in, compile every shader the cards use (in the background where the browser
  // can), so the first card draws at once instead of compiling then
  Promise.all([loadModel(), loadHolo(product)]).then(async ([gltf, holo]) => {
    const scene = new Scene();
    scene.environment = gl.env;
    scene.add(new DirectionalLight(), new DirectionalLight());
    const warm = gltf.scene.clone(true);
    const pic = holo.clone(); pic.colorSpace = SRGBColorSpace; // as the cards use it
    const mats = makeMats(pic);
    const decal = new MeshBasicMaterial({ map: pic, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    warm.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const n = (o.material as Material).name;
      o.material = mats[n] ?? (n.startsWith('Decal') || o.name.startsWith('Decal') ? decal : o.material);
    });
    scene.add(warm);
    const camera = new PerspectiveCamera(25, ASPECT, 0.1, 20);
    camera.position.z = 3;
    await gl.renderer.compileAsync(scene, camera);
    for (const m of Object.values(mats)) m.dispose();
    decal.dispose(); pic.dispose();
  }).catch(() => {});
}

export interface CardScene {
  setFace(face: Face): void;
  setTilt(x: number, y: number): void; // -1 … 1 each
  /** show the holographic back (true) or the front */
  setTurned(back: boolean): void;
  resize(width: number, height: number): void;
  /** the front card: draw it live on screen (true), or show it as a still picture (false) */
  setLive(on: boolean, host: HTMLElement): void;
  /** called if the shared WebGL context is lost (the card should fall back to its 2D look) */
  onLost(f: () => void): void;
  dispose(): void;
}

export async function createCardScene(canvas: HTMLCanvasElement, face: Face): Promise<CardScene> {
  await document.fonts?.ready; // the small print uses the app's font
  const [gltf, holoSrc] = await Promise.all([loadModel(), loadHolo(face.product ?? 'claude')]);

  const gl = getShared();
  const { renderer, env } = gl;
  const out = canvas.getContext('2d')!;
  let width = canvas.width || 300, height = canvas.height || 400;

  const scene = new Scene();
  scene.environment = env;
  const key = new DirectionalLight(new Color('#fff1e4'), 1.4); // the glint, from the upper left
  key.position.set(-1.4, 2.2, 3);
  scene.add(key);
  const rim = new DirectionalLight(new Color('#f3b096'), 0.7); // a warm edge light from below right
  rim.position.set(1.8, -1.6, 1.2);
  scene.add(rim);

  // this card's copy of the model (geometry is shared between cards) with its own materials
  const card = gltf.scene.clone(true);
  const holo = holoSrc.clone();
  holo.colorSpace = SRGBColorSpace;
  holo.wrapS = holo.wrapT = MirroredRepeatWrapping;
  holo.flipY = false;
  holo.needsUpdate = true;
  const mats = makeMats(holo);
  // the small print is printed, not lit: a plain material is enough
  const decal = (back: boolean, printName: boolean) => new MeshBasicMaterial({
    map: paintDecal(current, back, printName), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  let current = face;
  const names: Object3D[] = [];
  let decalFront: Mesh | null = null, decalBack: Mesh | null = null;
  card.traverse((o) => {
    if (/^(Back)?Name_/.test(o.name)) names.push(o);
    if (!(o instanceof Mesh)) return;
    const m = o.material as Material;
    if (o.name.startsWith('DecalFront') || m.name === 'DecalFront') decalFront = o;
    else if (o.name.startsWith('DecalBack') || m.name === 'DecalBack') decalBack = o;
    else if (mats[m.name]) o.material = mats[m.name];
  });
  const showName = (f: Face) => {
    const key = MODELLED[f.name];
    for (const n of names) n.visible = !!key && (n.name === `Name_${key}` || n.name === `BackName_${key}`);
    return !key;
  };
  const paint = (f: Face) => {
    const printName = showName(f);
    for (const [mesh, back] of [[decalFront, false], [decalBack, true]] as const) {
      if (!mesh) continue;
      const old = mesh.material as MeshBasicMaterial;
      mesh.material = decal(back, printName);
      if (old && old !== mesh.material) { old.map?.dispose(); old.dispose(); }
    }
  };
  paint(face);

  const pivot = new Group();
  pivot.add(card);
  scene.add(pivot);
  const camera = new PerspectiveCamera(25, ASPECT, 0.1, 20);
  // the canvas is 1.25x the card, so the card fills 80% of it and has room to tilt and turn
  camera.position.set(0, 0, (H / 0.8) / (2 * Math.tan((25 / 2) * Math.PI / 180)));

  // motion: the tilt under the finger, the turn (0 front … PI back), and the foil's drift
  let tiltX = 0, tiltY = 0, turn = 0, turnTo = 0, raf = 0, last = 0, drift = 0;
  const backShowing = () => Math.cos(turn + tiltX * 0.42) < 0.2;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    turn = still ? turnTo : MathUtils.damp(turn, turnTo, 7, dt);
    if (Math.abs(turn - turnTo) < 0.001) turn = turnTo;
    pivot.rotation.y = tiltX * 0.42 + turn;
    pivot.rotation.x = -tiltY * 0.34;
    key.position.set(-1.4 - tiltX * 1.6, 2.2 + tiltY * 1.4, 3);
    // the colours slide with the angle the card is seen from, and drift on their own
    if (!still) drift += dt * 0.035;
    holo.offset.set(Math.sin(pivot.rotation.y) * 0.22 + drift, -pivot.rotation.x * 0.3 + Math.sin(drift * 3) * 0.05);
    render();
    // keep going while it turns, or while the back shows (its colours drift)
    if (turn !== turnTo || (backShowing() && !still)) request();
    else last = 0;
  };
  const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const sized = () => { if (renderer.domElement.width !== width || renderer.domElement.height !== height) renderer.setSize(width, height, false); };
  // live: straight onto the screen. Still: render, copy into this card's own canvas, and put the live
  // card's picture back on the shared canvas at once (same task, so it never shows the wrong card).
  let live = false;
  const render = () => {
    sized();
    renderer.render(scene, camera);
    if (live) return;
    out.clearRect(0, 0, width, height);
    out.drawImage(renderer.domElement, 0, 0);
    gl.owner?.redraw();
  };
  const me: Live = {
    redraw() { sized(); renderer.render(scene, camera); },
    release() {
      // hand the canvas over: keep a still picture of where the card is now
      live = false;
      render();
      canvas.style.visibility = '';
      if (gl.owner === me) gl.owner = null;
    },
  };
  const lostHandlers: (() => void)[] = [];
  request();

  return {
    setFace(f) { current = f; paint(f); request(); },
    setTilt(x, y) { tiltX = x; tiltY = y; request(); },
    setTurned(back) { turnTo = back ? Math.PI : 0; request(); },
    resize(w, h) {
      // 1.5x is sharp on a phone for a card this size, and draws far fewer pixels than 3x
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.round(w * dpr)); height = Math.max(1, Math.round(h * dpr));
      canvas.width = width; canvas.height = height;
      request();
    },
    setLive(on, host) {
      if (on === live) return;
      if (!on) { if (gl.owner === me) { me.release(); renderer.domElement.remove(); } return; }
      if (gl.owner && gl.owner !== me) gl.owner.release();
      gl.owner = me;
      live = true;
      if (renderer.domElement.parentElement !== host) host.appendChild(renderer.domElement);
      canvas.style.visibility = 'hidden';
      me.redraw();
      request();
    },
    onLost(f) { lostHandlers.push(f); getShared().onLost.add(f); },
    dispose() {
      cancelAnimationFrame(raf);
      if (gl.owner === me) { gl.owner = null; renderer.domElement.remove(); }
      for (const f of lostHandlers) shared?.onLost.delete(f);
      for (const m of Object.values(mats)) m.dispose();
      for (const d of [decalFront, decalBack] as (Mesh | null)[]) { const m = d?.material as MeshBasicMaterial | undefined; m?.map?.dispose(); m?.dispose(); }
      holo.dispose();
    },
  };
}
