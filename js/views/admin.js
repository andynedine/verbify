// ---------- Panel del profe (administración) ----------
import { api, state, isSuper, refreshActiveList, refreshLists } from '../state.js';
import { t } from '../i18n.js';
import { esc, showAlts, cleanAlts, normalize, byInfinitive, parseVerbsCsv, toCsv, download } from '../utils.js';
import { $, $$, toast, showError, confirmBox, openDialog, alertBox, loading } from '../ui.js';
import { listLabel } from './home.js';

const TABS = ['verbos', 'semanas', 'patrones', 'miembros', 'importar', 'lista'];
const ICONS = { verbos: '📝', semanas: '📅', patrones: '🧩', miembros: '👥', importar: '📥', lista: '📋' };
const SEL_KEY = 'verbify-admin-list';
const ui = { q: '', week: '' };
let data = { list: null, verbs: [], patterns: [] };
let preview = null;

function editableLists() {
  if (isSuper()) return state.lists;
  return state.lists.filter((l) => l.owner_id === state.profile.id);
}

async function loadData(listId) {
  await refreshLists();
  const lists = editableLists();
  const list = lists.find((l) => l.id === listId) || lists[0] || null;
  data = { list, verbs: [], patterns: [] };
  if (list) Object.assign(data, await api.getListData(list.id));
  data.verbs.sort(byInfinitive);
  try { sessionStorage.setItem(SEL_KEY, list?.id || ''); } catch { /* ignore */ }
}

async function afterChange() {
  await loadData(data.list.id);
  if (state.list?.id === data.list.id) await refreshActiveList(data.list.id);
}

const pName = (id) => data.patterns.find((p) => p.id === id)?.name || '';
const weeksIn = () => [...new Set(data.verbs.map((v) => v.week).filter(Boolean))].sort((a, b) => a - b);

// ===================== VERBOS =====================
function verbForm(v = {}) {
  const maxWeek = Math.max(0, ...weeksIn());
  return `
    <div class="form-grid">
      <div class="field"><label for="f-inf">${esc(t('field.infinitive'))}</label>
        <input id="f-inf" name="infinitive" required maxlength="60" value="${esc(v.infinitive || '')}" autocapitalize="off" spellcheck="false" lang="en"></div>
      <div class="field"><label for="f-past">${esc(t('field.past'))}</label>
        <input id="f-past" name="past" required maxlength="60" value="${esc(v.past || '')}" autocapitalize="off" spellcheck="false" lang="en"></div>
      <div class="field"><label for="f-part">${esc(t('field.participle'))}</label>
        <input id="f-part" name="participle" required maxlength="60" value="${esc(v.participle || '')}" autocapitalize="off" spellcheck="false" lang="en"></div>
      <div class="field"><label for="f-mean">${esc(t('field.meaning'))}</label>
        <input id="f-mean" name="meaning" required maxlength="120" value="${esc(v.meaning || '')}" autocapitalize="off" lang="es"></div>
    </div>
    <p class="help">💡 ${esc(t('admin.altsHelp'))}</p>
    <div class="form-grid">
      <div class="field"><label for="f-pat">${esc(t('admin.pattern'))}</label>
        <select id="f-pat" name="pattern_id"><option value="">— ${esc(t('study.noPattern'))} —</option>
          ${data.patterns.map((p) => `<option value="${p.id}" ${p.id === v.pattern_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="f-week">${esc(t('admin.week'))}</label>
        <input id="f-week" name="week" type="number" inputmode="numeric" min="1" max="99" value="${v.week ?? (v.id ? '' : maxWeek || '')}"></div>
    </div>`;
}

async function editVerb(v, rerender) {
  const r = await openDialog({
    title: v?.id ? t('admin.editVerb') : t('admin.addVerb'),
    body: verbForm(v || {}),
    okText: t('common.save'),
    onSubmit: async (f) => {
      const row = {
        id: v?.id, list_id: data.list.id,
        infinitive: cleanAlts(f.infinitive.value), past: cleanAlts(f.past.value),
        participle: cleanAlts(f.participle.value), meaning: cleanAlts(f.meaning.value),
        pattern_id: f.pattern_id.value || null, week: parseInt(f.week.value, 10) || null,
      };
      if (!row.infinitive || !row.past || !row.participle || !row.meaning) throw t('admin.fillAll');
      if (row.week !== null && (row.week < 1 || row.week > 99)) throw t('admin.weekRange');
      await api.saveVerb(row);
      return true;
    },
  });
  if (r) { await afterChange(); toast(t('common.saved'), 'ok'); rerender(); }
}

function tabVerbs(box, rerender) {
  const weeks = weeksIn();
  const q = normalize(ui.q);
  const list = data.verbs.filter((v) => {
    if (ui.week === 'none' && v.week) return false;
    if (ui.week && ui.week !== 'none' && v.week !== Number(ui.week)) return false;
    return !q || [v.infinitive, v.past, v.participle, v.meaning].some((x) => normalize(x).includes(q));
  });
  box.innerHTML = `
    <div class="toolbar-row">
      <div class="field"><label for="aq">${esc(t('study.search'))}</label>
        <input id="aq" type="search" value="${esc(ui.q)}" autocomplete="off" autocapitalize="off"></div>
      <div class="field"><label for="aw">${esc(t('admin.week'))}</label>
        <select id="aw"><option value="">${esc(t('admin.allWeeks'))}</option>
          ${weeks.map((w) => `<option value="${w}" ${String(w) === ui.week ? 'selected' : ''}>${esc(t('common.week', { n: w }))}</option>`).join('')}
          <option value="none" ${ui.week === 'none' ? 'selected' : ''}>${esc(t('study.noWeek'))}</option></select></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="add-verb">＋ ${esc(t('admin.addVerb'))}</button></div>
    <p class="muted small" aria-live="polite">${esc(t('admin.showing', { n: list.length, total: data.verbs.length }))}</p>
    <ul class="admin-list">
      ${list.map((v) => `
        <li class="admin-item">
          <div class="admin-item-main">
            <strong lang="en">${esc(showAlts(v.infinitive))}</strong> – <span lang="en">${esc(showAlts(v.past))} – ${esc(showAlts(v.participle))}</span>
            <span class="muted">· ${esc(showAlts(v.meaning))}</span>
            <div class="tags">
              ${v.week ? `<span class="tag">${(data.list.unlocked_weeks || []).includes(v.week) ? '🔓' : '🔒'} ${esc(t('common.weekShort', { n: v.week }))}</span>` : `<span class="tag">${esc(t('study.noWeek'))}</span>`}
              ${v.pattern_id ? `<span class="tag tag-pattern">${esc(pName(v.pattern_id))}</span>` : ''}
            </div>
          </div>
          <div class="admin-item-actions">
            <button class="btn btn-small btn-secondary" data-edit="${v.id}" aria-label="${esc(t('common.edit'))} ${esc(v.infinitive)}">✏️ <span class="hide-xs">${esc(t('common.edit'))}</span></button>
            <button class="btn btn-small btn-ghost-danger" data-del="${v.id}" aria-label="${esc(t('common.delete'))} ${esc(v.infinitive)}">🗑️ <span class="hide-xs">${esc(t('common.delete'))}</span></button>
          </div>
        </li>`).join('')}
    </ul>`;
  $('#aq', box).addEventListener('input', (e) => {
    ui.q = e.target.value;
    const pos = e.target.selectionStart;
    tabVerbs(box, rerender);
    const inp = $('#aq', box); inp.focus(); inp.setSelectionRange(pos, pos);
  });
  $('#aw', box).addEventListener('change', (e) => { ui.week = e.target.value; tabVerbs(box, rerender); });
  $('#add-verb', box).addEventListener('click', () => editVerb(null, rerender));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => editVerb(data.verbs.find((v) => v.id === b.dataset.edit), rerender)));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
    const v = data.verbs.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(t('admin.deleteVerbConfirm', { verb: v.infinitive }), { okText: t('common.delete'), danger: true }))) return;
    try { await api.deleteVerb(v.id); await afterChange(); toast(t('common.deleted'), 'ok'); rerender(); } catch (e) { showError(e); }
  }));
}

// ===================== SEMANAS =====================
function tabWeeks(box, rerender) {
  const weeks = weeksIn();
  const open = new Set(data.list.unlocked_weeks || []);
  const noWeek = data.verbs.filter((v) => !v.week);
  box.innerHTML = `
    <p class="help">${esc(t('admin.weeksHelp'))}</p>
    <div class="btn-row">
      <button class="btn btn-secondary" id="open-all">🔓 ${esc(t('admin.openAll'))}</button>
      <button class="btn btn-ghost" id="close-all">🔒 ${esc(t('admin.closeAll'))}</button>
    </div>
    <form class="inline-form card-sub" id="distribute">
      <label for="per">${esc(t('admin.distributeLabel'))}</label>
      <input id="per" name="per" type="number" min="1" max="50" value="5" inputmode="numeric">
      <button class="btn btn-secondary" type="submit">${esc(t('admin.distribute'))}</button>
    </form>
    <ul class="week-list">
      ${weeks.map((w) => {
        const vs = data.verbs.filter((v) => v.week === w);
        const isOpen = open.has(w);
        return `<li class="week-card ${isOpen ? 'is-open' : ''}">
          <div class="week-head">
            <h3>${esc(t('common.week', { n: w }))} <span class="count">(${vs.length})</span></h3>
            <button class="toggle ${isOpen ? 'on' : ''}" data-week="${w}" aria-pressed="${isOpen}" aria-label="${esc(t('common.week', { n: w }))}: ${esc(isOpen ? t('admin.open') : t('admin.closed'))}">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
              <span>${isOpen ? '🔓 ' + esc(t('admin.open')) : '🔒 ' + esc(t('admin.closed'))}</span>
            </button>
          </div>
          <p class="week-verbs" lang="en">${vs.map((v) => esc(v.infinitive)).join(' · ')}</p>
        </li>`;
      }).join('')}
    </ul>
    ${noWeek.length ? `<div class="callout callout-warn"><strong>${esc(t('study.noWeek'))} (${noWeek.length}):</strong> <span lang="en">${noWeek.map((v) => esc(v.infinitive)).join(' · ')}</span></div>` : ''}`;

  const save = async (weeksArr) => {
    try {
      const l = await api.updateList(data.list.id, { unlocked_weeks: [...weeksArr].sort((a, b) => a - b) });
      data.list.unlocked_weeks = l.unlocked_weeks;
      await afterChange();
      await rerender();
    } catch (e) { showError(e); }
  };
  $$('[data-week]', box).forEach((b) => b.addEventListener('click', async () => {
    const w = Number(b.dataset.week);
    const s = new Set(open);
    if (s.has(w)) s.delete(w); else s.add(w);
    await save(s);
    toast(t(s.has(w) ? 'admin.weekOpened' : 'admin.weekClosed', { n: w }), 'ok');
    $(`[data-week="${w}"]`)?.focus();
  }));
  $('#open-all', box).addEventListener('click', async () => {
    if (await confirmBox(t('admin.openAllConfirm'))) save(new Set(weeks));
  });
  $('#close-all', box).addEventListener('click', async () => {
    if (await confirmBox(t('admin.closeAllConfirm'))) save(new Set());
  });
  $('#distribute', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const per = Math.max(1, Math.min(50, parseInt(e.target.per.value, 10) || 5));
    if (!(await confirmBox(t('admin.distributeConfirm', { n: per }), { danger: true }))) return;
    const sorted = data.verbs.slice().sort(byInfinitive);
    const changes = sorted.map((v, i) => ({ id: v.id, week: Math.floor(i / per) + 1 })).filter((c, i) => sorted[i].week !== c.week);
    try { await api.updateVerbsWeeks(changes); await afterChange(); toast(t('common.saved'), 'ok'); rerender(); } catch (ex) { showError(ex); }
  });
}

// ===================== PATRONES =====================
function tabPatterns(box, rerender) {
  const pats = data.patterns.slice().sort((a, b) => a.sort - b.sort);
  box.innerHTML = `
    <p class="help">${esc(t('admin.patternsHelp'))}</p>
    <form class="inline-form" id="add-pat">
      <label for="pn">${esc(t('admin.newPattern'))}</label>
      <input id="pn" name="pn" maxlength="80" required placeholder="${esc(t('admin.patternPh'))}">
      <button class="btn btn-primary" type="submit">＋ ${esc(t('common.add'))}</button>
    </form>
    <ul class="admin-list">
      ${pats.map((p, i) => {
        const n = data.verbs.filter((v) => v.pattern_id === p.id).length;
        return `<li class="admin-item">
          <div class="admin-item-main"><strong>${esc(p.name)}</strong> <span class="count">(${n})</span>
            <p class="muted small" lang="en">${data.verbs.filter((v) => v.pattern_id === p.id).slice(0, 12).map((v) => esc(v.infinitive)).join(' · ')}${n > 12 ? ' …' : ''}</p></div>
          <div class="admin-item-actions">
            <button class="btn btn-small btn-ghost" data-up="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('admin.moveUp'))}: ${esc(p.name)}">↑</button>
            <button class="btn btn-small btn-ghost" data-down="${p.id}" ${i === pats.length - 1 ? 'disabled' : ''} aria-label="${esc(t('admin.moveDown'))}: ${esc(p.name)}">↓</button>
            <button class="btn btn-small btn-secondary" data-ren="${p.id}" aria-label="${esc(t('common.edit'))}: ${esc(p.name)}">✏️</button>
            <button class="btn btn-small btn-ghost-danger" data-delp="${p.id}" aria-label="${esc(t('common.delete'))}: ${esc(p.name)}">🗑️</button>
          </div>
        </li>`;
      }).join('')}
    </ul>
    <p class="help">${esc(t('admin.assignHelp'))}</p>`;

  $('#add-pat', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.pn.value.trim();
    if (!name) return;
    try {
      await api.savePattern({ list_id: data.list.id, name, sort: Math.max(0, ...pats.map((p) => p.sort)) + 1 });
      await afterChange(); toast(t('common.saved'), 'ok'); rerender();
    } catch (ex) { showError(ex); }
  });
  const swap = async (id, dir) => {
    const i = pats.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= pats.length) return;
    const a = pats[i], b = pats[j];
    try {
      await api.savePattern({ ...a, sort: j + 1 });
      await api.savePattern({ ...b, sort: i + 1 });
      // normaliza el orden del resto
      await afterChange(); rerender();
    } catch (ex) { showError(ex); }
  };
  $$('[data-up]', box).forEach((b) => b.addEventListener('click', () => swap(b.dataset.up, -1)));
  $$('[data-down]', box).forEach((b) => b.addEventListener('click', () => swap(b.dataset.down, 1)));
  $$('[data-ren]', box).forEach((b) => b.addEventListener('click', async () => {
    const p = pats.find((x) => x.id === b.dataset.ren);
    const r = await openDialog({
      title: t('admin.renamePattern'),
      body: `<div class="field"><label for="rp">${esc(t('admin.patternName'))}</label><input id="rp" name="rp" maxlength="80" value="${esc(p.name)}" required></div>`,
      okText: t('common.save'),
      onSubmit: async (f) => { const n = f.rp.value.trim(); if (!n) throw t('admin.fillAll'); await api.savePattern({ ...p, name: n }); return true; },
    });
    if (r) { await afterChange(); rerender(); }
  }));
  $$('[data-delp]', box).forEach((b) => b.addEventListener('click', async () => {
    const p = pats.find((x) => x.id === b.dataset.delp);
    if (!(await confirmBox(t('admin.deletePatternConfirm', { name: p.name }), { okText: t('common.delete'), danger: true }))) return;
    try { await api.deletePattern(p.id); await afterChange(); toast(t('common.deleted'), 'ok'); rerender(); } catch (ex) { showError(ex); }
  }));
}

// ===================== IMPORTAR / EXPORTAR =====================
function tabImport(box, rerender) {
  box.innerHTML = `
    <section class="card-sub">
      <h3>📥 ${esc(t('admin.importTitle'))}</h3>
      <p class="help">${esc(t('admin.importHelp'))}</p>
      <pre class="code-sample" lang="es">infinitivo;pasado;participio;significado;patron;semana
go;went;gone;ir;Totalmente diferentes (go-went-gone);7
be;"was, were";been;"ser, estar";;1</pre>
      <p class="help">${esc(t('admin.importHelp2'))}</p>
      <div class="btn-row"><button class="btn btn-ghost" id="tpl">⬇️ ${esc(t('admin.template'))}</button></div>
      <div class="field">
        <label for="file">${esc(t('admin.chooseFile'))}</label>
        <input id="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain">
      </div>
      <div class="field">
        <label for="paste">${esc(t('admin.orPaste'))}</label>
        <textarea id="paste" rows="6" spellcheck="false" autocapitalize="off"></textarea>
      </div>
      <button class="btn btn-secondary" id="do-preview">👀 ${esc(t('admin.preview'))}</button>
      <div id="preview" aria-live="polite"></div>
    </section>
    <section class="card-sub">
      <h3>📤 ${esc(t('admin.exportTitle'))}</h3>
      <p class="help">${esc(t('admin.exportHelp'))}</p>
      <button class="btn btn-secondary" id="export">⬇️ ${esc(t('admin.export'))}</button>
    </section>`;

  const showPreview = () => {
    const pv = $('#preview', box);
    if (!preview) { pv.innerHTML = ''; return; }
    const { items, errors } = preview;
    const existing = new Set(data.verbs.map((v) => v.infinitive.toLowerCase()));
    const nNew = items.filter((i) => !existing.has(i.infinitive.toLowerCase())).length;
    pv.innerHTML = `
      <div class="callout ${items.length ? '' : 'callout-warn'}">
        <p><strong>${esc(t('admin.previewCount', { n: items.length, nNew, nUpd: items.length - nNew }))}</strong></p>
        ${errors.length ? `<p>⚠️ ${esc(t('admin.previewErrors', { lines: errors.slice(0, 15).join(', ') + (errors.length > 15 ? '…' : '') }))}</p>` : ''}
      </div>
      ${items.length ? `
        <ul class="preview-list">
          ${items.slice(0, 30).map((i) => `<li><strong lang="en">${esc(showAlts(i.infinitive))}</strong> – ${esc(showAlts(i.past))} – ${esc(showAlts(i.participle))}
            <span class="muted">· ${esc(showAlts(i.meaning))}</span>
            ${i.pattern ? `<span class="tag tag-pattern">${esc(i.pattern)}</span>` : ''}${i.week ? `<span class="tag">${esc(t('common.weekShort', { n: i.week }))}</span>` : ''}</li>`).join('')}
          ${items.length > 30 ? `<li class="muted">… +${items.length - 30}</li>` : ''}
        </ul>
        <fieldset class="radio-list">
          <legend>${esc(t('admin.importMode'))}</legend>
          <label class="radio-row"><input type="radio" name="imode" value="merge" checked><span>${esc(t('admin.importMerge'))}</span></label>
          <label class="radio-row"><input type="radio" name="imode" value="replace"><span>${esc(t('admin.importReplace'))}</span></label>
        </fieldset>
        <button class="btn btn-primary btn-big" id="do-import">📥 ${esc(t('admin.importBtn', { n: items.length }))}</button>` : ''}`;
    $('#do-import', pv)?.addEventListener('click', async () => {
      const replace = $('input[name=imode]:checked', pv).value === 'replace';
      if (replace && !(await confirmBox(t('admin.replaceConfirm', { n: data.verbs.length }), { danger: true, okText: t('admin.importReplaceShort') }))) return;
      const btn = $('#do-import', pv); btn.disabled = true;
      try {
        const r = await api.importVerbs(data.list.id, items, replace);
        preview = null;
        await afterChange();
        toast(t('admin.importDone', { ins: r.inserted, upd: r.updated }), 'ok', 6000);
        rerender();
      } catch (e) { showError(e); btn.disabled = false; }
    });
  };
  showPreview();

  $('#file', box).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    let text = await f.text();
    // Excel en Windows a veces guarda en Latin-1
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
    $('#paste', box).value = text;
    preview = parseVerbsCsv(text);
    showPreview();
  });
  $('#do-preview', box).addEventListener('click', () => {
    preview = parseVerbsCsv($('#paste', box).value);
    showPreview();
  });
  $('#tpl', box).addEventListener('click', () => {
    download('plantilla-verbify.csv', '﻿infinitivo;pasado;participio;significado;patron;semana\r\ngo;went;gone;ir;Totalmente diferentes (go-went-gone);1\r\nbe;was, were;been;ser, estar;;1\r\n');
  });
  $('#export', box).addEventListener('click', () => {
    const name = normalize(data.list.name).replace(/[^a-z0-9]+/g, '-') || 'verbos';
    download(`verbify-${name}.csv`, toCsv(data.verbs, data.patterns));
  });
}

// ===================== LISTA =====================
function tabList(box, rerender) {
  const groups = state.groups.filter((g) => g.list_id === data.list.id);
  box.innerHTML = `
    ${data.list.is_master ? `<p class="callout callout-warn">⭐ ${esc(t('admin.masterNote'))}</p>` : ''}
    <form class="inline-form" id="ren-list">
      <label for="ln">${esc(t('admin.listName'))}</label>
      <input id="ln" name="ln" maxlength="60" value="${esc(data.list.name)}" required>
      <button class="btn btn-primary" type="submit">${esc(t('common.save'))}</button>
    </form>
    <ul class="info-list">
      <li>📝 ${esc(t('admin.infoVerbs', { n: data.verbs.length }))}</li>
      <li>📅 ${esc(t('admin.infoWeeks', { open: (data.list.unlocked_weeks || []).length, n: weeksIn().length }))}</li>
      <li>🧩 ${esc(t('admin.infoPatterns', { n: data.patterns.length }))}</li>
      <li>👥 ${esc(t('admin.infoGroups'))}: ${groups.length ? groups.map((g) => `<a href="#/grupos/${g.id}">${esc(g.name)}</a> <code>${esc(g.code)}</code>`).join(', ') : esc(t('admin.noGroups'))}</li>
    </ul>
    <p class="help">${esc(t('admin.listHelp'))}</p>
    <a class="btn btn-secondary" href="#/grupos">🏆 ${esc(t('admin.goGroups'))}</a>`;
  $('#ren-list', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.ln.value.trim();
    if (!name) return;
    try { await api.updateList(data.list.id, { name }); await afterChange(); toast(t('common.saved'), 'ok'); rerender(); } catch (ex) { showError(ex); }
  });
}

// ===================== MIEMBROS =====================
// Alumnos de todos los grupos que ha creado el profe, agrupados por grupo,
// con el botón de restablecer contraseña siempre a mano.
const membersUi = { q: '' };

function memberRow(m, g, groups) {
  const others = groups.filter((o) => o.id !== g.id && o.members.some((x) => x.user_id === m.user_id));
  return `
    <li class="member">
      <span class="member-name">${esc(m.nick)}
        ${m.role !== 'student' ? `<span class="tag">🧑‍🏫 ${esc(t('groups.adult'))}</span>` : ''}
        ${m.reset_hint ? `<small class="muted block">${esc(t('groups.resetHint'))}: <code>${esc(m.reset_hint)}</code></small>` : ''}
        ${others.length ? `<small class="muted block">${esc(t('admin.alsoIn'))}: ${others.map((o) => esc(o.name)).join(', ')}</small>` : ''}
      </span>
      <span class="member-actions">
        ${m.reset_hint ? `<button class="btn btn-small btn-secondary" data-reset="${m.user_id}" data-nick="${esc(m.nick)}">🔑 ${esc(t('groups.reset'))}</button>` : ''}
        <button class="btn btn-small btn-ghost-danger" data-kick="${m.user_id}" data-group="${g.id}" data-nick="${esc(m.nick)}" data-gname="${esc(g.name)}"
          aria-label="${esc(t('admin.kickFrom', { nick: m.nick, group: g.name }))}">${esc(t('groups.kick'))}</button>
      </span>
    </li>`;
}

async function tabMembers(box) {
  loading(box);
  let groups = [];
  try {
    state.groups = await api.myGroups();
    groups = state.groups.filter((g) => g.is_owner);
    const lists = await Promise.all(groups.map((g) => api.groupMembers(g.id)));
    groups = groups.map((g, i) => ({ ...g, members: lists[i].filter((m) => m.user_id !== state.profile.id) }));
  } catch (e) { showError(e); }

  if (!groups.length) {
    box.innerHTML = `<p class="callout">👥 ${esc(t('admin.membersNoGroups'))}</p>
      <a class="btn btn-secondary" href="#/grupos">✨ ${esc(t('groups.create'))}</a>`;
    return;
  }

  const draw = () => {
    const q = normalize(membersUi.q);
    const total = new Set(groups.flatMap((g) => g.members.map((m) => m.user_id))).size;
    const sections = groups.map((g) => {
      const ms = g.members.filter((m) => !q || normalize(m.nick).includes(q));
      if (q && !ms.length) return '';
      return `
        <section class="member-group">
          <h3 class="member-group-title">
            <a href="#/grupos/${g.id}">${esc(g.name)}</a>
            <span class="tag tag-code">#${esc(g.code)}</span>
            <span class="count">(${g.members.length})</span>
          </h3>
          ${ms.length
            ? `<ul class="member-list">${ms.map((m) => memberRow(m, g, groups)).join('')}</ul>`
            : `<p class="muted">${esc(t('admin.membersEmpty', { code: g.code }))}</p>`}
        </section>`;
    }).join('');
    $('#members-out', box).innerHTML = `
      <p class="muted small">${esc(t('admin.membersCount', { n: total, g: groups.length }))}</p>
      ${sections || `<p class="callout">${esc(t('study.empty'))}</p>`}`;
  };

  box.innerHTML = `
    <p class="help">🔑 ${esc(t('groups.resetInfo'))}</p>
    <div class="field"><label for="mq">${esc(t('admin.searchStudent'))}</label>
      <input id="mq" type="search" value="${esc(membersUi.q)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <div id="members-out" aria-live="polite"></div>`;
  draw();

  $('#mq', box).addEventListener('input', (e) => { membersUi.q = e.target.value; draw(); });
  box.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-reset]');
    if (r) {
      if (!(await confirmBox(t('groups.resetConfirm', { nick: r.dataset.nick }), { okText: t('groups.reset') }))) return;
      try {
        const pwd = await api.resetPassword(r.dataset.reset);
        await alertBox(t('groups.resetDone'), `<p>${esc(t('groups.resetDoneMsg', { nick: r.dataset.nick }))}</p><p class="code-big">${esc(pwd)}</p>`);
      } catch (ex) { showError(ex); }
      return;
    }
    const k = e.target.closest('[data-kick]');
    if (!k) return;
    if (!(await confirmBox(t('admin.kickConfirmFrom', { nick: k.dataset.nick, group: k.dataset.gname }), { okText: t('groups.kick'), danger: true }))) return;
    try {
      await api.removeMember(k.dataset.group, k.dataset.kick);
      const g = groups.find((x) => x.id === k.dataset.group);
      g.members = g.members.filter((m) => m.user_id !== k.dataset.kick);
      toast(t('groups.kicked'), 'ok');
      draw();
    } catch (ex) { showError(ex); }
  });
}

// ===================== RENDER =====================
export async function render(root, { params, rerender }) {
  const tab = TABS.includes(params[0]) ? params[0] : 'verbos';
  loading(root);
  let saved = null;
  try { saved = sessionStorage.getItem(SEL_KEY); } catch { /* ignore */ }
  try { await loadData(data.list?.id || saved); } catch (e) { showError(e); }
  const lists = editableLists();

  if (!data.list) {
    root.innerHTML = `<h1>🛠️ ${esc(t('admin.title'))}</h1><p class="callout callout-warn">${esc(t('admin.noList'))}</p>`;
    return;
  }

  root.innerHTML = `
    <h1>🛠️ ${esc(t('admin.title'))}</h1>
    ${lists.length > 1 ? `
      <div class="field list-picker">
        <label for="admin-list">${esc(t('admin.editing'))}</label>
        <select id="admin-list">${lists.map((l) => `<option value="${l.id}" ${l.id === data.list.id ? 'selected' : ''}>${esc(listLabel(l))}</option>`).join('')}</select>
      </div>` : `<p class="muted">${esc(t('admin.editing'))}: <strong>${esc(listLabel(data.list))}</strong></p>`}
    <nav class="tabs" aria-label="${esc(t('admin.sections'))}">
      ${TABS.map((k) => `<a class="tab" href="#/admin/${k}" ${k === tab ? 'aria-current="page"' : ''}><span aria-hidden="true">${ICONS[k]}</span> ${esc(t('admin.tab.' + k))}</a>`).join('')}
    </nav>
    <section class="card" id="tab-box" aria-label="${esc(t('admin.tab.' + tab))}"></section>`;

  $('#admin-list', root)?.addEventListener('change', async (e) => {
    try { sessionStorage.setItem(SEL_KEY, e.target.value); } catch { /* ignore */ }
    data.list = { id: e.target.value };
    preview = null;
    rerender();
  });
  const box = $('#tab-box', root);
  ({ verbos: tabVerbs, semanas: tabWeeks, patrones: tabPatterns, miembros: tabMembers, importar: tabImport, lista: tabList })[tab](box, rerender);
}
