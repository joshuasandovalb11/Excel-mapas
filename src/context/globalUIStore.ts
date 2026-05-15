import { createContext, useContext } from 'react';
import type { AppError } from '../utils/appError';

export interface GlobalUIContextValue {
  setLoading: (key: string, isLoading: boolean) => void;
  showError: (
    error: AppError,
    options?: { durationMs?: number; onClose?: () => void }
  ) => void;
}

export const GlobalUIContext = createContext<GlobalUIContextValue | undefined>(
  undefined
);

export function useGlobalUI() {
  const context = useContext(GlobalUIContext);
  if (!context) {
    throw new Error('useGlobalUI must be used within GlobalUIProvider');
  }
  return context;
}
