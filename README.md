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
- Creación automática de los archivos locales a partir de los ejemplos cuando no existen.
- Exclusión de los archivos locales de datos del repositorio.
