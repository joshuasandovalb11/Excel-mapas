import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClockFading, X } from 'lucide-react';
import { GlobalUIContext, type GlobalUIContextValue } from './globalUIStore';
import { Toaster, toast } from 'sonner';
import LoadingLayer from '../components/LoadingLayer';
import type { AppError } from '../utils/appError';

export function GlobalUIProvider({ children }: { children: React.ReactNode }) {
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingKeys((prev) => {
      const next = new Set(prev);
      if (isLoading) next.add(key);
      else next.delete(key);
      return Array.from(next);
    });
  }, []);

  const showError = useCallback(
    (
      error: AppError,
      options?: { durationMs?: number; onClose?: () => void }
    ) => {
      const duration = options?.durationMs ?? 5000;
      if (timerRef.current) window.clearTimeout(timerRef.current);

      toast.custom(
        (t) => (
          <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-lg shadow-[0_8px_30px_rgb(220,38,38,0.12)] flex items-center gap-3 w-[360px] max-w-full">
            <div className="bg-red-100 p-1.5 rounded-md">
              <ClockFading className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-[13px] leading-tight">
              <p className="font-semibold">{error.title}</p>
              <p className="text-[12px] text-red-700/90 mt-0.5">
                {error.message}
              </p>
              {error.action && (
                <p className="text-[11px] text-red-700/80 mt-1">
                  {error.action}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (timerRef.current) window.clearTimeout(timerRef.current);
                toast.dismiss(t);
                if (options?.onClose) options.onClose();
              }}
              className="ml-auto text-red-400 hover:text-red-700 hover:bg-red-100 p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ),
        { duration }
      );

      timerRef.current = window.setTimeout(() => {
        if (options?.onClose) options.onClose();
      }, duration);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const value: GlobalUIContextValue = useMemo(
    () => ({ setLoading, showError }),
    [setLoading, showError]
  );

  const isLoading = loadingKeys.length > 0;

  return (
    <GlobalUIContext.Provider value={value}>
      {children}

      {isLoading && (
        <LoadingLayer
          variant="fixed"
          spinnerSizeClass="w-16 h-16"
          spinnerClassName="text-blue-600"
        />
      )}
      <Toaster position="bottom-right" theme="light" />
    </GlobalUIContext.Provider>
  );
}
