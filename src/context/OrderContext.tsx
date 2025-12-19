/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { Order } from '../utils/orderUtils';
import { fetchOrders } from '../services/orderService';

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  error: string | null;
  refreshOrders: () => Promise<void>;
  lastUpdated: Date | null;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Cargando pedidos desde SQL Server...');
      const data = await fetchOrders();
      setOrders(data);
      setLastUpdated(new Date());
      console.log(`✅ ${data.length} pedidos cargados en memoria.`);
    } catch (err: any) {
      console.error(err);
      setError('Error al cargar la base de datos de pedidos.');
    } finally {
      setLoading(false);
    }
  };

  // Cargar automáticamente al iniciar la app
  useEffect(() => {
    loadOrders();
  }, []);

  return (
    <OrderContext.Provider
      value={{
        orders,
        loading,
        error,
        refreshOrders: loadOrders,
        lastUpdated,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrders debe usarse dentro de un OrderProvider');
  }
  return context;
};
