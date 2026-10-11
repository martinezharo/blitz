// Renders the PNG icons the web app manifest and iOS need from public/logo.svg.
// Run `node scripts/build-icons.ts` after changing the logo; the PNGs are
// committed. Needs Chromium (CHROMIUM=/path/to/chromium if it is not on PATH).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'public/icons');
const chromium = process.env.CHROMIUM ?? 'chromium';

const logo = readFileSync(join(root, 'public/logo.svg'), 'utf8');
// Maskable and iOS icons are full-bleed squares: the OS applies its own corners,
// and the bolt already sits inside the maskable safe zone.
const square = logo.replace(/<path fill="#e84b1b"[^>]*\/>/, '<rect width="512" height="512" fill="#e84b1b"/>');
if (square === logo) throw new Error('public/logo.svg no longer has the accent tile path this script swaps out.');

const icons = [
  { file: 'icon-192.png', size: 192, svg: logo },
  { file: 'icon-512.png', size: 512, svg: logo },
  { file: 'icon-maskable-512.png', size: 512, svg: square },
  { file: 'apple-touch-icon.png', size: 180, svg: square },
  { file: 'favicon-32.png', size: 32, svg: logo },
];

const work = mkdtempSync(join(tmpdir(), 'blitz-icons-'));
mkdirSync(out, { recursive: true });
try {
  for (const { file, size, svg } of icons) {
    const source = join(work, `${file}.svg`);
    const page = join(work, `${file}.html`);
    writeFileSync(source, svg);
    writeFileSync(page, `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${file}.svg" width="${size}" height="${size}">`);
    execFileSync(
      chromium,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--window-size=${size},${size}`,
        `--screenshot=${join(out, file)}`,
        `file://${page}`,
      ],
      { stdio: 'ignore' },
    );
    console.log(`public/icons/${file}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
