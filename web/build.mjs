// Builds the app into one self-contained HTML file.
//   node build.mjs            -> dist/index.html and copies it into the Android project
//   node build.mjs --preview  -> dist/preview.html (browser preview that opens with sample data)
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes('--preview');
const outdir = path.join(root, 'dist', preview ? 'preview-build' : 'build');
rmSync(outdir, { recursive: true, force: true });

const nodePaths = [path.join(root, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  bundle: true,
  outdir,
  format: 'iife',
  target: ['chrome85', 'safari15'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  loader: { '.ttf': 'binary', '.woff': 'dataurl' },
  define: { __PREVIEW__: preview ? 'true' : 'false', 'process.env.NODE_ENV': '"production"' },
  nodePaths,
  logLevel: 'warning',
});

const js = readFileSync(path.join(outdir, 'main.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(path.join(outdir, 'main.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const title = 'Hisaab Billing';
mkdirSync(path.join(root, 'dist'), { recursive: true });

if (preview) {
  // Artifact page: the host adds the doctype, head and body.
  const html = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
  writeFileSync(path.join(root, 'dist', 'preview.html'), html);
  console.log('Wrote dist/preview.html', Math.round(html.length / 1024), 'KB');
} else {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
  const out = path.join(root, 'dist', 'index.html');
  writeFileSync(out, html);
  const assets = path.join(root, '..', 'android', 'app', 'src', 'main', 'assets', 'www');
  if (existsSync(path.join(root, '..', 'android'))) {
    mkdirSync(assets, { recursive: true });
    copyFileSync(out, path.join(assets, 'index.html'));
    console.log('Copied into android/app/src/main/assets/www/index.html');
  }
  console.log('Wrote dist/index.html', Math.round(html.length / 1024), 'KB');
}
rmSync(outdir, { recursive: true, force: true });
