# Etapa 8 — PDF Studio con Stirling PDF, asistente de edición y «Crear con IA»

PDF Studio ahora tiene:

- **Un editor para PDF importados.** Miniaturas, la página con texto seleccionable, zoom, herramientas de Stirling PDF y versiones con deshacer.
- **Un asistente** que propone cambios. Ves el resultado real antes de aplicarlo y cada cambio queda como versión. Sirve en los PDF importados y en los libros editables.
- **«Crear con IA»,** un mini chat con los modelos de texto de Kie. Escribe unidades, ejercicios y tablas que después insertás en el documento.

Todo se guarda en tu cuenta (documento, versiones y conversaciones) y aparece en tus otras computadoras.

## 1. Revisión de Stirling PDF

La revisé el 17 de octubre de 2026 en su documentación oficial, su página de precios, su repositorio y su API. También hice pruebas reales con un servidor Stirling PDF 3.2.0 levantado acá.

| Tema | Lo verificado |
|---|---|
| **Versión** | 3.2.0, del 15 de octubre de 2026. Es la que responde `https://api.stirling.com/api/v1/info/status` y la que usé en las pruebas. |
| **Licencia** | «Open-core». La mayor parte es MIT. Las carpetas `app/proprietary`, `engine/` (el motor de IA) y otras tienen una licencia propia que pide un plan pago para usarlas en producción, salvo el uso de prueba o mínimo que el propio programa permite. |
| **Planes** | **Free:** USD 0; hasta 5 usuarios, todas las herramientas PDF, API REST y 1.000 créditos por mes para automatizar. **Team:** USD 99 por mes, 100 usuarios. **Enterprise:** precio a medida. **«PDF Processor»:** 1 centavo de dólar por crédito, prepago o pago por uso, solo si el dueño del equipo lo activa y con un tope de gasto. |
| **Qué consume créditos** | Las herramientas manuales en su propia web son gratis. Las llamadas a la API, el MCP, las automatizaciones y la IA usan créditos. Cada archivo procesado usa 1 crédito; los muy largos o pesados usan más. Si un trabajo falla en el primer paso, el crédito se devuelve. Al terminarse, la API responde 402. |
| **Formas de usarlo** | (a) **Stirling Cloud:** API en `https://api.stirling.com`, con clave `X-API-KEY`. (b) **Servidor propio:** Docker con 4 GB de memoria; en el plan Free, 1.000 unidades por mes para llamadas con clave (1 unidad por cada 25 páginas o 5 MB). (c) **MCP:** para asistentes como Claude; usa tu cuenta con inicio de sesión (OAuth), no la app. |
| **¿Corre en Vercel?** | No. Es un programa Java con LibreOffice, Tesseract y otros, en un contenedor de unos 4 GB. Si algún día lo alojás vos, va en un servicio aparte (la configuración está en `deploy/stirling/docker-compose.yml`, sin contratar nada). |
| **IA de Stirling** | Viene apagada. En Stirling Cloud usa modelos de Anthropic (Claude) y Voyage, y gasta créditos de Stirling. En un servidor propio hay que alojar su motor (otro contenedor) y darle claves de un proveedor: Anthropic, OpenAI, Ollama o uno «custom» compatible con OpenAI. Ese motor también necesita un modelo de *embeddings* para preguntas sobre el documento. |
| **¿Stirling admite Kie.ai?** | **No está verificado.** Ni Stirling ni Kie lo documentan. El modo «custom» pide un endpoint compatible con OpenAI con salida JSON estructurada, y Kie no documenta ni eso ni embeddings. Por eso, como pediste, **los modelos de Kie corren desde nuestro servidor** y dirigen las operaciones documentadas de Stirling. |

Fuentes: [documentación](https://docs.stirlingpdf.com/), [API](https://docs.stirlingpdf.com/Developers/API/), [conectar el MCP](https://docs.stirlingpdf.com/MCP/Connect/), [motor de IA](https://docs.stirlingpdf.com/Server/AI/Run-the-AI-Engine/), [ajustes de IA](https://docs.stirlingpdf.com/Server/AI/Settings-Reference/), [proveedores de modelos](https://docs.stirlingpdf.com/Server/AI/Model-Providers/), [planes y licencias](https://docs.stirlingpdf.com/Server/Licensing/Plans-and-Licences/), [créditos](https://docs.stirlingpdf.com/Cloud/Plans-and-Billing/), [precios](https://www.stirling.com/pricing), [licencia](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE).

## 2. Qué hace cada parte

### 2.1 Operaciones PDF con Stirling (probadas en un servidor real 3.2.0)

| Herramienta del editor | Operación de Stirling | Resultado en la prueba real |
|---|---|---|
| Rotar páginas sueltas | `auto-rotate-pdf` con `pageRotations` | ✅ Gira solo esas páginas. |
| Mover u ordenar páginas | `rearrange-pages` | ✅ |
| Borrar páginas | `remove-pages` | ✅ |
| Extraer páginas a un PDF nuevo | `rearrange-pages` | ✅ El original no cambia. |
| Insertar otro PDF | `merge-pdfs` y `rearrange-pages` | ✅ |
| Insertar páginas nuevas (del asistente o de «Crear con IA») | `html/pdf`, `scale-pages`, `merge-pdfs` y `rearrange-pages` | ✅ Con cirílico y tildes de acento. Ver los límites más abajo. |
| Nota adhesiva | `add-comments` | ✅ Es una anotación real del PDF y acepta cirílico. |
| Texto superpuesto | `add-stamp` | ✅ Acepta cirílico. **No cambia el texto original:** se dibuja encima. |
| Reemplazar texto (buscar y reemplazar) | `edit-text` | ⚠️ **Sí cambia el texto propio del PDF** y conserva las tildes. Pero reescribe el texto de la página: en las 3 pruebas el título perdió su color, y en un PDF con fuente Type 1 también se rompió el título. Por eso **siempre muestra la vista previa real** antes de aplicar. |
| Reconocer texto (OCR) | `ocr-pdf` | ✅ Con ruso, si el servidor tiene el idioma (ver los límites). |
| Convertir a Word | `convert/pdf/word` | ✅ Es una conversión aproximada. |
| Convertir Word a PDF al importar | `convert/file/pdf` | ✅ Con LibreOffice. |

### 2.2 IA de Stirling

No la integré. No acepta Kie, gasta créditos de Stirling con sus propios modelos y no la pude probar acá. Sus funciones son: crear un PDF diseñado desde un JSON, revisar cálculos, agregar comentarios con IA y clasificar documentos. Se puede sumar más adelante, si lo decidís.

### 2.3 Desarrollo propio

- **El asistente de edición.** Un modelo de Kie lee tu instrucción y la página o el bloque elegidos. Propone acciones de una lista cerrada, y el servidor las valida contra el documento:
  - las páginas tienen que existir;
  - el texto a reemplazar tiene que estar en la página;
  - avisa si se perderían tildes de acento;
  - nunca borra todas las páginas;
  - en un PDF, una sola acción por propuesta.

  Después vienen la vista previa, la confirmación y la versión. No ejecuta comandos: cada acción es un cambio fijo del editor o una operación de Stirling.
- **«Crear con IA».** Respuesta en texto → bloques (títulos, párrafos, ejercicios, tablas, recuadros). El texto queda tal cual lo escribió el modelo.
- **Versiones, historial y sincronización** de PDF, libros y conversaciones.
- **El visor:** miniaturas, página y texto seleccionable, con pdf.js, que ya estaba instalado.

### 2.4 No disponible o no verificado

- **Reemplazar una imagen dentro de un PDF importado:** la API de Stirling no lo ofrece. Nutrient sí puede, pero en modo de prueba no guarda. En los libros editables sí funciona: el asistente propone el prompt y la imagen se genera con un modelo de imagen.
- **Kie dentro del motor de IA de Stirling:** no verificado (ver arriba).
- **OCR en ruso en Stirling Cloud:** no pude comprobar qué idiomas tiene. El servidor propio trae inglés, alemán, francés, portugués y chino; el ruso hay que agregarlo.
- **Costo real por llamada de Stirling:** su API no lo informa en la respuesta, así que el estudio muestra solo la tarifa publicada como estimación.

## 3. Cómo funciona

```
Navegador (PDF Studio)                        Servidor (Vercel, Next.js)                Servicios
───────────────────────                        ──────────────────────────                ─────────
Editor de PDF / de libro ── pedido ──────────▶ /api/pdf/stirling ─ valida ─ X-API-KEY ─▶ Stirling PDF
  miniaturas, página,                           (sesión, origen, límite,                 (Cloud o propio)
  herramientas, versiones                        tamaño, operación permitida)
Asistente ── instrucción + contexto ─────────▶ /api/pdf/assistant ─ KIE_API_KEY ───────▶ Kie.ai (texto)
  vista previa → confirmar → aplicar ◀──────── plan validado contra el documento
Crear con IA ── conversación ────────────────▶ /api/personal-chat (pdf-create) ────────▶ Kie.ai (texto)
Versiones y conversaciones ── sync ──────────▶ /api/sync (Postgres, archivos ≤ 4 MB)
```

- **Las claves de Kie y de Stirling viven solo en el servidor.** El navegador nunca las ve; tampoco ve la dirección de Stirling.
- **Solo tu cuenta puede usar estas rutas.** Necesitan una sesión de administrador y piden el mismo origen.
- **Los archivos y el texto importado se tratan como datos, no como órdenes:**
  - el servidor comprueba que el archivo sea un PDF o un Word de verdad;
  - las páginas se controlan antes de llamar a Stirling;
  - el texto del documento le llega al modelo marcado como material.

## 4. Costos esperados

- **Licencia de Stirling:** el plan **Free** alcanza para un solo autor, a USD 0. No hace falta Team.
- **Alojamiento:**
  - con **Stirling Cloud**, nada;
  - con un servidor propio, una máquina con Docker y unos 4 GB de memoria. El precio depende del proveedor; no lo incluyo porque no lo verifiqué.
- **Consumo de Stirling:**
  - con **Stirling Cloud**, 1.000 créditos gratis por mes;
  - el editor muestra en cada herramienta «al menos N créditos»: 1 en la mayoría, 2 al insertar otro PDF, 3 o 4 al insertar páginas nuevas;
  - por ejemplo, 50 operaciones simples usan unos 50 créditos;
  - **la vista previa ya usa créditos,** porque es el resultado real;
  - al terminarse el mes, el editor avisa y las herramientas se detienen hasta el mes siguiente. Pasar a pago por uso (1 centavo por crédito) lo decidís vos en Stirling: el estudio no lo activa.
- **Consumo de Kie** (asistente y «Crear con IA»):
  - el catálogo no tiene una tarifa publicada para los modelos de texto, así que **no se muestra una estimación previa**;
  - cuando Kie informa el costo de una respuesta, aparece al lado («Kie informó 1,25 créditos») y en el resumen de uso de la barra lateral.
- **Uso ilimitado: no existe.** La licencia es gratis para un usuario, el alojamiento es gratis con Stirling Cloud, y el procesamiento y la IA se cobran por uso.

## 5. Cómo activarlo (vos, sin compartir claves en el chat)

1. **Creá la clave de Stirling.** Entrá a [stirling.com](https://www.stirling.com) con tu cuenta (es la misma que ya usa Claude por el MCP). Andá a **Settings → Developer → API Keys** (o **Preferences → API Keys**) y creá una clave. Copiala: se muestra una sola vez.
2. **Cargala en Vercel.** Abrí el proyecto **ruskicode** → **Settings** → **Environment Variables**. Creá `STIRLING_API_KEY` con esa clave, en **Preview** y, cuando lo decidas, en **Production**. Dejá `STIRLING_API_URL` vacía para usar Stirling Cloud.
3. **Volvé a desplegar** la vista previa (o la rama).
4. **Comprobalo** en **Ajustes → Conectores**: «Stirling PDF · herramientas de PDF» tiene que decir **Conectado** y la versión.

Sin la clave, los PDF importados se ven, se seleccionan y se descargan, pero las herramientas de páginas avisan que Stirling no está conectado.

## 6. Pasos simples para probarlo

1. **Importá un PDF.** En **PDF Studio → Importar archivo**, elegí un PDF y después **«Editar el PDF tal cual»**.
2. **Probá una herramienta.** Hacé clic en una miniatura y, en **Herramientas → Rotar 90°**, mirá el aviso «guardado como versión». Probá **Deshacer** (⌘Z) y **Rehacer**.
3. **Reemplazá texto.** En **Reemplazar texto**, escribí una palabra de la página y su reemplazo, y tocá **Ver vista previa**. Compará «Ahora» y «Después» (fijate si cambió el color de los títulos) y tocá **Aplicar** o **Descartar**.
4. **Usá el asistente.** En la pestaña **Asistente**, escribí «Agregá una página de ejercicios después de esta». Tocá **Ver vista previa** y después **Aplicar**.
5. **Usá «Crear con IA».** Arriba a la derecha, pedí «Dos ejercicios de A1 sobre presentarse» y tocá **Revisar e insertar** → **Como páginas nuevas**.
6. **Descargá.** **Descargar PDF** baja el resultado real.
7. **Revisá las versiones.** En la pestaña **Versiones**, mirá la lista y volvé a cualquier versión (el original importado está siempre).
8. **Abrilo en otra computadora.** El PDF, sus versiones y las conversaciones aparecen solos.
9. **Probá en un libro editable.** Elegí un bloque, pedile al asistente «Corregí este texto en ruso» o «Insertá un cuadro de vocabulario», revisá la propuesta y aplicala. En **Versiones** queda «Antes de: …».

## 7. Qué se puede modificar de verdad

- **El texto propio del PDF:** sí, con «Reemplazar texto» (Stirling), con el aviso de formato de arriba. También con **«Editar el texto en su lugar (Nutrient)»**, en el menú «…»; en modo de prueba, esa opción no guarda.
- **Superponer texto y notas:** no cambian el texto original. Se agregan encima.
- **Páginas escaneadas o aplanadas:**
  - el editor avisa «Esta página es una imagen»;
  - el **OCR** agrega una capa de texto invisible para buscar y copiar, pero **la imagen no se vuelve editable**;
  - para reescribir el contenido está **«Convertir en libro editable…»** (en el menú «…»), que usa ese texto. No promete recuperar el diseño exacto.
- **Libros editables:** su fuente estructurada (bloques) se edita libremente, con versiones. Se exportan a PDF con el diálogo de impresión, igual que antes.

## 8. Limitaciones

- **4 MB por PDF.** Es el máximo que pasa por el servidor hacia Stirling (Vercel limita los pedidos a 4,5 MB) y lo que se guarda en la cuenta. «Reemplazar texto» hace crecer el archivo, porque Stirling incrusta las fuentes completas (en la prueba, de 23 KB a 1,1 MB).
- **Páginas nuevas en un PDF importado:**
  - usan la tipografía de Stirling (DejaVu o Noto) y el verde del estudio; no copian el diseño del PDF;
  - no llevan imágenes, porque el conversor de Stirling las quita;
  - se ajustan al tamaño del documento si es A3, A4, A5, A6, Carta u Oficio; en otros tamaños (como 6 × 9 in) quedan en A4, y el editor lo avisa.
- **OCR:**
  - el ruso necesita `rus.traineddata` en un servidor propio;
  - las tildes de acento no se reconocen bien: salen como «ё» o se pierden.
- **Texto seleccionable:** en algunos PDF (por ejemplo, los de LibreOffice con tildes de acento) la selección muestra espacios de más junto a las tildes. La página no cambia.
- **Asistente en PDF:** una acción por propuesta, y no puede cambiar imágenes.
- **El modelo de Kie no se probó acá con una clave real.** En las pruebas, las respuestas del modelo se simularon localmente; todo lo demás fue real. Con Kie real, si el modelo responde algo que no es un plan válido, el servidor lo rechaza y no se aplica nada.
- **Historial:** hasta 40 versiones por PDF (el original importado siempre queda) y 30 por libro.
- **Privacidad:** con Stirling Cloud, los archivos se procesan en los servidores de Stirling (AWS) y vuelven. Las herramientas se aplican solo cuando las usás.

## 9. Pruebas realizadas

- **Typecheck:** sin errores.
- **Tests automáticos:** 105 de 106 pasan y ninguno falla. El que queda está omitido desde antes. Hay 2 archivos nuevos:
  - `tests/stirling.test.ts` (9 tests): validación de cada operación antes de llamar a Stirling, campos exactos que espera la 3.2.0, errores (402, 401, idioma de OCR que falta), páginas nuevas escapadas y con estilo en línea.
  - `tests/stage8.test.ts` (7 tests): planes del asistente validados contra el documento, propuestas sobre una copia del libro, borradores a bloques, versiones (deshacer y rehacer con ramas), unión de conversaciones de dos computadoras.
- **Build de producción:** correcto.
- **Operaciones contra un Stirling 3.2.0 real, con el código del servidor:** 13 correctas, y además el error esperado cuando falta un idioma de OCR. Usé un PDF en ruso con tildes, un PDF escaneado y un Word. Revisé visualmente el resultado de cada una.
- **Recorrido completo en el navegador: 37 de 37, sin errores en la consola.** Usé el servidor real, el inicio de sesión real, Postgres, el Stirling real y tres perfiles de navegador. Solo se simuló el modelo de Kie. Cubre:
  - importar el PDF en ruso: el original se descarga idéntico;
  - miniaturas y teclado;
  - rotar, deshacer y rehacer, verificados en el PDF descargado;
  - nota adhesiva;
  - reemplazo con vista previa;
  - «Crear con IA», con el modelo y los créditos informados, y páginas nuevas con cirílico;
  - asistente: aplicar, rechazar un reemplazo inventado y explicar lo imposible;
  - texto elegido;
  - Stirling caído: avisa y no cambia nada;
  - recargar;
  - PDF escaneado con OCR en ruso;
  - otra computadora: PDF idéntico, versiones y conversación, y volver al original exacto;
  - libro: propuesta, versión «Antes de», ⌘Z y página nueva con «Crear con IA»;
  - axe (WCAG 2.1 AA) sin violaciones graves;
  - celular de 390 px sin desplazamiento horizontal.
- **Sincronización anterior (Etapas 5 y 7) con dos navegadores reales:** 37 de 37, después de corregir el motor (ver abajo).
- **Errores reales encontrados y corregidos en estas pruebas:**
  - la selección de páginas no seguía a la página activa con el teclado, y «Rotar» giraba la página equivocada;
  - el cuadro del asistente no guardaba lo escrito;
  - un documento abierto antes de que llegara desde otra computadora quedaba esperando para siempre (motor de sincronización);
  - dos botones sin nombre accesible en el celular;
  - la región de la página no se podía enfocar con el teclado.

## 10. Cambios técnicos

- **Stirling:**
  - `src/lib/stirling/operations.ts`: operaciones permitidas, esquemas, efectos y errores;
  - `server.ts`: llamadas con la clave, validación con pdf-lib y operaciones compuestas;
  - `page-html.ts`: páginas nuevas con estilos en línea, porque Stirling quita `<style>`;
  - `client.ts`;
  - la ruta `src/app/api/pdf/stirling/route.ts`.
- **Asistente:**
  - `src/lib/assistant/edit-plan.ts`: herramientas, mensajes y validación;
  - `book-actions.ts`: propuesta sobre una copia del libro;
  - `draft.ts`: texto → bloques;
  - la ruta `src/app/api/pdf/assistant/route.ts`.
- **Editor de PDF importados:**
  - `src/components/pdf/document-editor.tsx`;
  - `doc-view.tsx`, `doc-tools.tsx`, `doc-preview.tsx` y `doc-versions.tsx`;
  - el visor `src/lib/pdf/viewer.ts`;
  - `/workspace/documento?id=…` abre este editor; con `&editor=texto` abre Nutrient.
- **Compartidos:**
  - `edit-assistant.tsx`, `create-chat.tsx` y `use-doc-chat.ts`;
  - en libros, `book-proposal.tsx` y `book-versions.tsx`, integrados en `book-editor.tsx`.
- **Datos:**
  - versiones de PDF en `src/lib/books/originals.ts`;
  - versiones de libros en `src/lib/books/versions.ts`;
  - conversaciones por documento en `src/lib/books/doc-chat.ts`;
  - tipos de sincronización nuevos: `pdf-version`, `book-version` y `doc-chat`;
  - el chat personal sigue aparte y no los lee.
- **Motor de sincronización** (`src/lib/sync/engine.ts`): un registro abierto solo espera si ya hay una copia local que proteger.
- **Configuración:**
  - `STIRLING_API_KEY` y `STIRLING_API_URL` en `.env.example`;
  - `deploy/stirling/docker-compose.yml`, para un servidor propio opcional.
- **Pruebas locales:** `KIE_BASE_URL` (ya existía para imágenes y saldo) ahora también sirve para los modelos de texto, para probar contra un Kie falso. Producción nunca la define.
