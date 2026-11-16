import { suite, test, eq, ok, throws } from './harness.js';
import { ALL_KEYS, parseKey, keyName, keyLabel, shiftKey, switchLetter, keyRelation, compatibleKeys } from '../js/core/camelot.js';
import { DEFAULT_SETTINGS, bpmMatch, energyMatch, scoreTransition, findCompatible } from '../js/core/compat.js';
import { CURVES, CURVE_POINTS, curveValue, playSeconds, buildSet, analyzeSet } from '../js/core/setbuilder.js';
import {
  parseDuration, formatDuration, parseTags, normalizeTrack, normalizeSet, normalizeState, makeBackup, parseBackup,
  mergeTracks, mergeState, setsForTrack, emptyFilters, filterTracks, sortTracks, facet, activeFilterCount, emptyState,
} from '../js/core/model.js';
import { parseCSV, tracksFromCSV, tracksToCSV, tracksFromRekordbox, setToText } from '../js/core/importers.js';
import { demoTracks } from '../js/core/demo.js';

const T = (o) => normalizeTrack(o);
const lib = () => demoTracks().map(normalizeTrack);

// ---------------------------------------------------------------- Camelot
suite('Roue Camelot');

test('24 clés', () => eq(ALL_KEYS.length, 24));
test('noms musicaux de référence', () => {
  eq(keyName('8A'), 'Am'); eq(keyName('8B'), 'C'); eq(keyName('1A'), 'Abm'); eq(keyName('12B'), 'E');
  eq(keyName('5A'), 'Cm'); eq(keyName('11B'), 'A'); eq(keyName('2B'), 'F#'); eq(keyName('zz'), '');
});
test('libellé double notation', () => eq(keyLabel('8A'), '8A · Am'));
test('aller-retour nom -> code pour les 24 clés', () => {
  for (const k of ALL_KEYS) eq(parseKey(keyName(k)), k, k);
});
test('notation Camelot', () => {
  eq(parseKey('8A'), '8A'); eq(parseKey(' 12b '), '12B'); eq(parseKey('08A'), '8A');
  eq(parseKey('13A'), null); eq(parseKey('0B'), null);
});
test('notation anglaise', () => {
  eq(parseKey('Am'), '8A'); eq(parseKey('A minor'), '8A'); eq(parseKey('Amin'), '8A');
  eq(parseKey('C'), '8B'); eq(parseKey('C maj'), '8B'); eq(parseKey('F#m'), '11A');
  eq(parseKey('Gbm'), '11A'); eq(parseKey('Bb'), '6B'); eq(parseKey('A#'), '6B');
  eq(parseKey('G#m'), '1A'); eq(parseKey('Dbm'), '12A'); eq(parseKey('Ebm'), '2A'); eq(parseKey('D#m'), '2A');
  eq(parseKey('B'), '1B'); eq(parseKey('Bm'), '10A'); eq(parseKey('E♭'), '5B'); eq(parseKey('F♯m'), '11A');
});
test('notation française', () => {
  eq(parseKey('La m'), '8A'); eq(parseKey('Do'), '8B'); eq(parseKey('Sib'), '6B');
  eq(parseKey('Fa# mineur'), '11A'); eq(parseKey('Ré majeur'), '10B'); eq(parseKey('Mi bémol'), '5B'); eq(parseKey('Sol m'), '6A');
});
test('notation Open Key', () => {
  eq(parseKey('1m'), '8A'); eq(parseKey('1d'), '8B'); eq(parseKey('6m'), '1A'); eq(parseKey('12d'), '7B'); eq(parseKey('5m'), '12A');
});
test('entrées invalides', () => {
  eq(parseKey(''), null); eq(parseKey(null), null); eq(parseKey('H'), null); eq(parseKey('Am7'), null); eq(parseKey('bonjour'), null);
});
test('décalage sur la roue', () => {
  eq(shiftKey('12A', 1), '1A'); eq(shiftKey('1B', -1), '12B'); eq(shiftKey('8A', 7), '3A'); eq(switchLetter('8A'), '8B');
});
test('relations demandées : même clé, ±1, bascule, +2, +7', () => {
  eq(keyRelation('8A', '8A').type, 'same');
  eq(keyRelation('8A', '9A').type, 'plus1');
  eq(keyRelation('8A', '7A').type, 'minus1');
  eq(keyRelation('8A', '8B').type, 'switch');
  eq(keyRelation('8A', '10A').type, 'boost2');
  eq(keyRelation('8A', '3A').type, 'boost7');
  eq(keyRelation('12B', '1B').type, 'plus1');
  eq(keyRelation('1A', '12A').type, 'minus1');
  eq(keyRelation('11B', '1B').type, 'boost2');
});
test('le +7 est bien un demi-ton au-dessus', () => {
  eq(keyName('8A'), 'Am'); eq(keyName(shiftKey('8A', 7)), 'Bbm');
  eq(keyName(shiftKey('8B', 7)), 'Db');
});
test('clés incompatibles', () => {
  eq(keyRelation('8A', '2A'), null); eq(keyRelation('8A', '9B'), null); eq(keyRelation('8A', '6A'), null);
  eq(keyRelation('8A', ''), null);
});
test('options : boosts désactivés, diagonale activée', () => {
  eq(keyRelation('8A', '10A', { boosts: false }), null);
  eq(keyRelation('8A', '9B', { diagonal: true }).type, 'diagonal');
  eq(keyRelation('8B', '7A', { diagonal: true }).type, 'diagonal');
  eq(keyRelation('8B', '9A', { diagonal: true }), null);
});
test('ordre des scores : même > +1 > −1 > bascule > +2 > +7', () => {
  const list = compatibleKeys('8A');
  eq(list.map(k => k.code), ['8A', '9A', '7A', '8B', '10A', '3A']);
  for (const k of list) ok(k.why.length > 10, 'explication présente');
});

// ---------------------------------------------------------------- BPM / énergie / score
suite('Score de transition');

test('BPM identique = 100', () => eq(bpmMatch(124, 124).score, 100));
test('BPM dans la tolérance', () => {
  const r = bpmMatch(124, 126, { ...DEFAULT_SETTINGS, bpmTolerance: 6 });
  ok(r.ok); eq(r.mode, 'direct'); ok(r.score < 100 && r.score > 60); ok(/\+1,6 %/.test(r.why), r.why);
});
test('BPM hors tolérance', () => {
  const r = bpmMatch(120, 130, { ...DEFAULT_SETTINGS, bpmTolerance: 6 });
  ok(!r.ok); eq(r.score, 0); ok(/hors tolérance/.test(r.why));
});
test('limite exacte de tolérance acceptée', () => ok(bpmMatch(100, 106, { ...DEFAULT_SETTINGS, bpmTolerance: 6 }).ok));
test('tolérance réglable', () => {
  ok(!bpmMatch(120, 126, { ...DEFAULT_SETTINGS, bpmTolerance: 3 }).ok);
  ok(bpmMatch(120, 126, { ...DEFAULT_SETTINGS, bpmTolerance: 8 }).ok);
});
test('double tempo (87 -> 174)', () => {
  const r = bpmMatch(87, 174);
  ok(r.ok); eq(r.mode, 'half'); eq(r.score, 90);
});
test('demi-tempo (174 -> 87)', () => {
  const r = bpmMatch(174, 87);
  ok(r.ok); eq(r.mode, 'double'); ok(/double tempo/.test(r.why));
});
test('demi/double désactivé', () => ok(!bpmMatch(87, 174, { ...DEFAULT_SETTINGS, halfDouble: false }).ok));
test('tolérance 0 : seul le BPM identique passe', () => {
  ok(bpmMatch(124, 124, { ...DEFAULT_SETTINGS, bpmTolerance: 0 }).ok);
  ok(!bpmMatch(124, 124.5, { ...DEFAULT_SETTINGS, bpmTolerance: 0 }).ok);
});
test('BPM inconnu = neutre', () => { const r = bpmMatch(0, 124); ok(r.ok && r.unknown); eq(r.score, 50); });
test('écart d\'énergie', () => {
  eq(energyMatch(5, 5).score, 100); eq(energyMatch(5, 6).score, 90); eq(energyMatch(5, 4).score, 80);
  ok(energyMatch(5, 7).ok); ok(!energyMatch(5, 8).ok); ok(energyMatch(5, 8, { ...DEFAULT_SETTINGS, maxEnergyGap: 3 }).ok);
  eq(energyMatch(5, 3).gap, -2); ok(energyMatch(0, 5).unknown);
});
test('transition parfaite = 100', () => {
  const a = T({ title: 'a', bpm: 124, key: '8A', energy: 6 }), b = T({ title: 'b', bpm: 124, key: 'Am', energy: 6 });
  const r = scoreTransition(a, b);
  eq(r.score, 100); ok(r.compatible); eq(r.reasons.length, 3);
});
test('clash de clé = incompatible, avec explication', () => {
  const r = scoreTransition(T({ title: 'a', bpm: 124, key: '8A', energy: 6 }), T({ title: 'b', bpm: 124, key: '2A', energy: 6 }));
  ok(!r.compatible); eq(r.key.type, 'clash'); ok(/non compatibles/.test(r.reasons[0]));
});
test('clé inconnue = incompatible', () => {
  const r = scoreTransition(T({ title: 'a', bpm: 124, key: '8A' }), T({ title: 'b', bpm: 124 }));
  ok(!r.compatible); eq(r.key.type, 'unknown');
});
test('les poids modifient le score global', () => {
  const a = T({ title: 'a', bpm: 124, key: '8A', energy: 6 }), b = T({ title: 'b', bpm: 124, key: '10A', energy: 6 });
  const def = scoreTransition(a, b).score;
  const keyOnly = scoreTransition(a, b, { ...DEFAULT_SETTINGS, wKey: 100, wBpm: 0, wEnergy: 0 }).score;
  eq(keyOnly, 62); ok(def > keyOnly);
});
test('findCompatible : trié, sans le morceau lui-même, uniquement des compatibles', () => {
  const tracks = lib();
  const src = tracks.find(t => t.title === 'Soleil Rasant'); // 8A, 123, E5
  const list = findCompatible(src, tracks);
  ok(list.length >= 4, 'au moins 4 compatibles, obtenu ' + list.length);
  ok(!list.some(x => x.track.id === src.id));
  ok(list.every(x => x.result.compatible));
  for (let i = 1; i < list.length; i++) ok(list[i - 1].result.score >= list[i].result.score, 'tri décroissant');
  ok(!list.some(x => x.track.title === 'Ligne Haute Tension'), 'pas de clash dans la liste');
  ok(list.some(x => x.track.title === 'Zénith'), 'E5 → E7 = +2, accepté');
  ok(!list.some(x => x.track.title === 'Courant Fort'), 'E5 → E8 = +3, refusé');
});
test('findCompatible : le demi-tempo fait apparaître la drum & bass depuis le hip-hop', () => {
  const tracks = lib();
  const hiphop = tracks.find(t => t.title === 'Pavés Mouillés'); // 87 BPM, 9A, E5
  const s = { ...DEFAULT_SETTINGS, maxEnergyGap: 3 };
  ok(findCompatible(hiphop, tracks, s).some(x => x.track.title === 'Demi-Lune'));
  ok(!findCompatible(hiphop, tracks, { ...s, halfDouble: false }).some(x => x.track.title === 'Demi-Lune'));
});

// ---------------------------------------------------------------- Constructeur de set
suite('Constructeur de set');

test('toutes les courbes ont 11 points entre 1 et 10', () => {
  for (const c of Object.values(CURVES)) {
    eq(c.points.length, CURVE_POINTS);
    ok(c.points.every(p => p >= 1 && p <= 10), c.label);
  }
});
test('interpolation de courbe', () => {
  eq(curveValue([2, 4], 0.5), 3); eq(curveValue([2, 4], 0), 2); eq(curveValue([2, 4], 1), 4);
  eq(curveValue([2, 4], 5), 4); eq(curveValue([], 0.5), 5); eq(curveValue([1, 5, 9], 0.25), 3);
});
test('durée jouée = durée − recouvrement, avec valeur par défaut', () => {
  eq(playSeconds({ duration: 360 }, { avgPlaySec: 240, overlapSec: 30 }), 330);
  eq(playSeconds({ duration: 0 }, { avgPlaySec: 240, overlapSec: 30 }), 210);
  eq(playSeconds({ duration: 70 }, { avgPlaySec: 240, overlapSec: 30 }), 60);
});
test('set généré : commence par le morceau choisi, sans doublon, proche de la durée', () => {
  const tracks = lib();
  const start = tracks.find(t => t.title === 'Aube Minérale');
  const r = buildSet({ start, tracks, targetSec: 3600, curve: CURVES.montee.points });
  eq(r.ids[0], start.id);
  eq(new Set(r.ids).size, r.ids.length);
  ok(Math.abs(r.totalSec - 3600) <= 420, 'durée ' + r.totalSec);
});
test('set généré : transitions harmoniques quand la bibliothèque le permet', () => {
  const tracks = lib();
  const start = tracks.find(t => t.title === 'Aube Minérale');
  const r = buildSet({ start, tracks, targetSec: 2700, curve: CURVES.montee.points });
  const list = r.ids.map(id => tracks.find(t => t.id === id));
  const a = analyzeSet(list);
  eq(r.forced, 0);
  ok(a.transitions.every(t => t.harmonic), 'toutes harmoniques');
});
test('la courbe est suivie : montée finit plus haut, descente finit plus bas', () => {
  const tracks = lib();
  const energies = (startTitle, curve) => {
    const start = tracks.find(t => t.title === startTitle);
    const r = buildSet({ start, tracks, targetSec: 3000, curve });
    return r.ids.map(id => tracks.find(t => t.id === id).energy);
  };
  const up = energies('Aube Minérale', CURVES.montee.points);
  ok(up[up.length - 1] > up[0] + 2, 'montée : ' + up.join(','));
  const down = energies('Courant Fort', CURVES.descente.points);
  ok(down[down.length - 1] < down[0] - 1, 'descente : ' + down.join(','));
});
test('génération déterministe', () => {
  const tracks = lib();
  const start = tracks[4];
  const a = buildSet({ start, tracks, targetSec: 2400, curve: CURVES.vague.points });
  const b = buildSet({ start, tracks, targetSec: 2400, curve: CURVES.vague.points });
  eq(a.ids, b.ids);
});
test('bibliothèque trop petite : s\'arrête proprement', () => {
  const tracks = lib().slice(0, 3);
  const r = buildSet({ start: tracks[0], tracks, targetSec: 7200, curve: CURVES.plateau.points });
  eq(r.ids.length, 3);
});
test('un seul morceau', () => {
  const tracks = lib().slice(0, 1);
  eq(buildSet({ start: tracks[0], tracks, targetSec: 3600 }).ids, [tracks[0].id]);
});
test('sans option compatible : enchaîne quand même et le signale', () => {
  const tracks = [T({ id: 'x', title: 'x', bpm: 120, key: '8A', energy: 5, duration: 300 }), T({ id: 'y', title: 'y', bpm: 170, key: '2A', energy: 5, duration: 300 })];
  const r = buildSet({ start: tracks[0], tracks, targetSec: 500 });
  eq(r.ids, ['x', 'y']); eq(r.forced, 1);
});
test('analyse de set', () => {
  const tracks = lib();
  const a = analyzeSet([tracks[0], tracks[1], tracks[15]]);
  eq(a.transitions.length, 2); eq(a.weak, 1); ok(a.avgScore > 0);
  eq(a.energy[0].at, 0); eq(a.energy[1].at, playSeconds(tracks[0]));
  eq(analyzeSet([]).avgScore, null);
});

// ---------------------------------------------------------------- Modèle
suite('Modèle de données et sauvegarde');

test('durées', () => {
  eq(parseDuration('5:32'), 332); eq(parseDuration('1:02:03'), 3723); eq(parseDuration('332'), 332);
  eq(parseDuration(''), 0); eq(parseDuration('abc'), 0); eq(parseDuration(245.6), 246);
  eq(formatDuration(332), '5:32'); eq(formatDuration(3723), '1:02:03'); eq(formatDuration(0), ''); eq(formatDuration(59), '0:59');
});
test('tags : séparateurs, #, doublons', () => eq(parseTags('#peak, Vocal; peak ,, '), ['peak', 'Vocal']));
test('normalisation d\'un morceau', () => {
  const t = T({ title: '  Test ', bpm: '124,5', key: 'La m', energy: '7', duration: '6:00', tags: 'a,b', cues: [{ time: '1:00', label: 'drop' }, {}] });
  eq(t.title, 'Test'); eq(t.bpm, 124.5); eq(t.key, '8A'); eq(t.energy, 7); eq(t.duration, 360);
  eq(t.tags, ['a', 'b']); eq(t.cues.length, 1); ok(t.id.length > 5);
});
test('valeurs invalides neutralisées', () => {
  const t = T({ bpm: 'vite', key: '??', energy: 14 });
  eq(t.title, 'Sans titre'); eq(t.bpm, 0); eq(t.key, ''); eq(t.energy, 0);
});
test('sauvegarde puis restauration à l\'identique', () => {
  const state = normalizeState({ tracks: demoTracks(), sets: [{ id: 's1', name: 'Samedi', trackIds: ['demo-1', 'demo-2'], status: 'played', curve: [1, 2, 3] }], settings: { bpmTolerance: 4, hand: 'left' } });
  const back = parseBackup(makeBackup(state));
  eq(back, state);
  eq(back.settings.bpmTolerance, 4); eq(back.settings.hand, 'left'); eq(back.sets[0].trackIds, ['demo-1', 'demo-2']);
});
test('restauration : fichiers invalides refusés avec un message', () => {
  throws(() => parseBackup('pas du json'));
  throws(() => parseBackup('{"app":"autre","tracks":[]}'));
  throws(() => parseBackup(JSON.stringify({ app: 'dj-crate', schemaVersion: 99, tracks: [] })));
});
test('restauration : références de set vers des morceaux absents nettoyées', () => {
  const s = normalizeState({ tracks: [{ id: 'a', title: 'A' }], sets: [{ trackIds: ['a', 'fantome'] }] });
  eq(s.sets[0].trackIds, ['a']);
});
test('état vide', () => { const s = emptyState(); eq(s.tracks, []); eq(s.settings.bpmTolerance, 6); });
test('fusion sans doublon (titre + artiste, insensible à la casse et aux accents)', () => {
  const base = [T({ id: '1', title: 'Zénith', artist: 'Elio' })];
  const r = mergeTracks(base, [{ title: 'zenith', artist: 'ELIO' }, { title: 'Autre', artist: 'Elio' }]);
  eq(r.added, 1); eq(r.skipped, 1); eq(r.tracks.length, 2);
});
test('fusion de sauvegardes : les sets suivent les morceaux fusionnés', () => {
  const state = normalizeState({ tracks: [{ id: 'loc', title: 'Zénith', artist: 'Elio' }] });
  const incoming = normalizeState({ tracks: [{ id: 'ext', title: 'Zénith', artist: 'Elio' }, { id: 'n', title: 'Neuf' }], sets: [{ id: 'sx', name: 'S', trackIds: ['ext', 'n'] }] });
  const r = mergeState(state, incoming);
  eq(r.added, 1); eq(r.setsAdded, 1); eq(r.state.sets[0].trackIds, ['loc', 'n']);
});
test('sets dans lesquels un morceau a été joué', () => {
  const sets = [normalizeSet({ id: 'a', date: '2026-01-01', trackIds: ['t1'] }), normalizeSet({ id: 'b', date: '2026-05-01', trackIds: ['t1', 't2'] }), normalizeSet({ id: 'c', trackIds: ['t2'] })];
  eq(setsForTrack('t1', sets).map(s => s.id), ['b', 'a']);
});

// ---------------------------------------------------------------- Filtres
suite('Recherche et filtres');

const F = (o) => ({ ...emptyFilters(), ...o });
test('sans filtre : tout', () => eq(filterTracks(lib(), emptyFilters()).length, 24));
test('recherche texte multi-mots, sans accents', () => {
  eq(filterTracks(lib(), F({ q: 'zenith' })).length, 1);
  eq(filterTracks(lib(), F({ q: 'lune froide' })).length, 2);
  eq(filterTracks(lib(), F({ q: 'techno peak acid' })).length, 2);
  eq(filterTracks(lib(), F({ q: 'introuvable' })).length, 0);
});
test('plage de BPM', () => {
  const r = filterTracks(lib(), F({ bpmMin: 124, bpmMax: 126 }));
  ok(r.length > 0 && r.every(t => t.bpm >= 124 && t.bpm <= 126));
  ok(filterTracks(lib(), F({ bpmMin: 170 })).every(t => t.bpm >= 170));
});
test('clés, genres, énergies', () => {
  ok(filterTracks(lib(), F({ keys: ['8A', '9A'] })).every(t => ['8A', '9A'].includes(t.key)));
  eq(filterTracks(lib(), F({ genres: ['techno'] })).length, 5);
  ok(filterTracks(lib(), F({ energies: [9, 10] })).every(t => t.energy >= 9));
});
test('tags : tous requis', () => {
  eq(filterTracks(lib(), F({ tags: ['disco', 'vocal'] })).length, 1);
  ok(filterTracks(lib(), F({ tags: ['peak'] })).length >= 5);
});
test('filtres combinés', () => {
  const r = filterTracks(lib(), F({ genres: ['Techno'], energies: [9], bpmMin: 130, q: 'acid' }));
  eq(r.map(t => t.title), ['Stroboscope']);
});
test('nombre de filtres actifs', () => { eq(activeFilterCount(emptyFilters()), 0); eq(activeFilterCount(F({ bpmMin: 120, tags: ['a'] })), 2); });
test('tri par BPM, clé, titre ; inconnus à la fin', () => {
  const tracks = [T({ title: 'b', bpm: 128, key: '10A' }), T({ title: 'a', bpm: 0, key: '' }), T({ title: 'c', bpm: 120, key: '2B' })];
  eq(sortTracks(tracks, 'bpm').map(t => t.title), ['c', 'b', 'a']);
  eq(sortTracks(tracks, 'key').map(t => t.title), ['c', 'b', 'a']);
  eq(sortTracks(tracks, 'title').map(t => t.title), ['a', 'b', 'c']);
  eq(sortTracks(tracks, 'title', -1).map(t => t.title), ['c', 'b', 'a']);
});
test('facettes genres / tags', () => {
  const g = facet(lib(), 'genre');
  eq(g[0].value, 'Techno'); eq(g[0].n, 5); ok(g.some(x => x.value === 'Disco' && x.n === 2));
  ok(facet(lib(), 'tags').some(x => x.value === 'peak'));
});

// ---------------------------------------------------------------- Import / export
suite('Import et export');

test('CSV : virgules, guillemets, retours ligne', () => {
  eq(parseCSV('a,b\n"x, y","il a dit ""oui"""\n\n1,2'), [['a', 'b'], ['x, y', 'il a dit "oui"'], ['1', '2']]);
});
test('CSV : point-virgule et BOM', () => eq(parseCSV('﻿a;b\r\n1;2'), [['a', 'b'], ['1', '2']]));
test('CSV -> morceaux (en-têtes français ou anglais)', () => {
  const t = tracksFromCSV('Titre;Artiste;BPM;Clé;Énergie;Durée;Tags\nZénith;Elio;124;Am;7;7:10;"a, b"');
  eq(t.length, 1);
  const n = T(t[0]);
  eq(n.key, '8A'); eq(n.bpm, 124); eq(n.duration, 430); eq(n.tags, ['a', 'b']);
  eq(T(tracksFromCSV('Title,Artist,Key\nX,Y,11B')[0]).key, '11B');
});
test('CSV sans colonne titre : erreur claire', () => throws(() => tracksFromCSV('foo,bar\n1,2')));
test('export CSV puis réimport à l\'identique', () => {
  const tracks = lib();
  const back = tracksFromCSV(tracksToCSV(tracks)).map(normalizeTrack);
  eq(back.length, tracks.length);
  for (let i = 0; i < tracks.length; i++) {
    for (const f of ['title', 'artist', 'genre', 'bpm', 'key', 'energy', 'duration', 'tags', 'notes', 'cues']) eq(back[i][f], tracks[i][f], `${tracks[i].title}.${f}`);
  }
});
test('XML Rekordbox', () => {
  const xml = `<?xml version="1.0"?><DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="2">
    <TRACK TrackID="1" Name="Tom &amp; Jerry" Artist="A &quot;B&quot;" Genre="House" TotalTime="372" AverageBpm="124.00" Tonality="Am" Comments="top">
      <TEMPO Inizio="0.1" Bpm="124.00"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.5" Num="1"/>
      <POSITION_MARK Name="" Type="0" Start="12.0" Num="0"/>
    </TRACK>
    <TRACK TrackID="2" Name="Solo" Artist="C" TotalTime="200" AverageBpm="128.5" Tonality="11B"/>
  </COLLECTION><PLAYLISTS><NODE><TRACK Key="1"/></NODE></PLAYLISTS></DJ_PLAYLISTS>`;
  const raw = tracksFromRekordbox(xml);
  eq(raw.length, 2);
  const a = T(raw[0]);
  eq(a.title, 'Tom & Jerry'); eq(a.artist, 'A "B"'); eq(a.key, '8A'); eq(a.bpm, 124); eq(a.duration, 372); eq(a.notes, 'top');
  eq(a.cues, [{ time: '0:12', label: 'Hot cue A' }, { time: '1:05', label: 'Drop' }]);
  eq(T(raw[1]).key, '11B');
  throws(() => tracksFromRekordbox('<html></html>'));
});
test('tracklist texte', () => {
  const tracks = lib();
  const txt = setToText(normalizeSet({ name: 'Samedi', date: '2026-11-14', venue: 'Le Hangar' }), [tracks[0], tracks[1]]);
  ok(txt.startsWith('Samedi — 2026-11-14 — Le Hangar'));
  ok(txt.includes('01. Lune Froide – Aube Minérale [8A/Am, 118 BPM, E3]'));
});

// ---------- Pack de départ ----------
import { starterTracks } from '../js/data/starter-pack.js';
suite('Pack de départ');
test('2000 morceaux valides, sans doublon', () => {
  const raw = starterTracks();
  eq(raw.length, 2000);
  const r = mergeTracks([], raw);
  eq(r.added, 2000); eq(r.skipped, 0);
  ok(r.tracks.every(t => t.title !== 'Sans titre' && t.artist && t.genre && t.duration > 0));
});
test('BPM, clé et énergie du pack sont valides', () => {
  const ts = starterTracks().map(normalizeTrack);
  ok(ts.every(t => t.energy >= 1 && t.energy <= 10));
  ok(ts.every(t => t.bpm === 0 || (t.bpm >= 75 && t.bpm <= 200)));
  ok(ts.every(t => t.key === '' || ALL_KEYS.includes(t.key)));
  ok(ts.filter(t => t.bpm > 0).length > 1000); ok(ts.filter(t => t.key).length > 800);
});
test('recharger le pack ne crée aucun doublon', () => {
  const once = mergeTracks([], starterTracks()).tracks;
  eq(mergeTracks(once, starterTracks()).added, 0);
});
