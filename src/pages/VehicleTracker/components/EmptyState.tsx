import { Map as MapIcon } from 'lucide-react';

export default function VehicleTrackerEmptyState() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-white border border-gray-200 shadow-sm rounded-2xl flex items-center justify-center mx-auto mb-5 transform rotate-12">
          <MapIcon className="w-7 h-7 text-gray-300" />
        </div>
        <h3 className="text-gray-900 font-bold text-[16px] tracking-tight">
          Ningún viaje seleccionado
        </h3>
        <p className="text-gray-500 text-[13px] mt-1.5 max-w-sm mx-auto leading-relaxed">
          Utiliza el panel lateral para elegir una fecha de la base de datos o
          subir un archivo de GPS.
        </p>
      </div>
    </div>
  );
}
