// The aurora: soft light resting along the bottom edge of the screen, in the product's colours, its
// streaks always flowing down into the edge, as if the bottom were calling the card towards it.
// Pulling the card down raises a path of light up to meet it; letting go past the pull point draws the
// light back down into the bottom behind the card. While paying, the light gathers into a glow around the screen's edge and an orb at the
// bottom; when the credit is ready the edge lights up once more.
//
// One full-screen WebGL canvas behind everything (a single fragment shader, no three.js), drawn only
// while something is lit and the app is in front. Falls back to a CSS glow when WebGL isn't there.
import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

export interface AuroraInputs {
  /** how far up the light reaches from the bottom edge, as a share of the screen height */
  reach: MotionValue<number>;
  /** overall brightness of the resting glow 0 … 1 */
  glow: MotionValue<number>;
  /** where the falling band of light is: 0 at the top … 1 at the bottom */
  sweep: MotionValue<number>;
  /** how bright that band is 0 … 1 */
  sweepGlow: MotionValue<number>;
  /** the light around the screen's edge 0 … 1 */
  rim: MotionValue<number>;
  /** the orb at the bottom 0 … 1 */
  orb: MotionValue<number>;
}

/** Product colours: deep, middle, light (the light core is near white). */
const AURORA_COLORS: Record<string, [string, string, string]> = {
  claude: ['#FF6A2B', '#FF9C6B', '#FFE0CC'],
};

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime, uReach, uGlow, uSweep, uSweepGlow, uRim, uOrb, uRadius;
uniform vec3 uDeep, uMid, uLight;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s / 0.875; }
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 tone(float k, float streak) {
  vec3 c = mix(uDeep, uMid, smoothstep(0.0, 0.5, k));
  c = mix(c, uLight, smoothstep(0.7, 1.05, k + streak * 0.1));
  return c;
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
    float yb = uv.y;                     // 0 at the bottom edge, 1 at the top
  float x = uv.x - 0.5;
  float t = uTime;
  vec3 col = vec3(0.0); float a = 0.0;

  // the light lives at the bottom edge, like a doorway; its streaks always flow down into it, so the
  // bottom seems to draw things towards it. Pulling the card raises a path of light up to the card.
  float reach = max(uReach, 0.001);
  // wide at the bottom edge, narrowing into a path as it rises towards the card
  float width = mix(0.7, 0.26, clamp(yb / reach, 0.0, 1.0));
  float side = exp(-pow(x / width, 2.0) * 2.0);
  float fall = exp(-pow(yb / reach, 1.5) * 1.6);
  // the streaks (the costly part) only where the light can be seen: most of the screen is dark
  float streak = 0.0;
  if (uGlow > 0.002 && fall * side * uGlow > 0.003) {
    float sway = fbm(vec2(x * 1.8 + t * 0.04, yb * 0.6 + t * 0.1));
    float rays = fbm(vec2(x * 11.0 + sway * 2.2, yb * 0.9 + t * 0.55));
    streak = smoothstep(0.3, 0.9, rays);
  }
  float body = fall * side * (0.55 + 0.75 * streak * smoothstep(0.0, 0.3, yb / reach));
  float edge = exp(-yb * 55.0) * smoothstep(0.7, 0.0, abs(x)) * 1.4;
  float core = exp(-yb / (reach * 0.13)) * side;
  vec3 c = tone(clamp(fall * side * 1.15 + streak * 0.15, 0.0, 1.0), streak);
  c = mix(c, vec3(1.0, 0.94, 0.88), clamp(core * 1.0 + edge, 0.0, 1.0) * 0.75);
  float aur = clamp((body * 1.6 + edge * 0.8 + core * 0.5) * uGlow, 0.0, 1.0);
  col += c * aur; a = max(a, aur);

  // the edge of the screen glowing, and the orb at the bottom
  if (uRim > 0.001 || uOrb > 0.001) {
    vec2 q = px - uRes * 0.5;
    float d = box(q, uRes * 0.5 - 1.0, uRadius);
    // the middle of the screen is far from the edge and the orb: nothing to light there
    vec2 o0 = vec2(px.x - uRes.x * 0.5, px.y - uRes.y * 0.035);
    if (d < -uRes.x * 0.32 && length(o0) > uRes.x * 0.45) { gl_FragColor = vec4(col, a); return; }
    float pulse = 0.85 + 0.15 * sin(t * 2.4);
    float rimL = exp(d / 5.0) * 0.9 + exp(d / 38.0) * 0.45;
    float travel = 0.6 + 0.4 * sin(atan(q.y, q.x) * 2.0 - t * 1.6);
    vec3 rc = mix(uMid, uLight, travel * 0.6);
    float r = clamp(rimL * uRim * pulse * travel, 0.0, 1.0);
    col += rc * r; a = max(a, r);
    vec2 o = vec2(px.x - uRes.x * 0.5, px.y - uRes.y * 0.035);
    float orbL = exp(-length(o / vec2(1.0, 1.25)) / (uRes.x * 0.055)) * uOrb * pulse;
    col += mix(uMid, vec3(1.0, 0.95, 0.9), orbL) * orbL; a = max(a, clamp(orbL, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, a);
}`;

const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);

export function Aurora({ inputs, product = 'claude' }: { inputs: AuroraInputs; product?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = AURORA_COLORS[product] ?? AURORA_COLORS.claude;

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl || gl.isContextLost()) { canvas.classList.add('no-gl'); return; }
    canvas.classList.remove('no-gl');
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.add('no-gl'); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (k: string) => gl.getUniformLocation(prog, k);
    const U = { res: u('uRes'), time: u('uTime'), reach: u('uReach'), glow: u('uGlow'), sweep: u('uSweep'), sweepGlow: u('uSweepGlow'), rim: u('uRim'), orb: u('uOrb'), radius: u('uRadius'), deep: u('uDeep'), mid: u('uMid'), light: u('uLight') };
    gl.uniform3fv(U.deep, hex(colors[0])); gl.uniform3fv(U.mid, hex(colors[1])); gl.uniform3fv(U.light, hex(colors[2]));

    // soft light needs few pixels: drawn at ~40% of the screen's size and scaled up (much cheaper on
    // phones). The size comes from a ResizeObserver, never read in the frame loop (no forced layout).
    const scale = 0.42;
    const size = (cw: number, ch: number) => {
      const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.res, w, h);
      gl.uniform1f(U.radius, 40 * scale);
    };
    size(canvas.clientWidth, canvas.clientHeight);
    const ro = new ResizeObserver(([e]) => size(e.contentRect.width, e.contentRect.height));
    ro.observe(canvas);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, cleared = false, odd = false, last = '';
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const glow = inputs.glow.get(), rim = inputs.rim.get(), orb = inputs.orb.get(), sweepGlow = inputs.sweepGlow.get();
      // nothing lit: clear once and idle
      if (glow < 0.002 && rim < 0.002 && orb < 0.002 && sweepGlow < 0.002) {
        if (!cleared) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); cleared = true; }
        return;
      }
      cleared = false;
      // while something moves it (a pull, a release, a screen change): every frame. At rest it only
      // drifts slowly, so every other frame is enough, which halves its cost.
      const key = `${glow.toFixed(3)}${inputs.reach.get().toFixed(3)}${rim.toFixed(3)}${orb.toFixed(3)}`;
      const moving = key !== last;
      last = key;
      odd = !odd;
      if (!moving && odd && !still) return;
      gl.uniform1f(U.time, still ? 4 : (now - t0) / 1000);
      gl.uniform1f(U.reach, inputs.reach.get());
      gl.uniform1f(U.glow, glow);
      gl.uniform1f(U.sweep, inputs.sweep.get());
      gl.uniform1f(U.sweepGlow, sweepGlow);
      gl.uniform1f(U.rim, rim);
      gl.uniform1f(U.orb, orb);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    // (the context isn't thrown away: React may run this effect again on the same canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); gl.deleteBuffer(buf); gl.deleteProgram(prog); };
  }, [inputs, colors]);

  return <canvas ref={ref} className="aurora" aria-hidden="true" />;
}
