/**
 * Crawlt die BKA-Seiten "PKS-Tabellen" eines Jahrgangs und lädt die verlinkten Dateien herunter.
 * Die Ordnerstruktur unter data/raw/<jahr>/ spiegelt die URL-Pfade der Seiten, auf denen die Dateien verlinkt sind.
 *
 *   npm run crawl -- --year 2024                  # crawlen + PDF/XLSX laden
 *   npm run crawl -- --year 2024 --skip-crawl     # vorhandene inventory.json verwenden
 *   npm run crawl -- --year 2024 --types xlsx
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { rawYearDir } from './paths.js';

const HOST = 'https://www.bka.de';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';

const sectionPrefix = (year: number) =>
  `/DE/AktuelleInformationen/StatistikenLagebilder/PolizeilicheKriminalstatistik/PKS${year}/`;
const rootUrl = (year: number) => `${HOST}${sectionPrefix(year)}PKSTabellen/pksTabellen_node.html`;

interface Download {
  url: string;
  text: string;
  pages: string[];
}
interface Inventory {
  pages: Record<string, { title?: string; error?: boolean }>;
  downloads: Record<string, Download>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE' } });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i >= tries) throw err;
      console.warn(`  retry ${i} ${url}: ${(err as Error).message}`);
      await sleep(2000 * i);
    }
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/g, ' ');

/** Seiten-URL normalisieren: Fragment und Navigations-Parameter (nn=…) entfernen, Paginierung behalten. */
function normalizePage(u: URL): string {
  const n = new URL(u.origin + u.pathname);
  for (const [k, v] of u.searchParams) if (k.startsWith('gtp')) n.searchParams.set(k, v);
  return n.toString();
}

async function crawl(year: number): Promise<Inventory> {
  const prefix = decodeURIComponent(`${sectionPrefix(year)}PKSTabellen/`);
  const inv: Inventory = { pages: {}, downloads: {} };
  const seen = new Set<string>();
  const queue = [rootUrl(year)];

  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let body: string;
    try {
      body = await (await fetchWithRetry(url)).text();
    } catch {
      inv.pages[url] = { error: true };
      continue;
    }
    const title = /<meta name="title" content="([^"]*)"/.exec(body)?.[1];
    inv.pages[url] = { title: title && decodeEntities(title) };
    console.log(`[${seen.size}] ${inv.pages[url].title ?? ''}`);

    for (const m of body.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const abs = new URL(decodeEntities(m[1]!), url);
      if (abs.host !== 'www.bka.de') continue;
      if (abs.searchParams.get('__blob') === 'publicationFile') {
        const text = decodeEntities(m[2]!.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        const d = (inv.downloads[abs.pathname] ??= { url: abs.toString(), text, pages: [] });
        if (!d.pages.includes(url)) d.pages.push(url);
      } else if (decodeURIComponent(abs.pathname).startsWith(prefix) && abs.pathname.endsWith('.html')) {
        const n = normalizePage(abs);
        if (!seen.has(n)) queue.push(n);
      }
    }
    await sleep(300);
  }
  return inv;
}

/** Zielpfad: <jahr>/<Pfad der verlinkenden Seite relativ zu PKS<jahr>/>/<Dateiname> */
function targetPath(year: number, pageUrl: string, filePath: string): string {
  const pagePath = decodeURIComponent(new URL(pageUrl).pathname).slice(sectionPrefix(year).length);
  return path.join(rawYearDir(year), path.dirname(pagePath), path.basename(decodeURIComponent(filePath)));
}

const exists = (p: string) => stat(p).then(() => true, () => false);

async function download(year: number, inv: Inventory, types: string[], concurrency: number) {
  const jobs: { url: string; dest: string }[] = [];
  for (const [filePath, d] of Object.entries(inv.downloads)) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (!types.includes(ext)) continue;
    for (const page of d.pages) jobs.push({ url: d.url, dest: targetPath(year, page, filePath) });
  }
  let done = 0, skipped = 0, failed = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      if (await exists(job.dest)) { skipped++; continue; }
      try {
        const buf = Buffer.from(await (await fetchWithRetry(job.url)).arrayBuffer());
        await mkdir(path.dirname(job.dest), { recursive: true });
        await writeFile(job.dest + '.part', buf);
        await rename(job.dest + '.part', job.dest);
        done++;
        console.log(`OK   ${path.relative(rawYearDir(year), job.dest)} (${Math.round(buf.length / 1024)} KB)`);
      } catch (err) {
        failed++;
        console.error(`FAIL ${job.url}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`downloaded=${done} skipped=${skipped} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

const { values } = parseArgs({
  options: {
    year: { type: 'string', default: '2024' },
    types: { type: 'string', default: 'pdf,xlsx' },
    'skip-crawl': { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
  },
});
const year = Number(values.year);
const invFile = path.join(rawYearDir(year), 'inventory.json');

let inv: Inventory;
if (values['skip-crawl']) {
  inv = JSON.parse(await readFile(invFile, 'utf-8'));
} else {
  inv = await crawl(year);
  await mkdir(rawYearDir(year), { recursive: true });
  await writeFile(invFile, JSON.stringify(inv, null, 1));
  console.log(`pages=${Object.keys(inv.pages).length} downloads=${Object.keys(inv.downloads).length}`);
}
await download(year, inv, values.types.split(','), Number(values.concurrency));
