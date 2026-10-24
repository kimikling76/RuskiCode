# Archivos del estudio y sincronización en el sitio real

## Qué pasaba

Al subir una imagen aparecía «El almacenamiento de archivos del estudio no está listo en el servidor».

La causa: a la base de datos del sitio real le faltaban las tres tablas de la etapa 5 (`sync_item`, `sync_asset` y `generation_request`). La etapa 5 las dejó preparadas en `prisma/migrations/202610170001_sync/migration.sql`, con la nota de aplicarlas en producción «juntos, cuando lo apruebes». Eso no se había hecho, así que en el sitio real:

- **no se podían subir archivos**: imágenes de referencia, adjuntos del Chat e imágenes de libros;
- **la sincronización entre computadoras nunca estuvo activa**: todo quedaba solo en el navegador;
- **la protección contra cobros dobles** de Kie usaba su versión más simple.

## Qué se hizo

Elegiste activar todo. Desde acá no hay acceso directo a la base de datos del sitio real, así que lo hace el propio servidor (`src/lib/sync/schema.ts`):

- **Cuándo:** la primera vez que necesita una de esas tablas y no está, la crea y repite la operación.
- **Con qué:** usa **las mismas instrucciones** de la migración de la etapa 5, todas «CREATE … IF NOT EXISTS». Solo agregan lo que falta: no cambian ni borran datos. Una prueba automática (`tests/sync-schema.test.ts`) asegura que sean idénticas a la migración.
- **Si hay varios servidores a la vez:** usan un candado de la base, así no chocan al crear la misma tabla.
- **Si no la puede crear:** por ejemplo, si la base no lo permite, lo vuelve a intentar como mucho una vez por minuto, y el estudio sigue funcionando como antes, solo en el navegador.

## Qué vas a notar

- **Las subidas funcionan.**
- **Abajo a la izquierda** pasa a decir «Guardado · hora», en lugar de «Solo en este navegador».
- **Lo que tenés en este navegador se copia a tu cuenta** (chats, libros, proyectos e imágenes guardadas) y aparece en tus otras computadoras cuando entrás con la misma cuenta.
- **La primera sincronización puede tardar un poco** si hay muchos libros o imágenes.
- **Las imágenes ocupan espacio en Neon**, hasta 4 MB cada una. Si el espacio se volviera un problema, convendría un almacenamiento de archivos aparte. Eso sería contratar un servicio, así que no se hizo.

## Cómo se probó

- **Contra un Postgres real, con una base igual a la del sitio real** (solo las migraciones de libros y cuentas, sin las tablas de la etapa 5):
  - la primera subida creó las tres tablas y guardó la imagen;
  - la imagen se leyó de vuelta igual;
  - una segunda subida no cambió nada;
  - la sincronización y el registro de pedidos funcionaron;
  - tres servidores a la vez subieron sin errores.
- **En el navegador, sobre otra base igual:**
  - se entró con una cuenta nueva y se subió una imagen en el Estudio;
  - el servidor creó las tablas solo y la sincronización pasó a «Guardado».
- **Además:** `tsc`, las 175 pruebas y el build de producción, sin errores.
