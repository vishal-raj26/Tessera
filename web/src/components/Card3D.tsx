// The plan card as a real 3D object (see three/cardScene.ts). Shows the CSS card until three.js has
// loaded, and keeps it if WebGL isn't available. Tilts with the finger, the phone (gyro), or a slow
// idle sway, through the same springs as the CSS card.
import { useMotionValue, useSpring } from 'framer-motion';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlanId } from '../api';
import { tg } from '../tg';
import { HoloCard, PLAN_LABEL } from './HoloCard';
import type { CardScene } from '../three/cardScene';

interface Props { planId: PlanId; label?: string; product?: string; store?: string; credit?: string; term?: string; interactive?: boolean; idle?: boolean; className?: string }

const webgl = (() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
})();

export const Card3D = memo(function Card3D({ planId, label, product, store, credit, term, interactive = false, idle = false, className = '' }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CardScene | null>(null);
  const [ready, setReady] = useState(false);
  const face = { name: label ?? PLAN_LABEL[planId] ?? planId, credit: credit ? `Credit ${credit}` : 'Credit', term: term ?? '1 month', top: `${store ?? 'App Store'} credit for ${product ?? 'Claude'}` };
  const faceKey = `${face.name}|${face.credit}|${face.term}|${face.top}`;

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 140, damping: 18 });
  const sy = useSpring(py, { stiffness: 140, damping: 18 });

  // create the scene once (three.js loads on first use)
  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    import('../three/cardScene')
      .then(({ createCardScene }) => createCardScene(canvas.current!, face))
      .then((s) => {
        if (!alive) { s.dispose(); return; }
        scene.current = s;
        const r = wrap.current!.getBoundingClientRect();
        s.resize(r.width * 1.25, r.height * 1.25);
        s.setTilt(sx.get(), sy.get());
        setReady(true);
      })
      .catch(() => { /* keep the CSS card */ });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // new plan, credit or term: repaint the face
  useEffect(() => { scene.current?.setFace(face); }, [faceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the canvas sized to the card
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => scene.current?.resize(e.contentRect.width * 1.25, e.contentRect.height * 1.25));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // tilt -> the 3D card
  useEffect(() => {
    const push = () => scene.current?.setTilt(sx.get(), sy.get());
    const a = sx.on('change', push);
    const b = sy.on('change', push);
    return () => { a(); b(); };
  }, [sx, sy]);

  // finger + gyro
  useEffect(() => {
    if (!interactive) { px.set(0); py.set(0); return; }
    const el = wrap.current;
    const move = (e: PointerEvent) => {
      const r = el!.getBoundingClientRect();
      px.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
      py.set(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    };
    const leave = () => { px.set(0); py.set(0); };
    el?.addEventListener('pointermove', move);
    el?.addEventListener('pointerleave', leave);
    const offTilt = tg.onTilt((x, y) => { px.set(x); py.set(y); });
    return () => { el?.removeEventListener('pointermove', move); el?.removeEventListener('pointerleave', leave); offTilt(); };
  }, [interactive, px, py]);

  // slow idle sway so the light moves across it even untouched (paused while the app is hidden)
  useEffect(() => {
    if (!idle || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const s = (t - t0) / 1000;
      if (!document.hidden && !wrap.current?.matches(':hover')) { px.set(Math.sin(s * 0.7) * 0.55); py.set(Math.cos(s * 0.5) * 0.36); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idle, px, py]);

  return (
    <div ref={wrap} className={`card-wrap card3d ${ready ? 'is-ready' : ''} ${className}`}>
      {!ready && <HoloCard planId={planId} label={label} product={product} store={store} credit={credit} term={term} interactive={interactive} idle={idle} className="fill" />}
      <canvas ref={canvas} className="card3d-canvas" aria-hidden="true" />
      <span className="card3d-shadow" aria-hidden="true" />
    </div>
  );
});
