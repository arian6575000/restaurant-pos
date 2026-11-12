// Generates the Restaurant POS icon set: a serving cloche whose steam is three rising signal arcs
// (restaurant + linked devices). Run: node scripts/make-icons.mjs  (needs `sharp`, e.g. npm i --no-save sharp)
import fs from 'node:fs';
import sharp from 'sharp';

fs.mkdirSync('assets', { recursive: true });
const S = 1024;
const defs = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9A4D"/><stop offset="0.55" stop-color="#F25C1F"/><stop offset="1" stop-color="#D23A10"/></linearGradient></defs>';

/** The mark. `c` = fill/stroke colour; `scale` shrinks it around the canvas centre. */
const arc = (r, c) => {
  const a = (d) => [512 + r * Math.cos((d * Math.PI) / 180), 452 + r * Math.sin((d * Math.PI) / 180)];
  const [x1, y1] = a(-140), [x2, y2] = a(-40);
  return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round"/>`;
};
const mark = (c, scale = 1) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
  ${arc(84, c)}${arc(136, c)}${arc(188, c)}
  <circle cx="512" cy="452" r="27" fill="${c}"/>
  <path d="M 292 690 A 220 220 0 0 1 732 690 Z" fill="${c}"/>
  <rect x="252" y="712" width="520" height="30" rx="15" fill="${c}"/>
</g>`;

const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}${body}</svg>`);
const out = (name, body, size = S) => sharp(svg(body)).resize(size, size).png().toFile(`assets/${name}`);

const jobs = {
  'icon.png': `<rect width="${S}" height="${S}" fill="url(#g)"/>${mark('#fff', 1.08)}`,
  'splash-icon.png': `<rect x="112" y="112" width="800" height="800" rx="200" fill="url(#g)"/>${mark('#fff', 0.82)}`,
  'android-icon-foreground.png': mark('#fff', 0.92),
  'android-icon-background.png': `<rect width="${S}" height="${S}" fill="url(#g)"/>`,
  'android-icon-monochrome.png': mark('#000', 0.92),
};
for (const [n, b] of Object.entries(jobs)) await out(n, b);
await out('favicon.png', jobs['icon.png'], 48);
console.log('icons ready');
