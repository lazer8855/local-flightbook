import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

await mkdir('.cache/build', { recursive: true });
const worker = await build({ entryPoints: ['node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'], bundle: true, format: 'iife', write: false, minify: true, metafile: true });
const terrainWorker = await build({ entryPoints: ['src/terrain-worker.mjs'], bundle: true, format: 'iife', write: false, minify: true, metafile: true });
const xcWorker = await build({ entryPoints: ['src/xc-worker.mjs'], bundle: true, format: 'iife', write: false, minify: true, metafile: true, define: { global: 'globalThis' } });
// Module workers from a file:// page have an opaque origin in Chromium.
// Our worker is fully bundled as a classic IIFE: select MapLibre's existing
// classic-worker path for this blob only, without relaxing browser security.
const classicBlobWorker = {
  name: 'classic-blob-worker',
  setup(build) {
    build.onLoad({ filter: /maplibre-gl-dev\.mjs$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      const original = 'return url.split(/[?#]/)[0].endsWith(".cjs");';
      if (!source.includes(original)) throw new Error('MapLibre worker adapter needs review after dependency update');
      return { contents: source.replace(original, 'return url.startsWith("blob:") || url.split(/[?#]/)[0].endsWith(".cjs");'), loader: 'js', resolveDir: 'node_modules/maplibre-gl/dist' };
    });
  }
};
const app = await build({ entryPoints: ['src/app.mjs'], alias: { 'maplibre-gl': './node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs' }, plugins: [classicBlobWorker], bundle: true, format: 'iife', write: false, minify: true, metafile: true, define: { MAP_WORKER: JSON.stringify(worker.outputFiles[0].text), TERRAIN_WORKER: JSON.stringify(terrainWorker.outputFiles[0].text), XC_WORKER: JSON.stringify(xcWorker.outputFiles[0].text) } });
let fontCSS = '';
for (const weight of [400, 600]) {
  const source = await readFile(`node_modules/@fontsource/noto-sans/${weight}.css`, 'utf8');
  for (const block of source.matchAll(/@font-face\s*\{[^}]+\}/g)) {
    const filename = block[0].match(/url\(\.\/files\/([^)]*\.woff2)\)/)[1];
    const font = (await readFile(`node_modules/@fontsource/noto-sans/files/${filename}`)).toString('base64');
    fontCSS += `${block[0].replace("'Noto Sans'", "'Flightbook'").replace(/src:[^;]+;/, `src:url(data:font/woff2;base64,${font}) format('woff2');`).replace('font-display: swap', 'font-display: block')}\n`;
  }
}
const mapCSS = await readFile('node_modules/maplibre-gl/dist/maplibre-gl.css', 'utf8');
const css = `${await readFile('src/style.css', 'utf8')}\n${await readFile('src/statistics.css', 'utf8')}`;
let html = await readFile('src/index.html', 'utf8');
html = html.replace('/* BUNDLED_STYLES */', `${fontCSS}\n${mapCSS}\n${css}`);
html = html.replace('/* BUNDLED_APP */', () => app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
const packageRoots = new Set(['node_modules/@fontsource/noto-sans']);
for (const input of [...Object.keys(app.metafile.inputs), ...Object.keys(worker.metafile.inputs), ...Object.keys(terrainWorker.metafile.inputs), ...Object.keys(xcWorker.metafile.inputs)]) {
  const match = input.match(/^(node_modules\/(?:@[^/]+\/)?[^/]+)/);
  if (match) packageRoots.add(match[1]);
}
let notices = 'Flightbook prototype — bundled third-party software notices\n\n';
for (const root of [...packageRoots].sort()) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  notices += `\n${pkg.name} ${pkg.version} (${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)})\n${'='.repeat(70)}\n`;
  for (const file of await readdir(root)) {
    if (/^(licen[sc]e|copying|notice)([.-]|$)/i.test(file)) notices += `${await readFile(join(root, file), 'utf8')}\n`;
  }
}
await writeFile('THIRD_PARTY_NOTICES.txt', notices);
html += `\n<!--\n${notices.replace(/-->/g, '-- >')}\n-->\n`;
await writeFile('dashboard.html', html);
console.log(`Built dashboard.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB); no runtime modules or CDN dependencies.`);
