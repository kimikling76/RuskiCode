# RuskiCode Studio — Fase 3

Next.js App Router + TypeScript + Tailwind, componentes estilo shadcn con Radix, Framer Motion, Lenis, Zustand y TanStack Query.

## Ejecutar

Node 22 o superior. `npm ci`, `npm run dev`. Validar con `npm run typecheck` y `npm run build`.

## Estructura

- `src/app`: rutas Explorar `/` y estudio `/workspace`.
- `src/components`: navbar, sidebar, drawer accesible y proveedores.
- `src/components/ui`: componentes reutilizables con configuración shadcn.
- `src/lib`: traducciones ES/RU/EN, utilidades y variantes motion.
- `src/store`: estado de idioma y sidebar.
- `public/prototype.html`: prototipo previo conservado, con editor local.

## Despliegue

Vercel: framework Next.js; comandos y salida automáticos. Quitar overrides de salida estática si están configurados en el panel. El dominio existente sigue asociado al proyecto.

## Alcance

Esta fase establece estructura, tokens y navegación, no el producto completo. El selector de idioma funciona en memoria; no hay inicio de sesión, IA, almacenamiento compartido ni pagos. El prototipo anterior conserva las claves de localStorage y exportaciones de su editor.

KIE será el proveedor inicial. `.env.example` documenta secretos futuros, no son necesarios para esta fase. Nunca publicar claves en el cliente. Redis/BullMQ y Chromium requerirán un worker separado; se implementarán en fases posteriores. No se crean servicios pagos en esta fase.

Siguientes fases: Explorar, compositor y modelos, adaptadores/streaming, skills/Book Spec, pipeline/PDF/QA y editor/visor.

## Fase 2 — Explorar

Landing ES/RU/EN con carrusel nativo (scroll táctil, flechas, teclado, reproducción automática pausable), tarjetas conceptuales propias, herramientas, proceso editorial, consumo y FAQ. Animaciones Framer Motion con scroll reveal y movimiento reducido. Sin testimonios, descuentos ni planes ficticios. Los previews son CSS, no páginas aprobadas ni videos generados. El compositor funcional corresponde a la Fase 3.

## Fase 3 — Compositor

`/workspace`: textarea adaptable, selector de proveedores con búsqueda accesible (Radix Dialog), categorías animadas, referencias (hasta 6 archivos de 10 MB) y URL. Preparación de briefs con aprobación opcional, estados review/ready, historial de hasta 30 proyectos en localStorage validado y descarga JSON. Los archivos permanecen en memoria de la sesión; se persisten solo sus metadatos. No se suben ni extraen ni consultan URLs. No hay cargos, estimaciones inventadas ni respuestas simuladas. Las opciones del selector son preferencias para las futuras integraciones, no modelos conectados. Fase 4 añadirá generación y streaming.
