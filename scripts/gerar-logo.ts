// ============================================================
//  LOGO PADRÃO DO CANAL — npm run logo
//  Renderiza scripts/logo/logo.html em PNG transparente (Chrome headless do Remotion)
//  → public/brand/padrao/{logo,icone}.png. Os ativos (public/brand/*.png) só mudam
//  se você passar --ativar; normalmente a troca é feita pelo painel ("Marca do canal").
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = path.join(ROOT, 'node_modules', '.remotion', 'chrome-headless-shell', 'win64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
if (!fs.existsSync(chrome)) {
  console.error('Chrome do Remotion não encontrado. Rode um render uma vez (npm run render:exemplo) para ele ser baixado.');
  process.exit(1);
}
const page = pathToFileURL(path.join(ROOT, 'scripts', 'logo', 'logo.html')).href;
const out = path.join(ROOT, 'public', 'brand', 'padrao');
fs.mkdirSync(out, {recursive: true});

const shot = (modo: string, size: string, file: string) => {
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--virtual-time-budget=5000', `--window-size=${size}`, `--screenshot=${path.join(out, file)}`, `${page}?modo=${modo}`], {stdio: 'ignore'});
  console.log(`✓ ${path.relative(ROOT, path.join(out, file))}`);
};
shot('logo', '1500,330', 'logo.png');
shot('icone', '560,560', 'icone.png');

if (process.argv.includes('--ativar')) {
  for (const f of ['logo.png', 'icone.png']) fs.copyFileSync(path.join(out, f), path.join(ROOT, 'public', 'brand', f));
  console.log('✓ ativados em public/brand/');
}
