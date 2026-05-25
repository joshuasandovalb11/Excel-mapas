import { useState, useEffect } from 'react';
import { Loader2, BarChart3, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import BehaviorHeader from './components/BehaviorHeader';
import AnalyticsSidebar from './components/AnalyticsSidebar';
import KPIGrid from './components/KPIGrid';
import BehaviorCharts from './components/BehaviorCharts';
import DateCarousel from './components/DateCarousel';
import DailyParadasTable from './components/DailyParadasTable';
import { useVendorsCatalog } from './hooks/useVendorsCatalog';
import { useBehaviorData } from './hooks/useBehaviorData';
import { fetchAvailableDates } from '../../services/apiRutas';
import type { FetchBehaviorParams } from '../../services/apiBehavior';
import { formatName } from '../../utils/tripUtils';

export default function BehaviorAnalytics() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [minStopDuration, setMinStopDuration] = useState(5);
  const [queryParams, setQueryParams] = useState<FetchBehaviorParams | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<string>('');

  const { data: vendors = [], isLoading: isLoadingVendors } =
    useVendorsCatalog();

  const { data: availableDates = [], isLoading: isLoadingDates } = useQuery({
    queryKey: ['availableDates'],
    queryFn: ({ signal }) => fetchAvailableDates(signal),
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: analyticsData,
    isLoading: isAnalyzing,
    isFetching,
    error,
  } = useBehaviorData(queryParams);

  useEffect(() => {
    if (analyticsData?.dailyBreakdown?.[0]?.fecha) {
      setSelectedDate(analyticsData.dailyBreakdown[0].fecha);
    }
  }, [analyticsData]);

  const handleAnalyze = () => {
    if (!startDate || !endDate || !selectedVendor) return;

    setQueryParams({
      vendedor: selectedVendor,
      startDate,
      endDate,
      minStopDuration,
    });
  };

  const handleReset = () => {
    setQueryParams(null);
    setStartDate('');
    setEndDate('');
    setSelectedVendor('');
    setMinStopDuration(5);
    setSelectedDate('');
  };

  const isDataLoading = isAnalyzing || isFetching;

  const selectedDayData = analyticsData?.dailyBreakdown?.find(
    (day) => day.fecha === selectedDate
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar de Filtros */}
      <AnalyticsSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        selectedVendor={selectedVendor}
        setSelectedVendor={setSelectedVendor}
        minStopDuration={minStopDuration}
        setMinStopDuration={setMinStopDuration}
        onAnalyze={handleAnalyze}
        onReset={handleReset}
        vendors={vendors}
        isLoadingVendors={isLoadingVendors}
        availableDates={availableDates}
        isLoadingDates={isLoadingDates}
        isAnalyzing={isDataLoading}
      />

      {/* Área de Contenido Principal */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        <BehaviorHeader
          vendedorName={
            analyticsData
              ? `[${selectedVendor}] ${formatName(analyticsData.vendedor)}`
              : ''
          }
          startDate={analyticsData?.rango?.start || '--'}
          endDate={analyticsData?.rango?.end || '--'}
          workSchedule="08:30 am - 05:30 pm"
        />

        <div className="flex-1 overflow-y-auto p-4 2xl:p-6 bg-[#FAFAFA]">
          {isDataLoading ? (
            // Estado de Carga
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex-1 flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-sm 2xl:text-base font-medium text-gray-600">
                  Analizando patrones de conducta...
                </p>
              </div>
            </div>
          ) : error ? (
            // Estado de Error
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="p-3 bg-red-100 rounded-full mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Error en el análisis
                </h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Hubo un problema al procesar los datos del vendedor. Por
                  favor, verifica los filtros e intenta de nuevo.
                </p>
              </div>
            </div>
          ) : analyticsData && analyticsData.globalSummary === null ? (
            // Estado Vacío (Sin actividad)
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                <div className="text-gray-400 mb-4 bg-gray-100 p-4 rounded-full">
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg 2xl:text-xl font-bold text-gray-900">
                  Sin actividad
                </h3>
                <p className="text-sm 2xl:text-base text-gray-500 mt-2 max-w-sm">
                  El vendedor seleccionado no tiene rutas registradas en este
                  rango de fechas.
                </p>
              </div>
            </div>
          ) : analyticsData ? (
            // Vista de Datos (Dashboard)
            <>
              <KPIGrid summary={analyticsData.globalSummary} />

              <BehaviorCharts data={analyticsData.dailyBreakdown} />

              {/* Desglose Diario Detallado */}
              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-center">
                  <h3 className="text-[11px] 2xl:text-[13px] font-bold text-gray-700 mb-4 uppercase tracking-wider">
                    Desglose Diario Detallado
                  </h3>
                </div>

                <DateCarousel
                  data={analyticsData.dailyBreakdown}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />

                <div className="mt-2">
                  <DailyParadasTable
                    paradas={selectedDayData?.paradasDetalladas || []}
                  />
                </div>
              </div>
            </>
          ) : (
            // Empty State (Vista inicial)
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-white border-2 border-gray-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm transform">
                  <BarChart3 className="w-7 h-7 text-gray-400" />
                </div>
                <h2 className="text-[16px] 2xl:text-xl font-bold text-gray-800 mb-2">
                  Ajuste los filtros para comenzar
                </h2>
                <p className="text-[13px] 2xl:text-base text-gray-500 max-w-md">
                  Seleccione un vendedor y un rango de fechas en el panel
                  lateral, luego haga clic en "Analizar" para visualizar el
                  patrón de conducta.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
