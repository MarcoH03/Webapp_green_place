// Texto del cierre del día para compartir por WhatsApp.
import { state, cup, usd, fmtDateLong, qtyStr, productName, num } from './store.js';

export function closureText(d, counted, note = '') {
  const S = state.settings;
  const st = d.st;
  const L = [];
  L.push(`🌿 *${S.business || 'Green Place'}* — Cierre del día`);
  L.push(fmtDateLong(d.date));
  L.push(`Cambio: 1 USD = ${cup(d.rate)}`);
  L.push('');
  L.push(`🛒 *Ventas:* ${st.count} venta${st.count === 1 ? '' : 's'} · ${qtyStr(st.units)} productos`);
  for (const p of st.products) L.push(`  • ${qtyStr(p.qty)} × ${productName(p.pid)} — ${cup(p.revenue)}`);
  L.push(`Total vendido: *${cup(st.revenue)}*`);
  if (st.transfer) L.push(`  Efectivo ${cup(st.cash)} · Transferencia ${cup(st.transfer)}`);
  L.push('');
  L.push(`💰 Ganancia de las ventas: ${cup(st.profit)}`);
  if (st.expenses) L.push(`🧾 Gastos: −${cup(st.expenses)}${st.byCat.length ? ` (${st.byCat.map((c) => `${c.cat} ${cup(c.v, false)}`).join(', ')})` : ''}`);
  if (st.losses) L.push(`🗑️ Mermas: −${cup(st.losses)}`);
  L.push(`📈 *Ganancia neta: ${cup(st.net)}* (≈ ${usd(st.netUsd)})`);
  L.push('');
  L.push('💵 *Caja (efectivo)*');
  L.push(`  Al empezar: ${cup(d.opening)}`);
  if (d.cashSales) L.push(`  + Ventas en efectivo: ${cup(d.cashSales)}`);
  if (d.cashExpenses) L.push(`  − Gastos pagados de la caja: ${cup(-d.cashExpenses)}`);
  if (d.cashPurchases) L.push(`  − Compras pagadas de la caja: ${cup(-d.cashPurchases)}`);
  if (d.moves) L.push(`  ${d.moves > 0 ? '+' : '−'} Dinero añadido/retirado: ${cup(Math.abs(d.moves))}`);
  L.push(`  Debería haber: *${cup(d.expected)}*`);
  if (counted !== '' && counted !== null && counted !== undefined) {
    const diff = num(counted) - d.expected;
    L.push(`  Contado: ${cup(counted)}`);
    L.push(Math.abs(diff) < 0.01 ? '  ✅ La caja cuadra' : diff > 0 ? `  ⬆️ Sobran ${cup(diff)}` : `  ⚠️ Faltan ${cup(-diff)}`);
  }
  if (d.bankIn) L.push(`🏦 Transferencias recibidas hoy: ${cup(d.bankIn)}`);
  if (note) {
    L.push('');
    L.push(`📝 ${note}`);
  }
  return L.join('\n');
}
