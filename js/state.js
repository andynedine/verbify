// ---------- Estado global de la app ----------
import { CONFIG } from './config.js';

export let api = null;
export const isDemo = () => api?.kind === 'demo';

export async function loadBackend() {
  const useSupabase = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  const mod = useSupabase ? await import('./backend-supabase.js') : await import('./backend-demo.js');
  api = mod.backend;
  return api;
}

export const state = {
  profile: null,
  groups: [],
  lists: [],      // listas a las que tengo acceso
  list: null,     // lista activa para practicar/estudiar
  verbs: [],
  patterns: [],
  offline: false,
};

// ---------- Preferencias (solo en este dispositivo) ----------
const PREFS_KEY = 'verbify-prefs';
const DEFAULT_PREFS = { lang: 'es', theme: 'auto', speech: true, autoSpeak: false, timer: false, anim: true };
export const prefs = { ...DEFAULT_PREFS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* ignore */ }
export function savePrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export const isAdmin = () => ['admin', 'superadmin'].includes(state.profile?.role);
export const isSuper = () => state.profile?.role === 'superadmin';

// ---------- Caché para usar sin conexión ----------
const CACHE_KEY = 'verbify-cache';
function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      profile: state.profile, groups: state.groups, lists: state.lists, listId: state.list?.id,
      verbs: state.verbs, patterns: state.patterns,
    }));
  } catch { /* ignore */ }
}
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

/**
 * Listas que se muestran según el rol:
 *  - superadmin: todas
 *  - profe: la suya + la maestra (referencia) + las de sus grupos
 *  - alumno: solo las de sus grupos; si aún no está en ninguno, la maestra
 */
function accessible(all, profile, groups) {
  if (profile.role === 'superadmin') return all;
  const ids = new Set(groups.map((g) => g.list_id).filter(Boolean));
  if (profile.role === 'admin') {
    return all.filter((l) => l.is_master || l.owner_id === profile.id || ids.has(l.id));
  }
  const fromGroups = all.filter((l) => ids.has(l.id));
  return fromGroups.length ? fromGroups : all.filter((l) => l.is_master);
}

function sortLists(lists, profile) {
  const rank = (l) => (l.owner_id === profile.id ? 0 : l.is_master ? 2 : 1);
  return lists.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function loadAll() {
  try {
    state.profile = await api.getProfile();
    if (!state.profile) return;
    const [groups, all] = await Promise.all([api.myGroups(), api.allLists()]);
    state.groups = groups;
    state.lists = sortLists(accessible(all, state.profile, groups), state.profile);
    let list = state.lists.find((l) => l.id === state.profile.active_list_id);
    if (!list) {
      list = state.lists.find((l) => l.owner_id === state.profile.id)
        || state.lists.find((l) => groups.some((g) => g.list_id === l.id))
        || state.lists[0] || null;
    }
    // Si la lista guardada ya no está disponible (p. ej. salió del grupo), recuerda la nueva
    await useList(list, !!list && list.id !== state.profile.active_list_id);
    state.offline = false;
    writeCache();
  } catch (e) {
    if (e.code === 'NETWORK' || !navigator.onLine) {
      const c = readCache();
      if (c && c.profile) {
        Object.assign(state, { profile: c.profile, groups: c.groups, lists: c.lists, verbs: c.verbs, patterns: c.patterns });
        state.list = c.lists.find((l) => l.id === c.listId) || null;
        state.offline = true;
        return;
      }
    }
    throw e;
  }
}

export async function useList(list, persist = true) {
  state.list = list;
  if (!list) { state.verbs = []; state.patterns = []; return; }
  const data = await api.getListData(list.id);
  state.verbs = data.verbs;
  state.patterns = data.patterns;
  if (persist && state.profile) {
    await api.setActiveList(list.id);
    state.profile.active_list_id = list.id;
    writeCache();
  }
}

/** Recarga la lista activa (tras editarla en el panel del profe) */
export async function refreshLists() {
  const all = await api.allLists();
  state.lists = sortLists(accessible(all, state.profile, state.groups), state.profile);
}

export async function refreshActiveList(listId) {
  await refreshLists();
  if (state.list && (!listId || listId === state.list.id)) {
    const fresh = state.lists.find((l) => l.id === state.list.id) || null;
    await useList(fresh, false);
  }
  writeCache();
}

export const unlockedSet = () => new Set(state.list?.unlocked_weeks || []);
export const visibleVerbs = () => { const u = unlockedSet(); return state.verbs.filter((v) => v.week && u.has(v.week)); };
export const weeksOf = (verbs) => [...new Set(verbs.map((v) => v.week).filter(Boolean))].sort((a, b) => a - b);
export const patternName = (id) => state.patterns.find((p) => p.id === id)?.name || '';
