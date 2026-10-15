# Estudio — etapa (a)

Rediseño del espacio privado `/workspace`. Identidad provisional original: cuatro piezas alrededor de un centro, como un encuadre en construcción. Fondo #0B0B0F, paneles neutros, acento #C8FF3D. Inter para interfaz y Barlow Condensed 800 para el título, alojadas en el proyecto con sus licencias OFL.

## Qué incluye

- Layout de altura completa con panel lateral y área central desplazable.
- Selector informativo del único espacio del equipo, Nuevo chat y navegación de la suite.
- Historial real de briefs locales, estado vacío ilustrado y skeleton durante la carga.
- Caja de creación, adjuntos locales, selector de modelos existente y revisión del brief.
- Tres puntos de partida editables, incluido el libro Русский код A1.
- Proyectos existentes con búsqueda; acceso al editor del libro.
- Consulta de configuración de Kie.ai usando el endpoint existente, sin solicitudes de generación.
- Menú móvil con control de foco y cierre con Escape, ayuda, foco visible y movimiento reducido.

Las pantallas Imagen, Video, Editar, Dirigir, Galería y Skills muestran que se incorporarán en las siguientes etapas. No simulan resultados ni ejecutan llamadas de generación.

## Qué se conserva

Login con Google y alternativa por contraseña, protección del workspace, APIs, sesiones, variables, Neon, Redis, Inngest y generación de libros. El componente anterior se conserva completo en `src/components/project-workspace.tsx` y se abre al seleccionar o crear un brief. No hay migración ni nuevas dependencias.

El catálogo dinámico de Kie, favoritos y cambio de modelo durante el chat se harán en (b). El selector actual se conserva sin anunciar modelos o precios inventados. No se ha añadido fal.ai ni se necesita una clave nueva para esta etapa. Los adjuntos solo guardan sus nombres en el brief; el chat no los lee todavía.

## Archivos completos y rutas

Reemplazar:
- `src/app/globals.css`
- `src/app/workspace/page.tsx`
- `src/components/workspace.tsx`

Añadir:
- `src/components/project-workspace.tsx`
- `src/components/studio/brand.tsx`
- `src/components/studio/sidebar.tsx`
- `public/fonts/estudio-display.ttf`
- `public/fonts/estudio-inter.ttf`
- `public/fonts/barlow-OFL.txt`
- `public/fonts/inter-OFL.txt`
- `docs/ESTUDIO_ETAPA_A.md`

Todos los archivos del ZIP están completos. Los archivos de fuente son binarios: copiarlos, no pegarlos en un editor de texto. No contiene `.env` ni secretos.

## Instalación manual alternativa

Si el cambio ya fue integrado y desplegado desde GitHub, no hace falta hacer estos pasos.

1. Descargar y descomprimir el ZIP.
2. Abrir el repositorio `kimikling76/RuskiCode` en GitHub. Crear una rama desde `main` con un nombre como `estudio-etapa-a-manual`.
3. Para cada archivo de texto existente, abrir su ruta, pulsar el lápiz, reemplazar todo el contenido por el del archivo del ZIP y guardar en esa rama. No agregar el ZIP al repositorio.
4. Para los archivos nuevos, usar **Add file → Upload files** dentro de la carpeta correspondiente. Si la carpeta no existe, crear primero un archivo de texto con su ruta completa usando **Add file → Create new file**. Subir las fuentes dentro de `public/fonts`.
5. Abrir **Compare & pull request** hacia `main`. Revisar que solo aparezcan los archivos de esta lista.
6. Al integrar el cambio, Vercel inicia el despliegue automáticamente. Abrir Vercel → proyecto `ruskicode` → Deployments y esperar el estado **Ready**.
7. Abrir `https://www.ruskicode.com/workspace`. Si aparece la versión anterior, actualizar con Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac).

No editar las variables de entorno. No instalar paquetes nuevos. Para una revisión local por un desarrollador, los comandos existentes son `npm run typecheck`, `npm test` y `npm run build`.

## Qué probar

1. Entrar con Google: el estudio conserva el acceso privado.
2. Inicio: escribir una idea, cambiar el modelo y alternar la revisión. La flecha guarda el brief; no cobra una generación automática.
3. Reabrir ese brief desde Chats recientes y Proyectos. El chat y las herramientas de libro existentes deben seguir disponibles.
4. Pulsar Nuevo chat y cada tarjeta de inicio: la tarjeta debe rellenar la caja, sin generar nada.
5. Adjuntar un archivo pequeño y quitarlo. Comprobar el aviso de que sigue siendo una referencia local que el chat no lee.
6. Abrir cada sección lateral, la ayuda y el selector de proyectos. Deben mostrar contenido o un estado de próxima etapa, nunca una pantalla vacía.
7. En un móvil o ventana de 390 px: abrir el menú, navegar y cerrarlo. Comprobar que no hay desplazamiento horizontal.
8. Navegar con Tab, cerrar diálogos con Escape y, si se usa movimiento reducido en el sistema, comprobar que las animaciones se desactivan.

## Límites de validación

TypeScript, pruebas existentes y compilación de producción verificados. La inspección visual automatizada en un navegador no estuvo disponible en este entorno. La comprobación final de espaciado y comportamiento táctil debe hacerse en un navegador real. No se han ejecutado generaciones de pago durante esta etapa.
