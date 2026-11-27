// ---------- Componentes de interfaz reutilizables ----------
import { esc } from './utils.js';
import { t } from './i18n.js';
import { prefs } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, kind = 'info', ms = 3500) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/** Mensaje de error legible a partir de un error del backend */
export function errorText(e) {
  const key = 'err.' + (e?.code || 'UNKNOWN');
  const txt = t(key);
  return txt === key ? t('err.UNKNOWN') : txt;
}

export function showError(e) {
  console.error(e);
  toast(errorText(e), 'error', 5000);
}

/**
 * Abre un diálogo modal accesible. `body` es HTML.
 * onSubmit(form) puede devolver false para no cerrar. Devuelve una promesa con el resultado.
 */
export function openDialog({ title, body, okText, cancelText, danger = false, onSubmit, hideCancel = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `
      <form method="dialog" class="dialog-form" novalidate>
        <h2 id="dlg-title" class="dialog-title">${esc(title)}</h2>
        <div class="dialog-body">${body || ''}</div>
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          ${hideCancel ? '' : `<button type="button" class="btn btn-ghost" data-cancel>${esc(cancelText || t('common.cancel'))}</button>`}
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(okText || t('common.ok'))}</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const errBox = dlg.querySelector('.form-error');
    let result = null;
    const close = (val) => { result = val; dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errBox.hidden = true;
      if (!onSubmit) return close(true);
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await onSubmit(form);
        if (r !== false) close(r ?? true);
      } catch (e) {
        errBox.textContent = typeof e === 'string' ? e : errorText(e);
        errBox.hidden = false;
      } finally { btn.disabled = false; }
    });
    dlg.showModal();
    const first = dlg.querySelector('input, select, textarea');
    (first || dlg.querySelector('[type=submit]')).focus();
  });
}

export function confirmBox(message, { title, okText, danger = false } = {}) {
  return openDialog({ title: title || t('common.confirm'), body: `<p>${esc(message)}</p>`, okText, danger })
    .then((r) => r === true);
}

export function alertBox(title, bodyHtml) {
  return openDialog({ title, body: bodyHtml, hideCancel: true });
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pequeña explosión de confeti alrededor de un elemento */
export function celebrate(target) {
  if (!prefs.anim || reducedMotion() || !target) return;
  const rect = target.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#4f46e5', '#ff7a59', '#16a34a', '#f59e0b', '#06b6d4', '#ec4899'];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 90;
    p.style.left = `${rect.left + rect.width / 2}px`;
    p.style.top = `${rect.top + rect.height / 2}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1000);
}

export function shake(el) {
  if (!prefs.anim || reducedMotion() || !el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function loading(root) {
  root.innerHTML = `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${esc(t('common.loading'))}</div>`;
}
