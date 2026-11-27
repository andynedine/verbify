// ---------- Practicar: configuración, quiz y resultados ----------
import { api, state, prefs, visibleVerbs, weeksOf, unlockedSet } from '../state.js';
import { t } from '../i18n.js';
import { esc, FIELDS, shuffle, splitAlts, isCorrect, showAlts, fmtTime, speak, canSpeak, score } from '../utils.js';
import { $, $$, confirmBox, celebrate, shake, toast } from '../ui.js';
import { listSelector, bindListSelector, noWeeksNotice, bindNoWeeks, hasNoOpenWeeks } from './home.js';

const MAX_ATTEMPTS = 3;
const setup = { mode: 'meaning', source: 'visible', weeks: [], count: 'all', timer: null };
let quiz = null;
let timerId = null;

function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

function poolFor(cfg) {
  if (cfg.source === 'visible') return visibleVerbs();
  if (cfg.source === 'weeks') { const s = new Set(cfg.weeks); return state.verbs.filter((v) => s.has(v.week)); }
  return state.verbs.slice();
}

const isEn = (f) => f !== 'meaning';
// Con cronómetro (modo examen) no hay audio durante la partida para no perder tiempo;
// se puede escuchar todo en el resumen final.
const quizAudio = () => prefs.speech && !setup.timer;
const listenBtn = (text) => (canSpeak()
  ? `<button type="button" class="btn-icon" data-speak="${esc(text)}" aria-label="${esc(t('common.listen'))}: ${esc(text)}">🔊</button>` : '');
const speakBtn = (text) => (quizAudio() && canSpeak()
  ? `<button type="button" class="btn-icon" data-speak="${esc(text)}" aria-label="${esc(t('common.listen'))}: ${esc(text)}">🔊</button>` : '');

function onSpeakClick(e) {
  const b = e.target.closest('[data-speak]');
  if (b) speak(b.dataset.speak);
}

// ===================== CONFIGURACIÓN =====================
function renderSetup(root) {
  stopTimer();
  quiz = null;
  if (setup.timer === null) setup.timer = prefs.timer;
  // Sin semanas abiertas: propone directamente "Todo el listado"
  // (y vuelve a "Todos los abiertos" en cuanto el profe abra alguna semana)
  if (hasNoOpenWeeks() && setup.source === 'visible') { setup.source = 'all'; setup.autoAll = true; }
  else if (!hasNoOpenWeeks() && setup.autoAll) { setup.source = 'visible'; setup.autoAll = false; }
  const weeks = weeksOf(state.verbs);
  const unlocked = unlockedSet();
  setup.weeks = setup.weeks.filter((w) => weeks.includes(w));
  const vis = visibleVerbs().length;

  root.innerHTML = `
    <h1>🎯 ${esc(t('practice.title'))}</h1>
    ${listSelector('list-select-p')}
    ${noWeeksNotice()}
    <form id="setup" class="stack" novalidate>
      <fieldset class="card">
        <legend>${esc(t('practice.modeLegend'))}</legend>
        <div class="choice-grid">
          <label class="choice"><input type="radio" name="mode" value="meaning" ${setup.mode === 'meaning' ? 'checked' : ''}>
            <span class="choice-body"><span class="choice-icon" aria-hidden="true">🔤</span>
            <strong>${esc(t('mode.meaning.title'))}</strong><small>${esc(t('mode.meaning.desc'))}</small></span></label>
          <label class="choice"><input type="radio" name="mode" value="random" ${setup.mode === 'random' ? 'checked' : ''}>
            <span class="choice-body"><span class="choice-icon" aria-hidden="true">🎲</span>
            <strong>${esc(t('mode.random.title'))}</strong><small>${esc(t('mode.random.desc'))}</small></span></label>
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>${esc(t('practice.sourceLegend'))}</legend>
        <div class="radio-list">
          <label class="radio-row"><input type="radio" name="source" value="visible" ${setup.source === 'visible' ? 'checked' : ''}>
            <span>${esc(t('source.visible'))} <span class="count">(${vis})</span></span></label>
          <label class="radio-row"><input type="radio" name="source" value="weeks" ${setup.source === 'weeks' ? 'checked' : ''}>
            <span>${esc(t('source.weeks'))}</span></label>
          <div class="week-chips" id="week-chips" ${setup.source === 'weeks' ? '' : 'hidden'} role="group" aria-label="${esc(t('source.weeks'))}">
            ${weeks.length ? weeks.map((w) => {
              const n = state.verbs.filter((v) => v.week === w).length;
              const locked = !unlocked.has(w);
              return `<label class="chip-check ${locked ? 'locked' : ''}"><input type="checkbox" name="week" value="${w}" ${setup.weeks.includes(w) ? 'checked' : ''}>
                <span>${locked ? '🔒 ' : ''}${esc(t('common.weekShort', { n: w }))} <small>(${n})</small></span></label>`;
            }).join('') : `<p class="muted">${esc(t('practice.noWeeks'))}</p>`}
          </div>
          <label class="radio-row"><input type="radio" name="source" value="all" ${setup.source === 'all' ? 'checked' : ''}>
            <span>${esc(t('source.all'))} <span class="count">(${state.verbs.length})</span></span></label>
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>${esc(t('practice.optionsLegend'))}</legend>
        <div class="field">
          <label for="count">${esc(t('practice.howMany'))}</label>
          <select id="count" name="count"></select>
        </div>
        <label class="switch-row"><input type="checkbox" name="timer" role="switch" ${setup.timer ? 'checked' : ''}>
          <span>⏱ ${esc(t('practice.showTimer'))}<small class="help block">${esc(t('practice.timerAudioHelp'))}</small></span></label>
      </fieldset>

      <p id="pool-msg" class="callout" aria-live="polite"></p>
      <button type="submit" class="btn btn-primary btn-big btn-block" id="start">${esc(t('practice.start'))} 🚀</button>
    </form>`;

  const form = $('#setup', root);
  const countSel = $('#count', root);
  const update = () => {
    setup.mode = form.mode.value;
    setup.source = form.source.value;
    setup.weeks = $$('input[name=week]:checked', form).map((i) => Number(i.value));
    setup.timer = form.timer.checked;
    $('#week-chips', root).hidden = setup.source !== 'weeks';
    const n = poolFor(setup).length;
    const prev = setup.count;
    let opts = `<option value="all">${esc(t('practice.all', { n }))}</option>`;
    for (let k = 5; k < n; k += 5) opts += `<option value="${k}">${k}</option>`;
    countSel.innerHTML = opts;
    countSel.value = prev !== 'all' && Number(prev) < n ? String(prev) : 'all';
    setup.count = countSel.value;
    const msg = $('#pool-msg', root);
    if (n === 0) {
      msg.textContent = setup.source === 'visible' ? t('practice.noneVisible') : t('practice.noneSelected');
      msg.className = 'callout callout-warn';
    } else {
      const k = setup.count === 'all' ? n : Number(setup.count);
      msg.textContent = t('practice.summary', { n: k });
      msg.className = 'callout';
    }
    $('#start', root).disabled = n === 0;
  };
  form.addEventListener('change', (e) => { if (e.target.id === 'count') setup.count = countSel.value; update(); });
  update();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pool = shuffle(poolFor(setup));
    if (!pool.length) return;
    const k = setup.count === 'all' ? pool.length : Math.min(Number(setup.count), pool.length);
    startQuiz(root, pool.slice(0, k), false);
  });
  bindListSelector(root, () => { setup.source = 'visible'; renderSetup(root); }, 'list-select-p');
  bindNoWeeks(root, () => {
    form.querySelector('input[name=source][value=all]').checked = true;
    update();
    form.querySelector('#start').focus();
  });
}

// ===================== QUIZ =====================
function makeItem(verb, mode) {
  const hint = mode === 'meaning' ? 'meaning' : FIELDS[Math.floor(Math.random() * FIELDS.length)];
  const ask = FIELDS.filter((f) => f !== hint);
  // Otros verbos con la misma pista (p. ej. "hacer" = do / make) también se aceptan
  const hintSet = new Set(splitAlts(verb[hint], { english: isEn(hint) }));
  let cands = state.verbs.filter((v) => splitAlts(v[hint], { english: isEn(hint) }).some((x) => hintSet.has(x)));
  if (!cands.some((c) => c.id === verb.id)) cands = [verb, ...cands];
  return { verb, hint, ask, cands, attempts: 0, ok: {}, result: null, solution: verb, answers: {} };
}

function startQuiz(root, verbs, review) {
  stopTimer();
  quiz = {
    root, review, mode: setup.mode,
    items: shuffle(verbs).map((v) => makeItem(v, setup.mode)),
    idx: 0, first: 0, retry: 0, fail: 0, combo: 0, bestCombo: 0,
    startAt: Date.now(), endAt: null,
  };
  timerId = setInterval(() => {
    const c = $('#clock', root);
    if (c) c.textContent = '⏱ ' + fmtTime(Date.now() - quiz.startAt);
  }, 1000);
  renderQuestion();
}

function metaBar() {
  const q = quiz;
  const pct = Math.round((q.idx / q.items.length) * 100);
  return `
    <div class="quiz-top">
      <div class="quiz-meta">
        <span class="quiz-count">${esc(t('quiz.progress', { i: Math.min(q.idx + 1, q.items.length), n: q.items.length }))}</span>
        <span class="badge badge-ok" title="${esc(t('quiz.firstTry'))}">✅ <span id="m-first">${q.first}</span></span>
        <span class="badge badge-bad" title="${esc(t('quiz.failed'))}">❌ <span id="m-fail">${q.fail}</span></span>
        <span class="badge badge-combo" title="${esc(t('quiz.combo'))}">⚡ <span id="m-combo">${q.combo}</span></span>
        ${setup.timer ? `<span class="badge badge-clock" id="clock" role="timer" aria-live="off">⏱ ${fmtTime(Date.now() - q.startAt)}</span>` : ''}
      </div>
      <div class="progress" role="progressbar" aria-label="${esc(t('quiz.progressLabel'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="progress-bar" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function renderQuestion() {
  const { root } = quiz;
  const item = quiz.items[quiz.idx];
  const hintText = showAlts(item.verb[item.hint]);
  root.innerHTML = `
    ${metaBar()}
    <section class="card quiz-card ${quiz.review ? 'is-review' : ''}" id="qcard">
      ${quiz.review ? `<p class="tag tag-review">🔁 ${esc(t('quiz.reviewRound'))}</p>` : ''}
      <h1 class="hint-label">${esc(t('field.' + item.hint))}</h1>
      <p class="hint-word" lang="${isEn(item.hint) ? 'en' : 'es'}">${esc(hintText)} ${isEn(item.hint) ? speakBtn(item.verb[item.hint]) : ''}</p>
      <form id="qform" novalidate autocomplete="off">
        ${item.ask.map((f) => `
          <div class="field qfield" data-f="${f}">
            <label for="a-${f}">${esc(t('field.' + f))}</label>
            <input id="a-${f}" name="${f}" type="text" lang="${isEn(f) ? 'en' : 'es'}" autocomplete="off" autocapitalize="off"
              autocorrect="off" spellcheck="false" enterkeyhint="next" maxlength="80" aria-describedby="s-${f}">
            <p class="solution" id="s-${f}"></p>
          </div>`).join('')}
        <div class="attempts" aria-hidden="true">${[1, 2, 3].map((n) => `<span class="dot" data-n="${n}"></span>`).join('')}</div>
        <p class="attempt-text muted small" id="attempt-text">${esc(t('quiz.attempt', { n: 1, max: MAX_ATTEMPTS }))}</p>
        <p class="feedback" id="feedback" role="status" aria-live="assertive"></p>
        <div class="full-answer" id="full-answer" hidden></div>
        <button type="submit" class="btn btn-primary btn-big btn-block" id="qbtn">${esc(t('quiz.check'))}</button>
      </form>
    </section>
    <button type="button" class="btn btn-ghost" id="quit">✖ ${esc(t('quiz.quit'))}</button>`;

  const form = $('#qform', root);
  const inputs = $$('input', form);
  inputs[0].focus();
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const i = inputs.indexOf(e.target);
    const next = inputs.slice(i + 1).find((x) => !x.readOnly && !x.value.trim());
    if (next && !item.result) { e.preventDefault(); next.focus(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); onCheck(); });
  $('#quit', root).addEventListener('click', async () => {
    if (await confirmBox(t('quiz.quitConfirm'), { okText: t('quiz.quit'), danger: true })) renderSetup(root);
  });
}

function evaluate(item, answers) {
  let best = null;
  for (const c of item.cands) {
    const res = {}; let n = 0;
    for (const f of item.ask) {
      const ok = isCorrect(answers[f], new Set(splitAlts(c[f], { english: isEn(f) })), isEn(f));
      res[f] = ok; if (ok) n++;
    }
    const lockedOk = item.ask.every((f) => !item.ok[f] || res[f]);
    const rank = n + (lockedOk ? 100 : 0) + (c.id === item.verb.id ? 0.5 : 0);
    if (!best || rank > best.rank) best = { c, res, n, rank };
  }
  return best;
}

function onCheck() {
  const { root } = quiz;
  const item = quiz.items[quiz.idx];
  const form = $('#qform', root);
  const fb = $('#feedback', root);

  if (item.result) { next(); return; }

  const answers = {};
  item.ask.forEach((f) => { answers[f] = form[f].value; });
  const empty = item.ask.find((f) => !item.ok[f] && !answers[f].trim());
  if (empty) {
    fb.className = 'feedback feedback-info';
    fb.textContent = t('quiz.fillAll');
    form[empty].focus();
    return;
  }

  item.attempts++;
  item.answers = answers;
  const best = evaluate(item, answers);
  item.solution = best.c;
  item.ask.forEach((f) => {
    const inp = form[f];
    const wrap = inp.closest('.qfield');
    item.ok[f] = best.res[f];
    wrap.classList.toggle('is-ok', best.res[f]);
    wrap.classList.toggle('is-bad', !best.res[f]);
    inp.setAttribute('aria-invalid', String(!best.res[f]));
    if (best.res[f]) inp.readOnly = true;
  });
  $$('.dot', root).forEach((d) => {
    const n = Number(d.dataset.n);
    d.classList.toggle('used', n <= item.attempts);
  });

  const allOk = item.ask.every((f) => item.ok[f]);
  if (allOk) {
    item.result = item.attempts === 1 ? 'first' : 'retry';
    if (item.result === 'first') { quiz.first++; quiz.combo++; quiz.bestCombo = Math.max(quiz.bestCombo, quiz.combo); }
    else { quiz.retry++; quiz.combo = 0; }
    fb.className = 'feedback feedback-ok';
    fb.textContent = item.result === 'first'
      ? (quiz.combo >= 3 ? t('quiz.perfectCombo', { n: quiz.combo }) : t('quiz.perfect'))
      : t('quiz.okRetry', { n: item.attempts });
    celebrate($('#qcard', root));
    finishItem(item);
  } else if (item.attempts >= MAX_ATTEMPTS) {
    item.result = 'fail';
    quiz.fail++; quiz.combo = 0;
    item.ask.forEach((f) => {
      if (!item.ok[f]) {
        const s = $('#s-' + f, root);
        s.innerHTML = `<span aria-hidden="true">✗</span> ${esc(t('quiz.solution'))}: <strong>${esc(showAlts(best.c[f]))}</strong>`;
        s.classList.add('show');
      }
    });
    fb.className = 'feedback feedback-bad';
    fb.textContent = t('quiz.failedMsg');
    shake($('#qcard', root));
    finishItem(item);
  } else {
    const left = MAX_ATTEMPTS - item.attempts;
    fb.className = 'feedback feedback-bad';
    fb.textContent = t('quiz.tryAgain', { n: left });
    $('#attempt-text', root).textContent = t('quiz.attempt', { n: item.attempts + 1, max: MAX_ATTEMPTS });
    shake($('#qcard', root));
    const firstBad = item.ask.find((f) => !item.ok[f]);
    form[firstBad].focus();
    form[firstBad].select();
  }
  $('#m-first', root).textContent = quiz.first;
  $('#m-fail', root).textContent = quiz.fail;
  $('#m-combo', root).textContent = quiz.combo;
}

function finishItem(item) {
  const { root } = quiz;
  $$('#qform input', root).forEach((i) => { i.readOnly = true; });
  const v = item.solution;
  const full = $('#full-answer', root);
  full.innerHTML = `<span lang="en"><strong>${esc(showAlts(v.infinitive))}</strong> – ${esc(showAlts(v.past))} – ${esc(showAlts(v.participle))}</span>
    ${speakBtn(`${v.infinitive}, ${v.past}, ${v.participle}`)}
    <span class="muted">· ${esc(showAlts(v.meaning))}</span>`;
  full.hidden = false;
  $('#attempt-text', root).textContent = '';
  const last = quiz.idx === quiz.items.length - 1;
  const btn = $('#qbtn', root);
  btn.textContent = last ? t('quiz.seeResults') + ' 🏁' : t('quiz.next') + ' →';
  btn.focus();
  if (quizAudio() && prefs.autoSpeak) speak(`${v.infinitive}, ${v.past}, ${v.participle}`);
}

function next() {
  quiz.idx++;
  if (quiz.idx >= quiz.items.length) finishQuiz();
  else renderQuestion();
}

// ===================== RESULTADOS =====================
async function finishQuiz() {
  stopTimer();
  const q = quiz;
  q.endAt = Date.now();
  const total = q.items.length;
  const timeMs = q.endAt - q.startAt;
  let saved = null;
  if (!q.review) {
    try {
      saved = await api.submitResult({ mode: q.mode, correct: q.first, total, timeMs, combo: q.bestCombo });
      Object.assign(state.profile, {
        current_streak: saved.current_streak, best_streak: saved.best_streak,
        best_combo: saved.best_combo, last_play_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
      });
    } catch (e) {
      toast(t('quiz.notSaved'), 'error');
    }
  }
  const pts = saved?.score ?? score(q.first, total);
  const toReview = q.items.filter((i) => i.result !== 'first').map((i) => i.verb);
  const icon = { first: '✅', retry: '🟡', fail: '❌' };
  const { root } = q;

  root.innerHTML = `
    <section class="card results">
      <h1>${esc(q.review ? t('results.reviewTitle') : t('results.title'))} ${q.first === total ? '🏆' : '🎉'}</h1>
      ${q.review ? `<p class="muted">${esc(t('results.reviewNote'))}</p>` : `
        <p class="score-big" id="score-big"><span>${pts}</span> ${esc(t('common.pts'))}</p>
        <div class="record-badges">
          ${saved?.record_all ? `<span class="tag tag-gold">🏆 ${esc(t('results.newRecordAll'))}</span>` : ''}
          ${saved?.record_week ? `<span class="tag tag-silver">⭐ ${esc(t('results.newRecordWeek'))}</span>` : ''}
          ${saved ? `<span class="tag">🔥 ${esc(t('results.streak', { n: saved.current_streak }))}</span>` : ''}
        </div>`}
      <div class="stats-grid stats-4">
        <div class="stat-card stat-ok"><span class="stat-num">${q.first}/${total}</span><span>✅ ${esc(t('quiz.firstTry'))}</span></div>
        <div class="stat-card stat-mid"><span class="stat-num">${q.retry}</span><span>🟡 ${esc(t('quiz.retry'))}</span></div>
        <div class="stat-card stat-bad"><span class="stat-num">${q.fail}</span><span>❌ ${esc(t('quiz.failed'))}</span></div>
        <div class="stat-card"><span class="stat-num">${fmtTime(timeMs)}</span><span>⏱ ${esc(t('results.time'))}</span></div>
      </div>
      <p class="muted center">⚡ ${esc(t('results.bestCombo', { n: q.bestCombo }))}</p>
      <div class="results-actions">
        ${toReview.length ? `<button class="btn btn-primary btn-big" id="r-review">🔁 ${esc(t('results.review', { n: toReview.length }))}</button>` : ''}
        <button class="btn ${toReview.length ? 'btn-secondary' : 'btn-primary btn-big'}" id="r-again">🎯 ${esc(t('results.again'))}</button>
        <button class="btn btn-ghost" id="r-setup">⚙️ ${esc(t('results.changeOptions'))}</button>
      </div>
    </section>
    <section class="card">
      <h2>${esc(t('results.detail'))}</h2>
      <ul class="result-list">
        ${q.items.map((i) => `
          <li class="result-item r-${i.result}">
            <span class="r-icon" aria-label="${esc(t('results.status.' + i.result))}">${icon[i.result]}</span>
            <span class="r-text"><strong lang="en">${esc(showAlts(i.verb.infinitive))}</strong> – <span lang="en">${esc(showAlts(i.verb.past))} – ${esc(showAlts(i.verb.participle))}</span>
            <span class="muted">· ${esc(showAlts(i.verb.meaning))}</span></span>
            ${listenBtn(`${i.verb.infinitive}, ${i.verb.past}, ${i.verb.participle}`)}
          </li>`).join('')}
      </ul>
    </section>`;

  if (q.first > 0) celebrate($('#score-big', root) || $('.results h1', root));
  $('#r-review', root)?.addEventListener('click', () => startQuiz(root, toReview, true));
  $('#r-again', root).addEventListener('click', () => {
    const pool = shuffle(poolFor(setup));
    const k = setup.count === 'all' ? pool.length : Math.min(Number(setup.count), pool.length);
    if (k) startQuiz(root, pool.slice(0, k), false); else renderSetup(root);
  });
  $('#r-setup', root).addEventListener('click', () => renderSetup(root));
  $('.results h1', root).setAttribute('tabindex', '-1');
  $('.results h1', root).focus();
}

export function render(root) {
  root.addEventListener('click', onSpeakClick);
  renderSetup(root);
  return () => { stopTimer(); quiz = null; root.removeEventListener('click', onSpeakClick); };
}
