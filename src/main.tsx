import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { GlobalUIProvider } from './context/GlobalUIContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'maps-query-cache',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 30 * 60 * 1000,
      }}
    >
      <GlobalUIProvider>
        <AuthProvider>
          {' '}
          {/* <--- Envuelve la app */}
          <App />
        </AuthProvider>
      </GlobalUIProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);
