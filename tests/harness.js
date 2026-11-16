// Mini-outil de test, sans dépendance : fonctionne dans Node et dans le navigateur.
export const results = [];
let currentSuite = '';

export function suite(name) { currentSuite = name; }

export function test(name, fn) {
  try { fn(); results.push({ suite: currentSuite, name, ok: true }); }
  catch (e) { results.push({ suite: currentSuite, name, ok: false, error: e && e.message ? e.message : String(e) }); }
}

const show = (v) => JSON.stringify(v);

export function eq(actual, expected, msg = '') {
  if (show(actual) !== show(expected)) throw new Error(`${msg} attendu ${show(expected)}, obtenu ${show(actual)}`);
}
export function ok(cond, msg = 'condition fausse') { if (!cond) throw new Error(msg); }
export function throws(fn, msg = 'une erreur était attendue') {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg);
}
