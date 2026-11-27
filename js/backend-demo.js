// ---------- Backend de DEMOSTRACIÓN (sin servidor) ----------
// Imita al backend de Supabase guardando todo en localStorage de este navegador.
// Sirve para probar la app antes de configurar Supabase.
import { parseVerbsCsv, uid, score, todayKey, weekKey } from './utils.js';

const KEY = 'verbify-demo-db';
const MASTER = '00000000-0000-0000-0000-000000000001';
let db = null;

function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin almacenamiento */ } }
function err(code) { const e = new Error(code); e.code = code; throw e; }
async function hash(s) {
  if (!crypto.subtle) return 'plain:' + s;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('verbify:' + s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const me = () => db.users.find((u) => u.id === db.session) || null;
const isSuper = () => me()?.role === 'superadmin';
const isAdmin = () => ['admin', 'superadmin'].includes(me()?.role);
const isMember = (gid) => db.members.some((m) => m.group_id === gid && m.user_id === db.session)
  || db.groups.some((g) => g.id === gid && g.owner_id === db.session);
const canEdit = (listId) => {
  const l = db.lists.find((x) => x.id === listId);
  return !!l && ((l.owner_id === db.session && isAdmin()) || isSuper());
};
const pub = (u) => u && ({ id: u.id, nick: u.nick, role: u.role, active_list_id: u.active_list_id,
  current_streak: u.current_streak, best_streak: u.best_streak, last_play_date: u.last_play_date, best_combo: u.best_combo });
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => todayKey();
const yesterday = () => todayKey(new Date(Date.now() - 86400000));

async function seed() {
  db = { users: [], session: null, lists: [], patterns: [], verbs: [], groups: [], members: [], records: [] };
  db.lists.push({ id: MASTER, name: 'Lista maestra 1º ESO', owner_id: null, is_master: true, unlocked_weeks: [], created_at: new Date().toISOString() });
  try {
    const text = await (await fetch('data/verbos-1eso.csv')).text();
    const { items } = parseVerbsCsv(text);
    const ORDER = ['No cambian', 'Pasado = participio, acaban en -t', 'Acaban en -ought', 'Pasado = participio, acaban en -d',
      'Vocal i', 'Participio en -n', 'Participio igual', 'Totalmente'];
    const rank = (n) => { const i = ORDER.findIndex((o) => n.startsWith(o)); return i < 0 ? 99 : i; };
    const names = [...new Set(items.map((i) => i.pattern).filter(Boolean))].sort((a, b) => rank(a) - rank(b));
    names.forEach((name, i) => db.patterns.push({ id: uid(), list_id: MASTER, name, sort: i + 1 }));
    for (const it of items) {
      db.verbs.push({ id: uid(), list_id: MASTER, infinitive: it.infinitive, past: it.past, participle: it.participle,
        meaning: it.meaning, week: it.week, pattern_id: db.patterns.find((p) => p.name === it.pattern)?.id || null });
    }
  } catch { /* sin conexión: lista vacía */ }
  save();
}

function cloneList(src, owner, name) {
  const id = uid();
  db.lists.push({ id, name, owner_id: owner, is_master: false, unlocked_weeks: [], created_at: new Date().toISOString() });
  const pmap = {};
  db.patterns.filter((p) => p.list_id === src).forEach((p) => {
    const np = { ...p, id: uid(), list_id: id }; pmap[p.id] = np.id; db.patterns.push(np);
  });
  db.verbs.filter((v) => v.list_id === src).forEach((v) => db.verbs.push({ ...v, id: uid(), list_id: id, pattern_id: pmap[v.pattern_id] || null }));
  return id;
}

function upsertRecord(userId, mode, period, rec) {
  const ex = db.records.find((r) => r.user_id === userId && r.mode === mode && r.period === period);
  if (!ex) { db.records.push({ user_id: userId, mode, period, ...rec }); return true; }
  if (rec.score > ex.score || (rec.score === ex.score && rec.time_ms < ex.time_ms)) { Object.assign(ex, rec); return true; }
  return false;
}

export const backend = {
  kind: 'demo',

  async init() {
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
    if (!db) await seed();
    return pub(me());
  },

  async resetDemo() { localStorage.removeItem(KEY); await seed(); },

  async signUp({ nick, password, admin, birthdate }) {
    nick = nick.trim();
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(nick)) err('NICK_INVALID');
    if (db.users.some((u) => u.nick.toLowerCase() === nick.toLowerCase())) err('NICK_TAKEN');
    if (password.length < 6) err('WEAK_PASSWORD');
    let role = 'student';
    if (admin) {
      const bd = new Date(birthdate);
      const limit = new Date(); limit.setFullYear(limit.getFullYear() - 18);
      if (isNaN(bd) || bd > limit) err('UNDERAGE');
      // En la demo, el primer administrador es superadministrador
      role = db.users.some((u) => u.role === 'superadmin') ? 'admin' : 'superadmin';
    }
    const u = { id: uid(), nick, pw: await hash(password), role, active_list_id: MASTER,
      current_streak: 0, best_streak: 0, last_play_date: null, best_combo: 0 };
    db.users.push(u);
    if (role !== 'student') u.active_list_id = cloneList(MASTER, u.id, 'Lista de ' + nick);
    db.session = u.id;
    save();
    return pub(u);
  },

  async signIn({ nick, password }) {
    const u = db.users.find((x) => x.nick.toLowerCase() === nick.trim().toLowerCase());
    if (!u || u.pw !== await hash(password)) err('BAD_LOGIN');
    db.session = u.id; save();
    return pub(u);
  },

  async signOut() { db.session = null; save(); },
  async changePassword(password) { if (password.length < 6) err('WEAK_PASSWORD'); me().pw = await hash(password); save(); },
  async getProfile() { return pub(me()); },
  async setActiveList(listId) { me().active_list_id = listId; save(); },

  async allLists() { return clone(db.lists); },

  async getListData(listId) {
    return {
      verbs: clone(db.verbs.filter((v) => v.list_id === listId)),
      patterns: clone(db.patterns.filter((p) => p.list_id === listId).sort((a, b) => a.sort - b.sort)),
    };
  },

  async updateList(id, fields) {
    if (!canEdit(id)) err('FORBIDDEN');
    const l = db.lists.find((x) => x.id === id);
    if (fields.name !== undefined) l.name = fields.name;
    if (fields.unlocked_weeks !== undefined) l.unlocked_weeks = fields.unlocked_weeks;
    save(); return clone(l);
  },

  async saveVerb(v) {
    if (!canEdit(v.list_id)) err('FORBIDDEN');
    const dup = db.verbs.find((x) => x.list_id === v.list_id && x.id !== v.id && x.infinitive.toLowerCase() === v.infinitive.toLowerCase());
    if (dup) err('DUPLICATE');
    const row = { list_id: v.list_id, infinitive: v.infinitive, past: v.past, participle: v.participle,
      meaning: v.meaning, pattern_id: v.pattern_id || null, week: v.week || null };
    if (v.id) { const ex = db.verbs.find((x) => x.id === v.id); Object.assign(ex, row); save(); return clone(ex); }
    const nv = { id: uid(), ...row }; db.verbs.push(nv); save(); return clone(nv);
  },

  async deleteVerb(id) {
    const v = db.verbs.find((x) => x.id === id);
    if (!v || !canEdit(v.list_id)) err('FORBIDDEN');
    db.verbs = db.verbs.filter((x) => x.id !== id); save();
  },

  async updateVerbsWeeks(changes) {
    for (const c of changes) { const v = db.verbs.find((x) => x.id === c.id); if (v && canEdit(v.list_id)) v.week = c.week; }
    save();
  },

  async importVerbs(listId, items, replace) {
    if (!canEdit(listId)) err('FORBIDDEN');
    const pats = db.patterns.filter((p) => p.list_id === listId);
    let max = pats.reduce((m, p) => Math.max(m, p.sort), 0);
    const pid = (name) => {
      if (!name) return null;
      let p = db.patterns.find((x) => x.list_id === listId && x.name.toLowerCase() === name.toLowerCase());
      if (!p) { p = { id: uid(), list_id: listId, name, sort: ++max }; db.patterns.push(p); }
      return p.id;
    };
    if (replace) db.verbs = db.verbs.filter((v) => v.list_id !== listId);
    let inserted = 0, updated = 0; const seen = new Set();
    for (const it of items) {
      const k = it.infinitive.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      const ex = db.verbs.find((v) => v.list_id === listId && v.infinitive.toLowerCase() === k);
      const row = { infinitive: it.infinitive, past: it.past, participle: it.participle, meaning: it.meaning };
      if (ex) {
        Object.assign(ex, row);
        if (it.pattern) ex.pattern_id = pid(it.pattern);
        if (it.week) ex.week = it.week;
        updated++;
      } else {
        db.verbs.push({ id: uid(), list_id: listId, ...row, pattern_id: pid(it.pattern), week: it.week || null }); inserted++;
      }
    }
    save(); return { inserted, updated };
  },

  async savePattern(p) {
    if (!canEdit(p.list_id)) err('FORBIDDEN');
    if (p.id) { const ex = db.patterns.find((x) => x.id === p.id); ex.name = p.name; ex.sort = p.sort; save(); return clone(ex); }
    const np = { id: uid(), list_id: p.list_id, name: p.name, sort: p.sort }; db.patterns.push(np); save(); return clone(np);
  },

  async deletePattern(id) {
    const p = db.patterns.find((x) => x.id === id);
    if (!p || !canEdit(p.list_id)) err('FORBIDDEN');
    db.patterns = db.patterns.filter((x) => x.id !== id);
    db.verbs.forEach((v) => { if (v.pattern_id === id) v.pattern_id = null; });
    save();
  },

  async myGroups() {
    return db.groups.filter((g) => isMember(g.id)).map((g) => ({
      ...clone(g), is_owner: g.owner_id === db.session,
      member_count: db.members.filter((m) => m.group_id === g.id).length,
    }));
  },

  async createGroup(name) {
    name = String(name || '').trim();
    if (!name || name.length > 40) err('NAME_INVALID');
    const u = me();
    let list = isAdmin() ? db.lists.find((l) => l.owner_id === u.id)?.id : null;
    list = list || u.active_list_id || MASTER;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do { code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
    while (db.groups.some((g) => g.code === code));
    const g = { id: uid(), name, code, owner_id: u.id, list_id: list, created_at: new Date().toISOString() };
    db.groups.push(g); db.members.push({ group_id: g.id, user_id: u.id, joined_at: g.created_at });
    save(); return clone(g);
  },

  async joinGroup(code) {
    const g = db.groups.find((x) => x.code === String(code).trim().toUpperCase());
    if (!g) err('GROUP_NOT_FOUND');
    if (!db.members.some((m) => m.group_id === g.id && m.user_id === db.session)) {
      db.members.push({ group_id: g.id, user_id: db.session, joined_at: new Date().toISOString() });
    }
    const u = me();
    const cur = db.lists.find((l) => l.id === u.active_list_id);
    if (u.role === 'student' && (!cur || cur.is_master)) u.active_list_id = g.list_id;
    save(); return clone(g);
  },

  async renameGroup(id, name) { const g = db.groups.find((x) => x.id === id); if (g?.owner_id !== db.session) err('FORBIDDEN'); g.name = name; save(); },
  async deleteGroup(id) {
    const g = db.groups.find((x) => x.id === id);
    if (!g || (g.owner_id !== db.session && !isSuper())) err('FORBIDDEN');
    db.groups = db.groups.filter((x) => x.id !== id); db.members = db.members.filter((m) => m.group_id !== id); save();
  },
  async leaveGroup(id) { db.members = db.members.filter((m) => !(m.group_id === id && m.user_id === db.session)); save(); },
  async removeMember(gid, userId) {
    const g = db.groups.find((x) => x.id === gid);
    if (!g || (g.owner_id !== db.session && userId !== db.session && !isSuper())) err('FORBIDDEN');
    db.members = db.members.filter((m) => !(m.group_id === gid && m.user_id === userId)); save();
  },

  async groupMembers(gid) {
    if (!isMember(gid) && !isSuper()) err('FORBIDDEN');
    const g = db.groups.find((x) => x.id === gid);
    const canReset = isSuper() || (isAdmin() && g.owner_id === db.session);
    const year = new Date().getFullYear();
    return db.members.filter((m) => m.group_id === gid).map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return { user_id: u.id, nick: u.nick, role: u.role, is_owner: g.owner_id === u.id, joined_at: m.joined_at,
        reset_hint: canReset && u.role === 'student' ? u.nick.toLowerCase() + year : null };
    }).sort((a, b) => a.nick.localeCompare(b.nick));
  },

  async resetPassword(userId) {
    const u = db.users.find((x) => x.id === userId);
    if (!u) err('USER_NOT_FOUND');
    const owns = db.groups.some((g) => g.owner_id === db.session && db.members.some((m) => m.group_id === g.id && m.user_id === userId));
    if (!(isSuper() || (isAdmin() && u.role === 'student' && owns))) err('FORBIDDEN');
    const pwd = u.nick.toLowerCase() + new Date().getFullYear();
    u.pw = await hash(pwd); save(); return pwd;
  },

  async groupRanking(gid, mode, period) {
    if (!isMember(gid) && !isSuper()) err('FORBIDDEN');
    const per = period === 'week' ? weekKey() : 'all';
    return db.members.filter((m) => m.group_id === gid).map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      const r = db.records.find((x) => x.user_id === u.id && x.mode === mode && x.period === per);
      return { user_id: u.id, nick: u.nick, role: u.role, score: r?.score ?? null, correct: r?.correct ?? null, total: r?.total ?? null,
        time_ms: r?.time_ms ?? null, played_at: r?.played_at ?? null, best_streak: u.best_streak, best_combo: u.best_combo,
        current_streak: u.last_play_date && u.last_play_date >= yesterday() ? u.current_streak : 0 };
    }).filter((r) => r.role === 'student' || r.score !== null)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.time_ms ?? 1e12) - (b.time_ms ?? 1e12) || a.nick.localeCompare(b.nick));
  },

  async submitResult({ mode, correct, total, timeMs, combo }) {
    const u = me(); if (!u) err('NOT_AUTH');
    const rec = { score: score(correct, total), correct, total, time_ms: Math.round(timeMs), played_at: new Date().toISOString() };
    const record_all = upsertRecord(u.id, mode, 'all', rec);
    const record_week = upsertRecord(u.id, mode, weekKey(), { ...rec });
    const t = today();
    if (u.last_play_date !== t) u.current_streak = u.last_play_date === yesterday() ? u.current_streak + 1 : 1;
    u.best_streak = Math.max(u.best_streak, u.current_streak);
    u.last_play_date = t;
    u.best_combo = Math.max(u.best_combo, combo || 0);
    save();
    return { score: rec.score, record_all, record_week, current_streak: u.current_streak, best_streak: u.best_streak, best_combo: u.best_combo };
  },

  async myRecords() {
    const wk = weekKey();
    return clone(db.records.filter((r) => r.user_id === db.session && (r.period === 'all' || r.period === wk)));
  },
};
