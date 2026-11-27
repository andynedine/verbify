// Genera supabase/instalar.sql = tools/schema.sql + datos iniciales de data/verbos-1eso.csv
// Uso:  node tools/build-sql.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(join(root, 'tools/schema.sql'), 'utf8');
const csv = readFileSync(join(root, 'data/verbos-1eso.csv'), 'utf8').trim().split(/\r?\n/).slice(1);

export const PATTERNS = [
  'No cambian (cut-cut-cut)',
  'Pasado = participio, acaban en -t (feel-felt-felt)',
  'Acaban en -ought / -aught (buy-bought-bought)',
  'Pasado = participio, acaban en -d (make-made-made)',
  'Vocal i → a → u (sing-sang-sung)',
  'Participio en -n / -en (break-broke-broken)',
  'Participio igual al presente (come-came-come)',
  'Totalmente diferentes (go-went-gone)',
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const MASTER = '00000000-0000-0000-0000-000000000001';

const rows = csv.map((line) => {
  const [inf, past, part, mean, pat, week] = line.split(';').map((s) => s.trim());
  if (!PATTERNS.includes(pat)) throw new Error('Patrón desconocido: ' + pat);
  return `  (${q(inf)}, ${q(past)}, ${q(part)}, ${q(mean)}, ${q(pat)}, ${week ? Number(week) : 'null'})`;
});

const seed = `
-- =====================================================================
--  DATOS INICIALES: lista maestra con ${rows.length} verbos (todos bloqueados)
-- =====================================================================
insert into public.verb_lists (id, name, is_master, unlocked_weeks)
values ('${MASTER}', 'Lista maestra 1º ESO', true, '{}');

insert into public.patterns (list_id, name, sort) values
${PATTERNS.map((p, i) => `  ('${MASTER}', ${q(p)}, ${i + 1})`).join(',\n')};

insert into public.verbs (list_id, infinitive, past, participle, meaning, week, pattern_id)
select '${MASTER}', v.inf, v.past, v.part, v.mean, v.week, p.id
from (values
${rows.join(',\n')}
) as v(inf, past, part, mean, pat, week)
left join public.patterns p on p.list_id = '${MASTER}' and p.name = v.pat;
`;

mkdirSync(join(root, 'supabase'), { recursive: true });
writeFileSync(join(root, 'supabase/instalar.sql'), schema + seed, 'utf8');
console.log(`OK: supabase/instalar.sql generado con ${rows.length} verbos.`);
