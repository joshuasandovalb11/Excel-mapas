import type { BehaviorSummaryResponse, Vendor } from '../types/behavior.types';
import { fetchWithTimeout } from './httpClient';
import { toAppError } from '../utils/appError';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

export interface FetchBehaviorParams {
  vendedor: string;
  startDate: string;
  endDate: string;
  minStopDuration?: number;
}

/**
 * Obtiene el catálogo de vendedores disponibles.
 * @param signal Opcional AbortSignal para cancelar la petición.
 * @returns Promesa con un arreglo de objetos de vendedores.
 */
export async function fetchVendedoresCatalog(
  signal?: AbortSignal
): Promise<Vendor[]> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/visualizador/vendedores`,
      {
        method: 'GET',
        signal,
        timeoutMs: 15000,
        retries: 2,
        backoffMs: 150,
      }
    );

    const data: Vendor[] = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'Error al cargar vendedores',
      message: 'No fue posible obtener el catálogo de vendedores.',
      action: 'Intenta nuevamente en unos segundos.',
    });
    console.error('❌ fetchVendedoresCatalog:', appError);
    throw appError;
  }
}

/**
 * Obtiene el análisis de comportamiento para un vendedor en un rango de fechas.
 * @param params Parámetros de búsqueda (vendedor, fechas, etc.).
 * @param signal Opcional AbortSignal para cancelar la petición.
 * @returns Promesa con los datos analíticos del vendedor.
 */
export async function fetchBehaviorAnalytics(
  params: FetchBehaviorParams,
  signal?: AbortSignal
): Promise<BehaviorSummaryResponse> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('vendedor', params.vendedor);
    queryParams.append('startDate', params.startDate);
    queryParams.append('endDate', params.endDate);

    if (params.minStopDuration !== undefined) {
      queryParams.append('minStopDuration', params.minStopDuration.toString());
    }

    const url = `${API_BASE_URL}/visualizador/behavior?${queryParams.toString()}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      signal,
      timeoutMs: 25000,
      retries: 2,
      backoffMs: 250,
    });

    const data: BehaviorSummaryResponse = await response.json();
    return data;
  } catch (error) {
    const appError = await toAppError(error, {
      title: 'Error al cargar análisis',
      message: 'No fue posible obtener el patrón de conducta del vendedor.',
      action: 'Verifica los filtros e intenta nuevamente.',
    });
    console.error('❌ fetchBehaviorAnalytics:', appError);
    throw appError;
  }
}
