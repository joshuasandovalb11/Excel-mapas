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

const CLIENTS_CACHE_KEY = 'vt_sql_clients_v1';
const CLIENTS_TTL_MS = 12 * 60 * 60 * 1000;

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider = ({ children }: { children: ReactNode }) => {
  const [masterClients, setMasterClients] = useState<Client[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const getCachedClients = (): CachedClients => {
    try {
      const item = localStorage.getItem(CLIENTS_CACHE_KEY);
      if (item) {
        return JSON.parse(item);
      }
    } catch (err) {
      console.warn('Error reading clients from localStorage', err);
    }
    return null;
  };

  const setCachedClients = (cache: CachedClients) => {
    try {
      localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
      console.warn('Error writing clients to localStorage', err);
    }
  };

  const isCacheValid = useCallback((cache: CachedClients): boolean => {
    if (!cache) return false;
    if (!Array.isArray(cache.data) || cache.data.length === 0) return false;
    return Date.now() - cache.fetchedAt < CLIENTS_TTL_MS;
  }, []);

  const refreshClients = useCallback(
    async (force = false) => {
      const cache = getCachedClients();
      
      if (!force && cache && isCacheValid(cache)) {
        setMasterClients(cache.data);
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
    [isCacheValid]
  );

  useEffect(() => {
    if (!isInitialized) {
      const cache = getCachedClients();
      if (cache && isCacheValid(cache)) {
        setMasterClients(cache.data);
      } else {
        refreshClients();
      }
      setIsInitialized(true);
    }
  }, [isInitialized, isCacheValid, refreshClients]);

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
