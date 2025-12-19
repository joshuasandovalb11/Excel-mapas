/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Order } from '../utils/orderUtils';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

export const fetchOrders = async (filters?: {
  fechaInicio?: string;
  fechaFin?: string;
  vend?: string;
}): Promise<Order[]> => {
  try {
    const params = new URLSearchParams();
    if (filters?.fechaInicio) params.append('fechaInicio', filters.fechaInicio);
    if (filters?.fechaFin) params.append('fechaFin', filters.fechaFin);
    if (filters?.vend) params.append('vend', filters.vend);

    const response = await fetch(
      `${API_URL}/pedidos/buscar?${params.toString()}`
    );

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`Error fetching orders: ${response.statusText}`);
    }

    const data = await response.json();

    return data.map((item: any) => ({
      pedidoId: String(item.PedidoID || item.pedidoId),
      fecha: String(item.Fecha || item.fecha).split('T')[0],
      clienteId: String(item.ClienteID || item.clienteId),
      nombreCliente: String(item.NombreCliente || item.nombreCliente),
      vend: String(item.Vend || item.vend),
      importeMN: Number(item.ImporteMN || item.importeMN || 0),
      importeUS: Number(item.ImporteUS || item.importeUS || 0),
      gpsCliente: item.GPSCliente || '',
      gpsCaptura: item.GPSCaptura || '',
      gpsEnvio: item.GPSEnvio || '',
      procedencia: item.Procedencia || '',
    }));
  } catch (error) {
    console.error('Error en fetchOrders:', error);
    throw error;
  }
};

export const syncOrdersToSQL = async (
  orders: Order[],
  onProgress?: (p: number) => void
): Promise<void> => {
  try {
    if (onProgress) onProgress(10);
    const response = await fetch(`${API_URL}/pedidos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orders),
    });
    if (onProgress) onProgress(80);
    if (!response.ok) throw new Error('Error al sincronizar pedidos');
    if (onProgress) onProgress(100);
    console.log('✅ Base de datos SQL actualizada correctamente. (PEDIDOS)');
  } catch (error) {
    console.error('Error syncing clients to SQL:', error);
    throw error;
  }
};
