/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Minus,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Layers,
  Database,
  RefreshCw,
} from 'lucide-react';
import { FaRoute } from 'react-icons/fa';
import { usePersistentState } from '../hooks/usePersistentState';
import { useIndexedDBState } from '../hooks/useIndexedDBState';
import { useClients } from '../context/ClientContext';
import * as XLSX from 'xlsx-js-style';

import {
  processTripData,
  parseVehicleInfo,
  type ProcessedTrip,
  type VehicleInfo,
} from '../utils/tripUtils';
import MultiInteractiveMap from '../components/MultiInteractiveMap';
import { generateMultiMapHTML } from '../utils/multiMapUtils';
import { RiRoadMapLine } from 'react-icons/ri';

export interface MultiVehicleData {
  id: string;
  fileName: string;
  vehicleInfo: VehicleInfo;
  tripData: ProcessedTrip;
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
  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [minStopDuration, setMinStopDuration] = usePersistentState<number>(
    'mvt_minStopDuration',
    5
  );
  const [clientRadius, setClientRadius] = usePersistentState<number>(
    'mvt_clientRadius',
    50
  );

  const [vehicles, setVehicles] = useIndexedDBState<MultiVehicleData[]>(
    'mvt_vehicles_data',
    []
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

  // useEffect para manejar la visibilidad y el temporizador del toast
  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    if (error) {
      setIsToastVisible(true);

      toastTimerRef.current = window.setTimeout(() => {
        setIsToastVisible(false);

        setTimeout(() => {
          setError(null);
        }, 500);
      }, 5000);
    } else {
      setIsToastVisible(false);
    }

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [error]);

  const handleCloseToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setIsToastVisible(false);
    setTimeout(() => {
      setError(null);
    }, 500);
  };

  // Lógica para asignar un color que no se repita
  const getAvailableColor = (currentList: MultiVehicleData[]) => {
    const usedColors = currentList.map((v) => v.color);
    const available = VEHICLE_COLORS.find((c) => !usedColors.includes(c));
    return (
      available || VEHICLE_COLORS[currentList.length % VEHICLE_COLORS.length]
    );
  };

  // Funcion para descargar el mapa
  const downloadMap = () => {
    if (vehicles.length === 0) return;

    let dateStr = 'SinFecha';
    if (vehicles[0]?.vehicleInfo?.fecha) {
      const dateObj = new Date(vehicles[0].vehicleInfo.fecha + 'T12:00:00Z');
      if (!isNaN(dateObj.getTime())) {
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const anio = dateObj.getFullYear();
        dateStr = `${dia}-${mes}-${anio}`;
      } else {
        dateStr = vehicles[0].vehicleInfo.fecha.replace(/\//g, '-');
      }
    }

    const htmlContent = generateMultiMapHTML(
      vehicles,
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

  // Función mejorada para procesar múltiples archivos a la vez
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setError(null);

    const newVehicles: MultiVehicleData[] = [];
    let hasError = false;

    const existingFileNames = new Set(vehicles.map((v) => v.fileName));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (existingFileNames.has(file.name)) {
        setError(`El archivo "${file.name}" ya ha sido cargado.`);
        hasError = true;
        break;
      }

      existingFileNames.add(file.name);

      try {
        const fileData = await new Promise<MultiVehicleData>(
          (resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
              try {
                if (!event.target?.result) {
                  throw new Error(`No se pudo leer el archivo: ${file.name}`);
                }
                const bstr = event.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const vehicleData = parseVehicleInfo(ws, file.name);
                if (
                  !vehicleData.fecha ||
                  vehicleData.fecha === 'No encontrada'
                ) {
                  throw new Error(`No se detectó fecha en: ${file.name}`);
                }

                const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, {
                  header: 1,
                  defval: '',
                });

                const expectedHeaders = [
                  'latitud',
                  'longitud',
                  'descripción de evento',
                  'velocidad',
                ];
                let headerRowIndex = -1;

                for (let j = 0; j < 20 && j < sheetAsArray.length; j++) {
                  const row = sheetAsArray[j].map((cell) =>
                    String(cell || '').toLowerCase()
                  );
                  const matchCount = expectedHeaders.filter((header) =>
                    row.some((cellText) => cellText.includes(header))
                  ).length;
                  if (matchCount >= 3) {
                    headerRowIndex = j;
                    break;
                  }
                }

                if (headerRowIndex === -1) {
                  throw new Error(
                    `Formato inválido (sin encabezados) en: ${file.name}`
                  );
                }

                const rawData = XLSX.utils.sheet_to_json(ws, {
                  range: headerRowIndex,
                  defval: '',
                });

                if (!Array.isArray(rawData) || rawData.length === 0) {
                  throw new Error(`El archivo está vacío: ${file.name}`);
                }

                const processedTrip = processTripData(
                  rawData,
                  'new',
                  vehicleData.fecha,
                  masterClients,
                  'TIJ'
                );

                resolve({
                  id: Math.random().toString(36).substring(7),
                  fileName: file.name,
                  vehicleInfo: vehicleData,
                  tripData: processedTrip,
                  color: '',
                });
              } catch (err) {
                reject(err);
              }
            };

            reader.onerror = () =>
              reject(new Error(`Error de lectura en ${file.name}`));
            reader.readAsBinaryString(file);
          }
        );

        newVehicles.push(fileData);
      } catch (err: any) {
        setError(err.message || `Error al procesar el archivo ${file.name}`);
        hasError = true;
        break;
      }
    }

    if (!hasError && newVehicles.length > 0) {
      setVehicles((prev) => {
        const updatedList = [...prev];
        newVehicles.forEach((newV) => {
          newV.color = getAvailableColor(updatedList);
          updatedList.push(newV);
        });
        return updatedList;
      });
    }

    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeVehicle = (idToRemove: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== idToRemove));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* SIDEBAR IZQUIERDO */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-80'
        } bg-white shadow-lg transition-all duration-300 flex flex-col relative z-20`}
      >
        {/* HEADER DEL SIDEBAR */}
        <div className="pt-4 pl-4 pr-4 pb-2 border-b border-gray-200 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <FaRoute className="w-5 h-5 text-[#0800FF]" />
              <h1 className="text-xl font-bold text-gray-800">
                Visualizador Múltiple
              </h1>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <svg
              className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
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
            {/* VISTA DE ERROR / BASE DE DATOS VACÍA */}
            {!isLoadingClients &&
            (!masterClients || masterClients.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="bg-red-50 p-4 rounded-full">
                  <Database className="w-10 h-10 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Sin Clientes
                  </h3>
                  <p className="text-sm text-gray-500 mt-2">
                    No se ha cargado la base de datos de clientes. Es necesaria
                    para procesar las rutas.
                  </p>
                </div>
                <button
                  onClick={() => refreshClients(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  Recargar Clientes
                </button>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                {/* PANEL DE CONTROL FIJO */}
                <div className="p-4 bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex gap-2 items-center">
                      <RiRoadMapLine className="w-4 h-4 text-[#0800FF]" />
                      <label className="block text-sm font-medium text-gray-700">
                        Cargar Archivo(s) de Ruta
                      </label>
                    </div>

                    {/* Boton de borrar */}
                    {vehicles.length > 0 && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              '¿Estás seguro de que deseas borrar todos los viajes cargados?'
                            )
                          ) {
                            setVehicles([]);
                          }
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 cursor-pointer"
                        title="Limpiar todas las rutas"
                      >
                        <Trash2 className="w-3 h-3" />
                        Limpiar
                      </button>
                    )}
                  </div>

                  <label className="flex-1 flex items-center justify-center gap-2 bg-[#0800FF] text-white px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[#0000A3] transition-colors shadow-sm font-medium text-sm">
                    <Upload className="w-4 h-4" />
                    <span>Subir Excel(s)</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".xlsx, .xls"
                      multiple
                      disabled={isProcessing}
                    />
                  </label>

                  {isProcessing && (
                    <div className="mt-3 text-xs text-[#0800FF] font-medium flex items-center justify-center gap-2 bg-indigo-50 py-2 rounded-md animate-pulse">
                      <div className="w-3 h-3 border-2 border-[#0800FF] border-t-transparent rounded-full animate-spin"></div>
                      Procesando rutas...
                    </div>
                  )}
                </div>

                {/* LISTA DE VEHÍCULOS (SCROLL) */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 pb-6 bg-white border-b border-gray-100 shadow-sm z-10">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-[#0800FF]" />
                      Vehículos Agregados ({vehicles.length})
                    </h3>

                    {vehicles.length === 0 && !isProcessing ? (
                      <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-xl bg-white text-gray-400 mt-2">
                        <FaRoute className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-xs font-medium">Aún no hay rutas</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {vehicles.map((vehicle) => (
                          <div
                            key={vehicle.id}
                            className="group flex items-center justify-between bg-white border p-1.5 px-3 rounded-lg shadow-sm transition-all"
                            style={{ borderColor: vehicle.color }}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm border-2 border-white ring-1 ring-gray-200"
                                style={{ backgroundColor: vehicle.color }}
                              />
                              <div className="flex flex-col overflow-hidden">
                                <span
                                  className="text-xs font-bold text-gray-700 truncate"
                                  title={vehicle.fileName}
                                >
                                  {vehicle.fileName}
                                </span>
                                <span className="text-[10px] text-gray-500 truncate uppercase tracking-wider">
                                  {vehicle.vehicleInfo.descripcion}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeVehicle(vehicle.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md group-hover:opacity-100 transition-all flex-shrink-0 cursor-pointer"
                              title="Quitar ruta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CONFIGURACIÓN */}
                  {vehicles.length > 0 && (
                    <div className="space-y-4 p-4 pt-6">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        Configuración de Filtros
                      </h3>

                      <div className="space-y-3">
                        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
                          <label className="flex justify-between text-xs font-semibold text-gray-600 mb-3">
                            <span>Duración min. de paradas</span>
                            <span className="text-[#0800FF] bg-indigo-50 px-2 py-0.5 rounded-md">
                              {minStopDuration} min
                            </span>
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setMinStopDuration((prev) =>
                                  Math.max(1, prev - 1)
                                )
                              }
                              className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-full cursor-pointer
                                        border border-gray-300 hover:border-[#0800FF] hover:text-[#0800FF] shadow-sm transition-all active:scale-95 disabled:opacity-50"
                              disabled={minStopDuration <= 1}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="range"
                              min={1}
                              max={60}
                              step={1}
                              value={minStopDuration}
                              onChange={(e) =>
                                setMinStopDuration(Number(e.target.value))
                              }
                              className="flex-1 h-2 bg-gray-200 rounded-lg cursor-pointer accent-[#0800FF]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setMinStopDuration((prev) =>
                                  Math.min(120, prev + 1)
                                )
                              }
                              className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-full cursor-pointer
                                        border border-gray-300 hover:border-[#0800FF] hover:text-[#0800FF] shadow-sm transition-all active:scale-95 disabled:opacity-50"
                              disabled={minStopDuration >= 120}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
                          <label className="flex justify-between text-xs font-semibold text-gray-600 mb-3">
                            <span>Radio de Coincidencia</span>
                            <span className="text-[#0800FF] bg-indigo-50 px-2 py-0.5 rounded-md">
                              {clientRadius} mts
                            </span>
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setClientRadius((prev) =>
                                  Math.max(10, prev - 10)
                                )
                              }
                              className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-full cursor-pointer
                                        border border-gray-300 hover:border-[#0800FF] hover:text-[#0800FF] shadow-sm transition-all active:scale-95 disabled:opacity-50"
                              disabled={clientRadius <= 10}
                            >
                              <Minus className="w-3.5 h-3.5" />
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
                              className="flex-1 h-2 bg-gray-200 rounded-lg cursor-pointer accent-[#0800FF]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setClientRadius((prev) =>
                                  Math.min(1000, prev + 10)
                                )
                              }
                              className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-full cursor-pointer 
                                        border border-gray-300 hover:border-[#0800FF] hover:text-[#0800FF] shadow-sm transition-all active:scale-95 disabled:opacity-50"
                              disabled={clientRadius >= 1000}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-3 py-20 bg-indigo-100 text-[#0800FF] hover:text-white hover:bg-[#0800FF] rounded-lg transition-colors cursor-pointer"
            >
              <FaRoute className="w-5 h-5 animate-bounce" />
            </button>
          </div>
        )}
      </aside>

      {/* ÁREA PRINCIPAL: MAPA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-gray-200 z-10 relative">
          <h2 className="text-md font-semibold text-gray-800">
            {vehicles.length > 0
              ? `Comparando ${vehicles.length} vehículo(s)`
              : 'Agrega archivos para comparar rutas'}
          </h2>

          {/* Funcion para descargar el mapa */}
          {vehicles.length > 0 && (
            <button
              onClick={downloadMap}
              className="hidden sm:flex items-center text-sm font-medium justify-center px-4 py-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar Mapa
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {vehicles.length > 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200">
              <MultiInteractiveMap
                vehicles={vehicles}
                minStopDuration={minStopDuration}
                clientData={masterClients}
                googleMapsApiKey={import.meta.env.VITE_Maps_API_KEY}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center max-w-sm px-4">
                <FaRoute className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg text-gray-500 mb-2">
                  No hay datos de ruta cargados
                </h3>
                <p className="text-sm text-gray-400">
                  Usa el botón "Subir Excel(s)" del panel izquierdo para cargar
                  uno o varios archivos simultáneamente.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {error && (
        <div
          className={`fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50             
            transition-all duration-500 ease-in-out
            ${
              isToastVisible
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-10'
            }`}
        >
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
          <button
            onClick={handleCloseToast}
            className="ml-2 hover:bg-red-700 p-1 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
