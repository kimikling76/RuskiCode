/** No video model is connected yet: no controls, no simulated progress. */
export function VideoTab() {
  return (
    <div className="rc-cine-empty rc-cine-empty--page">
      <div className="rc-cine-empty-frame rc-cine-empty-frame--wide" aria-hidden="true" />
      <h2>El video todavía no está conectado</h2>
      <p>Para activarlo hay que elegir un modelo de video de Kie y confirmar en su documentación la duración, la resolución y los formatos que acepta. Hasta entonces no se muestran controles.</p>
      <p className="rc-hint">Mientras tanto, en Dirigir podés armar guion, planos e imágenes por plano.</p>
    </div>
  );
}
