// ---------- Backend real: Supabase ----------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { CONFIG } from './config.js';

const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'verbify-auth' },
});

const emailOf = (nick) => `${nick.trim().toLowerCase()}@${CONFIG.EMAIL_DOMAIN}`;

function fail(error) {
  const msg = String(error?.message || error || '');
  const known = ['NICK_INVALID', 'NICK_TAKEN', 'UNDERAGE', 'BIRTHDATE_INVALID', 'GROUP_NOT_FOUND', 'FORBIDDEN',
    'NOT_AUTH', 'NAME_INVALID', 'TOO_MANY_GROUPS', 'INVALID', 'USER_NOT_FOUND'];
  let code = known.find((k) => msg.includes(k));
  if (!code) {
    if (/already registered|already exists/i.test(msg)) code = 'NICK_TAKEN';
    else if (/invalid login credentials/i.test(msg)) code = 'BAD_LOGIN';
    else if (/password should be|weak password/i.test(msg)) code = 'WEAK_PASSWORD';
    else if (/email.*invalid|invalid.*email/i.test(msg)) code = 'EMAIL_DOMAIN';
    else if (/database error saving new user/i.test(msg)) code = 'SIGNUP_DB';
    else if (/duplicate key|verbs_list_infinitive/i.test(msg)) code = 'DUPLICATE';
    else if (/failed to fetch|network/i.test(msg)) code = 'NETWORK';
    else code = 'UNKNOWN';
  }
  const e = new Error(msg);
  e.code = code;
  throw e;
}
const ok = ({ data, error }) => { if (error) fail(error); return data; };

async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) fail(error);
  return data;
}

export const backend = {
  kind: 'supabase',

  async init() { /* la sesión la recupera supabase-js; el perfil se carga en loadAll() */ },

  async signUp({ nick, password, admin, birthdate }) {
    const data = { nick: nick.trim() };
    if (admin) { data.role_request = 'admin'; data.birthdate = birthdate; }
    const res = await sb.auth.signUp({ email: emailOf(nick), password, options: { data } });
    if (res.error) fail(res.error);
    if (!res.data.session) {
      // Supabase tiene activada la confirmación por email
      const e = new Error('Email confirmation is ON'); e.code = 'CONFIRM_EMAIL_ON'; throw e;
    }
    return loadProfile();
  },

  async signIn({ nick, password }) {
    const res = await sb.auth.signInWithPassword({ email: emailOf(nick), password });
    if (res.error) fail(res.error);
    return loadProfile();
  },

  async signOut() { await sb.auth.signOut(); },

  async changePassword(password) { ok(await sb.auth.updateUser({ password })); },

  async getProfile() { return loadProfile(); },

  async setActiveList(listId) {
    const { data: { session } } = await sb.auth.getSession();
    ok(await sb.from('profiles').update({ active_list_id: listId }).eq('id', session.user.id));
  },

  async allLists() {
    return ok(await sb.from('verb_lists').select('id,name,owner_id,is_master,unlocked_weeks,created_at').order('created_at'));
  },

  async getListData(listId) {
    const [verbs, patterns] = await Promise.all([
      sb.from('verbs').select('id,list_id,infinitive,past,participle,meaning,pattern_id,week').eq('list_id', listId).limit(5000),
      sb.from('patterns').select('id,list_id,name,sort').eq('list_id', listId).order('sort'),
    ]);
    return { verbs: ok(verbs), patterns: ok(patterns) };
  },

  async updateList(id, fields) {
    return ok(await sb.from('verb_lists').update(fields).eq('id', id).select().single());
  },

  async saveVerb(v) {
    const row = { list_id: v.list_id, infinitive: v.infinitive, past: v.past, participle: v.participle,
      meaning: v.meaning, pattern_id: v.pattern_id || null, week: v.week || null };
    if (v.id) return ok(await sb.from('verbs').update(row).eq('id', v.id).select().single());
    return ok(await sb.from('verbs').insert(row).select().single());
  },

  async deleteVerb(id) { ok(await sb.from('verbs').delete().eq('id', id)); },

  async updateVerbsWeeks(changes) {
    // changes: [{id, week}]
    for (const c of changes) ok(await sb.from('verbs').update({ week: c.week }).eq('id', c.id));
  },

  async importVerbs(listId, items, replace) {
    let { verbs, patterns } = await this.getListData(listId);
    // 1) Patrones que no existan
    const byName = new Map(patterns.map((p) => [p.name.toLowerCase(), p]));
    const newNames = [...new Set(items.map((i) => i.pattern).filter((n) => n && !byName.has(n.toLowerCase())))];
    if (newNames.length) {
      const max = patterns.reduce((m, p) => Math.max(m, p.sort), 0);
      const created = ok(await sb.from('patterns')
        .insert(newNames.map((name, i) => ({ list_id: listId, name, sort: max + i + 1 }))).select());
      created.forEach((p) => byName.set(p.name.toLowerCase(), p));
    }
    // 2) Verbos
    if (replace) { ok(await sb.from('verbs').delete().eq('list_id', listId)); verbs = []; }
    const existing = new Map(verbs.map((v) => [v.infinitive.toLowerCase(), v]));
    const toRow = (i) => ({ list_id: listId, infinitive: i.infinitive, past: i.past, participle: i.participle,
      meaning: i.meaning, pattern_id: i.pattern ? byName.get(i.pattern.toLowerCase())?.id ?? null : null, week: i.week });
    const seen = new Set();
    const inserts = [], updates = [];
    for (const it of items) {
      const k = it.infinitive.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const ex = existing.get(k);
      const row = toRow(it);
      if (ex) {
        if (!it.pattern) row.pattern_id = ex.pattern_id;
        if (!it.week) row.week = ex.week;
        updates.push({ id: ex.id, ...row });
      } else inserts.push(row);
    }
    for (let i = 0; i < inserts.length; i += 500) ok(await sb.from('verbs').insert(inserts.slice(i, i + 500)));
    for (let i = 0; i < updates.length; i += 500) ok(await sb.from('verbs').upsert(updates.slice(i, i + 500)));
    return { inserted: inserts.length, updated: updates.length };
  },

  async savePattern(p) {
    if (p.id) return ok(await sb.from('patterns').update({ name: p.name, sort: p.sort }).eq('id', p.id).select().single());
    return ok(await sb.from('patterns').insert({ list_id: p.list_id, name: p.name, sort: p.sort }).select().single());
  },

  async deletePattern(id) { ok(await sb.from('patterns').delete().eq('id', id)); },

  async myGroups() {
    const { data: { session } } = await sb.auth.getSession();
    const groups = ok(await sb.from('groups').select('id,name,code,owner_id,list_id,created_at').order('created_at'));
    const members = ok(await sb.from('group_members').select('group_id,user_id'));
    const mine = new Set(members.filter((m) => m.user_id === session.user.id).map((m) => m.group_id));
    return groups
      .filter((g) => mine.has(g.id) || g.owner_id === session.user.id)
      .map((g) => ({ ...g, is_owner: g.owner_id === session.user.id,
        member_count: members.filter((m) => m.group_id === g.id).length }));
  },

  async createGroup(name) { return ok(await sb.rpc('create_group', { p_name: name })); },
  async joinGroup(code) { return ok(await sb.rpc('join_group', { p_code: code })); },
  async renameGroup(id, name) { ok(await sb.from('groups').update({ name }).eq('id', id)); },
  async deleteGroup(id) { ok(await sb.from('groups').delete().eq('id', id)); },
  async leaveGroup(id) {
    const { data: { session } } = await sb.auth.getSession();
    ok(await sb.from('group_members').delete().eq('group_id', id).eq('user_id', session.user.id));
  },
  async removeMember(gid, userId) { ok(await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', userId)); },
  async groupMembers(gid) { return ok(await sb.rpc('group_members_info', { p_group: gid })); },
  async resetPassword(userId) { return ok(await sb.rpc('admin_reset_password', { p_user: userId })); },
  async groupRanking(gid, mode, period) {
    return ok(await sb.rpc('group_ranking', { p_group: gid, p_mode: mode, p_period: period }));
  },
  async submitResult({ mode, correct, total, timeMs, combo }) {
    return ok(await sb.rpc('submit_result', { p_mode: mode, p_correct: correct, p_total: total, p_time_ms: Math.round(timeMs), p_combo: combo }));
  },
  async myRecords() { return ok(await sb.rpc('my_records')); },
};
