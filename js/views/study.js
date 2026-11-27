// ---------- Estudiar: lista de verbos en tarjetas ----------
import { state, prefs, visibleVerbs, weeksOf, unlockedSet, patternName } from '../state.js';
import { t } from '../i18n.js';
import { esc, showAlts, normalize, byInfinitive, speak, canSpeak } from '../utils.js';
import { $ } from '../ui.js';
import { listSelector, bindListSelector } from './home.js';

const view = { scope: 'visible', sort: 'alpha', q: '', hide: false };

function card(v, unlocked) {
  const locked = !v.week || !unlocked.has(v.week);
  const hid = (field, label) => (view.hide
    ? `<button type="button" class="reveal" data-reveal aria-label="${esc(t('study.reveal'))}: ${esc(label)}">${esc(t('study.tapToSee'))}</button>
       <span class="revealed" hidden>${esc(showAlts(v[field]))}</span>`
    : `<span>${esc(showAlts(v[field]))}</span>`);
  return `
    <article class="verb-card ${locked ? 'is-locked' : ''}">
      <header class="verb-card-head">
        <h3 lang="en">${esc(showAlts(v.infinitive))}</h3>
        ${prefs.speech && canSpeak() ? `<button type="button" class="btn-icon" data-speak="${esc(`${v.infinitive}, ${v.past}, ${v.participle}`)}" aria-label="${esc(t('common.listen'))}: ${esc(v.infinitive)}">🔊</button>` : ''}
      </header>
      <dl class="verb-forms">
        <div><dt>${esc(t('field.pastShort'))}</dt><dd lang="en">${hid('past', t('field.pastShort'))}</dd></div>
        <div><dt>${esc(t('field.participleShort'))}</dt><dd lang="en">${hid('participle', t('field.participleShort'))}</dd></div>
        <div><dt>${esc(t('field.meaningShort'))}</dt><dd lang="es">${hid('meaning', t('field.meaningShort'))}</dd></div>
      </dl>
      <footer class="verb-card-foot">
        ${v.week ? `<span class="tag">${locked ? '🔒 ' : '🔓 '}${esc(t('common.weekShort', { n: v.week }))}</span>` : `<span class="tag">🔒 ${esc(t('study.noWeek'))}</span>`}
        ${v.pattern_id ? `<span class="tag tag-pattern">${esc(patternName(v.pattern_id))}</span>` : ''}
      </footer>
    </article>`;
}

function groupHtml(title, verbs, unlocked) {
  return `
    <section class="verb-group">
      <h2 class="group-title">${esc(title)} <span class="count">(${verbs.length})</span></h2>
      <div class="verb-grid">${verbs.map((v) => card(v, unlocked)).join('')}</div>
    </section>`;
}

function renderList(root) {
  const unlocked = unlockedSet();
  let verbs = view.scope === 'visible' ? visibleVerbs() : state.verbs.slice();
  const q = normalize(view.q);
  if (q) {
    verbs = verbs.filter((v) => [v.infinitive, v.past, v.participle, v.meaning].some((x) => normalize(x).includes(q)));
  }
  verbs.sort(byInfinitive);
  const box = $('#study-list', root);
  if (!verbs.length) {
    box.innerHTML = `<p class="callout callout-warn">${esc(view.scope === 'visible' && !q ? t('practice.noneVisible') : t('study.empty'))}</p>`;
    return;
  }
  const order = state.patterns.map((p) => p.id);
  const byPattern = (list) => {
    const groups = order.map((id) => ({ title: patternName(id), verbs: list.filter((v) => v.pattern_id === id) }));
    groups.push({ title: t('study.noPattern'), verbs: list.filter((v) => !v.pattern_id || !order.includes(v.pattern_id)) });
    return groups.filter((g) => g.verbs.length);
  };
  let html = '';
  if (view.scope === 'week') {
    const weeks = weeksOf(verbs);
    for (const w of weeks) {
      const wv = verbs.filter((v) => v.week === w);
      const title = `${unlocked.has(w) ? '🔓' : '🔒'} ${t('common.week', { n: w })}`;
      if (view.sort === 'pattern') {
        html += `<section class="verb-group"><h2 class="group-title">${esc(title)} <span class="count">(${wv.length})</span></h2>
          ${byPattern(wv).map((g) => `<h3 class="sub-title">${esc(g.title)}</h3><div class="verb-grid">${g.verbs.map((v) => card(v, unlocked)).join('')}</div>`).join('')}</section>`;
      } else html += groupHtml(title, wv, unlocked);
    }
    const nw = verbs.filter((v) => !v.week);
    if (nw.length) html += groupHtml(t('study.noWeek'), nw, unlocked);
  } else if (view.sort === 'pattern') {
    html = byPattern(verbs).map((g) => groupHtml(g.title, g.verbs, unlocked)).join('');
  } else {
    html = `<p class="muted small">${esc(t('study.count', { n: verbs.length }))}</p><div class="verb-grid">${verbs.map((v) => card(v, unlocked)).join('')}</div>`;
  }
  box.innerHTML = html;
}

export function render(root, { rerender }) {
  root.innerHTML = `
    <h1>📚 ${esc(t('study.title'))}</h1>
    ${listSelector('list-select-s')}
    <div class="card toolbar">
      <div class="segmented" role="radiogroup" aria-label="${esc(t('study.show'))}">
        ${['visible', 'week', 'all'].map((s) => `<label><input type="radio" name="scope" value="${s}" ${view.scope === s ? 'checked' : ''}><span>${esc(t('study.scope.' + s))}</span></label>`).join('')}
      </div>
      <div class="toolbar-row">
        <div class="field">
          <label for="sort">${esc(t('study.sort'))}</label>
          <select id="sort">
            <option value="alpha" ${view.sort === 'alpha' ? 'selected' : ''}>${esc(t('study.sortAlpha'))}</option>
            <option value="pattern" ${view.sort === 'pattern' ? 'selected' : ''}>${esc(t('study.sortPattern'))}</option>
          </select>
        </div>
        <div class="field">
          <label for="q">${esc(t('study.search'))}</label>
          <input id="q" type="search" value="${esc(view.q)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
      </div>
      <label class="switch-row"><input type="checkbox" id="hide" role="switch" ${view.hide ? 'checked' : ''}><span>🙈 ${esc(t('study.hide'))}</span></label>
    </div>
    <div id="study-list" aria-live="polite"></div>`;

  root.querySelectorAll('input[name=scope]').forEach((r) => r.addEventListener('change', () => { view.scope = r.value; renderList(root); }));
  $('#sort', root).addEventListener('change', (e) => { view.sort = e.target.value; renderList(root); });
  $('#q', root).addEventListener('input', (e) => { view.q = e.target.value; renderList(root); });
  $('#hide', root).addEventListener('change', (e) => { view.hide = e.target.checked; renderList(root); });
  const onClick = (e) => {
    const s = e.target.closest('[data-speak]');
    if (s) speak(s.dataset.speak);
    const r = e.target.closest('[data-reveal]');
    if (r) { const sib = r.nextElementSibling; sib.hidden = false; sib.tabIndex = -1; r.remove(); sib.focus(); }
  };
  root.addEventListener('click', onClick);
  bindListSelector(root, rerender, 'list-select-s');
  renderList(root);
  return () => root.removeEventListener('click', onClick);
}
