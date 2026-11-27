// ---------- Inicio ----------
import { api, state, isAdmin, isSuper, useList, visibleVerbs, weeksOf } from '../state.js';
import { t } from '../i18n.js';
import { esc, fmtTime, todayKey } from '../utils.js';
import { $, showError } from '../ui.js';

export function listLabel(l) {
  if (!l) return '';
  if (l.is_master) return `${l.name} (${t('list.master')})`;
  return l.name;
}

export function listSelector(id = 'list-select') {
  if (state.lists.length < 2) return '';
  return `
    <div class="field list-picker">
      <label for="${id}">📋 ${esc(t('list.choose'))}</label>
      <select id="${id}">
        ${state.lists.map((l) => `<option value="${l.id}" ${l.id === state.list?.id ? 'selected' : ''}>${esc(listLabel(l))}</option>`).join('')}
      </select>
    </div>`;
}

export function bindListSelector(root, onChange, id = 'list-select') {
  const sel = $('#' + id, root);
  sel?.addEventListener('change', async () => {
    try {
      await useList(state.lists.find((l) => l.id === sel.value));
      onChange();
    } catch (e) { showError(e); }
  });
}

/** ¿La lista activa tiene verbos pero ninguna semana abierta? */
export const hasNoOpenWeeks = () => state.verbs.length > 0 && visibleVerbs().length === 0;
const canEditActive = () => !!state.list && (isSuper() || (isAdmin() && state.list.owner_id === state.profile.id));

/**
 * Aviso cuando la lista tiene verbos pero ninguna semana abierta.
 * allAction: 'use' (Practicar), 'see' (Estudiar) o null.
 */
export function noWeeksNotice(allAction = null) {
  if (!hasNoOpenWeeks()) return '';
  const n = state.verbs.length;
  const admin = canEditActive();
  return `
    <div class="callout callout-warn notice-noweeks" role="status">
      <p>📅 ${esc(admin ? t('noweeks.admin', { n }) : t('noweeks.student', { n }))}</p>
      <div class="btn-row">
        ${admin ? `<button type="button" class="btn btn-primary btn-small" data-open-weeks>🔓 ${esc(t('noweeks.openWeeks'))}</button>` : ''}
        ${allAction ? `<button type="button" class="btn btn-secondary btn-small" data-use-all>${esc(t(allAction === 'use' ? 'noweeks.useAll' : 'noweeks.seeAll'))}</button>` : ''}
      </div>
    </div>`;
}

export function bindNoWeeks(root, onUseAll) {
  root.querySelector('[data-open-weeks]')?.addEventListener('click', () => {
    try { sessionStorage.setItem('verbify-admin-list', state.list.id); } catch { /* ignore */ }
    location.hash = '#/admin/semanas';
  });
  root.querySelector('[data-use-all]')?.addEventListener('click', () => onUseAll?.());
}

function recordTile(records, mode) {
  const all = records.find((r) => r.mode === mode && r.period === 'all');
  const week = records.find((r) => r.mode === mode && r.period !== 'all');
  const line = (r) => (r ? `<strong>${r.score}</strong> ${esc(t('common.pts'))} · ${r.correct}/${r.total} · ⏱ ${fmtTime(r.time_ms)}` : '—');
  return `
    <div class="stat-card">
      <h3 class="stat-title">${esc(t(mode === 'meaning' ? 'mode.meaning.short' : 'mode.random.short'))}</h3>
      <p><span class="muted">${esc(t('rank.week'))}:</span> ${line(week)}</p>
      <p><span class="muted">${esc(t('rank.all'))}:</span> ${line(all)}</p>
    </div>`;
}

export async function render(root, { rerender }) {
  const p = state.profile;
  const visible = visibleVerbs();
  const weeks = weeksOf(state.verbs);
  const open = (state.list?.unlocked_weeks || []).filter((w) => weeks.includes(w)).length;
  const alive = p.last_play_date && p.last_play_date >= todayKey(new Date(Date.now() - 86400000));
  const streak = alive ? p.current_streak : 0;
  let records = [];
  try { records = state.offline ? [] : await api.myRecords(); } catch { /* sin récords */ }

  root.innerHTML = `
    <section class="hero card">
      <h1>${esc(t('home.hello', { nick: p.nick }))} 👋</h1>
      <p class="lead">${esc(streak > 0 ? t('home.streakOn', { n: streak }) : t('home.streakOff'))}</p>
      <div class="hero-stats">
        <div class="pill pill-fire" title="${esc(t('home.streakDays'))}">🔥 <strong>${streak}</strong> <span>${esc(t('home.streakDays'))}</span></div>
        <div class="pill" title="${esc(t('home.bestStreak'))}">🏅 <strong>${p.best_streak || 0}</strong> <span>${esc(t('home.bestStreak'))}</span></div>
        <div class="pill" title="${esc(t('home.bestCombo'))}">⚡ <strong>${p.best_combo || 0}</strong> <span>${esc(t('home.bestCombo'))}</span></div>
      </div>
    </section>

    ${!isAdmin() && state.groups.length === 0 ? `
      <div class="callout">
        <p>👥 ${esc(t('home.joinHint'))}</p>
        <a class="btn btn-secondary" href="#/grupos">${esc(t('home.joinBtn'))}</a>
      </div>` : ''}

    ${isAdmin() ? `
      <div class="callout callout-admin">
        <p>🧑‍🏫 ${esc(t('home.adminHint'))}</p>
        <a class="btn btn-secondary" href="#/admin">${esc(t('nav.admin'))}</a>
      </div>` : ''}

    <section class="card">
      <h2>${esc(t('home.yourVerbs'))}</h2>
      ${listSelector()}
      <p>${t('home.verbCount', { visible: `<strong>${visible.length}</strong>`, total: `<strong>${state.verbs.length}</strong>` })}</p>
      <p class="muted">${esc(t('home.weekCount', { open, total: weeks.length }))}</p>
      ${noWeeksNotice()}
      <div class="actions-grid">
        <a class="action-tile tile-practice" href="#/practicar"><span aria-hidden="true">🎯</span>${esc(t('nav.practice'))}</a>
        <a class="action-tile tile-study" href="#/estudiar"><span aria-hidden="true">📚</span>${esc(t('nav.study'))}</a>
        <a class="action-tile tile-groups" href="#/grupos"><span aria-hidden="true">🏆</span>${esc(t('nav.groups'))}</a>
      </div>
    </section>

    <section class="card">
      <h2>${esc(t('home.records'))}</h2>
      <div class="stats-grid">
        ${recordTile(records, 'meaning')}
        ${recordTile(records, 'random')}
      </div>
    </section>`;

  bindListSelector(root, rerender);
  bindNoWeeks(root);
}
