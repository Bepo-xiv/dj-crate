// Écran Sets : historique, assistant de création (courbe d'énergie), éditeur avec glisser-déposer.
import { app } from './state.js';
import { scoreTransition, scoreClass } from '../core/compat.js';
import { CURVES, CURVE_POINTS, curveValue, buildSet, analyzeSet } from '../core/setbuilder.js';
import { normalizeSet, formatDuration, facet, sortTracks, newId } from '../core/model.js';
import { setToText } from '../core/importers.js';
import {
  $, esc, frDate, today, keyBadge, energyBar, frNum, transitionSummary, whyBlock, chip, toast, confirmDialog, openPicker, saveFile,
} from './util.js';
import { makeSortable, moveItem } from './dragsort.js';
import { openSketch, sketchThumb } from './sketch.js';

const STATUS = { draft: 'Brouillon', live: 'En cours', played: 'Joué' };
const updateSet = (id, patch) => { app.state.sets = app.state.sets.map(s => (s.id === id ? { ...s, ...patch } : s)); };

// ------------------------------------------------------------------ Liste des sets
function listHtml() {
  const sets = [...app.state.sets].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<header class="bar"><h1 class="grow">Sets</h1>
      <button class="btn" data-act="set-new-empty">Set vide</button>
      <button class="btn primary" data-act="builder-open">＋ Construire un set</button></header>
    <div class="list" data-scroll="sets">${sets.length ? sets.map(s => {
      const a = analyzeSet(app.setTracks(s), app.state.settings);
      return `<button class="srow" data-act="set-open" data-id="${esc(s.id)}">
        <b>${esc(s.name)}</b>
        <span>${frDate(s.date)}${s.venue ? ' · ' + esc(s.venue) : ''} · ${s.trackIds.length} morceau${s.trackIds.length > 1 ? 'x' : ''} · ${formatDuration(a.totalSec) || '0:00'}${a.avgScore != null ? ' · score moyen ' + a.avgScore : ''}</span>
        <i class="status ${s.status}">${STATUS[s.status]}</i></button>`;
    }).join('') : `<div class="empty"><p>Aucun set pour l'instant.</p><p>« Construire un set » te propose un enchaînement à partir d'un morceau de départ, d'une durée et d'une courbe d'énergie.</p></div>`}</div>`;
}

// ------------------------------------------------------------------ Assistant
const CX = (i) => 24 + i * 29.2, CY = (v) => 132 - (v - 1) / 9 * 120;
function curveSvg(points, editable) {
  const pts = points.map((v, i) => `${CX(i).toFixed(1)},${CY(v).toFixed(1)}`).join(' ');
  return `<svg class="curve ${editable ? 'edit' : ''}" id="${editable ? 'curve-edit' : ''}" viewBox="0 0 340 150">
    ${[1, 4, 7, 10].map(v => `<line x1="20" x2="320" y1="${CY(v)}" y2="${CY(v)}" class="grid"/><text x="4" y="${CY(v) + 4}" class="axis">${v}</text>`).join('')}
    <polyline points="${pts}" class="cline"/>
    ${points.map((v, i) => `<circle cx="${CX(i).toFixed(1)}" cy="${CY(v).toFixed(1)}" r="5" class="cdot"/>`).join('')}
  </svg>`;
}

function builderHtml() {
  const b = app.ui.builder, start = b.startId && app.track(b.startId);
  const genres = facet(app.state.tracks, 'genre');
  return `<header class="bar"><button class="btn" data-act="builder-cancel">‹ Annuler</button><h1 class="grow">Construire un set</h1>
      <button class="btn primary" data-act="builder-go">Générer</button></header>
    <div class="dscroll form" data-scroll="builder">
      <label>Nom du set<input value="${esc(b.name)}" data-change="b-name"></label>
      <div class="field">Morceau de départ
        <button class="btn block left" data-act="b-pick-start">${start ? `${keyBadge(start.key)} <b>${esc(start.title)}</b> — ${esc(start.artist)}` : 'Choisir un morceau…'}</button></div>
      <div class="field">Durée visée : <b>${b.minutes} min</b>
        <div class="chips">${[30, 45, 60, 90, 120, 180].map(m => chip(m + ' min', b.minutes === m, 'b-min', { v: m })).join('')}
          <button class="btn sq" data-act="b-min" data-d="-5">−</button><button class="btn sq" data-act="b-min" data-d="5">+</button></div></div>
      <div class="field">Courbe d'énergie
        <div class="chips">${Object.entries(CURVES).map(([k, c]) => chip(c.label, b.curveKey === k, 'b-curve', { k })).join('')}${b.curveKey === 'custom' ? chip('Dessinée', true, '') : ''}</div>
        ${curveSvg(b.points, true)}
        <p class="hint">Dessine ta propre courbe au Pencil ou au doigt directement sur le graphique (début du set à gauche, fin à droite).</p></div>
      ${genres.length > 1 ? `<div class="field">Limiter aux genres (facultatif)
        <div class="chips">${genres.map(g => chip(`${esc(g.value)} <small>${g.n}</small>`, b.genres.includes(g.value), 'b-genre', { v: g.value })).join('')}</div></div>` : ''}
      <button class="btn primary block" data-act="builder-go">Générer l'enchaînement</button>
    </div>`;
}

function mountBuilder(root) {
  const svg = $('#curve-edit', root);
  if (!svg) return;
  let active = null;
  const apply = (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 340, y = (e.clientY - r.top) / r.height * 150;
    const i = Math.max(0, Math.min(CURVE_POINTS - 1, Math.round((x - 24) / 29.2)));
    const v = Math.max(1, Math.min(10, Math.round((1 + (132 - y) / 120 * 9) * 2) / 2));
    const b = app.ui.builder;
    b.points = b.points.map((p, j) => (j === i ? v : p));
    b.curveKey = 'custom';
    svg.querySelector('.cline').setAttribute('points', b.points.map((p, j) => `${CX(j).toFixed(1)},${CY(p).toFixed(1)}`).join(' '));
    svg.querySelectorAll('.cdot')[i].setAttribute('cy', CY(v).toFixed(1));
  };
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); active = e.pointerId; try { svg.setPointerCapture(active); } catch { /* ok */ } apply(e); });
  svg.addEventListener('pointermove', (e) => { if (e.pointerId === active) { e.preventDefault(); apply(e); } });
  const end = (e) => { if (e.pointerId === active) { active = null; app.renderMain(); } };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

app.on('builder-open', () => {
  if (!app.state.tracks.length) { toast('Ajoute d\'abord des morceaux à ta bibliothèque.'); return; }
  const start = app.ui.trackId && app.track(app.ui.trackId);
  app.ui.builder = { name: 'Set du ' + frDate(today()), startId: start ? start.id : null, minutes: 60, curveKey: 'montee', points: [...CURVES.montee.points], genres: [] };
  app.ui.setId = null;
  app.renderMain();
});
app.on('builder-cancel', () => { app.ui.builder = null; app.renderMain(); });
app.onChange('b-name', (v) => { app.ui.builder.name = v; });
app.on('b-min', ({ v, d }) => {
  const b = app.ui.builder;
  b.minutes = v ? Number(v) : Math.max(10, Math.min(600, b.minutes + Number(d)));
  app.renderMain();
});
app.on('b-curve', ({ k }) => { const b = app.ui.builder; b.curveKey = k; b.points = [...CURVES[k].points]; app.renderMain(); });
app.on('b-genre', ({ v }) => {
  const b = app.ui.builder;
  b.genres = b.genres.includes(v) ? b.genres.filter(x => x !== v) : [...b.genres, v];
  app.renderMain();
});
app.on('b-pick-start', () => {
  openPicker({
    title: 'Morceau de départ',
    items: sortTracks(app.state.tracks, 'title').map(track => ({ track })),
    onPick: (t) => { app.ui.builder.startId = t.id; app.renderMain(); },
  });
});
app.on('builder-go', () => {
  const b = app.ui.builder, start = b.startId && app.track(b.startId);
  if (!start) { toast('Choisis d\'abord le morceau de départ.'); return; }
  const pool = b.genres.length ? app.state.tracks.filter(t => b.genres.includes(t.genre)) : app.state.tracks;
  const r = buildSet({ start, tracks: pool, targetSec: b.minutes * 60, curve: b.points, settings: app.state.settings });
  const set = normalizeSet({ name: b.name, date: today(), targetSec: b.minutes * 60, curve: b.points, trackIds: r.ids });
  app.state.sets = [...app.state.sets, set];
  app.ui.builder = null; app.ui.setId = set.id;
  app.commit();
  const short = r.totalSec < b.minutes * 60 - 300;
  toast(`${r.ids.length} morceaux, ${formatDuration(r.totalSec)}.` + (r.forced ? ` ${r.forced} transition(s) non harmonique(s) faute de mieux.` : '') + (short ? ' Bibliothèque trop petite pour atteindre la durée.' : ''));
});

// ------------------------------------------------------------------ Éditeur de set
function chartSvg(set, a) {
  const total = Math.max(a.totalSec, set.targetSec || 0, 1);
  const X = (sec) => 30 + sec / total * 560, Y = (v) => 108 - (v - 1) / 9 * 96;
  let target = '';
  if (set.curve.length) {
    const span = set.targetSec || a.totalSec || 1;
    target = `<polyline class="ctarget" points="${Array.from({ length: 41 }, (_, i) => `${X(span * i / 40).toFixed(1)},${Y(curveValue(set.curve, i / 40)).toFixed(1)}`).join(' ')}"/>`;
  }
  const pts = a.energy.filter(p => p.energy);
  return `<svg class="chart" viewBox="0 0 600 120" preserveAspectRatio="none">
    ${[1, 4, 7, 10].map(v => `<line x1="30" x2="590" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="6" y="${Y(v) + 4}" class="axis">${v}</text>`).join('')}
    ${target}
    <polyline class="cline" points="${pts.map(p => `${X(p.at).toFixed(1)},${Y(p.energy).toFixed(1)}`).join(' ')}"/>
    ${pts.map(p => `<circle class="cdot" r="4" cx="${X(p.at).toFixed(1)}" cy="${Y(p.energy).toFixed(1)}"/>`).join('')}
  </svg>`;
}

function editorHtml(set) {
  const list = app.setTracks(set), a = analyzeSet(list, app.state.settings);
  return `<header class="bar"><button class="btn" data-act="set-close">‹ Sets</button><span class="grow"></span>
      <i class="status ${set.status}">${STATUS[set.status]}</i>
      <button class="btn primary" data-act="set-add">＋ Morceau</button></header>
    <div class="dscroll" data-scroll="set-${esc(set.id)}">
      <div class="form set-meta">
        <label>Nom<input value="${esc(set.name)}" data-change="set-field" data-f="name"></label>
        <div class="two"><label>Date<input type="date" value="${esc(set.date)}" data-change="set-field" data-f="date"></label>
          <label>Lieu<input value="${esc(set.venue)}" data-change="set-field" data-f="venue"></label></div>
        <label>Notes<textarea rows="2" data-change="set-field" data-f="notes">${esc(set.notes)}</textarea></label>
      </div>
      <div class="facts">
        <span><small>Morceaux</small><b>${list.length}</b></span>
        <span><small>Durée estimée</small><b>${formatDuration(a.totalSec) || '0:00'}${set.targetSec ? ' / ' + formatDuration(set.targetSec) : ''}</b></span>
        <span><small>Score moyen</small><b>${a.avgScore ?? '—'}</b></span>
        <span><small>Transitions à risque</small><b class="${a.weak ? 'warn' : ''}">${a.weak}</b></span>
      </div>
      ${list.length ? `<h2>Énergie <small class="dim">— trait plein : ton set${set.curve.length ? ' · pointillés : courbe visée' : ''}</small></h2>${chartSvg(set, a)}` : ''}
      <h2>Enchaînement <small class="dim">— glisse ≡ pour réordonner</small></h2>
      <div class="set-list" id="set-list">${list.map((t, i) => {
        const tr = i ? a.transitions[i - 1] : null;
        return `<div class="set-row" data-id="${esc(t.id)}">
          ${tr ? `<div class="trans"><button class="score ${tr.compatible ? scoreClass(tr.score) : 'bad'}" data-act="why">${tr.score}</button><span>${esc(transitionSummary(tr))}</span></div>${whyBlock(tr)}` : ''}
          <div class="set-item"><span class="drag" aria-label="Déplacer">≡</span><span class="idx">${i + 1}</span>
            <button class="set-track" data-act="track-open" data-id="${esc(t.id)}">${keyBadge(t.key)}
              <span class="tmain"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span>
              <span class="bpm">${t.bpm ? frNum(t.bpm) : '—'}<small>BPM</small></span>${energyBar(t.energy)}</button>
            <button class="btn sq" data-act="set-remove" data-i="${i}" aria-label="Retirer du set">×</button></div></div>`;
      }).join('') || '<p class="empty">Set vide : ajoute un premier morceau avec « ＋ Morceau ».</p>'}</div>
      <h2>Notes manuscrites</h2>
      <button class="sketch-box" data-act="set-sketch">${sketchThumb(set.sketch) || '<span>✎ Écrire au Pencil</span>'}</button>
      <div class="actions">
        ${set.status === 'played' ? '<button class="btn" data-act="set-status" data-s="draft">Repasser en brouillon</button>' : '<button class="btn" data-act="set-status" data-s="played">✓ Marquer comme joué</button>'}
        <button class="btn" data-act="set-regen">Régénérer la suite</button>
        <button class="btn" data-act="set-dup">Dupliquer</button>
        <button class="btn" data-act="set-export">Exporter la tracklist</button>
        <button class="btn danger" data-act="set-delete">Supprimer le set</button>
      </div>
    </div>`;
}

app.views.sets = {
  render() {
    if (app.ui.builder) return builderHtml();
    const set = app.ui.setId && app.set(app.ui.setId);
    return set ? editorHtml(set) : listHtml();
  },
  mount(root) {
    if (app.ui.builder) { mountBuilder(root); return; }
    const list = $('#set-list', root);
    if (list) makeSortable(list, {
      item: '.set-row', handle: '.drag',
      onDrop: (from, to) => {
        const set = app.set(app.ui.setId);
        // les index affichés correspondent aux morceaux encore présents dans la bibliothèque
        const ids = app.setTracks(set).map(t => t.id);
        if (from !== to) updateSet(set.id, { trackIds: moveItem(ids, from, to) });
        app.commit();
      },
    });
  },
};

app.on('set-open', ({ id }) => { app.ui.view = 'sets'; app.ui.setId = id; app.ui.builder = null; if (window.matchMedia('(max-width: 999px)').matches) app.ui.trackId = null; app.render(); });
app.on('set-close', () => { app.ui.setId = null; app.renderMain(); });
app.on('set-new-empty', () => {
  const s = normalizeSet({ name: 'Set du ' + frDate(today()), date: today() });
  app.state.sets = [...app.state.sets, s]; app.ui.setId = s.id; app.commit();
});
app.onChange('set-field', (v, el) => { updateSet(app.ui.setId, { [el.dataset.f]: el.dataset.f === 'name' ? (v.trim() || 'Set sans nom') : v }); app.commit({ render: false }); });
app.on('set-remove', ({ i }) => {
  const set = app.set(app.ui.setId), ids = app.setTracks(set).map(t => t.id), before = set.trackIds;
  ids.splice(Number(i), 1);
  updateSet(set.id, { trackIds: ids }); app.commit();
  toast('Morceau retiré du set.', { label: 'Annuler', run: () => { updateSet(set.id, { trackIds: before }); app.commit(); } });
});
app.on('set-add', () => {
  const set = app.set(app.ui.setId), list = app.setTracks(set), last = list[list.length - 1];
  const inSet = new Set(set.trackIds);
  let items = app.state.tracks.filter(t => !inSet.has(t.id)).map(track => ({ track, result: last ? scoreTransition(last, track, app.state.settings) : null }));
  if (last) items.sort((x, y) => (y.result.compatible - x.result.compatible) || (y.result.score - x.result.score));
  else items = sortTracks(items.map(i => i.track), 'title').map(track => ({ track }));
  openPicker({
    title: last ? `Après « ${last.title} » — meilleures transitions d'abord` : 'Premier morceau du set',
    items,
    onPick: (t) => { updateSet(set.id, { trackIds: [...app.setTracks(app.set(set.id)).map(x => x.id), t.id] }); app.commit(); },
  });
});
app.on('set-status', ({ s }) => { updateSet(app.ui.setId, { status: s }); app.commit(); toast(s === 'played' ? 'Set marqué comme joué : il apparaît dans l\'historique de chaque morceau.' : 'Set repassé en brouillon.'); });
app.on('set-regen', async () => {
  const set = app.set(app.ui.setId), list = app.setTracks(set);
  if (!list.length) { toast('Ajoute d\'abord un morceau de départ.'); return; }
  if (!await confirmDialog(`Garder « ${list[0].title} » en premier et recalculer toute la suite ? L'ordre actuel sera remplacé.`, 'Régénérer')) return;
  const before = set.trackIds;
  const target = set.targetSec || Math.max(1800, analyzeSet(list, app.state.settings).totalSec);
  const r = buildSet({ start: list[0], tracks: app.state.tracks, targetSec: target, curve: set.curve.length ? set.curve : CURVES.montee.points, settings: app.state.settings });
  updateSet(set.id, { trackIds: r.ids, targetSec: target }); app.commit();
  toast('Enchaînement recalculé.', { label: 'Annuler', run: () => { updateSet(set.id, { trackIds: before }); app.commit(); } });
});
app.on('set-dup', () => {
  const set = app.set(app.ui.setId);
  const copy = normalizeSet({ ...set, id: newId(), name: set.name + ' (copie)', status: 'draft', date: today(), createdAt: '' });
  app.state.sets = [...app.state.sets, copy]; app.ui.setId = copy.id; app.commit();
  toast('Set dupliqué.');
});
app.on('set-export', () => {
  const set = app.set(app.ui.setId);
  saveFile(`${set.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'set'}.txt`, setToText(set, app.setTracks(set)), 'text/plain');
});
app.on('set-delete', async () => {
  const set = app.set(app.ui.setId);
  if (!await confirmDialog(`Supprimer le set « ${set.name} » ? Les morceaux restent dans la bibliothèque.`, 'Supprimer', true)) return;
  const before = app.state.sets;
  app.state.sets = app.state.sets.filter(s => s.id !== set.id); app.ui.setId = null; app.commit();
  toast('Set supprimé.', { label: 'Annuler', run: () => { app.state.sets = before; app.commit(); } });
});
app.on('set-sketch', () => {
  const set = app.set(app.ui.setId);
  openSketch(set.name, set.sketch, (strokes) => { updateSet(set.id, { sketch: strokes }); app.commit(); });
});
