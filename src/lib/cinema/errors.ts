// Detail shown under «Detalles». The headline on a failed card is always the same, short sentence.
export const cinemaErrorDetails: Record<string, string> = {
  AUTH_REQUIRED: 'La sesión terminó. Volvé a iniciar sesión.',
  MODEL_NOT_CONFIGURED: 'El servidor no tiene configurada la clave de Kie (KIE_API_KEY).',
  PROVIDER_AUTH_ERROR: 'Kie rechazó la clave del servidor (KIE_API_KEY en Vercel).',
  INSUFFICIENT_BALANCE: 'Kie informó saldo insuficiente.',
  INVALID_PARAMETERS: 'Kie no aceptó alguno de los parámetros. Probá con otro formato o resolución.',
  RATE_LIMIT: 'Hay demasiadas solicitudes seguidas. Esperá unos segundos.',
  RATE_LIMIT_UNAVAILABLE: 'No se pudo comprobar el límite de uso. Probá más tarde.',
  ALREADY_SENT: 'Esta solicitud ya se había enviado.',
  CREATE_UNCERTAIN: 'Kie tardó demasiado en responder. Puede que la tarea se haya creado: revisá los registros de Kie antes de reintentar.',
  PROVIDER_UNAVAILABLE: 'Kie no respondió. Probá más tarde.',
  STATUS_UNAVAILABLE: 'No se pudo consultar el estado en Kie.',
  TASK_NOT_FOUND: 'Kie ya no tiene registro de esta tarea.',
  RESULT_INVALID: 'Kie terminó la tarea pero no devolvió una imagen.',
  REFERENCE_NOT_ALLOWED: 'Una de las referencias no es una imagen alojada en Kie.',
  REFERENCE_MISSING: 'Una imagen de referencia ya no está guardada en el estudio. Adjuntala de nuevo.',
  UPLOAD_FAILED: 'No se pudo pasar la imagen de referencia a Kie. Probá de nuevo en un momento.',
  INVALID_REQUEST: 'La solicitud no es válida. Revisá el prompt.',
  PROMPT_TOO_LONG: 'El texto es más largo de lo que acepta este modelo. Acortalo o elegí otro modelo.',
  GENERATION_FAILED: 'Kie no pudo generar la imagen.',
  NETWORK: 'Se perdió la conexión. Revisá internet y reintentá.',
  STREAM_INTERRUPTED: 'La respuesta del modelo de chat se cortó. Puede haber consumo: revisá los registros de Kie.',
  INVALID_PLAN: 'El modelo devolvió un plan con un formato inesperado. Probá de nuevo o reformulá la idea.',
  SEARCH_NOT_SUPPORTED: 'Este modelo no busca en la web en Kie. Elegí uno que diga «busca en la web» o apagá la búsqueda.',
};

export function errorDetail(code?: string) {
  return (code && cinemaErrorDetails[code]) || 'La tarea no se completó.';
}
