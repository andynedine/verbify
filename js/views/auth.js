// ---------- Entrar / Registrarse ----------
import { api } from '../state.js';
import { t } from '../i18n.js';
import { esc } from '../utils.js';
import { $, errorText, pwdField } from '../ui.js';
import { reloadSession } from '../app.js';

const NICK_RE = /^[A-Za-z0-9_.-]{3,20}$/;

function hero() {
  return `
    <div class="auth-hero">
      <img src="icons/icon.svg" alt="" width="72" height="72">
      <p class="auth-tagline">${esc(t('auth.tagline'))}</p>
    </div>`;
}

function renderLogin(root) {
  root.innerHTML = `
    <section class="auth-card card">
      ${hero()}
      <h1>${esc(t('auth.loginTitle'))}</h1>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="nick">${esc(t('auth.nick'))}</label>
          <input id="nick" name="nick" required autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20">
        </div>
        ${pwdField('password', t('auth.password'), 'current-password')}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${esc(t('auth.loginBtn'))}</button>
      </form>
      <p class="muted small center">${esc(t('auth.forgot'))}</p>
      <hr>
      <p class="center">${esc(t('auth.noAccount'))}</p>
      <a class="btn btn-secondary btn-block" href="#/registro">${esc(t('auth.createAccount'))}</a>
    </section>`;
  const form = $('#login-form', root);
  const errBox = $('.form-error', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const nick = form.nick.value.trim();
    const password = form.password.value;
    if (!nick || !password) { errBox.textContent = t('auth.fillAll'); errBox.hidden = false; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api.signIn({ nick, password });
      await reloadSession('#/');
    } catch (err) {
      errBox.textContent = errorText(err); errBox.hidden = false;
      form.password.focus();
    } finally { btn.disabled = false; }
  });
}

function renderRegister(root) {
  root.innerHTML = `
    <section class="auth-card card">
      ${hero()}
      <h1>${esc(t('auth.registerTitle'))}</h1>
      <form id="reg-form" novalidate>
        <fieldset class="segmented" role="radiogroup">
          <legend class="sr-only">${esc(t('auth.whoAreYou'))}</legend>
          <label><input type="radio" name="kind" value="student" checked><span>🎒 ${esc(t('auth.iAmStudent'))}</span></label>
          <label><input type="radio" name="kind" value="admin"><span>🧑‍🏫 ${esc(t('auth.iAmAdult'))}</span></label>
        </fieldset>
        <div class="field">
          <label for="nick">${esc(t('auth.nick'))}</label>
          <input id="nick" name="nick" required autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" aria-describedby="nick-help">
          <p id="nick-help" class="help">${esc(t('auth.nickHelp'))}</p>
        </div>
        ${pwdField('password', t('auth.password'), 'new-password')}
        ${pwdField('password2', t('auth.password2'), 'new-password')}
        <div class="field" id="bd-field" hidden>
          <label for="birthdate">${esc(t('auth.birthdate'))}</label>
          <input id="birthdate" name="birthdate" type="date" aria-describedby="bd-help">
          <p id="bd-help" class="help">${esc(t('auth.birthdateHelp'))}</p>
        </div>
        <p class="help">🔒 ${esc(t('auth.privacy'))}</p>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${esc(t('auth.registerBtn'))}</button>
      </form>
      <hr>
      <a class="btn btn-ghost btn-block" href="#/entrar">${esc(t('auth.haveAccount'))}</a>
    </section>`;
  const form = $('#reg-form', root);
  const bdField = $('#bd-field', root);
  const errBox = $('.form-error', form);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind') bdField.hidden = form.kind.value !== 'admin';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const admin = form.kind.value === 'admin';
    const nick = form.nick.value.trim();
    const password = form.password.value;
    const fail = (msg, field) => { errBox.textContent = msg; errBox.hidden = false; field?.focus(); };
    if (!NICK_RE.test(nick)) return fail(t('err.NICK_INVALID'), form.nick);
    if (password.length < 6) return fail(t('err.WEAK_PASSWORD'), form.password);
    if (password !== form.password2.value) return fail(t('auth.pwdMismatch'), form.password2);
    let birthdate = null;
    if (admin) {
      birthdate = form.birthdate.value;
      const bd = new Date(birthdate);
      const limit = new Date(); limit.setFullYear(limit.getFullYear() - 18);
      if (!birthdate || isNaN(bd)) return fail(t('err.BIRTHDATE_INVALID'), form.birthdate);
      if (bd > limit) return fail(t('err.UNDERAGE'), form.birthdate);
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api.signUp({ nick, password, admin, birthdate });
      await reloadSession(admin ? '#/admin' : '#/grupos');
    } catch (err) {
      fail(errorText(err));
    } finally { btn.disabled = false; }
  });
}

export function render(root, { sub }) {
  root.classList.add('main-narrow');
  if (sub === 'register') renderRegister(root); else renderLogin(root);
}
