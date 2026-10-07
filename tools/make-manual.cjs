// Genera manual/Manual-Green-Place.pdf a partir de tools/manual.html y las capturas de preview/.
// Uso: NODE_PATH=$(npm root -g) node tools/make-manual.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const src = path.join(__dirname, 'manual.html');
  const out = path.join(__dirname, '..', 'manual', 'Manual-Green-Place.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + src);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#717970;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial"><span>Green Place · Manual de uso</span><span class="pageNumber"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
  await browser.close();
  console.log('PDF:', out);
})();
