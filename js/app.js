// Point d'entrée : charge les données, assemble les écrans, gère la navigation et le mode hors ligne.
import { app } from './ui/state.js';
import { normalizeState } from './core/model.js';
import { getItem, setItem, requestPersistence } from './store.js';
import { $, toast, today } from './ui/util.js';
import './ui/library.js';
import './ui/wheel.js';
import './ui/sets.js';
import { syncWakeLock } from './ui/live.js';
import './ui/settings.js';

const NAV = [
  ['library', 'Bibliothèque', '<path d="M4 5h3v14H4zM9 5h3v14H9zM14.5 5.6l2.9-.8 3.6 13.5-2.9.8z"/>'],
  ['wheel', 'Roue', '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" stroke="currentColor" stroke-width="1.8"/>'],
  ['sets', 'Sets', '<path d="M4 6h16v2.4H4zM4 10.8h16v2.4H4zM4 15.6h10v2.4H4z"/>'],
  ['live', 'Live', '<path d="M7 4.5v15l12-7.5z"/>'],
  ['settings', 'Réglages', '<path d="M4 7h9v2H4zM17 7h3v2h-3zM4 15h3v2H4zM11 15h9v2h-9z"/><circle cx="15" cy="8" r="2.6"/><circle cx="9" cy="16" r="2.6"/>'],
];

function renderNav() {
  const live = app.liveSet();
  $('#nav').innerHTML = NAV.map(([id, label, icon]) => `<button class="${app.ui.view === id ? 'on' : ''}" data-act="nav" data-view="${id}" aria-label="${label}">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icon}</svg><span>${label}</span>${id === 'live' && live ? '<i class="dot"></i>' : ''}${id === 'settings' && app.ui.updateReady ? '<i class="dot"></i>' : ''}</button>`).join('');
}

function withScroll(root, fn) {
  const saved = new Map();
  root.querySelectorAll('[data-scroll]').forEach(el => saved.set(el.dataset.scroll, el.scrollTop));
  fn();
  root.querySelectorAll('[data-scroll]').forEach(el => { if (saved.has(el.dataset.scroll)) el.scrollTop = saved.get(el.dataset.scroll); });
}

app.renderMain = () => {
  const main = $('#main'), view = app.views[app.ui.view];
  withScroll(main, () => { main.innerHTML = view.render(); });
  main.dataset.view = app.ui.view;
  if (view.mount) view.mount(main);
};
app.renderDetail = () => {
  const el = $('#detail');
  withScroll(el, () => { el.innerHTML = app.views.detail.render(); });
};
app.render = () => {
  if (app.ui.trackId && !app.track(app.ui.trackId)) app.ui.trackId = null;
  const root = $('#app');
  root.className = `hand-${app.state.settings.hand === 'left' ? 'left' : 'right'} ${app.ui.trackId || app.ui.editing ? 'has-detail' : ''}`;
  renderNav();
  app.renderMain();
  app.renderDetail();
  syncWakeLock();
};

app.on('nav', ({ view }) => {
  if (app.ui.view === view) { // retoucher l'onglet actif = revenir à la racine de l'écran
    if (view === 'sets') { app.ui.setId = null; app.ui.builder = null; }
  }
  app.ui.view = view;
  if (window.matchMedia('(max-width: 999px)').matches) { app.ui.trackId = null; app.ui.editing = null; }
  app.render();
});

// ---------- Délégation d'événements ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#modal-root')) return;
  const fn = app.actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});
document.addEventListener('input', (e) => {
  const name = e.target.dataset && e.target.dataset.input;
  if (name && app.inputs[name]) app.inputs[name](e.target.value, e.target);
});
document.addEventListener('change', (e) => {
  const name = e.target.dataset && e.target.dataset.change;
  if (name && app.changes[name]) app.changes[name](e.target.value, e.target);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('#modal-root .modal-back:not(.sticky)');
    if (modals.length) modals[modals.length - 1].remove();
  }
});

// Enregistre immédiatement quand l'app passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') app.saveNow();
  syncWakeLock();
});
window.addEventListener('pagehide', () => app.saveNow());

// ---------- Service worker : hors ligne + mises à jour ----------
async function setupOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const ready = () => { app.ui.updateReady = true; app.render(); toast('Nouvelle version disponible.', { label: 'Installer', run: () => app.run('update-apply') }); };
    if (reg.waiting && navigator.serviceWorker.controller) ready();
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (sw) sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) ready(); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !app.ui.updateReady) return;
      reloading = true;
      app.saveNow().finally(() => location.reload());
    });
    app.on('update-apply', () => { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); else location.reload(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch { /* pas de service worker (ex. navigation privée) : l'app fonctionne quand même en ligne */ }
}

// ---------- Démarrage ----------
async function start() {
  const raw = await getItem('state');
  app.state = normalizeState(raw || {});
  app.reindex();
  app.render();

  // Copie automatique quotidienne (filet de sécurité avant les modifications du jour).
  const snap = await getItem('snapshot');
  if (app.state.tracks.length && (!snap || snap.date !== today())) setItem('snapshot', { date: today(), state: app.state });

  app.ui.persisted = await requestPersistence();
  if (app.ui.view === 'settings') app.renderMain();

  const last = await getItem('lastExport');
  const nag = await getItem('lastReminder');
  const old = (d, days) => !d || (Date.now() - new Date(d).getTime()) > days * 86400000;
  if (app.state.tracks.length >= 20 && old(last, 30) && old(nag, 7)) { // rappel au plus une fois par semaine
    setItem('lastReminder', today());
    toast(last ? 'Dernière sauvegarde exportée il y a plus de 30 jours.' : 'Pense à exporter une sauvegarde (Réglages).', { label: 'Réglages', run: () => app.run('nav', { view: 'settings' }) });
  }
  setupOffline();
}

window.djcrate = app; // pratique pour le débogage
start();
