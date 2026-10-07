// Genera los iconos PNG de la app a partir de tools/icon.svg.
// Uso: NODE_PATH=$(npm root -g) node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const out = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (size, file, { pad = 0 } = {}) => {
    await page.setViewportSize({ width: size, height: size });
    const inner = size - pad * 2;
    const s = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `);
    // El icono «maskable» lleva margen: Android lo recorta en círculo o en la forma del lanzador.
    await page.setContent(`<html><body style="margin:0;background:#1f7a3f"><div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box">${s}</div></body></html>`);
    await page.screenshot({ path: path.join(out, file) });
  };
  await shot(192, 'icon-192.png');
  await shot(512, 'icon-512.png');
  await shot(512, 'icon-maskable-512.png', { pad: 64 });
  await browser.close();
  console.log('Iconos generados en', out);
})();
