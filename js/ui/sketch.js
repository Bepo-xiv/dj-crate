// Notes manuscrites à l'Apple Pencil : tracés sensibles à la pression, rejet de la paume, gomme, annulation.
// Un tracé = { c: couleur, w: épaisseur, p: [x, y, pression, x, y, pression, …] } dans un repère 1000 × 750.
import { openModal, $ } from './util.js';

const W = 1000, H = 750;
const COLORS = ['#ffffff', '#ffd60a', '#ff5a4f', '#40c8ff', '#32d74b'];

function drawStroke(ctx, s, k) {
  const p = s.p;
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (p.length === 3) { ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, s.w * k * 0.6, 0, 7); ctx.fill(); return; }
  for (let i = 3; i < p.length; i += 3) {
    ctx.lineWidth = Math.max(0.6, s.w * k * (0.35 + 1.3 * (p[i + 2] / 100)));
    ctx.beginPath(); ctx.moveTo(p[i - 3] * k, p[i - 2] * k); ctx.lineTo(p[i] * k, p[i + 1] * k); ctx.stroke();
  }
}

/** Miniature SVG (lecture seule). */
export function sketchThumb(strokes) {
  if (!strokes || !strokes.length) return '';
  const paths = strokes.map(s => {
    let d = '';
    for (let i = 0; i < s.p.length; i += 3) d += (i ? 'L' : 'M') + s.p[i] + ' ' + s.p[i + 1];
    if (s.p.length === 3) d += 'l0.1 0';
    return `<path d="${d}" stroke="${s.c}" stroke-width="${s.w * 1.1}"/>`;
  }).join('');
  return `<svg class="sketch-thumb" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** Ouvre le bloc-notes plein écran. onSave(strokes) est appelé à la fermeture. */
export function openSketch(title, initial, onSave) {
  let strokes = (initial || []).map(s => ({ ...s, p: [...s.p] }));
  const history = [];
  let color = COLORS[0], tool = 'pen', current = null, penSeen = false, activeId = null;

  const m = openModal(`<div class="sk-bar">
      <b class="sk-title"></b>
      <span class="sk-tools">
        ${COLORS.map((c, i) => `<button class="sk-color ${i === 0 ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Couleur"></button>`).join('')}
        <button class="btn" data-tool="eraser">Gomme</button>
        <button class="btn" data-do="undo">Annuler</button>
        <button class="btn" data-do="clear">Effacer tout</button>
      </span>
      <button class="btn primary" data-do="close">Terminé</button>
    </div>
    <div class="sk-area"><canvas></canvas></div>
    <p class="sk-hint">Écris au Pencil (la paume est ignorée dès que le Pencil est détecté) ou au doigt.</p>`, 'sticky full');
  $('.sk-title', m).textContent = title;
  const canvas = $('canvas', m), area = $('.sk-area', m), ctx = canvas.getContext('2d');
  let k = 1;

  const redraw = () => {
    const dpr = window.devicePixelRatio || 1;
    const r = area.getBoundingClientRect();
    const cssW = Math.max(50, Math.min(r.width, r.height * W / H)), cssH = cssW * H / W;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    k = canvas.width / W;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(ctx, s, k);
  };
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)];
  };
  const pressure = (e) => Math.round((e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.45) * 100);
  const snapshot = () => { history.push(strokes.map(s => s)); if (history.length > 60) history.shift(); };
  const erase = (x, y) => {
    const before = strokes.length;
    strokes = strokes.filter(s => { for (let i = 0; i < s.p.length; i += 3) if (Math.hypot(s.p[i] - x, s.p[i + 1] - y) < 22) return false; return true; });
    if (strokes.length !== before) redraw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (penSeen && e.pointerType === 'touch') return; // rejet de la paume
    if (activeId != null) return;
    e.preventDefault();
    activeId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ok */ }
    const [x, y] = pos(e);
    snapshot();
    if (tool === 'eraser') { erase(x, y); return; }
    current = { c: color, w: 4, p: [x, y, pressure(e)] };
    strokes.push(current);
    drawStroke(ctx, current, k);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) {
      const [x, y] = pos(ev);
      if (tool === 'eraser') { erase(x, y); continue; }
      if (!current) continue;
      const n = current.p.length;
      if (Math.abs(current.p[n - 3] - x) + Math.abs(current.p[n - 2] - y) < 2) continue;
      current.p.push(x, y, pressure(ev));
      const m2 = current.p.length;
      ctx.strokeStyle = current.c; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.6, current.w * k * (0.35 + 1.3 * (current.p[m2 - 1] / 100)));
      ctx.beginPath(); ctx.moveTo(current.p[m2 - 6] * k, current.p[m2 - 5] * k); ctx.lineTo(x * k, y * k); ctx.stroke();
    }
  });
  const end = (e) => { if (e.pointerId === activeId) { activeId = null; current = null; } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const onResize = () => redraw();
  window.addEventListener('resize', onResize);

  m.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]'), t = e.target.closest('[data-tool]'), d = e.target.closest('[data-do]');
    if (c) {
      color = c.dataset.color; tool = 'pen';
      m.querySelectorAll('.sk-color').forEach(b => b.classList.toggle('on', b === c));
      $('[data-tool]', m).classList.remove('on');
    } else if (t) {
      tool = tool === 'eraser' ? 'pen' : 'eraser';
      t.classList.toggle('on', tool === 'eraser');
    } else if (d) {
      if (d.dataset.do === 'undo') { if (history.length) { strokes = history.pop(); redraw(); } }
      else if (d.dataset.do === 'clear') { snapshot(); strokes = []; redraw(); }
      else if (d.dataset.do === 'close') {
        window.removeEventListener('resize', onResize);
        m.remove();
        onSave(strokes);
      }
    }
  });
  requestAnimationFrame(redraw);
}
