-- ════════════════════════════════════════════════════════════════
--  PULSO · Group COS para ETB Mayoristas
--  01 · Esquema base (tablas, extensiones, índices)
--  Ejecutar en Supabase → SQL Editor en orden: 01 → 02 → 03 → 04 → 05
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;          -- gen_random_uuid + cifrado de PII

-- ── Perfiles de usuario (1:1 con auth.users) ──────────────────────
create table public.usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  login       text unique not null,                -- usuario genérico (ej. decheverri)
  nombre      text not null,
  apellido    text,
  rol         text not null default 'agente'
              check (rol in ('agente','senior','coordinador','superadmin')),
  cargo       text,                                -- ej. "Junior ENEL", "Analista"
  code        text,                                -- login operativo (ETBSOP236 / 1646)
  servicio    text default 'ETB MAYORISTAS',
  mesa        text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Catálogo de gestiones (configurable por superadmin) ───────────
create table public.gestiones_catalogo (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  categoria   text not null
              check (categoria in ('casos','comms','tecnico','permisos','escal','reunion','interna')),
  umbral_min  int not null default 15,             -- tiempo típico; dispara alerta de auditoría
  senior_only boolean not null default false,
  activo      boolean not null default true,
  orden       int default 0,
  created_at  timestamptz not null default now()
);

-- ── Bandeja del día (casos repartidos por el senior) ──────────────
create table public.asignaciones (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null default current_date,
  user_id      uuid not null references public.usuarios(id) on delete cascade,
  numero_caso  text not null,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','progreso','gestionado')),
  asignado_por uuid references public.usuarios(id),
  created_at   timestamptz not null default now(),
  unique (fecha, user_id, numero_caso)             -- evita duplicar un caso el mismo día
);

-- ── Registro de gestiones (la bitácora real) ──────────────────────
create table public.gestiones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.usuarios(id) on delete cascade,
  tipo_id       uuid not null references public.gestiones_catalogo(id),
  numero_caso   text not null,
  minutos       int  not null check (minutos > 0 and minutos <= 600),
  asignacion_id uuid references public.asignaciones(id) on delete set null,
  fecha         date not null default current_date,
  registrado_at timestamptz not null default now(),
  nota          text,
  created_at    timestamptz not null default now()
);

-- ── Horarios (cargados del Excel; base del cálculo de productividad)
create table public.horarios (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.usuarios(id) on delete cascade,
  fecha          date not null,
  turno          text,                             -- "08:00-17:00" (referencia visual)
  turno_inicio   time,
  turno_fin      time,
  almuerzo_min   int default 0,
  break_min      int default 15,
  disponible_min int,                              -- minutos netos disponibles del turno
  unique (user_id, fecha)
);

-- ── PII sensible: documento de identidad, cifrado y aislado ────────
--    Solo lo lee el superadmin. La cédula NUNCA viaja en claro al frontend.
create table public.empleado_documento (
  user_id            uuid primary key references public.usuarios(id) on delete cascade,
  documento_cifrado  bytea not null,               -- pgp_sym_encrypt(cedula, llave_vault)
  actualizado_at     timestamptz not null default now()
);

-- ── Índices para los dashboards y la bandeja ──────────────────────
create index idx_gestiones_user_fecha    on public.gestiones (user_id, fecha);
create index idx_gestiones_fecha         on public.gestiones (fecha);
create index idx_gestiones_tipo          on public.gestiones (tipo_id);
create index idx_asignaciones_user_fecha on public.asignaciones (user_id, fecha);
create index idx_asignaciones_fecha      on public.asignaciones (fecha);
create index idx_horarios_user_fecha     on public.horarios (user_id, fecha);
