// Productos, precios, cambio del dólar, compras y conteo de inventario.
import { icon } from './icons.js';
import {
  state, uid, num, round2, cup, usd, pct, qtyStr, today, fmtDate, fmtTime, fmtDateLong, norm,
  currentRate, lastRate, setRate, product, productName, activeProducts, minPrice, suggestedPrice, marginOf, priceStatus,
  lossProducts, setPrice, addProduct, categories, stockMap, stockOf, lowLimit, recomputeCost, addAdjustment,
  purchaseTotals, UNITS, PAID_FROM, ADJ_LABEL, unitName, qtyUnit,
} from './store.js';
import {
  $, esc, openPage, topPage, dialog, confirmDlg, promptDlg, menuSheet, snackbar, pickFromList,
  seg, chips, tf, inp, numInp, li, kv, secTitle, emptyState,
} from './ui.js';
import { commit } from './core.js';
import { saleDetail } from './sales.js';

/* ======================= piezas comunes ======================= */
export function statusBadges(p, q = stockOf(p.id)) {
  const s = priceStatus(p);
  const out = [];
  if (s === 'loss') out.push(`<span class="badge red">${icon('warning')}Pérdida</span>`);
  else if (s === 'low') out.push('<span class="badge amber">Ganancia baja</span>');
  else if (s === 'noprice') out.push('<span class="badge amber">Sin precio</span>');
  else if (s === 'nocost') out.push('<span class="badge">Sin costo</span>');
  if (q <= 0) out.push('<span class="badge">Agotado</span>');
  else if (q <= lowLimit(p)) out.push('<span class="badge amber">Poco stock</span>');
  return out.join('');
}

/** Caja con el precio mínimo y el sugerido para un costo en USD. */
export function priceHelper(costUsd, price, { useAct = 'useSug', rate = currentRate() } = {}) {
  const S = state.settings;
  if (!num(costUsd) || !rate) return `<div class="helper">${icon('info')}<span>Escribe el costo en USD para ver el precio mínimo y el sugerido.</span></div>`;
  const min = round2(num(costUsd) * rate);
  const sug = suggestedPrice(costUsd, rate);
  const m = marginOf(price, min);
  const st = !num(price) ? '' : num(price) < min ? 'red' : m < num(S.lowMargin) ? 'amber' : 'green';
  return `<div class="helper">
    <div class="helper-row"><span>Mínimo sin perder (${usd(costUsd)} × ${cup(rate, false)})</span><b>${cup(min)}</b></div>
    <div class="helper-row"><span>Sugerido (+${num(S.margin)}%)</span><b>${cup(sug)}</b>${useAct ? `<button type="button" class="btn tonal xs" data-act="${useAct}">Usar</button>` : ''}</div>
    ${num(price) ? `<div class="helper-row ${st}"><span>${num(price) < min ? `${icon('warning')} Con este precio pierdes` : 'Ganancia con este precio'}</span><b>${num(price) < min ? cup(min - num(price)) + ' / u' : `${cup(num(price) - min)} (${pct(m)})`}</b></div>` : ''}
  </div>`;
}

/* ======================= cambio del dólar ======================= */
/** Pide el cambio del día. Si deja productos con pérdida, ofrece revisarlos. */
export async function rateDialog({ daily = false } = {}) {
  const last = lastRate();
  const v = await dialog({
    title: daily ? 'Cambio de hoy' : 'Cambiar el cambio del dólar',
    ic: 'exchange',
    message: daily
      ? `¿A cuánto está hoy el dólar en el mercado informal?${last ? `\nÚltimo anotado: ${cup(last.value)} (${fmtDate(last.date)}).` : ''}`
      : `Escribe cuántos CUP vale 1 USD ahora mismo.${last ? `\nActual: ${cup(last.value)} desde el ${fmtDate(last.date)} a las ${fmtTime(last.ts)}.` : ''}`,
    input: { value: last ? last.value : '', inputmode: 'decimal', label: '1 USD =', suffix: 'CUP', placeholder: 'Ej. 420' },
    buttons: daily && last ? [{ label: 'Más tarde', value: null }, { label: 'Guardar', value: true }] : [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: true }],
  });
  if (v === null) {
    if (daily) {
      state.settings.rateSkipDate = today();
      commit();
    }
    return false;
  }
  const n = num(v);
  if (n <= 0) {
    snackbar('Escribe un número mayor que 0');
    return rateDialog({ daily });
  }
  const before = currentRate();
  setRate(n);
  await commit();
  snackbar(`Cambio guardado: 1 USD = ${cup(n)}`);
  const loss = lossProducts();
  if (loss.length) {
    const go = await dialog({
      title: n > before ? 'El dólar subió' : 'Revisa tus precios',
      ic: 'warning',
      message: `Con 1 USD = ${cup(n)}, ${loss.length === 1 ? '1 producto se vende' : `${loss.length} productos se venden`} por debajo de lo que te costó. Si los vendes así pierdes dinero.`,
      buttons: [{ label: 'Ahora no', value: false }, { label: 'Revisar precios', value: true }],
    });
    if (go) priceReviewPage();
  }
  return true;
}

export function rateHistoryPage() {
  openPage({
    title: 'Historial del cambio',
    nav: 'back',
    live: true,
    action: { label: 'Cambiar', act: 'chg' },
    render: () => {
      const list = [...state.rates].sort((a, b) => b.ts - a.ts);
      if (!list.length) return emptyState('exchange', 'Todavía no has anotado el cambio.');
      return `<div class="list">${list.map((r, i) => {
        const prev = list[i + 1];
        const d = prev ? r.value - prev.value : 0;
        return li({ title: `1 USD = ${cup(r.value)}`, sub: `${fmtDateLong(r.date)} · ${fmtTime(r.ts)}`, right: d ? `<span class="${d > 0 ? 'red-t' : 'green-t'}">${d > 0 ? '▲' : '▼'} ${cup(Math.abs(d), false)}</span>` : '' });
      }).join('')}</div>
      <p class="hint">Cada venta guarda el cambio del momento en que se hizo, así que cambiarlo no altera las ventas ni las ganancias ya anotadas.</p>`;
    },
    acts: { chg: () => rateDialog() },
  });
}

/* ======================= revisar precios ======================= */
export function priceReviewPage() {
  const rate = currentRate();
  const list = activeProducts().filter((p) => ['loss', 'low'].includes(priceStatus(p, rate)))
    .sort((a, b) => (priceStatus(a) === 'loss' ? 0 : 1) - (priceStatus(b) === 'loss' ? 0 : 1) || a.name.localeCompare(b.name, 'es'));
  const sel = new Set(list.filter((p) => priceStatus(p) === 'loss').map((p) => p.id));
  openPage({
    title: 'Revisar precios',
    live: true,
    data: { sel },
    render: (pg) => {
      const items = activeProducts().filter((p) => list.includes(p));
      if (!items.length) return emptyState('checkCircle', 'Todos los precios cubren el costo con el cambio actual.');
      return `
        <div class="banner red">${icon('warning')}<span>Cambio actual: <b>1 USD = ${cup(rate)}</b>. Marca los productos a los que quieres poner el precio sugerido (+${state.settings.margin}% sobre el costo). Toca un producto para escribir otro precio.</span></div>
        <div class="list">${items.map((p) => {
          const st = priceStatus(p);
          const sug = suggestedPrice(p.costUsd);
          return `<div class="li check-li">
            <label class="cbox"><input type="checkbox" data-sel="${p.id}" ${pg.data.sel.has(p.id) ? 'checked' : ''}><span>${icon('check')}</span></label>
            <button class="grow plain" data-act="edit" data-id="${p.id}">
              <span class="t">${esc(p.name)} ${st === 'loss' ? '<span class="badge red">Pérdida</span>' : '<span class="badge amber">Ganancia baja</span>'}</span>
              <span class="s">Ahora ${cup(p.price)} · mínimo ${cup(minPrice(p))} · <b>sugerido ${cup(sug)}</b></span>
            </button>
          </div>`;
        }).join('')}</div>`;
    },
    footer: (pg) => (pg.data.sel.size ? `<button class="btn filled block" data-act="apply">${icon('check')} Poner precio sugerido a ${pg.data.sel.size}</button>` : ''),
    onInput: (pg, el) => {
      if (el.dataset.sel) {
        if (el.checked) pg.data.sel.add(el.dataset.sel);
        else pg.data.sel.delete(el.dataset.sel);
        pg.renderFoot();
      }
    },
    acts: {
      edit: (el) => priceDialog(el.dataset.id),
      apply: (el, ev, pg) => {
        let n = 0;
        for (const id of pg.data.sel) {
          const p = product(id);
          if (p && setPrice(p, suggestedPrice(p.costUsd))) n++;
        }
        pg.data.sel.clear();
        commit();
        snackbar(`${n} precio${n === 1 ? '' : 's'} actualizado${n === 1 ? '' : 's'}`);
      },
    },
  });
}

export async function priceDialog(pid) {
  const p = product(pid);
  const min = minPrice(p);
  const sug = suggestedPrice(p.costUsd);
  const v = await dialog({
    title: `Precio de ${p.name}`,
    message: num(p.costUsd)
      ? `Costo: ${usd(p.costUsd)} → ${cup(min)} con el cambio de hoy.\nMínimo sin perder: ${cup(min)} · Sugerido: ${cup(sug)}.`
      : 'Este producto no tiene costo anotado.',
    input: { value: p.price || sug || '', inputmode: 'decimal', label: 'Precio de venta', suffix: 'CUP' },
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: true }],
  });
  if (v === null) return;
  const n = num(v);
  if (n < min && n > 0 && !(await confirmDlg('Precio por debajo del costo', `Con ${cup(n)} pierdes ${cup(min - n)} en cada unidad. ¿Guardar de todos modos?`, 'Guardar', true))) return;
  if (setPrice(p, n)) {
    await commit();
    snackbar('Precio actualizado. Las ventas anteriores no cambian.');
  }
}

/* ======================= selector de productos ======================= */
export function pickProduct(selected = null) {
  const st = stockMap();
  const items = [...activeProducts()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => ({
    value: p.id,
    label: p.name,
    sub: `${esc(p.cat || '')} · ${esc(qtyUnit(st[p.id] || 0, p.unit))} · ${p.price ? cup(p.price) : 'sin precio'}`,
  }));
  return pickFromList({
    title: 'Elegir producto',
    items,
    selected,
    searchPlaceholder: 'Buscar producto',
    addNew: { label: 'Nuevo producto', handler: (q) => productEditor(null, { name: q, mode: 'purchase' }) },
  });
}

/* ======================= producto: crear / editar ======================= */
/** mode: 'full' | 'purchase' (desde una compra: sin costo, precio ni stock). Devuelve el id o null. */
export function productEditor(pid = null, { name = '', mode = 'full' } = {}) {
  return new Promise((resolve) => {
    const ex = pid ? product(pid) : null;
    const rate = currentRate();
    const d = ex
      ? { name: ex.name, cat: ex.cat, unit: ex.unit, cost: ex.costUsd ? String(round2(ex.costUsd * 100) / 100) : '', cur: 'USD', price: ex.price ? String(ex.price) : '', minStock: ex.minStock ?? '', stock: '' }
      : { name, cat: state.settings.productCats[0] || 'Otros', unit: 'u', cost: '', cur: 'USD', price: '', minStock: '', stock: '', priceTouched: false };
    const costUsd = () => (d.cur === 'CUP' ? (rate ? num(d.cost) / rate : 0) : num(d.cost));
    let saved = null;
    openPage({
      title: ex ? 'Editar producto' : 'Nuevo producto',
      data: d,
      action: { label: 'Guardar', act: 'save' },
      render: () => `
        <div class="form">
          ${tf('Nombre', inp('name', d.name, 'placeholder="Ej. Galletas de chocolate" autocapitalize="sentences"'))}
          <div class="lbl">Categoría</div>
          ${chips('cat', [...categories().map((c) => [c, c]), ['__new', '+ Nueva']], d.cat)}
          <div class="lbl">Se vende por</div>
          ${chips('unit', UNITS.map((u) => [u, u === 'u' ? 'unidad' : u]), d.unit)}
          ${mode === 'full' ? `
            <div class="lbl">Costo de compra por ${d.unit === 'u' ? 'unidad' : d.unit}</div>
            <div class="row2 cur">
              ${tf(`Costo (${d.cur})`, numInp('cost', d.cost, 'placeholder="0.00"'), { suffix: d.cur })}
              ${seg('cur', [['USD', 'USD'], ['CUP', 'CUP']], d.cur)}
            </div>
            ${d.cur === 'CUP' && num(d.cost) ? `<div class="tf-help">= ${usd(costUsd())} con el cambio de hoy</div>` : ''}
            ${ex ? '<div class="tf-help">Normalmente el costo se actualiza solo al registrar compras. Cámbialo aquí solo para corregirlo.</div>' : ''}
            <div class="lbl">Precio de venta</div>
            ${tf('Precio (CUP)', numInp('price', d.price, 'placeholder="0"'), { suffix: 'CUP' })}
            <div data-helper>${priceHelper(costUsd(), d.price)}</div>
            ${!ex ? `<div class="lbl">Cantidad que tienes ahora</div>${tf('Stock inicial', numInp('stock', d.stock, 'placeholder="0"'), { suffix: unitName(d.unit, 2), help: 'Lo que ya tienes en el puesto. Para mercancía nueva usa «Registrar compra».' })}` : ''}
          ` : ''}
          <div class="lbl">Aviso de poco stock</div>
          ${tf('Avisar cuando queden', numInp('minStock', d.minStock, `placeholder="${state.settings.lowStock}"`), { suffix: unitName(d.unit, 2), help: `Si lo dejas vacío se usa el valor de Ajustes (${state.settings.lowStock}).` })}
        </div>`,
      afterBind: (pg, key) => {
        if (key === 'cost' || key === 'price') {
          if (key === 'price') d.priceTouched = true;
          if (key === 'cost' && !ex && !d.priceTouched) {
            const s = suggestedPrice(costUsd());
            d.price = s ? String(s) : '';
            const pi = $('[data-bind="price"]', pg.body);
            if (pi) pi.value = d.price;
          }
          const h = $('[data-helper]', pg.body);
          if (h) h.innerHTML = priceHelper(costUsd(), d.price);
        }
      },
      acts: {
        chip: async (el, ev, pg) => {
          const { name: n, v } = el.dataset;
          if (n === 'cat' && v === '__new') {
            const c = await promptDlg({ title: 'Nueva categoría', placeholder: 'Ej. Lácteos' });
            if (c && c.trim()) {
              if (!state.settings.productCats.includes(c.trim())) state.settings.productCats.push(c.trim());
              d.cat = c.trim();
            }
          } else d[n] = v;
          pg.render();
        },
        seg: (el, ev, pg) => {
          d[el.dataset.name] = el.dataset.v;
          pg.render();
        },
        useSug: (el, ev, pg) => {
          d.price = String(suggestedPrice(costUsd()));
          d.priceTouched = true;
          pg.render();
        },
        save: async (el, ev, pg) => {
          if (!d.name.trim()) return snackbar('Escribe el nombre del producto');
          const dup = state.products.find((x) => x.id !== pid && !x.archived && norm(x.name) === norm(d.name));
          if (dup && !(await confirmDlg('Ya existe', `Ya tienes un producto llamado «${dup.name}». ¿Crear otro igual?`, 'Crear'))) return;
          const c = costUsd();
          if (mode === 'full' && num(d.price) && c && num(d.price) < c * rate && !(await confirmDlg('Precio por debajo del costo', 'Con ese precio pierdes dinero en cada venta. ¿Guardar de todos modos?', 'Guardar', true))) return;
          if (ex) {
            Object.assign(ex, { name: d.name.trim(), cat: d.cat, unit: d.unit, minStock: d.minStock === '' ? null : num(d.minStock) });
            if (mode === 'full') {
              if (Math.abs(c - num(ex.costUsd)) > 0.00005) addAdjustment({ pid: ex.id, qty: 0, kind: 'costo', costUsd: c, note: 'Costo corregido a mano' });
              setPrice(ex, d.price);
            }
            saved = ex.id;
          } else {
            const p = addProduct({ name: d.name, cat: d.cat, unit: d.unit, price: mode === 'full' ? d.price : 0, costUsd: mode === 'full' ? c : 0, minStock: d.minStock });
            if (mode === 'full' && num(d.stock) > 0) addAdjustment({ pid: p.id, qty: num(d.stock), kind: 'inicial', costUsd: c, note: 'Stock inicial' });
            saved = p.id;
          }
          await commit();
          snackbar(ex ? 'Producto guardado' : 'Producto añadido');
          pg.close();
        },
      },
      onClose: () => resolve(saved),
    });
  });
}

/* ======================= producto: ficha ======================= */
export function productSheet(pid) {
  openPage({
    title: () => product(pid)?.name || 'Producto',
    nav: 'back',
    live: true,
    menu: () => {
      const p = product(pid);
      return [
        { label: 'Editar producto', ic: 'edit', value: () => productEditor(pid) },
        { label: 'Contar / corregir stock', ic: 'clipboard', value: () => adjustFlow(pid, 'ajuste') },
        { label: p.archived ? 'Volver a mostrar' : 'Ocultar producto', ic: 'box', value: () => archiveProduct(pid) },
        { label: 'Eliminar producto', ic: 'trash', danger: true, value: () => deleteProduct(pid) },
      ];
    },
    render: () => {
      const p = product(pid);
      if (!p) return emptyState('box', 'Este producto ya no existe.');
      const q = stockOf(pid);
      const rate = currentRate();
      const min = minPrice(p);
      const sug = suggestedPrice(p.costUsd);
      const m = marginOf(p.price, min);
      const st = priceStatus(p);
      const hist = productHistory(pid).slice(0, 40);
      return `
        <div class="hero">
          <div class="hero-main"><span class="hero-n">${qtyStr(q)}</span><span class="hero-u">${esc(p.unit === 'u' ? (q === 1 ? 'unidad' : 'unidades') : unitName(p.unit, q))} en el puesto</span></div>
          <div class="hero-badges">${statusBadges(p, q)}<span class="badge">${esc(p.cat || '')}</span></div>
        </div>
        ${st === 'loss' ? `<div class="banner red">${icon('warning')}<span>Con el cambio de hoy (${cup(rate)}) este producto te costó <b>${cup(min)}</b> y lo vendes a ${cup(p.price)}: <b>pierdes ${cup(min - p.price)}</b> en cada ${p.unit === 'u' ? 'unidad' : esc(p.unit)}.</span></div>` : ''}
        <div class="card price-card">
          <div class="pc-main"><span>Precio de venta</span><b>${p.price ? cup(p.price) : '—'}</b></div>
          <div class="pc-grid">
            ${kv('Costo', num(p.costUsd) ? usd(p.costUsd) : '—')}
            ${kv('Mínimo hoy', num(p.costUsd) ? cup(min) : '—', st === 'loss' ? 'red' : '')}
            ${kv(`Sugerido +${state.settings.margin}%`, sug ? cup(sug) : '—')}
            ${kv('Ganancia', m === null || !p.price ? '—' : `${cup(p.price - min)} · ${pct(m)}`, st === 'loss' ? 'red' : st === 'low' ? 'amber' : 'green')}
          </div>
          <div class="btn-row">
            <button class="btn filled" data-act="price">${icon('tag')} Cambiar precio</button>
            ${sug && sug !== num(p.price) ? `<button class="btn tonal" data-act="useSug">Usar ${cup(sug)}</button>` : ''}
          </div>
        </div>
        <div class="btn-row wrap pad-h">
          <button class="btn outlined" data-act="buy">${icon('inbox')} Registrar compra</button>
          <button class="btn outlined" data-act="loss">${icon('trash')} Merma / consumo</button>
          <button class="btn outlined" data-act="adj">${icon('clipboard')} Contar stock</button>
        </div>
        ${secTitle('Movimientos')}
        <div class="list">${hist.length ? hist.map((h) => li({ act: h.act, attrs: h.attrs, ic: h.ic, color: h.color, title: h.title, sub: h.sub, right: h.right, chev: !!h.act })).join('') : '<div class="empty-li">Sin movimientos</div>'}</div>
        ${(p.priceLog || []).length > 1 ? `${secTitle('Historial de precios')}<div class="list">${[...p.priceLog].reverse().slice(0, 15).map((l) => li({ title: cup(l.price), sub: `${fmtDate(l.date)} ${fmtTime(l.ts)}${l.rate ? ` · cambio ${cup(l.rate, false)}` : ''}` })).join('')}</div>` : ''}
        <p class="hint">Cada venta guarda el precio al que se vendió. Cambiar el precio no modifica las ventas ni las ganancias anteriores.</p>`;
    },
    acts: {
      price: () => priceDialog(pid),
      useSug: async () => {
        const p = product(pid);
        setPrice(p, suggestedPrice(p.costUsd));
        await commit();
        snackbar('Precio actualizado');
      },
      buy: () => purchaseEditor(null, [pid]),
      loss: () => adjustFlow(pid),
      adj: () => adjustFlow(pid, 'ajuste'),
      sale: (el) => saleDetail(el.dataset.id),
      purchase: (el) => purchaseDetail(el.dataset.id),
      adjDel: (el) => adjustmentDetail(el.dataset.id),
    },
  });
}

function productHistory(pid) {
  const h = [];
  const p = product(pid);
  const u = (q) => (p?.unit === 'u' ? '' : ` ${unitName(p?.unit, q)}`);
  for (const s of state.sales) {
    for (const it of s.items) {
      if (it.pid !== pid) continue;
      h.push({ ts: s.ts, date: s.date, act: 'sale', attrs: `data-id="${s.id}"`, ic: 'cart', color: s.void ? '' : 'green', title: `${s.void ? 'Venta anulada' : 'Venta'} · −${qtyStr(it.qty)}${u(it.qty)}`, sub: `${fmtDate(s.date)} ${fmtTime(s.ts)} · a ${cup(it.price)}`, right: s.void ? '' : cup(it.qty * it.price) });
    }
  }
  for (const pu of state.purchases) {
    if (pu.void) continue;
    for (const it of pu.items) {
      if (it.pid !== pid) continue;
      h.push({ ts: pu.ts, date: pu.date, act: 'purchase', attrs: `data-id="${pu.id}"`, ic: 'inbox', color: 'blue', title: `Compra · +${qtyStr(it.qty)}${u(it.qty)}`, sub: `${fmtDate(pu.date)} · ${usd(it.costUsd)} c/u`, right: usd(it.qty * it.costUsd) });
    }
  }
  for (const a of state.adjustments) {
    if (a.pid !== pid) continue;
    h.push({ ts: a.ts, date: a.date, act: 'adjDel', attrs: `data-id="${a.id}"`, ic: a.kind === 'costo' ? 'tag' : a.kind === 'inicial' ? 'box' : a.kind === 'ajuste' ? 'clipboard' : 'trash', color: a.kind === 'merma' || a.kind === 'consumo' ? 'red' : '', title: `${ADJ_LABEL[a.kind] || a.kind}${a.kind === 'costo' ? ` · ${usd(a.costUsd)}` : ` · ${num(a.qty) > 0 ? '+' : ''}${qtyStr(a.qty)}${u(a.qty)}`}`, sub: `${fmtDate(a.date)}${a.note ? ' · ' + esc(a.note) : ''}` });
  }
  return h.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
}

async function archiveProduct(pid) {
  const p = product(pid);
  p.archived = !p.archived;
  await commit();
  snackbar(p.archived ? 'Producto oculto. Sus ventas siguen en las estadísticas.' : 'Producto visible de nuevo');
}

async function deleteProduct(pid) {
  const p = product(pid);
  const used = state.sales.some((s) => s.items.some((i) => i.pid === pid)) || state.purchases.some((x) => x.items.some((i) => i.pid === pid));
  if (used) {
    if (await confirmDlg('No se puede eliminar', `«${p.name}» aparece en ventas o compras. Puedes ocultarlo: dejará de salir en las listas pero sus ventas seguirán contando en las estadísticas.`, 'Ocultar')) {
      p.archived = true;
      await commit();
      topPage()?.close();
    }
    return;
  }
  if (!(await confirmDlg('Eliminar producto', `¿Eliminar «${p.name}»?`, 'Eliminar', true))) return;
  state.products = state.products.filter((x) => x.id !== pid);
  state.adjustments = state.adjustments.filter((a) => a.pid !== pid);
  await commit();
  snackbar('Producto eliminado');
}

/* ======================= mermas, consumo y conteo ======================= */
export async function adjustFlow(pid, kind = null) {
  const p = product(pid);
  if (!kind) {
    kind = await menuSheet({
      title: p.name,
      actions: [
        { label: 'Merma / vencido / roto', sub: 'Se descuenta y cuenta como pérdida', ic: 'trash', value: 'merma' },
        { label: 'Consumo propio', sub: 'Lo usaste tú; cuenta como gasto al costo', ic: 'home', value: 'consumo' },
        { label: 'Contar stock', sub: 'Escribe cuántos hay de verdad', ic: 'clipboard', value: 'ajuste' },
      ],
    });
    if (!kind) return;
  }
  const q = stockOf(pid);
  if (kind === 'ajuste') {
    const v = await promptDlg({ title: 'Contar stock', message: `${p.name}: la app calcula ${qtyStr(q)} ${p.unit}. ¿Cuántos hay de verdad?`, value: qtyStr(q), inputmode: 'decimal', suffix: p.unit, ok: 'Guardar' });
    if (v === null || v === '') return;
    const diff = round2(num(v) - q);
    if (!diff) return snackbar('El stock ya coincide');
    addAdjustment({ pid, qty: diff, kind: 'ajuste', note: `Contado: ${qtyStr(num(v))}` });
    await commit();
    return snackbar(`Stock corregido (${diff > 0 ? '+' : ''}${qtyStr(diff)})`);
  }
  const v = await promptDlg({
    title: kind === 'merma' ? 'Merma o baja' : 'Consumo propio',
    message: `¿Cuántos ${p.unit === 'u' ? 'unidades' : p.unit} de «${p.name}» quitas? Hay ${qtyStr(q)}.`,
    inputmode: 'decimal', value: '1', suffix: p.unit, ok: 'Quitar',
  });
  if (v === null || num(v) <= 0) return;
  const note = (await promptDlg({ title: 'Motivo (opcional)', placeholder: kind === 'merma' ? 'Ej. vencido' : 'Ej. para la casa', ok: 'Guardar' })) || '';
  addAdjustment({ pid, qty: -num(v), kind, note });
  await commit();
  snackbar(`${qtyStr(num(v))} ${p.unit} descontados · pérdida ${cup(num(v) * num(p.costUsd) * currentRate())}`);
}

async function adjustmentDetail(id) {
  const a = state.adjustments.find((x) => x.id === id);
  if (!a) return;
  const p = product(a.pid);
  const ok = await dialog({
    title: ADJ_LABEL[a.kind] || 'Ajuste',
    message: `${p?.name || ''}\n${fmtDateLong(a.date)} · ${fmtTime(a.ts)}\n${a.kind === 'costo' ? `Costo: ${usd(a.costUsd)}` : `Cantidad: ${num(a.qty) > 0 ? '+' : ''}${qtyStr(a.qty)}`}${a.note ? `\n${a.note}` : ''}`,
    buttons: [{ label: 'Cerrar', value: false }, { label: 'Eliminar', value: true, style: 'danger' }],
  });
  if (!ok || !(await confirmDlg('Eliminar movimiento', 'El stock y el costo se recalcularán como si no hubiera ocurrido.', 'Eliminar', true))) return;
  state.adjustments = state.adjustments.filter((x) => x.id !== id);
  recomputeCost(a.pid);
  await commit();
  snackbar('Movimiento eliminado');
}

/** Conteo de todo el inventario de una vez. */
export function countPage() {
  const st = stockMap();
  const list = [...activeProducts()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  openPage({
    title: 'Contar inventario',
    data: { q: '', c: {} },
    action: { label: 'Guardar', act: 'save' },
    render: (pg) => `
      <div class="banner">${icon('info')}<span>Escribe solo los productos cuya cantidad real sea distinta de la que calcula la app. Los demás se quedan igual.</span></div>
      <div class="list">${list.map((p) => `
        <div class="li count-li">
          <span class="grow"><span class="t">${esc(p.name)}</span><span class="s">La app calcula ${esc(qtyUnit(st[p.id] || 0, p.unit))}</span></span>
          <input class="inp count-inp" data-c="${p.id}" inputmode="decimal" placeholder="${qtyStr(st[p.id] || 0)}" value="${esc(pg.data.c[p.id] ?? '')}">
        </div>`).join('') || '<div class="empty-li">No hay productos</div>'}</div>`,
    onInput: (pg, el) => {
      if (el.dataset.c) pg.data.c[el.dataset.c] = el.value;
    },
    acts: {
      save: async (el, ev, pg) => {
        let n = 0;
        for (const [pid, v] of Object.entries(pg.data.c)) {
          if (v === '') continue;
          const diff = round2(num(v) - (st[pid] || 0));
          if (diff) {
            addAdjustment({ pid, qty: diff, kind: 'ajuste', note: `Conteo: ${qtyStr(num(v))}` });
            n++;
          }
        }
        await commit();
        snackbar(n ? `${n} producto${n === 1 ? '' : 's'} corregido${n === 1 ? '' : 's'}` : 'Todo coincide');
        pg.close();
      },
    },
  });
}

/* ======================= compras ======================= */
export function purchaseEditor(existing = null, pids = []) {
  const rate0 = currentRate();
  const d = existing
    ? {
      date: existing.date, currency: existing.currency || 'USD', rate: String(existing.rate), paidFrom: existing.paidFrom, supplier: existing.supplier || '', note: existing.note || '',
      items: existing.items.map((it) => ({ pid: it.pid, qty: String(it.qty), cost: String(existing.currency === 'CUP' ? round2(it.costUsd * existing.rate) : it.costUsd), price: '', priceTouched: false })),
    }
    : { date: today(), currency: 'USD', rate: String(rate0 || ''), paidFrom: 'aparte', supplier: '', note: '', items: pids.map((pid) => ({ pid, qty: '1', cost: '', price: '', priceTouched: false })) };
  const r = () => num(d.rate) || rate0;
  const itCostUsd = (it) => (d.currency === 'CUP' ? (r() ? num(it.cost) / r() : 0) : num(it.cost));
  /** Costo promedio que tendrá el producto después de esta compra. */
  const newAvg = (it) => {
    const p = product(it.pid);
    const prevQty = Math.max(0, stockOf(it.pid) - (existing ? num(existing.items.find((x) => x.pid === it.pid)?.qty) : 0));
    const c = itCostUsd(it);
    const q = num(it.qty);
    if (!c || !q) return num(p?.costUsd);
    return prevQty > 0 && num(p?.costUsd) ? (prevQty * num(p.costUsd) + q * c) / (prevQty + q) : c;
  };
  const sugFor = (it) => suggestedPrice(newAvg(it), currentRate());
  const defPrice = (it) => {
    const p = product(it.pid);
    const s = sugFor(it);
    return num(p?.price) >= s ? num(p.price) : s;
  };
  const totals = () => {
    const usdT = round2(d.items.reduce((a, it) => a + num(it.qty) * itCostUsd(it), 0));
    return { usd: usdT, cup: round2(usdT * r()) };
  };
  const itemHtml = (it, i) => {
    const p = product(it.pid);
    const avg = newAvg(it);
    const sug = sugFor(it);
    const price = it.priceTouched ? it.price : String(defPrice(it) || '');
    const min = round2(avg * currentRate());
    return `<div class="card item-card" data-item="${i}">
      <div class="ic-top"><button class="item-name" data-act="chgItem" data-i="${i}">${esc(p?.name || 'Elegir')} ${icon('chevD')}</button><button class="icon-btn" data-act="rmItem" data-i="${i}" aria-label="Quitar">${icon('close')}</button></div>
      <div class="row2">
        ${tf('Cantidad', numInp(`items.${i}.qty`, it.qty), { suffix: esc(unitName(p?.unit || 'u', it.qty)) })}
        ${tf(`Costo c/u (${d.currency})`, numInp(`items.${i}.cost`, it.cost, 'placeholder="0.00"'), { suffix: d.currency })}
      </div>
      <div class="ic-calc" data-calc="${i}">${itemCalc(it, avg, min, sug)}</div>
      ${tf('Precio de venta', numInp(`items.${i}.price`, price), { suffix: 'CUP' })}
    </div>`;
  };
  const itemCalc = (it, avg, min, sug) => {
    const p = product(it.pid);
    if (!itCostUsd(it)) return '<span class="dim">Escribe el costo para calcular el precio.</span>';
    return `<span>Costo promedio: <b>${usd(avg)}</b>${num(p?.costUsd) && Math.abs(avg - itCostUsd(it)) > 0.004 ? ' (con lo que ya tenías)' : ''}</span>
      <span>Mínimo hoy: <b>${cup(min)}</b> · Sugerido: <b>${cup(sug)}</b>${p?.price ? ` · Ahora: ${cup(p.price)}` : ''}</span>`;
  };
  openPage({
    title: existing ? 'Editar compra' : 'Registrar compra',
    data: d,
    action: { label: 'Guardar', act: 'save' },
    render: () => {
      const t = totals();
      return `
        <div class="form">
          <div class="row2">
            ${tf('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
            ${tf('Cambio (1 USD)', numInp('rate', d.rate), { suffix: 'CUP' })}
          </div>
          <div class="lbl">Moneda en que pagaste</div>
          ${seg('currency', [['USD', 'Dólares (USD)'], ['CUP', 'Pesos (CUP)']], d.currency)}
          ${secTitle('Productos comprados')}
          ${d.items.map(itemHtml).join('')}
          <button class="btn tonal block" data-act="addItem">${icon('plus')} Añadir producto</button>
          <div class="card totals" data-totals>${totalsHtml(t)}</div>
          <div class="lbl">¿De dónde salió el dinero?</div>
          ${chips('paidFrom', Object.entries(PAID_FROM), d.paidFrom)}
          <div class="tf-help">${d.paidFrom === 'aparte' ? 'No se descuenta de la caja del puesto (por ejemplo, dólares que tenías guardados).' : d.paidFrom === 'caja' ? 'Se descuenta del efectivo de la caja.' : 'Se descuenta del saldo de transferencias.'}</div>
          ${tf('Proveedor (opcional)', inp('supplier', d.supplier, 'placeholder="¿A quién se lo compraste?"'))}
          ${tf('Nota (opcional)', inp('note', d.note))}
          <p class="hint">El precio de venta se rellena con el sugerido (+${state.settings.margin}% sobre el costo convertido a CUP). Puedes cambiarlo.</p>
        </div>`;
    },
    afterBind: (pg, key) => {
      const m = key.match(/^items\.(\d+)\.(\w+)$/);
      if (m) {
        const it = d.items[+m[1]];
        if (m[2] === 'price') it.priceTouched = true;
        else {
          const avg = newAvg(it);
          $(`[data-calc="${m[1]}"]`, pg.body).innerHTML = itemCalc(it, avg, round2(avg * currentRate()), sugFor(it));
          if (!it.priceTouched) $(`[data-bind="items.${m[1]}.price"]`, pg.body).value = String(defPrice(it) || '');
        }
      }
      if (m || key === 'rate') $('[data-totals]', pg.body).innerHTML = totalsHtml(totals());
    },
    acts: {
      seg: (el, ev, pg) => {
        d[el.dataset.name] = el.dataset.v;
        pg.render();
      },
      chip: (el, ev, pg) => {
        d[el.dataset.name] = el.dataset.v;
        pg.render();
      },
      addItem: async (el, ev, pg) => {
        const pid = await pickProduct();
        if (!pid) return;
        if (!d.items.some((x) => x.pid === pid)) d.items.push({ pid, qty: '1', cost: '', price: '', priceTouched: false });
        pg.render();
      },
      chgItem: async (el, ev, pg) => {
        const it = d.items[+el.dataset.i];
        const pid = await pickProduct(it.pid);
        if (pid) Object.assign(it, { pid, price: '', priceTouched: false });
        pg.render();
      },
      rmItem: (el, ev, pg) => {
        d.items.splice(+el.dataset.i, 1);
        pg.render();
      },
      save: async (el, ev, pg) => {
        const items = d.items.filter((it) => it.pid && num(it.qty) > 0);
        if (!items.length) return snackbar('Añade al menos un producto con cantidad');
        if (items.some((it) => !itCostUsd(it)) && !(await confirmDlg('Falta el costo', 'Algún producto no tiene costo. Sin costo la app no puede calcular el precio mínimo ni la ganancia. ¿Guardar de todos modos?', 'Guardar'))) return;
        if (!r()) return snackbar('Escribe el cambio del dólar');
        const rec = existing || { id: uid(), ts: Date.now() };
        const oldPids = existing ? existing.items.map((x) => x.pid) : [];
        Object.assign(rec, {
          date: d.date, rate: r(), currency: d.currency, paidFrom: d.paidFrom, supplier: d.supplier.trim(), note: d.note.trim(),
          items: items.map((it) => ({ pid: it.pid, qty: round2(num(it.qty)), costUsd: Math.round(itCostUsd(it) * 10000) / 10000 })),
        });
        // Si la compra se anota con fecha de hoy, cuenta desde ahora para el costo promedio.
        if (!existing && d.date !== today()) rec.ts = new Date(`${d.date}T12:00:00`).getTime();
        Object.assign(rec, purchaseTotals(rec));
        if (!existing) state.purchases.push(rec);
        for (const pid of new Set([...oldPids, ...rec.items.map((x) => x.pid)])) recomputeCost(pid);
        let changed = 0;
        for (const it of items) {
          const price = it.priceTouched ? num(it.price) : defPrice(it);
          if (price && setPrice(product(it.pid), price)) changed++;
        }
        await commit();
        snackbar(`Compra guardada${changed ? ` · ${changed} precio${changed === 1 ? '' : 's'} actualizado${changed === 1 ? '' : 's'}` : ''}`);
        pg.close();
      },
    },
  });
}

function totalsHtml(t) {
  return `<div class="kv"><span>Total de la compra</span><b>${usd(t.usd)}</b></div><div class="kv dim"><span>Equivale a</span><b>${cup(t.cup)}</b></div>`;
}

export function purchaseDetail(id) {
  openPage({
    title: 'Compra',
    nav: 'back',
    live: true,
    menu: () => [
      { label: 'Editar compra', ic: 'edit', value: () => purchaseEditor(state.purchases.find((x) => x.id === id)) },
      { label: 'Eliminar compra', ic: 'trash', danger: true, value: () => deletePurchase(id) },
    ],
    render: () => {
      const pu = state.purchases.find((x) => x.id === id);
      if (!pu) return emptyState('inbox', 'Esta compra ya no existe.');
      return `
        <div class="hero"><div class="hero-main"><span class="hero-n">${usd(pu.totalUsd)}</span><span class="hero-u">≈ ${cup(pu.totalCup)} · cambio ${cup(pu.rate, false)}</span></div></div>
        <div class="list">
          ${li({ ic: 'calendar', title: fmtDateLong(pu.date), sub: fmtTime(pu.ts) })}
          ${li({ ic: 'wallet', title: PAID_FROM[pu.paidFrom] || pu.paidFrom, sub: 'De dónde salió el dinero' })}
          ${pu.supplier ? li({ ic: 'truck', title: esc(pu.supplier), sub: 'Proveedor' }) : ''}
          ${pu.note ? li({ ic: 'edit', title: esc(pu.note), sub: 'Nota' }) : ''}
        </div>
        ${secTitle('Productos')}
        <div class="list">${pu.items.map((it) => li({ title: `${qtyStr(it.qty)} × ${esc(productName(it.pid))}`, sub: `${usd(it.costUsd)} c/u`, right: usd(it.qty * it.costUsd) })).join('')}</div>`;
    },
  });
}

async function deletePurchase(id) {
  const pu = state.purchases.find((x) => x.id === id);
  if (!(await confirmDlg('Eliminar compra', 'Se quitará la mercancía del stock y se recalculará el costo de los productos.', 'Eliminar', true))) return;
  state.purchases = state.purchases.filter((x) => x.id !== id);
  for (const it of pu.items) recomputeCost(it.pid);
  await commit();
  topPage()?.close();
  snackbar('Compra eliminada');
}

