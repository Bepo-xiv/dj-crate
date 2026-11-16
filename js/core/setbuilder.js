// Constructeur de set : courbes d'énergie, génération d'un enchaînement, analyse d'un set.
import { scoreTransition, DEFAULT_SETTINGS } from './compat.js';

export const CURVE_POINTS = 11;

const gen = (f) => Array.from({ length: CURVE_POINTS }, (_, i) => {
  const v = f(i / (CURVE_POINTS - 1));
  return Math.round(Math.max(1, Math.min(10, v)) * 10) / 10;
});

/** Courbes prédéfinies : 11 valeurs d'énergie (1-10) réparties sur la durée du set. */
export const CURVES = {
  montee:   { label: 'Montée progressive', points: gen(t => 4 + 5 * t) },
  warmup:   { label: 'Warm-up',            points: gen(t => 3 + 3 * t) },
  pic:      { label: 'Pic puis retombée',  points: gen(t => t < 0.7 ? 4 + 5 * (t / 0.7) : 9 - 3 * ((t - 0.7) / 0.3)) },
  vague:    { label: 'Vagues',             points: gen(t => 6.5 + 2 * Math.sin(t * Math.PI * 3 - Math.PI / 2)) },
  plateau:  { label: 'Plateau peak time',  points: gen(t => t < 0.15 ? 6 + 2 * (t / 0.15) : 8) },
  descente: { label: 'Descente / closing', points: gen(t => 8 - 5 * t) },
};

/** Énergie cible à l'instant t (0-1) par interpolation linéaire. */
export function curveValue(points, t) {
  if (!points || !points.length) return 5;
  if (points.length === 1) return points[0];
  const x = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(x));
  return points[i] + (points[i + 1] - points[i]) * (x - i);
}

/** Durée réellement occupée par un morceau dans le set (durée − recouvrement). */
export function playSeconds(track, s = DEFAULT_SETTINGS) {
  const d = track.duration > 0 ? track.duration : s.avgPlaySec;
  return Math.max(60, d - s.overlapSec);
}

function energyFit(track, target) {
  if (!(track.energy >= 1)) return 50;
  return Math.max(0, 100 - 20 * Math.abs(track.energy - target));
}

/**
 * Propose un enchaînement (recherche en faisceau).
 * opts : { start, tracks, targetSec, curve (tableau de points), settings, beam }
 * Renvoie { ids, totalSec, forced } — forced = nb de transitions non harmoniques acceptées faute de mieux.
 */
export function buildSet(opts) {
  const s = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const curve = opts.curve || CURVES.montee.points;
  const target = Math.max(60, opts.targetSec || 3600);
  const pool = opts.tracks.filter(t => t.id !== opts.start.id);
  const BEAM = opts.beam || 6, BRANCH = 4;
  const done = (st) => st.elapsed >= target - 90;

  let states = [{ list: [opts.start], used: new Set([opts.start.id]), elapsed: playSeconds(opts.start, s), score: 0, forced: 0 }];
  for (let guard = 0; guard < 500; guard++) {
    if (states.every(done)) break;
    const next = [];
    for (const st of states) {
      if (done(st)) { next.push(st); continue; }
      const last = st.list[st.list.length - 1];
      const targetE = curveValue(curve, st.elapsed / target);
      const cands = [];
      for (const c of pool) {
        if (st.used.has(c.id)) continue;
        const tr = scoreTransition(last, c, s);
        const fit = energyFit(c, targetE);
        let step = tr.harmonic
          ? 0.3 * tr.key.score + 0.2 * tr.bpm.score + 0.5 * fit
          : 0.5 * fit - 60;
        if (c.artist && last.artist && c.artist.toLowerCase() === last.artist.toLowerCase()) step -= 8;
        cands.push({ c, step, harmonic: tr.harmonic });
      }
      if (!cands.length) { next.push({ ...st, elapsed: Infinity }); continue; } // bibliothèque épuisée
      cands.sort((x, y) => y.step - x.step || String(x.c.id).localeCompare(String(y.c.id)));
      for (const k of cands.slice(0, BRANCH)) {
        const used = new Set(st.used); used.add(k.c.id);
        next.push({
          list: [...st.list, k.c], used,
          elapsed: st.elapsed + playSeconds(k.c, s),
          score: st.score + k.step,
          forced: st.forced + (k.harmonic ? 0 : 1),
        });
      }
    }
    const avg = (st) => st.list.length > 1 ? st.score / (st.list.length - 1) : 0;
    next.sort((x, y) => avg(y) - avg(x));
    states = next.slice(0, BEAM);
  }
  const best = states[0];
  return {
    ids: best.list.map(t => t.id),
    totalSec: best.list.reduce((sum, t) => sum + playSeconds(t, s), 0),
    forced: best.forced,
  };
}

/**
 * Analyse un set existant : transitions, durée, énergie.
 * `list` = morceaux dans l'ordre (les morceaux supprimés de la bibliothèque sont ignorés en amont).
 */
export function analyzeSet(list, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const transitions = [];
  for (let i = 1; i < list.length; i++) transitions.push(scoreTransition(list[i - 1], list[i], s));
  const totalSec = list.reduce((sum, t) => sum + playSeconds(t, s), 0);
  const avgScore = transitions.length
    ? Math.round(transitions.reduce((a, t) => a + t.score, 0) / transitions.length) : null;
  let elapsed = 0;
  const energy = list.map(t => {
    const p = { at: elapsed, energy: t.energy || null };
    elapsed += playSeconds(t, s);
    return p;
  });
  return { transitions, totalSec, avgScore, energy, weak: transitions.filter(t => !t.compatible).length };
}
