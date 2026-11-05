# BaitersTracker — Documento de traspaso

> Léelo entero antes de tocar nada. Recoge la dirección de arte acordada, las decisiones tomadas,
> el estado real del backend y la lista de lo que falta.

Última actualización: **5 de noviembre de 2026** · Entrega: **v1.5 (ventana de votación y cambios de equipo)**

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

### 2.5 Movimiento

- Vive en `assets/css/motion.css`, que se carga el último. No cambia la estética: no hay colores,
  sombras ni degradados nuevos; solo se mueve lo que ya está.
- Solo se animan `transform` y `opacity`: nada que fuerce repintado ni recálculo de caja en móvil.
- Entrada en cascada: `stagger()` (`core.js`) reparte `--i` por los hijos de la vista, las listas, las
  hojas y la escala de notas; `motion.css` lo traduce en 42 ms de retardo por pieza (máximo 12).
- Cifras: `count(v)` marca el marcador y `animateCounts()` cuenta de 0 al valor en ~0,6 s, con red de
  seguridad por si la pestaña queda en segundo plano.
- Pulsación: las filas, tarjetas y botones se hunden un poco al pulsarlos (`scale(0.985)` y
  `scale(0.94)`). Sin media query: se comporta igual con dedo y con ratón, y así se puede comprobar.
- Con `prefers-reduced-motion: reduce` todo queda en 0,001 ms y sin retardo: nada se mueve y nada se
  queda escondido.
- Regla que no hay que romper: `animation-fill-mode: backwards`, nunca `both`. Con `both`, el
  `transform` final de la animación gana al `:active` y la pulsación deja de verse.

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

### 3.1 Dos tipos de jugador: votantes y comodines

| Tipo | `can_vote` | Qué hace |
| --- | --- | --- |
| Votante | `true` | Fijo en la plantilla: vota cada partido y aparece en «¿Quién eres?». |
| Comodín | `false` | Se le llama cuando falta alguien. Juega partidos sueltos y **no vota**. |

- La regla vive en la base: `cast_vote` lanza «Los comodines no votan, solo juegan». No es una
  restricción de interfaz que se pueda saltar llamando a la API.
- Los comodines **no aparecen** en la lista de «¿Quién eres?», así que no vinculan móvil ni eligen
  dorsal. El admin los mete en la alineación del partido que jueguen.
- Se cambia de tipo en cualquier momento desde Admin (selector al crear, botón por fila después) mediante
  `admin_set_can_vote`.

---

## 4. Backend real (verificado el 4/11/2026)

Proyecto: `sarbskubgajtftfthanl` (eu-west-3, Postgres 17, estado ACTIVE_HEALTHY).

### 4.1 Tablas (`public`)

| Tabla | Columnas |
| --- | --- |
| `players` | `id uuid` PK, `name text` único, `shirt_number int` único, `device_hash text` único, `claimed bool`, `active bool` (true), `can_vote bool` (true), `avatar_path text`, `created_at timestamptz` |
| `matches` | `id uuid` PK, `played_on date`, `status text` (`open` por defecto / `closed`), `kickoff_at timestamptz`, `created_at` |
| `appearances` | PK (`match_id`,`player_id`,`segment`), `segment int` (1–9, tramo), `team text` (`A`/`B`), `goals int` |
| `votes` | `id uuid` PK, único (`match_id`,`voter_id`,`target_id`), `score smallint` 1–10, `created_at` |
| `settings` | `id int` PK = 1, `allow_self_vote bool` |

`private.admin` (`id`, `pw_hash` bcrypt) guarda la contraseña de administración.

### 4.2 Vistas

- `player_stats` — partidos, victorias/empates/derrotas, goles, MVP, media y encajados por partido.
- `player_match` — una fila por jugador y partido, con equipo, goles, `gf`/`ga`, media y nº de votos.
  Con cambios de equipo `team` es `AB`, `gf`/`ga` van a `null` (no hay un resultado único) y se añaden
  `teams text[]` y `stints int`.
- `match_summary` — marcador agregado A/B por partido, `kickoff_at`, `votes_open_at` (= inicio + 1 h),
  `segments` (nº de tramos) y `votes_count`.
- `mvp_matches` — ganador por media en partidos cerrados.

Los goles viven en el tramo en que se marcaron, así que el marcador de `match_summary` sigue siendo la
suma correcta por equipo aunque la gente cambie de lado a mitad de partido.

**Importante:** las cuatro vistas se han migrado a `security_invoker = true` y se ha revocado `SELECT` a
`anon`. Antes filtraban datos sin iniciar sesión aunque las tablas estuvieran protegidas por RLS.

### 4.3 Funciones RPC (`public`, todas `security definer`)

- Grupo: `me(p_token)`, `claim_player(p_token, p_player, p_number)`, `cast_vote(p_token, p_match, p_target, p_score)`.
- `cast_vote` comprueba la ventana: si `now() < kickoff_at + 1 h` lanza «La votación abre una hora
  después del inicio: DD/MM a las HH:MM». Ni la interfaz ni una llamada a mano pueden saltársela.
- `claim_player` fija nombre y dorsal en una sola operación: `p_number` va a `shirt_number` si el jugador aún
  no tenía uno, y un dorsal repetido devuelve el mensaje «Ese dorsal lo acaba de coger otro».
- `cast_vote` comprueba `can_vote` del votante y rechaza a los comodines.
- Admin (todas con `p_pw`): `admin_check`, `admin_add_player(p_pw, p_name, p_can_vote)`,
  `admin_set_can_vote(p_pw, p_player, p_can_vote)`, `admin_rename_player`,
  `admin_set_player_active`, `admin_set_number`, `admin_set_avatar`, `admin_delete_player`,
  `admin_release_player`, `admin_create_match(p_pw, p_date, p_kickoff)`, `admin_set_match_date`,
  `admin_set_match_kickoff(p_pw, p_match, p_kickoff)`, `admin_set_match_status`,
  `admin_set_lineup`, `admin_set_goals`, `admin_split_match(p_pw, p_match)`,
  `admin_remove_segment(p_pw, p_match, p_segment)`, `admin_delete_match`, `admin_delete_vote`,
  `admin_set_vote`, `admin_set_allow_self_vote`, `admin_change_password`.
- `admin_set_lineup(p_pw, p_match, p_player, p_team, p_segment)` con `p_team = null` elimina la aparición
  de ese tramo (así se saca a alguien de la alineación). `p_segment` es opcional (1 por defecto).
- `admin_set_goals(p_pw, p_match, p_player, p_goals, p_segment)`; sin equipo en ese tramo falla con
  «Asigna equipo antes de poner goles».
- **Equipos cuando quiera:** ninguna de las dos mira el estado ni la fecha del partido, así que la
  alineación se puede poner antes, durante y después (también con el partido cerrado).
- `admin_split_match` responde a «¿Hubo cambio de equipo?»: abre el tramo siguiente copiando los equipos
  actuales con 0 goles y devuelve el número de tramo. `admin_remove_segment` deshace el último.
- `admin_change_password` exige mínimo 8 caracteres.

### 4.4 RLS y Storage

- RLS activo en las cinco tablas, con políticas **solo** `SELECT` para `authenticated`. Ninguna escritura
  directa: todo pasa por RPC.
- `EXECUTE` revocado a `anon` en todas las funciones (comprobado una a una: las 21 devuelven `false`).
- Bucket `player-photos`: público de lectura, límite 5 MB, solo `image/jpeg`, `image/png`, `image/webp`.
- Nuevas políticas de Storage para `authenticated`: `player_photos_insert/update/delete`, limitadas a
  `bucket_id = 'player-photos'`.

### 4.5 Estado de los datos

- **Jugadores: 10** — Hugo, Aarón, Gabriel, Pedro, David, Maksym, JuanRa, Juan Jarillo, Adrián y Pablo.
  Ninguno tiene dorsal todavía: lo elige cada uno al entrar por primera vez. Hoy **0 comodines**.
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
6. **Comodines**
   - `players.can_vote` + `cast_vote` que rechaza el voto de un comodín.
   - `admin_add_player` pide el tipo y `admin_set_can_vote` lo cambia después.
   - Admin: selector *Vota / Comodín* al crear, chips y botón por fila, marca «comodín» en el editor de
     alineación.
   - «¿Quién eres?» filtra a los comodines y avisa de cuántos hay en la plantilla.

### En esta sesión (5 de noviembre de 2026)

1. **Ventana de votación**
   - `matches.kickoff_at`: la hora de inicio programada. Al crear el partido se pide día **y hora**
     (21:00 por defecto); `admin_set_match_kickoff` la corrige y mover el día conserva la hora.
   - La votación abre **una hora después** del inicio, y la regla vive en la base: `cast_vote` la impone
     con `private.vote_opens_at` / `private.votes_are_open`.
   - La interfaz lo explica en vez de fallar: la ficha del partido enseña «La votación abre el …» y el
     inicio avisa en lugar de contar notas pendientes.
2. **Equipos cuando quiera**
   - `admin_set_lineup` y `admin_set_goals` ya no dependen del estado ni de la fecha: antes, durante y
     después del partido, también cerrado.
3. **¿Hubo cambio de equipo? (tramos)**
   - Nuevo botón en Admin → Partidos y dentro del editor de alineación.
   - Al responder que sí, el partido se divide en **tramos** (`appearances.segment`), cada uno con sus
     equipos y sus goles; el admin rebalancea solo a quien haga falta. Se puede deshacer el último tramo.
   - El detalle enseña «Cambios de equipo» con quién jugaba en cada lado y cómo iba el marcador en cada
     tramo; cada jugador que cambió lleva su recorrido («1º Oscuros · 2º Claros»).
   - Las vistas se rehicieron para que un partido con tramos cuente como **un** partido y sume los goles
     de todos los tramos al equipo correcto.
4. **Pruebas locales**
   - `tests/`: reglas puras en Node y el SQL real (con PGlite) sobre una reconstrucción del esquema.
     No se ejecuta nada contra el proyecto de producción. Ver §11.

---

## 6. Cómo se usa (para el usuario)

1. Abrir la web. Si `config.js` no lleva la clave, introducir URL y clave **publishable** una vez por navegador.
2. Entrar con `vestuario@baiters.local` + contraseña del grupo.
3. Elegir nombre: queda fijado en ese móvil. Después, elegir dorsal (rejilla del 1 al 99 con los ocupados
   tachados; el número queda reservado). Si alguien se equivoca, el admin pulsa **Liberar**.
4. **Admin** (pestaña 05) → contraseña de administrador → pestaña Jugadores: alta de jugadores **solo con
   el nombre**, eligiendo tipo (Vota / Comodín). Cada uno elegirá dorsal al entrar por primera vez; el
   botón `#` del panel lo corrige.
5. Subir foto a cada jugador (cámara del móvil o archivo).
6. Partidos → crear el partido con **día y hora** → **Alineación**: asignar A/B y goles (aquí entran los
   comodines). La alineación se puede tocar en cualquier momento.
   - La votación **no se abre hasta una hora después del inicio**; el panel dice a qué hora abre.
   - Si a mitad de partido hay que rebalancear, **¿Cambio de equipo? → Sí, dividir**: se abre un tramo
     nuevo con los equipos actuales y desde ahí reparte de nuevo a quien haga falta.
7. **Cerrar** cuando acabe la votación.
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

Convertir a alguien en comodín (o devolverlo a votante) sin pasar por el panel:

```sql
update public.players set can_vote = false where name = 'Nombre';
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
- **La regla de los comodines va en la base**: cualquier función nueva que cuente votos o votantes debe
  respetar `can_vote`; no basta con ocultarlos en la interfaz.
- Probar en móvil real: 360 px de ancho es el objetivo mínimo.
- No introducir dependencias ni build si no es imprescindible: la simplicidad del despliegue en Pages es
  una decisión, no un descuido.
- Toda regla nueva (ventana de votación, tramos) va también en la base: la interfaz solo la explica.

---

## 11. Migraciones y pruebas

**Estado: aplicadas en producción el 5/11/2026** (proyecto `sarbskubgajtftfthanl`), en orden 01 → 02.
Comprobado después: una sola firma por función, `appearances` con clave `(match_id, player_id, segment)`
y las cuatro vistas respondiendo. Al pasar la clave a tres columnas hubo que quitar las dos claves
foráneas de `votes` hacia `appearances` (Postgres no deja cambiar la PK con ellas colgando); su
integridad la impone `cast_vote`, y se restauró la referencia de `votes` a `players` y `matches`.

- El esquema de producción sigue sin build: se aplica a mano en Supabase → SQL Editor.
- Las migraciones están en `supabase/migrations/` y son **idempotentes**. Orden obligatorio:
  1. `20261105_01_vote_window.sql` — `kickoff_at`, ventana de votación y `match_summary`.
  2. `20261105_02_team_splits.sql` — `appearances.segment`, RPCs de tramos y vistas de jugador.
- **La 02 depende de la 01** (usa `kickoff_at`). Si algo falla, el `begin … commit` deja todo como estaba.
- Antes de aplicarlas en producción conviene revisar las firmas reales de las funciones en Supabase. Las
  migraciones recrean `cast_vote`, `admin_create_match`, `admin_set_match_date`, `admin_set_lineup`,
  `admin_set_goals` y las cuatro vistas; el resto de RPCs no se toca.
- Si en producción hubiera dos versiones de una misma función (una vieja con otros tipos), PostgREST
  respondería «Could not choose the best candidate function». Se comprueba así, y debe salir **una fila
  por nombre**:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as firma
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cast_vote','admin_create_match','admin_set_match_date','admin_set_lineup','admin_set_goals')
order by 1;
```
- Pruebas (no tocan producción):

```bash
cd tests
npm install        # solo la primera vez (PGlite)
npm test           # reglas puras + SQL real en un Postgres de mentira
```

- `tests/sql/base-schema.sql` es una reconstrucción documentada del esquema de producción (HANDOFF §4)
  **solo para las pruebas**; no se aplica nunca en Supabase.
- La interfaz se comprobó además en un navegador con un cliente de Supabase simulado (datos de prueba):
  inicio, ficha con tramos, aviso de votación y editor de alineación. No hay captura guardada.
