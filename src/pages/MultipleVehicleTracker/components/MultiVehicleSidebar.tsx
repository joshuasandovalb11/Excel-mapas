import React, { useRef } from 'react';
import {
  Upload,
  RefreshCw,
  RotateCcw,
  Database,
  Layers,
} from 'lucide-react';
import RouteDatePicker from '../../../components/DatePicker';
import RouteSelector from '../../../components/RouteSelector';
import GlobalFilters from '../../../components/GlobalFilters';
import ErrorState from '../../../components/ErrorState';
import type { FechaDisponible, RutaResumen } from '../../../types/route.types';
import LoadingLayer from '../../../components/LoadingLayer';

interface MultiVehicleSidebarProps {
  params: Record<string, string>;
  updateParams: (newValues: Record<string, string>) => void;
  onClearAll: () => void;
  availableDates: FechaDisponible[];
  routesSummary: RutaResumen[];
  loadingState: {
    dates: boolean;
    summary: boolean;
    detail: boolean;
    excel: boolean;
  };
  errors: {
    dates: any;
    summary: any;
    detail: any;
    excel: any;
  };
  processMultipleExcels: (files: File[]) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  hasClients: boolean;
  isLoadingClients: boolean;
  onRefreshClients: () => void;
  hasTripData: boolean;
}

export default function MultiVehicleSidebar({
  params,
  updateParams,
  onClearAll,
  availableDates,
  routesSummary,
  loadingState,
  errors,
  processMultipleExcels,
  sidebarCollapsed,
  setSidebarCollapsed,
  hasClients,
  isLoadingClients,
  onRefreshClients,
  hasTripData,
}: MultiVehicleSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mode = (params.mode as 'database' | 'excel') || 'database';
  const selectedDate = params.fecha || null;
  const minStopDuration = Number(params.minStopDuration) || 5;
  const clientRadius = Number(params.clientRadius) || 50;

  const selectedIds = params.rutas ? params.rutas.split(',').map(Number) : [];

  const showDatesError = Boolean(errors.dates);
  const showRoutesError = Boolean(errors.summary);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    processMultipleExcels(fileArray);

    updateParams({ mode: 'excel', fecha: '', rutas: '' });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleRoute = (id: number) => {
    let newSelection = [...selectedIds];

    if (newSelection.includes(id)) {
      newSelection = newSelection.filter(routeId => routeId !== id);
    } else {
      if (newSelection.length >= 5) {
        alert('Solo puedes seleccionar un máximo de 5 rutas para comparar simultáneamente.');
        return;
      }
      newSelection.push(id);
    }

    updateParams({ rutas: newSelection.join(',') });
  };

  return (
    <aside
      className={`${sidebarCollapsed ? 'w-[60px] 2xl:w-16' : 'w-[280px] 2xl:w-80'
        } bg-white border-r border-gray-200 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 flex flex-col relative z-20`}
    >
      <div className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 2xl:gap-2.5">
            <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
              <Layers className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
            </div>
            <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
              Visualizador Múltiple
            </h1>
          </div>
        )}
        <div className="flex items-center gap-2">
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
                  onClick={() => updateParams({ mode: 'database' })}
                  className={`flex-1 py-2 2xl:py-3 text-[11px] 2xl:text-[13px] font-medium border-b-2 transition-all ${mode === 'database'
                    ? 'border-blue-600 bg-white text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  Base de Datos
                </button>
                <button
                  onClick={() => updateParams({ mode: 'excel' })}
                  className={`flex-1 py-2 2xl:py-3 text-[11px] 2xl:text-[13px] font-medium border-b-2 transition-all ${mode === 'excel'
                    ? 'border-blue-600 bg-white text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  Manual (Excel)
                </button>
              </div>

              <div className="flex items-center justify-between px-3 2xl:px-4 py-2 2xl:py-2.5 border-b border-gray-200 bg-white shrink-0">
                <span className="text-[10px] 2xl:text-[11px] font-bold text-gray-900 uppercase tracking-wider">
                  Filtros
                </span>
                <button
                  onClick={onClearAll}
                  className="flex items-center gap-1.5 text-[10px] 2xl:text-[11px] font-semibold text-gray-500 hover:text-red-600 transition-colors"
                  title="Restablecer todos los filtros"
                >
                  <RotateCcw className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
                  Restablecer
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FAFAFA]">
                <div className="p-3 2xl:p-4 space-y-4 2xl:space-y-6">
                  {mode === 'database' && (
                    <div className="space-y-3 2xl:space-y-4 animate-fadeIn">
                      <div className="relative">
                        {showDatesError ? (
                          <div className="h-[200px] 2xl:h-[220px]">
                            <ErrorState error={errors.dates} />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 mb-2 2xl:mb-2.5">
                              <h4 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                Fechas Disponibles
                              </h4>
                            </div>
                            <RouteDatePicker
                              availableDates={availableDates}
                              selectedDate={selectedDate}
                              disabled={loadingState.dates || loadingState.summary || loadingState.detail}
                              onSelectDate={(date) => {
                                if (loadingState.dates || loadingState.summary) return;
                                updateParams({ fecha: date, rutas: "" });
                              }}
                            />
                          </>
                        )}
                        {loadingState.dates && (
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
                              Las rutas estarán disponibles cuando se carguen las fechas.
                            </p>
                          </div>
                        ) : showRoutesError ? (
                          <div className="h-[180px] 2xl:h-[200px]">
                            <ErrorState error={errors.summary} />
                          </div>
                        ) : (
                          <RouteSelector
                            routes={routesSummary}
                            selectedDate={selectedDate}
                            isLoading={loadingState.summary || loadingState.detail}
                            selectionMode="multiple"
                            selectedIds={selectedIds}
                            onToggleRoute={toggleRoute}
                          />
                        )}
                        {loadingState.summary && (
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
                          <div className="h-[140px] 2xl:h-[160px]">
                            <ErrorState
                              error={errors.excel}
                              onRetry={() => fileInputRef.current?.click()}
                            />
                            <input
                              ref={fileInputRef}
                              type="file"
                              className="hidden"
                              onChange={handleFileUpload}
                              accept=".xlsx, .xls"
                              multiple
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mb-2 2xl:mb-2.5">
                              <label className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                Subir Archivos Múltiples
                              </label>
                              {hasTripData && (
                                <button
                                  onClick={onClearAll}
                                  className="text-[10px] 2xl:text-[11px] font-medium text-red-600 hover:text-red-700"
                                >
                                  Limpiar Todo
                                </button>
                              )}
                            </div>
                            <label className="flex flex-col items-center justify-center w-full h-24 2xl:h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-blue-50 hover:border-blue-500 transition-colors shadow-sm">
                              <Upload className="w-5 h-5 2xl:w-6 2xl:h-6 mb-1.5 2xl:mb-2 text-blue-600 animate-bounce" />
                              <p className="text-[11px] 2xl:text-[12px] text-gray-600 font-medium text-center px-4">
                                Click para seleccionar varios EXCEL
                              </p>
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleFileUpload}
                                accept=".xlsx, .xls"
                                multiple
                              />
                            </label>
                          </>
                        )}
                        {loadingState.excel && (
                          <LoadingLayer
                            variant="absolute"
                            spinnerSizeClass="w-8 h-8 2xl:w-10 2xl:h-10"
                            spinnerClassName="text-blue-600"
                            className="bg-white/70 backdrop-blur-sm"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 2xl:pt-5 border-t border-gray-200 space-y-4 2xl:space-y-5">
                    <h3 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Algoritmo de Detección
                    </h3>

                    <GlobalFilters
                      minStopDuration={minStopDuration}
                      clientRadius={clientRadius}
                      onDurationChange={(val) => updateParams({ minStopDuration: val })}
                      onRadiusChange={(val) => updateParams({ clientRadius: val })}
                    />
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
            className="p-2 2xl:p-3 py-16 2xl:py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-colors"
            title="Expandir panel"
          >
            <Layers className="w-5 h-5 2xl:w-6 2xl:h-6 animate-bounce" />
          </button>
        </div>
      )}
    </aside>
  );
}
