// Écran Bibliothèque : liste, recherche, filtres + panneau de détail / édition d'un morceau.
import { app } from './state.js';
import { ALL_KEYS, parseKey, keyLabel } from '../core/camelot.js';
import { findCompatible } from '../core/compat.js';
import {
  normalizeTrack, normalizeSet, formatDuration, filterTracks, sortTracks, facet, activeFilterCount, emptyFilters, setsForTrack,
} from '../core/model.js';
import {
  $, esc, frNum, frDate, today, keyBadge, energyBar, trackRow, transitionSummary, scoreBadge, whyBlock, stepper, chip,
  toast, confirmDialog, chooser,
} from './util.js';
import { openSketch, sketchThumb } from './sketch.js';

const BPM_RANGES = [[0, 99, '< 100'], [100, 114, '100–114'], [115, 121, '115–121'], [122, 127, '122–127'], [128, 134, '128–134'], [135, 149, '135–149'], [150, 0, '≥ 150']];
const SORTS = [['title', 'Titre'], ['artist', 'Artiste'], ['bpm', 'BPM'], ['key', 'Clé'], ['energy', 'Énergie']];

function visibleTracks() {
  const { filters, sort } = app.ui;
  return sortTracks(filterTracks(app.state.tracks, filters), sort.field, sort.dir);
}

function listHtml() {
  const all = visibleTracks();
  if (!app.state.tracks.length) {
    return `<div class="empty"><p>Ta bibliothèque est vide.</p>
      <p><button class="btn primary" data-act="track-new">＋ Ajouter un morceau</button></p>
      <p><button class="btn" data-act="demo-load">Charger la bibliothèque de démonstration</button></p>
      <p>Tu peux aussi importer un CSV ou un export Rekordbox depuis <b>Réglages</b>.</p></div>`;
  }
  if (!all.length) return '<p class="empty">Aucun morceau ne correspond. <button class="btn" data-act="f-reset">Effacer les filtres</button></p>';
  const shown = all.slice(0, app.ui.listLimit);
  return shown.map(t => trackRow(t, { selected: t.id === app.ui.trackId })).join('')
    + (all.length > shown.length ? `<button class="btn block" data-act="list-more">Afficher plus (${all.length - shown.length} restants)</button>` : '');
}

function filterPanel() {
  const f = app.ui.filters;
  const genres = facet(app.state.tracks, 'genre'), tags = facet(app.state.tracks, 'tags');
  return `<section class="filters">
    <div class="frow"><span class="lbl">BPM</span><div class="chips">
      ${BPM_RANGES.map(([a, b, l]) => chip(l, f.bpmMin === a && f.bpmMax === b && (a || b), 'f-bpm', { min: a, max: b })).join('')}
      <input class="num" type="number" inputmode="decimal" placeholder="min" value="${f.bpmMin || ''}" data-change="f-bpm-min" aria-label="BPM minimum">
      <input class="num" type="number" inputmode="decimal" placeholder="max" value="${f.bpmMax || ''}" data-change="f-bpm-max" aria-label="BPM maximum">
    </div></div>
    <div class="frow"><span class="lbl">Énergie</span><div class="chips">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(e => chip(e, f.energies.includes(e), 'f-toggle', { field: 'energies', value: e })).join('')}
    </div></div>
    <div class="frow"><span class="lbl">Clé</span><div class="chips keys">
      ${ALL_KEYS.map(k => chip(k, f.keys.includes(k), 'f-toggle', { field: 'keys', value: k })).join('')}
    </div></div>
    ${genres.length ? `<div class="frow"><span class="lbl">Genre</span><div class="chips">
      ${genres.map(g => chip(`${esc(g.value)} <small>${g.n}</small>`, f.genres.includes(g.value), 'f-toggle', { field: 'genres', value: g.value })).join('')}</div></div>` : ''}
    ${tags.length ? `<div class="frow"><span class="lbl">Tags</span><div class="chips">
      ${tags.map(g => chip(`#${esc(g.value)} <small>${g.n}</small>`, f.tags.includes(g.value), 'f-toggle', { field: 'tags', value: g.value })).join('')}</div></div>` : ''}
    <div class="frow"><button class="btn" data-act="f-reset">Tout effacer</button><button class="btn primary" data-act="filters-toggle">Fermer les filtres</button></div>
  </section>`;
}

function countHtml() {
  const n = visibleTracks().length, total = app.state.tracks.length;
  return n === total ? `${total} morceau${total > 1 ? 'x' : ''}` : `${n} / ${total}`;
}

app.views.library = {
  render() {
    const f = app.ui.filters, n = activeFilterCount(f), s = app.ui.sort;
    return `<header class="bar">
        <input type="search" class="search" placeholder="Rechercher titre, artiste, tag…" value="${esc(f.q)}" data-input="search" enterkeyhint="search" autocapitalize="off" autocorrect="off">
        <button class="btn ${n || app.ui.filtersOpen ? 'on' : ''}" data-act="filters-toggle">Filtres${n ? ` <b class="pill">${n}</b>` : ''}</button>
        <button class="btn primary" data-act="track-new" aria-label="Ajouter un morceau">＋</button>
      </header>
      ${app.ui.filtersOpen ? filterPanel() : ''}
      <div class="sortbar"><span id="lib-count">${countHtml()}</span><span class="chips">
        ${SORTS.map(([k, l]) => chip(l + (s.field === k ? (s.dir > 0 ? ' ↑' : ' ↓') : ''), s.field === k, 'sort', { field: k })).join('')}</span></div>
      <div class="list" id="track-list" data-scroll="lib">${listHtml()}</div>`;
  },
};

function refreshList() {
  const list = $('#track-list');
  if (list) { list.innerHTML = listHtml(); $('#lib-count').textContent = countHtml(); }
}

app.onInput('search', (v) => { app.ui.filters.q = v; app.ui.listLimit = 300; refreshList(); });
app.on('filters-toggle', () => { app.ui.filtersOpen = !app.ui.filtersOpen; app.renderMain(); });
app.on('f-reset', () => { app.ui.filters = emptyFilters(); app.renderMain(); });
app.on('f-toggle', ({ field, value }) => {
  const v = field === 'energies' ? Number(value) : value;
  const arr = app.ui.filters[field];
  app.ui.filters[field] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  app.renderMain();
});
app.on('f-bpm', ({ min, max }) => {
  const f = app.ui.filters, a = Number(min), b = Number(max);
  if (f.bpmMin === a && f.bpmMax === b) { f.bpmMin = 0; f.bpmMax = 0; } else { f.bpmMin = a; f.bpmMax = b; }
  app.renderMain();
});
app.onChange('f-bpm-min', (v) => { app.ui.filters.bpmMin = Number(v) || 0; app.renderMain(); });
app.onChange('f-bpm-max', (v) => { app.ui.filters.bpmMax = Number(v) || 0; app.renderMain(); });
app.on('sort', ({ field }) => {
  const s = app.ui.sort;
  app.ui.sort = s.field === field ? { field, dir: -s.dir } : { field, dir: 1 };
  app.renderMain();
});
app.on('list-more', () => { app.ui.listLimit += 300; refreshList(); });

// ------------------------------------------------------------------ Détail d'un morceau

function detailHtml(t) {
  const s = app.state.settings;
  const compat = findCompatible(t, app.state.tracks, s);
  const played = setsForTrack(t.id, app.state.sets);
  return `<header class="bar">
      <button class="btn" data-act="detail-close">‹ Fermer</button><span class="grow"></span>
      <button class="btn" data-act="track-edit">Modifier</button>
    </header>
    <div class="dscroll" data-scroll="detail">
      <div class="dhead">${keyBadge(t.key)}<div><h1>${esc(t.title)}</h1><p>${esc(t.artist || 'Artiste inconnu')}</p></div></div>
      <div class="facts">
        <span><small>BPM</small><b>${t.bpm ? frNum(t.bpm, 2) : '—'}</b></span>
        <span><small>Clé</small><b>${t.key ? keyLabel(t.key) : '—'}</b></span>
        <span><small>Énergie</small><b>${t.energy ? t.energy + ' / 10' : '—'}</b></span>
        <span><small>Durée</small><b>${formatDuration(t.duration) || '—'}</b></span>
        <span><small>Genre</small><b>${esc(t.genre || '—')}</b></span>
      </div>
      ${t.tags.length ? `<p class="tags">${t.tags.map(x => `<span class="tag">#${esc(x)}</span>`).join('')}</p>` : ''}
      <div class="actions">
        <button class="btn primary" data-act="live-play" data-id="${esc(t.id)}">▶ Jouer en Live</button>
        <button class="btn" data-act="track-add-to-set">＋ Ajouter à un set</button>
        <button class="btn" data-act="wheel-from-track">Voir sur la roue</button>
      </div>
      ${t.notes ? `<h2>Notes</h2><p class="notes">${esc(t.notes)}</p>` : ''}
      ${t.cues.length ? `<h2>Cue points</h2><ul class="cues">${t.cues.map(c => `<li><b>${esc(c.time || '•')}</b>${esc(c.label)}</li>`).join('')}</ul>` : ''}
      <h2>Notes manuscrites</h2>
      <button class="sketch-box" data-act="track-sketch">${sketchThumb(t.sketch) || '<span>✎ Écrire au Pencil</span>'}</button>
      <h2>Joué dans ${played.length} set${played.length > 1 ? 's' : ''}</h2>
      ${played.length ? `<div class="list flat">${played.map(x => `<button class="srow" data-act="set-open" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><span>${frDate(x.date)}${x.venue ? ' · ' + esc(x.venue) : ''}</span></button>`).join('')}</div>` : '<p class="dim">Pas encore joué.</p>'}
      <h2>Transitions compatibles <span class="pill">${compat.length}</span></h2>
      <div class="tune">
        ${stepper('BPM', 'bpmTolerance', s.bpmTolerance, { prefix: '±', unit: ' %', min: 0, max: 50 })}
        ${stepper('Énergie', 'maxEnergyGap', s.maxEnergyGap, { prefix: '±', min: 0, max: 9 })}
        ${chip('½ / ×2 tempo', s.halfDouble, 'set-toggle', { name: 'halfDouble' })}
        ${chip('Boosts +2 / +7', s.boosts, 'set-toggle', { name: 'boosts' })}
      </div>
      <div class="list flat">${compat.length ? compat.map(c => `<div class="crow">
          ${trackRow(c.track, { sub: transitionSummary(c.result), right: '' })}
          ${scoreBadge(c.result)}${whyBlock(c.result)}</div>`).join('')
        : '<p class="dim">Aucun morceau compatible avec ces réglages. Élargis la tolérance BPM ou l\'écart d\'énergie ci-dessus.</p>'}</div>
    </div>`;
}

function formHtml(t, isNew) {
  const genres = facet(app.state.tracks, 'genre');
  const cueRow = (c) => `<div class="cue-edit"><input name="cue-time" placeholder="1:32" value="${esc(c.time)}" inputmode="numeric" aria-label="Temps"><input name="cue-label" placeholder="Description (ex. entrée du kick)" value="${esc(c.label)}" aria-label="Description"><button type="button" class="btn sq" data-act="cue-del" aria-label="Supprimer le cue">×</button></div>`;
  return `<header class="bar">
      <button class="btn" data-act="edit-cancel">Annuler</button><span class="grow">${isNew ? 'Nouveau morceau' : 'Modifier'}</span>
      <button class="btn primary" data-act="edit-save">Enregistrer</button>
    </header>
    <form class="dscroll form" id="track-form" data-scroll="form" autocomplete="off" onsubmit="return false">
      <label>Titre<input name="title" value="${esc(isNew ? '' : t.title)}" required></label>
      <label>Artiste<input name="artist" value="${esc(t.artist)}"></label>
      <label>Genre<input name="genre" value="${esc(t.genre)}" list="genres"></label>
      <datalist id="genres">${genres.map(g => `<option value="${esc(g.value)}">`).join('')}</datalist>
      <div class="two">
        <label>BPM<span class="inline"><input name="bpm" type="text" inputmode="decimal" value="${t.bpm || ''}"><button type="button" class="btn" data-act="tap-tempo">Tap</button></span></label>
        <label>Durée (m:ss)<input name="duration" inputmode="numeric" placeholder="6:15" value="${esc(formatDuration(t.duration))}"></label>
      </div>
      <label>Clé — Camelot (8A), notes (Am, F#m, Sib) ou Open Key (1m)
        <input name="key" value="${esc(t.key)}" data-input="form-key" autocapitalize="off" autocorrect="off" list="keys"></label>
      <datalist id="keys">${ALL_KEYS.map(k => `<option value="${k}">${keyLabel(k)}</option>`).join('')}</datalist>
      <p class="hint" id="key-fb">${t.key ? '✓ ' + keyLabel(t.key) : 'Clé non renseignée'}</p>
      <div class="field">Énergie<input type="hidden" name="energy" value="${t.energy || 0}">
        <div class="chips energy-pick">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(e => `<button type="button" class="chip ${t.energy === e ? 'on' : ''}" data-act="form-energy" data-v="${e}">${e}</button>`).join('')}</div></div>
      <label>Tags (séparés par des virgules)<input name="tags" value="${esc(t.tags.join(', '))}" autocapitalize="off"></label>
      <label>Notes<textarea name="notes" rows="4">${esc(t.notes)}</textarea></label>
      <div class="field">Cue points
        <div id="cue-list">${t.cues.map(cueRow).join('')}</div>
        <button type="button" class="btn" data-act="cue-add">＋ Ajouter un cue</button></div>
      ${isNew ? '' : '<button type="button" class="btn danger block" data-act="track-delete">Supprimer ce morceau</button>'}
    </form>`;
}

app.views.detail = {
  render() {
    const { editing, trackId } = app.ui;
    if (editing) {
      const t = editing.id ? app.track(editing.id) : normalizeTrack({ title: '' });
      return t ? formHtml(t, !editing.id) : '';
    }
    const t = trackId && app.track(trackId);
    return t ? detailHtml(t) : '';
  },
};

app.on('track-open', ({ id }) => {
  if (!app.track(id)) return;
  const same = app.ui.trackId === id;
  app.ui.trackId = id; app.ui.editing = null;
  document.getElementById('app').classList.add('has-detail');
  document.querySelectorAll('#main .trow.sel').forEach(el => el.classList.remove('sel'));
  document.querySelectorAll('#track-list .trow').forEach(el => { if (el.dataset.id === id) el.classList.add('sel'); });
  app.renderDetail();
  if (!same) { const sc = $('#detail .dscroll'); if (sc) sc.scrollTop = 0; }
});
app.on('detail-close', () => { app.ui.trackId = null; app.ui.editing = null; app.render(); });
app.on('track-new', () => { app.ui.editing = { id: null }; app.render(); setTimeout(() => { const i = $('#track-form [name=title]'); if (i) i.focus(); }, 50); });
app.on('track-edit', () => { app.ui.editing = { id: app.ui.trackId }; app.renderDetail(); });
app.on('edit-cancel', () => { app.ui.editing = null; app.render(); });
app.on('why', (_, el) => { const w = el.closest('.crow, .set-row').querySelector('.why'); if (w) w.hidden = !w.hidden; });

app.onInput('form-key', (v) => {
  const k = parseKey(v), fb = $('#key-fb');
  fb.textContent = !v.trim() ? 'Clé non renseignée' : k ? '✓ ' + keyLabel(k) : '✗ Clé non reconnue (exemples : 8A, Am, F#m, Sib, 1m)';
  fb.classList.toggle('err', !!v.trim() && !k);
});
app.on('form-energy', ({ v }, el) => {
  const input = $('#track-form [name=energy]');
  const val = input.value === v ? '0' : v;
  input.value = val;
  el.parentElement.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.v === val));
});
app.on('cue-add', () => {
  const div = document.createElement('div');
  div.className = 'cue-edit';
  div.innerHTML = '<input name="cue-time" placeholder="1:32" inputmode="numeric" aria-label="Temps"><input name="cue-label" placeholder="Description" aria-label="Description"><button type="button" class="btn sq" data-act="cue-del" aria-label="Supprimer le cue">×</button>';
  $('#cue-list').appendChild(div);
  div.querySelector('input').focus();
});
app.on('cue-del', (_, el) => el.closest('.cue-edit').remove());

let taps = [];
app.on('tap-tempo', () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2500) taps = [];
  taps.push(now);
  if (taps.length > 12) taps.shift();
  if (taps.length >= 3) {
    const bpm = 60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1));
    $('#track-form [name=bpm]').value = String(Math.round(bpm * 2) / 2);
  } else toast('Continue à taper en rythme…');
});

app.on('edit-save', () => {
  const form = $('#track-form');
  const val = (n) => form.querySelector(`[name=${n}]`).value;
  if (!val('title').trim()) { toast('Le titre est obligatoire.'); form.querySelector('[name=title]').focus(); return; }
  if (val('key').trim() && !parseKey(val('key'))) { toast('Clé non reconnue : corrige-la ou vide le champ.'); return; }
  const times = [...form.querySelectorAll('[name=cue-time]')], labels = [...form.querySelectorAll('[name=cue-label]')];
  const old = app.ui.editing.id ? app.track(app.ui.editing.id) : null;
  const t = normalizeTrack({
    ...(old || {}),
    title: val('title'), artist: val('artist'), genre: val('genre'), bpm: val('bpm'), key: val('key'),
    energy: val('energy'), duration: val('duration'), tags: val('tags'), notes: val('notes'),
    cues: times.map((el, i) => ({ time: el.value, label: labels[i].value })),
    updatedAt: new Date().toISOString(),
  });
  if (old) app.state.tracks = app.state.tracks.map(x => (x.id === old.id ? t : x));
  else app.state.tracks = [...app.state.tracks, t];
  app.ui.editing = null; app.ui.trackId = t.id;
  app.commit();
  toast(old ? 'Morceau mis à jour.' : 'Morceau ajouté.');
});

app.on('track-delete', async () => {
  const t = app.track(app.ui.editing.id);
  const n = setsForTrack(t.id, app.state.sets).length;
  if (!await confirmDialog(`Supprimer « ${t.title} » ?${n ? ` Il sera aussi retiré de ${n} set(s).` : ''}`, 'Supprimer', true)) return;
  const backup = { tracks: app.state.tracks, sets: app.state.sets };
  app.state.tracks = app.state.tracks.filter(x => x.id !== t.id);
  app.state.sets = app.state.sets.map(s => ({ ...s, trackIds: s.trackIds.filter(id => id !== t.id) }));
  app.ui.editing = null; app.ui.trackId = null;
  app.commit();
  toast('Morceau supprimé.', { label: 'Annuler', run: () => { app.state.tracks = backup.tracks; app.state.sets = backup.sets; app.commit(); } });
});

app.on('track-sketch', () => {
  const t = app.track(app.ui.trackId);
  openSketch(t.title, t.sketch, (strokes) => {
    app.state.tracks = app.state.tracks.map(x => (x.id === t.id ? { ...x, sketch: strokes } : x));
    app.commit();
  });
});

app.on('track-add-to-set', async () => {
  const t = app.track(app.ui.trackId);
  const options = app.state.sets.filter(s => !s.trackIds.includes(t.id))
    .map(s => ({ label: s.name, sub: `${frDate(s.date)} · ${s.trackIds.length} morceau(x)`, value: s.id }));
  const choice = await chooser('Ajouter à quel set ?', [{ label: '＋ Nouveau set', value: 'new' }, ...options]);
  if (!choice) return;
  if (choice === 'new') {
    const s = normalizeSet({ name: 'Nouveau set', date: today(), trackIds: [t.id] });
    app.state.sets = [...app.state.sets, s];
    app.ui.setId = s.id; app.ui.view = 'sets'; app.ui.builder = null;
  } else {
    app.state.sets = app.state.sets.map(s => (s.id === choice ? { ...s, trackIds: [...s.trackIds, t.id] } : s));
  }
  app.commit();
  toast('Ajouté au set.');
});

app.on('wheel-from-track', () => {
  const t = app.track(app.ui.trackId);
  if (!t.key) { toast('Ce morceau n\'a pas de clé.'); return; }
  app.ui.wheelKey = t.key; app.ui.wheelBpm = t.bpm || 0; app.ui.view = 'wheel';
  if (window.matchMedia('(max-width: 999px)').matches) app.ui.trackId = null;
  app.render();
});
