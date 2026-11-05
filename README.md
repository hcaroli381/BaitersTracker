# BaitersTracker

Aplicación del vestuario: notas partido a partido, goles, MVP y clasificación histórica.
Sin frameworks ni build: HTML + CSS + módulos ES, con Supabase como backend y Storage para las fotografías.

Dirección de arte: **Dark Editorial** — carbón, blanco roto y verde ácido, tipografía deportiva de revista.

---

## Puesta en marcha

1. Abre la web. La primera vez pedirá **Project URL** y la **clave pública** de Supabase.
   - Supabase → **Settings → API Keys** → pestaña *Publishable and secret API keys* → copia la **publishable** (`sb_publishable_…`).
   - Nunca la **secret**: se salta todas las reglas y no debe estar en una web.
   - Se guardan en el navegador (localStorage), nunca en el repositorio. Para que no la tenga que pegar
     nadie, ponla en `assets/js/config.js` (`key`): es pública por diseño.
2. Entra con la cuenta compartida del grupo (`vestuario@baiters.local` y la contraseña del grupo).
3. La primera vez elige **quién eres** en la lista de nombres y después **tu dorsal**. El número queda
   reservado para ti: nadie más puede cogerlo. Ese móvil queda vinculado a tu jugador para votar.
4. La zona **Admin** (última pestaña) pide la contraseña de administrador, independiente de la del grupo.

---

## Publicado

- **Web:** https://hcaroli381.github.io/BaitersTracker/
- **Repositorio:** https://github.com/hcaroli381/BaitersTracker (rama `main`, GitHub Pages en `/root`).
- No hay compilación: se sirve la carpeta tal cual. También funciona en Netlify, Vercel o Cloudflare Pages.

---

## Estructura

| Ruta | Contenido |
| --- | --- |
| `index.html` | Documento único; enlaza las 5 hojas CSS y arranca `assets/js/app.js` |
| `assets/css/app.css` | Base: tokens, tipografía, utilidades, botones, arranque |
| `assets/css/layout.css` | Acceso, elección de jugador y dorsal, shell, navegación y fotos |
| `assets/css/views.css` | Inicio, ranking y lista de partidos |
| `assets/css/detail.css` | Detalle de partido, perfil y plantilla |
| `assets/css/admin.css` | Panel de admin, hojas modales y toasts |
| `assets/css/motion.css` | Movimiento: cascada de entrada, marcador, pulsación y progreso |
| `assets/js/app.js` | Arranque, acceso, elección de nombre y dorsal, shell y router |
| `assets/js/core.js` | Cliente Supabase, estado, formato, fotos, toasts, modales |
| `assets/js/data.js` | Consultas, votaciones, identidad del dispositivo y RPCs |
| `assets/js/views.js` | Inicio, ranking, partidos, detalle de partido, perfil y plantilla |
| `assets/js/admin.js` | Panel de administración |
| `assets/js/config.js` | URL y clave pública de Supabase |
| `assets/img/` | Marca y silueta de camiseta para las placas sin foto |
| `HANDOFF.md` | Traspaso completo: estilo, decisiones, estado y pendientes |

---

## Pantallas

- **Inicio** — último resultado, MVP destacado, próximo partido, jugadores destacados y últimos resultados.
- **Ranking** — ordenable por goles, MVP, victorias, nota media y goles encajados.
- **Partidos** — abiertos y cerrados, con alineaciones, goles y notas.
- **Plantilla** — rejilla de jugadores con foto y dorsal.
- **Perfil** — foto grande, histórico de estadísticas, evolución de la nota y partidos jugados.
- **Admin** — jugadores (alta por nombre, renombrar, activar, liberar móvil, corregir dorsal, borrar),
  fotografías, partidos (crear, fecha, estado, alineación con equipos y goles) y ajustes (autovoto,
  contraseña de admin).

---

## Dorsales

El admin añade **solo los nombres**. Cada jugador, la primera vez que entra, elige su nombre y luego su
número en una rejilla de 1 a 99 con los ya ocupados tachados. El dorsal queda reservado por una restricción
`unique` en la base, así que dos personas no pueden acabar con el mismo. Si alguien se equivoca, el admin
lo corrige con el botón `#` del panel (o lo libera y repite la elección).

Un jugador cogido desaparece de la lista de «¿Quién eres?» y no se puede volver a coger desde otro móvil,
y los comodines tampoco salen; las dos reglas se activan o desactivan en **Admin → Ajustes**. Si no queda ningún jugador
libre (plantilla vacía o todos cogidos), la web entra directamente sin preguntar.

---

## Fotografías

Se suben desde **Admin → Jugadores → Foto** (móvil u ordenador, JPG/PNG/WebP, máx. 5 MB).
Van a Supabase Storage, bucket `player-photos`, en `player-photos/<id-jugador>/<timestamp>.<ext>`, y se
asocian al jugador con `admin_set_avatar`. El bucket es público de lectura: la imagen se ve siempre, en
todos los partidos e históricos.

---

## Votación: cuándo se abre

Cada partido guarda su **hora de inicio** (`kickoff_at`). La votación abre **una hora después** del
inicio programado, ni un minuto antes. La regla está en la base (`cast_vote`), así que no se salta
llamando a la API a mano; la interfaz solo la explica:

- En la ficha del partido: «La votación abre el sáb 8 nov, 22:00».
- En Inicio, en lugar de «te faltan notas», el aviso de que todavía no está abierta.

El admin puede corregir día y hora desde **Admin → Partidos → Fecha y hora**; mover el día conserva la
hora. Si un partido antiguo no tiene hora, cuenta como las 21:00 de su día.

---

## MVP y desempate

El MVP de un partido cerrado es la **mejor nota media**. Si dos o más jugadores acaban con la misma
nota (dos decimales), el MVP lo decide una **votación de desempate**:

- Votan solo los jugadores de ese partido que tengan voto. Los **comodines no votan**, y quien no
  jugó tampoco: la regla está en la base (`cast_mvp_tie_vote`), no solo en la pantalla.
- Cada uno elige a uno de los empatados y solo puede votar una vez; el autovoto sigue bloqueado.
- Gana el que consiga la mayoría de los jugadores del partido con voto. Con un solo voto no se decide
  nada, y mientras no haya mayoría el MVP sigue pendiente.
- La ficha del partido enseña a los empatados, los votos de cada uno y quién puede votar.
- Si después se corrige una nota y el empate cambia, los votos anteriores dejan de contar.

---

## Equipos y cambios de equipo

Los equipos y los goles se pueden poner **antes, durante y después** del partido, también con el partido
cerrado.

Si a mitad de partido los equipos están desequilibrados, en **Admin → Partidos → ¿Cambio de equipo?**
(también dentro del editor de alineación) se responde que sí y el partido se divide en **tramos**:

- Cada tramo tiene sus propios equipos y sus goles.
- Se abre copiando los equipos actuales, para rebalancear solo a quien haga falta.
- Los goles de cada tramo cuentan para el equipo con el que se marcaron, así que el marcador final sigue
  cuadrando. Un jugador que cambió reparte sus goles al lado correcto.
- El detalle enseña **Cambios de equipo**: quién jugaba en cada lado y cómo iba el marcador en cada tramo.
- Se puede **deshacer el último tramo** si se marcó por error.

---

## Movimiento

La animación vive en `assets/css/motion.css`, que se carga después de todos los demás estilos. No cambia
la estética: solo mueve lo que ya hay.

- Los bloques de cada pantalla, las filas, los equipos y las hojas entran en cascada.
- El marcador cuenta de 0 al resultado y la raya del centro se dibuja.
- La barra de votos crece hasta su porcentaje y las notas aparecen con un golpe.
- En móvil, filas y botones se hunden un poco al pulsarlos.
- Todo se apaga con «reducir movimiento» del sistema.

## Migraciones

El esquema se aplica a mano en **Supabase → SQL Editor**, en este orden (son idempotentes, se pueden
repetir):

1. `supabase/migrations/20261105_01_vote_window.sql`
2. `supabase/migrations/20261105_02_team_splits.sql`
3. `supabase/migrations/20261105_03_mvp_tiebreak.sql`
4. `supabase/migrations/20261105_04_pick_rules.sql`

---

## Pruebas

No hay build y las pruebas no tocan producción: montan un PostgreSQL de mentira (PGlite) con una
reconstrucción del esquema y aplican encima las migraciones.

```bash
cd tests
npm install
npm test
```

- `tests/rules.test.mjs` — reglas puras: ventana de votación, tramos, marcador por equipo y medias.
- `tests/db.test.mjs` — SQL real: la hora de apertura, equipos antes/durante/después, tramos,
  desempate del MVP, estadísticas sin doble conteo, permisos de admin y vistas cerradas a `anon`.
- `tests/sql/base-schema.sql` — reconstrucción del esquema **solo para las pruebas** (no se aplica en
  Supabase).

La regla compartida por la app y las pruebas vive en `assets/js/rules.js`, sin dependencias.
