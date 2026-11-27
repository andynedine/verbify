// ---------- Grupos y ranking ----------
import { api, state, isAdmin, isSuper, loadAll } from '../state.js';
import { t } from '../i18n.js';
import { esc, fmtTime } from '../utils.js';
import { $, $$, toast, showError, confirmBox, openDialog, alertBox, errorText, loading } from '../ui.js';
import { listLabel } from './home.js';

const rankView = { mode: 'meaning', period: 'week' };

async function refreshGroups() {
  state.groups = await api.myGroups();
}

// ===================== LISTA DE GRUPOS =====================
async function renderIndex(root) {
  loading(root);
  try { await refreshGroups(); } catch (e) { showError(e); }
  root.innerHTML = `
    <h1>🏆 ${esc(t('groups.title'))}</h1>
    <p class="lead">${esc(t('groups.intro'))}</p>

    <div class="two-col">
      <form class="card" id="join-form" novalidate>
        <h2>🔑 ${esc(t('groups.join'))}</h2>
        <div class="field">
          <label for="code">${esc(t('groups.code'))}</label>
          <input id="code" name="code" required maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" class="input-code" placeholder="ABC123">
        </div>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${esc(t('groups.joinBtn'))}</button>
      </form>

      <form class="card" id="create-form" novalidate>
        <h2>✨ ${esc(t('groups.create'))}</h2>
        <div class="field">
          <label for="gname">${esc(t('groups.name'))}</label>
          <input id="gname" name="gname" required maxlength="40" autocomplete="off" placeholder="${esc(t(isAdmin() ? 'groups.namePhAdmin' : 'groups.namePh'))}">
        </div>
        <p class="help">${esc(t(isAdmin() ? 'groups.createHelpAdmin' : 'groups.createHelp'))}</p>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-secondary btn-block" type="submit">${esc(t('groups.createBtn'))}</button>
      </form>
    </div>

    <section>
      <h2>${esc(t('groups.mine'))}</h2>
      ${state.groups.length ? `<ul class="group-list">
        ${state.groups.map((g) => `
          <li><a class="group-card card" href="#/grupos/${g.id}">
            <span class="group-name">${esc(g.name)}</span>
            <span class="group-meta">
              <span class="tag">👥 ${g.member_count}</span>
              <span class="tag tag-code">#${esc(g.code)}</span>
              ${g.is_owner ? `<span class="tag tag-owner">⭐ ${esc(t('groups.youCreated'))}</span>` : ''}
            </span>
          </a></li>`).join('')}
      </ul>` : `<p class="callout">${esc(t('groups.none'))}</p>`}
    </section>`;

  const join = $('#join-form', root);
  join.code.addEventListener('input', () => { join.code.value = join.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  join.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', join); err.hidden = true;
    const code = join.code.value.trim();
    if (code.length !== 6) { err.textContent = t('groups.codeInvalid'); err.hidden = false; join.code.focus(); return; }
    try {
      const g = await api.joinGroup(code);
      await loadAll();
      toast(t('groups.joined', { name: g.name }), 'ok');
      location.hash = '#/grupos/' + g.id;
    } catch (ex) { err.textContent = errorText(ex); err.hidden = false; }
  });

  const create = $('#create-form', root);
  create.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', create); err.hidden = true;
    const name = create.gname.value.trim();
    if (!name) { err.textContent = t('err.NAME_INVALID'); err.hidden = false; create.gname.focus(); return; }
    try {
      const g = await api.createGroup(name);
      await loadAll();
      toast(t('groups.created', { code: g.code }), 'ok', 6000);
      location.hash = '#/grupos/' + g.id;
    } catch (ex) { err.textContent = errorText(ex); err.hidden = false; }
  });
}

// ===================== DETALLE DE UN GRUPO =====================
function rankingHtml(rows) {
  if (!rows.length) return `<p class="callout">${esc(t('rank.empty'))}</p>`;
  const medal = ['🥇', '🥈', '🥉'];
  let pos = 0;
  return `<ol class="ranking">
    ${rows.map((r) => {
      const has = r.score !== null && r.score !== undefined;
      if (has) pos++;
      const me = r.user_id === state.profile.id;
      return `<li class="rank-row ${me ? 'is-me' : ''} ${has ? '' : 'no-score'}">
        <span class="rank-pos" aria-label="${has ? esc(t('rank.position', { n: pos })) : ''}">${has ? (medal[pos - 1] || pos) : '·'}</span>
        <span class="rank-nick">${esc(r.nick)}${me ? ` <small>(${esc(t('rank.you'))})</small>` : ''}
          <small class="rank-sub">${r.current_streak ? `🔥 ${r.current_streak} ` : ''}${r.best_combo ? `⚡ ${r.best_combo}` : ''}</small></span>
        <span class="rank-score">${has ? `<strong>${r.score}</strong> <small>${esc(t('common.pts'))}</small>
          <small class="rank-sub">${r.correct}/${r.total} · ⏱ ${fmtTime(r.time_ms)}</small>` : `<small>${esc(t('rank.noGames'))}</small>`}</span>
      </li>`;
    }).join('')}
  </ol>`;
}

async function loadRanking(root, gid) {
  const box = $('#ranking', root);
  box.setAttribute('aria-busy', 'true');
  try {
    const rows = await api.groupRanking(gid, rankView.mode, rankView.period);
    box.innerHTML = rankingHtml(rows);
  } catch (e) { box.innerHTML = `<p class="callout callout-warn">${esc(errorText(e))}</p>`; }
  box.removeAttribute('aria-busy');
}

async function renderDetail(root, gid, rerender) {
  loading(root);
  let members = [];
  try {
    await refreshGroups();
    members = await api.groupMembers(gid);
  } catch (e) { showError(e); }
  const g = state.groups.find((x) => x.id === gid);
  if (!g) {
    root.innerHTML = `<h1>${esc(t('groups.notFound'))}</h1><a class="btn btn-secondary" href="#/grupos">← ${esc(t('groups.back'))}</a>`;
    return;
  }
  const list = state.lists.find((l) => l.id === g.list_id);
  const canReset = isSuper() || (isAdmin() && g.is_owner);
  const canKick = g.is_owner || isSuper();

  root.innerHTML = `
    <a class="back-link" href="#/grupos">← ${esc(t('groups.back'))}</a>
    <section class="card group-head">
      <h1>${esc(g.name)}</h1>
      <div class="code-box">
        <span class="muted">${esc(t('groups.code'))}</span>
        <strong class="code-big" aria-label="${esc(t('groups.code'))}: ${esc(g.code.split('').join(' '))}">${esc(g.code)}</strong>
        <button class="btn btn-small btn-secondary" id="copy-code">📋 ${esc(t('groups.copy'))}</button>
        ${navigator.share ? `<button class="btn btn-small btn-ghost" id="share-code">📤 ${esc(t('groups.share'))}</button>` : ''}
      </div>
      ${list ? `<p class="muted small">📋 ${esc(t('groups.usesList'))}: ${esc(listLabel(list))}</p>` : ''}
    </section>

    <section class="card">
      <h2>🏆 ${esc(t('rank.title'))}</h2>
      <div class="segmented" role="radiogroup" aria-label="${esc(t('rank.mode'))}">
        <label><input type="radio" name="rmode" value="meaning" ${rankView.mode === 'meaning' ? 'checked' : ''}><span>${esc(t('mode.meaning.short'))}</span></label>
        <label><input type="radio" name="rmode" value="random" ${rankView.mode === 'random' ? 'checked' : ''}><span>${esc(t('mode.random.short'))}</span></label>
      </div>
      <div class="segmented" role="radiogroup" aria-label="${esc(t('rank.period'))}">
        <label><input type="radio" name="rperiod" value="week" ${rankView.period === 'week' ? 'checked' : ''}><span>📅 ${esc(t('rank.week'))}</span></label>
        <label><input type="radio" name="rperiod" value="all" ${rankView.period === 'all' ? 'checked' : ''}><span>🏛️ ${esc(t('rank.all'))}</span></label>
      </div>
      <div id="ranking" aria-live="polite"></div>
      <p class="help">${esc(t('rank.howPoints'))}</p>
    </section>

    <section class="card">
      <h2>👥 ${esc(t('groups.members'))} <span class="count">(${members.length})</span></h2>
      ${canReset ? `<p class="help">🔑 ${esc(t('groups.resetInfo'))}</p>` : ''}
      <ul class="member-list">
        ${members.map((m) => `
          <li class="member">
            <span class="member-name">${esc(m.nick)} ${m.is_owner ? `<span class="tag tag-owner">⭐ ${esc(t('groups.owner'))}</span>` : ''}
              ${m.role !== 'student' ? `<span class="tag">🧑‍🏫 ${esc(t('groups.adult'))}</span>` : ''}
              ${m.reset_hint ? `<small class="muted block">${esc(t('groups.resetHint'))}: <code>${esc(m.reset_hint)}</code></small>` : ''}</span>
            <span class="member-actions">
              ${canReset && m.reset_hint ? `<button class="btn btn-small btn-secondary" data-reset="${m.user_id}" data-nick="${esc(m.nick)}">🔑 ${esc(t('groups.reset'))}</button>` : ''}
              ${canKick && m.user_id !== state.profile.id ? `<button class="btn btn-small btn-ghost-danger" data-kick="${m.user_id}" data-nick="${esc(m.nick)}">${esc(t('groups.kick'))}</button>` : ''}
            </span>
          </li>`).join('')}
      </ul>
    </section>

    <section class="card danger-zone">
      <h2>${esc(t('groups.options'))}</h2>
      <div class="btn-row">
        ${g.is_owner ? `<button class="btn btn-secondary" id="rename">✏️ ${esc(t('groups.rename'))}</button>
          <button class="btn btn-danger" id="delete">🗑️ ${esc(t('groups.delete'))}</button>`
        : `<button class="btn btn-ghost-danger" id="leave">🚪 ${esc(t('groups.leave'))}</button>`}
      </div>
    </section>`;

  loadRanking(root, gid);
  $$('input[name=rmode], input[name=rperiod]', root).forEach((r) => r.addEventListener('change', () => {
    rankView[r.name === 'rmode' ? 'mode' : 'period'] = r.value;
    loadRanking(root, gid);
  }));

  const shareText = t('groups.shareText', { name: g.name, code: g.code, url: location.origin + location.pathname });
  $('#copy-code', root).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(g.code); toast(t('groups.copied'), 'ok'); }
    catch { toast(g.code); }
  });
  $('#share-code', root)?.addEventListener('click', () => navigator.share({ title: 'Verbify', text: shareText }).catch(() => {}));

  root.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox(t('groups.resetConfirm', { nick: b.dataset.nick }), { okText: t('groups.reset') }))) return;
    try {
      const pwd = await api.resetPassword(b.dataset.reset);
      await alertBox(t('groups.resetDone'), `<p>${esc(t('groups.resetDoneMsg', { nick: b.dataset.nick }))}</p><p class="code-big">${esc(pwd)}</p>`);
    } catch (e) { showError(e); }
  }));
  root.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox(t('groups.kickConfirm', { nick: b.dataset.nick }), { okText: t('groups.kick'), danger: true }))) return;
    try { await api.removeMember(gid, b.dataset.kick); toast(t('groups.kicked'), 'ok'); rerender(); } catch (e) { showError(e); }
  }));
  $('#leave', root)?.addEventListener('click', async () => {
    if (!(await confirmBox(t('groups.leaveConfirm', { name: g.name }), { okText: t('groups.leave'), danger: true }))) return;
    try { await api.leaveGroup(gid); await loadAll(); location.hash = '#/grupos'; } catch (e) { showError(e); }
  });
  $('#delete', root)?.addEventListener('click', async () => {
    if (!(await confirmBox(t('groups.deleteConfirm', { name: g.name }), { okText: t('groups.delete'), danger: true }))) return;
    try { await api.deleteGroup(gid); await loadAll(); toast(t('groups.deleted'), 'ok'); location.hash = '#/grupos'; } catch (e) { showError(e); }
  });
  $('#rename', root)?.addEventListener('click', async () => {
    const r = await openDialog({
      title: t('groups.rename'),
      body: `<div class="field"><label for="rn">${esc(t('groups.name'))}</label><input id="rn" name="rn" maxlength="40" value="${esc(g.name)}" required></div>`,
      okText: t('common.save'),
      onSubmit: async (f) => { const n = f.rn.value.trim(); if (!n) throw t('err.NAME_INVALID'); await api.renameGroup(gid, n); return true; },
    });
    if (r) rerender();
  });
}

export function render(root, { params, rerender }) {
  if (params[0]) return renderDetail(root, params[0], rerender);
  return renderIndex(root);
}
