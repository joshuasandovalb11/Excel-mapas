/**
 * Servicio de API para consultar rutas procesadas
 * Punto único de entrada para interactuar con el backend de rutas
 */

import type {
  FechaDisponible,
  ProcessedTripV1,
  RutasResumenResponse,
} from '../types/route.types';
import { fetchWithTimeout } from './httpClient';
import { toAppError } from '../utils/appError';

const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3000/api/visualizador/rutas'
  : '/api/visualizador/rutas';

/**
 * Obtiene las fechas disponibles de rutas
 * @returns Promise con lista de fechas disponibles
 */
export async function fetchAvailableDates(
  signal?: AbortSignal
): Promise<FechaDisponible[]> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/fechas`, {
      method: 'GET',
      signal,
      timeoutMs: 15000,
      retries: 2,
      backoffMs: 150,
    });

    const data: FechaDisponible[] = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'No se pudieron cargar las fechas',
      message: 'No fue posible cargar las fechas disponibles.',
      action: 'Intenta nuevamente en unos segundos.',
    });
    console.error('❌ fetchAvailableDates:', appError);
    throw appError;
  }
}

/**
 * Obtiene el resumen de rutas con filtros opcionales
 * @param fecha - Fecha en formato YYYY-MM-DD
 * @param vendedor - ID o nombre del vendedor (opcional)
 * @param limite - Límite de resultados (opcional)
 * @returns Promise con respuesta paginada de resúmenes de rutas
 */
export async function fetchRoutesSummary(
  fecha: string,
  vendedor?: string,
  limite?: number,
  signal?: AbortSignal
): Promise<RutasResumenResponse> {
  try {
    const params = new URLSearchParams();
    params.append('fecha', fecha);
    if (vendedor) params.append('vendedor', vendedor);
    if (limite) params.append('limite', limite.toString());

    const url = `${API_BASE_URL}?${params.toString()}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      signal,
      timeoutMs: 20000,
      retries: 2,
      backoffMs: 200,
    });

    const data: RutasResumenResponse = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'No se pudieron cargar las rutas',
      message: 'No fue posible obtener el resumen de rutas.',
      action: 'Intenta nuevamente en unos segundos.',
    });
    console.error('❌ fetchRoutesSummary:', appError);
    throw appError;
  }
}

/**
 * Obtiene el detalle completo de una ruta
 * @param idRuta - ID de la ruta
 * @param minStopDuration - Duración mínima en minutos para considerar una parada (opcional)
 * @param incluirClientes - Si se incluyen clientes visitados (opcional)
 * @returns Promise con detalle completo de la ruta procesada
 */
export async function fetchRouteDetail(
  idRuta: number,
  minStopDuration?: number,
  incluirClientes?: boolean,
  signal?: AbortSignal
): Promise<ProcessedTripV1> {
  try {
    const params = new URLSearchParams();
    if (minStopDuration !== undefined) {
      params.append('minStopDuration', minStopDuration.toString());
    }
    if (incluirClientes !== undefined) {
      params.append('incluirClientes', incluirClientes.toString());
    }

    const url = `${API_BASE_URL}/${idRuta}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      signal,
      timeoutMs: 30000,
      retries: 2,
      backoffMs: 250,
    });

    const data: ProcessedTripV1 = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'No se pudo cargar la ruta',
      message: 'No fue posible obtener el detalle de la ruta solicitada.',
      action: 'Intenta nuevamente en unos segundos.',
    });
    console.error('❌ fetchRouteDetail:', appError);
    throw appError;
  }
}

/**
 * Sube un archivo Excel para procesamiento de ruta
 * @param file - Archivo Excel a procesar
 * @param minStopDuration - Duración mínima en minutos para considerar una parada (opcional)
 * @param incluirClientes - Si se incluyen clientes visitados (opcional)
 * @returns Promise con ruta procesada desde el archivo
 */
export async function uploadExcelRoute(
  file: File,
  minStopDuration?: number,
  incluirClientes?: boolean,
  signal?: AbortSignal
): Promise<ProcessedTripV1> {
  try {
    const params = new URLSearchParams();
    if (minStopDuration !== undefined) {
      params.append('minStopDuration', minStopDuration.toString());
    }
    if (incluirClientes !== undefined) {
      params.append('incluirClientes', incluirClientes.toString());
    }

    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_BASE_URL}/excel${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      body: formData,
      signal,
      timeoutMs: 60000,
      retries: 1,
      backoffMs: 400,
    });

    const data: ProcessedTripV1 = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'No se pudo procesar el archivo',
      message: 'No fue posible procesar el archivo de Excel.',
      action: 'Verifica el archivo e intenta nuevamente.',
    });
    console.error('❌ uploadExcelRoute:', appError);
    throw appError;
  }
}
