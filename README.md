# RuskiCode Studio — Fase 4

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

## Fase 4 — Chat real y adaptadores

API SSE `/api/chat`, catálogo `/api/models`, acceso `/api/session`. Adaptadores REST tipados para chat compatible OpenAI (KIE incluido), Anthropic y Google. No se utiliza AI Gateway ni se envían claves al cliente. Router Auto prioriza según tarea; falla hacia otro proveedor configurado solo antes de emitir texto. Un modelo explícito nunca cambia silenciosamente. Un 429 se reintenta una vez; no se reintenta una generación parcialmente emitida.

### Activar en Vercel

Configurar **Production** en Settings → Environment Variables y redeploy:

- `KIE_API_KEY`: clave actual de KIE.
- `STUDIO_ACCESS_CODE`: código largo aleatorio compartido por los dos autores. Protege solo llamadas de IA, no toda la interfaz ni archivos. Se canjea por cookie HttpOnly, SameSite Strict y Secure en producción (7 días).
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: Redis HTTP para limitación distribuida. Se bloquean llamadas en producción si no está disponible. No se crea ningún servicio de pago automáticamente.

Alternativamente, usar credenciales y modelos explícitos de los proveedores directos enumerados en `.env.example`. Verificar los IDs en su catálogo actual. El endpoint compatible personalizado es exclusivamente una variable del servidor.

El chat aparece al aprobar el brief. Tiene historial local, streaming, cancelar, manejo de errores y consumo reportado por el proveedor. No lee archivos/URLs, no llama herramientas ni genera PDF/imágenes/videos aún. No hay un saldo de créditos inventado, precios por token ni facturación propia; KIE puede devolver créditos consumidos. Las cifras de consumo por respuesta no son un ledger contable persistente.

Los adaptadores actualmente declaran `supportsTools: false` y `supportsVision: false`: capacidades futuras no implementadas. La documentación KIE advierte que el endpoint Gemini 3.1 Pro es para chat y no está adaptado a agentes; para las skills se usará JSON validado o un endpoint con herramientas verificado.

### Validación

`npm run test`, `npm run typecheck`, `npm run build`. Las pruebas de protocolo usan transporte simulado y no consumen saldo. Sin credenciales no se puede validar una generación real. Referencias: https://docs.kie.ai/30442144e0 ; https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai ; https://platform.claude.com/docs/en/build-with-claude/streaming ; https://ai.google.dev/api/generate-content ; https://developers.openai.com/api/reference/resources/chat .
