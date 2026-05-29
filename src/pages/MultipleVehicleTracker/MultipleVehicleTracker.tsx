import { useState } from 'react';
import { Download } from 'lucide-react';
import { useClients } from '../../context/ClientContext';
import { useViewQueryParams } from '../../hooks/useViewQueryParams';
import { useMultiRouteTracker } from './hooks/useMultiRouteTracker';
import MultiVehicleSidebar from './components/MultiVehicleSidebar';
import MultiInteractiveMap from '../../components/MultiInteractiveMap';
import EmptyState from '../../components/EmptyState';
import { generateMultiMapHTML } from '../../utils/multiMapUtils';
import type { VehicleInfo } from '../../utils/tripUtils';
import type { ProcessedTripV1 } from '../../types/route.types';

export interface MultiVehicleData {
  id: string;
  fileName: string;
  vehicleInfo: VehicleInfo;
  tripData: ProcessedTripV1;
  color: string;
}

const VEHICLE_COLORS = [
  '#007AFF', // Azul
  '#00A107', // Verde
  '#FF0000', // Rojo
  '#6200FF', // Morado
  '#FFAA00', // Amarillo
  '#FF00A3', // Rosa
  '#00D5FF', // Celeste
  '#FF4C00', // Naranja
  '#795548', // Café
  '#3F51B5', // Índigo
];

export default function MultipleVehicleTracker() {
  const { masterClients, loading: isLoadingClients, refreshClients } = useClients();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

  const { params, updateParams } = useViewQueryParams({
    mode: 'database',
    fecha: '',
    rutas: '',
    minStopDuration: '5',
    clientRadius: '50',
  });

  const routeIds = params.rutas
    ? params.rutas.split(',').map(Number).filter((id) => !isNaN(id))
    : [];
  const minStopDuration = Number(params.minStopDuration) || 5;

  const {
    loading,
    errors,
    availableDates,
    routesSummary,
    combinedTripData,
    processMultipleExcels,
    clearExcelData,
  } = useMultiRouteTracker({
    mode: params.mode as 'database' | 'excel',
    fecha: params.fecha,
    routeIds,
    minStopDuration,
  });

  const handleClearAll = () => {
    clearExcelData();
    updateParams({ mode: 'database', fecha: '', rutas: '' });
  };

  const mappedVehicles: MultiVehicleData[] = combinedTripData.map((trip, idx) => ({
    id: String(trip.idRuta || Math.random().toString(36).substring(7)),
    fileName: trip.source || 'Base de Datos',
    vehicleInfo: {
      fecha: trip.fecha,
      vendedor: trip.vendedor,
      nombreVendedor: trip.nombreVendedor,
      placa: trip.vehiculo,
      vehiculo: trip.descripcion,
      descripcion: trip.descripcion,
    },
    tripData: trip,
    color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
  }));

  const downloadMap = () => {
    if (mappedVehicles.length === 0) return;

    let dateStr = 'SinFecha';
    if (mappedVehicles[0]?.vehicleInfo?.fecha) {
      const dateObj = new Date(mappedVehicles[0].vehicleInfo.fecha + 'T12:00:00Z');
      if (!isNaN(dateObj.getTime())) {
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const anio = dateObj.getFullYear();
        dateStr = `${dia}-${mes}-${anio}`;
      } else {
        dateStr = mappedVehicles[0].vehicleInfo.fecha.replace(/\//g, '-');
      }
    }

    const htmlContent = generateMultiMapHTML(
      mappedVehicles,
      minStopDuration,
      googleMapsApiKey
    );

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa_multiple_${dateStr}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <MultiVehicleSidebar
        params={params}
        updateParams={updateParams}
        onClearAll={handleClearAll}
        availableDates={availableDates}
        routesSummary={routesSummary}
        loadingState={loading}
        errors={errors}
        processMultipleExcels={processMultipleExcels}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        hasClients={(masterClients || []).length > 0}
        isLoadingClients={isLoadingClients}
        onRefreshClients={refreshClients}
        hasTripData={combinedTripData.length > 0}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-12 2xl:h-14 bg-white border-b border-gray-200 px-4 2xl:px-6 flex items-center justify-between z-10 relative">
          <h2 className={`text-[13px] 2xl:text-[14px] font-semibold ${mappedVehicles.length > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
            {mappedVehicles.length > 0
              ? `Comparando ${mappedVehicles.length} vehículo(s)`
              : 'Selecciona rutas para comparar'}
          </h2>

          {mappedVehicles.length > 0 && (
            <button
              onClick={downloadMap}
              className="hidden sm:flex items-center text-xs 2xl:text-sm font-medium justify-center px-2.5 2xl:px-3 py-1.5 2xl:py-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-all cursor-pointer"
            >
              <Download className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 mr-1 2xl:mr-1.5" />
              Descargar Mapa
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {mappedVehicles.length > 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200">
              <MultiInteractiveMap
                vehicles={mappedVehicles}
                minStopDuration={minStopDuration}
                clientData={masterClients || []}
                googleMapsApiKey={googleMapsApiKey}
              />
            </div>
          ) : (
            <EmptyState
              title="No hay rutas seleccionadas"
              message="Usa el panel lateral para seleccionar rutas de la Base de Datos o subir archivos Excel."
              icon="Layers"
            />
          )}
        </div>
      </main>
    </div>
  );
}
