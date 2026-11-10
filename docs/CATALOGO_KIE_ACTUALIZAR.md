# Actualizar el catálogo de modelos de Kie

## Qué hace `scripts/kie-catalog-update.mjs`
1. **Lee la documentación de Kie:** la lista de `docs.kie.ai/llms.txt` y la página de cada modelo.
2. **Arma el catálogo de nuevo** con `scripts/kie-catalog.mjs`, en un archivo aparte. Las opciones salen de la especificación OpenAPI de cada página; no se inventa ninguna.
3. **Lo compara con el catálogo actual** y cambia solo lo que Kie cambió:
   - **un modelo nuevo** se agrega;
   - **un modelo cuyas opciones cambiaron** se actualiza;
   - **un modelo que no cambió** queda igual, con su fecha de revisión;
   - **un modelo cuya página Kie sacó** se quita si estaba apagado. Si el estudio lo usaba, se mantiene (puede seguir funcionando) y el resumen lo avisa.
4. **Escribe un resumen en español** de lo nuevo, lo cambiado y lo quitado.

**Un modelo que el estudio todavía no sabe usar** se agrega igual, pero **apagado y con el motivo**. Por ejemplo: herramientas sin prompt, como mejorar la resolución, o modelos que piden algo que la pantalla no da.

**Uso:**
```
node scripts/kie-catalog-update.mjs            # descarga docs.kie.ai
node scripts/kie-catalog-update.mjs carpeta    # usa páginas ya descargadas
CATALOG_SUMMARY=resumen.md node scripts/kie-catalog-update.mjs   # además guarda el resumen
```
Si Kie no cambió nada, dice «sin cambios» y no toca el archivo.

**Páginas repetidas:** a veces Kie agrega una página en chino, con una dirección numerada, para un modelo que ya tiene su página en inglés. Ahora el generador se queda con una sola: la de `/market/`, con el nombre en inglés.

## Actualización del 10 de noviembre de 2026
**21 modelos nuevos:**
- **Imagen:**
  - Seedream 5.5 (de texto a imagen, de imagen a imagen y separación en capas);
  - FLUX 3 Klein (crear y editar);
  - GPT Image 2.6 Economy, Flare y Sunburst (cada uno de texto a imagen y de imagen a imagen).
- **Video:**
  - Kling 4.0 Flash (Keyframe y Reference);
  - PixVerse V6 Max (de texto a video y de imagen a video);
  - Gemini Omni 1.2 Flash;
  - OmniHuman 2.0 (avatar que dice tu audio).
- **Texto:** Kimi K3.1 Pro y GPT 6.1 Terra.
- **Apagados por ahora:** Kie Video Upscale, que es una herramienta sin prompt, y Nemotron 3.5 Transcribe, de audio.

**3 modelos que ahora se pueden usar:**
- **PixVerse V6**, de texto a video y de imagen a video, porque su página ya documenta sus opciones;
- **Wan 2.2 A14B Speech to Video Turbo**, porque ahora el estudio da audio.

**Se quitó Seedance 1.5 Pro:** estaba apagado y Kie ya no lo documenta.

**Sobre Kling 4.0 Flash Keyframe:** su página documenta solo el primer cuadro, no los intermedios ni el final como Kling 4.0 Keyframe. Por eso, en el estudio toma una sola imagen.
