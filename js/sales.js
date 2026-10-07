// Ventas: carrito, cobro, detalle, historial y cierre del día.
import { icon } from './icons.js';
import {
  state, num, round2, cup, usd, pct, qtyStr, today, addDays, fmtTime, fmtDateLong,
  currentRate, product, productName, minPrice, stockMap, saleCalc, addSale, recomputeCost, PAY, closureData, saveClosure, closureOutdated, itemsSummary,
} from './store.js';
import { $, esc, openPage, topPage, dialog, confirmDlg, snackbar, seg, tf, inp, numInp, li, kv, secTitle, emptyState, vibrate } from './ui.js';
import { ctx, commit, refresh, shareText } from './core.js';
import { closureText } from './closure.js';
import { pickProduct } from './products.js';

/* ======================= carrito ======================= */
export const cartQty = (pid) => ctx.cart.find((c) => c.pid === pid)?.qty || 0;
export const cartTotal = () => round2(ctx.cart.reduce((a, c) => a + num(c.qty) * num(c.price), 0));
export const cartUnits = () => round2(ctx.cart.reduce((a, c) => a + num(c.qty), 0));

export function cartAdd(pid, d = 1) {
  const p = product(pid);
  let c = ctx.cart.find((x) => x.pid === pid);
  if (!c) {
    if (d <= 0) return;
    c = { pid, qty: 0, price: num(p.price) };
    ctx.cart.push(c);
  }
  c.qty = round2(Math.max(0, num(c.qty) + d));
  if (!c.qty) ctx.cart = ctx.cart.filter((x) => x !== c);
  vibrate();
}

/* ======================= cobrar ======================= */
export function checkoutPage() {
  const d = { pay: 'efectivo', received: '', cash: '', note: '', date: today() };
  openPage({
    title: 'Cobrar',
    data: d,
    live: true,
    render: () => {
      const st = stockMap();
      const rate = currentRate();
      if (!ctx.cart.length) return emptyState('cart', 'El carrito está vacío.', '<button class="btn tonal" data-act="addItem">Añadir producto</button>');
      const total = cartTotal();
      return `
        <div class="list">${ctx.cart.map((c, i) => {
          const p = product(c.pid);
          const min = minPrice(p, rate);
          const low = num(c.price) < min;
          const short = num(c.qty) > (st[c.pid] || 0);
          return `<div class="li cart-li">
            <div class="grow">
              <div class="t">${esc(p.name)}</div>
              <div class="cart-row">
                <div class="stepper"><button data-act="qty" data-i="${i}" data-d="-1" aria-label="Menos">${icon('minus')}</button><input class="qty-inp" data-qty="${i}" inputmode="decimal" value="${qtyStr(c.qty)}"><button data-act="qty" data-i="${i}" data-d="1" aria-label="Más">${icon('plus')}</button></div>
                <label class="mini-tf"><span>Precio</span><input class="inp" data-price="${i}" inputmode="decimal" value="${esc(c.price)}"></label>
                <b class="line-t" data-line="${i}">${cup(num(c.qty) * num(c.price))}</b>
              </div>
              ${low ? `<div class="warn-t">${icon('warning')} Por debajo del mínimo (${cup(min)}): pierdes dinero</div>` : ''}
              ${short ? `<div class="warn-t amber">${icon('info')} Solo quedan ${qtyStr(st[c.pid] || 0)} en el inventario</div>` : ''}
            </div>
          </div>`;
        }).join('')}
        <button class="li link" data-act="addItem">${icon('plus')}<span class="grow"><span class="t">Añadir otro producto</span></span></button></div>
        <div class="total-box"><span>Total a cobrar</span><b data-total>${cup(total)}</b></div>
        <div class="form">
          <div class="lbl">Forma de pago</div>
          ${seg('pay', Object.entries(PAY), d.pay)}
          ${d.pay === 'efectivo' ? `${tf('El cliente te da', numInp('received', d.received, `placeholder="${total}"`), { suffix: 'CUP' })}<div class="change" data-change>${changeHtml(d, total)}</div>` : ''}
          ${d.pay === 'mixto' ? `${tf('Parte en efectivo', numInp('cash', d.cash, 'placeholder="0"'), { suffix: 'CUP' })}<div class="tf-help" data-mix>${mixHtml(d, total)}</div>` : ''}
          ${d.pay === 'transferencia' ? '<div class="tf-help">Comprueba en tu teléfono que la transferencia llegó antes de entregar.</div>' : ''}
          ${tf('Nota (opcional)', inp('note', d.note, 'placeholder="Ej. le debo 20 CUP de vuelto"'))}
        </div>`;
    },
    footer: () => (ctx.cart.length ? `<button class="btn filled block lg" data-act="confirm">${icon('check')} Confirmar venta · <span data-ftotal>${cup(cartTotal())}</span></button>` : ''),
    onInput: (pg, el) => {
      const upd = () => {
        const t = cartTotal();
        $('[data-total]', pg.body).textContent = cup(t);
        const ft = $('[data-ftotal]', pg.foot);
        if (ft) ft.textContent = cup(t);
        const ch = $('[data-change]', pg.body);
        if (ch) ch.innerHTML = changeHtml(d, t);
        const mx = $('[data-mix]', pg.body);
        if (mx) mx.innerHTML = mixHtml(d, t);
      };
      if (el.dataset.qty !== undefined) {
        const c = ctx.cart[+el.dataset.qty];
        c.qty = round2(Math.max(0, num(el.value)));
        $(`[data-line="${el.dataset.qty}"]`, pg.body).textContent = cup(c.qty * num(c.price));
        upd();
      } else if (el.dataset.price !== undefined) {
        const c = ctx.cart[+el.dataset.price];
        c.price = el.value;
        $(`[data-line="${el.dataset.price}"]`, pg.body).textContent = cup(num(c.qty) * num(c.price));
        upd();
      } else if (el.dataset.bind) upd();
    },
    acts: {
      qty: (el, ev, pg) => {
        const c = ctx.cart[+el.dataset.i];
        cartAdd(c.pid, +el.dataset.d);
        refresh(pg);
        pg.render();
      },
      seg: (el, ev, pg) => {
        d.pay = el.dataset.v;
        pg.render();
      },
      addItem: async (el, ev, pg) => {
        const pid = await pickProduct();
        if (pid) cartAdd(pid, 1);
        refresh();
      },
      confirm: async (el, ev, pg) => {
        ctx.cart = ctx.cart.filter((c) => num(c.qty) > 0);
        if (!ctx.cart.length) return pg.render();
        const st = stockMap();
        const rate = currentRate();
        const short = ctx.cart.filter((c) => num(c.qty) > (st[c.pid] || 0));
        const low = ctx.cart.filter((c) => num(c.price) < minPrice(product(c.pid), rate));
        if (low.length && !(await confirmDlg('Venta con pérdida', `${low.map((c) => product(c.pid).name).join(', ')} se ${low.length === 1 ? 'vende' : 'venden'} por debajo del costo con el cambio de hoy. ¿Confirmar de todos modos?`, 'Confirmar', true))) return;
        if (short.length && !(await confirmDlg('No hay tanto en el inventario', `${short.map((c) => `${product(c.pid).name} (quedan ${qtyStr(st[c.pid] || 0)})`).join(', ')}. ¿Vender de todos modos? Luego puedes corregir el stock.`, 'Vender'))) return;
        const s = addSale({ items: ctx.cart, pay: d.pay, cash: d.cash, note: d.note.trim() });
        for (const it of s.items) recomputeCost(it.pid);
        ctx.cart = [];
        await commit();
        pg.close();
        vibrate(30);
        snackbar(`Venta registrada · ${cup(saleCalc(s).total)}`, {
          action: 'Deshacer',
          onAction: async () => {
            state.sales = state.sales.filter((x) => x.id !== s.id);
            ctx.cart = s.items.map((it) => ({ pid: it.pid, qty: it.qty, price: it.price }));
            await commit();
            snackbar('Venta deshecha: los productos vuelven al carrito');
          },
        });
      },
    },
  });
}
function changeHtml(d, total) {
  if (!num(d.received)) return '';
  const ch = round2(num(d.received) - total);
  return ch >= 0 ? `Vuelto: <b>${cup(ch)}</b>` : `<span class="red-t">Faltan ${cup(-ch)}</span>`;
}
function mixHtml(d, total) {
  const c = Math.min(num(d.cash), total);
  return `Efectivo ${cup(c)} · Transferencia ${cup(total - c)}`;
}

/* ======================= detalle de una venta ======================= */
export function saleDetail(id) {
  openPage({
    title: 'Venta',
    nav: 'back',
    live: true,
    menu: () => {
      const s = state.sales.find((x) => x.id === id);
      return [
        { label: s.void ? 'Recuperar venta' : 'Anular venta', ic: 'undo', sub: s.void ? 'Vuelve a contar en ventas y stock' : 'Los productos vuelven al inventario', value: () => toggleVoid(id) },
        { label: 'Eliminar venta', ic: 'trash', danger: true, value: () => deleteSale(id) },
      ];
    },
    render: () => {
      const s = state.sales.find((x) => x.id === id);
      if (!s) return emptyState('cart', 'Esta venta ya no existe.');
      const c = saleCalc(s);
      return `
        ${s.void ? `<div class="banner red">${icon('undo')}<span>Venta anulada: no cuenta en el dinero, las estadísticas ni el stock.</span></div>` : ''}
        <div class="hero"><div class="hero-main"><span class="hero-n">${cup(c.total)}</span><span class="hero-u">${fmtDateLong(s.date)} · ${fmtTime(s.ts)}</span></div>
          <div class="hero-badges"><span class="badge">${PAY[s.pay]}</span>${s.pay === 'mixto' ? `<span class="badge">Efectivo ${cup(c.cash)}</span>` : ''}</div></div>
        ${secTitle('Productos')}
        <div class="list">${s.items.map((it) => li({ title: `${qtyStr(it.qty)} × ${esc(productName(it.pid))}`, sub: `a ${cup(it.price)} · costo ${usd(it.costUsd)}`, right: cup(it.qty * it.price) })).join('')}</div>
        ${secTitle('Ganancia de esta venta')}
        <div class="card">
          ${kv('Cobrado', cup(c.total))}
          ${kv(`Costo (cambio ${cup(s.rate, false)})`, '−' + cup(c.cost))}
          ${kv('Ganancia', `${cup(c.profit)}${c.cost ? ` · ${pct((c.profit / c.cost) * 100)}` : ''}`, c.profit < 0 ? 'red strong' : 'green strong')}
          ${kv('En dólares', `${usd(c.totalUsd)} · ganancia ${usd(c.profitUsd)}`, 'dim')}
        </div>
        ${s.note ? `<div class="card note-card">${icon('edit')}<span>${esc(s.note)}</span></div>` : ''}
        <p class="hint">${icon('lock')} Los precios, el costo y el cambio de esta venta quedaron guardados al venderla. Cambiar precios después no altera lo que entró ese día.</p>`;
    },
  });
}

async function toggleVoid(id) {
  const s = state.sales.find((x) => x.id === id);
  if (!s.void && !(await confirmDlg('Anular venta', 'La venta deja de contar y los productos vuelven al inventario.', 'Anular', true))) return;
  s.void = !s.void;
  for (const it of s.items) recomputeCost(it.pid);
  await commit();
  snackbar(s.void ? 'Venta anulada' : 'Venta recuperada');
}

async function deleteSale(id) {
  if (!(await confirmDlg('Eliminar venta', 'Se borrará por completo. Si solo fue un error de cobro, mejor anúlala.', 'Eliminar', true))) return;
  const s = state.sales.find((x) => x.id === id);
  state.sales = state.sales.filter((x) => x.id !== id);
  for (const it of s.items) recomputeCost(it.pid);
  await commit();
  topPage()?.close();
  snackbar('Venta eliminada');
}

export function saleRow(s) {
  const c = saleCalc(s);
  return li({
    act: 'sale', attrs: `data-id="${s.id}"`, ic: s.pay === 'transferencia' ? 'bank' : 'cash', color: s.void ? '' : 'green', cls: s.void ? 'void' : '',
    title: esc(itemsSummary(s.items)),
    sub: `${fmtTime(s.ts)} · ${PAY[s.pay]}${s.void ? ' · <span class="red-t">Anulada</span>' : ''}`,
    right: `<b>${cup(c.total)}</b>${s.void ? '' : `<small class="${c.profit >= 0 ? 'up' : 'red-t'}">ganancia ${c.profit >= 0 ? '+' : ''}${cup(c.profit, false)}</small>`}`,
  });
}

/* ======================= historial de ventas ======================= */
export function salesHistoryPage(date = today()) {
  openPage({
    title: 'Historial de ventas',
    nav: 'back',
    live: true,
    data: { date },
    render: (pg) => {
      const dd = pg.data.date;
      const list = state.sales.filter((s) => s.date === dd).sort((a, b) => b.ts - a.ts);
      const act = list.filter((s) => !s.void);
      const tot = act.reduce((a, s) => a + saleCalc(s).total, 0);
      const prof = act.reduce((a, s) => a + saleCalc(s).profit, 0);
      return `
        <div class="day-nav">
          <button class="icon-btn" data-act="day" data-d="-1" aria-label="Día anterior">${icon('chevL')}</button>
          <label class="date-btn">${icon('calendar')}<span>${dd === today() ? 'Hoy' : fmtDateLong(dd)}</span><input type="date" data-date value="${dd}"></label>
          <button class="icon-btn" data-act="day" data-d="1" aria-label="Día siguiente" ${dd >= today() ? 'disabled' : ''}>${icon('chevR')}</button>
        </div>
        <div class="stat-row">
          <div><span>Ventas</span><b>${act.length}</b></div>
          <div><span>Vendido</span><b>${cup(tot)}</b></div>
          <div><span>Ganancia</span><b>${cup(prof)}</b></div>
        </div>
        <div class="list">${list.length ? list.map(saleRow).join('') : '<div class="empty-li">No hay ventas este día</div>'}</div>`;
    },
    onInput: (pg, el) => {
      if (el.matches('[data-date]') && el.value) {
        pg.data.date = el.value;
        pg.render();
      }
    },
    acts: {
      day: (el, ev, pg) => {
        pg.data.date = addDays(pg.data.date, +el.dataset.d);
        pg.render();
      },
      sale: (el) => saleDetail(el.dataset.id),
    },
  });
}

/* ======================= cierre del día ======================= */
export function closurePage(date = today()) {
  const init = closureData(date);
  const d = { date, counted: init.saved ? String(init.saved.counted) : '', note: init.saved?.note || '' };
  openPage({
    title: 'Cierre del día',
    live: true,
    data: d,
    menu: () => [{ label: 'Compartir resumen', ic: 'share', value: () => shareText(closureText(closureData(d.date), d.counted, d.note), 'Cierre del día') }],
    render: (pg) => {
      const c = closureData(d.date);
      const st = c.st;
      return `
        <div class="day-nav">
          <button class="icon-btn" data-act="day" data-d="-1" aria-label="Día anterior">${icon('chevL')}</button>
          <label class="date-btn">${icon('calendar')}<span>${d.date === today() ? 'Hoy, ' + fmtDateLong(d.date).toLowerCase() : fmtDateLong(d.date)}</span><input type="date" data-date value="${d.date}"></label>
          <button class="icon-btn" data-act="day" data-d="1" aria-label="Día siguiente" ${d.date >= today() ? 'disabled' : ''}>${icon('chevR')}</button>
        </div>
        ${c.saved ? (closureOutdated(d.date)
          ? `<div class="banner amber">${icon('warning')}<span>Después del cierre de las ${fmtTime(c.saved.ts)} se anotaron más ventas o gastos. Revisa la caja y vuelve a guardarlo.</span></div>`
          : `<div class="banner green">${icon('checkCircle')}<span>Cierre guardado a las ${fmtTime(c.saved.ts)}. Puedes corregirlo y guardarlo otra vez.</span></div>`) : ''}

        ${secTitle('1. Ventas del día', `${st.count} venta${st.count === 1 ? '' : 's'}`)}
        <div class="card">
          ${st.products.length ? st.products.map((p) => kv(`${qtyStr(p.qty)} × ${esc(productName(p.pid))}`, cup(p.revenue))).join('') : '<div class="dim">No hubo ventas.</div>'}
          <div class="divider"></div>
          ${kv('Total vendido', cup(st.revenue), 'strong')}
          ${st.transfer ? kv('· en efectivo', cup(st.cash), 'dim') + kv('· por transferencia', cup(st.transfer), 'dim') : ''}
        </div>

        ${secTitle('2. Ganancia')}
        <div class="card">
          ${kv('Vendido', cup(st.revenue))}
          ${kv('Lo que te costó esa mercancía', '−' + cup(st.cost))}
          ${kv('Ganancia de las ventas', cup(st.profit), 'strong')}
          ${st.expenses ? kv(`Gastos del día${st.byCat.length ? ` (${esc(st.byCat.map((x) => x.cat).join(', '))})` : ''}`, '−' + cup(st.expenses)) : ''}
          ${st.losses ? kv('Mermas y consumo', '−' + cup(st.losses)) : ''}
          <div class="divider"></div>
          ${kv(st.net >= 0 ? 'Ganancia neta' : 'Pérdida neta', cup(st.net), st.net >= 0 ? 'green big' : 'red big')}
          ${kv('En dólares (al cambio de cada venta)', usd(st.netUsd), 'dim')}
        </div>

        ${secTitle('3. Dinero en la caja (efectivo)')}
        <div class="card">
          ${kv('Había al empezar el día', cup(c.opening))}
          ${c.cashSales ? kv('+ Ventas en efectivo', cup(c.cashSales)) : ''}
          ${c.cashExpenses ? kv('− Gastos pagados de la caja', cup(-c.cashExpenses)) : ''}
          ${c.cashPurchases ? kv('− Compras pagadas de la caja', cup(-c.cashPurchases)) : ''}
          ${c.moves ? kv(c.moves > 0 ? '+ Dinero añadido' : '− Dinero retirado', cup(Math.abs(c.moves))) : ''}
          <div class="divider"></div>
          ${kv('Debería haber', cup(c.expected), 'big')}
        </div>
        <div class="form">
          ${tf('¿Cuánto efectivo hay contado?', numInp('counted', d.counted, `placeholder="${Math.round(c.expected)}"`), { suffix: 'CUP' })}
          <div data-diff>${diffHtml(c.expected, d.counted)}</div>
          ${c.bankIn ? `<div class="banner">${icon('bank')}<span>Hoy entraron <b>${cup(c.bankIn)}</b> por transferencia. Compruébalo en la app del banco. Saldo de transferencias: ${cup(c.bankBalance)}.</span></div>` : ''}
          ${tf('Nota (opcional)', inp('note', d.note, 'placeholder="Ej. le presté 500 CUP a…"'))}
        </div>
        <p class="hint">Al guardar, si sobra o falta dinero se anota la diferencia y la caja empieza mañana con lo que contaste.</p>`;
    },
    footer: () => `<div class="btn-row"><button class="btn outlined" data-act="share">${icon('share')} Compartir</button><button class="btn filled grow" data-act="save">${icon('check')} Guardar cierre</button></div>`,
    onInput: (pg, el) => {
      if (el.matches('[data-date]') && el.value) {
        pg.data.date = el.value;
        const s = closureData(el.value).saved;
        d.counted = s ? String(s.counted) : '';
        d.note = s?.note || '';
        pg.render();
      }
    },
    afterBind: (pg, key) => {
      if (key === 'counted') $('[data-diff]', pg.body).innerHTML = diffHtml(closureData(d.date).expected, d.counted);
    },
    acts: {
      day: (el, ev, pg) => {
        d.date = addDays(d.date, +el.dataset.d);
        const s = closureData(d.date).saved;
        d.counted = s ? String(s.counted) : '';
        d.note = s?.note || '';
        pg.render();
      },
      share: () => shareText(closureText(closureData(d.date), d.counted, d.note), 'Cierre del día'),
      save: async (el, ev, pg) => {
        const c = closureData(d.date);
        let counted = d.counted;
        if (counted === '') {
          const ok = await confirmDlg('¿No contaste la caja?', `Se guardará como si hubiera exactamente lo esperado (${cup(c.expected)}).`, 'Guardar así');
          if (!ok) return;
          counted = String(c.expected);
        }
        const diff = round2(num(counted) - c.expected);
        saveClosure(d.date, counted, d.note.trim(), closureText(c, counted, d.note.trim()));
        d.counted = counted;
        await commit();
        const r = await dialog({
          title: Math.abs(diff) < 0.01 ? '¡La caja cuadra!' : diff > 0 ? `Sobran ${cup(diff)}` : `Faltan ${cup(-diff)}`,
          ic: Math.abs(diff) < 0.01 ? 'checkCircle' : 'warning',
          message: `${c.st.net >= 0 ? 'Ganancia neta' : 'Pérdida neta'} del día: ${cup(c.st.net)}.\nVendido: ${cup(c.st.revenue)} en ${c.st.count} venta${c.st.count === 1 ? '' : 's'}.`,
          buttons: [{ label: 'Listo', value: false }, { label: 'Compartir', value: true }],
        });
        if (r) shareText(closureText(closureData(d.date), counted, d.note.trim()), 'Cierre del día');
      },
    },
  });
}

function diffHtml(expected, counted) {
  if (counted === '' || counted === undefined) return '';
  const diff = round2(num(counted) - expected);
  if (Math.abs(diff) < 0.01) return `<div class="result ok">${icon('checkCircle')}<span>La caja cuadra</span></div>`;
  return diff > 0
    ? `<div class="result amber">${icon('info')}<span>Sobran <b>${cup(diff)}</b></span></div>`
    : `<div class="result red">${icon('warning')}<span>Faltan <b>${cup(-diff)}</b></span></div>`;
}
