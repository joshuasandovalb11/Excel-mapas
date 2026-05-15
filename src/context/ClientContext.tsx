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

type CachedClients = {
  data: Client[];
  fetchedAt: number;
} | null;

type CachedClientsValue = CachedClients | Client[];

const CLIENTS_CACHE_KEY = 'vt_sql_clients_v1';
const CLIENTS_TTL_MS = 12 * 60 * 60 * 1000;

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider = ({ children }: { children: ReactNode }) => {
  const [cachedClients, setCachedClients, cacheLoaded] =
    useIndexedDBState<CachedClientsValue>(CLIENTS_CACHE_KEY, null);
  const [masterClients, setMasterClients] = useState<Client[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const isCacheValid = useCallback((cache: CachedClients): boolean => {
    if (!cache) return false;
    if (!Array.isArray(cache.data) || cache.data.length === 0) return false;
    return Date.now() - cache.fetchedAt < CLIENTS_TTL_MS;
  }, []);

  const refreshClients = useCallback(
    async (force = false) => {
      if (
        !force &&
        cachedClients &&
        !Array.isArray(cachedClients) &&
        isCacheValid(cachedClients)
      ) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        console.log('📡 Contexto: Solicitando clientes al servidor...');
        const data = await fetchClientsFromSQL();
        if (data.length > 0) {
          const payload = { data, fetchedAt: Date.now() };
          setCachedClients(payload);
          setMasterClients(data);
        }
      } catch (err: any) {
        console.error(err);
        setError('Error al sincronizar clientes con el servidor.');
      } finally {
        setLoading(false);
      }
    },
    [cachedClients, isCacheValid, setCachedClients]
  );

  useEffect(() => {
    if (!cacheLoaded) return;

    if (cachedClients && !Array.isArray(cachedClients)) {
      if (isCacheValid(cachedClients)) {
        setMasterClients(cachedClients.data);
        return;
      }
    } else if (Array.isArray(cachedClients)) {
      setMasterClients(cachedClients);
      setCachedClients({ data: cachedClients, fetchedAt: 0 });
      return;
    } else if (cachedClients) {
      setCachedClients(null);
    }
    setMasterClients(null);
  }, [cacheLoaded, cachedClients, isCacheValid, setCachedClients]);

  useEffect(() => {
    if (!isInitialized && cacheLoaded) {
      const timer = setTimeout(() => {
        refreshClients();
        setIsInitialized(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cacheLoaded, isInitialized, refreshClients]);

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
