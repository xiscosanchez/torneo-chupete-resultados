-- ============================================================
-- Gestión de equipo de fútbol — esquema inicial
-- Ejecutar en Supabase: SQL Editor → pegar y Run
-- ============================================================

-- ---------- ENUMS ----------
create type public.user_role as enum ('entrenador', 'jugador');
create type public.position_group as enum ('POR', 'DEF', 'CEN', 'DEL');
create type public.match_type as enum ('liga', 'amistoso', 'copa', 'torneo');
create type public.match_status as enum ('programado', 'en_juego', 'finalizado', 'suspendido');
create type public.callup_status as enum ('pendiente', 'aceptada', 'rechazada');
create type public.event_team as enum ('favor', 'contra');
create type public.event_type as enum (
  'gol', 'tiro', 'tiro_puerta', 'corner', 'falta',
  'amarilla', 'roja', 'fuera_juego', 'penalti', 'cambio'
);

-- ---------- TABLAS ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'jugador',
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  nombre text not null,
  apellidos text not null default '',
  dni text,
  fecha_nacimiento date,
  demarcacion public.position_group not null default 'CEN',
  subposicion text,
  dorsal int,
  foto_path text,
  telefono text,
  email text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tipo public.match_type not null default 'liga',
  rival text not null,
  fecha timestamptz not null,
  lugar text,
  es_local boolean not null default true,
  estado public.match_status not null default 'programado',
  goles_favor int not null default 0,
  goles_contra int not null default 0,
  notas text,
  created_at timestamptz not null default now()
);

create table public.callups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  deadline timestamptz,
  notas text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.callup_players (
  id uuid primary key default gen_random_uuid(),
  callup_id uuid not null references public.callups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  estado public.callup_status not null default 'pendiente',
  motivo text,
  responded_at timestamptz,
  unique (callup_id, player_id)
);

create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  formacion text not null default '4-3-3',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  titular boolean not null default true,
  -- posición en la pizarra, porcentajes 0-100 (x: izq→der, y: portería propia→rival)
  pos_x numeric,
  pos_y numeric,
  unique (lineup_id, player_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  minuto int not null default 0,
  equipo public.event_team not null,
  tipo public.event_type not null,
  player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index on public.callup_players (callup_id);
create index on public.callup_players (player_id);
create index on public.lineup_players (lineup_id);
create index on public.match_events (match_id);
create index on public.push_subscriptions (profile_id);

-- ---------- HELPERS ----------

-- ¿Es el usuario actual el entrenador?
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'entrenador'
  );
$$;

-- ¿El usuario actual es el jugador de esta fila?
create or replace function public.is_own_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where id = p_player_id and profile_id = auth.uid()
  );
$$;

-- ---------- TRIGGERS ----------

-- Al registrarse un usuario: crear profile.
-- El PRIMER usuario registrado es el entrenador; el resto, jugadores.
-- Si su email coincide con el de una ficha de jugador, se vinculan.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if exists (select 1 from public.profiles where role = 'entrenador') then
    v_role := 'jugador';
  else
    v_role := 'entrenador';
  end if;

  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  );

  update public.players
  set profile_id = new.id
  where profile_id is null
    and email is not null
    and lower(email) = lower(new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- ROW LEVEL SECURITY ----------

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.callups enable row level security;
alter table public.callup_players enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_players enable row level security;
alter table public.match_events enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
create policy "profiles: leer propio o entrenador" on public.profiles
  for select using (id = auth.uid() or public.is_coach());
create policy "profiles: actualizar propio" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

-- players: el entrenador todo; el jugador su propia ficha completa.
-- El resto de la plantilla se consulta vía la vista players_public (sin DNI/teléfono).
create policy "players: entrenador todo" on public.players
  for all using (public.is_coach()) with check (public.is_coach());
create policy "players: jugador lee su ficha" on public.players
  for select using (profile_id = auth.uid());

-- Vista pública de plantilla (sin datos sensibles).
-- security definer (por defecto en Supabase, owner postgres) para saltar el RLS de players.
create view public.players_public as
  select id, profile_id, nombre, apellidos, demarcacion, subposicion,
         dorsal, foto_path, activo
  from public.players;
grant select on public.players_public to authenticated;
revoke select on public.players_public from anon;

-- matches: todos los autenticados leen; escribe el entrenador
create policy "matches: leer autenticados" on public.matches
  for select using (auth.uid() is not null);
create policy "matches: escribir entrenador" on public.matches
  for insert with check (public.is_coach());
create policy "matches: actualizar entrenador" on public.matches
  for update using (public.is_coach());
create policy "matches: borrar entrenador" on public.matches
  for delete using (public.is_coach());

-- callups
create policy "callups: leer autenticados" on public.callups
  for select using (auth.uid() is not null);
create policy "callups: escribir entrenador" on public.callups
  for all using (public.is_coach()) with check (public.is_coach());

-- callup_players: leer todos (el equipo ve quién está convocado);
-- el jugador solo puede actualizar SU respuesta
create policy "callup_players: leer autenticados" on public.callup_players
  for select using (auth.uid() is not null);
create policy "callup_players: entrenador todo" on public.callup_players
  for all using (public.is_coach()) with check (public.is_coach());
create policy "callup_players: jugador responde la suya" on public.callup_players
  for update using (public.is_own_player(player_id))
  with check (public.is_own_player(player_id));

-- lineups / lineup_players / match_events: leen todos, escribe el entrenador
create policy "lineups: leer autenticados" on public.lineups
  for select using (auth.uid() is not null);
create policy "lineups: escribir entrenador" on public.lineups
  for all using (public.is_coach()) with check (public.is_coach());

create policy "lineup_players: leer autenticados" on public.lineup_players
  for select using (auth.uid() is not null);
create policy "lineup_players: escribir entrenador" on public.lineup_players
  for all using (public.is_coach()) with check (public.is_coach());

create policy "match_events: leer autenticados" on public.match_events
  for select using (auth.uid() is not null);
create policy "match_events: escribir entrenador" on public.match_events
  for all using (public.is_coach()) with check (public.is_coach());

-- push_subscriptions: cada uno gestiona las suyas
create policy "push: gestionar propias" on public.push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.callup_players;
alter publication supabase_realtime add table public.match_events;
alter publication supabase_realtime add table public.matches;

-- ---------- STORAGE (fotos de jugadores) ----------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false);

create policy "fotos: leer autenticados" on storage.objects
  for select using (bucket_id = 'fotos' and auth.uid() is not null);
create policy "fotos: subir entrenador" on storage.objects
  for insert with check (bucket_id = 'fotos' and public.is_coach());
create policy "fotos: actualizar entrenador" on storage.objects
  for update using (bucket_id = 'fotos' and public.is_coach());
create policy "fotos: borrar entrenador" on storage.objects
  for delete using (bucket_id = 'fotos' and public.is_coach());
