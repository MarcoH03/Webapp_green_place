// Estado de la aplicación, guardado en el teléfono (IndexedDB) y todos los cálculos.
// Nada sale del dispositivo: GitHub solo aloja el código de la app.

export const APP_VERSION = '1.0.0';
const DB_NAME = 'green-place';
const DB_STORE = 'kv';
const LS_KEY = 'green-place-state';

/* ---------- utilidades ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const fmtDateLong = (s) => cap(parseDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}
export const round2 = (n) => Math.round(n * 100) / 100;
function fmtNum(n, dec) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
/** Pesos cubanos: sin decimales salvo en cantidades pequeñas con fracción. */
export function cup(n, unit = true) {
  n = round2(num(n));
  const dec = Math.abs(n) < 100 && n % 1 ? 2 : 0;
  const v = dec ? n : Math.round(n);
  return (v < 0 ? '−' : '') + fmtNum(v, dec) + (unit ? ' CUP' : '');
}
export function usd(n, unit = true) {
  n = round2(num(n));
  return (n < 0 ? '−' : '') + fmtNum(n, n % 1 ? 2 : 0) + (unit ? ' USD' : '');
}
export const qtyStr = (q) => String(round2(num(q)));
export const pct = (n) => `${Math.round(n)}%`;
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export const sum = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);

/* ---------- estado por defecto ---------- */
export const EXPENSE_CATS = ['Mensajería', 'Transporte', 'Impuestos', 'Electricidad y agua', 'Bolsas y envases', 'Teléfono e internet', 'Imprevistos', 'Otros'];
export const PRODUCT_CATS = ['Confituras', 'Primera necesidad', 'Bebidas', 'Aseo', 'Otros'];
export const UNITS = ['u', 'paquete', 'caja', 'kg', 'lb', 'litro', 'botella'];
const PLURAL = { u: 'u', paquete: 'paquetes', caja: 'cajas', litro: 'litros', botella: 'botellas' };
/** Unidad en singular o plural según la cantidad («1 paquete», «3 paquetes»). */
export const unitName = (unit, q) => (Math.abs(num(q)) === 1 ? unit : PLURAL[unit] || unit);
export const qtyUnit = (q, unit) => `${qtyStr(q)} ${unitName(unit || 'u', q)}`;
export const PAY = { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: 'Mixto' };
export const PAID_FROM = { caja: 'Caja (efectivo)', banco: 'Transferencia / tarjeta', aparte: 'Dinero aparte' };
export const ADJ_LABEL = { inicial: 'Stock inicial', merma: 'Merma / vencido', consumo: 'Consumo propio', ajuste: 'Ajuste de conteo', costo: 'Cambio de costo' };

export function defaultState() {
  return {
    version: 1,
    settings: {
      business: 'Green Place',
      owner: '',
      margin: 30, // % que se suma al costo para sugerir el precio
      roundTo: 10, // redondeo del precio sugerido (CUP)
      lowMargin: 10, // por debajo de este % de ganancia se avisa
      lowStock: 3, // aviso de poco stock por defecto
      expenseCats: [...EXPENSE_CATS],
      productCats: [...PRODUCT_CATS],
      onboarded: false,
      seenVersion: '',
      lastBackup: null,
      rateSkipDate: null,
    },
    rates: [], // {id, ts, date, value} CUP por 1 USD
    products: [], // {id, name, cat, unit, price, costUsd, minStock, archived, created, priceLog:[{ts,date,price,rate}]}
    purchases: [], // {id, ts, date, rate, currency, paidFrom, supplier, note, items:[{pid, qty, costUsd}], totalUsd, totalCup}
    sales: [], // {id, ts, date, rate, items:[{pid, qty, price, costUsd}], pay, cash, note, void}
    adjustments: [], // {id, ts, date, pid, qty, kind, costUsd, rate, note}
    expenses: [], // {id, ts, date, cat, amount, currency, rate, amountCup, paidFrom, note}
    cash: [], // {id, ts, date, account:'caja'|'banco', amount, type, note, ref}
    closures: [], // {id, ts, date, expected, counted, diff, note, text, summary}
  };
}

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings };
  s.version = d.version;
  return s;
}

/* ---------- guardado: IndexedDB con respaldo en localStorage ---------- */
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function idbGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(DB_STORE).objectStore(DB_STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

export let state = defaultState();
let useLS = false;

export async function init() {
  let raw = null;
  try {
    raw = await idbGet('state');
  } catch (e) {
    console.warn('IndexedDB no disponible, se usa localStorage', e);
    useLS = true;
    raw = localStorage.getItem(LS_KEY);
  }
  try {
    if (raw) state = migrate(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (e) {
    console.error(e);
  }
  return state;
}

export async function save() {
  const json = JSON.stringify(state);
  try {
    if (useLS) localStorage.setItem(LS_KEY, json);
    else await idbPut('state', json);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function replaceState(next) {
  state = migrate(next);
  return save();
}

/* ---------- tasa de cambio ---------- */
const byTs = (a, b) => a.ts - b.ts;
export function currentRate() {
  const r = state.rates.length ? [...state.rates].sort(byTs).pop() : null;
  return r ? r.value : 0;
}
export const lastRate = () => (state.rates.length ? [...state.rates].sort(byTs).pop() : null);
/** Último cambio anotado hasta el final de la fecha dada. */
export function rateOn(date) {
  const list = state.rates.filter((r) => r.date <= date).sort(byTs);
  return list.length ? list.pop().value : currentRate();
}
export const rateSetToday = () => state.rates.some((r) => r.date === today());
export function setRate(value, date = today()) {
  const r = { id: uid(), ts: Date.now(), date, value: round2(num(value)) };
  state.rates.push(r);
  return r;
}

/* ---------- productos y precios ---------- */
export const product = (id) => state.products.find((p) => p.id === id);
export const productName = (id) => product(id)?.name || 'Producto eliminado';
export const activeProducts = () => state.products.filter((p) => !p.archived);

export function roundUp(n, step) {
  step = num(step) || 1;
  return Math.ceil(Math.round(n * 100) / 100 / step) * step;
}
/** Precio mínimo (CUP) para no perder dinero con el cambio dado. */
export const minPrice = (p, rate = currentRate()) => round2(num(p.costUsd) * rate);
/** Precio sugerido: costo convertido a CUP + el margen, redondeado hacia arriba. */
export function suggestedPrice(costUsd, rate = currentRate()) {
  const S = state.settings;
  const c = num(costUsd) * rate;
  return c ? roundUp(c * (1 + num(S.margin) / 100), S.roundTo) : 0;
}
export const marginOf = (price, min) => (min > 0 ? ((num(price) - min) / min) * 100 : null);

/** 'nocost' | 'noprice' | 'loss' | 'low' | 'ok' */
export function priceStatus(p, rate = currentRate()) {
  if (!num(p.costUsd) || !rate) return 'nocost';
  if (!num(p.price)) return 'noprice';
  const min = minPrice(p, rate);
  if (num(p.price) < min) return 'loss';
  if (marginOf(p.price, min) < num(state.settings.lowMargin)) return 'low';
  return 'ok';
}
export const lossProducts = (rate = currentRate()) => activeProducts().filter((p) => priceStatus(p, rate) === 'loss');

export function setPrice(p, price, date = today()) {
  price = round2(num(price));
  if (price === num(p.price)) return false;
  p.price = price;
  (p.priceLog = p.priceLog || []).push({ ts: Date.now(), date, price, rate: currentRate() });
  return true;
}

export function addProduct({ name, cat = 'Otros', unit = 'u', price = 0, costUsd = 0, minStock = null }) {
  const p = {
    id: uid(), name: name.trim(), cat, unit, price: 0, costUsd: round2(num(costUsd) * 10000) / 10000,
    minStock: minStock === null || minStock === '' ? null : num(minStock), archived: false, created: Date.now(), priceLog: [],
  };
  setPrice(p, price);
  state.products.push(p);
  return p;
}

export function findProductByName(name) {
  const n = norm(name);
  return n ? state.products.find((x) => norm(x.name) === n) || null : null;
}

export const categories = () => [...new Set([...state.settings.productCats, ...state.products.map((p) => p.cat).filter(Boolean)])];

/* ---------- inventario ---------- */
/** Stock {pid: qty} hasta la fecha indicada (incluida). */
export function stockMap(upTo = null) {
  const m = {};
  const add = (pid, q) => (m[pid] = round2((m[pid] || 0) + num(q)));
  for (const pu of state.purchases) if (!pu.void && (!upTo || pu.date <= upTo)) for (const it of pu.items) add(it.pid, it.qty);
  for (const s of state.sales) if (!s.void && (!upTo || s.date <= upTo)) for (const it of s.items) add(it.pid, -num(it.qty));
  for (const a of state.adjustments) if (!upTo || a.date <= upTo) add(a.pid, a.qty || 0);
  return m;
}
export const stockOf = (pid) => stockMap()[pid] || 0;
export const lowLimit = (p) => (p.minStock === null || p.minStock === undefined ? num(state.settings.lowStock) : num(p.minStock));
export const lowStockProducts = (st = stockMap()) => activeProducts().filter((p) => (st[p.id] || 0) <= lowLimit(p) && lowLimit(p) > 0);

/**
 * Recalcula el costo promedio (USD) de un producto repasando su historia en orden:
 * compras y stock inicial lo promedian, un cambio de costo lo fija y las ventas/mermas solo restan stock.
 * Las ventas pasadas guardan su propio costo y no cambian.
 */
export function recomputeCost(pid) {
  const p = product(pid);
  if (!p) return;
  const ev = [];
  for (const pu of state.purchases) if (!pu.void) for (const it of pu.items) if (it.pid === pid) ev.push({ ts: pu.ts, k: 'add', q: num(it.qty), c: num(it.costUsd) });
  for (const a of state.adjustments) {
    if (a.pid !== pid) continue;
    if (a.kind === 'costo') ev.push({ ts: a.ts, k: 'set', c: num(a.costUsd) });
    else if (a.kind === 'inicial' && num(a.qty) > 0) ev.push({ ts: a.ts, k: 'add', q: num(a.qty), c: num(a.costUsd) });
    else ev.push({ ts: a.ts, k: 'mov', q: num(a.qty) });
  }
  for (const s of state.sales) if (!s.void) for (const it of s.items) if (it.pid === pid) ev.push({ ts: s.ts, k: 'mov', q: -num(it.qty) });
  if (!ev.length) return;
  ev.sort((a, b) => a.ts - b.ts);
  let stock = 0;
  let avg = num(p.costUsd);
  let touched = false;
  for (const e of ev) {
    if (e.k === 'add') {
      avg = stock > 0 ? (stock * avg + e.q * e.c) / (stock + e.q) : e.c;
      stock += e.q;
      touched = true;
    } else if (e.k === 'set') {
      avg = e.c;
      touched = true;
    } else stock += e.q;
  }
  if (touched) p.costUsd = Math.round(avg * 10000) / 10000;
}

export function addAdjustment({ pid, qty, kind, note = '', date = today(), costUsd = null }) {
  const p = product(pid);
  const a = { id: uid(), ts: Date.now(), date, pid, qty: round2(num(qty)), kind, costUsd: costUsd === null ? num(p?.costUsd) : num(costUsd), rate: currentRate(), note };
  state.adjustments.push(a);
  recomputeCost(pid);
  return a;
}

/** Valor del inventario: al costo (USD y CUP al cambio actual) y a precio de venta. */
export function inventoryValue(st = stockMap()) {
  const rate = currentRate();
  let costUsd = 0;
  let sale = 0;
  let units = 0;
  for (const p of activeProducts()) {
    const q = Math.max(0, st[p.id] || 0);
    units += q;
    costUsd += q * num(p.costUsd);
    sale += q * num(p.price);
  }
  return { units: round2(units), costUsd: round2(costUsd), costCup: round2(costUsd * rate), sale: round2(sale) };
}

/* ---------- ventas ---------- */
/** Totales de una venta con los precios, costos y cambio guardados en el momento de venderla. */
export function saleCalc(s) {
  const total = round2(sum(s.items, (it) => num(it.qty) * num(it.price)));
  const costUsd = sum(s.items, (it) => num(it.qty) * num(it.costUsd));
  const cost = round2(costUsd * num(s.rate));
  const cash = s.pay === 'efectivo' ? total : s.pay === 'mixto' ? Math.min(num(s.cash), total) : 0;
  return {
    total,
    cost,
    costUsd: round2(costUsd),
    profit: round2(total - cost),
    units: round2(sum(s.items, (it) => it.qty)),
    cash: round2(cash),
    transfer: round2(total - cash),
    totalUsd: s.rate ? round2(total / s.rate) : 0,
    profitUsd: s.rate ? round2((total - cost) / s.rate) : 0,
  };
}
export const activeSales = () => state.sales.filter((s) => !s.void);
export const itemsSummary = (items, sep = ', ') => items.map((it) => `${qtyStr(it.qty)} ${productName(it.pid)}`).join(sep);

export function addSale({ items, pay = 'efectivo', cash = 0, note = '', date = today() }) {
  const rate = currentRate();
  const s = {
    id: uid(), ts: Date.now(), date, rate,
    items: items.filter((it) => num(it.qty) > 0).map((it) => ({ pid: it.pid, qty: round2(num(it.qty)), price: round2(num(it.price)), costUsd: num(product(it.pid)?.costUsd) })),
    pay, cash: pay === 'mixto' ? round2(num(cash)) : 0, note, void: false,
  };
  state.sales.push(s);
  return s;
}

/* ---------- compras ---------- */
export function purchaseTotals(pu) {
  const totalUsd = round2(sum(pu.items, (it) => num(it.qty) * num(it.costUsd)));
  return { totalUsd, totalCup: round2(totalUsd * num(pu.rate)), units: round2(sum(pu.items, (it) => it.qty)) };
}

/* ---------- gastos ---------- */
export function expenseCup(e) {
  return e.currency === 'USD' ? round2(num(e.amount) * num(e.rate)) : round2(num(e.amount));
}

/* ---------- dinero: caja (efectivo) y banco (transferencias) ---------- */
export const ACCOUNTS = { caja: 'Caja (efectivo)', banco: 'Banco / transferencias' };
export const CASH_TYPES = { inicial: 'Dinero inicial', ingreso: 'Dinero añadido', retiro: 'Dinero retirado', ajuste: 'Ajuste por conteo', cierre: 'Diferencia del cierre' };

/** Todos los movimientos de una cuenta: [{date, ts, amount, label, note, kind, id}] */
export function moneyEntries(account, { from = null, to = null, skipClosureOf = null } = {}) {
  const inRange = (d) => !((from && d < from) || (to && d > to));
  const out = [];
  for (const s of activeSales()) {
    if (!inRange(s.date)) continue;
    const c = saleCalc(s);
    const amt = account === 'caja' ? c.cash : c.transfer;
    if (amt) out.push({ date: s.date, ts: s.ts, amount: amt, label: 'Venta', note: itemsSummary(s.items), kind: 'sale', id: s.id });
  }
  for (const e of state.expenses) {
    if (e.paidFrom === account && inRange(e.date)) out.push({ date: e.date, ts: e.ts, amount: -expenseCup(e), label: `Gasto · ${e.cat}`, note: e.note, kind: 'expense', id: e.id });
  }
  for (const pu of state.purchases) {
    if (!pu.void && pu.paidFrom === account && inRange(pu.date)) out.push({ date: pu.date, ts: pu.ts, amount: -num(pu.totalCup), label: 'Compra de mercancía', note: itemsSummary(pu.items), kind: 'purchase', id: pu.id });
  }
  for (const c of state.cash) {
    if (c.account !== account || !inRange(c.date)) continue;
    if (skipClosureOf && c.type === 'cierre' && c.date === skipClosureOf) continue;
    out.push({ date: c.date, ts: c.ts, amount: num(c.amount), label: CASH_TYPES[c.type] || c.type, note: c.note, kind: 'cash', id: c.id, type: c.type });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
}
export const balance = (account, upTo = null, opts = {}) => round2(sum(moneyEntries(account, { to: upTo, ...opts }), (e) => e.amount));

/* ---------- periodos y estadísticas ---------- */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function weekStart(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
}
/** kind: 'dia' | 'semana' | 'mes' | 'ano' */
export function periodRange(kind, anchor) {
  const d = parseDate(anchor);
  if (kind === 'dia') return { from: anchor, to: anchor, label: fmtDateLong(anchor), prev: addDays(anchor, -1), next: addDays(anchor, 1) };
  if (kind === 'semana') {
    const from = weekStart(anchor);
    const to = addDays(from, 6);
    const a = parseDate(from);
    const b = parseDate(to);
    const label = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
    return { from, to, label, prev: addDays(from, -7), next: addDays(from, 7) };
  }
  if (kind === 'mes') {
    const from = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { from, to, label: cap(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`), prev: toDateStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)), next: toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1)) };
  }
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31`, label: String(d.getFullYear()), prev: `${d.getFullYear() - 1}-01-01`, next: `${d.getFullYear() + 1}-01-01` };
}

/** Resumen de un periodo: ventas, ganancia, gastos, mermas, compras y desglose. */
export function stats(from, to) {
  const inR = (x) => x.date >= from && x.date <= to;
  const sales = activeSales().filter(inR);
  const t = { count: sales.length, units: 0, revenue: 0, cost: 0, profit: 0, cash: 0, transfer: 0, revenueUsd: 0, profitUsd: 0 };
  const byProduct = new Map();
  for (const s of sales) {
    const c = saleCalc(s);
    t.units += c.units;
    t.revenue += c.total;
    t.cost += c.cost;
    t.profit += c.profit;
    t.cash += c.cash;
    t.transfer += c.transfer;
    t.revenueUsd += c.totalUsd;
    t.profitUsd += c.profitUsd;
    for (const it of s.items) {
      const e = byProduct.get(it.pid) || { pid: it.pid, qty: 0, revenue: 0, profit: 0 };
      const rev = num(it.qty) * num(it.price);
      e.qty += num(it.qty);
      e.revenue += rev;
      e.profit += rev - num(it.qty) * num(it.costUsd) * num(s.rate);
      byProduct.set(it.pid, e);
    }
  }
  const expenses = state.expenses.filter(inR);
  const byCat = new Map();
  let expTotal = 0;
  let expUsd = 0;
  for (const e of expenses) {
    const v = expenseCup(e);
    expTotal += v;
    expUsd += e.currency === 'USD' ? num(e.amount) : num(e.rate) ? v / num(e.rate) : 0;
    byCat.set(e.cat, (byCat.get(e.cat) || 0) + v);
  }
  const losses = state.adjustments.filter((a) => inR(a) && ['merma', 'consumo'].includes(a.kind) && num(a.qty) < 0);
  const lossCup = sum(losses, (a) => -num(a.qty) * num(a.costUsd) * num(a.rate));
  const lossUsd = sum(losses, (a) => -num(a.qty) * num(a.costUsd));
  const purchases = state.purchases.filter((p) => !p.void && inR(p));
  const r = (n) => round2(n);
  for (const k of Object.keys(t)) t[k] = r(t[k]);
  const net = r(t.profit - expTotal - lossCup);
  return {
    ...t,
    sales,
    margin: t.cost > 0 ? (t.profit / t.cost) * 100 : null,
    expenses: r(expTotal),
    expensesUsd: r(expUsd),
    expenseList: expenses,
    byCat: [...byCat.entries()].map(([cat, v]) => ({ cat, v: r(v) })).sort((a, b) => b.v - a.v),
    losses: r(lossCup),
    lossesUsd: r(lossUsd),
    lossList: losses,
    net,
    netUsd: r(t.profitUsd - expUsd - lossUsd),
    purchases,
    purchasedUsd: r(sum(purchases, (p) => p.totalUsd)),
    purchasedCup: r(sum(purchases, (p) => p.totalCup)),
    products: [...byProduct.values()].map((e) => ({ ...e, qty: r(e.qty), revenue: r(e.revenue), profit: r(e.profit) })).sort((a, b) => b.revenue - a.revenue),
  };
}

/** Total vendido entre dos fechas; con `cutoffTs`, solo hasta ese momento del último día. */
export function revenueBetween(from, to, cutoffTs = null) {
  return round2(sum(activeSales().filter((s) => s.date >= from && s.date <= to && (!cutoffTs || s.date < to || s.ts <= cutoffTs)), (s) => saleCalc(s).total));
}

/** Barras del gráfico: [{label, from, to, revenue, profit}] según el tipo de periodo. */
export function buckets(kind, from, to) {
  const out = [];
  const add = (label, f, tt, extra = {}) => out.push({ label, from: f, to: tt, revenue: 0, profit: 0, ...extra });
  if (kind === 'dia') {
    for (let h = 0; h < 24; h++) add(String(h), from, to, { hour: h });
    for (const s of activeSales().filter((x) => x.date === from)) {
      const c = saleCalc(s);
      const b = out[new Date(s.ts).getHours()];
      b.revenue += c.total;
      b.profit += c.profit;
    }
    // Las horas con ventas (como mínimo de 8:00 a 18:00).
    const used = out.map((b, i) => (b.revenue ? i : -1)).filter((i) => i >= 0);
    const lo = Math.min(...used, 8);
    const hi = Math.max(...used, 18);
    return out.slice(lo, hi + 1).map((b) => ({ ...b, label: `${b.hour}h` }));
  }
  if (kind === 'ano') {
    const y = from.slice(0, 4);
    for (let m = 0; m < 12; m++) {
      const f = `${y}-${pad(m + 1)}-01`;
      add(MONTHS_SHORT[m], f, toDateStr(new Date(+y, m + 1, 0)));
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const dd = parseDate(d);
      add(kind === 'semana' ? ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dd.getDay()] : String(dd.getDate()), d, d);
    }
  }
  for (const s of activeSales()) {
    if (s.date < from || s.date > to) continue;
    const b = out.find((x) => s.date >= x.from && s.date <= x.to);
    if (!b) continue;
    const c = saleCalc(s);
    b.revenue += c.total;
    b.profit += c.profit;
  }
  return out.map((b) => ({ ...b, revenue: round2(b.revenue), profit: round2(b.profit) }));
}

/* ---------- cierre del día ---------- */
export function closureData(date) {
  const st = stats(date, date);
  const opening = balance('caja', addDays(date, -1));
  const day = moneyEntries('caja', { from: date, to: date, skipClosureOf: date });
  const part = (kind) => round2(sum(day.filter((e) => e.kind === kind), (e) => e.amount));
  const moves = round2(sum(day.filter((e) => e.kind === 'cash'), (e) => e.amount));
  const cashSales = part('sale');
  const cashExpenses = part('expense');
  const cashPurchases = part('purchase');
  const expected = round2(opening + cashSales + cashExpenses + cashPurchases + moves);
  const bankDay = moneyEntries('banco', { from: date, to: date });
  return {
    date, st, opening, cashSales, cashExpenses, cashPurchases, moves, expected,
    bankIn: round2(sum(bankDay.filter((e) => e.amount > 0), (e) => e.amount)),
    bankBalance: balance('banco', date),
    rate: rateOn(date),
    saved: state.closures.find((c) => c.date === date) || null,
  };
}

/** ¿Se anotó algo de ese día después de guardar su cierre? */
export function closureOutdated(date) {
  const c = state.closures.find((x) => x.date === date);
  if (!c) return false;
  const after = (x) => x.date === date && x.ts > c.ts;
  return state.sales.some(after) || state.expenses.some(after) || state.purchases.some(after) || state.cash.some((x) => after(x) && x.type !== 'cierre');
}

export function saveClosure(date, counted, note, text) {
  const d = closureData(date);
  const diff = round2(num(counted) - d.expected);
  const prev = state.closures.find((c) => c.date === date);
  state.cash = state.cash.filter((c) => !(c.type === 'cierre' && c.date === date));
  const id = prev?.id || uid();
  if (diff) state.cash.push({ id: uid(), ts: Date.now(), date, account: 'caja', amount: diff, type: 'cierre', note: diff > 0 ? 'Sobró dinero al contar' : 'Faltó dinero al contar', ref: id });
  const rec = {
    id, ts: Date.now(), date, expected: d.expected, counted: round2(num(counted)), diff, note, text,
    summary: { count: d.st.count, units: d.st.units, revenue: d.st.revenue, profit: d.st.profit, expenses: d.st.expenses, losses: d.st.losses, net: d.st.net, rate: d.rate },
  };
  state.closures = state.closures.filter((c) => c.date !== date);
  state.closures.push(rec);
  return rec;
}
