# BaitersTracker

Frontend web estático para GitHub Pages + Supabase.

## Configuración
1. El archivo `config.js` contiene la URL del proyecto y la publishable key. Son datos públicos de cliente; nunca introduzcas una secret/service-role key.
2. Publica el contenido de la carpeta en GitHub Pages.
3. La subida de fotografías usa la Edge Function `admin-player-photo`, desplegada en el proyecto Supabase.
4. Las fotos aceptadas son JPG, PNG y WebP, máximo 5 MB.

## Estado de esta primera entrega
- Diseño responsive Dark Editorial.
- Navegación de ranking, partidos, plantilla y votaciones.
- Lectura de jugadores, partidos, alineaciones y votos.
- Selección de identidad por dispositivo y voto 1–10.
- Zona admin con alta de jugadores, creación/cierre de partidos, cambio de nombre, liberación de identidad y subida de fotos.

## Pendiente antes de considerarla lista para el grupo
- Añadir gestión visual completa de alineaciones y goles por equipo.
- Cargar resultados y MVPs/ganadores de forma fiable.
- Revisar el modelo de acceso privado y proteger las funciones administrativas frente a intentos repetidos.
- Verificar permisos RLS y desplegar pruebas end-to-end con el grupo.
- Confirmar el repositorio GitHub de destino y activar Pages.

El MVP actual no calcula victorias ni encajados; no se muestran como estadísticas oficiales.
