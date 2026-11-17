// Écran Réglages : compatibilité, sauvegarde / restauration, imports, aide.
import { app } from './state.js';
import { DEFAULT_SETTINGS } from '../core/compat.js';
import { makeBackup, parseBackup, mergeState, mergeTracks, emptyState, normalizeState } from '../core/model.js';
import { tracksFromCSV, tracksToCSV, tracksFromRekordbox } from '../core/importers.js';
import { demoTracks } from '../core/demo.js';
import { PACKS, packTracks } from '../data/packs.js';
import { getItem, setItem } from '../store.js';
import { APP_VERSION } from '../version.js';
import { stepper, chip, toast, confirmDialog, saveFile, pickFile, openModal, today, frDate } from './util.js';

app.views.settings = {
  render() {
    const s = app.state.settings, n = app.state.tracks.length, ns = app.state.sets.length;
    return `<header class="bar"><h1 class="grow">Réglages</h1>${app.ui.updateReady ? '<button class="btn primary" data-act="update-apply">Installer la mise à jour</button>' : ''}</header>
    <div class="dscroll settings" data-scroll="settings">
      <h2>Sauvegarde <small class="dim">— ${n} morceau${n > 1 ? 'x' : ''}, ${ns} set${ns > 1 ? 's' : ''}</small></h2>
      <p class="dim">Tes données restent uniquement sur cet iPad. Exporte régulièrement un fichier de sauvegarde (dans Fichiers, iCloud Drive ou une clé USB) : c'est ta seule copie de secours.</p>
      <div class="actions">
        <button class="btn primary" data-act="export-json">Exporter une sauvegarde</button>
        <button class="btn" data-act="import-json">Restaurer (remplace tout)</button>
        <button class="btn" data-act="merge-json">Fusionner une sauvegarde</button>
        <button class="btn" data-act="snapshot-restore">Revenir à la copie automatique</button>
      </div>
      <p class="dim">Stockage protégé contre le nettoyage automatique : <b>${app.ui.persisted ? 'oui' : 'non garanti'}</b>${app.ui.persisted ? '' : ' — installe l\'app sur l\'écran d\'accueil et exporte des sauvegardes.'}</p>

      <h2>Importer / exporter des morceaux</h2>
      <div class="actions">
        <button class="btn" data-act="import-csv">Importer un CSV</button>
        <button class="btn" data-act="import-rb">Importer un XML Rekordbox</button>
        <button class="btn" data-act="export-csv">Exporter en CSV</button>
        <button class="btn" data-act="demo-load">Charger la démo</button>
      </div>

      <h2>Packs <small class="dim">— tes playlists Rekordbox</small></h2>
      <p class="dim">Chaque pack ajoute les morceaux d'une playlist (BPM, clé et cue points inclus). Un morceau déjà présent n'est jamais ajouté deux fois.</p>
      <div class="actions">
        ${PACKS.map(p => `<button class="btn" data-act="pack-load" data-pack="${p.id}">${p.name} <small class="dim">(${p.idx.length})</small></button>`).join('')}
        <button class="btn primary" data-act="pack-load" data-pack="*">Tous les packs</button>
      </div>

      <h2>Compatibilité des transitions</h2>
      <div class="tune col">
        ${stepper('Tolérance BPM', 'bpmTolerance', s.bpmTolerance, { prefix: '±', unit: ' %', min: 0, max: 50 })}
        ${stepper('Écart d\'énergie max', 'maxEnergyGap', s.maxEnergyGap, { prefix: '±', min: 0, max: 9 })}
        <div class="chips">${chip('Demi / double tempo', s.halfDouble, 'set-toggle', { name: 'halfDouble' })}
          ${chip('Boosts +2 / +7', s.boosts, 'set-toggle', { name: 'boosts' })}
          ${chip('Diagonale (ex. 8A → 9B)', s.diagonal, 'set-toggle', { name: 'diagonal' })}</div>
      </div>
      <h2>Poids dans le score global</h2>
      <div class="tune col">
        ${stepper('Clé', 'wKey', s.wKey, { step: 5, min: 0, max: 100 })}
        ${stepper('BPM', 'wBpm', s.wBpm, { step: 5, min: 0, max: 100 })}
        ${stepper('Énergie', 'wEnergy', s.wEnergy, { step: 5, min: 0, max: 100 })}
      </div>
      <h2>Constructeur de set</h2>
      <div class="tune col">
        ${stepper('Recouvrement entre deux morceaux', 'overlapSec', s.overlapSec, { step: 5, unit: ' s', min: 0, max: 180 })}
        ${stepper('Durée jouée si durée inconnue', 'avgPlaySec', s.avgPlaySec, { step: 15, unit: ' s', min: 60, max: 900 })}
      </div>
      <h2>Interface</h2>
      <div class="chips">${chip('Barre de navigation à gauche', s.hand === 'left', 'set-hand', { v: 'left' })}${chip('Barre de navigation à droite', s.hand === 'right', 'set-hand', { v: 'right' })}</div>
      <div class="actions">
        <button class="btn" data-act="help">Aide rapide</button>
        <button class="btn" data-act="settings-reset">Réglages par défaut</button>
        <button class="btn danger" data-act="erase-all">Tout effacer</button>
      </div>
      <p class="dim center">DJ Crate ${APP_VERSION} — 100 % hors ligne, sans compte ni serveur.</p>
    </div>`;
  },
};

app.on('set-step', ({ name, delta, min, max }) => {
  const s = app.state.settings;
  const v = Math.round((Number(s[name]) + Number(delta)) * 100) / 100;
  app.state.settings = { ...s, [name]: Math.max(Number(min), Math.min(Number(max), v)) };
  app.commit();
});
app.on('set-toggle', ({ name }) => { app.state.settings = { ...app.state.settings, [name]: !app.state.settings[name] }; app.commit(); });
app.on('set-hand', ({ v }) => { app.state.settings = { ...app.state.settings, hand: v }; app.commit(); });
app.on('settings-reset', () => { app.state.settings = { ...DEFAULT_SETTINGS }; app.commit(); toast('Réglages par défaut rétablis.'); });

app.on('export-json', async () => {
  const ok = await saveFile(`dj-crate-sauvegarde-${today()}.json`, makeBackup(app.state), 'application/json');
  if (ok) { setItem('lastExport', today()); toast('Sauvegarde exportée.'); }
});

async function readFile(parse) {
  const text = await pickFile();
  if (text == null) return null;
  try { return parse(text); } catch (e) { toast(e.message || 'Fichier illisible.'); return null; }
}

app.on('import-json', async () => {
  const incoming = await readFile(parseBackup);
  if (!incoming) return;
  if (!await confirmDialog(`Remplacer TOUTES les données actuelles par cette sauvegarde (${incoming.tracks.length} morceaux, ${incoming.sets.length} sets) ?`, 'Remplacer', true)) return;
  const before = app.state;
  app.state = incoming; app.ui.trackId = null; app.ui.editing = null; app.ui.setId = null;
  app.commit();
  toast('Sauvegarde restaurée.', { label: 'Annuler', run: () => { app.state = before; app.commit(); } });
});
app.on('merge-json', async () => {
  const incoming = await readFile(parseBackup);
  if (!incoming) return;
  const r = mergeState(app.state, incoming);
  app.state = r.state; app.commit();
  toast(`${r.added} morceau(x) et ${r.setsAdded} set(s) ajoutés, ${r.skipped} doublon(s) ignoré(s).`);
});

function addTracks(raw, label) {
  const r = mergeTracks(app.state.tracks, raw);
  app.state.tracks = r.tracks; app.commit();
  toast(`${label} : ${r.added} morceau(x) ajouté(s), ${r.skipped} doublon(s) ignoré(s).`);
}
app.on('import-csv', async () => { const raw = await readFile(tracksFromCSV); if (raw) addTracks(raw, 'CSV'); });
app.on('import-rb', async () => { const raw = await readFile(tracksFromRekordbox); if (raw) addTracks(raw, 'Rekordbox'); });
app.on('export-csv', () => saveFile(`dj-crate-morceaux-${today()}.csv`, tracksToCSV(app.state.tracks), 'text/csv'));
app.on('demo-load', () => addTracks(demoTracks(), 'Démo'));
app.on('pack-load', ({ pack }) => {
  if (pack === '*') addTracks(PACKS.flatMap(p => packTracks(p.id)), 'Tous les packs');
  else addTracks(packTracks(pack), 'Pack « ' + (PACKS.find(p => p.id === pack) || {}).name + ' »');
});

app.on('erase-all', async () => {
  if (!await confirmDialog('Effacer TOUS les morceaux et TOUS les sets de cet iPad ? Exporte une sauvegarde avant si tu veux pouvoir revenir en arrière.', 'Tout effacer', true)) return;
  const before = app.state;
  app.state = { ...emptyState(), settings: app.state.settings };
  app.ui.trackId = null; app.ui.editing = null; app.ui.setId = null;
  app.commit();
  toast('Tout a été effacé.', { label: 'Annuler', run: () => { app.state = before; app.commit(); } });
});

app.on('snapshot-restore', async () => {
  const snap = await getItem('snapshot');
  if (!snap || !snap.state) { toast('Aucune copie automatique pour l\'instant (elle est créée une fois par jour).'); return; }
  const st = normalizeState(snap.state);
  if (!await confirmDialog(`Revenir à la copie automatique du ${frDate(snap.date)} (${st.tracks.length} morceaux, ${st.sets.length} sets) ? Les données actuelles seront remplacées.`, 'Restaurer', true)) return;
  const before = app.state;
  app.state = st; app.ui.trackId = null; app.ui.editing = null; app.ui.setId = null; app.commit();
  toast('Copie automatique restaurée.', { label: 'Annuler', run: () => { app.state = before; app.commit(); } });
});

app.on('help', () => {
  const m = openModal(`<h2>Aide rapide</h2><div class="help">
    <p><b>Bibliothèque</b> — « ＋ » ajoute un morceau. La clé accepte 8A, Am, F#m, Sib ou 1m. Touche un morceau pour voir sa fiche et ses transitions compatibles ; touche le score pour savoir pourquoi.</p>
    <p><b>Roue</b> — touche une clé : les clés compatibles restent allumées et tes morceaux s'affichent par type de transition.</p>
    <p><b>Sets</b> — « Construire un set » : morceau de départ, durée, courbe d'énergie (à dessiner au Pencil si tu veux). Glisse ≡ pour réordonner.</p>
    <p><b>Live</b> — touche le morceau que tu lances : l'app propose la suite et garde l'historique.</p>
    <p><b>Score</b> — vert ≥ 80, jaune ≥ 60, rouge en dessous ou hors tolérance. Clé, BPM et énergie sont pondérés dans Réglages.</p>
    <p><b>Sauvegarde</b> — Réglages › Exporter une sauvegarde, puis « Enregistrer dans Fichiers ».</p></div>
    <div class="modal-actions"><button class="btn primary" data-close>Fermer</button></div>`);
  m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.remove(); });
});
