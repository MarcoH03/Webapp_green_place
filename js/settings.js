// Ajustes, bienvenida, copias de seguridad e instalación en Android.
import { icon } from './icons.js';
import {
  state, num, cup, today, fmtDate, fmtTime, setRate, uid, replaceState, defaultState, APP_VERSION, lastRate,
} from './store.js';
import { esc, openPage, dialog, confirmDlg, promptDlg, snackbar, tf, inp, numInp, chips, li, secTitle } from './ui.js';
import { commit } from './core.js';
import { rateDialog, rateHistoryPage, countPage, productEditor } from './products.js';

/* ======================= instalar la app (Android / Chrome) ======================= */
let installEvt = null;
const installListeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  installListeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  installListeners.forEach((f) => f());
  snackbar('¡App instalada! Ábrela desde el icono de tu pantalla de inicio.');
});
export const onInstallChange = (f) => installListeners.add(f);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !!installEvt && !isStandalone();

export async function installApp() {
  if (installEvt) {
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') installEvt = null;
    installListeners.forEach((f) => f());
    return;
  }
  dialog({
    title: 'Instalar en el teléfono',
    ic: 'phone',
    message: isStandalone()
      ? 'La app ya está instalada en este teléfono.'
      : '1. Abre esta página en Google Chrome.\n2. Toca el menú ⋮ (arriba a la derecha).\n3. Elige «Instalar aplicación» o «Añadir a pantalla de inicio».\n4. Abre la app siempre desde el icono de Green Place.',
  });
}

/* ======================= copias de seguridad ======================= */
export async function exportBackup() {
  const json = JSON.stringify({ app: 'green-place', version: APP_VERSION, exported: new Date().toISOString(), state }, null, 1);
  const name = `green-place-copia-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de seguridad Green Place' });
      shared = true;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
  state.settings.lastBackup = today();
  await commit();
  snackbar(shared ? 'Copia lista: guárdala en Drive o envíatela por WhatsApp' : 'Copia guardada en Descargas');
}

export function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const s = data.state || data;
      if (!s.settings || !Array.isArray(s.products)) throw new Error('formato');
      const when = data.exported ? new Date(data.exported).toLocaleString('es-ES') : 'fecha desconocida';
      if (!(await confirmDlg('Restaurar copia', `Copia del ${when}: ${s.products.length} productos y ${(s.sales || []).length} ventas.\nSe reemplazarán TODOS los datos actuales de este teléfono.`, 'Restaurar', true))) return;
      await replaceState(s);
      location.reload();
    } catch {
      dialog({ title: 'No se pudo leer', message: 'El archivo no es una copia de seguridad de Green Place.', ic: 'warning' });
    }
  };
  input.click();
}

/* ======================= ajustes ======================= */
export function settingsPage() {
  const S = state.settings;
  openPage({
    title: 'Ajustes',
    nav: 'back',
    live: true,
    data: { margin: S.margin, roundTo: S.roundTo, lowMargin: S.lowMargin, lowStock: S.lowStock, business: S.business, owner: S.owner },
    render: (pg) => {
      const r = lastRate();
      return `
        ${secTitle('Cambio del dólar')}
        <div class="list">
          ${li({ act: 'rate', ic: 'exchange', color: 'green', title: r ? `1 USD = ${cup(r.value)}` : 'Sin anotar', sub: r ? `Desde el ${fmtDate(r.date)} a las ${fmtTime(r.ts)}` : 'Toca para anotarlo' })}
          ${li({ act: 'rateHist', ic: 'history', title: 'Historial del cambio' })}
        </div>
        ${secTitle('Precios')}
        <div class="form">
          ${tf('Ganancia sugerida sobre el costo', numInp('margin', pg.data.margin), { suffix: '%', help: 'El precio sugerido es el costo en USD × el cambio + este porcentaje.' })}
          <div class="lbl">Redondear el precio sugerido hacia arriba a</div>
          ${chips('roundTo', [[1, '1'], [5, '5'], [10, '10'], [50, '50'], [100, '100']], S.roundTo)}
          ${tf('Avisar de «ganancia baja» por debajo de', numInp('lowMargin', pg.data.lowMargin), { suffix: '%' })}
          ${tf('Aviso de poco stock (por defecto)', numInp('lowStock', pg.data.lowStock), { suffix: 'unidades' })}
        </div>
        ${secTitle('Negocio')}
        <div class="form">
          ${tf('Nombre del negocio', inp('business', pg.data.business))}
          ${tf('Tu nombre (opcional)', inp('owner', pg.data.owner))}
        </div>
        <div class="list">
          ${li({ act: 'expCats', ic: 'receipt', title: 'Categorías de gastos', sub: esc(S.expenseCats.join(', ')) })}
          ${li({ act: 'count', ic: 'clipboard', title: 'Contar todo el inventario', sub: 'Corrige el stock de varios productos a la vez' })}
        </div>
        ${secTitle('Tus datos')}
        <div class="list">
          ${li({ act: 'backup', ic: 'download', color: 'green', title: 'Hacer copia de seguridad', sub: S.lastBackup ? `Última: ${fmtDate(S.lastBackup)}` : 'Nunca' })}
          ${li({ act: 'restore', ic: 'upload', title: 'Restaurar una copia' })}
          ${li({ act: 'install', ic: 'phone', title: isStandalone() ? 'App instalada' : 'Instalar en el teléfono', sub: isStandalone() ? 'Funciona sin internet' : 'Añade el icono a la pantalla de inicio' })}
          ${li({ act: 'manual', ic: 'book', title: 'Manual de uso (PDF)' })}
        </div>
        <div class="banner">${icon('shield')}<span>Todo se guarda solo en este teléfono. Haz una copia de seguridad cada semana y guárdala en Google Drive o en WhatsApp por si se pierde o se cambia el teléfono.</span></div>
        <div class="list">${li({ act: 'wipe', ic: 'trash', color: 'red', title: '<span class="red-t">Borrar todos los datos</span>' })}</div>
        <p class="hint center">Green Place · versión ${APP_VERSION}</p>`;
    },
    afterBind: (pg, key) => {
      if (['margin', 'lowMargin', 'lowStock'].includes(key)) S[key] = num(pg.data[key]);
      else S[key] = pg.data[key];
      clearTimeout(pg.t);
      pg.t = setTimeout(() => commit(), 400);
    },
    acts: {
      rate: () => rateDialog(),
      rateHist: () => rateHistoryPage(),
      chip: (el, ev, pg) => {
        S.roundTo = num(el.dataset.v);
        commit();
      },
      expCats: async () => {
        const v = await promptDlg({ title: 'Categorías de gastos', message: 'Sepáralas con comas.', value: S.expenseCats.join(', '), ok: 'Guardar' });
        if (v === null) return;
        const list = v.split(',').map((x) => x.trim()).filter(Boolean);
        if (list.length) S.expenseCats = [...new Set(list)];
        commit();
      },
      count: () => countPage(),
      backup: () => exportBackup(),
      restore: () => importBackup(),
      install: () => installApp(),
      manual: () => window.open('manual/Manual-Green-Place.pdf', '_blank'),
      wipe: async () => {
        if (!(await confirmDlg('Borrar todos los datos', 'Se borrarán productos, ventas, gastos y cierres de este teléfono. No se puede deshacer. Haz antes una copia de seguridad.', 'Continuar', true))) return;
        const v = await promptDlg({ title: 'Confirma', message: 'Escribe BORRAR para confirmar.', ok: 'Borrar' });
        if ((v || '').trim().toUpperCase() !== 'BORRAR') return;
        await replaceState(defaultState());
        location.reload();
      },
    },
  });
}

/* ======================= bienvenida ======================= */
export function welcomePage() {
  const d = { business: state.settings.business || 'Green Place', owner: '', rate: '', margin: String(state.settings.margin), cash: '' };
  openPage({
    title: 'Bienvenida',
    cls: 'welcome',
    dismissable: false,
    data: d,
    render: () => `
      <div class="welcome-hero">
        <img src="icons/icon-192.png" alt="" width="84" height="84">
        <h1>${esc(d.business)}</h1>
        <p>Inventario, precios en CUP según el cambio del dólar, ventas, gastos y el cierre de cada día. Todo queda guardado en este teléfono.</p>
      </div>
      <div class="form">
        ${tf('Tu nombre (opcional)', inp('owner', d.owner, 'placeholder="Ej. Krys"'))}
        ${tf('¿A cuánto está hoy el dólar?', numInp('rate', d.rate, 'placeholder="Ej. 420"'), { suffix: 'CUP', help: 'Cuántos CUP vale 1 USD en el mercado informal. Cada día la app te lo preguntará la primera vez que la abras.' })}
        ${tf('Ganancia que quieres sobre el costo', numInp('margin', d.margin), { suffix: '%', help: 'Con 30%, algo que te costó 1 USD (420 CUP) se sugiere a 550 CUP.' })}
        ${tf('Efectivo que tienes ahora en la caja (opcional)', numInp('cash', d.cash, 'placeholder="0"'), { suffix: 'CUP', help: 'Para que el cierre del día sepa con cuánto empiezas.' })}
      </div>`,
    footer: () => '<button class="btn filled block lg" data-act="start">Empezar</button>',
    acts: {
      start: async (el, ev, pg) => {
        if (num(d.rate) <= 0) return snackbar('Escribe a cuánto está el dólar hoy');
        const S = state.settings;
        S.owner = d.owner.trim();
        S.margin = num(d.margin) || 30;
        S.onboarded = true;
        S.seenVersion = APP_VERSION;
        setRate(num(d.rate));
        if (num(d.cash)) state.cash.push({ id: uid(), ts: Date.now(), date: today(), account: 'caja', amount: num(d.cash), type: 'inicial', note: 'Efectivo al empezar a usar la app' });
        await commit();
        pg.close();
        const go = await dialog({
          title: '¡Listo!',
          ic: 'checkCircle',
          message: 'Ahora añade los productos que tienes en el puesto, con lo que te costaron en USD y la cantidad. La app te sugerirá el precio de venta.',
          buttons: [{ label: 'Más tarde', value: false }, { label: 'Añadir producto', value: true }],
        });
        if (go) productEditor();
      },
    },
  });
}

