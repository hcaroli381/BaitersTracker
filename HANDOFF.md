# BaitersTracker — Documento de traspaso

> Léelo entero antes de tocar nada. Recoge la dirección de arte acordada, las decisiones tomadas,
> el estado real del backend y la lista de lo que falta.

Última actualización: **4 de noviembre de 2026** · Entrega: **v1.3 (sin demo, dorsal propio, plantilla cargada)**

---

## 1. Qué es

App privada del grupo de fútbol **Baiters**: cada partido se registra, cada jugador recibe notas del
resto y todo se acumula en un histórico (media, goles, MVP, victorias, encajados). Las fotografías de
los jugadores son parte central de la interfaz.

- **Stack:** HTML + CSS + módulos ES sin build. Supabase (Postgres + Auth + Storage). Desplegable en
  GitHub Pages.
- **Idioma:** toda la interfaz en español, tono de vestuario.
- **Dispositivo:** diseñada primero para móvil; en escritorio se convierte en una revista a dos columnas.

---

## 2. Dirección de arte — obligatoria

**A · Dark Editorial.** No es una preferencia estética menor: es la razón por la que se rehízo la
primera entrega. Si algo se parece a una plantilla de SaaS, está mal.

### 2.1 Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#0a0a0b` | Fondo base, carbón |
| `--ink-2` | `#0f0f11` | Superficies (inputs, tarjetas, hojas) |
| `--ink-3` | `#161618` | Elevación puntual, toasts |
| `--bone` | `#f3f0e7` | Texto principal, blanco roto (nunca `#fff` puro) |
| `--bone-dim` | `#c9c5b8` | Texto secundario |
| `--warm` | `#8d887c` | Etiquetas, metadatos, gris cálido |
| `--acid` | `#ccff3f` | **Solo** acento: activo, dato clave, CTA |
| `--line` | `rgba(243,240,231,.10)` | Hairlines de 1px que estructuran todo |

Reglas de color:
- El verde ácido **no es decoración**: nunca como fondo de secciones grandes ni en degradados. Se usa en
  estados activos, cifras récord, el MVP y el botón principal.
- Sin sombras difusas, sin cristal, sin degradados de color. La jerarquía se hace con tipografía,
  hairlines y espacio.

### 2.2 Tipografía

- **Display — `Big Shoulders Display`** (600–900), siempre en mayúsculas, `line-height` 0.78–0.95,
  `letter-spacing` negativo. Tamaños enormes en títulos de página, cifras de marcador y nombres.
- **Texto — `Instrument Sans`** (400–700), 13–15 px, para todo lo legible.
- **Etiquetas — `IBM Plex Mono`** (400–600), 8–11 px, mayúsculas y `letter-spacing` 0.12–0.22em. Es la
  voz "estadística": kickers, fechas, unidades, chips.
- Cifras siempre con `font-variant-numeric: tabular-nums`.
- El recurso de palabra en contorno (`.outline`, `-webkit-text-stroke`) aparece **una vez** por título,
  como mucho.

### 2.3 Composición

- Asímetría controlada: foto grande + bloque de texto que se solapa ligeramente (`.spotlight`, `.leader`).
- Números fantasma enormes en contorno (`-webkit-text-stroke` al 6–16% de opacidad) detrás de los
  protagonistas.
- Filas de tabla como renglones de periódico: 1px de separación, sin tarjetas ni radios grandes
  (`--radius: 2px` en botones e imágenes; las fotos van a sangre).
- Fotos: a color en los momentos protagonistas; **en blanco y negro** en listas y alineaciones (aspecto
  de hoja de equipo). Hover: recupera color y escala 1.04.
- Sin foto: placa de vestuario (`.ph--empty`) con degradado carbón, silueta de camiseta al 9%, iniciales
  en display e dorsal en mono ácido. Nunca un icono genérico ni un avatar de iniciales circular.
- Móvil: dock inferior fijo con etiquetas mono. Escritorio: rail lateral de 258 px con numeración 01–05,
  sin barra superior de navegación.
- Microanimación sobria: barrido de 400 ms al entrar la vista, hojas modales que suben, nada elástico.

### 2.4 Lo que está prohibido

- Emojis en la interfaz. Iconos genéricos (lucide/heroicons) como decoración.
- Tarjetas redondeadas con icono + título + párrafo repetidas en grid.
- Fondos con blobs, mallas, degradados morados/azules, glassmorphism.
- Texto centrado en héroes con "badge" tipo píldora.
- Inter, Poppins, Space Grotesk, Roboto.
- Verde ácido como color de fondo amplio.

---

## 3. Acceso y roles

| Rol | Cómo entra | Qué puede |
| --- | --- | --- |
| Grupo | Cuenta única `vestuario@baiters.local` + contraseña común (Supabase Auth) | Ver todo, votar |
| Dispositivo | Token aleatorio de 32 bytes en `localStorage` (`bt.device.token`) | Identifica al votante |
| Admin | Contraseña propia (bcrypt en `private.admin`, validada por `private.assert_admin`) | Gestionar plantilla, partidos, fotos y ajustes |

- **La contraseña del grupo no está en el repositorio.** Se gestiona en Supabase → Authentication → Users.
- **La contraseña de admin tampoco.** Se introduce en la pestaña **05 · Admin** de la app y se guarda en
  `sessionStorage` (solo esa pestaña). Si se pierde, se resetea por SQL (ver §9).
- El token de dispositivo hace que cada móvil vote siempre como el mismo jugador. `claim_player` lo
  vincula una sola vez; el admin puede liberarlo con `admin_release_player`.
- **Dorsales:** los elige cada jugador en su primer acceso (paso 2, tras elegir su nombre). El dorsal queda
  reservado por la restricción `unique` de `shirt_number`; el admin solo lo corrige desde el panel.
- La sesión de Supabase se persiste en el navegador: no se pide contraseña en cada visita.
- **No hay modo demo.** Todo lo que se ve en producción son datos reales de la base.

---

## 4. Backend real (verificado el 4/11/2026)

Proyecto: `sarbskubgajtftfthanl` (eu-west-3, Postgres 17, estado ACTIVE_HEALTHY).

### 4.1 Tablas (`public`)

| Tabla | Columnas |
| --- | --- |
| `players` | `id uuid` PK, `name text` único, `shirt_number int` único, `device_hash text` único, `claimed bool`, `active bool` (true), `avatar_path text`, `created_at timestamptz` |
| `matches` | `id uuid` PK, `played_on date`, `status text` (`open` por defecto / `closed`), `created_at` |
| `appearances` | PK (`match_id`,`player_id`), `team text` (`A`/`B`), `goals int` |
| `votes` | `id uuid` PK, único (`match_id`,`voter_id`,`target_id`), `score smallint` 1–10, `created_at` |
| `settings` | `id int` PK = 1, `allow_self_vote bool` |

`private.admin` (`id`, `pw_hash` bcrypt) guarda la contraseña de administración.

### 4.2 Vistas

- `player_stats` — partidos, victorias/empates/derrotas, goles, MVP, media y encajados por partido.
- `player_match` — una fila por jugador y partido, con equipo, goles, `gf`/`ga`, media y nº de votos.
- `match_summary` — marcador agregado A/B por partido.
- `mvp_matches` — ganador por media en partidos cerrados.

**Importante:** las cuatro vistas se han migrado a `security_invoker = true` y se ha revocado `SELECT` a
`anon`. Antes filtraban datos sin iniciar sesión aunque las tablas estuvieran protegidas por RLS.

### 4.3 Funciones RPC (`public`, todas `security definer`)

- Grupo: `me(p_token)`, `claim_player(p_token, p_player, p_number)`, `cast_vote(p_token, p_match, p_target, p_score)`.
- `claim_player` fija nombre y dorsal en una sola operación: `p_number` va a `shirt_number` si el jugador aún
  no tenía uno, y un dorsal repetido devuelve el mensaje «Ese dorsal lo acaba de coger otro».
- Admin (todas con `p_pw`): `admin_check`, `admin_add_player`, `admin_rename_player`,
  `admin_set_player_active`, `admin_set_number`, `admin_set_avatar`, `admin_delete_player`,
  `admin_release_player`, `admin_create_match`, `admin_set_match_date`, `admin_set_match_status`,
  `admin_set_lineup`, `admin_set_goals`, `admin_delete_match`, `admin_delete_vote`, `admin_set_vote`,
  `admin_set_allow_self_vote`, `admin_change_password`.
- `admin_set_lineup` con `p_team = null` elimina la aparición (así se saca a alguien de la alineación).
- `admin_change_password` exige mínimo 8 caracteres.

### 4.4 RLS y Storage

- RLS activo en las cinco tablas, con políticas **solo** `SELECT` para `authenticated`. Ninguna escritura
  directa: todo pasa por RPC.
- `EXECUTE` revocado a `anon` en todas las funciones (comprobado una a una: las 21 devuelven `false`).
- Bucket `player-photos`: público de lectura, límite 5 MB, solo `image/jpeg`, `image/png`, `image/webp`.
- Nuevas políticas de Storage para `authenticated`: `player_photos_insert/update/delete`, limitadas a
  `bucket_id = 'player-photos'`.

### 4.5 Estado de los datos

- **Jugadores: 10** — Hugo, Aarón, Gabriel, Pedro, David, Maksym, JuanRa, JuanJ, Adrián y Pablo.
  Ninguno tiene dorsal todavía: lo elige cada uno al entrar por primera vez.
- **Partidos: 0. Apariciones: 0. Votos: 0.** Ajustes: 1 fila.
- Cuenta `vestuario@baiters.local`: existe y está confirmada. `private.admin`: 1 fila (contraseña de admin ya definida).

Siguiente paso natural: fotos y el primer partido.

---

## 5. Qué estaba hecho y qué se ha hecho ahora

### Antes (sesiones anteriores)

- Esquema completo, vistas, RPCs y contraseña de admin con bcrypt.
- `avatar_path` en `players` y bucket `player-photos`.
- Endurecimiento parcial: RLS en tablas y `EXECUTE` revocado a `anon`. *(Quedaban las vistas abiertas.)*
- Cuenta compartida creada por el usuario y confirmada.
- Primera interfaz "starter" que **no llegó a entregarse** y cuyo diseño no gustó: era genérica.

### En esta sesión

1. **Seguridad**
   - Vistas a `security_invoker` + `REVOKE` de `anon`: ya no se puede leer nada sin sesión.
   - Políticas de Storage para subir y reemplazar fotos con la sesión del grupo.
   - `config.js` rechaza la clave secreta (`sb_secret_…`): si se pega, no se guarda y avisa en el formulario.
2. **Backend**
   - `players.shirt_number` (único, 1–99) y RPC `admin_set_number`.
   - `claim_player` pasa a `(p_token, p_player, p_number)` y reserva el dorsal elegido en la misma llamada.
   - Cargados los 10 jugadores iniciales (solo nombre; dorsal libre para que lo elijan ellos).
3. **Frontend nuevo, de cero** (sustituye al starter)
   - Sistema visual Dark Editorial completo, repartido en `app.css`, `layout.css`, `views.css`,
     `detail.css` y `admin.css` (se carga en ese orden desde `index.html`).
   - Acceso con la cuenta compartida; elección de nombre y dorsal por dispositivo; persistencia de sesión.
   - Inicio, Ranking ordenable, Partidos, Detalle con alineaciones/goles/notas, Perfil con gráfico de
     evolución, Plantilla.
   - Votación 1–10 por jugador con bloqueo de autovoto y feedback inmediato.
   - Panel de admin: alta de jugadores (solo nombre), renombrar, activar, liberar móvil, corregir dorsal,
     borrar, **subida de foto desde móvil/PC**, crear partido, fecha, abrir/cerrar, editor de alineación
     con equipos y goles, autovoto y cambio de contraseña de admin.
   - Estados vacíos diseñados: mientras no haya partidos, la app se ve limpia en lugar de rota.
4. **Modo demo retirado**
   - Se eliminaron el botón «Ver demo del diseño», `assets/js/demo.js` y todas las ramas de demo de
     `app.js`, `data.js`, `core.js` y `config.js`. La app solo funciona con la base real.
5. **Publicación**
   - Repositorio público `hcaroli381/BaitersTracker` y GitHub Pages activo en
     https://hcaroli381.github.io/BaitersTracker/ (rama `main`, raíz).

---

## 6. Cómo se usa (para el usuario)

1. Abrir la web. Si `config.js` no lleva la clave, introducir URL y clave **publishable** una vez por navegador.
2. Entrar con `vestuario@baiters.local` + contraseña del grupo.
3. Elegir nombre: queda fijado en ese móvil. Después, elegir dorsal (rejilla del 1 al 99 con los ocupados
   tachados; el número queda reservado). Si alguien se equivoca, el admin pulsa **Liberar**.
4. **Admin** (pestaña 05) → contraseña de administrador → pestaña Jugadores: alta de jugadores **solo con
   el nombre**. Cada uno elegirá dorsal al entrar por primera vez; el botón `#` del panel lo corrige.
5. Subir foto a cada jugador (cámara del móvil o archivo).
6. Partidos → crear el partido de hoy → **Alineación**: asignar A/B y goles → **Cerrar** cuando acabe la
   votación.
7. Cada jugador entra, vota a los demás (1–10) y el ranking se actualiza solo.

---

## 7. Publicación

- **Web:** https://hcaroli381.github.io/BaitersTracker/ — GitHub Pages activo (Settings → Pages →
  *Deploy from a branch* → `main` / `(root)`).
- **Repositorio:** https://github.com/hcaroli381/BaitersTracker (público, rama `main`).
- No hay paso de build ni dependencias npm. `index.html` carga `@supabase/supabase-js` desde jsDelivr
  (versión 2.118 o superior: las anteriores no entendían las claves publishable) y las tipografías desde
  Google Fonts: requieren conexión, no hay copia local.
- La clave pública puede ir en `assets/js/config.js` (`key`) o dejarse vacía para que cada navegador la
  introduzca una vez. Es pública por diseño; la seguridad está en RLS y en las RPC.
- Para republicar cambios basta con hacer commit en `main`: Pages reconstruye en un minuto.

---

## 8. Lo que falta (en orden)

1. **Probar en dos móviles reales**: acceso, elección de nombre y dorsal, y que el dorsal quede bloqueado.
2. **Fotos** de los 10 jugadores (hoy se ve la placa de vestuario con iniciales).
3. **Primer partido**: crearlo, alinear, votar y cerrarlo para ver el MVP y el ranking con datos.
4. **Cerrar el registro** en Supabase (Authentication → Providers → Email → *Allow new users to sign up*
   desactivado) y subir el mínimo de contraseña.

### Deuda conocida / mejoras pendientes

- **Admin de votos**: las RPC `admin_set_vote` y `admin_delete_vote` existen pero no tienen interfaz
  todavía (corregir una nota a mano requiere SQL o añadir pantalla).
- **Cambio de dorsal**: un jugador no puede cambiarse el número a sí mismo; solo el admin. Si se quiere
  permitir, hay que añadir RPC `change_my_number` con la misma validación de unicidad.
- **Cambio de contraseña del grupo**: no hay interfaz; se hace en Supabase → Authentication → Users.
- **Borrado de fotos antiguas**: al cambiar de foto se sube un archivo nuevo y el anterior queda en el
  bucket. Conviene limpiar por política o desde el panel.
- **Posición del jugador** (portero/defensa/…): no está en el esquema. Si se quiere mostrar, hay que
  añadir columna + RPC + UI.
- **Equipos con nombre**: hoy son "Equipo A" y "Equipo B" (el esquema no guarda nombres). Se puede añadir
  una tabla `teams` o dos columnas en `matches`.
- **Jornadas**: no numeradas en base de datos; se muestran por fecha.
- **Realtime**: la app recarga al navegar. Para que las notas de los demás aparezcan sin recargar haría
  falta `supabase.channel(...)` sobre `votes` y `matches`.
- **PWA / icono en el móvil**: no implementado.
- **Verificación visual**: en este entorno no hay navegador automatizado, así que la interfaz está
  verificada por revisión de código, sintaxis y HTTP, no con capturas. Revisar en móvil real.
- **Vistas y `security_invoker`**: si en el futuro se crea una vista nueva, hay que repetir
  `set (security_invoker = true)` y revocar `anon`, o volverá a haber fuga de datos.

---

## 9. Mantenimiento (SQL útil)

Resetear la contraseña de admin si se pierde (ejecutar en el SQL Editor de Supabase, cambiando el texto):

```sql
update private.admin
set pw_hash = extensions.crypt('NUEVA_CONTRASEÑA', extensions.gen_salt('bf'));
```

Comprobar que no queda nada legible sin sesión:

```sql
select c.relname,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v')
order by 1;
```

Liberar un móvil concreto (si no hay admin a mano):

```sql
update public.players set device_hash = null where name = 'Nombre';
```

---

## 10. Criterios para la siguiente instancia

- No rehacer el diseño desde cero: el sistema visual ya está y es el acordado. Ampliarlo, no sustituirlo.
- Antes de tocar estilos, leer §2 y respetar el uso del ácido y las hairlines.
- Cualquier acción de escritura va por RPC. No añadir políticas de escritura a las tablas.
- Las fotos viven en Storage; el histórico solo guarda la ruta (`avatar_path`).
- El dorsal y el jugador se eligen una vez por dispositivo; el panel solo corrige excepciones.
- **No reintroducir un modo demo**: si hace falta revisar el diseño sin datos, se levanta en local con la
  base de pruebas, no se añade un botón en producción.
- Probar en móvil real: 360 px de ancho es el objetivo mínimo.
- No introducir dependencias ni build si no es imprescindible: la simplicidad del despliegue en Pages es
  una decisión, no un descuido.
