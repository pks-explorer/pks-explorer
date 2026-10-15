/**
 * Baut die App für GitHub Pages und veröffentlicht sie auf dem Branch `gh-pages`.
 *
 *   npm run deploy                      bauen und auf origin/gh-pages veröffentlichen
 *   npm run deploy -- --nur-build       nur bauen (Ergebnis in app/dist/app/browser)
 *   npm run deploy -- --base /pfad/     Basis-Pfad selbst angeben
 *
 * Eigene Domain: Datei `CNAME` im Projektordner mit dem Domainnamen (z. B. `pks-explorer.de`). Sie wird
 * mit veröffentlicht (sonst ginge die Domain-Einstellung bei jedem Deploy verloren), Basis-Pfad ist dann `/`.
 *
 * Die Daten (data/processed) sind nicht versioniert und werden aus dem lokalen ETL-Stand gebaut, deshalb
 * wird lokal statt per GitHub Actions veröffentlicht. Der Branch `gh-pages` besteht immer aus genau einem
 * Commit (force push), damit die Daten die Historie nicht aufblähen.
 * Einmalig auf GitHub einstellen: Settings → Pages → Source „Deploy from a branch“, Branch `gh-pages` / root.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'app', 'dist', 'app', 'browser');
const { values } = parseArgs({
  options: { base: { type: 'string' }, 'nur-build': { type: 'boolean', default: false } },
});

function run(cmd, args, cwd = root, { capture = false, env = process.env } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8',
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} fehlgeschlagen (Exit ${r.status})`);
  return capture ? r.stdout.trim() : '';
}

function remoteUrl() {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** Eigene Domain aus der Datei CNAME im Projektordner, sonst undefined. */
function eigeneDomain() {
  const datei = path.join(root, 'CNAME');
  return existsSync(datei) ? readFileSync(datei, 'utf-8').trim() || undefined : undefined;
}

/**
 * Basis-Pfad: mit eigener Domain `/`, sonst aus dem Repo-Namen – Projektseiten liegen unter /<repo>/,
 * <name>.github.io unter /.
 */
function basisPfad(url, domain) {
  if (values.base) return values.base.replace(/^\/?/, '/').replace(/\/?$/, '/');
  if (domain) return '/';
  const repo = url && /[/:]([^/]+?)(\.git)?$/.exec(url)?.[1];
  if (!repo) {
    throw new Error(
      'Kein Git-Remote "origin" – Basis-Pfad unbekannt. Remote anlegen ' +
        '(git remote add origin https://github.com/<name>/<repo>.git) oder --base /<repo>/ angeben.',
    );
  }
  return repo.toLowerCase().endsWith('.github.io') ? '/' : `/${repo}/`;
}

if (!existsSync(path.join(root, 'data', 'processed', 'index.json'))) {
  throw new Error('data/processed fehlt – zuerst `npm run crawl` und `npm run etl` ausführen.');
}

const url = remoteUrl();
const domain = eigeneDomain();
const base = basisPfad(url, domain);
console.log(`Baue App für GitHub Pages (${domain ? `Domain ${domain}, ` : ''}Basis-Pfad ${base})`);
// npm direkt über Node starten (npm_execpath setzt `npm run`) – ohne Shell, auch unter Windows
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Bitte über `npm run deploy` starten.');
run(process.execPath, [npm, 'run', 'build', '-w', 'app', '--', '--base-href', base]);

// Unbekannte Pfade liefert GitHub Pages als 404.html aus – dort startet ebenfalls die App
copyFileSync(path.join(out, 'index.html'), path.join(out, '404.html'));
// Keine Jekyll-Verarbeitung: Dateien werden unverändert ausgeliefert
writeFileSync(path.join(out, '.nojekyll'), '');
if (domain) writeFileSync(path.join(out, 'CNAME'), `${domain}\n`);

if (values['nur-build']) {
  console.log(`Fertig: ${path.relative(root, out)} (nicht veröffentlicht)`);
} else {
  if (!url) throw new Error('Kein Git-Remote "origin" zum Veröffentlichen.');
  const commit = run('git', ['rev-parse', '--short', 'HEAD'], root, { capture: true });
  // Identität des Projekt-Repos verwenden (inkl. lokaler Einstellung, z. B. Pseudonym) – das frisch
  // angelegte Repo im Build-Ordner sähe sonst nur die globale Git-Konfiguration
  const name = run('git', ['config', 'user.name'], root, { capture: true });
  const email = run('git', ['config', 'user.email'], root, { capture: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
  rmSync(path.join(out, '.git'), { recursive: true, force: true });
  run('git', ['init', '-q', '-b', 'gh-pages'], out);
  run('git', ['add', '-A'], out);
  run('git', ['commit', '-q', '-m', `Veröffentlichung von ${commit}`], out, { env });
  console.log(`Commit als ${name} <${email}>`);
  console.log(`Veröffentliche auf ${url} (Branch gh-pages)`);
  run('git', ['push', '--force', url, 'gh-pages:gh-pages'], out);
  rmSync(path.join(out, '.git'), { recursive: true, force: true });
  console.log('Fertig. Die Seite ist nach ein bis zwei Minuten aktualisiert.');
}
