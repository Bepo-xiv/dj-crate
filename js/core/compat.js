// Score de transition entre deux morceaux : clé + BPM + énergie, avec explications.
import { keyRelation } from './camelot.js';

export const DEFAULT_SETTINGS = {
  bpmTolerance: 6,     // ± %
  halfDouble: true,    // accepter demi / double tempo
  maxEnergyGap: 2,     // écart d'énergie maximal
  boosts: true,        // boosts +2 / +7
  diagonal: false,     // diagonale Camelot
  wKey: 50, wBpm: 30, wEnergy: 20, // poids du score global
  avgPlaySec: 240,     // durée jouée par défaut si durée inconnue
  overlapSec: 30,      // recouvrement moyen entre deux morceaux
  hand: 'right',       // côté de la barre de navigation
};

const fr = (n, d = 1) => Number(n).toFixed(d).replace('.', ',').replace(/,0+$/, '');
const sign = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + fr(Math.abs(n), d);

export function bpmMatch(fromBpm, toBpm, s = DEFAULT_SETTINGS) {
  if (!(fromBpm > 0) || !(toBpm > 0)) {
    return { ok: true, unknown: true, mode: 'direct', diffPct: 0, score: 50, why: 'BPM inconnu : à vérifier à l\'oreille.' };
  }
  const options = [{ mode: 'direct', eff: toBpm }];
  if (s.halfDouble) {
    options.push({ mode: 'double', eff: toBpm * 2 }, { mode: 'half', eff: toBpm / 2 });
  }
  let best = null;
  for (const o of options) {
    const diffPct = (o.eff - fromBpm) / fromBpm * 100;
    if (!best || Math.abs(diffPct) < Math.abs(best.diffPct)) best = { ...o, diffPct };
  }
  const tol = Math.max(0, Number(s.bpmTolerance) || 0);
  const abs = Math.abs(best.diffPct);
  const ok = abs <= tol + 1e-9;
  let score = 0;
  if (ok) {
    score = tol === 0 ? 100 : 100 - 40 * (abs / tol);
    if (best.mode !== 'direct') score *= 0.9;
  }
  const modeTxt = best.mode === 'double' ? ' en double tempo' : best.mode === 'half' ? ' en demi-tempo' : '';
  let why;
  if (abs < 0.05) why = `BPM identique${modeTxt} (${fr(fromBpm)} → ${fr(toBpm)}).`;
  else if (ok) why = `BPM ${fr(fromBpm)} → ${fr(toBpm)}${modeTxt} : écart de ${sign(best.diffPct)} %, dans la tolérance de ±${fr(tol)} %.`;
  else why = `BPM ${fr(fromBpm)} → ${fr(toBpm)} : écart de ${sign(best.diffPct)} %, hors tolérance (±${fr(tol)} %).`;
  return { ok, unknown: false, mode: best.mode, diffPct: best.diffPct, score: Math.round(score), why };
}

export function energyMatch(fromE, toE, s = DEFAULT_SETTINGS) {
  if (!(fromE >= 1) || !(toE >= 1)) {
    return { ok: true, unknown: true, gap: 0, score: 50, why: 'Énergie inconnue.' };
  }
  const gap = toE - fromE;
  const max = Math.max(0, Number(s.maxEnergyGap) || 0);
  const ok = Math.abs(gap) <= max;
  const score = Math.max(0, Math.min(100, 100 - 20 * Math.abs(gap) + (gap > 0 ? 10 : 0)));
  let why;
  if (gap === 0) why = `Énergie identique (${fromE}).`;
  else if (ok) why = `Énergie ${fromE} → ${toE} (${sign(gap, 0)}) : ${gap > 0 ? 'ça monte' : 'ça redescend'}, dans l'écart autorisé (±${max}).`;
  else why = `Énergie ${fromE} → ${toE} (${sign(gap, 0)}) : saut trop grand (max ±${max}).`;
  return { ok, unknown: false, gap, score, why };
}

/**
 * Évalue la transition a → b.
 * { score 0-100, compatible, key, bpm, energy, reasons[] }
 */
export function scoreTransition(a, b, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const rel = keyRelation(a.key, b.key, s);
  let key;
  if (!a.key || !b.key) key = { ok: false, type: 'unknown', label: 'Clé ?', score: 0, why: 'Clé inconnue : compatibilité harmonique impossible à calculer.' };
  else if (rel) key = { ok: true, ...rel };
  else key = { ok: false, type: 'clash', label: 'Clash', score: 0, why: `${a.key} → ${b.key} : clés non compatibles sur la roue Camelot (risque de dissonance).` };
  const bpm = bpmMatch(a.bpm, b.bpm, s);
  const energy = energyMatch(a.energy, b.energy, s);
  const wSum = (s.wKey + s.wBpm + s.wEnergy) || 1;
  const score = Math.round((key.score * s.wKey + bpm.score * s.wBpm + energy.score * s.wEnergy) / wSum);
  return {
    score,
    compatible: key.ok && bpm.ok && energy.ok,
    harmonic: key.ok && bpm.ok,
    key, bpm, energy,
    reasons: [key.why, bpm.why, energy.why],
  };
}

/** Morceaux compatibles avec `track`, du meilleur au moins bon. */
export function findCompatible(track, tracks, settings = DEFAULT_SETTINGS) {
  const out = [];
  for (const t of tracks) {
    if (t.id === track.id) continue;
    const result = scoreTransition(track, t, settings);
    if (result.compatible) out.push({ track: t, result });
  }
  return out.sort((x, y) => y.result.score - x.result.score || String(x.track.title).localeCompare(String(y.track.title)));
}

export function scoreClass(score) {
  return score >= 80 ? 'good' : score >= 60 ? 'ok' : 'bad';
}
