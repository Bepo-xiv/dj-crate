// Roue Camelot : conversion des notations et relations harmoniques.
// Code canonique d'une clé dans toute l'app : "8A", "12B", etc.

const MINOR = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m'];
const MAJOR = ['B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E'];

export const ALL_KEYS = [];
for (let n = 1; n <= 12; n++) ALL_KEYS.push(n + 'A');
for (let n = 1; n <= 12; n++) ALL_KEYS.push(n + 'B');

export function splitKey(code) {
  const m = /^(\d{1,2})([AB])$/.exec(code || '');
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 12) return null;
  return { n, letter: m[2] };
}

/** Nom musical d'un code Camelot : "8A" -> "Am". */
export function keyName(code) {
  const k = splitKey(code);
  if (!k) return '';
  return k.letter === 'A' ? MINOR[k.n - 1] : MAJOR[k.n - 1];
}

/** Libellé complet : "8A · Am". */
export function keyLabel(code) {
  return splitKey(code) ? `${code} · ${keyName(code)}` : '';
}

/** Décale une clé de `steps` crans sur la roue (même lettre). */
export function shiftKey(code, steps) {
  const k = splitKey(code);
  if (!k) return null;
  const n = ((k.n - 1 + steps) % 12 + 12) % 12 + 1;
  return n + k.letter;
}

export function switchLetter(code) {
  const k = splitKey(code);
  if (!k) return null;
  return k.n + (k.letter === 'A' ? 'B' : 'A');
}

const BASE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const FRENCH = { do: 'c', 're': 'd', 'ré': 'd', mi: 'e', fa: 'f', sol: 'g', la: 'a', si: 'b' };

function pitchToCamelot(pc, minor) {
  const majorPc = minor ? (pc + 3) % 12 : pc; // relative majeure
  const n = ((majorPc * 7) % 12 + 7) % 12 + 1;
  return n + (minor ? 'A' : 'B');
}

/**
 * Comprend : Camelot ("8A"), Open Key ("1m", "1d"), notation anglaise ("Am", "F#m",
 * "Bb", "C maj", "A minor") et française ("La m", "Sib", "Do# mineur").
 * Renvoie le code Camelot ou null.
 */
export function parseKey(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!s) return null;

  let m = /^(\d{1,2})\s*([ABab])$/.exec(s);
  if (m) {
    const code = Number(m[1]) + m[2].toUpperCase();
    return splitKey(code) ? code : null;
  }
  m = /^(\d{1,2})\s*([dDmM])$/.exec(s); // Open Key
  if (m) {
    const ok = Number(m[1]);
    if (ok < 1 || ok > 12) return null;
    return ((ok + 6) % 12 + 1) + (m[2].toLowerCase() === 'm' ? 'A' : 'B');
  }
  m = /^(do|ré|re|mi|fa|sol|la|si|[a-g])\s*(bémol|bemol|dièse|diese|sharp|flat|#|b)?\s*(.*)$/i.exec(s);
  if (!m) return null;
  const noteRaw = m[1].toLowerCase();
  const note = FRENCH[noteRaw] || noteRaw;
  let pc = BASE_PC[note];
  if (pc == null) return null;
  const acc = (m[2] || '').toLowerCase();
  if (acc === '#' || acc === 'sharp' || acc.startsWith('di')) pc += 1;
  else if (acc) pc -= 1;
  pc = (pc + 12) % 12;
  const rest = m[3].trim();
  let minor;
  if (rest === '' || rest === 'M') minor = false;
  else if (rest === 'm' || rest === '-') minor = true;
  else {
    const r = rest.toLowerCase();
    if (/^(maj|major|majeur)$/.test(r)) minor = false;
    else if (/^(min|minor|mineur)$/.test(r)) minor = true;
    else return null;
  }
  return pitchToCamelot(pc, minor);
}

/**
 * Relation harmonique en allant de `from` vers `to`.
 * Renvoie { type, label, score, why } ou null si les clés ne sont pas compatibles.
 * opts.boosts (défaut true) : autorise +2 et +7. opts.diagonal (défaut false) : diagonale.
 */
export function keyRelation(from, to, opts = {}) {
  const a = splitKey(from), b = splitKey(to);
  if (!a || !b) return null;
  const boosts = opts.boosts !== false;
  const d = (b.n - a.n + 12) % 12;
  if (a.letter === b.letter) {
    if (d === 0) return { type: 'same', label: 'Même clé', score: 100,
      why: `Même clé (${to}) : mélange parfait, aucune tension harmonique.` };
    if (d === 1) return { type: 'plus1', label: '+1', score: 90,
      why: `${from} → ${to} : +1 sur la roue (quinte au-dessus), l'énergie monte en douceur.` };
    if (d === 11) return { type: 'minus1', label: '−1', score: 88,
      why: `${from} → ${to} : −1 sur la roue (quinte en dessous), transition fluide qui détend légèrement.` };
    if (boosts && d === 2) return { type: 'boost2', label: 'Boost +2', score: 62,
      why: `${from} → ${to} : boost d'énergie +2 (un ton au-dessus). À faire en coupe franche ou sur un break, pas en long mix.` };
    if (boosts && d === 7) return { type: 'boost7', label: 'Boost +7', score: 58,
      why: `${from} → ${to} : boost d'énergie +7 (un demi-ton au-dessus). Effet « modulation » : transition courte conseillée.` };
    return null;
  }
  if (d === 0) return { type: 'switch', label: 'Bascule A/B', score: 85,
    why: `${from} → ${to} : relative ${b.letter === 'B' ? 'majeure (plus lumineux)' : 'mineure (plus sombre)'}, mêmes notes, changement d'ambiance.` };
  if (opts.diagonal) {
    const diag = (a.letter === 'A' && d === 1) || (a.letter === 'B' && d === 11);
    if (diag) return { type: 'diagonal', label: 'Diagonale', score: 70,
      why: `${from} → ${to} : diagonale (une note d'écart et changement majeur/mineur), à mixer brièvement.` };
  }
  return null;
}

/** Toutes les clés compatibles depuis `code`, triées par score décroissant. */
export function compatibleKeys(code, opts = {}) {
  const out = [];
  for (const k of ALL_KEYS) {
    const rel = keyRelation(code, k, opts);
    if (rel) out.push({ code: k, ...rel });
  }
  return out.sort((x, y) => y.score - x.score);
}
