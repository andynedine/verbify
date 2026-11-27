-- =====================================================================
--  VERBIFY · Esquema de base de datos para Supabase
--  Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
--  Se puede ejecutar varias veces: borra y recrea las tablas de Verbify.
--  ¡OJO! Ejecutarlo de nuevo BORRA todos los datos de Verbify.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Limpieza (para poder re-ejecutar) ----------
drop trigger if exists verbify_before_user_insert on auth.users;
drop trigger if exists verbify_after_user_insert on auth.users;
drop table if exists public.records cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.verbs cascade;
drop table if exists public.patterns cascade;
drop table if exists public.profiles cascade;
drop table if exists public.verb_lists cascade;

-- ---------- Tablas ----------
create table public.verb_lists (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  owner_id       uuid,                       -- null = lista maestra
  is_master      boolean not null default false,
  unlocked_weeks int[] not null default '{}',
  created_at     timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nick            text not null,
  role            text not null default 'student' check (role in ('student','admin','superadmin')),
  active_list_id  uuid references public.verb_lists(id) on delete set null,
  current_streak  int not null default 0,
  best_streak     int not null default 0,
  last_play_date  date,
  best_combo      int not null default 0,
  created_at      timestamptz not null default now()
);
create unique index profiles_nick_unique on public.profiles (lower(nick));

alter table public.verb_lists
  add constraint verb_lists_owner_fk foreign key (owner_id) references public.profiles(id) on delete cascade;

create table public.patterns (
  id       uuid primary key default gen_random_uuid(),
  list_id  uuid not null references public.verb_lists(id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 80),
  sort     int not null default 0,
  unique (list_id, name)
);

create table public.verbs (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.verb_lists(id) on delete cascade,
  infinitive  text not null check (char_length(infinitive) between 1 and 60),
  past        text not null check (char_length(past) between 1 and 60),
  participle  text not null check (char_length(participle) between 1 and 60),
  meaning     text not null check (char_length(meaning) between 1 and 120),
  pattern_id  uuid references public.patterns(id) on delete set null,
  week        int check (week is null or week between 1 and 99),
  created_at  timestamptz not null default now()
);
create unique index verbs_list_infinitive on public.verbs (list_id, lower(infinitive));
create index verbs_list on public.verbs (list_id);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  code        text not null unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  list_id     uuid references public.verb_lists(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

-- Récords: solo se guarda el MEJOR resultado por alumno, modo y periodo
-- period = 'all' (histórico) o '2026-W48' (semana ISO)
create table public.records (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  mode       text not null check (mode in ('meaning','random')),
  period     text not null,
  score      int not null,
  correct    int not null,
  total      int not null,
  time_ms    int not null,
  played_at  timestamptz not null default now(),
  primary key (user_id, mode, period)
);

-- ---------- Funciones auxiliares (usadas por la seguridad RLS) ----------
create or replace function public.vf_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create or replace function public.vf_week_key() returns text
language sql stable as $$ select to_char(public.vf_today(), 'IYYY-"W"IW') $$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin'))
$$;

create or replace function public.can_edit_list(p_list uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from verb_lists l
    where l.id = p_list
      and ((l.owner_id = auth.uid() and public.is_admin()) or public.is_superadmin())
  )
$$;

create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid())
      or exists (select 1 from groups where id = p_group and owner_id = auth.uid())
$$;

create or replace function public.is_group_owner(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = p_group and owner_id = auth.uid())
$$;

create or replace function public.shares_group_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members a
    join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user
  ) or exists (
    select 1 from groups g join group_members m on m.group_id = g.id
    where g.owner_id = auth.uid() and m.user_id = p_user
  )
$$;

-- Copia una lista (patrones + verbos) para un nuevo administrador
create or replace function public.clone_list(p_src uuid, p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  insert into verb_lists (name, owner_id, is_master, unlocked_weeks)
  values (left(p_name, 60), p_owner, false, '{}')
  returning id into v_new;

  insert into patterns (list_id, name, sort)
  select v_new, name, sort from patterns where list_id = p_src;

  insert into verbs (list_id, infinitive, past, participle, meaning, week, pattern_id)
  select v_new, v.infinitive, v.past, v.participle, v.meaning, v.week, np.id
  from verbs v
  left join patterns op on op.id = v.pattern_id
  left join patterns np on np.list_id = v_new and np.name = op.name
  where v.list_id = p_src;

  return v_new;
end $$;

-- ---------- Alta de usuarios (se ejecuta al registrarse) ----------
-- Valida el nick y la mayoría de edad del administrador.
-- La fecha de nacimiento se BORRA: nunca se guarda.
create or replace function public.vf_before_user_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nick text := trim(coalesce(v_meta->>'nick', ''));
  v_role text := 'student';
  v_bd   date;
begin
  if v_nick !~ '^[A-Za-z0-9_.-]{3,20}$' then
    raise exception 'NICK_INVALID';
  end if;
  if exists (select 1 from profiles where lower(nick) = lower(v_nick)) then
    raise exception 'NICK_TAKEN';
  end if;
  if v_meta->>'role_request' = 'admin' then
    begin
      v_bd := (v_meta->>'birthdate')::date;
    exception when others then
      raise exception 'BIRTHDATE_INVALID';
    end;
    if v_bd is null or v_bd > (current_date - interval '18 years')::date then
      raise exception 'UNDERAGE';
    end if;
    v_role := 'admin';
  end if;
  new.raw_user_meta_data := (v_meta - 'birthdate' - 'role_request' - 'role')
                            || jsonb_build_object('nick', v_nick, 'role', v_role);
  return new;
end $$;

create or replace function public.vf_after_user_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nick text := new.raw_user_meta_data->>'nick';
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_list uuid;
  v_master uuid;
begin
  select id into v_master from verb_lists where is_master order by created_at limit 1;
  insert into profiles (id, nick, role, active_list_id) values (new.id, v_nick, v_role, v_master);
  if v_role = 'admin' and v_master is not null then
    v_list := public.clone_list(v_master, new.id, 'Lista de ' || v_nick);
    update profiles set active_list_id = v_list where id = new.id;
  end if;
  return new;
end $$;

create trigger verbify_before_user_insert before insert on auth.users
  for each row execute function public.vf_before_user_insert();
create trigger verbify_after_user_insert after insert on auth.users
  for each row execute function public.vf_after_user_insert();

-- ---------- Funciones que llama la app (RPC) ----------
create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_list uuid;
  v_group groups;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then raise exception 'NOT_AUTH'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 40 then raise exception 'NAME_INVALID'; end if;
  if (select count(*) from groups where owner_id = v_uid) >= 50 then raise exception 'TOO_MANY_GROUPS'; end if;

  if public.is_admin() then
    select id into v_list from verb_lists where owner_id = v_uid order by created_at limit 1;
  end if;
  if v_list is null then
    select active_list_id into v_list from profiles where id = v_uid;
  end if;
  if v_list is null then
    select id into v_list from verb_lists where is_master order by created_at limit 1;
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from groups where code = v_code);
  end loop;

  insert into groups (name, code, owner_id, list_id)
  values (trim(p_name), v_code, v_uid, v_list) returning * into v_group;
  insert into group_members (group_id, user_id) values (v_group.id, v_uid);
  return v_group;
end $$;

create or replace function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare v_group groups; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTH'; end if;
  select * into v_group from groups where code = upper(trim(p_code));
  if v_group.id is null then raise exception 'GROUP_NOT_FOUND'; end if;
  insert into group_members (group_id, user_id) values (v_group.id, v_uid)
  on conflict do nothing;
  -- Si el alumno no tiene lista propia elegida, usa la del grupo
  update profiles p set active_list_id = v_group.list_id
  where p.id = v_uid and p.role = 'student'
    and (p.active_list_id is null or exists (select 1 from verb_lists l where l.id = p.active_list_id and l.is_master));
  return v_group;
end $$;

create or replace function public.group_members_info(p_group uuid)
returns table (user_id uuid, nick text, role text, is_owner boolean, joined_at timestamptz, reset_hint text)
language plpgsql security definer set search_path = public as $$
declare v_can_reset boolean;
begin
  if not (public.is_group_member(p_group) or public.is_superadmin()) then raise exception 'FORBIDDEN'; end if;
  v_can_reset := public.is_superadmin() or (public.is_admin() and public.is_group_owner(p_group));
  return query
    select pr.id, pr.nick, pr.role, (g.owner_id = pr.id), m.joined_at,
           case when v_can_reset and pr.role = 'student'
                then lower(pr.nick) || extract(year from public.vf_today())::int::text end
    from group_members m
    join profiles pr on pr.id = m.user_id
    join groups g on g.id = m.group_id
    where m.group_id = p_group
    order by lower(pr.nick);
end $$;

-- El profe restablece la contraseña de un alumno a: nick + año actual (ej. lucia2026)
create or replace function public.admin_reset_password(p_user uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_nick text; v_role text; v_pwd text;
begin
  select nick, role into v_nick, v_role from profiles where id = p_user;
  if v_nick is null then raise exception 'USER_NOT_FOUND'; end if;
  if not (
    public.is_superadmin()
    or (public.is_admin() and v_role = 'student' and exists (
          select 1 from groups g join group_members m on m.group_id = g.id
          where g.owner_id = auth.uid() and m.user_id = p_user))
  ) then
    raise exception 'FORBIDDEN';
  end if;
  v_pwd := lower(v_nick) || extract(year from public.vf_today())::int::text;
  update auth.users
     set encrypted_password = extensions.crypt(v_pwd, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  return v_pwd;
end $$;

create or replace function public.vf_upsert_record(p_user uuid, p_mode text, p_period text,
  p_score int, p_correct int, p_total int, p_time int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  insert into records (user_id, mode, period, score, correct, total, time_ms, played_at)
  values (p_user, p_mode, p_period, p_score, p_correct, p_total, p_time, now())
  on conflict (user_id, mode, period) do update
    set score = excluded.score, correct = excluded.correct, total = excluded.total,
        time_ms = excluded.time_ms, played_at = excluded.played_at
    where excluded.score > records.score
       or (excluded.score = records.score and excluded.time_ms < records.time_ms);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- Guarda el resultado de una partida. Puntos = aciertos a la primera × 10 × (% de aciertos)
create or replace function public.submit_result(p_mode text, p_correct int, p_total int, p_time_ms int, p_combo int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.vf_today();
  v_score int;
  v_rec_all boolean;
  v_rec_week boolean;
  v_p profiles;
  v_cur int;
begin
  if v_uid is null then raise exception 'NOT_AUTH'; end if;
  if p_mode not in ('meaning','random') or p_total not between 1 and 1000
     or p_correct not between 0 and p_total or p_time_ms < 0 then
    raise exception 'INVALID';
  end if;
  v_score := round(p_correct * 10.0 * p_correct / p_total);
  v_rec_all  := public.vf_upsert_record(v_uid, p_mode, 'all', v_score, p_correct, p_total, p_time_ms);
  v_rec_week := public.vf_upsert_record(v_uid, p_mode, public.vf_week_key(), v_score, p_correct, p_total, p_time_ms);

  select * into v_p from profiles where id = v_uid for update;
  v_cur := case
             when v_p.last_play_date = v_today then v_p.current_streak
             when v_p.last_play_date = v_today - 1 then v_p.current_streak + 1
             else 1 end;
  update profiles
     set current_streak = v_cur,
         best_streak = greatest(best_streak, v_cur),
         last_play_date = v_today,
         best_combo = greatest(best_combo, coalesce(p_combo, 0))
   where id = v_uid
   returning * into v_p;

  return jsonb_build_object('score', v_score, 'record_all', v_rec_all, 'record_week', v_rec_week,
                            'current_streak', v_p.current_streak, 'best_streak', v_p.best_streak,
                            'best_combo', v_p.best_combo);
end $$;

create or replace function public.group_ranking(p_group uuid, p_mode text, p_period text)
returns table (user_id uuid, nick text, score int, correct int, total int, time_ms int,
               current_streak int, best_streak int, best_combo int, played_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_period text := case when p_period = 'week' then public.vf_week_key() else 'all' end;
begin
  if not (public.is_group_member(p_group) or public.is_superadmin()) then raise exception 'FORBIDDEN'; end if;
  return query
    select pr.id, pr.nick, r.score, r.correct, r.total, r.time_ms,
           case when pr.last_play_date >= public.vf_today() - 1 then pr.current_streak else 0 end,
           pr.best_streak, pr.best_combo, r.played_at
    from group_members m
    join profiles pr on pr.id = m.user_id
    left join records r on r.user_id = pr.id and r.mode = p_mode and r.period = v_period
    where m.group_id = p_group
      and (pr.role = 'student' or r.user_id is not null)
    order by r.score desc nulls last, r.time_ms asc nulls last, lower(pr.nick);
end $$;

create or replace function public.my_records()
returns table (mode text, period text, score int, correct int, total int, time_ms int, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select mode, period, score, correct, total, time_ms, played_at
  from records
  where user_id = auth.uid() and (period = 'all' or period = public.vf_week_key())
$$;

-- ---------- Seguridad: Row Level Security ----------
alter table public.verb_lists    enable row level security;
alter table public.profiles      enable row level security;
alter table public.patterns      enable row level security;
alter table public.verbs         enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.records       enable row level security;

revoke all on public.verb_lists, public.profiles, public.patterns, public.verbs,
              public.groups, public.group_members, public.records from anon, authenticated;

grant select on public.verb_lists, public.patterns, public.verbs to authenticated;
grant update (name, unlocked_weeks) on public.verb_lists to authenticated;
grant insert, update, delete on public.patterns, public.verbs to authenticated;
grant select on public.profiles to authenticated;
grant update (active_list_id) on public.profiles to authenticated;
grant select, delete on public.groups to authenticated;
grant update (name) on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select on public.records to authenticated;

create policy lists_read   on public.verb_lists for select to authenticated using (true);
create policy lists_update on public.verb_lists for update to authenticated
  using (public.can_edit_list(id)) with check (public.can_edit_list(id));

create policy patterns_read  on public.patterns for select to authenticated using (true);
create policy patterns_write on public.patterns for all to authenticated
  using (public.can_edit_list(list_id)) with check (public.can_edit_list(list_id));

create policy verbs_read  on public.verbs for select to authenticated using (true);
create policy verbs_write on public.verbs for all to authenticated
  using (public.can_edit_list(list_id)) with check (public.can_edit_list(list_id));

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id) or public.is_superadmin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read on public.groups for select to authenticated
  using (public.is_group_member(id) or public.is_superadmin());
create policy groups_update on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid() or public.is_superadmin());

create policy members_read on public.group_members for select to authenticated
  using (public.is_group_member(group_id) or public.is_superadmin());
create policy members_delete on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id) or public.is_superadmin());

create policy records_read on public.records for select to authenticated using (user_id = auth.uid());

-- Permisos de ejecución de funciones
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_superadmin(), public.is_admin(), public.can_edit_list(uuid),
  public.is_group_member(uuid), public.is_group_owner(uuid), public.shares_group_with(uuid),
  public.vf_today(), public.vf_week_key(),
  public.create_group(text), public.join_group(text), public.group_members_info(uuid),
  public.admin_reset_password(uuid), public.submit_result(text, int, int, int, int),
  public.group_ranking(uuid, text, text), public.my_records()
to authenticated;
revoke execute on function public.clone_list(uuid, uuid, text) from authenticated;
revoke execute on function public.vf_upsert_record(uuid, text, text, int, int, int, int) from authenticated;
grant execute on function public.vf_before_user_insert(), public.vf_after_user_insert(), public.clone_list(uuid, uuid, text)
  to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select, insert, update on public.profiles, public.verb_lists, public.patterns, public.verbs to supabase_auth_admin;

-- =====================================================================
--  DATOS INICIALES: lista maestra con 86 verbos (todos bloqueados)
-- =====================================================================
insert into public.verb_lists (id, name, is_master, unlocked_weeks)
values ('00000000-0000-0000-0000-000000000001', 'Lista maestra 1º ESO', true, '{}');

insert into public.patterns (list_id, name, sort) values
  ('00000000-0000-0000-0000-000000000001', 'No cambian (cut-cut-cut)', 1),
  ('00000000-0000-0000-0000-000000000001', 'Pasado = participio, acaban en -t (feel-felt-felt)', 2),
  ('00000000-0000-0000-0000-000000000001', 'Acaban en -ought / -aught (buy-bought-bought)', 3),
  ('00000000-0000-0000-0000-000000000001', 'Pasado = participio, acaban en -d (make-made-made)', 4),
  ('00000000-0000-0000-0000-000000000001', 'Vocal i → a → u (sing-sang-sung)', 5),
  ('00000000-0000-0000-0000-000000000001', 'Participio en -n / -en (break-broke-broken)', 6),
  ('00000000-0000-0000-0000-000000000001', 'Participio igual al presente (come-came-come)', 7),
  ('00000000-0000-0000-0000-000000000001', 'Totalmente diferentes (go-went-gone)', 8);

insert into public.verbs (list_id, infinitive, past, participle, meaning, week, pattern_id)
select '00000000-0000-0000-0000-000000000001', v.inf, v.past, v.part, v.mean, v.week, p.id
from (values
  ('be', 'was, were', 'been', 'ser, estar', 'Totalmente diferentes (go-went-gone)', 1),
  ('become', 'became', 'become', 'llegar a ser, convertirse', 'Participio igual al presente (come-came-come)', 1),
  ('begin', 'began', 'begun', 'empezar, comenzar', 'Vocal i → a → u (sing-sang-sung)', 1),
  ('bend', 'bent', 'bent', 'doblar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 1),
  ('bite', 'bit', 'bitten', 'morder', 'Participio en -n / -en (break-broke-broken)', 1),
  ('blow', 'blew', 'blown', 'soplar', 'Participio en -n / -en (break-broke-broken)', 2),
  ('break', 'broke', 'broken', 'romper', 'Participio en -n / -en (break-broke-broken)', 2),
  ('bring', 'brought', 'brought', 'traer', 'Acaban en -ought / -aught (buy-bought-bought)', 2),
  ('build', 'built', 'built', 'construir', 'Pasado = participio, acaban en -t (feel-felt-felt)', 2),
  ('burn', 'burnt', 'burnt', 'quemar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 2),
  ('buy', 'bought', 'bought', 'comprar', 'Acaban en -ought / -aught (buy-bought-bought)', 3),
  ('can', 'could', 'been able to', 'poder, ser capaz de', 'Totalmente diferentes (go-went-gone)', 3),
  ('catch', 'caught', 'caught', 'coger', 'Acaban en -ought / -aught (buy-bought-bought)', 3),
  ('choose', 'chose', 'chosen', 'escoger', 'Participio en -n / -en (break-broke-broken)', 3),
  ('come', 'came', 'come', 'venir', 'Participio igual al presente (come-came-come)', 3),
  ('cost', 'cost', 'cost', 'costar', 'No cambian (cut-cut-cut)', 4),
  ('cut', 'cut', 'cut', 'cortar', 'No cambian (cut-cut-cut)', 4),
  ('do', 'did', 'done', 'hacer', 'Participio en -n / -en (break-broke-broken)', 4),
  ('draw', 'drew', 'drawn', 'dibujar', 'Participio en -n / -en (break-broke-broken)', 4),
  ('drink', 'drank', 'drunk', 'beber', 'Vocal i → a → u (sing-sang-sung)', 4),
  ('drive', 'drove', 'driven', 'conducir', 'Participio en -n / -en (break-broke-broken)', 5),
  ('eat', 'ate', 'eaten', 'comer', 'Participio en -n / -en (break-broke-broken)', 5),
  ('fall', 'fell', 'fallen', 'caerse', 'Participio en -n / -en (break-broke-broken)', 5),
  ('feel', 'felt', 'felt', 'sentir', 'Pasado = participio, acaban en -t (feel-felt-felt)', 5),
  ('fight', 'fought', 'fought', 'luchar', 'Acaban en -ought / -aught (buy-bought-bought)', 5),
  ('find', 'found', 'found', 'encontrar', 'Pasado = participio, acaban en -d (make-made-made)', 6),
  ('fly', 'flew', 'flown', 'volar', 'Participio en -n / -en (break-broke-broken)', 6),
  ('forget', 'forgot', 'forgotten', 'olvidar', 'Participio en -n / -en (break-broke-broken)', 6),
  ('get', 'got', 'got', 'conseguir', 'Pasado = participio, acaban en -t (feel-felt-felt)', 6),
  ('give', 'gave', 'given', 'dar', 'Participio en -n / -en (break-broke-broken)', 6),
  ('go', 'went', 'gone', 'ir', 'Totalmente diferentes (go-went-gone)', 7),
  ('grow', 'grew', 'grown', 'crecer', 'Participio en -n / -en (break-broke-broken)', 7),
  ('hang', 'hung', 'hung', 'colgar', 'Totalmente diferentes (go-went-gone)', 7),
  ('have', 'had', 'had', 'tener', 'Pasado = participio, acaban en -d (make-made-made)', 7),
  ('hear', 'heard', 'heard', 'oír', 'Pasado = participio, acaban en -d (make-made-made)', 7),
  ('hide', 'hid', 'hidden', 'esconder', 'Participio en -n / -en (break-broke-broken)', 8),
  ('hit', 'hit', 'hit', 'golpear', 'No cambian (cut-cut-cut)', 8),
  ('keep', 'kept', 'kept', 'mantener, guardar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 8),
  ('know', 'knew', 'known', 'saber', 'Participio en -n / -en (break-broke-broken)', 8),
  ('lay', 'laid', 'laid', 'poner, preparar', 'Pasado = participio, acaban en -d (make-made-made)', 8),
  ('lead', 'led', 'led', 'guiar', 'Pasado = participio, acaban en -d (make-made-made)', 9),
  ('learn', 'learnt', 'learnt', 'aprender', 'Pasado = participio, acaban en -t (feel-felt-felt)', 9),
  ('leave', 'left', 'left', 'dejar, abandonar, irse', 'Pasado = participio, acaban en -t (feel-felt-felt)', 9),
  ('lend', 'lent', 'lent', 'prestar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 9),
  ('lose', 'lost', 'lost', 'perder', 'Pasado = participio, acaban en -t (feel-felt-felt)', 9),
  ('make', 'made', 'made', 'hacer, fabricar', 'Pasado = participio, acaban en -d (make-made-made)', 10),
  ('mean', 'meant', 'meant', 'significar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 10),
  ('meet', 'met', 'met', 'encontrarse, conocerse', 'Pasado = participio, acaban en -t (feel-felt-felt)', 10),
  ('overcome', 'overcame', 'overcome', 'vencer', 'Participio igual al presente (come-came-come)', 10),
  ('pay', 'paid', 'paid', 'pagar', 'Pasado = participio, acaban en -d (make-made-made)', 10),
  ('put', 'put', 'put', 'poner', 'No cambian (cut-cut-cut)', 11),
  ('read', 'read', 'read', 'leer', 'No cambian (cut-cut-cut)', 11),
  ('ride', 'rode', 'ridden', 'montar en', 'Participio en -n / -en (break-broke-broken)', 11),
  ('ring', 'rang', 'rung', 'sonar, llamar', 'Vocal i → a → u (sing-sang-sung)', 11),
  ('run', 'ran', 'run', 'correr', 'Participio igual al presente (come-came-come)', 11),
  ('say', 'said', 'said', 'decir', 'Pasado = participio, acaban en -d (make-made-made)', 12),
  ('see', 'saw', 'seen', 'ver', 'Participio en -n / -en (break-broke-broken)', 12),
  ('sell', 'sold', 'sold', 'vender', 'Pasado = participio, acaban en -d (make-made-made)', 12),
  ('send', 'sent', 'sent', 'mandar, enviar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 12),
  ('set', 'set', 'set', 'colocar, poner', 'No cambian (cut-cut-cut)', 12),
  ('shake', 'shook', 'shaken', 'agitar', 'Participio en -n / -en (break-broke-broken)', 13),
  ('shoot', 'shot', 'shot', 'disparar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 13),
  ('show', 'showed', 'shown', 'mostrar, enseñar', 'Participio en -n / -en (break-broke-broken)', 13),
  ('shut', 'shut', 'shut', 'cerrar', 'No cambian (cut-cut-cut)', 13),
  ('sing', 'sang', 'sung', 'cantar', 'Vocal i → a → u (sing-sang-sung)', 13),
  ('sink', 'sank', 'sunk', 'hundirse', 'Vocal i → a → u (sing-sang-sung)', 14),
  ('sit', 'sat', 'sat', 'sentarse', 'Pasado = participio, acaban en -t (feel-felt-felt)', 14),
  ('sleep', 'slept', 'slept', 'dormir', 'Pasado = participio, acaban en -t (feel-felt-felt)', 14),
  ('smell', 'smelt', 'smelt', 'oler', 'Pasado = participio, acaban en -t (feel-felt-felt)', 14),
  ('speak', 'spoke', 'spoken', 'hablar', 'Participio en -n / -en (break-broke-broken)', 14),
  ('spell', 'spelt', 'spelt', 'deletrear', 'Pasado = participio, acaban en -t (feel-felt-felt)', 15),
  ('spend', 'spent', 'spent', 'pasar, gastar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 15),
  ('spill', 'spilt', 'spilt', 'derramar', 'Pasado = participio, acaban en -t (feel-felt-felt)', 15),
  ('stand', 'stood', 'stood', 'estar de pie', 'Pasado = participio, acaban en -d (make-made-made)', 15),
  ('steal', 'stole', 'stolen', 'robar', 'Participio en -n / -en (break-broke-broken)', 15),
  ('swim', 'swam', 'swum', 'nadar', 'Vocal i → a → u (sing-sang-sung)', 16),
  ('take', 'took', 'taken', 'tomar, coger', 'Participio en -n / -en (break-broke-broken)', 16),
  ('teach', 'taught', 'taught', 'enseñar', 'Acaban en -ought / -aught (buy-bought-bought)', 16),
  ('tell', 'told', 'told', 'contar', 'Pasado = participio, acaban en -d (make-made-made)', 16),
  ('think', 'thought', 'thought', 'pensar', 'Acaban en -ought / -aught (buy-bought-bought)', 16),
  ('throw', 'threw', 'thrown', 'lanzar, arrojar', 'Participio en -n / -en (break-broke-broken)', 17),
  ('understand', 'understood', 'understood', 'entender', 'Pasado = participio, acaban en -d (make-made-made)', 17),
  ('wake', 'woke', 'woken', 'despertarse', 'Participio en -n / -en (break-broke-broken)', 17),
  ('wear', 'wore', 'worn', 'llevar puesto', 'Participio en -n / -en (break-broke-broken)', 17),
  ('win', 'won', 'won', 'ganar', 'Totalmente diferentes (go-went-gone)', 17),
  ('write', 'wrote', 'written', 'escribir', 'Participio en -n / -en (break-broke-broken)', 18)
) as v(inf, past, part, mean, pat, week)
left join public.patterns p on p.list_id = '00000000-0000-0000-0000-000000000001' and p.name = v.pat;
