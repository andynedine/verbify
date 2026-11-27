// ---------- Utilidades generales ----------

export const FIELDS = ['infinitive', 'past', 'participle', 'meaning'];
export const EN_FIELDS = ['infinitive', 'past', 'participle'];

/** Escapa texto para insertarlo en HTML */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Normaliza para comparar: minúsculas, sin tildes, sin espacios sobrantes ni signos */
export function normalize(s, { english = false } = {}) {
  let r = String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.:"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (english) r = r.replace(/^to /, '');
  return r;
}

/** Divide un texto con alternativas ("was, were" / "poder/ser capaz de") */
export function splitAlts(s, opts) {
  return String(s ?? '').split(/[,/;]|\s+-\s+/).map((x) => normalize(x, opts)).filter(Boolean);
}

/** Formatea alternativas para mostrar: "was, were" -> "was / were" */
export function showAlts(s) {
  return String(s ?? '').split(/[,/;]/).map((x) => x.trim()).filter(Boolean).join(' / ');
}

/** Limpia un valor de alternativas para guardarlo: "SER/ESTAR" -> "ser, estar" */
export function cleanAlts(s, lower = true) {
  const parts = String(s ?? '').split(/[,/;]/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const out = [...new Set(parts.map((p) => (lower ? p.toLowerCase() : p)))];
  return out.join(', ');
}

/**
 * ¿Es correcta la respuesta? Acepta cualquiera de las alternativas guardadas.
 * Si el alumno escribe varias ("was/were"), todas deben ser válidas.
 */
export function isCorrect(answer, acceptedSet, english) {
  const whole = normalize(answer, { english });
  if (!whole) return false;
  if (acceptedSet.has(whole)) return true;
  const parts = splitAlts(answer, { english });
  return parts.length > 0 && parts.every((p) => acceptedSet.has(p));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function uid() {
  return (crypto.randomUUID?.() || 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
}

export function byInfinitive(a, b) {
  return a.infinitive.localeCompare(b.infinitive, 'en', { sensitivity: 'base' });
}

/** Semana ISO "2026-W48" en hora de Madrid */
export function weekKey(d = new Date()) {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const date = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function todayKey(d = new Date()) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // AAAA-MM-DD
}

export function score(correct, total) {
  return total > 0 ? Math.round((correct * 10 * correct) / total) : 0;
}

// ---------- CSV ----------
const HEADER_ALIASES = {
  infinitive: ['infinitivo', 'infinitive', 'presente', 'present', 'verbo', 'verb', 'base'],
  past: ['pasado', 'past', 'simple past', 'past simple', 'pasado simple'],
  participle: ['participio', 'participle', 'past participle', 'participio pasado'],
  meaning: ['significado', 'meaning', 'espanol', 'spanish', 'traduccion', 'translation'],
  pattern: ['patron', 'pattern', 'grupo', 'estilo', 'tipo'],
  week: ['semana', 'week'],
};

function parseCsvRows(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delim = count('\t') > 0 ? '\t' : count(';') >= count(',') && count(';') > 0 ? ';' : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

/** Convierte un CSV en [{infinitive, past, participle, meaning, pattern, week}] */
export function parseVerbsCsv(text) {
  const rows = parseCsvRows(String(text).replace(/^﻿/, ''));
  if (!rows.length) return { items: [], errors: [] };
  const head = rows[0].map((h) => normalize(h));
  const map = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = head.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[key] = idx;
  }
  const hasHeader = map.infinitive !== undefined;
  const order = hasHeader ? map : { infinitive: 0, past: 1, participle: 2, meaning: 3, pattern: 4, week: 5 };
  const items = [], errors = [];
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const get = (k) => (order[k] !== undefined ? r[order[k]] ?? '' : '');
    const item = {
      infinitive: cleanAlts(get('infinitive')),
      past: cleanAlts(get('past')),
      participle: cleanAlts(get('participle')),
      meaning: cleanAlts(get('meaning')),
      pattern: get('pattern').trim(),
      week: parseInt(get('week'), 10) || null,
    };
    if (!item.infinitive || !item.past || !item.participle || !item.meaning) {
      errors.push(i + (hasHeader ? 2 : 1));
    } else items.push(item);
  });
  return { items, errors };
}

export function toCsv(verbs, patterns) {
  const pname = Object.fromEntries(patterns.map((p) => [p.id, p.name]));
  const q = (s) => (/[;"\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ''));
  const lines = ['infinitivo;pasado;participio;significado;patron;semana'];
  for (const v of verbs.slice().sort(byInfinitive)) {
    lines.push([v.infinitive, v.past, v.participle, v.meaning, pname[v.pattern_id] || '', v.week ?? ''].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- Pronunciación (voz del navegador, gratis) ----------
let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() || [];
  voice = vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}
export const canSpeak = () => 'speechSynthesis' in window;
export function speak(text) {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/,/g, ', '));
  u.lang = voice?.lang || 'en-GB';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}
