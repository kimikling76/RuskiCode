# Russian Code: revisión premium con Claude Opus 5.5

Rama: `refine/premium-kie-review`, basada en `feat/model-picker-rail` (`2387b2f`). Alcance: Chat personal y componentes compartidos. No se modificaron Cinema, el editor PDF, endpoints, autenticación, esquema, variables de entorno, integraciones ni facturación. No se hizo merge ni despliegue de producción.

Claude Opus 5.5 se invocó realmente por Kie.ai, usando el identificador recibido del catálogo y la interfaz Anthropic documentada. La respuesta confirmó `claude-opus-5-5`, `end_turn` y **17,52 créditos consumidos**. Produjo una auditoría y diez propuestas de cambios exactos a partir del código suministrado. Codex investigó las fuentes oficiales, revisó esas propuestas, las adaptó, implementó y verificó. No se cambió el modelo interno de esta conversación.

[Procedencia y uso reportado](provider-review.json) · [Auditoría original de Claude](claude-audit.json)

## 1. Auditoría del sitio existente

El proyecto usa Next.js 16.4.1 App Router, React 19.2, TypeScript, Tailwind 3.4.17 y CSS propio. Se conservaron TanStack Query v5, Zustand, Radix Popover/Dialog/AlertDialog/DropdownMenu/Tooltip, Lucide y el Markdown cargado de forma diferida. Prisma, Postgres, Better Auth y las integraciones de servidor quedaron intactos. Los chats personales se guardan en `localStorage` mediante `src/store/personal-chat.ts`; no se sincronizan entre dispositivos.

La base visual ya es consistente: superficies oscuras neutras, lima moderado, respuestas abiertas de unas 70ch, Inter, Onest y JetBrains Mono. El selector ya tiene búsqueda, riel condicional, IME y navegación de teclado. Había más valor en resolver estados y pequeños fallos que en reemplazarlo con otro kit.

Orden de oportunidades, contrastado con los archivos reales:

| Prioridad | Oportunidad | Impacto visual | Usabilidad | Esfuerzo | Riesgo | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Selector deshabilitado sin explicar catálogo cargando o vacío | Medio | Alto | Bajo | Bajo | Estado visible y recarga del catálogo vacío |
| 2 | Escape en búsqueda sin retorno de foco; conflicto con el cierre del drawer | Bajo | Alto | Bajo | Bajo | Escape cierra primero la búsqueda y devuelve foco |
| 3 | Búsqueda oculta en móvil por una regla de `workspace-design.css` | Medio | Alto | Bajo | Medio | Regla posterior en la foundation devuelve el botón visible |
| 4 | Ajustes repetidos en header, historial y menú | Medio | Medio | Bajo | Bajo | Se quitó el acceso del encabezado de Conversaciones |
| 5 | Foco del compositor con valores de acento copiados | Bajo | Bajo | Bajo | Bajo | Derivado de `--accent` con `color-mix()` |
| 6 | Radios 20/11/7/10/6 fuera de la escala compartida | Medio | Bajo | Bajo | Bajo | Normalizados en superficies, menús, código, tabla y compositor móvil |
| 7 | Overrides duplicados en el CSS heredado | Bajo | Bajo | Medio | Medio | Limpieza general diferida para evitar cambios de cascada ajenos |
| 8 | Ref del input compartido entre aside y drawer | Bajo | Medio | Bajo | Medio | Refs independientes; comprobación tras desmontar el drawer |
| 9 | Posibles anuncios redundantes de `role=status` dentro del log | Bajo | Medio | Bajo | Medio | Pendiente de prueba manual con lector; no se afirma un defecto confirmado |
| 10 | Ritmo del estado vacío con algunos espacios fuera de tokens | Medio | Bajo | Bajo | Bajo | Se conserva la composición; no se añade decoración |

Durante la nueva prueba de 390 × 480, axe encontró además que el log desplazable necesitaba un destino de foco. Se añadió `tabIndex=0` y un anillo interior visible para poder desplazarlo con teclado.

## 2. Investigación y selección de componentes

Se consultaron las páginas oficiales siguientes el 16 de octubre de 2026. «Compatible» significa que ya se usa en este repositorio o que se verificó su integración; no implica compatibilidad universal de cualquier demo. Se seleccionaron las primitivas existentes y componentes pequeños propios.

| Componente | Fuente oficial | Por qué encaja | Compatibilidad | Dependencias | Impacto visual | Prioridad |
| --- | --- | --- | --- | --- | --- | --- |
| Selector con búsqueda y riel | [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover) | Mantiene foco y colisiones; diseño propio compacto | Ya integrado, Popover 1.3.1, React 19 | Ninguna nueva | Alto | Conservar |
| Compositor adaptable | [Textarea React](https://react.dev/reference/react-dom/components/textarea) y código existente | Evita un segundo sistema de envío; mantiene streaming y detener | Se conserva la implementación existente, no se copia un snippet externo | Ninguna nueva | Alto | Alta |
| Historial y navegación móvil | [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) | Foco modal y Escape, con búsqueda local corregida | Dialog instalado 1.3.1 | Ninguna nueva | Alto | Alta |
| Acciones de chat | [Radix Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) | Menús compactos de renombrar y borrar | Instalado 2.2.1 | Ninguna nueva | Medio | Conservar |
| Confirmación de borrado | [Radix Alert Dialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog) | Cancelación y foco seguros | Instalado 1.2.1 | Ninguna nueva | Medio | Conservar |
| Ayuda de botones | [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) | Botones silenciosos con nombre accesible | Instalado 1.4.1 | Ninguna nueva | Medio | Conservar |
| Iconos | [Lucide React](https://lucide.dev/guide/packages/lucide-react) | Misma familia visual; imports nombrados | Instalado 0.468.0 | Ninguna nueva | Medio | Conservar |
| Carga, vacío y recuperación del catálogo | [TanStack Query useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) | Aprovecha `isPending`, `isFetching` y `refetch` existentes | v5; integración validada por TypeScript y pruebas | Ninguna nueva | Medio | Alta |
| Undo, errores y consumo real | Primitivas locales existentes | Ya preservan datos y muestran solo valores reportados | Mismos datos y controles | Ninguna nueva | Medio | Conservar |
| Combobox shadcn | [Combobox](https://ui.shadcn.com/docs/components/radix/combobox) | Referencia de estructura, no reemplazo necesario | La referencia de API consultada apunta a Base UI; no se copió el CLI ni utilidades nuevas | No instalado | Bajo frente al selector actual | Referencia |
| Paleta de comandos | [shadcn Command](https://ui.shadcn.com/docs/components/command) | Útil si crece la cantidad de acciones | La página consultada usa `cmdk`; requiere adaptación y pruebas | Añadiría dependencias | Medio | Opcional, diferido |
| Sidebar de un kit | [shadcn Sidebar](https://ui.shadcn.com/docs/components/sidebar) | Referencia de colapso, no justifica sustituir la actual | Página consultada redirige a Base UI; no es una instalación validada aquí | No instalado | Bajo frente a la actual | Diferido |
| Movimiento accesible | [Motion useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) | Se reserva para interacciones futuras complejas | framer-motion 12.43.0 ya existe; no se agregó su import a Chat | Ninguna nueva | Bajo | CSS actual suficiente |
| Adjuntos | [Aceternity File Upload](https://ui.aceternity.com/components/file-upload) | Puede ser pertinente en Cinema, no en el Chat puro actual | Página y `onChange(files)` inspeccionados; dependencias, teclado y licencia específica no verificados | No instalado | Medio | Fuera de alcance |
| Borde que sigue el puntero | [Magic UI Magic Card](https://magicui.design/docs/components/magic-card) | No resuelve una necesidad del Chat sobrio | Se inspeccionó la página y la demo; no se verificó su implementación completa | No instalado | Decorativo | Descartado |
| Animación de títulos | [React Bits Split Text](https://reactbits.dev/text-animations/split-text) | No aporta a la lectura de conversaciones | Página disponible; fuente, dependencias y licencia del componente no verificadas | No instalado | Decorativo | Descartado |

También se inspeccionó el [directorio de 21st.dev](https://21st.dev/community/components). No se eligió un componente nuevo de ese directorio: no se verificó una licencia individual ni hay motivo para sustituir el selector ya implementado. No se adjudican licencias o accesibilidad a toda la colección.

Licencias comprobadas: [Radix MIT](https://github.com/radix-ui/primitives/blob/main/LICENSE), [shadcn MIT](https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md), [Motion MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md) y [Lucide ISC, con atribución MIT de los iconos derivados de Feather](https://lucide.dev/license). Los paquetes instalados coinciden con esas declaraciones. Esto no extiende sus licencias a plantillas Pro o componentes comunitarios ajenos. Se conservan los avisos y licencias existentes; no se incorporó código de las demos.

El proyecto sigue con [Tailwind v3](https://v3.tailwindcss.com/docs/installation). No se usaron comandos de migración ni clases de v4. No se midió un delta de bundle en bytes; sí se comprobó que no hay dependencias nuevas ni cambios en el lockfile.

## 3. Dirección visual y sistema

Se conserva «Código de autor»: fondo `#101113`, sidebar `#141517`, superficie `#1B1D20`, texto `#F1F2EE`, secundario `#A5A9AF` y acento `#C8E879`. El lima sigue reservado a envío, estados activos y foco. No se añadieron colores ni fuentes.

El archivo canónico de tokens del área de trabajo sigue siendo `src/styles/redesign-foundation.css`. Se completó la escala de radios: `--chat-radius` 24, `--chat-bubble-radius` 18, `--chat-menu-radius` 12, `--chat-item-radius` 9 y `--chat-control-radius` 8. Los controles anidados tienen radios menores que sus contenedores; los círculos y la geometría del switch mantienen su forma intrínseca.

Onest se conserva para títulos, Inter para interfaz y JetBrains Mono para código, con cuerpo regular, interlineado 1,65 y ancho de unas 70ch. Se volvió a inspeccionar el cmap de las tres fuentes WOFF2 locales: cubren las 66 letras del alfabeto ruso y los caracteres españoles comprobados `áéíóúüñÁÉÍÓÚÜÑ¿¡`. Las licencias OFL permanecen en `public/fonts`. No se descargan nuevas fuentes en ejecución.

Se conserva la columna de 760 px, header de 64 px/60 px móvil, navegación plegada en tablet, drawer móvil y separación del compositor respecto del log. Las transiciones existentes son discretas y mantienen `prefers-reduced-motion`. El foco del compositor deriva ahora del token; `color-mix()` requiere un navegador moderno. El foco visible del textarea y del log sigue disponible aun si ese tratamiento decorativo no es compatible.

## 4. Plan priorizado

**Alta, implementada:** estados del catálogo; recuperación sin crear chats ni llamar a generación; búsqueda móvil; Escape y foco; refs separados; reducción de accesos duplicados; log desplazable accesible.

**Media, implementada:** radios reutilizables y foco basado en el acento. **Media, diferida:** consolidar toda la cascada histórica y revisar anuncios de streaming con lectores de pantalla reales.

**Opcional:** paleta de comandos cuando haya suficientes acciones, refinamiento posterior de onboarding y adjuntos exclusivamente cuando exista el contrato de archivos correspondiente. Cinema y el editor PDF siguen fuera de esta entrega.

## 5. Implementación

Archivos de producción completos en esta rama:

- `src/components/studio/personal-chat.tsx`: carga/vacío y recarga del catálogo; foco del log.
- `src/components/studio/sidebar.tsx`: búsqueda accesible, Escape, refs independientes y eliminación del botón duplicado.
- `src/styles/chat.css`: radios, estados del catálogo y foco.
- `src/styles/redesign-foundation.css`: tokens de radio, superficies compartidas y búsqueda visible en drawer.

Los modelos del selector siguen viniendo únicamente de `GET /api/personal-chat` más «Auto». La consulta externa a Claude para este trabajo no lo añadió al catálogo de la aplicación. No se añadieron capacidades, precios, velocidades, adjuntos ni funciones simuladas en producción.

## 6. Verificación

Resultados finales ejecutados sobre los archivos de esta entrega:

| Control | Resultado |
| --- | --- |
| `npm run typecheck` | Sin errores |
| `npm test` | 48 tests aprobados |
| `npm run build` | Build de producción completado |
| Chromium + Playwright | 34 capturas; tamaños 390, 768, 1280 y 1920, más 390 × 480 |
| axe WCAG 2 A/AA y 2.1 AA | 14 análisis sin incidencias en la ejecución final |
| Consola | Cero errores inesperados; dos HTTP503 esperados de la fixture de error y reintento |
| Interacciones | Envío, streaming simulado, detener, scroll manual, copiar, regenerar, conversión, renombrar, borrar y deshacer conservados |
| Nuevas regresiones cubiertas | Catálogo cargando/vacío/error y recuperación; búsqueda móvil; IME; foco; Escape del buscador/drawer/menú; log desplazable con PageUp |
| Selector existente | Catálogo de uno y de varios proveedores, búsqueda, flechas, IME, Tab/Shift+Tab y Escape |
| Dependencias | Ninguna añadida; `package.json` y `package-lock.json` sin cambios |

Comando reproducible: `node scripts/author-chat-qa.mjs /ruta/a/chromium --output-dir /tmp/premium-qa`. Requiere axe instalado fuera del proyecto: `npm install --prefix /tmp/ruskicode-qa --no-save axe-core`. El script mantiene su carpeta original si se omite `--output-dir`.

Se revisaron visualmente conversación a 390/1280, vacío a 768, Markdown largo a 1920 y las capturas de estados nuevos. La ejecución inicial detectó un log no enfocable; la siguiente detectó que un tooltip consumía Escape. Ambos problemas se corrigieron antes de la ejecución final. El manejador del drawer respeta los menús portados: Escape cierra primero su propia capa.

[Informe automático completo](qa-results.json)

| Conversación escritorio | Conversación móvil | Búsqueda móvil |
| --- | --- | --- |
| [1280 px](chat-1280.png) | [390 px](chat-390.png) | [390 px](history-search-390.png) |

| Catálogo cargando | Catálogo vacío con recuperación | Error de catálogo |
| --- | --- | --- |
| [390 × 480](catalog-loading-390x480.png) | [390 × 480](catalog-empty-390x480.png) | [1280 px](catalog-error-1280.png) |

Las pruebas usan una copia temporal del código, sin copiar archivos de entorno ni desplegar una ruta de prueba. Los catálogos y el streaming de las pruebas son fixtures locales, no llamadas pagas. La llamada real a Claude está documentada por separado. Se aplicó además la revisión de hooks, refs, accesibilidad, carga diferida y dependencias de la guía `react-best-practices` de Vercel.

Límites: no se comprueban por estas fixtures un login real, el streaming del proveedor de producción, Safari/Firefox, un teclado móvil físico o lectores de pantalla. Tampoco se declara una auditoría completa de accesibilidad solo por pasar axe. No hay script `lint` en `package.json`; no se inventa un resultado de lint.
