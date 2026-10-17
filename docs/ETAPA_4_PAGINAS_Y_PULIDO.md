# Etapa 4 — Páginas secundarias y pulido

La portada, el login y la nueva página de **Ajustes** pasan al mismo sistema «Графит» que los tres estudios. Ajustes reúne Cuenta, Preferencias, Uso y créditos, Conectores y lo guardado en el navegador. El pulido cubre el foco con teclado, «reducir movimiento», las pantallas con muesca y el contraste.

## Qué funciona

| Parte | Qué hace | De dónde salen los datos |
|---|---|---|
| **Portada** (`/`) | Presenta el estudio con una página real del libro de muestra, la que hizo el compositor, y marca un bloque como lo hace el editor. Describe los tres espacios con lo que hacen hoy y lo que todavía no. Explica los costos sin precios inventados. Botones: «Entrar al estudio» y «Ver la muestra en PDF». | Texto fijo y `public/demo/` (página y PDF de la muestra, públicos). |
| **Login** (`/login`) | Entrar con correo y contraseña, con Google si está configurado, o activar la cuenta la primera vez. Botón para ver la contraseña. Errores claros, uno a la vez. | Los mismos servicios de antes (Better Auth y `/api/studio/setup`). La lógica no cambió. |
| **Ajustes → Cuenta** | Correo y nombre de la sesión, cuándo vence y «Cerrar sesión». | La sesión real. |
| **Ajustes → Preferencias** | Los dos «Preguntar antes» (Chat, y Cinema con las imágenes de PDF Studio) en un solo lugar, y «Borrar todos los chats» con su confirmación. | Los mismos interruptores de cada estudio. |
| **Ajustes → Uso y créditos** | **Saldo real de Kie**, con la hora de la consulta y el botón Actualizar. Debajo: lo que Kie informó desde este navegador, por estudio y por día, con hora y tipo de pedido. Los pedidos sin costo informado dicen «Sin informar» y no suman cero. | Saldo: Kie. Registro: este navegador. |
| **Ajustes → Conectores** | Estado de la cuenta y la base de datos, Kie texto, Kie imágenes, el compositor de PDF, el video y los otros proveedores. Cada uno tiene su palabra («Funcionando», «Configurado», «Apagado», «Sin conectar») y un punto de color que solo la repite. Muestra la hora de verificación y el botón «Verificar de nuevo». | `/api/models` y `/api/books`, los mismos endpoints de antes. No llama a nada pago. |
| **Ajustes → Este navegador** | Cuántos chats, imágenes, libros, notas y pedidos hay guardados, cuánto espacio ocupan, y la opción de pedirle al navegador que no los borre. | El navegador. |
| **Página no encontrada y error** | Páginas propias con salida al estudio y a la portada. La de error tiene «Reintentar». | — |
| **Barra lateral** | La línea «N créditos registrados» abre Uso y créditos. El menú de cuenta lleva a Ajustes, Uso y Conectores. El texto de ayuda describe lo que existe hoy. | — |

## Lo nuevo en el servidor (chico)

- **`GET /api/kie/credits`:** consulta el saldo con la clave que ya está en el servidor.
  - Exige sesión y tiene límite de consultas.
  - Solo se llama al abrir Uso y créditos o al tocar Actualizar.
  - Si Kie no devuelve un número válido, la página dice que no pudo consultarlo. Nunca muestra un número supuesto.
- **Corrección:** en la Etapa 1 dije que Kie no tenía un endpoint documentado de saldo. Ahora sí lo tiene: [Get Remaining Credits](https://docs.kie.ai/common-api/get-account-credits), `GET https://api.kie.ai/api/v1/chat/credit` con la clave como Bearer, que responde `{"code":200,"msg":"success","data":<créditos>}`.
- **Cómo lo verifiqué:** este entorno no puede abrir `docs.kie.ai`, así que lo confirmé con el buscador web, igual que en la Etapa 2. Encontré la página oficial y la misma descripción en dos fuentes externas. Falta tu prueba con la clave real (paso 4 de abajo).

## Cambios de comportamiento a tener en cuenta

- **El registro de consumo ahora guarda fecha, estudio y tipo de pedido.** Lo que se registró antes de esta etapa no los tiene; aparece al final, en «Sin fecha».
- **«Ajustes del Chat»** (menú ⋯ del Chat) ahora abre Ajustes → Preferencias. El diálogo de borrar todos los chats arranca directo en la confirmación.
- **«Ver la muestra»** de la portada abre el PDF de muestra. El editor de la muestra pide sesión, porque todo `/workspace` es privado.
- **El foco al escribir en el Chat** ahora se ve como el de cualquier campo: borde lima y un anillo suave alrededor del compositor.
- **«Reducir movimiento»** ahora vale también para las herramientas anteriores: nada se desplaza ni late, solo cambian colores y opacidad.

## Requiere backend (no hecho)

- **Cambiar la contraseña desde Ajustes:** Better Auth lo permite, pero es una cuenta compartida. Conviene decidir juntos cómo avisarle a la otra persona.
- **Sincronizar chats, libros, notas y el registro de consumo entre computadoras.**
- **Una página de skills o asistentes con instrucciones guardadas**, y el selector de espacio de trabajo: hoy hay un solo espacio.
- **El saldo en la barra lateral:** no lo agregué a propósito, porque haría una consulta en cada página. Está en Uso y créditos.

## Archivos

- **Páginas:**
  - `src/app/page.tsx`
  - `src/app/login/page.tsx`
  - `src/app/workspace/ajustes/page.tsx`
  - `src/app/not-found.tsx`
  - `src/app/error.tsx`
- **Componentes:**
  - `src/components/site/landing.tsx`
  - `src/components/site/login-form.tsx`
  - `src/components/settings/*`
  - `src/components/studio/studio-shell.tsx`: el mismo marco para el editor y Ajustes. Reemplaza a `pdf/editor-shell.tsx`.
- **Servidor:**
  - `src/app/api/kie/credits/route.ts`
  - `src/lib/ai/kie-credits.ts`
- **Consumo:**
  - `src/lib/usage/summary.ts`
  - `src/lib/personal-chat/state.ts` y `src/store/personal-chat.ts`: el registro con fecha, estudio y tipo.
  - `src/lib/ai/text-request.ts`, `src/components/cinema/job-runner.tsx`, `src/components/studio/{personal-chat,convert-chat}.tsx`: cada pedido dice qué fue.
- **Estilos:**
  - `src/styles/site.css` y `src/styles/settings.css` (nuevos)
  - `src/styles/system.css`: los componentes valen también en las páginas públicas.
  - `src/styles/chat.css`: el foco del compositor.
  - `globals.css` y `tokens.css`: sin las clases de la portada anterior.
- **Borrados (sin uso o reemplazados):**
  - `creative-landing.tsx`, `login-form.tsx` (el anterior), `explore.tsx`, `phase-home.tsx`, `sign-out.tsx`
  - `pdf/editor-shell.tsx`
  - `styles/landing.css`
- **Pruebas:** `tests/stage4.test.ts`, con 2 pruebas: saldo de Kie y resumen del consumo. Son 65 en total.

No hay dependencias nuevas.

## Verificación hecha

- `npm run typecheck`, `npm test` (64 pasan y 1 queda salteada: la de maquetación real, que necesita Chromium) y `next build` sin errores.
- **Navegador**, con la sesión, Kie y el compositor simulados, a 1280 y 390 px: 61 comprobaciones, todas bien. Incluyen:
  - La portada con la página real cargada y los enlaces correctos.
  - Login: error con datos incorrectos, ver la contraseña, activación, Google y «sin configurar».
  - Ajustes: cada sección, las flechas del teclado entre pestañas, los interruptores guardados y el saldo con formato local.
  - Un error del saldo que se explica sin inventar un número.
  - El registro por día con «Sin fecha» al final, y los cinco estados de Conectores.
  - **Foco con Tab:** visible en cada parada de la portada, el login, Ajustes, el Chat, PDF Studio y Cinema Studio.
  - **«Reducir movimiento»:** nada se mueve en la portada, Ajustes, el Chat con un menú abierto ni Cinema Studio.
  - **Celular con muesca** (zonas seguras simuladas de 47 px arriba y 34 px abajo): en la portada, el login, el Chat, Ajustes y Cinema, nada queda debajo de la cámara ni de la barra de inicio.
- **Contraste:** axe no podía medirlo en estas páginas, y tampoco en las de las etapas anteriores. La causa es una capa decorativa (la luz ambiental) que tapa todo y no lo deja calcular el fondo.
  - Agregué una medición propia de cada texto contra su fondo real. Confirmé que detecta los errores: marcó 1,17:1 en un caso armado a propósito.
  - Gracias a eso encontré y corregí el botón principal de la portada nueva, que tenía texto claro sobre lima.
  - Ahora todas las páginas revisadas cumplen WCAG AA.
- **Etapas anteriores:** el Chat, Cinema y PDF Studio vuelven a pasar sus 7 comprobaciones cada uno.

## Qué probar (sin saber programar)

En la vista previa de Vercel de esta rama:

1. **Portada sin sesión:** abrila en una ventana privada.
   - Tocá «Ver la muestra en PDF»: se abre el PDF.
   - Tocá «Entrar»: va al login.
2. **Login:**
   - Escribí una contraseña equivocada: aparece un solo aviso.
   - Probá el ojo para ver la contraseña.
   - Entrá con los datos reales.
3. **Ajustes:** en la barra lateral, tocá tu cuenta (abajo) y después «Ajustes y cuenta». Recorré las cinco pestañas con el mouse y después con Tab y las flechas.
4. **Saldo real:**
   - En «Uso y créditos», anotá el saldo que muestra.
   - Compará con el saldo que ves en [kie.ai](https://kie.ai). Si no coincide o dice que no pudo consultarlo, avisame.
5. **Registro:**
   - Mandá un mensaje en el Chat y generá una imagen en Cinema.
   - Volvé a «Uso y créditos»: los dos aparecen en «Hoy», con su hora y estudio.
6. **Conectores:** si el worker de PDF está apagado, dice «Apagado». Encendelo y tocá «Verificar de nuevo»: tiene que decir «En línea».
7. **Preferencias:**
   - Apagá «Preguntar antes» de Cinema.
   - Andá a Cinema: el interruptor está apagado.
   - Volvé a encenderlo.
8. **Teclado:** con Tab, recorré la portada, el login y el Chat. Siempre se tiene que ver dónde estás.
9. **Reducir movimiento:**
   - Activalo en el sistema: en Windows, Configuración → Accesibilidad → Efectos visuales → Efectos de animación; en Mac, Ajustes → Accesibilidad → Pantalla → Reducir movimiento; en el celular hay un ajuste parecido.
   - Abrí un menú y un diálogo: aparecen sin deslizarse.
10. **Celular con muesca:** abrí la portada, el login, el Chat y Ajustes. Nada debe quedar debajo de la cámara ni de la barra de abajo.
11. **Página inexistente:** abrí `/algo-que-no-existe`. Sale la página propia con «Ir al estudio».
