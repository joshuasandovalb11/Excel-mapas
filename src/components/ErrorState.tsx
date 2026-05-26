import { RefreshCcw } from 'lucide-react';
import type { AppError } from '../utils/appError';

interface ErrorStateProps {
  error: AppError;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export default function ErrorState({
  error,
  onRetry,
  isRetrying,
}: ErrorStateProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50 animate-fadeIn">
      <div className="text-center px-4">
        <h3 className="text-gray-900 font-bold text-[16px] tracking-tight">
          {error.title}
        </h3>
        <p className="text-red-600 text-[13px] font-medium mt-1.5 max-w-md mx-auto leading-relaxed">
          {error.message}
        </p>
        {error.action && (
          <p className="text-gray-500 text-[12px] mt-1 max-w-md mx-auto leading-relaxed">
            {error.action}
          </p>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-6 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-[12px] font-semibold rounded-lg hover:bg-gray-50 hover:text-black transition-all shadow-sm flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCcw
              className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin text-blue-600' : 'text-gray-400'}`}
            />
            {isRetrying ? 'Reintentando...' : 'Reintentar conexión'}
          </button>
        )}
      </div>
    </div>
  );
}
