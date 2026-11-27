// ---------- Acciones de la cuenta (usadas en Ajustes y en el menú del nick) ----------
import { api, state } from './state.js';
import { t } from './i18n.js';
import { toast, confirmBox, openDialog, pwdField } from './ui.js';

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
    body: pwdField('np', t('settings.newPwd'), 'new-password') + pwdField('np2', t('auth.password2'), 'new-password'),
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
