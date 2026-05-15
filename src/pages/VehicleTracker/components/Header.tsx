import { ChartBar, Download, ExternalLink } from 'lucide-react';
import { formatExcelDate } from '../../../utils/reportUtils';
import type { ProcessedTripV1 } from '../../../types/route.types';

interface HeaderProps {
  tripData: ProcessedTripV1 | null;
  isGeneratingReport: boolean;
  onDownloadReport: () => void;
  onOpenMapInTab: () => void;
  onDownloadMap: () => void;
}

export default function VehicleTrackerHeader({
  tripData,
  isGeneratingReport,
  onDownloadReport,
  onOpenMapInTab,
  onDownloadMap,
}: HeaderProps) {
  if (!tripData) {
    return (
      <div className="h-12 2xl:h-14 bg-white border-b border-gray-200 px-4 2xl:px-6 flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300">
        <h2 className="text-[13px] 2xl:text-[14px] font-semibold text-gray-400">
          Selecciona una ruta para comenzar
        </h2>
      </div>
    );
  }

  const sellerInfo = tripData.vendedor
    ? `[${tripData.vendedor}] ${tripData.nombreVendedor}`
    : tripData.nombreVendedor || 'Vendedor no asignado';

  const dateInfo = formatExcelDate(tripData.fecha);

  const vehicleInfo = tripData.descripcion
    ? `${tripData.descripcion} (${tripData.vehiculo})`
    : tripData.vehiculo;

  return (
    <div className="h-12 2xl:h-14 bg-white border-b border-gray-200 px-4 2xl:px-6 flex items-center justify-between z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300">
      <div className="flex flex-col justify-center overflow-hidden">
        <h2 className="text-[12px] 2xl:text-[13px] font-bold text-gray-900 truncate tracking-tight">
          {sellerInfo} — {dateInfo}
        </h2>
        <span className="text-[10px] 2xl:text-[11px] text-gray-500 font-medium truncate">
          Vehículo: {vehicleInfo}
        </span>
      </div>

      <div className="flex items-center gap-1.5 2xl:gap-2">
        <button
          onClick={onDownloadReport}
          disabled={isGeneratingReport}
          className="flex items-center text-xs 2xl:text-sm justify-center font-medium px-2.5 2xl:px-3 py-1.5 2xl:py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-all disabled:bg-gray-200 disabled:text-gray-400"
        >
          <ChartBar className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 mr-1 2xl:mr-1.5" />
          {isGeneratingReport ? 'Generando...' : 'Generar Reporte'}
        </button>

        <button
          onClick={onOpenMapInTab}
          className="flex sm:hidden items-center justify-center font-medium px-2.5 2xl:px-3 py-1.5 2xl:py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-md shadow-sm transition-all"
        >
          <ExternalLink className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
        </button>

        <button
          onClick={onDownloadMap}
          className="hidden sm:flex items-center text-xs 2xl:text-sm font-medium justify-center px-2.5 2xl:px-3 py-1.5 2xl:py-2 bg-green-500 text-white hover:bg-green-600 rounded-md transition-all"
        >
          <Download className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 mr-1 2xl:mr-1.5" />{' '}
          Descargar Mapa
        </button>
      </div>
    </div>
  );
}
