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

// ---------- Campo de contraseña con botón de ver/ocultar ----------
// Ojo abierto = "pulsa para VER la contraseña"; ojo tachado = "pulsa para OCULTARLA".
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export function pwdField(id, label, autocomplete = 'current-password') {
  return `
    <div class="field">
      <label for="${id}">${esc(label)}</label>
      <div class="pwd-wrap">
        <input id="${id}" name="${id}" type="password" required minlength="6" autocomplete="${autocomplete}" autocapitalize="off" spellcheck="false">
        <button type="button" class="pwd-toggle" data-pwd-toggle aria-label="${esc(t('auth.showPwd'))}">${EYE_OPEN}</button>
      </div>
    </div>`;
}

// Un único manejador para todos los campos de contraseña (pantallas y diálogos)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pwd-toggle]');
  if (!b) return;
  const inp = b.closest('.pwd-wrap')?.querySelector('input');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  b.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
  b.setAttribute('aria-label', show ? t('auth.hidePwd') : t('auth.showPwd'));
});
