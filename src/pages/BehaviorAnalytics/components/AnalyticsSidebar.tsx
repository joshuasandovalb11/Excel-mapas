import { ChartNoAxesCombined, RotateCcw } from 'lucide-react';
import type { Vendor } from '../../../types/behavior.types';
import VendorSelector from './VendorSelector';
import AnalyticsDateRange from './AnalyticsDateRange';
import GlobalFilters from '../../../components/GlobalFilters';

interface AnalyticsSidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (val: boolean) => void;
  params: Record<string, string>;
  updateParams: (newValues: Record<string, string>) => void;
  onReset: () => void;
  vendors: Vendor[];
  isLoadingVendors: boolean;
  availableDates: { fecha: string; totalRutas: number }[];
  isLoadingDates: boolean;
}

export default function AnalyticsSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  params,
  updateParams,
  onReset,
  vendors,
  isLoadingVendors,
  availableDates,
  isLoadingDates,
}: AnalyticsSidebarProps) {
  const minStopDuration = Number(params.minStopDuration) || 5;

  return (
    <aside
      className={`${sidebarCollapsed ? 'w-[60px] 2xl:w-16' : 'w-[280px] 2xl:w-80'
        } bg-white border-r border-gray-200 shadow-sm transition-all duration-300 flex flex-col relative z-20 h-full`}
    >
      {/* Header */}
      <div className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 2xl:gap-2.5">
            <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
              <ChartNoAxesCombined className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
            </div>
            <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
              Patrón de Conducta
            </h1>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 2xl:p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg
              className={`w-4 h-4 2xl:w-5 2xl:h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''
                }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {!sidebarCollapsed ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Subheader de Filtros */}
          <div className="flex items-center justify-between px-3 2xl:px-4 py-2 2xl:py-2.5 border-b border-gray-200 bg-white shrink-0">
            <span className="text-[10px] 2xl:text-[11px] font-bold text-gray-900 uppercase tracking-wider">
              Filtros
            </span>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-[10px] 2xl:text-[11px] font-semibold text-gray-500 hover:text-red-600 transition-colors"
              title="Restablecer todos los filtros"
            >
              <RotateCcw className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
              Restablecer
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FAFAFA]">
            <div className="p-3 2xl:p-4 space-y-4 2xl:space-y-6">
              {/* Sección Fechas */}
              <div className="space-y-3">
                <AnalyticsDateRange
                  startDate={params.startDate || ''}
                  endDate={params.endDate || ''}
                  onChange={(start, end) => updateParams({ startDate: start, endDate: end })}
                  availableDates={availableDates}
                  isLoadingDates={isLoadingDates}
                />
              </div>

              {/* Sección Vendedor */}
              <div className="space-y-2">
                <h3 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Vendedor
                </h3>
                <VendorSelector
                  vendors={vendors}
                  selectedVendor={params.vendedor || ''}
                  onChange={(val) => updateParams({ vendedor: val })}
                  isLoading={isLoadingVendors}
                />
              </div>

              {/* Sección Algoritmo */}
              <div className="pt-4 2xl:pt-5 border-t border-gray-200 space-y-4 2xl:space-y-5">
                <h3 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Algoritmo de Detección
                </h3>
                <GlobalFilters
                  minStopDuration={minStopDuration}
                  onDurationChange={(val) => updateParams({ minStopDuration: val })}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-6 2xl:py-8">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 2xl:p-3 py-16 2xl:py-20 bg-blue-50 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-colors group"
            title="Expandir panel"
          >
            <ChartNoAxesCombined className="w-5 h-5 2xl:w-6 2xl:h-6 group-hover:scale-110 transition-transform animate-bounce" />
          </button>
        </div>
      )}
    </aside>
  );
}
