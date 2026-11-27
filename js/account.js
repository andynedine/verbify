// ---------- Acciones de la cuenta (usadas en Ajustes y en el menú del nick) ----------
import { api, state } from './state.js';
import { t } from './i18n.js';
import { esc } from './utils.js';
import { toast, confirmBox, openDialog } from './ui.js';

export async function logout() {
  if (!(await confirmBox(t('settings.logoutConfirm'), { okText: t('settings.logout') }))) return;
  await api.signOut();
  state.profile = null;
  state.groups = []; state.lists = []; state.verbs = []; state.list = null;
  try { localStorage.removeItem('verbify-cache'); } catch { /* ignore */ }
  location.hash = '#/entrar';
}

export function changePassword() {
  return openDialog({
    title: t('settings.changePwd'),
    body: `<div class="field"><label for="np">${esc(t('settings.newPwd'))}</label>
      <input id="np" name="np" type="password" minlength="6" required autocomplete="new-password"></div>
      <div class="field"><label for="np2">${esc(t('auth.password2'))}</label>
      <input id="np2" name="np2" type="password" minlength="6" required autocomplete="new-password"></div>`,
    okText: t('common.save'),
    onSubmit: async (f) => {
      if (f.np.value.length < 6) throw t('err.WEAK_PASSWORD');
      if (f.np.value !== f.np2.value) throw t('auth.pwdMismatch');
      await api.changePassword(f.np.value);
      toast(t('settings.pwdChanged'), 'ok');
      return true;
    },
  });
}
