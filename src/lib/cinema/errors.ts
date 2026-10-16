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
  INVALID_REQUEST: 'La solicitud no es válida. Revisá el prompt.',
  GENERATION_FAILED: 'Kie no pudo generar la imagen.',
  NETWORK: 'Se perdió la conexión. Revisá internet y reintentá.',
  STREAM_INTERRUPTED: 'La respuesta del modelo de chat se cortó. Puede haber consumo: revisá los registros de Kie.',
  INVALID_PLAN: 'El modelo devolvió un plan con un formato inesperado. Probá de nuevo o reformulá la idea.',
};

export function errorDetail(code?: string) {
  return (code && cinemaErrorDetails[code]) || 'La tarea no se completó.';
}
