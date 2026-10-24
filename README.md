# Lean Inception - Spotify - Equipo 03

Trabajo práctico de Proyecto de Software 2026 · 8619 TN · UNLa.

## Funcionalidades incorporadas

### US01 — Registro de usuario

- Creación de cuentas con nombre, correo electrónico y contraseña.
- Validación de campos obligatorios y contraseña de al menos ocho caracteres.
- Control de correos electrónicos duplicados.
- Selección de perfil de usuario o administrador de catálogos.
- Inicio de sesión automático al completar el registro.
- Almacenamiento de contraseñas como hashes con salt.

### US02 — Inicio de sesión

- Acceso mediante correo electrónico y contraseña.
- Validación de credenciales y mensajes de error.
- Visualización del nombre y perfil de la cuenta activa.

### US03 — Búsqueda de canciones

- Búsqueda por coincidencias parciales en el nombre de la canción.
- Búsqueda sin distinguir mayúsculas ni tildes.
- Resultados con título y artista.
- Mensajes para búsquedas vacías, sin resultados o sin canciones disponibles.
- Lectura del catálogo actualizado en cada búsqueda.

### US34 — Cerrar sesión

- Finalización de la sesión activa.
- Limpieza de la búsqueda y los resultados.
- Regreso a los formularios de acceso.

### US35 — Poblar catálogos de contenido

- Carga de contenido con perfil de administrador.
- Catálogos de canciones, artistas, álbumes, playlists y podcasts.
- Importación mediante selección y subida de un archivo JSON.
- Validación del formato del archivo y de los campos obligatorios.
- Omisión de registros duplicados por tipo e identificador.
- Contadores de contenido por categoría.
- Carga de un catálogo de ejemplo desde la pantalla.
- Archivo `catalogo-ejemplo.json` disponible para probar la importación.

### Persistencia local

- Cuentas almacenadas en `datos/usuarios.json`.
- Contenido almacenado en `datos/catalogos.json`, editable manualmente.
- Conservación de cuentas y contenido al cerrar la aplicación.
- Creación automática de archivos JSON vacíos cuando no existen.
- Datos de prueba de usuarios y catálogos incluidos en el repositorio para compartir entre integrantes del equipo.

### US08 — Reproducción de contenido

- Reproducción de canciones con sesión iniciada.
- Información del contenido activo en el reproductor.
- Mensajes para contenidos inexistentes o no disponibles.
- Archivos de audio en `datos/audio`, asociados a canciones del catálogo mediante `audioFile`.
- Interfaz de reproducción limitada a canciones; sin sección de podcasts ni playlists.

### US09 — Pausa y reanudación

- Pausa de la reproducción activa.
- Reanudación desde el mismo punto, sin reiniciar el audio.
- Indicación del tiempo transcurrido y de la duración.
- Detención y limpieza del reproductor al cerrar sesión.

### US36 — Obtener información del contenido

- Consulta autenticada de canciones mediante `GET /api/songs/:id`.
- Consulta de canciones, podcasts y playlists mediante `GET /api/content/:type/:id`.
- Respuestas con título, artista, álbum, duración en segundos y disponibilidad; los campos no cargados se devuelven como `null`.
- Información actualizada a partir del catálogo y de la existencia del archivo de audio.

### US37 — Proporcionar acceso al audio

- Transmisión autenticada mediante `GET /api/audio/:type/:id`.
- Soporte para solicitudes parciales por rangos de bytes y consultas `HEAD`.
- Archivos WAV, MP3, OGG y M4A dentro de `datos/audio`.
- Importación de los campos `album`, `duration`, `available` y `audioFile` para canciones y podcasts.
- Playlists con una lista ordenada `items`, cuyas referencias contienen `id` y `type` (`cancion` o `podcast`).
- Validación de rutas para impedir el acceso a archivos fuera de la carpeta de audio.

### US04 — Búsqueda por artista

- Selección de búsqueda por canción o por artista.
- Resultados agrupados por nombre de artista, con sus canciones y la opción de reproducirlas.
- Coincidencias parciales sin distinguir mayúsculas ni tildes.
- Mensajes para búsquedas sin criterio o sin artistas coincidentes.

### US40 — Backend: búsqueda por artista

- Endpoint autenticado `GET /api/search/artists?q=nombre`.
- Respuesta con `artists` (nombres sin duplicados) y `songs` (canciones con identificador, título, artista, duración y disponibilidad).
- Artistas obtenidos del catálogo de artistas y de las canciones existentes, sin requerir registros duplicados.
- Validación del criterio de búsqueda y respuesta vacía cuando no hay coincidencias.
- Lectura del catálogo actualizado en cada consulta.

### US11 — Subir y bajar volumen

- Botones para bajar y subir el volumen en pasos de diez puntos porcentuales.
- Control deslizante de volumen entre 0% y 100%, con porcentaje visible.
- Cambio del volumen del audio activo sin detenerlo ni reiniciar su posición.
- Conservación del nivel al pausar, reanudar o cambiar de canción durante la sesión de la página.

