import type { Client } from '../utils/tripUtils';
import { fetchWithTimeout } from './httpClient';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

/**
 * OBTENER CLIENTES (GET)
 */
export const fetchClientsFromSQL = async (
  signal?: AbortSignal
): Promise<Client[]> => {
  try {
    console.log('🌐 Conectando con el Servidor SQL a través del puente...');

    const response = await fetchWithTimeout(`${API_BASE_URL}/clientes`, {
      method: 'GET',
      signal,
      timeoutMs: 20000,
      retries: 2,
      backoffMs: 200,
    });

    const clients: Client[] = await response.json();
    console.log(`✅ Datos recibidos: ${clients.length} clientes activos.`);
    return clients;
  } catch (error) {
    console.error('Error crítico obteniendo clientes:', error);
    throw error;
  }
};

/**
 * SINCRONIZAR CLIENTES (POST)
 */
export const syncClientsToSQL = async (
  clients: Client[],
  onProgress?: (percent: number) => void
): Promise<void> => {
  try {
    if (onProgress) onProgress(10);

    console.log(`📤 Enviando datos a: ${API_BASE_URL}/clientes/sync`);

    const response = (await fetchWithTimeout(`${API_BASE_URL}/clientes/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clients),
      timeoutMs: 60000,
      retries: 1,
      backoffMs: 400,
    })) as Response;

    if (onProgress) onProgress(80);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || errorData.error || `Error HTTP: ${response.status}`
      );
    }

    if (onProgress) onProgress(100);
    console.log('✅ Base de datos SQL actualizada correctamente.');
  } catch (error) {
    console.error('Error syncing clients to SQL:', error);
    throw error;
  }
};
