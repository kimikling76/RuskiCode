# Auditoría previa — etapas 1 y 3

Fecha: 2026-10-15. Se inspecciona el código antes de modificar la interfaz.

## Stack y scripts
Next.js 16.4.1 App Router, React 19, TypeScript, npm con package-lock. Zustand conserva preferencias/proyectos y chats locales; TanStack Query carga configuración de modelos. CSS global + Tailwind 3, Radix Dialog/Slot, lucide-react y componentes propios. Framer Motion y Lenis existen; Lenis instala scroll suavizado global, inadecuado para el Chat. Scripts: build, typecheck, test, dev/start, worker, db:migrate y pdf:demo; no hay script lint.

## Rutas y navegación
`/` portada; `/login` acceso; `/workspace` Chat/PDF Studio/Cinema Studio controlados por query; `/workspace/editor` editor anterior. Layout raíz con proveedores y varios CSS acumulados. Layout privado comprueba sesión en servidor y redirige a login. Sidebar con búsqueda, plegado, historial, renombrar/borrar, ayuda, consumo y cierre de sesión. Referencias `/design-refs/current-chat.png` y `reference-chat.png` ausentes; se usa la descripción escrita, sin inventar capturas de referencia.

## Backend e integraciones
API `/api/personal-chat` GET/POST: solo modelos Kie configurados, autenticación, same-origin, límites de solicitudes, SSE. API editorial `/api/chat` separada. APIs `/api/models`, `/api/skills`, `/api/skills/run`, `/api/books` con rutas por id/proyecto/acciones/artefactos; `/api/session`, `/api/studio/setup`, `/api/auth/[...all]`, `/api/inngest`. Better Auth + Google restringido al equipo; Prisma/Postgres conserva usuarios, sesiones y jobs/artefactos editoriales. Inngest o worker procesan libros; Redis/Upstash para cola/límites según configuración. No se observa checkout ni pagos propios. No se leen archivos .env ni valores secretos.

## Chat actual
Mensaje `{id,role,content,model?,credits?,status?}`; sin adjuntos ni timestamp individual. Persistencia `localStorage: estudio-personal-v2`, sin sincronización entre dispositivos. Streaming SSE en cliente actualiza texto y estado. Modelo Auto o configuración Kie actual; proveedor puede informar créditos reales, pero no hay tarifa/estimación previa verificadas. «Preguntar antes» confirma el envío del texto; no es un agente de generación. Copiar, detener, regenerar con confirmación, borrar mensaje, borrado diferido 8s, doble confirmación para borrar todos, conversión explícita a proyectos independientes. No hay renderer Markdown: símbolos crudos se muestran con whitespace. No hay carga de archivos en el Chat: el + actual enlaza el editor, lo que resulta engañoso para una acción de adjuntar.

## Problemas y riesgos
CSS acumulado aplica tarjetas/bordes y etiquetas a todos los mensajes; contenido y compositor comparten el scroll exterior y no hay seguimiento del scroll durante streaming. Tipografía condensada Barlow carece de caracteres rusos (verificado en cmap); Inter local contiene alfabeto ruso y diacríticos españoles. Controles móviles de 32px incumplen el mínimo de 44px. Falta control de tablas/código/anclas, estados de copia de código y enlaces seguros. No hay chips de archivo reales ni modelo de imagen/video integrado en este Chat: no se simularán.

## Deploy y seguridad
Vercel framework nextjs; rutas IA Node con maxDuration=120; next.config traza dependencias de Chromium/PDF para el pipeline. Auth, contratos API, Prisma, migraciones y env existentes se preservan. Riesgos: importaciones ESM del renderer, crecimiento de bundle, CSS heredado, fuentes y rutas temporales de QA. Los fixtures locales de QA se eliminarán antes del build final y commit; no se agrega bypass de autenticación. Favicon recientemente aprobado se conserva.

## Plan de intervención
Etapa 1: tokens scoped y tipografía con cobertura cirílica verificada; primitivas del Chat basadas en los controles existentes, sin nuevo framework. Etapa 3: tres zonas flex, un único scroll de mensajes, composición acoplada, Markdown seguro, autoscroll condicional, salto al último mensaje, controles accesibles y estados reales. Vacío sencillo con sugerencias de texto existentes; retirar galería decorativa del Chat. Medir responsive con Playwright/Chromium existentes y datos de prueba aislados, no llamadas de pago.
