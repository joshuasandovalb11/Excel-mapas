import type { Client } from '../utils/tripUtils';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

/**
 * OBTENER CLIENTES (GET)
 */
export const fetchClientsFromSQL = async (): Promise<Client[]> => {
  try {
    console.log('🌐 Conectando con el Servidor SQL a través del puente...');

    const response = await fetch(`${API_BASE_URL}/clientes`);

    if (!response.ok) {
      throw new Error(
        `Error al obtener clientes: ${response.status} ${response.statusText}`
      );
    }

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

    const response = await fetch(`${API_BASE_URL}/clientes/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clients),
    });

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
