// Pantallas principales (pestañas), navegación y arranque.
import { icon } from './icons.js';
import {
  state, init, today, fmtDate, fmtDateLong, fmtTime, cup, usd, pct, num, qtyStr, norm, parseDate, addDays,
  currentRate, lastRate, rateSetToday, activeProducts, stockMap, lowLimit, lossProducts, lowStockProducts, minPrice, priceStatus,
  inventoryValue, activeSales, stats, buckets, periodRange, balance, expenseCup, categories, APP_VERSION, itemsSummary, qtyUnit, revenueBetween, closureOutdated,
} from './store.js';
import { $, esc, seg, chips, li, kv, secTitle, emptyState, menuSheet, histPush, histBack, onBackWithoutLayer, openLayers, snackbar } from './ui.js';
import { ctx, onRefresh, refresh } from './core.js';
import {
  rateDialog, priceReviewPage, productEditor, productSheet, purchaseEditor, purchaseDetail, countPage, statusBadges,
} from './products.js';
import { cartAdd, cartQty, cartTotal, cartUnits, checkoutPage, saleDetail, saleRow, salesHistoryPage, closurePage } from './sales.js';
import { expenseEditor, expenseRow, cashPage } from './money.js';
import { settingsPage, welcomePage, exportBackup, installApp, canInstall, onInstallChange } from './settings.js';

const TABS = [
  ['inicio', 'Inicio', 'home'],
  ['vender', 'Vender', 'cart'],
  ['productos', 'Productos', 'box'],
  ['gastos', 'Gastos', 'receipt'],
  ['informes', 'Informes', 'chart'],
];
const vs = {
  vender: { q: '', cat: '' },
  productos: { q: '', filter: 'todos' },
  gastos: { mode: 'gastos', month: today() },
  informes: { kind: 'semana', anchor: today(), tip: null, sort: 'revenue' },
};
const scrollPos = {};

/* ---------- piezas comunes ---------- */
function appbar(title, actions = '') {
  return `<header class="topbar"><h1>${esc(title)}</h1><div class="tb-actions">${actions}</div></header>`;
}
const tbBtn = (ic, act, label) => `<button class="icon-btn" data-act="${act}" aria-label="${esc(label)}">${icon(ic)}</button>`;
function rateChip() {
  const r = currentRate();
  return `<button class="rate-chip ${rateSetToday() ? '' : 'stale'}" data-act="rate" aria-label="Cambio del dólar">${icon('exchange')}<span>${r ? cup(r, false) : '—'}</span></button>`;
}

/* ---------- INICIO ---------- */
function viewInicio() {
  const S = state.settings;
  const d = today();
  const st = stats(d, d);
  const loss = lossProducts();
  const low = lowStockProducts();
  const r = lastRate();
  const closed = state.closures.find((c) => c.date === d);
  const recent = activeSales().filter((s) => s.date === d).sort((a, b) => b.ts - a.ts).slice(0, 5);
  const backupOld = !S.lastBackup || (parseDate(d) - parseDate(S.lastBackup)) / 864e5 >= 7;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const action = (ic, label, act, color) => `<button class="action" data-act="${act}"><span class="action-ic ${color}">${icon(ic)}</span><span>${label}</span></button>`;
  return `
    ${appbar(S.business || 'Green Place', rateChip() + tbBtn('gear', 'settings', 'Ajustes'))}
    <div class="greet"><b>${hello}${S.owner ? `, ${esc(S.owner)}` : ''}</b><span>${fmtDateLong(d)}</span></div>
    ${canInstall() ? `<button class="banner green" data-act="install">${icon('phone')}<span><b>Instala la app</b> en tu teléfono para abrirla desde un icono y usarla sin internet.</span>${icon('chevR')}</button>` : ''}
    <button class="card rate-card ${rateSetToday() ? '' : 'stale'}" data-act="rate">
      <span class="rc-ic">${icon('exchange')}</span>
      <span class="grow"><span class="rc-l">Cambio ${rateSetToday() ? 'de hoy' : '(no es de hoy)'}</span><span class="rc-v">1 USD = ${r ? cup(r.value) : '—'}</span>
      <span class="rc-s">${r ? `Anotado ${r.date === d ? 'hoy' : 'el ' + fmtDate(r.date)} a las ${fmtTime(r.ts)}` : 'Toca para anotarlo'}</span></span>
      <span class="btn tonal sm">Cambiar</span>
    </button>
    ${loss.length ? `<button class="banner red" data-act="review">${icon('warning')}<span><b>${loss.length} producto${loss.length === 1 ? '' : 's'} con pérdida</b> con el cambio actual: ${esc(loss.slice(0, 3).map((p) => p.name).join(', '))}${loss.length > 3 ? '…' : ''}. Toca para revisar los precios.</span>${icon('chevR')}</button>` : ''}
    ${low.length ? `<button class="banner amber" data-act="lowStock">${icon('box')}<span><b>Poco stock:</b> ${esc(low.slice(0, 4).map((p) => p.name).join(', '))}${low.length > 4 ? ` y ${low.length - 4} más` : ''}.</span>${icon('chevR')}</button>` : ''}
    <div class="actions">
      ${action('cart', 'Vender', 'goVender', 'green')}
      ${action('inbox', 'Compra', 'newPurchase', 'blue')}
      ${action('receipt', 'Gasto', 'newExpense', 'amber')}
      ${action('clipboard', 'Cierre', 'closure', 'purple')}
    </div>
    ${secTitle('Hoy', `${st.count} venta${st.count === 1 ? '' : 's'}`)}
    <div class="kpis">
      <div class="kpi"><span>Vendido</span><b>${cup(st.revenue)}</b></div>
      <div class="kpi"><span>Ganancia neta</span><b class="${st.net < 0 ? 'red-t' : ''}">${cup(st.net)}</b></div>
    </div>
    ${st.expenses || st.losses ? `<p class="hint">Ganancia de ventas ${cup(st.profit)}${st.expenses ? ` − gastos ${cup(st.expenses)}` : ''}${st.losses ? ` − mermas ${cup(st.losses)}` : ''}.</p>` : ''}
    <button class="card money-row" data-act="cash">
      <span class="mr"><span>${icon('cash')} Caja</span><b>${cup(balance('caja'))}</b></span>
      <span class="mr"><span>${icon('bank')} Transferencias</span><b>${cup(balance('banco'))}</b></span>
      ${icon('chevR', 'chev')}
    </button>
    ${closed && closureOutdated(d)
      ? `<button class="banner amber" data-act="closure">${icon('warning')}<span>Hubo ventas o gastos después del cierre de las ${fmtTime(closed.ts)}. Toca para rehacerlo.</span>${icon('chevR')}</button>`
      : closed
      ? `<button class="banner green" data-act="closure">${icon('checkCircle')}<span>Cierre de hoy hecho a las ${fmtTime(closed.ts)}${closed.diff ? ` · ${closed.diff > 0 ? 'sobraron' : 'faltaron'} ${cup(Math.abs(closed.diff))}` : ' · la caja cuadró'}.</span>${icon('chevR')}</button>`
      : `<button class="btn tonal block lg" data-act="closure">${icon('clipboard')} Hacer el cierre del día</button>`}
    ${secTitle('Últimas ventas de hoy', recent.length ? '<button class="text-btn" data-act="history">Ver todas</button>' : '')}
    <div class="list">${recent.length ? recent.map(saleRow).join('') : '<div class="empty-li">Todavía no hay ventas hoy.</div>'}</div>
    ${backupOld && state.sales.length ? `<button class="banner" data-act="backup">${icon('shield')}<span>${S.lastBackup ? `Última copia de seguridad: ${fmtDate(S.lastBackup)}.` : 'Aún no has hecho una copia de seguridad.'} Toca para hacerla.</span>${icon('chevR')}</button>` : ''}
    <div class="spacer"></div>`;
}

/* ---------- VENDER ---------- */
function venderList() {
  const { q, cat } = vs.vender;
  const n = norm(q);
  const st = stockMap();
  const list = activeProducts()
    .filter((p) => (!cat || p.cat === cat) && (!n || norm(p.name).includes(n)))
    .sort((a, b) => ((st[b.id] || 0) > 0) - ((st[a.id] || 0) > 0) || a.name.localeCompare(b.name, 'es'));
  if (!state.products.length) return emptyState('box', 'Primero añade los productos que vendes.', '<button class="btn filled" data-act="newProduct">Añadir producto</button>');
  if (!list.length) return '<div class="empty-li">Sin resultados</div>';
  return `<div class="list pos">${list.map((p) => {
    const q2 = cartQty(p.id);
    const stock = st[p.id] || 0;
    const loss = priceStatus(p) === 'loss';
    return `<div class="li pos-li ${q2 ? 'in-cart' : ''}">
      <button class="grow plain" data-act="add" data-id="${p.id}">
        <span class="t">${esc(p.name)}</span>
        <span class="s">${p.price ? `<b class="price">${cup(p.price)}</b>` : '<span class="amber-t">Sin precio</span>'} · ${stock > 0 ? `quedan ${qtyStr(stock)}` : '<span class="red-t">agotado</span>'}${loss ? ` · <span class="red-t">${icon('warning')}pérdida</span>` : ''}</span>
      </button>
      ${q2 ? `<div class="stepper sm"><button data-act="sub" data-id="${p.id}" aria-label="Quitar uno">${icon('minus')}</button><span>${qtyStr(q2)}</span><button data-act="add" data-id="${p.id}" aria-label="Añadir uno">${icon('plus')}</button></div>`
        : `<button class="add-btn" data-act="add" data-id="${p.id}" aria-label="Añadir">${icon('plus')}</button>`}
    </div>`;
  }).join('')}</div>`;
}

function viewVender() {
  const cats = categories().filter((c) => activeProducts().some((p) => p.cat === c));
  return `
    ${appbar('Vender', tbBtn('history', 'history', 'Historial de ventas'))}
    <div class="search sticky"><span>${icon('search')}</span><input type="search" data-input="venderQ" placeholder="Buscar producto" value="${esc(vs.vender.q)}"></div>
    ${cats.length > 1 ? chips('venderCat', [['', 'Todos'], ...cats.map((c) => [c, c])], vs.vender.cat) : ''}
    <div id="vender-list">${venderList()}</div>
    <div class="spacer cart-space"></div>`;
}

function cartBar() {
  if (ctx.tab !== 'vender' || !ctx.cart.length) return '';
  return `<div class="cartbar">
    <button class="icon-btn inv" data-act="clearCart" aria-label="Vaciar carrito">${icon('trash')}</button>
    <span class="grow"><span class="cb-n">${qtyStr(cartUnits())} artículo${cartUnits() === 1 ? '' : 's'}</span><b>${cup(cartTotal())}</b></span>
    <button class="btn on-primary" data-act="checkout">Cobrar ${icon('chevR')}</button>
  </div>`;
}

/* ---------- PRODUCTOS ---------- */
function productosList() {
  const { q, filter } = vs.productos;
  const n = norm(q);
  const st = stockMap();
  let list = (filter === 'ocultos' ? state.products.filter((p) => p.archived) : activeProducts()).filter((p) => !n || norm(`${p.name} ${p.cat}`).includes(n));
  if (filter === 'perdida') list = list.filter((p) => ['loss', 'low', 'noprice'].includes(priceStatus(p)));
  if (filter === 'poco') list = list.filter((p) => (st[p.id] || 0) <= lowLimit(p) && (st[p.id] || 0) > 0);
  if (filter === 'agotados') list = list.filter((p) => (st[p.id] || 0) <= 0);
  list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!state.products.length) {
    return emptyState('box', 'Añade los productos que tienes en el puesto: lo que te costaron en USD, cuántos tienes y el precio de venta.', '<button class="btn filled" data-act="newProduct">Añadir el primer producto</button>');
  }
  if (!list.length) return '<div class="empty-li">No hay productos en esta lista</div>';
  return `<div class="list">${list.map((p) => {
    const q2 = st[p.id] || 0;
    return `<button class="li prod-li" data-act="product" data-id="${p.id}">
      <span class="grow"><span class="t">${esc(p.name)}</span>
        <span class="s">${esc(qtyUnit(q2, p.unit))} · mín. ${num(p.costUsd) ? cup(minPrice(p)) : '—'}</span>
        <span class="badges">${statusBadges(p, q2)}</span></span>
      <span class="r"><b>${p.price ? cup(p.price) : '—'}</b></span>${icon('chevR', 'chev')}
    </button>`;
  }).join('')}</div>`;
}

function viewProductos() {
  const v = inventoryValue();
  const nLoss = activeProducts().filter((p) => ['loss', 'low', 'noprice'].includes(priceStatus(p))).length;
  return `
    ${appbar('Productos', tbBtn('more', 'prodMenu', 'Más opciones'))}
    ${state.products.length ? `<div class="card inv-card">
      <div><span>Productos</span><b>${activeProducts().length}</b><small>${qtyStr(v.units)} unidades</small></div>
      <div><span>Invertido (costo)</span><b>${usd(v.costUsd)}</b><small>≈ ${cup(v.costCup)}</small></div>
      <div><span>Valor de venta</span><b>${cup(v.sale)}</b><small>si vendes todo</small></div>
    </div>` : ''}
    <div class="search"><span>${icon('search')}</span><input type="search" data-input="prodQ" placeholder="Buscar producto" value="${esc(vs.productos.q)}"></div>
    ${chips('prodFilter', [['todos', 'Todos'], ['perdida', `Revisar precio${nLoss ? ` (${nLoss})` : ''}`], ['poco', 'Poco stock'], ['agotados', 'Agotados'], ['ocultos', 'Ocultos']], vs.productos.filter)}
    <div id="prod-list">${productosList()}</div>
    <div class="spacer"></div>
    <button class="fab extended" data-act="prodFab">${icon('plus')}<span>Nuevo</span></button>`;
}

/* ---------- GASTOS ---------- */
function viewGastos() {
  const g = vs.gastos;
  const pr = periodRange('mes', g.month);
  const inR = (x) => x.date >= pr.from && x.date <= pr.to;
  const isExp = g.mode === 'gastos';
  const list = isExp
    ? state.expenses.filter(inR).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts)
    : state.purchases.filter((p) => !p.void && inR(p)).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const total = isExp ? list.reduce((a, e) => a + expenseCup(e), 0) : list.reduce((a, p) => a + num(p.totalUsd), 0);
  const groups = new Map();
  for (const x of list) {
    if (!groups.has(x.date)) groups.set(x.date, []);
    groups.get(x.date).push(x);
  }
  const purchaseRow = (p) => li({ act: 'purchase', attrs: `data-id="${p.id}"`, ic: 'inbox', color: 'blue', title: esc(itemsSummary(p.items)), sub: `${p.supplier ? esc(p.supplier) + ' · ' : ''}${p.currency === 'CUP' ? 'pagado en CUP' : 'pagado en USD'} · ≈ ${cup(p.totalCup)}`, right: `<b>${usd(p.totalUsd)}</b>` });
  return `
    ${appbar('Gastos y compras')}
    <div class="pad-h">${seg('gastosMode', [['gastos', 'Gastos'], ['compras', 'Compras de mercancía']], g.mode)}</div>
    <div class="period-nav">
      <button class="icon-btn" data-act="month" data-d="prev" aria-label="Mes anterior">${icon('chevL')}</button>
      <div class="pn-l"><b>${pr.label}</b><span>${isExp ? `Gastos: ${cup(total)}` : `Compras: ${usd(total)}`}</span></div>
      <button class="icon-btn" data-act="month" data-d="next" aria-label="Mes siguiente" ${pr.to >= today() ? 'disabled' : ''}>${icon('chevR')}</button>
    </div>
    ${list.length ? [...groups.entries()].map(([date, arr]) => `${secTitle(fmtDateLong(date))}<div class="list">${arr.map(isExp ? expenseRow : purchaseRow).join('')}</div>`).join('')
      : emptyState(isExp ? 'receipt' : 'inbox', isExp ? 'No hay gastos este mes. Anota aquí mensajerías, transporte, impuestos o cualquier imprevisto.' : 'No hay compras este mes. Cuando compres mercancía regístrala para sumar el stock y calcular precios.')}
    ${isExp ? '' : '<p class="hint">Las compras no se restan de la ganancia: se convierten en mercancía. Su costo se descuenta cuando vendes cada producto.</p>'}
    <div class="spacer"></div>
    <button class="fab extended" data-act="${isExp ? 'newExpense' : 'newPurchase'}">${icon('plus')}<span>${isExp ? 'Nuevo gasto' : 'Registrar compra'}</span></button>`;
}

/* ---------- INFORMES ---------- */
const KIND_LABEL = { dia: 'día', semana: 'semana', mes: 'mes', ano: 'año' };

function niceStep(max) {
  if (max <= 0) return 1;
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}
const shortNum = (n) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** Columnas agrupadas: vendido y ganancia por día/mes, con un mismo eje. */
function chartSvg(bk) {
  const W = 360;
  const H = 190;
  const L = 34;
  const B = 22;
  const T = 8;
  const max = Math.max(0, ...bk.map((b) => Math.max(b.revenue, b.profit)));
  const min = Math.min(0, ...bk.map((b) => b.profit));
  const step = niceStep(Math.max(max, -min, 1));
  const top = Math.ceil(max / step) * step || step;
  const bot = min < 0 ? Math.floor(min / step) * step : 0;
  const y = (v) => T + ((top - v) / (top - bot)) * (H - T - B);
  const slot = (W - L) / bk.length;
  const bw = Math.max(2, Math.min(12, (slot - 4) / 2 - 1));
  const ticks = [];
  for (let v = bot; v <= top + 1e-9; v += step) ticks.push(v);
  const bar = (x, v, cls) => {
    if (!v) return '';
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.abs(y0 - y1);
    const r = Math.min(4, h, bw / 2);
    if (v > 0) return `<path class="${cls}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
    return `<path class="${cls}" d="M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 - r} V${y0} Z"/>`;
  };
  const every = Math.ceil(bk.length / 12);
  const tip = vs.informes.tip;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vendido y ganancia por ${KIND_LABEL[vs.informes.kind] === 'año' ? 'mes' : 'día'}">
    ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${shortNum(v)}</text>`).join('')}
    ${bk.map((b, i) => {
      const x = L + i * slot + (slot - (bw * 2 + 2)) / 2;
      return `<g>
        ${tip === i ? `<rect class="hl" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" rx="4"/>` : ''}
        ${bar(x, b.revenue, 's1')}${bar(x + bw + 2, b.profit, 's2')}
        ${i % every === 0 ? `<text class="axis" x="${L + i * slot + slot / 2}" y="${H - 7}" text-anchor="middle">${esc(b.label)}</text>` : ''}
        <rect class="hit" data-act="tip" data-i="${i}" x="${L + i * slot}" y="0" width="${slot}" height="${H}"/>
      </g>`;
    }).join('')}
    <line class="base" x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
  </svg>`;
}

function viewInformes() {
  const I = vs.informes;
  const pr = periodRange(I.kind, I.anchor);
  const st = stats(pr.from, pr.to);
  const bk = buckets(I.kind, pr.from, pr.to);
  const current = pr.from <= today() && pr.to >= today();
  // Comparación con el periodo anterior; si el actual no ha terminado, solo el mismo tramo de tiempo.
  const prevR = periodRange(I.kind, pr.prev);
  const now = new Date();
  const elapsed = current ? Math.round((parseDate(today()) - parseDate(pr.from)) / 864e5) : null;
  const prevTo = current ? addDays(prevR.from, elapsed) : prevR.to;
  const cutoff = current ? new Date(parseDate(prevTo).setHours(now.getHours(), now.getMinutes(), 59)).getTime() : null;
  const prevRev = revenueBetween(prevR.from, prevTo, cutoff);
  const PREV_LABEL = { dia: 'ayer', semana: 'la semana pasada', mes: 'el mes pasado', ano: 'el año pasado' };
  const change = (cur, old) => {
    if (!old) return '';
    const c = ((cur - old) / Math.abs(old)) * 100;
    return `<small class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'} ${pct(Math.abs(c))} vs. ${PREV_LABEL[I.kind]}${current ? ' a esta altura' : ''}</small>`;
  };
  const tip = I.tip !== null && bk[I.tip] ? bk[I.tip] : null;
  const top = [...st.products].sort((a, b) => b[I.sort] - a[I.sort]).slice(0, 10);
  const maxCat = Math.max(1, ...st.byCat.map((c) => c.v));
  const closures = state.closures.filter((c) => c.date >= pr.from && c.date <= pr.to).sort((a, b) => b.date.localeCompare(a.date));
  return `
    ${appbar('Informes')}
    <div class="pad-h">${seg('kind', [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['ano', 'Año']], I.kind)}</div>
    <div class="period-nav">
      <button class="icon-btn" data-act="period" data-d="prev" aria-label="Anterior">${icon('chevL')}</button>
      <label class="pn-l date-pick"><b>${esc(pr.label)}</b><span>${current ? { dia: 'Hoy', semana: 'Esta semana', mes: 'Este mes', ano: 'Este año' }[I.kind] : 'Toca para elegir fecha'}</span><input type="date" data-input="anchor" value="${I.anchor}"></label>
      <button class="icon-btn" data-act="period" data-d="next" aria-label="Siguiente" ${pr.to >= today() ? 'disabled' : ''}>${icon('chevR')}</button>
    </div>
    <div class="kpis">
      <div class="kpi hero-kpi ${st.net < 0 ? 'neg' : ''}"><span>Ganancia neta</span><b>${cup(st.net)}</b><small class="dim">≈ ${usd(st.netUsd)}</small></div>
      <div class="kpi"><span>Vendido</span><b>${cup(st.revenue)}</b>${change(st.revenue, prevRev)}</div>
      <div class="kpi"><span>Ventas</span><b>${st.count}</b><small class="dim">${qtyStr(st.units)} productos</small></div>
      <div class="kpi"><span>Gastos</span><b>${cup(st.expenses)}</b>${st.losses ? `<small class="dim">+ mermas ${cup(st.losses)}</small>` : ''}</div>
      <div class="kpi"><span>Ganancia media</span><b>${st.margin === null ? '—' : pct(st.margin)}</b><small class="dim">sobre el costo</small></div>
    </div>
    ${secTitle(I.kind === 'dia' ? 'Ventas por hora' : I.kind === 'ano' ? 'Por mes' : 'Por día')}
    <div class="card chart-card">
      <div class="legend"><span><i class="sw s1"></i>Vendido</span><span><i class="sw s2"></i>Ganancia</span></div>
      <div class="chart-tip">${tip ? `<b>${esc(I.kind === 'semana' || I.kind === 'mes' ? fmtDateLong(tip.from) : tip.label)}</b> · Vendido ${cup(tip.revenue)} · Ganancia ${cup(tip.profit)}` : '<span class="dim">Toca una columna para ver sus cifras</span>'}</div>
      ${st.count ? chartSvg(bk) : '<div class="empty-li">No hay ventas en este periodo</div>'}
      ${st.count ? `<details class="tbl-details"><summary>Ver como tabla</summary><table class="tbl"><thead><tr><th></th><th>Vendido</th><th>Ganancia</th></tr></thead><tbody>${bk.filter((b) => b.revenue || b.profit).map((b) => `<tr><td>${esc(I.kind === 'semana' || I.kind === 'mes' ? fmtDate(b.from) : b.label)}</td><td>${cup(b.revenue, false)}</td><td>${cup(b.profit, false)}</td></tr>`).join('')}</tbody></table></details>` : ''}
    </div>
    ${secTitle('De lo vendido a la ganancia neta')}
    <div class="card">
      ${kv('Vendido', cup(st.revenue))}
      ${kv('− Costo de lo vendido', cup(st.cost))}
      ${kv('= Ganancia de las ventas', cup(st.profit), 'strong')}
      ${kv('− Gastos del negocio', cup(st.expenses))}
      ${st.losses ? kv('− Mermas y consumo propio', cup(st.losses)) : ''}
      <div class="divider"></div>
      ${kv('= Ganancia neta', cup(st.net), st.net >= 0 ? 'green big' : 'red big')}
      ${kv('Cobrado en efectivo / transferencia', `${cup(st.cash, false)} / ${cup(st.transfer, false)}`, 'dim')}
      ${st.purchasedUsd ? kv('Invertido en mercancía', `${usd(st.purchasedUsd)} (≈ ${cup(st.purchasedCup, false)})`, 'dim') : ''}
    </div>
    ${secTitle('Productos más vendidos')}
    ${st.products.length ? chips('sort', [['revenue', 'Más vendido'], ['profit', 'Más ganancia'], ['qty', 'Más unidades']], I.sort, 'sort') : ''}
    <div class="card">${top.length ? `<table class="tbl"><thead><tr><th>Producto</th><th>Cant.</th><th>Vendido</th><th>Ganancia</th></tr></thead><tbody>${top.map((p) => `<tr><td>${esc(state.products.find((x) => x.id === p.pid)?.name || '—')}</td><td>${qtyStr(p.qty)}</td><td>${cup(p.revenue, false)}</td><td class="${p.profit < 0 ? 'red-t' : ''}">${cup(p.profit, false)}</td></tr>`).join('')}</tbody></table>` : '<div class="dim">Sin ventas</div>'}</div>
    ${st.byCat.length ? `${secTitle('Gastos por tipo')}<div class="card">${st.byCat.map((c) => `<div class="hbar"><div class="hb-top"><span>${esc(c.cat)}</span><b>${cup(c.v)}</b></div><div class="hb-track"><i style="width:${(c.v / maxCat) * 100}%"></i></div></div>`).join('')}</div>` : ''}
    ${closures.length ? `${secTitle('Cierres del día')}<div class="list">${closures.map((c) => li({ act: 'closureOf', attrs: `data-date="${c.date}"`, ic: c.diff ? 'warning' : 'checkCircle', color: c.diff ? (c.diff < 0 ? 'red' : 'amber') : 'green', title: fmtDateLong(c.date), sub: `Neta ${cup(c.summary?.net || 0)} · ${c.diff ? (c.diff > 0 ? `sobraron ${cup(c.diff)}` : `faltaron ${cup(-c.diff)}`) : 'caja cuadrada'}`, right: cup(c.summary?.revenue || 0) })).join('')}</div>` : ''}
    <p class="hint">Cada venta usa el precio, el costo y el cambio del momento en que se hizo. Los importes en USD son la equivalencia al cambio de cada venta.</p>
    <div class="spacer"></div>`;
}

/* ---------- render ---------- */
const VIEWS = { inicio: viewInicio, vender: viewVender, productos: viewProductos, gastos: viewGastos, informes: viewInformes };

function render() {
  const v = $('#view');
  v.innerHTML = VIEWS[ctx.tab]();
  v.dataset.tab = ctx.tab;
  $('#cart-slot').innerHTML = cartBar();
  document.body.classList.toggle('has-cart', ctx.tab === 'vender' && ctx.cart.length > 0);
  for (const b of document.querySelectorAll('.navbar button')) b.classList.toggle('on', b.dataset.tab === ctx.tab);
  onScroll();
}

let tabEntry = false;
function setTab(t, fromPop = false) {
  scrollPos[ctx.tab] = window.scrollY;
  if (t === ctx.tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // En Android, «Atrás» desde otra pestaña vuelve a Inicio.
  if (t !== 'inicio' && !tabEntry) {
    histPush();
    tabEntry = true;
  } else if (t === 'inicio' && tabEntry) {
    tabEntry = false;
    if (!fromPop) histBack();
  }
  ctx.tab = t;
  render();
  window.scrollTo(0, scrollPos[t] || 0);
}
onBackWithoutLayer(() => {
  if (ctx.tab !== 'inicio') setTab('inicio', true);
});

function onScroll() {
  const tb = $('.topbar');
  if (tb) tb.classList.toggle('scrolled', window.scrollY > 4);
}

/* ---------- acciones ---------- */
const acts = {
  settings: () => settingsPage(),
  rate: () => rateDialog(),
  review: () => priceReviewPage(),
  install: () => installApp(),
  backup: () => exportBackup(),
  lowStock: () => {
    vs.productos.filter = 'poco';
    setTab('productos');
  },
  goVender: () => setTab('vender'),
  newPurchase: () => purchaseEditor(),
  newExpense: () => expenseEditor(),
  newProduct: () => productEditor(),
  closure: () => closurePage(),
  closureOf: (el) => closurePage(el.dataset.date),
  cash: () => cashPage(),
  history: () => salesHistoryPage(),
  sale: (el) => saleDetail(el.dataset.id),
  product: (el) => productSheet(el.dataset.id),
  purchase: (el) => purchaseDetail(el.dataset.id),
  expense: (el) => expenseEditor(state.expenses.find((e) => e.id === el.dataset.id)),
  add: (el) => {
    const p = state.products.find((x) => x.id === el.dataset.id);
    cartAdd(el.dataset.id, 1);
    render();
    if (!p.price) snackbar(`«${p.name}» no tiene precio: escríbelo al cobrar`);
  },
  sub: (el) => {
    cartAdd(el.dataset.id, -1);
    render();
  },
  clearCart: () => {
    const old = ctx.cart;
    ctx.cart = [];
    render();
    snackbar('Carrito vaciado', { action: 'Deshacer', onAction: () => { ctx.cart = old; render(); } });
  },
  checkout: () => checkoutPage(),
  chip: (el) => {
    const { name, v } = el.dataset;
    if (name === 'venderCat') {
      vs.vender.cat = v;
      $('#vender-list').innerHTML = venderList();
      $$chips(name, v);
      return;
    }
    if (name === 'prodFilter') vs.productos.filter = v;
    render();
  },
  seg: (el) => {
    const { name, v } = el.dataset;
    if (name === 'gastosMode') vs.gastos.mode = v;
    if (name === 'kind') {
      vs.informes.kind = v;
      vs.informes.tip = null;
    }
    render();
  },
  sort: (el) => {
    vs.informes.sort = el.dataset.v;
    render();
  },
  month: (el) => {
    const pr = periodRange('mes', vs.gastos.month);
    vs.gastos.month = el.dataset.d === 'prev' ? pr.prev : pr.next;
    render();
  },
  period: (el) => {
    const pr = periodRange(vs.informes.kind, vs.informes.anchor);
    vs.informes.anchor = el.dataset.d === 'prev' ? pr.prev : pr.next;
    vs.informes.tip = null;
    render();
  },
  tip: (el) => {
    const i = +el.dataset.i;
    vs.informes.tip = vs.informes.tip === i ? null : i;
    render();
  },
  prodMenu: async () => {
    const a = await menuSheet({
      actions: [
        { label: 'Registrar compra', ic: 'inbox', value: () => purchaseEditor() },
        { label: 'Revisar precios con pérdida', ic: 'warning', value: () => priceReviewPage() },
        { label: 'Contar todo el inventario', ic: 'clipboard', value: () => countPage() },
      ],
    });
    a?.();
  },
  prodFab: async () => {
    const a = await menuSheet({
      title: 'Añadir',
      actions: [
        { label: 'Nuevo producto', sub: 'Algo que todavía no vendes', ic: 'box', value: () => productEditor() },
        { label: 'Registrar compra', sub: 'Mercancía nueva de productos que ya tienes', ic: 'inbox', value: () => purchaseEditor() },
      ],
    });
    a?.();
  },
};
function $$chips(name, v) {
  for (const b of document.querySelectorAll(`#view .chip[data-name="${name}"]`)) {
    const on = b.dataset.v === v;
    b.classList.toggle('on', on);
    const svg = b.querySelector('svg');
    if (on && !svg) b.insertAdjacentHTML('afterbegin', icon('check'));
    if (!on && svg) svg.remove();
  }
}

function bindEvents() {
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('.page-wrap, .overlay')) return;
    const tabBtn = ev.target.closest('.navbar button');
    if (tabBtn) return setTab(tabBtn.dataset.tab);
    const el = ev.target.closest('[data-act]');
    if (el && !el.disabled && acts[el.dataset.act]) acts[el.dataset.act](el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.closest('.page-wrap, .overlay')) return;
    const k = el.dataset.input;
    if (k === 'venderQ') {
      vs.vender.q = el.value;
      $('#vender-list').innerHTML = venderList();
    } else if (k === 'prodQ') {
      vs.productos.q = el.value;
      $('#prod-list').innerHTML = productosList();
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.input === 'anchor' && el.value) {
      vs.informes.anchor = el.value;
      vs.informes.tip = null;
      render();
    }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
}

function buildShell() {
  document.getElementById('app').innerHTML = '<main id="view"></main><div id="cart-slot"></div>';
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = TABS.map(([id, label, ic]) => `<button data-tab="${id}"><span class="nb-ic">${icon(ic)}</span><span>${label}</span></button>`).join('');
  document.body.appendChild(nav);
}

/* ---------- service worker (uso sin conexión) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
function showUpdate(worker) {
  const el = document.createElement('button');
  el.className = 'update-bar';
  el.innerHTML = `${icon('download')}<span>Hay una nueva versión de la app. Toca para actualizar.</span>`;
  el.onclick = () => worker.postMessage('skipWaiting');
  document.body.appendChild(el);
}

/** La primera vez que se abre la app cada día pide el cambio del dólar. */
function askDailyRate() {
  const S = state.settings;
  if (S.onboarded && !rateSetToday() && S.rateSkipDate !== today() && !openLayers()) rateDialog({ daily: true });
}

/* ---------- arranque ---------- */
(async () => {
  await init();
  buildShell();
  onRefresh(render);
  bindEvents();
  render();
  registerSW();
  onInstallChange(() => ctx.tab === 'inicio' && render());
  navigator.storage?.persist?.().catch(() => {});
  if (!state.settings.onboarded) welcomePage();
  else askDailyRate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh();
      askDailyRate();
    }
  });
  window.__gp = { state: () => state, ctx, refresh, version: APP_VERSION };
})();

