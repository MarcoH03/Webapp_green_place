// Contexto compartido: pestaña actual, refresco de pantallas y guardado.
import { save } from './store.js';
import { pages, dialog, snackbar } from './ui.js';

export const ctx = { tab: 'inicio', cart: [] };

let renderView = () => {};
export const onRefresh = (f) => (renderView = f);

/** Vuelve a pintar la pestaña y las pantallas abiertas marcadas como «vivas». */
export function refresh(except = null) {
  renderView();
  for (const p of pages) if (p.opts.live && !p.closed && p !== except) p.render();
}

export async function commit() {
  refresh();
  if (!(await save())) {
    dialog({ title: 'No se pudo guardar', message: 'El almacenamiento del teléfono está lleno o bloqueado. Exporta una copia de seguridad desde Ajustes.', ic: 'warning' });
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  snackbar('Copiado');
}

export async function shareText(text, title = '') {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  await copyText(text);
  snackbar('Copiado: pégalo en WhatsApp');
}
