import { useMemo } from 'react';
import {
  Upload,
  Truck,
  Minus,
  Plus,
  RefreshCw,
  Database,
  Map as MapIcon,
} from 'lucide-react';
import RouteDatePicker from '../../../components/DatePicker';
import RouteSelector from '../../../components/RouteSelector';
import type { FechaDisponible, RutaResumen } from '../../../types/route.types';
import LoadingLayer from '../../../components/LoadingLayer';
import type { AppError } from '../../../utils/appError';

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingClients: boolean;
  hasClients: boolean;
  onRefreshClients: () => void;
  mode: 'database' | 'excel';
  setMode: React.Dispatch<React.SetStateAction<'database' | 'excel'>>;
  clearData: () => void;
  availableDates: FechaDisponible[];
  selectedDate: string | null;
  setSelectedDate: React.Dispatch<React.SetStateAction<string | null>>;
  loadingDates: boolean;
  loadingRoutesSummary: boolean;
  loadingRouteDetail: boolean;
  loadingExcel: boolean;
  errors: {
    dates: AppError | null;
    routesSummary: AppError | null;
    routeDetail: AppError | null;
    excel: AppError | null;
  };
  loadAvailableDates: () => Promise<void>;
  lastSummaryRequest: { fecha: string; vendedor?: string } | null;
  clearError: (
    scope: 'dates' | 'routesSummary' | 'routeDetail' | 'excel'
  ) => void;
  loadRoutesSummary: (fecha: string, vendedor?: string) => Promise<void>;
  routesSummary: RutaResumen[];
  selectedRouteId: number | null;
  loadRouteDetail: (idRuta: number, minStopDuration: number) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  availableVendors: string[];
  onSelection: (selected: string) => void;
  selection: { mode: 'vendor' | 'driver'; value: string | null };
  minStopDuration: number;
  setMinStopDuration: React.Dispatch<React.SetStateAction<number>>;
  clientRadius: number;
  setClientRadius: React.Dispatch<React.SetStateAction<number>>;
  hasTripData: boolean;
  uploadedFileName: string | null;
}

export default function VehicleTrackerSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  isLoadingClients,
  hasClients,
  onRefreshClients,
  mode,
  setMode,
  clearData,
  availableDates,
  selectedDate,
  setSelectedDate,
  loadingDates,
  loadingRoutesSummary,
  loadingRouteDetail,
  loadingExcel,
  errors,
  loadAvailableDates,
  lastSummaryRequest,
  loadRoutesSummary,
  routesSummary,
  selectedRouteId,
  loadRouteDetail,
  fileInputRef,
  onFileUpload,
  availableVendors,
  onSelection,
  selection,
  minStopDuration,
  setMinStopDuration,
  clientRadius,
  setClientRadius,
  hasTripData,
  uploadedFileName,
}: SidebarProps) {
  const hasVendors = useMemo(
    () => availableVendors.length > 0,
    [availableVendors.length]
  );

  const canRetryRoutes = Boolean(lastSummaryRequest);
  const showDatesError = Boolean(errors.dates);
  const showRoutesError = Boolean(errors.routesSummary);

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-[60px] 2xl:w-16' : 'w-[280px] 2xl:w-80'
      } bg-white border-r border-gray-200 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 flex flex-col relative z-20`}
    >
      <div className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 2xl:gap-2.5">
            <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
              <MapIcon className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
            </div>
            <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
              Visualizador de Rutas
            </h1>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1 2xl:p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
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

      {!sidebarCollapsed && (
        <>
          {!isLoadingClients && !hasClients ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 2xl:p-6 text-center space-y-3 2xl:space-y-4">
              <div className="w-10 h-10 2xl:w-12 2xl:h-12 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center shadow-sm">
                <Database className="w-4 h-4 2xl:w-5 2xl:h-5 text-gray-400" />
              </div>
              <div>
                <h3 className="text-xs 2xl:text-sm font-semibold text-gray-900">
                  Sin Conexión
                </h3>
                <p className="text-[10px] 2xl:text-xs text-gray-500 mt-1">
                  No se detecta la base de datos.
                </p>
              </div>
              <button
                onClick={onRefreshClients}
                className="flex items-center gap-1.5 2xl:gap-2 px-3 2xl:px-4 py-1.5 2xl:py-2 bg-black text-white text-[10px] 2xl:text-xs rounded-md hover:bg-gray-800 transition-colors font-medium shadow-sm"
              >
                <RefreshCw className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" /> Recargar
                Sistema
              </button>
            </div>
          ) : (
            <>
              <div className="flex border-b border-gray-200 bg-white">
                <button
                  onClick={() => setMode('database')}
                  className={`flex-1 py-2 2xl:py-3 text-[11px] 2xl:text-[13px] font-medium border-b-2 transition-all ${
                    mode === 'database'
                      ? 'border-blue-600 bg-white text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Base de Datos
                </button>
                <button
                  onClick={() => setMode('excel')}
                  className={`flex-1 py-2 2xl:py-3 text-[11px] 2xl:text-[13px] font-medium border-b-2 transition-all ${
                    mode === 'excel'
                      ? 'border-blue-600 bg-white text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Manual
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FAFAFA]">
                <div className="p-3 2xl:p-4 space-y-4 2xl:space-y-6">
                  {mode === 'database' && (
                    <div className="space-y-3 2xl:space-y-4 animate-fadeIn">
                      <div className="relative">
                        {showDatesError ? (
                          <div className="h-[200px] 2xl:h-[220px] flex flex-col items-center justify-center text-center bg-red-50 border border-red-200 rounded-lg px-3 2xl:px-4">
                            <p className="text-[11px] 2xl:text-[12px] font-semibold text-red-700">
                              No se pudieron cargar las fechas.
                            </p>
                            <p className="text-[10px] 2xl:text-[11px] text-red-600 mt-1">
                              {errors.dates?.message || errors.dates?.title}
                            </p>
                            <div className="mt-2 2xl:mt-3 flex items-center">
                              <button
                                onClick={loadAvailableDates}
                                className="px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10px] 2xl:text-[11px] font-medium rounded-md border border-red-200 text-red-700 hover:bg-red-100"
                              >
                                Reintentar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 mb-2 2xl:mb-2.5">
                              <h4 className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                Fechas Disponibles
                              </h4>
                            </div>
                            <RouteDatePicker
                              availableDates={availableDates}
                              selectedDate={selectedDate}
                              disabled={loadingDates || loadingRoutesSummary}
                              onSelectDate={(date) => {
                                if (loadingDates || loadingRoutesSummary)
                                  return;
                                setSelectedDate(date);
                                loadRoutesSummary(date);
                              }}
                            />
                          </>
                        )}
                        {loadingDates && (
                          <LoadingLayer
                            variant="absolute"
                            spinnerSizeClass="w-8 h-8 2xl:w-10 2xl:h-10"
                            spinnerClassName="text-blue-600"
                            className="bg-white/70 backdrop-blur-sm"
                          />
                        )}
                      </div>
                      <div className="relative">
                        {showDatesError ? (
                          <div className="h-[180px] 2xl:h-[200px] flex flex-col items-center justify-center text-center bg-gray-50 border border-gray-200 rounded-lg px-3 2xl:px-4">
                            <p className="text-[11px] 2xl:text-[12px] font-semibold text-gray-700">
                              Las rutas estarán disponibles cuando se carguen
                              las fechas.
                            </p>
                            <p className="text-[10px] 2xl:text-[11px] text-gray-500 mt-1">
                              Reintenta la carga de fechas para continuar.
                            </p>
                          </div>
                        ) : showRoutesError ? (
                          <div className="h-[180px] 2xl:h-[200px] flex flex-col items-center justify-center text-center bg-red-50 border border-red-200 rounded-lg px-3 2xl:px-4">
                            <p className="text-[11px] 2xl:text-[12px] font-semibold text-red-700">
                              No se pudieron cargar las rutas.
                            </p>
                            <p className="text-[10px] 2xl:text-[11px] text-red-600 mt-1">
                              {errors.routesSummary?.message ||
                                errors.routesSummary?.title}
                            </p>
                            <div className="mt-2 2xl:mt-3 flex items-center">
                              <button
                                onClick={() =>
                                  lastSummaryRequest &&
                                  loadRoutesSummary(
                                    lastSummaryRequest.fecha,
                                    lastSummaryRequest.vendedor
                                  )
                                }
                                disabled={!canRetryRoutes}
                                className="px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10px] 2xl:text-[11px] font-medium rounded-md border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                Reintentar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <RouteSelector
                            routes={routesSummary}
                            selectedRouteId={selectedRouteId}
                            selectedDate={selectedDate}
                            isLoading={
                              loadingRoutesSummary || loadingRouteDetail
                            }
                            onSelectRoute={(id) =>
                              !loadingRoutesSummary &&
                              !loadingRouteDetail &&
                              loadRouteDetail(id, minStopDuration)
                            }
                          />
                        )}
                        {loadingRoutesSummary && (
                          <LoadingLayer
                            variant="absolute"
                            spinnerSizeClass="w-8 h-8 2xl:w-10 2xl:h-10"
                            spinnerClassName="text-blue-600"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {mode === 'excel' && (
                    <div className="space-y-4 2xl:space-y-5 animate-fadeIn">
                      <div className="relative">
                        {errors.excel ? (
                          <div className="h-[140px] 2xl:h-[160px] flex flex-col items-center justify-center text-center bg-red-50 border border-red-200 rounded-lg px-3 2xl:px-4">
                            <p className="text-[11px] 2xl:text-[12px] font-semibold text-red-700">
                              No se pudo procesar el archivo.
                            </p>
                            <p className="text-[10px] 2xl:text-[11px] text-red-600 mt-1">
                              {errors.excel?.message || errors.excel?.title}
                            </p>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="mt-2 2xl:mt-3 px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10px] 2xl:text-[11px] font-medium rounded-md border border-red-200 text-red-700 hover:bg-red-100"
                            >
                              Reintentar
                            </button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              className="hidden"
                              onChange={onFileUpload}
                              accept=".xlsx, .xls"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mb-2 2xl:mb-2.5">
                              <label className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                Subir Archivo
                              </label>
                              {hasTripData && (
                                <button
                                  onClick={clearData}
                                  className="text-[10px] 2xl:text-[11px] font-medium text-red-600 hover:text-red-700"
                                >
                                  Limpiar
                                </button>
                              )}
                            </div>
                            <label className="flex flex-col items-center justify-center w-full h-20 2xl:h-24 border border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-blue-50 hover:border-blue-500 transition-colors shadow-sm">
                              <Upload className="w-4 h-4 2xl:w-5 2xl:h-5 mb-1 2xl:mb-1.5 text-blue-600 animate-bounce" />
                              {hasTripData ? (
                                <p className="text-[10px] 2xl:text-[11px] font-medium text-blue-600 truncate px-3 2xl:px-4 w-full text-center">
                                  {uploadedFileName || 'Archivo cargado'}
                                </p>
                              ) : (
                                <p className="text-[11px] 2xl:text-[12px] text-gray-500 font-medium">
                                  Click para seleccionar EXCEL
                                </p>
                              )}
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={onFileUpload}
                                accept=".xlsx, .xls"
                              />
                            </label>
                          </>
                        )}
                        {loadingExcel && (
                          <LoadingLayer
                            variant="absolute"
                            spinnerSizeClass="w-8 h-8 2xl:w-10 2xl:h-10"
                            spinnerClassName="text-blue-600"
                            className="bg-white/70 backdrop-blur-sm"
                          />
                        )}
                      </div>

                      {hasVendors && (
                        <div>
                          <div className="mb-2 2xl:mb-2.5">
                            <label className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider items-center">
                              Vendedor Asignado
                            </label>
                          </div>
                          <div className="flex flex-wrap gap-1 2xl:gap-1.5">
                            {availableVendors.map((vendor) => (
                              <button
                                key={vendor}
                                onClick={() => onSelection(vendor)}
                                disabled={loadingExcel}
                                className={`px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10px] 2xl:text-[11px] font-medium rounded-md transition-all duration-200 border ${
                                  selection.value === vendor
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm'
                                }`}
                              >
                                {vendor}
                              </button>
                            ))}
                            <button
                              onClick={() => onSelection('chofer')}
                              disabled={loadingExcel}
                              className={`px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10px] 2xl:text-[11px] font-medium rounded-md transition-all duration-200 border flex items-center gap-1 2xl:gap-1.5 shadow-sm ${
                                selection.value === 'chofer'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <Truck className="w-3 h-3" /> Chofer Libre
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-4 2xl:pt-5 border-t border-gray-200 space-y-4 2xl:space-y-5">
                    <h3 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Algoritmo de Detección
                    </h3>

                    <div>
                      <div className="flex justify-between items-center mb-1.5 2xl:mb-2">
                        <span className="text-[11px] 2xl:text-[12px] font-medium text-gray-700">
                          Duración Mínima (Stop)
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
                            setMinStopDuration((p) => Math.min(120, p + 1))
                          }
                          className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-black hover:border-gray-300 transition-all"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5 2xl:mb-2">
                        <span className="text-[11px] 2xl:text-[12px] font-medium text-gray-700">
                          Radio de Coincidencia
                        </span>
                        <span className="text-[10px] 2xl:text-[12px] font-semibold text-gray-900 bg-gray-100 px-1.5 2xl:px-2 py-0.5 rounded border border-gray-200">
                          {clientRadius} mts
                        </span>
                      </div>
                      <div className="flex items-center gap-2 2xl:gap-3">
                        <button
                          onClick={() =>
                            setClientRadius((p) => Math.max(10, p - 10))
                          }
                          className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-black hover:border-gray-300 transition-all"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="range"
                          min={10}
                          max={500}
                          step={10}
                          value={clientRadius}
                          onChange={(e) =>
                            setClientRadius(Number(e.target.value))
                          }
                          className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <button
                          onClick={() =>
                            setClientRadius((p) => Math.min(1000, p + 10))
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
          )}
        </>
      )}

      {sidebarCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 2xl:space-y-6 py-6 2xl:py-8">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 2xl:p-3 py-16 2xl:py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
            title="Expandir panel"
          >
            <MapIcon className="w-5 h-5 2xl:w-6 2xl:h-6 animate-bounce" />
          </button>
        </div>
      )}
    </aside>
  );
}
