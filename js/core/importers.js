// Import / export : CSV, XML Rekordbox, export texte d'un set.
import { keyName } from './camelot.js';
import { formatDuration } from './model.js';

/** Analyse un CSV (séparateur , ; ou tabulation détecté automatiquement, guillemets gérés). */
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delim = count('\t') > count(';') && count('\t') > count(',') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADERS = {
  title: ['title', 'titre', 'name', 'nom', 'track', 'morceau', 'track title'],
  artist: ['artist', 'artiste', 'artists'],
  genre: ['genre', 'style'],
  bpm: ['bpm', 'tempo', 'average bpm'],
  key: ['key', 'clé', 'cle', 'tonalité', 'tonalite', 'tonality', 'camelot', 'tonart'],
  energy: ['energy', 'énergie', 'energie'],
  duration: ['duration', 'durée', 'duree', 'time', 'length', 'total time'],
  tags: ['tags', 'tag', 'étiquettes', 'etiquettes'],
  notes: ['notes', 'note', 'comment', 'comments', 'commentaire', 'commentaires'],
  cues: ['cues', 'cue', 'cue points'],
};

/** CSV -> morceaux bruts (à passer ensuite dans normalizeTrack / mergeTracks). */
export function tracksFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const i = head.findIndex(h => names.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.title == null) throw new Error('Colonne « Titre » (ou « Title ») introuvable dans le CSV.');
  return rows.slice(1).map(r => {
    const get = (f) => (col[f] != null ? (r[col[f]] || '').trim() : '');
    return {
      title: get('title'), artist: get('artist'), genre: get('genre'), bpm: get('bpm'), key: get('key'),
      energy: get('energy'), duration: get('duration'), tags: get('tags'), notes: get('notes'),
      cues: get('cues').split('|').map(c => c.trim()).filter(Boolean).map(c => {
        const m = /^([\d:.,]+)\s*(.*)$/.exec(c);
        return m ? { time: m[1], label: m[2] } : { time: '', label: c };
      }),
    };
  }).filter(t => t.title);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Export CSV (séparateur ; — s'ouvre directement dans Excel en français). */
export function tracksToCSV(tracks) {
  const lines = [['Titre', 'Artiste', 'Genre', 'BPM', 'Clé', 'Tonalité', 'Énergie', 'Durée', 'Tags', 'Notes', 'Cues'].join(';')];
  for (const t of tracks) {
    lines.push([
      t.title, t.artist, t.genre, t.bpm || '', t.key, keyName(t.key), t.energy || '', formatDuration(t.duration),
      t.tags.join(', '), t.notes, t.cues.map(c => `${c.time} ${c.label}`.trim()).join(' | '),
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function attrs(s) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = decodeXml(m[2]);
  return out;
}

/** Export XML de Rekordbox (Fichier > Exporter la collection au format xml) -> morceaux bruts. */
export function tracksFromRekordbox(xml) {
  xml = String(xml || '');
  if (!/<DJ_PLAYLISTS/i.test(xml)) throw new Error('Ce fichier n\'est pas un export XML Rekordbox.');
  const out = [];
  const re = /<TRACK\b([^>]*?)(?:\/>|>([\s\S]*?)<\/TRACK>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = attrs(m[1]);
    if (!a.Name) continue; // entrées de playlist : seulement une référence
    const cues = [];
    const cre = /<POSITION_MARK\b([^>]*?)\/?>/g;
    let c;
    while (m[2] && (c = cre.exec(m[2]))) {
      const ca = attrs(c[1]);
      const sec = Number(ca.Start);
      if (!Number.isFinite(sec)) continue;
      const num = Number(ca.Num);
      cues.push({ sec, time: formatDuration(sec) || '0:00', label: ca.Name || (num >= 0 ? 'Hot cue ' + String.fromCharCode(65 + num) : 'Cue') });
    }
    cues.sort((x, y) => x.sec - y.sec);
    out.push({
      title: a.Name, artist: a.Artist || '', genre: a.Genre || '', bpm: a.AverageBpm || '',
      key: a.Tonality || '', duration: Number(a.TotalTime) || 0, notes: a.Comments || '',
      cues: cues.map(({ time, label }) => ({ time, label })),
    });
  }
  return out;
}

/** Tracklist lisible d'un set (pour partager ou imprimer). */
export function setToText(set, list) {
  const lines = [`${set.name} — ${set.date}${set.venue ? ' — ' + set.venue : ''}`, ''];
  list.forEach((t, i) => {
    const meta = [t.key ? `${t.key}/${keyName(t.key)}` : '', t.bpm ? `${t.bpm} BPM` : '', t.energy ? `E${t.energy}` : ''].filter(Boolean).join(', ');
    lines.push(`${String(i + 1).padStart(2, '0')}. ${t.artist ? t.artist + ' – ' : ''}${t.title}${meta ? ' [' + meta + ']' : ''}`);
  });
  if (set.notes) lines.push('', set.notes);
  return lines.join('\n');
}
