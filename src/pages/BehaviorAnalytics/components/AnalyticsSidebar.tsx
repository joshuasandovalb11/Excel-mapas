import { BarChart3, Search, Minus, Plus, RotateCcw } from 'lucide-react';
import type { Vendor } from '../../../types/behavior.types';
import VendorSelector from './VendorSelector';
import AnalyticsDateRange from './AnalyticsDateRange';

interface AnalyticsSidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (val: boolean) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  selectedVendor: string;
  setSelectedVendor: (val: string) => void;
  minStopDuration: number;
  setMinStopDuration: (val: number | ((prev: number) => number)) => void;
  onAnalyze: () => void;
  onReset?: () => void;
  vendors: Vendor[];
  isLoadingVendors: boolean;
  availableDates: { fecha: string; totalRutas: number }[];
  isLoadingDates: boolean;
  isAnalyzing: boolean;
}

export default function AnalyticsSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  selectedVendor,
  setSelectedVendor,
  minStopDuration,
  setMinStopDuration,
  onAnalyze,
  onReset,
  vendors,
  isLoadingVendors,
  availableDates,
  isLoadingDates,
  isAnalyzing,
}: AnalyticsSidebarProps) {
  const canAnalyze =
    !!selectedVendor && !!startDate && !!endDate && !isAnalyzing;

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-[60px] 2xl:w-16' : 'w-[280px] 2xl:w-80'
      } bg-white border-r border-gray-200 shadow-sm transition-all duration-300 flex flex-col relative z-20 h-full`}
    >
      {/* Header */}
      <div className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 2xl:gap-2.5">
            <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
              <BarChart3 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
            </div>
            <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
              Patrón de Conducta
            </h1>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1 2xl:p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          <svg
            className={`w-4 h-4 2xl:w-5 2xl:h-5 transition-transform ${
              sidebarCollapsed ? 'rotate-180' : ''
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

      {!sidebarCollapsed ? (
        <>
          {/* Footer del Sidebar */}
          <div className="flex items-center gap-2 w-full mt-auto p-3 2xl:p-4 border-b border-gray-200 bg-white">
            <button
              onClick={onAnalyze}
              disabled={!canAnalyze}
              className={`w-7/8 flex items-center justify-center gap-2 py-2 2xl:py-2.5 rounded-md text-[11px] 2xl:text-[13px] font-semibold transition-all shadow-sm ${
                canAnalyze
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Search className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
              {isAnalyzing ? 'Analizando...' : 'Analizar'}
            </button>
            <button
              onClick={onReset}
              title="Reiniciar Filtros"
              className="w-1/8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 py-2 2xl:py-2.5 rounded-md transition-all border border-gray-200 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FAFAFA]">
            <div className="p-3 2xl:p-4 space-y-4 2xl:space-y-6">
              {/* Sección Fechas */}
              <div className="space-y-3">
                <AnalyticsDateRange
                  startDate={startDate}
                  setStartDate={setStartDate}
                  endDate={endDate}
                  setEndDate={setEndDate}
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
                  selectedVendor={selectedVendor}
                  setSelectedVendor={setSelectedVendor}
                  isLoading={isLoadingVendors}
                />
              </div>

              {/* Sección Algoritmo */}
              <div className="pt-4 2xl:pt-5 border-t border-gray-200 space-y-4 2xl:space-y-5">
                <h3 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Configuración
                </h3>
                <div>
                  <div className="flex justify-between items-center mb-1.5 2xl:mb-2">
                    <span className="text-[11px] 2xl:text-[12px] font-medium text-gray-700">
                      Parada Mínima
                    </span>
                    <span className="text-[10px] 2xl:text-[12px] font-semibold text-gray-900 bg-gray-100 px-1.5 2xl:px-2 py-0.5 rounded border border-gray-200">
                      {minStopDuration} min
                    </span>
                  </div>
                  <div className="flex items-center gap-2 2xl:gap-3">
                    <button
                      onClick={() =>
                        setMinStopDuration((p) => Math.max(1, p - 1))
                      }
                      className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-black hover:border-gray-300 transition-all"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={minStopDuration}
                      onChange={(e) =>
                        setMinStopDuration(Number(e.target.value))
                      }
                      className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <button
                      onClick={() =>
                        setMinStopDuration((p) => Math.min(60, p + 1))
                      }
                      className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-black hover:border-gray-300 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-6 2xl:py-8">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 2xl:p-3 py-16 2xl:py-20 bg-blue-50 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-colors group"
            title="Expandir panel"
          >
            <BarChart3 className="w-5 h-5 2xl:w-6 2xl:h-6 group-hover:scale-110 transition-transform animate-bounce" />
          </button>
        </div>
      )}
    </aside>
  );
}
