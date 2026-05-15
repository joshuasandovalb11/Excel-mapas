import { ClockFading, X } from 'lucide-react';
import type { AppError } from '../../../utils/appError';

interface ToastErrorProps {
  error: AppError | null;
  isToastVisible: boolean;
  onClose: () => void;
}

export default function VehicleTrackerToastError({
  error,
  isToastVisible,
  onClose,
}: ToastErrorProps) {
  if (!error) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-lg shadow-[0_8px_30px_rgb(220,38,38,0.12)] flex items-center gap-3 max-w-md z-50 transition-all duration-500 ease-in-out ${isToastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className="bg-red-100 p-1.5 rounded-md">
        <ClockFading className="w-4 h-4 text-red-600" />
      </div>
      <div className="text-[13px] leading-tight">
        <p className="font-semibold">{error.title}</p>
        <p className="text-[12px] text-red-700/90 mt-0.5">{error.message}</p>
      </div>
      <button
        onClick={onClose}
        className="ml-auto text-red-400 hover:text-red-700 hover:bg-red-100 p-1 rounded-md transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
