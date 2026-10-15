# Rediseño: base visual y Chat (etapas 1 y 3)

## Cambios entregados
- Auditoría previa: `docs/redesign-audit.md`. Se conserva Next.js, React, Tailwind/CSS y los controles existentes. No se cambia el backend, auth, base de datos, contratos de API, variables ni favicon aprobado.
- Base visual compartida: `src/styles/redesign-foundation.css`; reglas del Chat en `src/styles/chat.css`. Tokens de superficies, texto, acento, tamaños, espacio, radios, controles, foco y movimiento. Las páginas secundarias conservan el CSS legado: su consolidación completa corresponde a la etapa 4.
- Chat con encabezado compacto, título editable, columna central de 760px, un único scroll de mensajes y compositor separado que no tapa el contenido. Textarea de hasta ocho líneas, selector Kie existente, confirmación, detener y reintentar con advertencia de consumo.
- Asistente sin tarjeta; Markdown semántico seguro, tablas y código con scroll interno, copiar código, mensajes propios discretos y acciones accesibles. Las nuevas respuestas llevan hora; no se inventan fechas para mensajes antiguos.
- Autoscroll condicionado a la posición del lector y botón para volver al último mensaje. Safe areas y visualViewport para adaptar el compositor. Se conserva historial, borrado/deshacer, conversión explícita, modelos y registro de créditos existentes.
- Se retira el desplazamiento global Lenis y el proveedor global de animación. El editor heredado conserva su MotionConfig local con reduced motion. Markdown se carga bajo demanda.

## Decisiones visuales
Se conserva el lima, afinado a #C8ED68 para acciones primarias. Fondo #101113, sidebar #131416 y superficies #1A1C1F/#24272B evitan brillos y cajas innecesarias. Onest aporta identidad a títulos, Inter mantiene legibilidad en interfaz y JetBrains Mono sirve para código. Fuentes WOFF2 locales, font-display swap y cobertura verificada del alfabeto ruso moderno (incluidas Ё/ё), latín y signos/diacríticos españoles. Se conserva el logo propio y el favicon del usuario; no se incorporan marcas ajenas.

## Verificación
- `npm run build`: correcto; no hay ruta de pruebas ni bypass de auth en la aplicación publicada.
- `npm run typecheck`: correcto.
- `npm test`: 47 pruebas correctas, incluidas dos nuevas sobre Markdown semántico y rechazo de HTML/URL inseguros. El proyecto no tiene comando lint configurado.
- Playwright: 21 capturas en `docs/redesign-screenshots/`. Vacío, respuesta larga, enlaces a imagen/archivo, streaming y error en 390/768/1280/1920px; además viewport móvil reducido a 390x480. Sin scroll horizontal de página, sin solapamiento del compositor, sin errores de consola. Capturas revisadas visualmente.
- Se verificaron envío con SSE incremental de prueba por HTTP, registro de uso, cambio de título, copiar, cancelación de borrado/conversión y cancelación de «Preguntar antes» preservando borrador; el scroll manual se conserva durante streaming a los cuatro anchos.
- Axe sobre respuesta larga en 390 y 1280px: cero infracciones detectadas. Esto no sustituye una auditoría manual completa con lector de pantalla.
- Revisión React: importación diferida de Markdown, limpieza de observers/listeners, actualizaciones de mensaje con estado vigente y ausencia de HTML inyectado.

| Página | Performance | Accessibility | LCP | CLS |
| --- | ---: | ---: | ---: | ---: |
| Portada | 98 | 100 | 2,31 s | 0 |
| Workspace | 94 | 100 | 2,72 s | 0 |

Lighthouse móvil, build de producción aislado: 390px con throttling simulado. Los objetivos Performance >=90, Accessibility >=95 y CLS <0,1 se alcanzan. **Workspace no alcanza todavía LCP <2,5s**; requiere otra pasada de rendimiento. No se afirma que estas mediciones sean de la sesión autenticada en producción.

## Peso y dependencias
Únicas dependencias directas nuevas: `react-markdown ^10.1.0` (renderer sin inyección HTML) y `remark-gfm ^4.0.1` (tablas, listas y formato GFM). Se cargan al mostrar respuestas, no en el Chat vacío. Playwright ya existía; axe y Lighthouse se instalaron solo como herramientas temporales fuera del proyecto.

| Salida agregada de todos los chunks | Antes | Después |
| --- | ---: | ---: |
| JavaScript minificado | 1.488.304 bytes | 1.613.938 bytes (+8,4%) |
| CSS | 110.582 bytes | 128.998 bytes (+16,7%) |

Después comprimido gzip: JS 505.902 bytes, CSS 25.047 bytes. Son totales del build, incluidos chunks diferidos de todas las rutas, **no la descarga inicial de una página**. Véase `bundle-sizes.json`.

## Límites y honestidad del producto
- El Chat actual transporta texto; no tiene subida de adjuntos ni generación de medios. Se retira el + que enlazaba engañosamente al editor. Las imágenes Markdown se ofrecen como enlaces seguros, sin cargar píxeles remotos. Las capturas `chat-links-*` prueban esos enlaces; no representan adjuntos reales. Cinema/PDF existentes se mantienen.
- No se inventan precios, saldo ni progreso. El costo estimado continúa indicando «no disponible»; solo se muestran créditos reales cuando Kie los devuelve. Se conserva el enlace a kie.ai/logs.
- Chats y proyectos personales continúan en localStorage (`estudio-personal-v2`): no se sincronizan entre dispositivos. Esta entrega no migra almacenamiento.
- No se ejecutaron llamadas de IA de pago, login real de Google ni generación editorial real. Las pruebas UI usan datos controlados y respuestas SSE interceptadas. El viewport reducido aproxima espacio de teclado: falta validar teclado real en iOS/Android.
- El benchmark excluye auth y consulta real a Kie únicamente dentro de una copia temporal fuera del repositorio. Nunca se publica ese reemplazo. Se preservan los controles de acceso reales.
- Etapas 2 y 4 completas, galería de medios/adjuntos y otros rediseños secundarios quedan fuera de esta entrega. En portada solo se corrige contraste puntual y la fuente local compartida.

## Reproducción técnica
1. Instalar dependencias con `npm ci`; ejecutar build, typecheck y test.
2. Para evidencia UI, instalar axe-core y Lighthouse en `/tmp/ruskicode-qa` (`npm install --prefix /tmp/ruskicode-qa --no-save axe-core lighthouse`). Disponer de Chromium y pasar su ruta como primer argumento.
3. `node scripts/redesign-qa.mjs /ruta/a/chromium`: crea copia temporal de archivos permitidos, nunca copia .env, levanta Next y captura fixture aislado; la ruta QA no existe en el código real.
4. `node scripts/redesign-performance.mjs /ruta/a/chromium`: build y Lighthouse en copia temporal. Informes completos en esta carpeta y en el ZIP de entrega.
5. En Vercel no se requieren cambios de configuración ni variables nuevas. Se publica mediante la integración Git existente del proyecto ruskicode del equipo ruski-code.

## Qué probar como usuario
1. Entrá al Chat, elegí el modelo y enviá un mensaje breve; probá también uno con tabla, código y texto ruso. Cada envío real puede consumir créditos.
2. Durante una respuesta larga, subí a leer: la pantalla debe respetar tu posición y ofrecer «Ir al último mensaje».
3. Activá «Preguntar antes», cancelá y comprobá que el borrador siga ahí. Probá copiar, editar el título y cancelar el borrado.
4. En el celular abrí el teclado y escribí varias líneas: el mensaje anterior y el botón de enviar deben seguir accesibles.
5. Revisá un chat antiguo y comprobá que su historial y los enlaces a proyectos sigan disponibles.
