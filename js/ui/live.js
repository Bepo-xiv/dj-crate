// Mode Live : le morceau en cours en grand, les meilleures suites à une touche, historique automatique.
import { app } from './state.js';
import { scoreTransition, findCompatible } from '../core/compat.js';
import { normalizeSet, sortTracks, formatDuration } from '../core/model.js';
import { keyLabel } from '../core/camelot.js';
import { esc, frNum, frDate, today, keyBadge, trackRow, transitionSummary, scoreBadge, whyBlock, chip, toast, openPicker, confirmDialog } from './util.js';

const updateSet = (id, patch) => { app.state.sets = app.state.sets.map(s => (s.id === id ? { ...s, ...patch } : s)); };

function play(track) {
  let set = app.liveSet();
  if (!set) {
    set = normalizeSet({ name: 'Live du ' + frDate(today()), date: today(), status: 'live', trackIds: [] });
    app.state.sets = [...app.state.sets, set];
  }
  const before = set.trackIds;
  updateSet(set.id, { trackIds: [...before, track.id] });
  app.ui.view = 'live';
  if (window.matchMedia('(max-width: 999px)').matches) { app.ui.trackId = null; app.ui.editing = null; }
  app.commit();
  const sc = document.querySelector('[data-scroll=live]'); if (sc) sc.scrollTop = 0;
  toast(`En cours : ${track.title}`, { label: 'Annuler', run: () => { updateSet(set.id, { trackIds: before }); app.commit(); } });
}

app.views.live = {
  render() {
    const set = app.liveSet(), s = app.state.settings;
    if (!set || !app.setTracks(set).length) {
      return `<header class="bar"><h1 class="grow">Live</h1></header>
        <div class="empty"><p>Le mode Live t'accompagne pendant un set : tu indiques le morceau qui joue, l'app affiche en grand les meilleures suites et enregistre automatiquement l'historique.</p>
        <p><button class="btn primary big" data-act="live-other">▶ Choisir le premier morceau</button></p></div>`;
    }
    const list = app.setTracks(set), cur = list[list.length - 1], played = new Set(set.trackIds);
    const dir = app.ui.liveDir;
    let next = findCompatible(cur, app.state.tracks, s).filter(c => !played.has(c.track.id));
    if (dir != null && cur.energy) next = next.filter(c => c.track.energy && Math.sign(c.track.energy - cur.energy) === dir);
    return `<header class="bar"><h1 class="grow">Live <small class="dim">· ${list.length} joué${list.length > 1 ? 's' : ''}</small></h1>
        <button class="btn" data-act="live-undo">↶ Retirer le dernier</button>
        <button class="btn danger" data-act="live-end">Terminer</button></header>
      <div class="dscroll" data-scroll="live">
        <button class="now" data-act="track-open" data-id="${esc(cur.id)}">
          <small>EN COURS</small><b>${esc(cur.title)}</b><span>${esc(cur.artist)}</span>
          <span class="now-facts">${keyBadge(cur.key)}<i>${cur.bpm ? frNum(cur.bpm) + ' BPM' : 'BPM ?'}</i><i>${cur.energy ? 'Énergie ' + cur.energy : 'Énergie ?'}</i><i>${formatDuration(cur.duration)}</i></span>
          ${cur.cues.length ? `<span class="now-cues">${cur.cues.map(c => `<i><b>${esc(c.time)}</b> ${esc(c.label)}</i>`).join('')}</span>` : ''}
        </button>
        <div class="live-bar"><span class="chips">
          ${chip('Tous', dir == null, 'live-dir', { d: '' })}${chip('Énergie ↑', dir === 1, 'live-dir', { d: 1 })}${chip('Énergie =', dir === 0, 'live-dir', { d: 0 })}${chip('Énergie ↓', dir === -1, 'live-dir', { d: -1 })}</span>
          <button class="btn" data-act="live-other">Autre morceau…</button></div>
        <h2>Ensuite <span class="pill">${next.length}</span> <small class="dim">— touche un morceau quand tu le lances</small></h2>
        <div class="list flat big">${next.length ? next.slice(0, 60).map(c => `<div class="crow">
            ${trackRow(c.track, { act: 'live-pick', sub: transitionSummary(c.result) })}${scoreBadge(c.result)}${whyBlock(c.result)}</div>`).join('')
          : `<p class="empty">Aucune suite compatible${dir != null ? ' dans cette direction d\'énergie' : ''} depuis ${cur.key ? keyLabel(cur.key) : 'ce morceau'}. Essaie « Autre morceau… » ou élargis les tolérances dans Réglages.</p>`}</div>
      </div>`;
  },
};

app.on('live-play', ({ id }) => { const t = app.track(id); if (t) play(t); });
app.on('live-pick', ({ id }) => { const t = app.track(id); if (t) play(t); });
app.on('live-dir', ({ d }) => { app.ui.liveDir = d === '' ? null : Number(d); app.renderMain(); });
app.on('live-other', () => {
  const set = app.liveSet(), list = set ? app.setTracks(set) : [], cur = list[list.length - 1];
  if (!app.state.tracks.length) { toast('Ajoute d\'abord des morceaux à ta bibliothèque.'); return; }
  let items;
  if (cur) {
    const played = new Set(set.trackIds);
    items = app.state.tracks.filter(t => !played.has(t.id)).map(track => ({ track, result: scoreTransition(cur, track, app.state.settings) }))
      .sort((x, y) => (y.result.compatible - x.result.compatible) || (y.result.score - x.result.score));
  } else items = sortTracks(app.state.tracks, 'title').map(track => ({ track }));
  openPicker({ title: cur ? 'Tous les morceaux — meilleures transitions d\'abord' : 'Premier morceau', items, onPick: play });
});
app.on('live-undo', () => {
  const set = app.liveSet();
  if (!set || !set.trackIds.length) return;
  updateSet(set.id, { trackIds: set.trackIds.slice(0, -1) }); app.commit();
});
app.on('live-end', async () => {
  const set = app.liveSet();
  if (!await confirmDialog('Terminer ce live ? Il sera enregistré dans l\'historique des sets.', 'Terminer')) return;
  updateSet(set.id, { status: 'played' });
  app.ui.view = 'sets'; app.ui.setId = set.id; app.ui.builder = null;
  app.commit();
});

// Empêche l'iPad de se mettre en veille pendant le mode Live (quand le système le permet).
let wakeLock = null;
export async function syncWakeLock() {
  const want = app.ui.view === 'live' && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
