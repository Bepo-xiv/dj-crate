// État partagé de l'interface + registre d'actions. Les écrans s'y enregistrent.
import { emptyState, emptyFilters } from '../core/model.js';
import { setItem } from '../store.js';

export const app = {
  state: emptyState(),
  ui: {
    view: 'library',
    trackId: null,        // morceau ouvert dans le panneau de détail
    editing: null,        // null | { id } (id null = nouveau morceau)
    filters: emptyFilters(),
    filtersOpen: false,
    sort: { field: 'title', dir: 1 },
    listLimit: 300,
    wheelKey: null,
    wheelBpm: 0,
    setId: null,          // set ouvert dans l'éditeur
    builder: null,        // assistant de création de set
    liveDir: null,        // filtre d'énergie en mode Live : null | 1 | 0 | -1
    persisted: false,
    updateReady: false,
  },
  actions: {},   // clics : data-act="nom"
  inputs: {},    // saisie en direct : data-input="nom"
  changes: {},   // validation d'un champ : data-change="nom"
  views: {},
  byId: new Map(),

  on(name, fn) { this.actions[name] = fn; },
  onInput(name, fn) { this.inputs[name] = fn; },
  onChange(name, fn) { this.changes[name] = fn; },
  run(name, data = {}) { return this.actions[name] && this.actions[name](data); },

  track(id) { return this.byId.get(id); },
  set(id) { return this.state.sets.find(s => s.id === id); },
  setTracks(set) { return set.trackIds.map(id => this.byId.get(id)).filter(Boolean); },
  liveSet() { return this.state.sets.find(s => s.status === 'live'); },

  reindex() { this.byId = new Map(this.state.tracks.map(t => [t.id, t])); },

  /** À appeler après toute modification des données : enregistre et redessine. */
  commit(opts = {}) {
    this.reindex();
    this.saveSoon();
    if (opts.render !== false) this.render();
  },

  _timer: null,
  saveSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 250);
  },
  saveNow() {
    clearTimeout(this._timer);
    this._timer = null;
    return setItem('state', this.state);
  },

  // Remplacées au démarrage par app.js
  render() {}, renderMain() {}, renderDetail() {},
};
