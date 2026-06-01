export type AppErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HTTP_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN'
  | 'DB_ERROR';

export type AppError = {
  title: string;
  message: string;
  code: AppErrorCode;
  status?: number;
  action?: string;
  details?: string;
};

export class RequestTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

type AppErrorFallback = {
  title: string;
  message: string;
  action?: string;
  code?: AppErrorCode;
};

export const createAppError = (error: AppError): AppError => ({
  ...error,
});

export const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') return false;
  return 'title' in error && 'message' in error && 'code' in error;
};

const getHttpTitle = (status: number, fallbackTitle: string): string => {
  if (status === 400) return 'Solicitud invalida';
  if (status === 401) return 'No autorizado';
  if (status === 403) return 'Acceso denegado';
  if (status === 404) return 'Recurso no encontrado';
  if (status >= 500) return 'Error del servidor';
  return fallbackTitle;
};

const getHttpAction = (status: number, fallbackAction?: string): string => {
  if (status >= 500) return 'Intenta nuevamente en unos minutos.';
  return fallbackAction || 'Verifica los datos e intenta de nuevo.';
};

export const buildHttpError = async (
  response: Response,
  fallback: AppErrorFallback
): Promise<AppError> => {
  let payload: { message?: string; error?: string } | null = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }

  const message =
    payload?.message ||
    payload?.error ||
    fallback.message ||
    `El servidor respondio con codigo ${response.status}.`;

  return createAppError({
    title: getHttpTitle(response.status, fallback.title),
    message,
    code: 'HTTP_ERROR',
    status: response.status,
    action: getHttpAction(response.status, fallback.action),
  });
};

export const toAppErrorSync = (
  error: unknown,
  fallback: AppErrorFallback
): AppError => {
  if (isAppError(error)) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return createAppError({
      title: 'Solicitud cancelada',
      message: 'La solicitud fue cancelada.',
      code: 'ABORTED',
    });
  }

  if (error instanceof RequestTimeoutError) {
    return createAppError({
      title: 'Tiempo de espera agotado',
      message: 'El servidor tardo demasiado en responder.',
      code: 'TIMEOUT',
      action: 'Intenta nuevamente en unos momentos.',
    });
  }

  if (error instanceof SyntaxError) {
    return createAppError({
      title: 'Respuesta invalida',
      message: 'El servidor envio una respuesta inesperada.',
      code: 'PARSE_ERROR',
      action: 'Intenta nuevamente o contacta soporte.',
    });
  }

  if (
    error instanceof TypeError &&
    error.message.toLowerCase().includes('failed to fetch')
  ) {
    return createAppError({
      title: 'Sin conexion al servidor',
      message: 'No se pudo conectar con el servidor. Revisa tu conexion.',
      code: 'NETWORK_ERROR',
      action: 'Verifica tu conexion e intenta de nuevo.',
    });
  }

  if (error instanceof Error) {
    return createAppError({
      title: fallback.title,
      message: error.message || fallback.message,
      code: fallback.code ?? 'UNKNOWN',
      action: fallback.action,
      details: error.stack,
    });
  }

  return createAppError({
    title: fallback.title,
    message: fallback.message,
    code: fallback.code ?? 'UNKNOWN',
    action: fallback.action,
  });
};

export const toAppError = async (
  error: unknown,
  fallback: AppErrorFallback
): Promise<AppError> => {
  if (error instanceof Response) {
    return buildHttpError(error, fallback);
  }

  return toAppErrorSync(error, fallback);
};
