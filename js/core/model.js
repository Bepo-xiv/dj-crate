// Modèle de données : normalisation, sauvegarde / restauration, filtres et tri.
import { parseKey } from './camelot.js';
import { DEFAULT_SETTINGS } from './compat.js';

export const SCHEMA_VERSION = 1;
export const APP_ID = 'dj-crate';

export function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/** "5:32" / "1:02:03" / "332" (secondes) -> secondes, ou 0. */
export function parseDuration(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : 0;
  const s = String(v).trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(':').map(p => Number(p));
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !Number.isFinite(p) || p < 0)) return 0;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

export function formatDuration(sec) {
  if (!(sec > 0)) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const str = (v) => (v == null ? '' : String(v).trim());

export function normalizeTrack(raw = {}) {
  const now = new Date().toISOString();
  const bpm = Number(String(raw.bpm ?? '').replace(',', '.'));
  const energy = Math.round(Number(raw.energy));
  return {
    id: str(raw.id) || newId(),
    title: str(raw.title) || 'Sans titre',
    artist: str(raw.artist),
    genre: str(raw.genre),
    bpm: bpm > 0 && bpm < 1000 ? Math.round(bpm * 100) / 100 : 0,
    key: parseKey(raw.key) || '',
    energy: energy >= 1 && energy <= 10 ? energy : 0,
    duration: parseDuration(raw.duration),
    notes: raw.notes == null ? '' : String(raw.notes),
    cues: (Array.isArray(raw.cues) ? raw.cues : [])
      .map(c => ({ time: str(c && c.time), label: str(c && c.label) }))
      .filter(c => c.time || c.label),
    sketch: Array.isArray(raw.sketch) ? raw.sketch : [],
    createdAt: str(raw.createdAt) || now,
    updatedAt: str(raw.updatedAt) || now,
  };
}

export function normalizeSet(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: str(raw.id) || newId(),
    name: str(raw.name) || 'Set sans nom',
    date: str(raw.date) || now.slice(0, 10),
    venue: str(raw.venue),
    notes: raw.notes == null ? '' : String(raw.notes),
    status: ['draft', 'live', 'played'].includes(raw.status) ? raw.status : 'draft',
    targetSec: Number(raw.targetSec) > 0 ? Number(raw.targetSec) : 0,
    curve: Array.isArray(raw.curve) ? raw.curve.map(Number).filter(Number.isFinite) : [],
    trackIds: (Array.isArray(raw.trackIds) ? raw.trackIds : []).map(String),
    sketch: Array.isArray(raw.sketch) ? raw.sketch : [],
    createdAt: str(raw.createdAt) || now,
  };
}

export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (raw[k] == null) continue;
    if (typeof DEFAULT_SETTINGS[k] === 'number') { const n = Number(raw[k]); if (Number.isFinite(n) && n >= 0) s[k] = n; }
    else if (typeof DEFAULT_SETTINGS[k] === 'boolean') s[k] = !!raw[k];
    else s[k] = String(raw[k]);
  }
  return s;
}

export function emptyState() {
  return { tracks: [], sets: [], settings: { ...DEFAULT_SETTINGS } };
}

export function normalizeState(raw = {}) {
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : []).map(normalizeTrack);
  const ids = new Set(tracks.map(t => t.id));
  const sets = (Array.isArray(raw.sets) ? raw.sets : []).map(normalizeSet);
  for (const s of sets) s.trackIds = s.trackIds.filter(id => ids.has(id));
  return { tracks, sets, settings: normalizeSettings(raw.settings || {}) };
}

/** Contenu du fichier de sauvegarde (texte JSON). */
export function makeBackup(state, now = new Date()) {
  return JSON.stringify({
    app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(),
    tracks: state.tracks, sets: state.sets, settings: state.settings,
  }, null, 1);
}

/** Lit un fichier de sauvegarde. Lève une erreur lisible si le fichier n'est pas valide. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Ce fichier n\'est pas un fichier JSON valide.'); }
  if (!data || data.app !== APP_ID || !Array.isArray(data.tracks)) {
    throw new Error('Ce fichier n\'est pas une sauvegarde DJ Crate.');
  }
  if (Number(data.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('Cette sauvegarde vient d\'une version plus récente de l\'app. Mets l\'app à jour puis réessaie.');
  }
  return normalizeState(data);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const normalizeText = norm;
export const trackSignature = (t) => norm(t.title) + '|' + norm(t.artist);

const FILLABLE = ['energy', 'bpm', 'key', 'duration'];

/** Ajoute des morceaux en ignorant les doublons (même titre + artiste).
 *  Un doublon complète seulement les champs vides du morceau existant (énergie, BPM, clé, durée) — rien n'est écrasé. */
export function mergeTracks(existing, incoming) {
  const seen = new Map(existing.map((t, i) => [trackSignature(t), i]));
  const ids = new Set(existing.map(t => t.id));
  const tracks = [...existing];
  const idMap = new Map(); // id entrant -> id final (utile pour fusionner des sets)
  let added = 0, skipped = 0, filled = 0;
  for (const raw of incoming) {
    const t = normalizeTrack(raw);
    const sig = trackSignature(t);
    if (seen.has(sig)) {
      const i = seen.get(sig), cur = tracks[i];
      idMap.set(t.id, cur.id); skipped++;
      const patch = {};
      for (const f of FILLABLE) if (!cur[f] && t[f]) patch[f] = t[f];
      if (Object.keys(patch).length) { tracks[i] = { ...cur, ...patch }; filled++; }
      continue;
    }
    const oldId = t.id;
    if (ids.has(t.id)) t.id = newId();
    idMap.set(oldId, t.id);
    seen.set(sig, tracks.length); ids.add(t.id);
    tracks.push(t); added++;
  }
  return { tracks, added, skipped, filled, idMap };
}

/** Fusionne une sauvegarde dans l'état courant (sans rien écraser). */
export function mergeState(state, incoming) {
  const { tracks, added, skipped, idMap } = mergeTracks(state.tracks, incoming.tracks);
  const setIds = new Set(state.sets.map(s => s.id));
  const sets = [...state.sets];
  let setsAdded = 0;
  for (const s of incoming.sets) {
    if (setIds.has(s.id)) continue;
    sets.push({ ...s, trackIds: s.trackIds.map(id => idMap.get(id)).filter(Boolean) });
    setsAdded++;
  }
  return { state: { ...state, tracks, sets }, added, skipped, setsAdded };
}

/** Sets (joués ou en cours) contenant un morceau. */
export function setsForTrack(trackId, sets) {
  return sets.filter(s => s.trackIds.includes(trackId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// ---------- Recherche, filtres, tri ----------

export function emptyFilters() {
  return { q: '', bpmMin: 0, bpmMax: 0, keys: [], genres: [], energies: [] };
}

export function activeFilterCount(f) {
  return (f.bpmMin || f.bpmMax ? 1 : 0) + (f.keys.length ? 1 : 0) + (f.genres.length ? 1 : 0)
    + (f.energies.length ? 1 : 0);
}

export function filterTracks(tracks, f) {
  const tokens = norm(f.q).split(/\s+/).filter(Boolean);
  const genres = new Set((f.genres || []).map(norm));
  const keys = new Set(f.keys || []);
  const energies = new Set(f.energies || []);
  return tracks.filter(t => {
    if (f.bpmMin && !(t.bpm >= f.bpmMin)) return false;
    if (f.bpmMax && !(t.bpm > 0 && t.bpm <= f.bpmMax)) return false;
    if (keys.size && !keys.has(t.key)) return false;
    if (genres.size && !genres.has(norm(t.genre))) return false;
    if (energies.size && !energies.has(t.energy)) return false;
    if (tokens.length) {
      const hay = norm([t.title, t.artist, t.genre, t.key, t.notes].join(' '));
      if (!tokens.every(tok => hay.includes(tok))) return false;
    }
    return true;
  });
}

const keyOrder = (k) => { const m = /^(\d+)([AB])$/.exec(k || ''); return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 999; };

export function sortTracks(tracks, field = 'title', dir = 1) {
  const val = (t) => field === 'key' ? keyOrder(t.key) : t[field];
  return [...tracks].sort((a, b) => {
    const x = val(a), y = val(b);
    let c;
    if (typeof x === 'number' && typeof y === 'number') {
      if (!x && y) return 1; // valeurs inconnues toujours à la fin
      if (x && !y) return -1;
      c = x - y;
    } else c = String(x || '').localeCompare(String(y || ''), 'fr', { sensitivity: 'base' });
    return (c || String(a.title).localeCompare(String(b.title), 'fr', { sensitivity: 'base' })) * dir;
  });
}

/** Valeurs distinctes (ex. genres) triées par fréquence. */
export function facet(tracks, field) {
  const count = new Map();
  for (const t of tracks) {
    const vals = [t[field]];
    for (const v of vals) if (v) count.set(v, (count.get(v) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) => ({ value, n }));
}
