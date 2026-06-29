# Pulso — Group COS para ETB Mayoristas

Centro de operaciones del Help Desk Mayoristas: bandeja del día, registro de
gestiones, auditoría de tiempos y métricas de efectividad/productividad con
contexto de demanda. Stack: **Next.js 15 + Supabase (PostgreSQL) + Vercel**.

---

## 1. Crear el proyecto en Supabase

1. supabase.com → New project. Guarda la contraseña de la base.
2. **SQL Editor** → ejecuta los archivos de `supabase/` **en orden**:
   `01_schema.sql` → `02_functions.sql` → `03_rls.sql` → `04_seed_catalogo.sql` → `05_rpc.sql`.
3. **Vault** (Project Settings → Vault) → crea un secreto:
   - nombre: `pulso_pii_key`
   - valor: una cadena aleatoria larga (≥ 40 caracteres). Es la llave de cifrado de las cédulas.
4. Copia de **Project Settings → API**: `URL`, `anon key` y `service_role key`.

## 2. Configurar el código

```bash
npm install
cp .env.example .env.local      # pega tus tres llaves de Supabase
```

Los logos ya vienen en `public/` (`etb.png`, `groupcos.png`).

## 3. Crear el primer superadmin

Como aún no hay usuarios, créalo una vez desde el **SQL Editor** de Supabase
(Auth → Users → Add user con email `admin@pulso.groupcos.co` + contraseña), y
luego inserta su perfil:

```sql
insert into public.usuarios (id, login, nombre, apellido, rol, cargo)
select id, 'admin', 'Administrador', 'COS', 'superadmin', 'Superadmin'
from auth.users where email = 'admin@pulso.groupcos.co';
```

A partir de ahí, el resto del equipo se crea desde la app (vista Superadmin →
Usuarios), que usa `crearUsuario()` con la service role key.

## 4. Cargar el equipo y los horarios

- **Usuarios:** desde la app, o en lote adaptando `crearUsuario()`.
  Cada persona entra con su `login` (ej. `decheverri`) y la contraseña que le asignes.
  Internamente el login se convierte en `login@pulso.groupcos.co` (correo técnico, nunca se envía).
- **Horarios semanales** (mismo Excel de hoy):

```bash
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run import:horarios -- ./Turnos.xlsx 2026-06-08 ROTACION
```

El importador empata a cada persona por su **Login** operativo (1646, ETBSOP236…)
contra `usuarios.code`, y calcula el tiempo disponible desde la columna `th`.

## 5. Desplegar en Vercel

1. Sube el repo a GitHub.
2. Vercel → New Project → importa el repo.
3. En **Settings → Environment Variables** pega las tres llaves (igual que `.env.local`).
4. Deploy. Cada push a `main` re-despliega solo.

---

## Cómo está protegido (seguridad por diseño)

- **RLS en todas las tablas** (`03_rls.sql`): el agente solo lee y crea lo suyo,
  y no puede editar ni borrar lo ya registrado.
- **El agente nunca ve un acumulado de su tiempo.** Los totales y promedios solo
  existen vía funciones RPC (`05_rpc.sql`) que exigen rol privilegiado; así se
  elimina el incentivo a inflar minutos para "llegar a 8 horas".
- **Cédulas cifradas y aisladas** en `empleado_documento`, accesibles solo por el
  superadmin mediante `guardar_documento` / `leer_documento` (llave en Vault).
  Nunca viajan en claro al navegador.
- **Service role key solo en el servidor** (Server Actions), nunca en el cliente.

## Mapa de archivos

```
supabase/            Esquema, funciones, RLS, seed y RPC de métricas
lib/supabase/        Clientes browser / server / admin
lib/data.ts          Capa de datos: cada acción del prototipo → llamada a Supabase
lib/types.ts         Tipos del dominio
app/                 layout, login, page (gate por rol), actions
components/Dashboard.tsx   Shell que enruta por rol (aquí van las vistas del prototipo)
scripts/import-horarios.ts Importador del Excel de turnos
public/              Logos eTb y Group Cos
```

## Portar la interfaz del prototipo

El prototipo `Pulso.jsx` ya tiene el diseño y las 4 vistas completas. Para
producción, copia esos componentes a `components/` y reemplaza el estado en
memoria por las funciones de `lib/data.ts` (la tabla de equivalencias está
documentada al inicio de `components/Dashboard.tsx`). El CSS ya está extraído a
`app/globals.css`, así que el aspecto es idéntico.

## Fase 2 (sin re-trabajo)

Salesforce: con tu API y token, un Route Handler puede enriquecer los reportes
(cliente que más demora, tipo de caso) consultando por `numero_caso`. No toca
nada de lo construido; se suma como una fuente más en los dashboards.
