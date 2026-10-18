# Etapa 13 — Contexto del libro en PDF Studio y en los asistentes

Esta etapa le da al estudio la memoria del libro: personajes, unidades, reglas y decisiones, cada dato con su fuente y su estado. El asistente y el editor la usan **solo dentro del proyecto del libro**.

Se hizo en cuatro partes:

1. **Base de conocimiento** del libro.
2. **Biblioteca de personajes**, con sus imágenes originales.
3. **Contexto en el asistente y en el editor.**
4. **Ilustraciones** con las imágenes aprobadas como referencia real.

**Reglas generales:**
- **Nada queda aprobado por estar en un archivo.** Lo aprobado no lo cambia ninguna importación.
- **Nada se cobra sin confirmar.**
- **El Chat normal sigue neutro.**

## 1. Dónde está

**PDF Studio → «Contexto del libro»** (también en `/workspace/libro`). Ahí creás el proyecto del libro. Tiene tres pestañas:

- **Datos:**
  - todo lo que se sabe del libro, con filtros por tipo y por estado;
  - un buscador que entiende los nombres rusos en todas sus formas (Ольга, Ольги, Ольгой…).
- **¿Qué sabe el alumno?:** lo que aparece en las páginas hasta la que elijas.
- **Unidades y asistentes:**
  - qué unidades del manual son de este libro, y su número;
  - qué asistentes traen este contexto.

Una unidad pertenece a un solo libro.

## 2. Cómo empezar

1. **Creá el proyecto** (viene con el nombre «Русский код»).
2. **«Importar archivos»:** elegí juntos los archivos de texto del paquete:
   - `CONTEXTO_DEL_LIBRO.md`, `personajes.json`, `fuentes-documentales.json`;
   - `REGLAS_EDITORIALES_RECUPERADAS.md`, `FUENTES_Y_LIMITES.md`;
   - los textos de las unidades (`unidades-texto/*.txt`);
   - el archivo `decisiones-y-canon-del-autor.json` que te mandé.

   Antes de guardar se ve qué hay en cada archivo, cuántos datos entran y con qué estado. Si un archivo contradice algo que ya aprobaste, se avisa y no se cambia.
3. **Revisá y decidí:**
   - Las **22 decisiones pendientes** (las 18 de la auditoría y 4 nuevas) están en «Datos», filtrando por «Decisión».
   - Cada una tiene sus opciones y la propuesta marcada. «Elegir» la aprueba.
   - Lo que dijiste vos en el pedido entra **aprobado** (11 datos). Por ejemplo: clases individuales, la unidad 1 sin posesivos, тётя Оля con pelo rojizo rizado.
   - Lo que viene del paquete entra como **observado** hasta que lo apruebes.
4. **Imágenes de los personajes:**
   - En cada personaje, «Agregar imágenes o la ficha en PDF».
   - Subí los **PNG originales** de la carpeta `personajes/` del paquete. El estudio compara su huella (sha256) con la del manifiesto y te dice si es el mismo archivo.
   - Revisalas, «Aprobar», y «Usar como principal».
   - Las fichas PDF de los tíos también se pueden guardar. La de тётя Оля pesa 4,09 MB y se guarda en dos partes.
   - Los PDF no se mandan a los modelos de imagen: se manda la imagen principal.
5. **Unidades y asistentes:**
   - Marcá las unidades del manual que son del libro y poné su número.
   - Marcá «Editor del libro de ruso», u otro asistente, para que traiga el contexto.

## 3. Cómo se guarda cada dato

- **Estados:**
  - **aprobado:** canon;
  - **observado en un archivo:** visto en un archivo, sin aprobar;
  - **propuesto** y **pendiente:** no son hechos;
  - **sustituido:** queda guardado, pero ya no se usa.
- **Fuentes:** cada dato dice de qué archivo sale, con su fecha y la página o la sección.
- **Versiones:**
  - Editar, aprobar o cambiar una imagen crea una **versión nueva**.
  - «Historial» muestra cada versión y «Restaurar esta versión» la trae de vuelta, como una versión nueva. Nada se borra.
- **En tu cuenta:**
  - Se guarda en el servidor y se ve igual en otra computadora.
  - Si dos computadoras cambian lo mismo, no se pisa nada. Aparece «1 cambio para revisar» y, con «Conservar las dos», la otra versión queda como copia **propuesta**.
- **No hizo falta ninguna migración** ni ningún servicio nuevo: usa las mismas tablas que ya sincronizan libros y unidades.

## 4. ¿Qué sabe el alumno hasta esta página?

Sale de dos cosas: el texto de las páginas importadas y la descripción de cada unidad. Muestra:
- **las unidades anteriores**, con su estado;
- **la unidad en curso**, con lo que todavía no hay que introducir (por ejemplo, posesivos en la unidad 1);
- **lo que se enseña después**;
- **las palabras, en cuatro grupos:**
  - recicladas en más de una unidad;
  - repetidas dentro de una unidad;
  - vistas **una sola vez**;
  - nuevas en esa página.

**Una palabra que aparece no se da por sabida.** El asistente recibe lo mismo, con esa advertencia.

## 5. El asistente con el contexto del libro

**Cuándo recibe el contexto:**
- en la pestaña **«Libro» del editor**, cuando la unidad es del libro;
- en **`/pdf-generator` y `/revisar-ruso`**, cuando la unidad es del libro;
- en el **Chat**, solo si elegís a propósito un asistente marcado para el libro.

**Cuándo no recibe nada:**
- en el Chat sin asistente;
- en las unidades que no son del libro;
- en otros proyectos.

**Qué recibe en cada pedido:**
- tus palabras, **aparte**;
- solo los datos que corresponden:
  - identidad y reglas;
  - la unidad y la página activas, y lo que el alumno vio hasta ahí;
  - los personajes nombrados y los que se les parecen (por ejemplo, Мария y тётя Оля cuando nombrás a Ольга);
  - las decisiones abiertas sobre ellos.

**Cómo los recibe:**
- Van como **material de referencia, no como órdenes**, con su estado y su fuente.
- Un texto dentro de un PDF o de una ficha no puede cambiar lo que el asistente puede hacer.
- Si un nombre puede ser de dos personajes, se le dice que pregunte.

**Cómo ver qué se mandó:** debajo de la respuesta aparece «Con el contexto de «Русский код»». Tocándolo se ven los datos enviados.

## 6. Pestaña «Libro» del editor del manual

**Qué muestra:**
- el libro, la unidad y la página;
- los personajes que nombra la página;
- las decisiones pendientes que la tocan.

**Preguntas rápidas** (también podés escribir la tuya):
- qué sabe el alumno;
- revisar ruso y acentos;
- buscar contradicciones con el canon;
- proponer la página siguiente;
- mejorar la legibilidad.

**Cambiar un ejercicio** (más difícil, más entretenido, más variado o corregir ruso):
1. Elegí un ejercicio hecho en el editor.
2. La propuesta muestra:
   - **antes y después**;
   - qué cambia;
   - las consecuencias: el audio grabado ya no coincide, cambian las respuestas, el bloque cambia de alto.
3. Si el bloque está aprobado (bloqueado), hay que marcar «Entiendo que cambia material aprobado».
4. **«Guardar versión y aplicar»** guarda la versión anterior y cambia **solo ese ejercicio**. Se mantienen su número, su código de audio, el encabezado, el pie y las ilustraciones.
5. Para rechazar un cambio ya aplicado: «Deshacer», o «Versiones» → «Volver a esta».

**Los bloques que vienen del PDF importado** reciben sugerencias, pero el cambio lo hacés vos con «Selección». El editor no tiene una herramienta segura para que la IA los reescriba.

## 7. Ilustraciones con los personajes del libro

Se abren desde un personaje («Ilustración con este personaje…») o desde la pestaña «Libro» del editor.

1. **Modelo de imagen**, del catálogo real del estudio.
2. **Personajes y archivos:** cada personaje viene con su imagen principal marcada. Podés sumar otras imágenes aprobadas o quitar las que no quieras mandar. Solo se envía lo que está marcado.
3. **Qué se envía:** la lista exacta («Imagen 1: Ольга · olga.png · sha256…») y el límite del modelo. Si el límite no alcanza, cada personaje conserva una y se dice qué queda afuera.
4. **El prompt**, armado con:
   - quién aparece: su imagen de referencia y su descripción confirmada;
   - qué pasa;
   - dónde y cuándo;
   - el encuadre y el estilo.

   Se puede editar.
5. **Confirmación siempre**, con el modelo, los personajes, las imágenes y el costo. El costo solo aparece si Kie lo publica; si no, se dice que Kie lo informa al terminar.
6. **El trabajo guarda:**
   - el modelo, el prompt y los ajustes;
   - las referencias usadas;
   - **qué recibió el proveedor**: el servidor mide la huella de cada archivo que sube a Kie, y el estudio te dice si es el que elegiste.
7. **Revisión antes de usarla:**
   - Respondés «¿Mantiene el rostro y el cuerpo?». Nunca se marca sola.
   - Recién después se puede insertar en la página. Si no entra, se ofrece una página nueva y se avisa que cambia la numeración.
   - También se puede guardar en la biblioteca del personaje, **sin aprobar**.

**Avisos que da:**
- un personaje sin imagen verificada (Дженни): el resultado no es una ficha canónica;
- un modelo que no recibe imágenes;
- que **ningún modelo garantiza el mismo rostro**.

**`/pdf-generator` en una unidad del libro:**
- Los personajes del libro van con su imagen aprobada de la biblioteca, en vez de un retrato nuevo.
- Los que no tienen imagen aprobada no reciben un rostro inventado.

### Qué modelos reciben imágenes

| | Cantidad |
|---|---|
| Modelos de imagen en el catálogo | 65 |
| Aceptan imágenes de referencia según su documentación | 30 (el límite va de 1 a 16 según el modelo; Nano Banana 2.1, el probado, acepta 4) |
| Modelos de texto que aceptan imágenes | 28 de 41 |

Los modelos de imagen que aceptan referencias las reciben como enlaces temporales de Kie. El servidor sube a Kie el archivo guardado en tu cuenta, nunca un nombre ni un gen_id.

Los modelos de texto nunca reciben las imágenes de la biblioteca: **reciben solo las descripciones confirmadas**.

## 8. Cómo probarlo

**En la vista previa** (no en www.ruskicode.com):

1. **Importar:** creá el proyecto e importá los archivos. Tienen que entrar más de cien datos, ninguno aprobado salvo los 11 que dijiste vos.
2. **Ольга, тётя Оля y Мария:** buscá «Ольга». Abre Ольга, y dice «No confundir con: Мария, Тётя Оля».
3. **Tus decisiones:** decidí una. Queda aprobada, y su historial dice qué elegiste.
4. **Las imágenes y el manifiesto:** subí `personajes/olga.png` a Ольга. Tiene que decir «Coincide con el manifiesto».
5. **Una ilustración:** aprobala, hacela principal y generá una ilustración de Ольга y тётя Оля. El resultado dice «sha256 recibido … (es el archivo elegido)» para cada imagen.
6. **Дженни:** «Ilustración con este personaje…». Avisa que no tiene imagen verificada.
7. **Un ejercicio y la vuelta atrás:**
   - Vinculá una unidad.
   - En el editor, agregá un ejercicio y usá «Libro» → «Más difícil».
   - Aplicá el cambio y después volvé a la versión anterior.
8. **Otra computadora:** abrí el proyecto en otra computadora o en otro navegador. Están los mismos datos y las mismas imágenes.
9. **Chat neutro y asistente del libro:**
   - En el Chat sin asistente, preguntá «¿Quién es Ольга?». No aparece «Con el contexto de…».
   - Con «Editor del libro de ruso», sí aparece.

## 9. Qué se probó y cómo

- **Pruebas automáticas:**
  - 163 en total, todas bien;
  - 17 nuevas del libro, con **datos inventados**: el repositorio es público y no contiene nada del libro;
  - más typecheck y build.
- **Recorridos en el navegador** con tus archivos, en una copia local:
  - base de datos local y dos navegadores como dos computadoras;
  - **Kie simulado**: no se gastó ningún crédito;
  - 21 de 21 controles en las etapas 1 y 2, y 27 de 27 en las etapas 3 y 4;
  - accesibilidad (axe) sin problemas.
- **No probado con Kie real:**
  - la calidad de las respuestas del modelo con el contexto;
  - si una ilustración real mantiene los rostros.

  Eso hay que mirarlo con tus créditos y con criterio de autor.

## 10. Límites

- **Ejercicios encontrados:** el texto extraído de los PDF pierde orden, bocadillos y a veces acentos. Los ejercicios se reconocen cuando el número va seguido del código de audio. En la unidad 1, casi ninguno.
- **Página sin número:** cuando una página no trae su número en el pie, se deduce y queda marcada «número deducido» (la 36).
- **Expresiones sin explicación formal:** no se pueden deducir del texto. Se completan a mano en cada unidad.
- **Archivos grandes:** el estudio guarda archivos de hasta 4 MB. Los más grandes se guardan en partes y no se pueden mandar como referencia a un modelo; para eso está la imagen PNG.
- **Espacio:** las imágenes ocupan espacio en la base de datos de la cuenta, igual que las de las unidades.
