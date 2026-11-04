# BaitersTracker

Aplicación del vestuario: notas partido a partido, goles, MVP y clasificación histórica.
Sin frameworks ni build: HTML + CSS + módulos ES, con Supabase como backend y Storage para las fotografías.

Dirección de arte: **Dark Editorial** — carbón, blanco roto y verde ácido, tipografía deportiva de revista.

---

## Puesta en marcha

1. Abre la web. La primera vez pedirá **Project URL** y **clave pública (anon)** de Supabase.
   - Supabase → *Project Settings* → *API* → `Project URL` y `anon public`.
   - Se guardan en el navegador (localStorage), nunca en el repositorio.
   - Para fijarlas en el código, rellena `assets/js/config.js` (`url` y `key`).
2. Entra con la cuenta compartida del grupo (`vestuario@baiters.local` y la contraseña del grupo).
3. La primera vez elige **quién eres**. Ese móvil queda vinculado a tu jugador para votar.
4. La zona **Admin** pide la contraseña de administrador (independiente de la del grupo).

> ¿Quieres ver el diseño sin datos? En la pantalla de acceso hay un botón **Ver demo del diseño**.

---

## Publicar en GitHub Pages

El código ya está en `https://github.com/hcaroli381/BaitersTracker` (rama `main`).
Solo falta activar el sitio: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
La URL será `https://hcaroli381.github.io/BaitersTracker/`.
No hace falta compilar nada: es un sitio estático.

Si prefieres publicarlo desde cero en otro sitio:

```bash
git clone https://github.com/hcaroli381/BaitersTracker.git
cd BaitersTracker
# abre index.html, o sirve la carpeta con: python3 -m http.server 3000
```

También funciona en Netlify, Vercel o Cloudflare Pages arrastrando la carpeta.

---

## Estructura

| Ruta | Contenido |
| --- | --- |
| `index.html` | Documento único; arranca `assets/js/app.js` |
| `assets/css/app.css` | Base: tokens, tipografía, utilidades, botones, arranque |
| `assets/css/layout.css` | Acceso, selección de jugador, shell, navegación y fotos |
| `assets/css/views.css` | Inicio, ranking y lista de partidos |
| `assets/css/detail.css` | Detalle de partido, perfil y plantilla |
| `assets/css/admin.css` | Panel de admin, hojas modales, toasts y movimiento |
| `assets/js/app.js` | Arranque, acceso, selección de jugador, shell y router |
| `assets/js/core.js` | Cliente Supabase, estado, formato, fotos, toasts, modales |
| `assets/js/data.js` | Consultas, votaciones, identidad del dispositivo y RPCs |
| `assets/js/views.js` | Inicio, ranking, partidos, detalle de partido, perfil y plantilla |
| `assets/js/admin.js` | Panel de administración |
| `assets/js/demo.js` | Datos de demostración (solo diseño) |
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
- **Admin** — jugadores (alta, dorsal, renombrar, activar, liberar móvil, borrar), fotografías, partidos
  (crear, fecha, estado, alineación con equipos y goles) y ajustes (autovoto, contraseña de admin).

---

## Fotografías

Se suben desde **Admin → Jugadores → Foto** (móvil u ordenador, JPG/PNG/WebP, máx. 5 MB).
Van a Supabase Storage, bucket `player-photos`, en `player-photos/<id-jugador>/<timestamp>.<ext>`, y se
asocian al jugador con `admin_set_avatar`. El bucket es público de lectura: la imagen se ve siempre, en
todos los partidos e históricos.
