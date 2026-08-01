# ⚽ Sporting Ciutat de Palma — Gestión del equipo

PWA para gestionar un equipo de fútbol:

- **Plantilla**: fichas de jugador (nombre, DNI, fecha de nacimiento, demarcación, dorsal, foto, contacto…)
- **Calendario**: partidos de liga, amistosos, copa y torneos
- **Convocatorias**: el entrenador convoca, los jugadores reciben **notificación push** y aceptan o rechazan desde su móvil
- **Alineaciones**: pizarra táctica con formaciones (solo jugadores que aceptaron)
- **Directo**: estadísticas del partido en vivo (goles, tiros, córners, faltas, tarjetas… a favor y en contra), con cronómetro y marcador en tiempo real
- **Temporada**: balance y acumulados por equipo y jugador

**Stack**: Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + Realtime) · Web Push (VAPID) · PWA instalable.

---

## Puesta en marcha (una sola vez, ~15 min)

### 1. Supabase (base de datos, gratis)

1. Crea cuenta en [supabase.com](https://supabase.com) (puedes entrar con GitHub) y crea un proyecto (región `eu-west`).
2. En **SQL Editor**, pega el contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y pulsa **Run**.
3. En **Authentication → URL Configuration** añade tu dominio de producción (p. ej. `https://mi-equipo.vercel.app`) como *Site URL* y `https://.../auth/callback` en *Redirect URLs* (añade también `http://localhost:3000/**` para desarrollo).
4. Copia de **Project Settings → API**: la URL del proyecto, la `anon key` y la `service_role key`.

> ⚠️ El **primer usuario que inicie sesión se convierte en entrenador** (admin). Entra tú primero.

### 2. Claves de notificaciones push

```bash
npx web-push generate-vapid-keys
```

Guarda la pública y la privada.

### 3. Variables de entorno

Copia `.env.example` a `.env.local` y rellena todos los valores.

### 4. Desarrollo local

```bash
npm install
npm run dev
```

### 5. Desplegar en Vercel (gratis)

1. Sube este código a un repositorio **privado** de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo.
   - Si la app está en una subcarpeta del repo, configura **Root Directory** = `gestion-equipo`.
3. Añade en **Environment Variables** las mismas variables de `.env.local`.
4. Deploy. La URL resultante debe coincidir con la *Site URL* configurada en Supabase.

---

## Uso diario

1. **Entrenador**: da de alta a los jugadores en *Plantilla* (incluye su email para que puedan entrar).
2. Cada **jugador** entra en la web con su email (enlace mágico, sin contraseña), instala la PWA y activa las notificaciones en *Perfil*.
   - **iPhone**: Safari → Compartir → *Añadir a pantalla de inicio* (necesario para push, iOS 16.4+).
3. Crea partidos en *Calendario* y la **convocatoria** desde la página del partido: los convocados reciben push y responden.
4. Monta la **alineación** en la pizarra con los que aceptaron.
5. El día del partido, abre **Directo**, pulsa *Empezar partido* y registra los eventos con los botones grandes. El resto del equipo lo ve en tiempo real.

## Escudo del club

La app usa el escudo en la pantalla de login y como icono de la PWA:

1. Guarda el escudo (PNG, idealmente cuadrado y con fondo transparente) como `public/escudo.png`.
2. Ejecuta `npm run icons` para regenerar `public/icons/icon-192.png` y `icon-512.png` a partir de él.

Mientras no exista `escudo.png`, se muestra un balón como reserva.

## Seguridad y RGPD

- Todo protegido con **Row Level Security**: los jugadores solo ven su propia ficha completa; DNI, teléfono y notas nunca son visibles para el resto de la plantilla.
- Las fotos se guardan en un bucket **privado** (URLs firmadas de 1 hora).
- La `service_role key` solo se usa en el servidor para enviar push.

## Estructura

```
supabase/migrations/   Esquema SQL + RLS (ejecutar en Supabase)
src/app/(app)/         Pantallas: plantilla, calendario, partidos, convocatorias, estadísticas, perfil
src/app/actions/       Server actions (jugadores, partidos, convocatorias, alineación, eventos, push)
src/lib/               Clientes Supabase, tipos, envío de push, utilidades
public/sw.js           Service worker (notificaciones push)
```
