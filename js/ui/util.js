// Petits composants et outils d'interface partagés.
import { keyName, splitKey } from '../core/camelot.js';
import { formatDuration, filterTracks, emptyFilters } from '../core/model.js';
import { scoreClass } from '../core/compat.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const frNum = (n, d = 1) => Number(n).toFixed(d).replace('.', ',').replace(/,0+$/, '');
export const signed = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + frNum(Math.abs(n), d);
export const frDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function keyHue(code) { const k = splitKey(code); return k ? (k.n * 30 + 120) % 360 : 0; }

export function keyBadge(code) {
  const k = splitKey(code);
  if (!k) return '<span class="key none">—</span>';
  return `<span class="key ${k.letter}" style="--h:${keyHue(code)}">${code}<small>${keyName(code)}</small></span>`;
}

export function energyBar(e) {
  if (!e) return '<span class="energy none">E —</span>';
  return `<span class="energy" style="--e:${e}"><i></i><b>E${e}</b></span>`;
}

/** Ligne de morceau standard. opts : act, selected, right (HTML à droite), sub (2e ligne) */
export function trackRow(t, opts = {}) {
  return `<button class="trow ${opts.selected ? 'sel' : ''}" data-act="${opts.act || 'track-open'}" data-id="${esc(t.id)}">
    ${keyBadge(t.key)}
    <span class="tmain"><b>${esc(t.title)}</b><span>${esc(opts.sub != null ? opts.sub : [t.artist, t.genre].filter(Boolean).join(' · '))}</span></span>
    <span class="bpm">${t.bpm ? frNum(t.bpm) : '—'}<small>BPM</small></span>
    ${energyBar(t.energy)}
    <span class="dur">${formatDuration(t.duration) || '—'}</span>
    ${opts.right || ''}
  </button>`;
}

/** Résumé court d'une transition : "+1 · BPM +1,6 % · E +1" */
export function transitionSummary(r) {
  const parts = [r.key.label];
  if (!r.bpm.unknown) parts.push(`BPM ${signed(r.bpm.diffPct)} %${r.bpm.mode === 'double' ? ' (×2)' : r.bpm.mode === 'half' ? ' (÷2)' : ''}`);
  if (!r.energy.unknown) parts.push(`E ${signed(r.energy.gap, 0)}`);
  return parts.join(' · ');
}

export function scoreBadge(r, act = 'why') {
  return `<button class="score ${r.compatible ? scoreClass(r.score) : 'bad'}" data-act="${act}" aria-label="Score ${r.score}, voir pourquoi">${r.score}</button>`;
}

export function whyBlock(r) {
  return `<div class="why" hidden><ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

export function stepper(label, name, value, o = {}) {
  return `<div class="stepper"><span class="lbl">${label}</span>
    <button class="btn sq" data-act="set-step" data-name="${name}" data-delta="${-(o.step || 1)}" data-min="${o.min ?? 0}" data-max="${o.max ?? 100}" aria-label="Moins">−</button>
    <b>${o.prefix || ''}${frNum(value)}${o.unit || ''}</b>
    <button class="btn sq" data-act="set-step" data-name="${name}" data-delta="${o.step || 1}" data-min="${o.min ?? 0}" data-max="${o.max ?? 100}" aria-label="Plus">+</button></div>`;
}

export function chip(label, on, act, data = {}) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" ${attrs}>${label}</button>`;
}

// ---------- Toast ----------
let toastTimer = null;
export function toast(message, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="btn">${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 3000);
}

// ---------- Fenêtres modales ----------
export function openModal(html, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back ' + cls;
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap && !wrap.classList.contains('sticky')) wrap.remove(); });
  $('#modal-root').appendChild(wrap);
  return wrap;
}

export function confirmDialog(message, okLabel = 'Confirmer', danger = false) {
  return new Promise((resolve) => {
    const m = openModal(`<p class="modal-msg">${esc(message)}</p>
      <div class="modal-actions"><button class="btn" data-x="0">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="1">${esc(okLabel)}</button></div>`, 'sticky');
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (b) { m.remove(); resolve(b.dataset.x === '1'); }
    });
  });
}

/** Liste de choix. options : [{ label, value, sub }] → Promise(value | null) */
export function chooser(title, options) {
  return new Promise((resolve) => {
    const m = openModal(`<h2>${esc(title)}</h2><div class="choices">${options.map((o, i) =>
      `<button class="btn block" data-x="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>
      <div class="modal-actions"><button class="btn" data-x="-1">Annuler</button></div>`);
    const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); resolve(null); } });
    obs.observe($('#modal-root'), { childList: true });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      obs.disconnect(); m.remove();
      resolve(b.dataset.x === '-1' ? null : options[Number(b.dataset.x)].value);
    });
  });
}

/**
 * Sélecteur de morceau avec recherche.
 * items : [{ track, result? }] déjà triés. onPick(track).
 */
export function openPicker({ title, items, onPick }) {
  const m = openModal(`<h2>${esc(title)}</h2>
    <input type="search" class="search" placeholder="Rechercher…" enterkeyhint="search">
    <div class="list picker-list"></div>
    <div class="modal-actions"><button class="btn" data-close>Fermer</button></div>`, 'tall');
  const list = $('.picker-list', m), input = $('input', m);
  const draw = () => {
    const keep = new Set(filterTracks(items.map(i => i.track), { ...emptyFilters(), q: input.value }).map(t => t.id));
    const shown = items.filter(i => keep.has(i.track.id)).slice(0, 200);
    list.innerHTML = shown.length ? shown.map(i => trackRow(i.track, {
      act: '', sub: i.result ? transitionSummary(i.result) : undefined,
      right: i.result ? `<span class="score ${i.result.compatible ? scoreClass(i.result.score) : 'bad'}">${i.result.score}</span>` : '',
    })).join('') : '<p class="empty">Aucun morceau.</p>';
  };
  draw();
  input.addEventListener('input', draw);
  m.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { m.remove(); return; }
    const row = e.target.closest('.trow');
    if (row) { m.remove(); onPick(items.find(i => i.track.id === row.dataset.id).track); }
  });
  return m;
}

// ---------- Fichiers ----------
/** Enregistre un fichier : feuille de partage sur iPad (« Enregistrer dans Fichiers »), téléchargement ailleurs. */
export async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  if (navigator.maxTouchPoints > 1 && navigator.canShare) {
    try {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // l'utilisateur a annulé
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}

/** Ouvre le sélecteur de fichiers et renvoie le texte du fichier choisi (null si annulé). */
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    input.click();
  });
}
