// ---------- Arranque, menú y navegación ----------
import { loadBackend, loadAll, state, prefs, isAdmin, isDemo, api } from './state.js';
import { t, applyLang } from './i18n.js';
import { esc, setPreferredVoice } from './utils.js';
import { $, $$, showError, loading } from './ui.js';
import * as authView from './views/auth.js';
import * as homeView from './views/home.js';
import * as practiceView from './views/practice.js';
import * as studyView from './views/study.js';
import * as groupsView from './views/groups.js';
import * as adminView from './views/admin.js';
import * as settingsView from './views/settings.js';

const ROUTES = {
  '': { view: homeView, auth: true, nav: 'home' },
  entrar: { view: authView, auth: false, sub: 'login' },
  registro: { view: authView, auth: false, sub: 'register' },
  practicar: { view: practiceView, auth: true, nav: 'practice' },
  estudiar: { view: studyView, auth: true, nav: 'study' },
  grupos: { view: groupsView, auth: true, nav: 'groups' },
  admin: { view: adminView, auth: true, nav: 'admin', admin: true },
  ajustes: { view: settingsView, auth: null, nav: 'settings' },
};

let cleanup = null;

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1220' : '#4f46e5');
}

function navItems() {
  const items = [
    { id: 'home', href: '#/', icon: '🏠', label: t('nav.home') },
    { id: 'practice', href: '#/practicar', icon: '🎯', label: t('nav.practice') },
    { id: 'study', href: '#/estudiar', icon: '📚', label: t('nav.study') },
    { id: 'groups', href: '#/grupos', icon: '🏆', label: t('nav.groups') },
  ];
  if (isAdmin()) items.push({ id: 'admin', href: '#/admin', icon: '🛠️', label: t('nav.admin') });
  items.push({ id: 'settings', href: '#/ajustes', icon: '⚙️', label: t('nav.settings') });
  return items;
}

export function renderShell(active) {
  const logged = !!state.profile;
  const items = logged ? navItems() : [];
  const link = (i, cls) => `<a class="${cls}" href="${i.href}" ${i.id === active ? 'aria-current="page"' : ''}>
      <span class="nav-icon" aria-hidden="true">${i.icon}</span><span class="nav-label">${esc(i.label)}</span></a>`;
  $('#topnav').innerHTML = items.map((i) => link(i, 'topnav-link')).join('');
  $('#bottomnav').innerHTML = items.map((i) => link(i, 'bottomnav-link')).join('');
  $('#bottomnav').hidden = !logged;
  $('#topnav').setAttribute('aria-label', t('nav.main'));
  $('#bottomnav').setAttribute('aria-label', t('nav.main'));
  $('#user-chip').innerHTML = logged
    ? `<span class="chip-avatar" aria-hidden="true">${esc(state.profile.nick[0].toUpperCase())}</span><span class="chip-nick">${esc(state.profile.nick)}</span>`
    : `<a class="btn btn-small btn-ghost" href="#/ajustes" aria-label="${esc(t('nav.settings'))}">⚙️</a>`;
  $('.skip-link').textContent = t('nav.skip');
  $('#demo-banner').hidden = !isDemo();
  $('#demo-banner').textContent = t('demo.banner');
  $('#offline-banner').hidden = !state.offline;
  $('#offline-banner').textContent = t('offline.banner');
  document.body.classList.toggle('logged', logged);
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1) };
}

export async function route() {
  const { name, params } = parseHash();
  const r = ROUTES[name] || ROUTES[''];
  if (r.auth === true && !state.profile) { location.replace('#/entrar'); return; }
  if (r.auth === false && state.profile) { location.replace('#/'); return; }
  if (r.admin && !isAdmin()) { location.replace('#/'); return; }
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  renderShell(r.nav);
  const main = $('#main');
  main.className = 'main';
  try {
    cleanup = await r.view.render(main, { params, sub: r.sub, rerender: route });
  } catch (e) {
    showError(e);
  }
  // Accesibilidad: lleva el foco al título de la nueva pantalla
  const h1 = main.querySelector('h1');
  if (h1 && !main.contains(document.activeElement)) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  document.title = (h1 ? h1.textContent.replace(/[^\p{L}\p{N}¡¿!?,.' -]/gu, '').trim() + ' · ' : '') + 'Verbify';
  window.scrollTo({ top: 0 });
}

/** Tras iniciar/cerrar sesión */
export async function reloadSession(goTo = '#/') {
  loading($('#main'));
  await loadAll();
  if (location.hash === goTo) route(); else location.hash = goTo;
}

async function start() {
  setPreferredVoice(prefs.voice);
  applyTheme();
  applyLang();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  loading($('#main'));
  try {
    await loadBackend();
    await api.init();
    await loadAll();
  } catch (e) { showError(e); }
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { if (state.offline) reloadSession(location.hash || '#/'); });
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('verbify:lang', () => route());
start();
