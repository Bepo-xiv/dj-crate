// Écran Roue Camelot interactive.
import { app } from './state.js';
import { ALL_KEYS, splitKey, keyName, keyLabel, keyRelation } from '../core/camelot.js';
import { bpmMatch } from '../core/compat.js';
import { sortTracks } from '../core/model.js';
import { esc, frNum, keyHue, trackRow } from './util.js';

const C = 200;
function seg(r0, r1, a0, a1) {
  const p = (r, a) => { const rad = (a - 90) * Math.PI / 180; return (C + r * Math.cos(rad)).toFixed(1) + ' ' + (C + r * Math.sin(rad)).toFixed(1); };
  return `M${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}
function mid(r, a) { const rad = (a - 90) * Math.PI / 180; return [C + r * Math.cos(rad), C + r * Math.sin(rad)]; }

function wheelSvg(counts, sel, s) {
  let out = '';
  for (const code of ALL_KEYS) {
    const { n, letter } = splitKey(code);
    const a = (n % 12) * 30;
    const [r0, r1] = letter === 'B' ? [128, 196] : [62, 126];
    const rel = sel ? keyRelation(sel, code, s) : null;
    const cls = !sel ? '' : code === sel ? 'sel' : rel ? 'rel' : 'off';
    const [x, y] = mid((r0 + r1) / 2, a);
    out += `<g class="wseg ${cls}" data-act="wheel-key" data-key="${code}" role="button" aria-label="${keyLabel(code)}, ${counts[code] || 0} morceaux">
      <path d="${seg(r0, r1, a - 14.2, a + 14.2)}" fill="hsl(${keyHue(code)} 85% ${letter === 'B' ? 68 : 52}%)"/>
      <text x="${x.toFixed(1)}" y="${(y - 5).toFixed(1)}" class="wcode">${code}</text>
      <text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" class="wname">${keyName(code)}</text>
      <text x="${x.toFixed(1)}" y="${(y + 22).toFixed(1)}" class="wcount">${counts[code] || 0}</text></g>`;
  }
  const center = sel
    ? `<text x="${C}" y="${C - 4}" class="wc1">${sel}</text><text x="${C}" y="${C + 20}" class="wc2">${keyName(sel)}</text>`
    : `<text x="${C}" y="${C + 5}" class="wc2">Touche une clé</text>`;
  return `<svg class="wheel" viewBox="0 0 400 400" aria-label="Roue Camelot">${out}${center}</svg>`;
}

app.views.wheel = {
  render() {
    const s = app.state.settings, sel = app.ui.wheelKey, ref = app.ui.wheelBpm;
    const counts = {};
    for (const t of app.state.tracks) if (t.key) counts[t.key] = (counts[t.key] || 0) + 1;
    let groups = '';
    if (sel) {
      const byType = new Map();
      for (const t of app.state.tracks) {
        const rel = keyRelation(sel, t.key, s);
        if (!rel) continue;
        if (ref && !bpmMatch(ref, t.bpm, s).ok) continue;
        if (!byType.has(rel.type)) byType.set(rel.type, { rel, code: t.key, tracks: [] });
        byType.get(rel.type).tracks.push(t);
      }
      const sorted = [...byType.values()].sort((a, b) => b.rel.score - a.rel.score);
      groups = sorted.length ? sorted.map(g => `<h2>${esc(g.rel.label)} — ${keyLabel(g.code)} <span class="pill">${g.tracks.length}</span></h2>
        <p class="dim">${esc(g.rel.why)}</p>
        <div class="list flat">${sortTracks(g.tracks, 'bpm').map(t => trackRow(t, { selected: t.id === app.ui.trackId })).join('')}</div>`).join('')
        : '<p class="empty">Aucun morceau compatible avec cette clé' + (ref ? ' à ce BPM' : '') + '.</p>';
    } else {
      groups = '<p class="empty">Touche une clé sur la roue : tes morceaux compatibles s\'affichent ici, classés par type de transition. Le nombre dans chaque case est le nombre de morceaux que tu possèdes dans cette clé.</p>';
    }
    return `<header class="bar"><h1 class="grow">Roue Camelot</h1>
        <label class="inline">BPM de référence <input class="num" type="number" inputmode="decimal" placeholder="tous" value="${ref || ''}" data-change="wheel-bpm"></label>
        ${sel ? '<button class="btn" data-act="wheel-clear">Effacer</button>' : ''}</header>
      <div class="wheel-wrap">
        <div class="wheel-box">${wheelSvg(counts, sel, s)}
          ${ref ? `<p class="dim center">Filtré à ${frNum(ref)} BPM ±${frNum(s.bpmTolerance)} %${s.halfDouble ? ' (demi/double inclus)' : ''}</p>` : ''}</div>
        <div class="wheel-list" data-scroll="wheel">${groups}</div>
      </div>`;
  },
};

app.on('wheel-key', ({ key }) => { app.ui.wheelKey = app.ui.wheelKey === key ? null : key; app.renderMain(); });
app.on('wheel-clear', () => { app.ui.wheelKey = null; app.ui.wheelBpm = 0; app.renderMain(); });
app.onChange('wheel-bpm', (v) => { app.ui.wheelBpm = Number(v) || 0; app.renderMain(); });
