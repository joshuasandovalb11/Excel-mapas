import { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  BarChart3,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import BehaviorHeader from './components/BehaviorHeader';
import AnalyticsSidebar from './components/AnalyticsSidebar';
import KPIGrid from './components/KPIGrid';
import BehaviorCharts from './components/BehaviorCharts';
import DateCarousel from './components/DateCarousel';
import DailyParadasTable from './components/DailyParadasTable';
import TimeBlockCalendar from './components/TimeBlockCalendar';
import ErrorState from '../../components/ErrorState';
import { useVendorsCatalog } from './hooks/useVendorsCatalog';
import { useBehaviorData } from './hooks/useBehaviorData';
import { fetchAvailableDates } from '../../services/apiRutas';
import type { FetchBehaviorParams } from '../../services/apiBehavior';
import { formatName } from '../../utils/tripUtils';
import { useGlobalUI } from '../../context/globalUIStore';
import { toAppErrorSync } from '../../utils/appError';
import { useViewQueryParams } from '../../hooks/useViewQueryParams';

const DEFAULT_MIN_STOP = "5";

export default function BehaviorAnalytics() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');

  const { showError } = useGlobalUI();

  // 1. Live Filtering y Sparse URLs
  const { params, updateParams } = useViewQueryParams({
    vendedor: "",
    startDate: "",
    endDate: "",
    minStopDuration: DEFAULT_MIN_STOP
  });

  // 2. Parseo estricto para TanStack Query
  const queryParams = useMemo<FetchBehaviorParams | null>(() => {
    if (!params.vendedor || !params.startDate || !params.endDate) return null;

    return {
      vendedor: params.vendedor,
      startDate: params.startDate,
      endDate: params.endDate,
      minStopDuration: parseInt(params.minStopDuration, 10) || 5
    };
  }, [params]);

  const {
    data: vendors = [],
    isLoading: isLoadingVendors,
    error: vendorsError,
  } = useVendorsCatalog();

  const {
    data: availableDates = [],
    isLoading: isLoadingDates,
    error: datesError,
  } = useQuery({
    queryKey: ['availableDates'],
    queryFn: ({ signal }) => fetchAvailableDates(signal),
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: analyticsData,
    isLoading: isAnalyzing,
    isFetching,
    error,
    refetch,
  } = useBehaviorData(queryParams);

  useEffect(() => {
    if (vendorsError) {
      showError(
        toAppErrorSync(vendorsError, {
          title: 'Error de catálogo',
          message: 'No fue posible obtener el catálogo de vendedores.',
        })
      );
    }
  }, [vendorsError, showError]);

  useEffect(() => {
    if (datesError) {
      showError(
        toAppErrorSync(datesError, {
          title: 'Error de fechas',
          message: 'No fue posible obtener las fechas disponibles.',
        })
      );
    }
  }, [datesError, showError]);

  useEffect(() => {
    if (analyticsData?.dailyBreakdown?.[0]?.fecha) {
      setSelectedDate(analyticsData.dailyBreakdown[0].fecha);
    }
  }, [analyticsData]);

  // Delegado al Sidebar
  const handleReset = () => {
    updateParams({
      vendedor: "",
      startDate: "",
      endDate: "",
      minStopDuration: DEFAULT_MIN_STOP
    });
    setSelectedDate('');
  };

  const isDataLoading = isAnalyzing || isFetching;

  const selectedDayData = analyticsData?.dailyBreakdown?.find(
    (day) => day.fecha === selectedDate
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar de Filtros (Nuevas Props) */}
      <AnalyticsSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        params={params}
        updateParams={updateParams}
        onReset={handleReset}
        vendors={vendors}
        isLoadingVendors={isLoadingVendors}
        availableDates={availableDates}
        isLoadingDates={isLoadingDates}
      />

      {/* Área de Contenido Principal */}
      <main className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
        <BehaviorHeader
          vendedorName={
            analyticsData && queryParams
              ? `[${queryParams.vendedor}] ${formatName(analyticsData.vendedor)}`
              : ''
          }
          startDate={analyticsData?.rango?.start || '--'}
          endDate={analyticsData?.rango?.end || '--'}
          workSchedule="08:30 am - 05:30 pm"
        />

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 2xl:p-6 bg-[#FAFAFA]">
          {isDataLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex-1 flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-sm 2xl:text-base font-medium text-gray-600">
                  Analizando patrones de conducta...
                </p>
              </div>
            </div>
          ) : error ? (
            <ErrorState
              error={toAppErrorSync(error, {
                title: 'Error en el análisis',
                message: 'No fue posible procesar los datos del análisis.',
              })}
              onRetry={refetch}
              isRetrying={isFetching}
            />
          ) : analyticsData && analyticsData.globalSummary === null ? (
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
            <>
              <KPIGrid summary={analyticsData.globalSummary} />
              <BehaviorCharts data={analyticsData.dailyBreakdown} />

              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                  <h3 className="text-[11px] 2xl:text-[13px] font-bold text-gray-700 uppercase tracking-wider">
                    Desglose Diario Detallado
                  </h3>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shadow-sm">
                    <button
                      onClick={() => setViewMode('calendar')}
                      className={`flex items-center gap-2 px-4 py-1.5 text-[11px] 2xl:text-[12px] font-bold rounded-lg transition-all ${viewMode === 'calendar'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Mapa de Tiempo
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-2 px-4 py-1.5 text-[11px] 2xl:text-[12px] font-bold rounded-lg transition-all ${viewMode === 'table'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      Tabla de Paradas
                    </button>
                  </div>
                </div>

                {viewMode === 'calendar' ? (
                  <TimeBlockCalendar daysData={analyticsData.dailyBreakdown} />
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </>
          ) : (
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
                  lateral para visualizar el patrón de conducta.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
