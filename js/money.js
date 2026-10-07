// Gastos del negocio y dinero: caja (efectivo) y banco (transferencias).
import { icon } from './icons.js';
import {
  state, uid, num, round2, cup, usd, today, fmtDate, fmtTime,
  currentRate, expenseCup, balance, moneyEntries, ACCOUNTS, PAID_FROM,
} from './store.js';
import { $, esc, openPage, topPage, confirmDlg, promptDlg, snackbar, seg, chips, tf, inp, numInp, li, kv, secTitle } from './ui.js';
import { commit } from './core.js';
import { saleDetail } from './sales.js';
import { purchaseDetail } from './products.js';

/* ======================= gastos ======================= */
export function expenseEditor(existing = null, prefill = {}) {
  const S = state.settings;
  const d = existing
    ? { date: existing.date, cat: existing.cat, amount: String(existing.amount), currency: existing.currency, paidFrom: existing.paidFrom, note: existing.note || '', rate: String(existing.rate || currentRate()) }
    : { date: today(), cat: S.expenseCats[0], amount: '', currency: 'CUP', paidFrom: 'caja', note: '', rate: String(currentRate() || ''), ...prefill };
  openPage({
    title: existing ? 'Editar gasto' : 'Nuevo gasto',
    data: d,
    action: { label: 'Guardar', act: 'save' },
    menu: existing ? () => [{ label: 'Eliminar gasto', ic: 'trash', danger: true, value: () => deleteExpense(existing.id) }] : null,
    render: () => `
      <div class="form">
        <div class="lbl">¿En qué se gastó?</div>
        ${chips('cat', [...S.expenseCats.map((c) => [c, c]), ['__new', '+ Nueva']], d.cat)}
        <div class="row2 cur">
          ${tf('Importe', numInp('amount', d.amount, 'placeholder="0"'), { suffix: d.currency })}
          ${seg('currency', [['CUP', 'CUP'], ['USD', 'USD']], d.currency)}
        </div>
        ${d.currency === 'USD' ? `${tf('Cambio (1 USD)', numInp('rate', d.rate), { suffix: 'CUP' })}<div class="tf-help" data-eq>${num(d.amount) ? `= ${cup(num(d.amount) * num(d.rate))}` : ''}</div>` : ''}
        <div class="lbl">¿Con qué se pagó?</div>
        ${chips('paidFrom', Object.entries(PAID_FROM), d.paidFrom)}
        <div class="tf-help">${d.paidFrom === 'caja' ? 'Se descuenta del efectivo de la caja del puesto.' : d.paidFrom === 'banco' ? 'Se descuenta del saldo de transferencias.' : 'No toca la caja del puesto, pero sí cuenta como gasto del negocio.'}</div>
        ${tf('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
        ${tf('Detalle (opcional)', inp('note', d.note, 'placeholder="Ej. mensajero que trajo la mercancía"'))}
        <p class="hint">Los gastos se restan de la ganancia neta en las estadísticas y en el cierre del día.</p>
      </div>`,
    afterBind: (pg, key) => {
      const eq = $('[data-eq]', pg.body);
      if (eq && (key === 'amount' || key === 'rate')) eq.textContent = num(d.amount) ? `= ${cup(num(d.amount) * num(d.rate))}` : '';
    },
    acts: {
      chip: async (el, ev, pg) => {
        const { name, v } = el.dataset;
        if (name === 'cat' && v === '__new') {
          const c = await promptDlg({ title: 'Nueva categoría de gasto', placeholder: 'Ej. Alquiler' });
          if (c && c.trim()) {
            if (!S.expenseCats.includes(c.trim())) S.expenseCats.push(c.trim());
            d.cat = c.trim();
          }
        } else d[name] = v;
        pg.render();
      },
      seg: (el, ev, pg) => {
        d[el.dataset.name] = el.dataset.v;
        pg.render();
      },
      save: async (el, ev, pg) => {
        if (num(d.amount) <= 0) return snackbar('Escribe el importe del gasto');
        if (d.currency === 'USD' && num(d.rate) <= 0) return snackbar('Escribe el cambio del dólar');
        const rec = existing || { id: uid(), ts: Date.now() };
        Object.assign(rec, { date: d.date, cat: d.cat, amount: round2(num(d.amount)), currency: d.currency, rate: d.currency === 'USD' ? num(d.rate) : currentRate(), paidFrom: d.paidFrom, note: d.note.trim() });
        rec.amountCup = expenseCup(rec);
        if (!existing) state.expenses.push(rec);
        await commit();
        snackbar(`Gasto guardado · ${cup(rec.amountCup)}`);
        pg.close();
      },
    },
  });
}

async function deleteExpense(id) {
  if (!(await confirmDlg('Eliminar gasto', '¿Seguro que quieres eliminar este gasto?', 'Eliminar', true))) return;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  await commit();
  topPage()?.close();
  snackbar('Gasto eliminado');
}

export function expenseRow(e) {
  return li({
    act: 'expense', attrs: `data-id="${e.id}"`, ic: 'receipt', color: 'amber',
    title: esc(e.cat),
    sub: [e.note ? esc(e.note) : '', PAID_FROM[e.paidFrom] || e.paidFrom, e.currency === 'USD' ? usd(e.amount) : ''].filter(Boolean).join(' · '),
    right: `<b>−${cup(expenseCup(e))}</b>`,
  });
}

/* ======================= caja y banco ======================= */
export function cashPage(account = 'caja') {
  openPage({
    title: 'Dinero del negocio',
    nav: 'back',
    live: true,
    data: { account },
    render: (pg) => {
      const a = pg.data.account;
      const list = moneyEntries(a).slice(0, 80);
      return `
        <div class="money-cards">
          <button class="money-card ${a === 'caja' ? 'on' : ''}" data-act="acc" data-v="caja">${icon('cash')}<span>Caja (efectivo)</span><b>${cup(balance('caja'))}</b></button>
          <button class="money-card ${a === 'banco' ? 'on' : ''}" data-act="acc" data-v="banco">${icon('bank')}<span>Transferencias</span><b>${cup(balance('banco'))}</b></button>
        </div>
        <div class="btn-row wrap pad-h">
          <button class="btn tonal" data-act="mv" data-type="ingreso">${icon('inbox')} Añadir</button>
          <button class="btn tonal" data-act="mv" data-type="retiro">${icon('outbox')} Retirar</button>
          <button class="btn tonal" data-act="mv" data-type="ajuste">${icon('clipboard')} Contar</button>
        </div>
        ${secTitle(`Movimientos · ${ACCOUNTS[a]}`)}
        <div class="list">${list.length ? list.map((e) => li({
          act: e.kind === 'cash' ? 'cashEntry' : e.kind, attrs: `data-id="${e.id}"`,
          ic: e.amount >= 0 ? 'inbox' : 'outbox', color: e.amount >= 0 ? 'green' : 'red',
          title: esc(e.label), sub: `${fmtDate(e.date)} ${fmtTime(e.ts)}${e.note ? ' · ' + esc(e.note) : ''}`,
          right: `<b class="${e.amount >= 0 ? 'green-t' : ''}">${e.amount >= 0 ? '+' : ''}${cup(e.amount)}</b>`,
        })).join('') : '<div class="empty-li">Sin movimientos</div>'}</div>
        <p class="hint">«Añadir» es dinero que metes en el negocio; «Retirar», el que sacas (para ti, para comprar dólares…). «Contar» corrige el saldo con lo que hay de verdad.</p>`;
    },
    acts: {
      acc: (el, ev, pg) => {
        pg.data.account = el.dataset.v;
        pg.render();
      },
      mv: (el, ev, pg) => cashMoveEditor(pg.data.account, el.dataset.type),
      sale: (el) => saleDetail(el.dataset.id),
      purchase: (el) => purchaseDetail(el.dataset.id),
      expense: (el) => expenseEditor(state.expenses.find((x) => x.id === el.dataset.id)),
      cashEntry: (el) => {
        const c = state.cash.find((x) => x.id === el.dataset.id);
        if (c) cashMoveEditor(c.account, c.type, c);
      },
    },
  });
}

export function cashMoveEditor(account, type, existing = null) {
  const bal0 = balance(account) - (existing ? num(existing.amount) : 0);
  const d = existing
    ? { account: existing.account, type: existing.type, amount: String(Math.abs(existing.amount)), counted: String(round2(bal0 + num(existing.amount))), note: existing.note || '', date: existing.date }
    : { account, type, amount: '', counted: '', note: '', date: today() };
  const TITLES = { ingreso: 'Añadir dinero', retiro: 'Retirar dinero', ajuste: 'Contar el dinero', inicial: 'Dinero inicial', cierre: 'Diferencia del cierre' };
  openPage({
    title: TITLES[d.type] || 'Movimiento',
    data: d,
    action: d.type === 'cierre' ? null : { label: 'Guardar', act: 'save' },
    menu: existing ? () => [{ label: 'Eliminar movimiento', ic: 'trash', danger: true, value: () => deleteCash(existing.id) }] : null,
    render: () => `
      <div class="form">
        <div class="lbl">Cuenta</div>
        ${seg('account', Object.entries(ACCOUNTS), d.account)}
        ${d.type === 'ajuste' ? `
          <div class="card">${kv('La app calcula', cup(balance(d.account) - (existing ? num(existing.amount) : 0)))}</div>
          ${tf('Dinero contado', numInp('counted', d.counted, 'placeholder="0"'), { suffix: 'CUP' })}
          <div class="tf-help" data-adj></div>`
        : d.type === 'cierre' ? `<div class="card">${kv('Diferencia', cup(existing.amount))}</div><p class="hint">Se anotó al guardar el cierre del ${fmtDate(existing.date)}. Para cambiarla, vuelve a hacer ese cierre.</p>`
        : tf('Importe', numInp('amount', d.amount, 'placeholder="0"'), { suffix: 'CUP' })}
        ${tf('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
        ${tf('Motivo (opcional)', inp('note', d.note, `placeholder="${d.type === 'retiro' ? 'Ej. compré 20 USD' : d.type === 'ingreso' ? 'Ej. cambio para el día' : ''}"`))}
      </div>`,
    afterRender: (pg) => showAdj(pg),
    afterBind: (pg, key) => key === 'counted' && showAdj(pg),
    acts: {
      seg: (el, ev, pg) => {
        d[el.dataset.name] = el.dataset.v;
        pg.render();
      },
      save: async (el, ev, pg) => {
        let amount;
        const base = balance(d.account) - (existing ? num(existing.amount) : 0);
        if (d.type === 'ajuste') {
          if (d.counted === '') return snackbar('Escribe el dinero contado');
          amount = round2(num(d.counted) - base);
          if (!amount && !existing) {
            snackbar('El dinero coincide, no hace falta ajustar');
            return pg.close();
          }
        } else {
          if (num(d.amount) <= 0) return snackbar('Escribe el importe');
          amount = d.type === 'retiro' ? -Math.abs(num(d.amount)) : Math.abs(num(d.amount));
        }
        const rec = existing || { id: uid(), ts: Date.now() };
        Object.assign(rec, { date: d.date, account: d.account, type: d.type, amount: round2(amount), note: d.note.trim() });
        if (!existing) state.cash.push(rec);
        await commit();
        snackbar('Guardado');
        pg.close();
      },
    },
  });
  function showAdj(pg) {
    const el = $('[data-adj]', pg.body);
    if (!el) return;
    const base = balance(d.account) - (existing ? num(existing.amount) : 0);
    const diff = round2(num(d.counted) - base);
    el.innerHTML = d.counted === '' ? '' : !diff ? 'Coincide con lo calculado' : diff > 0 ? `Sobran ${cup(diff)}` : `<span class="red-t">Faltan ${cup(-diff)}</span>`;
  }
}

async function deleteCash(id) {
  if (!(await confirmDlg('Eliminar movimiento', '¿Seguro?', 'Eliminar', true))) return;
  state.cash = state.cash.filter((c) => c.id !== id);
  await commit();
  topPage()?.close();
  snackbar('Movimiento eliminado');
}

