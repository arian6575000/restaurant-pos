// Generates the app icons (a sewing button on a blue→violet gradient) so no binary assets need to live in git.
// Replace assets/*.png with your own artwork any time; this script only runs in CI when files are missing.
import fs from 'node:fs';
import sharp from 'sharp';

fs.mkdirSync('assets', { recursive: true });
const S = 1024;
const defs = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3E6BFF"/><stop offset="1" stop-color="#7A5CFA"/></linearGradient></defs>';
const holes = (c, cx = 512, cy = 512, d = 62) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => `<circle cx="${cx + x * d}" cy="${cy + y * d}" r="26" fill="${c}"/>`).join('');
const button = (fill, holeFill, r = 250) => `<circle cx="512" cy="512" r="${r}" fill="${fill}"/><circle cx="512" cy="512" r="${r - 36}" fill="none" stroke="${holeFill}" stroke-width="10" opacity="0.35"/>${holes(holeFill)}`;
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}${body}</svg>`);
const out = (name, body, size = S) => sharp(svg(body)).resize(size, size).png().toFile(`assets/${name}`);

const jobs = {
  'icon.png': `<rect width="${S}" height="${S}" fill="url(#g)"/>${button('#fff', '#5A5FF0')}`,
  'splash-icon.png': `${button('url(#g)', '#fff', 300)}`,
  'android-icon-foreground.png': `${button('#fff', '#5A5FF0', 230)}`,
  'android-icon-background.png': `<rect width="${S}" height="${S}" fill="url(#g)"/>`,
  'android-icon-monochrome.png': `<circle cx="512" cy="512" r="230" fill="#000"/>${holes('#fff')}`,
};
for (const [n, b] of Object.entries(jobs)) if (!fs.existsSync(`assets/${n}`)) await out(n, b);
if (!fs.existsSync('assets/favicon.png')) await out('favicon.png', jobs['icon.png'], 48);
console.log('icons ready');
