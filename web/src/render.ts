// Dev-only (render.html): one card, still, on a transparent canvas, for the intro pictures.
import { createCardScene } from './three/cardScene';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const product = q.get('product') ?? 'claude';
createCardScene(canvas, {
  name: q.get('plan') ?? 'Pro', credit: 'Credit $25', term: '1 month',
  top: `App Store credit for ${q.get('name') ?? 'Claude'}`, tier: Number(q.get('tier') ?? 0), product,
}).then((s) => {
  s.resize(600, 900);
  s.setTurned(q.get('back') === '1');
  s.setTilt(Number(q.get('tx') ?? 0), Number(q.get('ty') ?? 0));
  setTimeout(() => document.body.setAttribute('data-ready', '1'), 2500);
});
