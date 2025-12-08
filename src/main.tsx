import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
// Importa el AuthProvider
import { AuthProvider } from './context/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {' '}
      {/* <--- Envuelve la app */}
      <App />
    </AuthProvider>
  </StrictMode>
);
