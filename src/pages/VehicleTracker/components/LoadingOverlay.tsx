import { Loader2 } from 'lucide-react';

export default function VehicleTrackerLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm transition-all duration-300">
      <div className="flex flex-col items-center bg-white p-8 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100">
        <Loader2 className="w-10 h-10 text-black animate-spin mb-4" />
        <p className="text-base font-semibold text-gray-900">
          Procesando información
        </p>
        <p className="text-xs text-gray-500 mt-1">Sincronizando sistema...</p>
      </div>
    </div>
  );
}
