// Genera capturas de la app con datos de ejemplo (vista previa y manual).
// Uso: npx http-server -p 8080 -c-1 . &  →  NODE_PATH=$(npm root -g) node tools/screenshots.cjs
// DARK=1 genera las capturas en modo oscuro.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.APP_URL || 'http://localhost:8080/';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'preview');
const DARK = process.env.DARK === '1';
const NOW = process.env.FAKE_NOW || '2026-10-07T18:30:00';

/** Datos de ejemplo: un puesto con confituras, productos de primera necesidad y aseo. */
async function seed(page) {
  await page.evaluate(async () => {
    const S = await import('/js/store.js');
    const st = S.state;
    let seedN = 7;
    const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
    const t = S.today();
    const start = S.addDays(t, -40);
    const tsOf = (date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
    Object.assign(st.settings, { owner: 'Krys', onboarded: true, seenVersion: S.APP_VERSION, lastBackup: S.addDays(t, -3), rateSkipDate: null });

    // Cambio del dólar subiendo poco a poco.
    const rates = [[-40, 390], [-33, 395], [-26, 400], [-19, 405], [-12, 415], [-6, 425], [-2, 430]];
    for (const [d, v] of rates) st.rates.push({ id: S.uid(), ts: tsOf(S.addDays(t, d), 8, 5), date: S.addDays(t, d), value: v });

    const P = [
      ['Galletas Oreo', 'Confituras', 'u', 0.9, 60, 1.3], ['Caramelos (bolsa)', 'Confituras', 'u', 1.2, 30, 1.3], ['Chocolate Nestlé', 'Confituras', 'u', 1.5, 40, 1.3],
      ['Chupa Chups', 'Confituras', 'u', 0.15, 300, 1.35], ['Papitas Pringles', 'Confituras', 'u', 2.2, 24, 1.3], ['Galletas María', 'Confituras', 'u', 0.7, 50, 1.3],
      ['Refresco de lata', 'Bebidas', 'u', 0.6, 120, 1.3], ['Malta Guajira', 'Bebidas', 'u', 0.8, 72, 1.3], ['Jugo de cajita', 'Bebidas', 'u', 0.5, 80, 1.3],
      ['Arroz 1 kg', 'Primera necesidad', 'paquete', 1.4, 60, 1.3], ['Aceite 1 L', 'Primera necesidad', 'botella', 2.8, 40, 1.3], ['Azúcar 1 kg', 'Primera necesidad', 'paquete', 1.3, 50, 1.3],
      ['Frijoles negros 1 kg', 'Primera necesidad', 'paquete', 2.0, 30, 1.3], ['Espaguetis 500 g', 'Primera necesidad', 'paquete', 0.9, 60, 1.3], ['Leche en polvo 1 kg', 'Primera necesidad', 'paquete', 7.5, 12, 1.08],
      ['Huevos (cartón de 30)', 'Primera necesidad', 'caja', 9, 10, 1.06], ['Café 250 g', 'Primera necesidad', 'paquete', 3.2, 20, 1.3], ['Pasta de tomate', 'Primera necesidad', 'u', 0.9, 40, 1.3],
      ['Jabón de baño', 'Aseo', 'u', 0.6, 48, 1.3], ['Detergente 1 kg', 'Aseo', 'paquete', 2.5, 20, 1.3], ['Pasta dental', 'Aseo', 'u', 1.2, 30, 1.3], ['Papel higiénico (4 rollos)', 'Aseo', 'paquete', 2.0, 24, 1.3],
    ];
    const ids = {};
    for (const [name, cat, unit, cost, qty, mk] of P) {
      const p = S.addProduct({ name, cat, unit, costUsd: cost, price: Math.ceil((cost * 390 * mk) / 10) * 10 });
      p.created = tsOf(start, 9);
      p.priceLog[0].ts = tsOf(start, 9);
      p.priceLog[0].date = start;
      ids[name] = p.id;
      st.adjustments.push({ id: S.uid(), ts: tsOf(start, 9), date: start, pid: p.id, qty, kind: 'inicial', costUsd: cost, rate: 390, note: 'Stock inicial' });
    }
    st.cash.push({ id: S.uid(), ts: tsOf(start, 9), date: start, account: 'caja', amount: 3000, type: 'inicial', note: 'Efectivo al empezar a usar la app' });

    const buy = (date, list, paidFrom = 'aparte', supplier = '') => {
      const rate = S.rateOn(date);
      const pu = { id: S.uid(), ts: tsOf(date, 10), date, rate, currency: 'USD', paidFrom, supplier, note: '', items: list.map(([n, q, c]) => ({ pid: ids[n], qty: q, costUsd: c })) };
      Object.assign(pu, S.purchaseTotals(pu));
      st.purchases.push(pu);
    };
    // Reposiciones semanales.
    buy(S.addDays(t, -30), [['Refresco de lata', 48, 0.6], ['Galletas Oreo', 40, 0.9], ['Chupa Chups', 100, 0.15], ['Arroz 1 kg', 30, 1.4]], 'aparte', 'Mipyme La Esquina');
    buy(S.addDays(t, -23), [['Aceite 1 L', 24, 2.9], ['Espaguetis 500 g', 40, 0.9], ['Malta Guajira', 48, 0.8], ['Jugo de cajita', 40, 0.5]], 'aparte', 'Mipyme La Esquina');
    buy(S.addDays(t, -16), [['Chupa Chups', 200, 0.15], ['Refresco de lata', 48, 0.6], ['Galletas María', 30, 0.7], ['Azúcar 1 kg', 30, 1.3], ['Jabón de baño', 24, 0.6]], 'caja', 'Almacén de Mario');
    buy(S.addDays(t, -9), [['Arroz 1 kg', 40, 1.5], ['Chocolate Nestlé', 24, 1.5], ['Café 250 g', 12, 3.3], ['Papitas Pringles', 12, 2.2]], 'aparte', 'Mipyme La Esquina');
    buy(S.addDays(t, -3), [['Refresco de lata', 48, 0.65], ['Galletas Oreo', 30, 0.95], ['Huevos (cartón de 30)', 6, 9], ['Frijoles negros 1 kg', 20, 2.0]], 'aparte', 'Mipyme La Esquina');

    // Gastos.
    const exp = (dd, cat, amount, paidFrom = 'caja', note = '', currency = 'CUP') => st.expenses.push({ id: S.uid(), ts: tsOf(S.addDays(t, dd), 12), date: S.addDays(t, dd), cat, amount, currency, rate: S.rateOn(S.addDays(t, dd)), amountCup: currency === 'USD' ? amount * S.rateOn(S.addDays(t, dd)) : amount, paidFrom, note });
    exp(-30, 'Mensajería', 500, 'caja', 'Traer la mercancía de la mipyme');
    exp(-23, 'Mensajería', 500, 'caja', 'Traer la mercancía');
    exp(-20, 'Impuestos', 1200, 'banco', 'ONAT mensual');
    exp(-16, 'Transporte', 300, 'caja', 'Almendrón al almacén');
    exp(-12, 'Bolsas y envases', 250, 'caja', 'Paquete de jabas');
    exp(-9, 'Mensajería', 600, 'caja', 'Traer la mercancía');
    exp(-5, 'Electricidad y agua', 900, 'caja', 'Parte de la corriente del mes');
    exp(-3, 'Mensajería', 600, 'caja', 'Traer la mercancía');
    exp(-1, 'Imprevistos', 5, 'aparte', 'Candado nuevo para la vitrina', 'USD');
    exp(0, 'Mensajería', 350, 'caja', 'Mensajero que trajo los huevos');
    // Mermas.
    st.adjustments.push({ id: S.uid(), ts: tsOf(S.addDays(t, -8), 18), date: S.addDays(t, -8), pid: ids['Galletas María'], qty: -3, kind: 'merma', costUsd: 0.7, rate: 415, note: 'Vencidas' });
    st.adjustments.push({ id: S.uid(), ts: tsOf(S.addDays(t, -4), 18), date: S.addDays(t, -4), pid: ids['Jugo de cajita'], qty: -2, kind: 'merma', costUsd: 0.5, rate: 425, note: 'Se rompieron' });

    // Ventas diarias: más los fines de semana.
    const weights = { 'Refresco de lata': 6, 'Chupa Chups': 6, 'Galletas Oreo': 4, 'Malta Guajira': 3, 'Jugo de cajita': 3, 'Arroz 1 kg': 3, 'Espaguetis 500 g': 2, 'Azúcar 1 kg': 2, 'Galletas María': 2, 'Aceite 1 L': 1.5, 'Chocolate Nestlé': 1.5, 'Caramelos (bolsa)': 1, 'Jabón de baño': 1.5, 'Pasta de tomate': 1, 'Frijoles negros 1 kg': 1, 'Café 250 g': 1, 'Papitas Pringles': 0.6, 'Detergente 1 kg': 0.6, 'Pasta dental': 0.6, 'Papel higiénico (4 rollos)': 0.6, 'Huevos (cartón de 30)': 0.4, 'Leche en polvo 1 kg': 0.3 };
    const names = Object.keys(weights);
    const total = names.reduce((a, n) => a + weights[n], 0);
    const pick = () => { let r = rnd() * total; for (const n of names) { r -= weights[n]; if (r <= 0) return n; } return names[0]; };
    for (let d = start; d <= t; d = S.addDays(d, 1)) {
      const dow = S.parseDate(d).getDay();
      const n = d === t ? 9 : Math.round((dow === 0 || dow === 6 ? 14 : 8) + rnd() * 5);
      for (let i = 0; i < n; i++) {
        const k = 1 + Math.floor(rnd() * 2.4);
        const items = [];
        for (let j = 0; j < k; j++) {
          const name = pick();
          if (items.some((x) => x.n === name)) continue;
          items.push({ n: name, q: name === 'Chupa Chups' ? 1 + Math.floor(rnd() * 4) : name === 'Refresco de lata' ? 1 + Math.floor(rnd() * 3) : 1 });
        }
        const h = d === t ? 9 + Math.floor((i / n) * 9) : 9 + Math.floor(rnd() * 10);
        const ts = tsOf(d, h, Math.floor(rnd() * 59));
        const rate = S.rateOn(d);
        const s = {
          id: S.uid(), ts, date: d, rate, pay: rnd() < 0.18 ? 'transferencia' : 'efectivo', cash: 0, note: '', void: false,
          items: items.map((x) => { const p = S.product(ids[x.n]); return { pid: p.id, qty: x.q, price: p.price, costUsd: p.costUsd }; }),
        };
        st.sales.push(s);
      }
      // Subidas de precio puntuales tras subir el dólar.
      if (d === S.addDays(t, -12)) for (const n of ['Refresco de lata', 'Malta Guajira', 'Galletas Oreo', 'Arroz 1 kg', 'Aceite 1 L']) { const p = S.product(ids[n]); const np = Math.ceil((p.costUsd * 415 * 1.3) / 10) * 10; p.price = np; p.priceLog.push({ ts: tsOf(d, 8, 30), date: d, price: np, rate: 415 }); }
      // Retiros de la caja: dólares para comprar mercancía o dinero para la casa.
      const dow2 = S.parseDate(d).getDay();
      if (d < t && (dow2 === 0 || dow2 === 3)) {
        const bal = S.balance('caja', d);
        if (bal > 7000) st.cash.push({ id: S.uid(), ts: tsOf(d, 20), date: d, account: 'caja', amount: -Math.round((bal - 4500 - rnd() * 1500) / 100) * 100, type: 'retiro', note: dow2 === 0 ? 'Compré USD para mercancía' : 'Guardado para la casa' });
        const bb = S.balance('banco', d);
        if (dow2 === 0 && bb > 9000) st.cash.push({ id: S.uid(), ts: tsOf(d, 20, 5), date: d, account: 'banco', amount: -Math.round((bb - 2000) / 100) * 100, type: 'retiro', note: 'Pagué dólares por transferencia' });
      }
      if (d === S.addDays(t, -2)) for (const n of ['Refresco de lata', 'Chupa Chups', 'Galletas Oreo']) { const p = S.product(ids[n]); const np = Math.ceil((p.costUsd * 430 * 1.3) / 10) * 10; p.price = np; p.priceLog.push({ ts: tsOf(d, 8, 30), date: d, price: np, rate: 430 }); }
    }
    for (const p of st.products) S.recomputeCost(p.id);

    // Cierres de días anteriores.
    for (let dd = -6; dd <= -1; dd++) {
      const date = S.addDays(t, dd);
      const exp0 = S.closureData(date).expected;
      const diff = dd === -4 ? -40 : dd === -2 ? 20 : 0;
      const rec = S.saveClosure(date, exp0 + diff, dd === -4 ? 'Le di vuelto de más a alguien' : '', '');
      rec.ts = tsOf(date, 20, 15);
    }
    const neg = Object.entries(S.stockMap()).filter(([, q]) => q < 0).map(([id, q]) => `${S.productName(id)} ${q}`);
    if (neg.length) console.error('Stock negativo en los datos de ejemplo: ' + neg.join(', '));
    // El cambio de hoy se pide al abrir: sin anotar todavía.
    await S.save();
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--lang=es-ES'] });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: DARK ? 'dark' : 'light', locale: 'es-ES', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  // Barra de estado y barra de gestos de Android dibujadas encima.
  const decorate = async () => {
    await page.addStyleTag({
      content: `
      :root{--safe-t:28px;--safe-b:16px;}
      #sb{position:fixed;top:0;left:0;right:0;height:28px;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:0 18px 0 22px;font:500 13px Roboto,sans-serif;color:var(--on-surface);pointer-events:none}
      #sb .r{display:flex;gap:6px;align-items:center}
      #sb svg{width:15px;height:15px;fill:currentColor}
      #gb{position:fixed;left:50%;bottom:5px;width:108px;height:4px;margin-left:-54px;border-radius:2px;background:var(--on-surface);opacity:.55;z-index:999;pointer-events:none}`,
    });
    await page.evaluate(() => {
      const sb = document.createElement('div');
      sb.id = 'sb';
      sb.innerHTML = '<span>18:30</span><span class="r"><svg viewBox="0 0 24 24"><path d="M12 21 1 9.5a15.6 15.6 0 0 1 22 0z"/></svg><svg viewBox="0 0 24 24"><path d="M2 22h20V2z"/></svg><svg viewBox="0 0 24 24"><path d="M8 3h8v2h2v17H6V5h2z"/></svg></span>';
      document.body.appendChild(sb);
      const gb = document.createElement('div');
      gb.id = 'gb';
      document.body.appendChild(gb);
    });
    await page.evaluate(() => document.fonts.ready);
  };
  const shot = async (name, keepSnack = false) => {
    await page.waitForTimeout(450);
    if (!keepSnack) await page.evaluate(() => document.getElementById('snackbar')?.classList.remove('show'));
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('✓', name);
  };
  const top = (sel) => page.locator('.page-wrap.open').last().locator(sel).first();
  const dlgBtn = (i) => page.click(`.dialog-ov.open .dialog-btns button[data-i="${i}"]`);
  const back = async () => {
    await page.goBack();
    await page.waitForTimeout(380);
  };
  const tab = async (t) => {
    await page.click(`.navbar [data-tab="${t}"]`);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  const scrollPage = (y) => page.evaluate((yy) => { const b = [...document.querySelectorAll('.page-wrap.open .page-body')].pop(); b.scrollTop = yy; }, y);
  const pid = (name) => page.evaluate(async (n) => (await import('/js/store.js')).findProductByName(n).id, name);

  // 0. Bienvenida
  await page.goto(URL);
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('green-place'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.reload();
  await decorate();
  if (!DARK) {
    await top('[data-bind="owner"]').fill('Krys');
    await top('[data-bind="rate"]').fill('450');
    await shot('00-bienvenida');
  }

  // Datos de ejemplo
  await seed(page);
  await page.reload();
  await decorate();

  if (DARK) {
    await dlgBtn(0);
    await shot('30-inicio-oscuro');
    await tab('vender');
    for (const n of ['Refresco de lata', 'Refresco de lata', 'Galletas Oreo']) await page.click(`.pos [data-act="add"][data-id="${await pid(n)}"] >> nth=0`);
    await shot('31-vender-oscuro');
    await tab('informes');
    await shot('32-informes-oscuro');
  } else {
    // 1. El cambio de hoy (se pide al abrir)
    await page.fill('.dialog-ov.open input', '450');
    await shot('03-cambio-del-dia');
    await dlgBtn(1);
    await page.waitForTimeout(500);
    await shot('13-aviso-perdida');
    await dlgBtn(0);
    await page.waitForTimeout(400);
    await shot('01-inicio');
    await page.evaluate(() => window.scrollTo(0, 640));
    await shot('02-inicio-abajo');
    await page.evaluate(() => window.scrollTo(0, 0));

    // 2. Vender
    await tab('vender');
    await shot('04-vender');
    for (const n of ['Refresco de lata', 'Refresco de lata', 'Galletas Oreo', 'Arroz 1 kg']) await page.click(`.pos [data-act="add"][data-id="${await pid(n)}"] >> nth=0`);
    await shot('05-carrito');
    await page.click('[data-act="checkout"]');
    await page.waitForTimeout(400);
    await top('[data-bind="received"]').fill('2000');
    await shot('06-cobrar');
    await page.locator('.page-wrap.open .page-foot [data-act="confirm"]').click();
    await page.waitForTimeout(700);
    await shot('07-venta-registrada', true);
    await page.click('.topbar [data-act="history"]');
    await page.waitForTimeout(400);
    await shot('08-historial');
    await top('[data-act="sale"]').click();
    await page.waitForTimeout(400);
    await shot('09-venta-detalle');
    await back();
    await back();

    // 3. Productos
    await tab('productos');
    await shot('10-productos');
    await page.click(`#prod-list [data-act="product"][data-id="${await pid('Huevos (cartón de 30)')}"]`);
    await page.waitForTimeout(400);
    await shot('11-producto-perdida');
    await top('[data-act="price"]').click();
    await page.waitForTimeout(400);
    await shot('12-cambiar-precio');
    await dlgBtn(0);
    await page.waitForTimeout(300);
    await scrollPage(520);
    await shot('15-producto-historial');
    await back();
    await page.click('.fab');
    await page.waitForTimeout(400);
    await shot('16-anadir-menu');
    await page.click('.bs-ov.open .bs-item[data-i="0"]');
    await page.waitForTimeout(400);
    await top('[data-bind="name"]').fill('Mayonesa 400 g');
    await top('[data-act="chip"][data-name="cat"][data-v="Primera necesidad"]').click();
    await top('[data-act="chip"][data-name="unit"][data-v="u"]').click();
    await top('[data-bind="cost"]').fill('2.10');
    await top('[data-bind="stock"]').fill('12');
    await top('[data-bind="minStock"]').fill('3');
    await shot('17-producto-nuevo');
    await back();
    // Compra
    await page.click('.topbar [data-act="prodMenu"]');
    await page.waitForTimeout(400);
    await page.click('.bs-ov.open .bs-item[data-i="0"]');
    await page.waitForTimeout(400);
    await top('[data-act="addItem"]').click();
    await page.waitForTimeout(400);
    await top('[data-search]').fill('refresco');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(400);
    await top('[data-bind="items.0.qty"]').fill('48');
    await top('[data-bind="items.0.cost"]').fill('0.70');
    await top('[data-act="addItem"]').click();
    await page.waitForTimeout(400);
    await top('[data-search]').fill('leche');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(400);
    await top('[data-bind="items.1.qty"]').fill('6');
    await top('[data-bind="items.1.cost"]').fill('7.80');
    await top('[data-bind="supplier"]').fill('Mipyme La Esquina');
    await scrollPage(0);
    await shot('18-compra');
    await scrollPage(480);
    await shot('19-compra-abajo');
    await back();
    // Revisar precios
    await page.click('.topbar [data-act="prodMenu"]');
    await page.waitForTimeout(400);
    await page.click('.bs-ov.open .bs-item[data-i="1"]');
    await page.waitForTimeout(400);
    await shot('14-revisar-precios');
    await back();
    // Merma
    await page.click(`#prod-list [data-act="product"][data-id="${await pid('Galletas María')}"]`);
    await page.waitForTimeout(400);
    await page.locator('.page-wrap.open').last().locator('[data-act="__menu"]').click();
    await page.waitForTimeout(400);
    await shot('20-menu-producto');
    await back();
    await top('[data-act="loss"]').click();
    await page.waitForTimeout(400);
    await shot('21a-merma-menu');
    await page.click('.bs-ov.open .bs-item[data-i="0"]');
    await page.waitForTimeout(400);
    await page.fill('.dialog-ov.open input', '2');
    await shot('21-merma');
    await dlgBtn(0);
    await page.waitForTimeout(300);
    await back();

    // 4. Gastos y compras
    await tab('gastos');
    await shot('22-gastos');
    await page.click('.fab');
    await page.waitForTimeout(400);
    await top('[data-act="chip"][data-name="cat"][data-v="Transporte"]').click();
    await top('[data-bind="amount"]').fill('400');
    await top('[data-bind="note"]').fill('Almendrón para buscar mercancía');
    await shot('23-gasto-nuevo');
    await top('[data-act="save"]').click();
    await page.waitForTimeout(600);
    await page.click('[data-act="seg"][data-name="gastosMode"][data-v="compras"]');
    await shot('24-compras');

    // 5. Informes
    await tab('informes');
    await shot('25-informes-semana');
    await page.click('.chart .hit >> nth=1');
    await page.evaluate(() => window.scrollTo(0, 330));
    await shot('26-informes-grafico');
    await page.click('[data-act="seg"][data-name="kind"][data-v="mes"]');
    await page.evaluate(() => window.scrollTo(0, 820));
    await shot('27-informes-mes');
    await page.click('[data-act="seg"][data-name="kind"][data-v="dia"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('28-informes-dia');

    // 6. Dinero y cierre
    await tab('inicio');
    await page.click('[data-act="cash"]');
    await page.waitForTimeout(400);
    await shot('29-dinero');
    await back();
    await page.click('.btn[data-act="closure"]');
    await page.waitForTimeout(500);
    await shot('33-cierre');
    await scrollPage(760);
    const expected = await page.evaluate(async () => { const S = await import('/js/store.js'); return S.closureData(S.today()).expected; });
    await top('[data-bind="counted"]').fill(String(Math.round(expected / 10) * 10 - 50));
    await page.waitForTimeout(200);
    await shot('34-cierre-caja');
    await page.locator('.page-wrap.open .page-foot [data-act="save"]').click();
    await page.waitForTimeout(600);
    await shot('35-cierre-resultado');
    await dlgBtn(0);
    await page.waitForTimeout(300);
    const text = await page.evaluate(async () => {
      const S = await import('/js/store.js');
      return S.state.closures.find((c) => c.date === S.today()).text;
    });
    fs.writeFileSync(path.join(OUT, 'cierre-ejemplo.txt'), text);
    await back();

    // 7. Ajustes, contar inventario e instalar
    await page.click('.topbar [data-act="settings"]');
    await page.waitForTimeout(400);
    await shot('36-ajustes');
    await top('[data-act="rateHist"]').click();
    await page.waitForTimeout(400);
    await shot('37-historial-cambio');
    await back();
    await top('[data-act="count"]').click();
    await page.waitForTimeout(400);
    await page.locator('.page-wrap.open').last().locator(`[data-c="${await pid('Chupa Chups')}"]`).fill('150');
    await shot('38-contar-inventario');
    await back();
    await top('[data-act="install"]').click();
    await page.waitForTimeout(400);
    await shot('39-instalar');
    await dlgBtn(0);
    await back();
  }

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores de consola');
  await browser.close();
})();
