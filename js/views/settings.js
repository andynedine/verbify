// ---------- Ajustes ----------
import { api, state, prefs, savePrefs, isDemo } from '../state.js';
import { t, applyLang } from '../i18n.js';
import { esc, canSpeak, speak, englishVoices, isNaturalVoice, setPreferredVoice, onVoicesChanged } from '../utils.js';
import { $, toast, showError, confirmBox, openDialog } from '../ui.js';
import { applyTheme, reloadSession } from '../app.js';
import { logout, changePassword } from '../account.js';

const ROLE = { student: 'role.student', admin: 'role.admin', superadmin: 'role.superadmin' };

function sw(name, label, checked, help = '') {
  return `<label class="switch-row"><input type="checkbox" name="${name}" role="switch" ${checked ? 'checked' : ''}>
    <span>${label}${help ? `<small class="help block">${esc(help)}</small>` : ''}</span></label>`;
}

export function render(root, { rerender }) {
  const p = state.profile;
  root.innerHTML = `
    <h1>⚙️ ${esc(t('settings.title'))}</h1>
    <form id="prefs" class="stack" novalidate>
      <fieldset class="card">
        <legend>${esc(t('settings.look'))}</legend>
        <div class="field">
          <label for="lang">🌍 ${esc(t('settings.lang'))}</label>
          <select id="lang" name="lang">
            <option value="es" ${prefs.lang === 'es' ? 'selected' : ''}>Español</option>
            <option value="en" ${prefs.lang === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
        <div class="field">
          <span class="label" id="theme-l">🌗 ${esc(t('settings.theme'))}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="theme-l">
            ${['auto', 'light', 'dark'].map((v) => `<label><input type="radio" name="theme" value="${v}" ${prefs.theme === v ? 'checked' : ''}><span>${esc(t('settings.theme.' + v))}</span></label>`).join('')}
          </div>
        </div>
        ${sw('anim', '🎉 ' + esc(t('settings.anim')), prefs.anim)}
      </fieldset>

      <fieldset class="card">
        <legend>${esc(t('settings.practice'))}</legend>
        ${canSpeak() ? `
          ${sw('speech', '🔊 ' + esc(t('settings.speech')), prefs.speech, t('settings.speechHelp'))}
          ${sw('autoSpeak', '🗣️ ' + esc(t('settings.autoSpeak')), prefs.autoSpeak)}
          <div class="field voice-field">
            <label for="voice">🎙️ ${esc(t('settings.voice'))}</label>
            <div class="voice-row">
              <select id="voice" name="voice" aria-describedby="voice-help"></select>
              <button type="button" class="btn btn-small btn-secondary" id="test-voice">▶️ ${esc(t('settings.testVoice'))}</button>
            </div>
            <p class="help" id="voice-help">${esc(t('settings.voiceHelp'))}</p>
          </div>`
          : `<p class="muted">${esc(t('settings.noSpeech'))}</p>`}
        ${sw('timer', '⏱ ' + esc(t('settings.timer')), prefs.timer, t('settings.timerHelp'))}
      </fieldset>
    </form>

    ${p ? `
    <section class="card">
      <h2>${esc(t('settings.account'))}</h2>
      <p>👤 <strong>${esc(p.nick)}</strong> · ${esc(t(ROLE[p.role]))}</p>
      <div class="btn-row">
        <button class="btn btn-secondary" id="chg-pwd">🔑 ${esc(t('settings.changePwd'))}</button>
        <button class="btn btn-ghost-danger" id="logout">🚪 ${esc(t('settings.logout'))}</button>
      </div>
    </section>` : `
    <section class="card"><a class="btn btn-primary" href="#/entrar">${esc(t('auth.loginBtn'))}</a></section>`}

    ${isDemo() ? `
    <section class="card">
      <h2>🧪 ${esc(t('demo.title'))}</h2>
      <p class="help">${esc(t('demo.help'))}</p>
      <button class="btn btn-danger" id="reset-demo">${esc(t('demo.reset'))}</button>
    </section>` : ''}

    <p class="muted small center">Verbify v1.4 · ${esc(t('settings.privacy'))}</p>`;

  const form = $('#prefs', root);
  form.addEventListener('change', (e) => {
    const el = e.target;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    savePrefs({ [el.name]: val });
    if (el.name === 'theme') applyTheme();
    if (el.name === 'lang') { applyLang(); rerender(); toast(t('settings.saved'), 'ok'); return; }
    toast(t('settings.saved'), 'ok', 1500);
  });
  $('#test-voice', root)?.addEventListener('click', () => speak('go, went, gone'));

  // Lista de voces (el navegador las carga con retraso, por eso se rellena al cambiar)
  const voiceSel = $('#voice', root);
  const fillVoices = () => {
    if (!voiceSel) return;
    const list = englishVoices();
    const label = (v) => `${isNaturalVoice(v) ? '⭐ ' : ''}${v.name} (${v.lang})`;
    voiceSel.innerHTML = `<option value="">${esc(t('settings.voiceAuto'))}${list[0] ? ' – ' + esc(list[0].name) : ''}</option>`
      + list.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === prefs.voice ? 'selected' : ''}>${esc(label(v))}</option>`).join('');
  };
  fillVoices();
  const off = onVoicesChanged(fillVoices);
  voiceSel?.addEventListener('change', () => {
    const uri = voiceSel.value;
    savePrefs({ voice: uri }); // antes de recargar la lista, para que no se pierda la selección
    setPreferredVoice(uri);
    speak('go, went, gone');
  });

  $('#logout', root)?.addEventListener('click', logout);
  $('#chg-pwd', root)?.addEventListener('click', changePassword);

  $('#reset-demo', root)?.addEventListener('click', async () => {
    if (!(await confirmBox(t('demo.resetConfirm'), { danger: true, okText: t('demo.reset') }))) return;
    try { await api.resetDemo(); state.profile = null; await reloadSession('#/entrar'); } catch (e) { showError(e); }
  });
  return off;
}
