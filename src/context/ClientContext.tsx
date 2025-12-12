/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useIndexedDBState } from '../hooks/useIndexedDBState';
import { fetchClientsFromSQL } from '../services/clientService';
import type { Client } from '../utils/tripUtils';

interface ClientContextType {
  masterClients: Client[] | null;
  loading: boolean;
  error: string | null;
  refreshClients: (force?: boolean) => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider = ({ children }: { children: ReactNode }) => {
  const [masterClients, setMasterClients] = useIndexedDBState<Client[] | null>(
    'vt_sql_clients_v1',
    null
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const refreshClients = useCallback(
    async (force = false) => {
      if (!force && masterClients && masterClients.length > 0) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        console.log('📡 Contexto: Solicitando clientes al servidor...');
        const data = await fetchClientsFromSQL();
        if (data.length > 0) {
          setMasterClients(data);
        }
      } catch (err: any) {
        console.error(err);
        setError('Error al sincronizar clientes con el servidor.');
      } finally {
        setLoading(false);
      }
    },
    [masterClients, setMasterClients]
  );

  useEffect(() => {
    if (!isInitialized) {
      const timer = setTimeout(() => {
        refreshClients();
        setIsInitialized(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, refreshClients]);

  return (
    <ClientContext.Provider
      value={{ masterClients, loading, error, refreshClients }}
    >
      {children}
    </ClientContext.Provider>
  );
};

export const useClients = () => {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClients debe usarse dentro de un ClientProvider');
  }
  return context;
};
