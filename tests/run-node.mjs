// Lance les tests dans Node :  node app/tests/run-node.mjs
import { results } from './harness.js';
import './all.test.js';

let suite = '';
for (const r of results) {
  if (r.suite !== suite) { suite = r.suite; console.log('\n' + suite); }
  console.log(`  ${r.ok ? 'OK  ' : 'ECHEC'} ${r.name}${r.ok ? '' : '\n        -> ' + r.error}`);
}
// Contrôles de publication : tout fichier de l'app doit être dans la liste hors ligne de sw.js, et les versions doivent concorder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8');
const listed = new Set([...sw.matchAll(/^\s*'([^']+)',$/gm)].map(m => m[1]));
const walk = (dir) => fs.readdirSync(path.join(appDir, dir), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]));
const needed = ['index.html', 'manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('icons')];
const check = (name, ok, error) => results.push({ suite: 'Publication', name, ok, error });
const missing = needed.filter(f => !listed.has(f));
check('tous les fichiers sont dans la liste hors ligne de sw.js', !missing.length, 'manquants : ' + missing.join(', '));
const ghosts = [...listed].filter(f => f !== './' && !fs.existsSync(path.join(appDir, f)));
check('sw.js ne liste aucun fichier inexistant', !ghosts.length, 'inexistants : ' + ghosts.join(', '));
const v1 = /VERSION = '([^']+)'/.exec(sw)[1];
const v2 = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(appDir, 'js/version.js'), 'utf8'))[1];
check('même numéro de version dans sw.js et js/version.js', v1 === v2, `${v1} ≠ ${v2}`);

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} tests réussis`);
process.exit(failed ? 1 : 0);
