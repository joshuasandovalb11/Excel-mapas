/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Upload,
  Download,
  Car,
  Users,
  Truck,
  ExternalLink,
  Minus,
  Plus,
  CarFront,
  FileClock,
  Route,
  ChartBar,
  CalendarClock,
  UserCheck,
  RefreshCw,
  Database,
  ChevronDown,
  Trash2,
  ClockFading,
} from 'lucide-react';
import { RiRoadMapLine } from 'react-icons/ri';
import { usePersistentState } from '../hooks/usePersistentState';
import { useIndexedDBState } from '../hooks/useIndexedDBState';
import { useClients } from '../context/ClientContext';

import { parseISO, format as formatDate } from 'date-fns';
import { es } from 'date-fns/locale';

import { isWorkingHours } from '../utils/tripUtils';
import { generateMapHTML } from '../utils/mapUtils';
import {
  processTripData,
  parseVehicleInfo,
  calculateDistance,
  formatDuration,
  type ProcessedTrip,
  type VehicleInfo,
  type Client,
} from '../utils/tripUtils';
import InteractiveMap from './InteractiveMap';

interface TripStorage {
  rawData: any[];
  vehicleInfo: VehicleInfo;
  fileName: string;
}

export default function VehicleTracker() {
  const [allTripsData, setAllTripsData] = useIndexedDBState<
    Record<string, TripStorage>
  >('vt_allTripsData_db', {});
  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();

  const [tripData, setTripData] = useState<ProcessedTrip | null>(null);
  const [rawTripData, setRawTripData] = useState<any[] | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [clientData, setClientData] = useState<Client[] | null>(null);

  const [activeDate, setActiveDate] = usePersistentState<string | null>(
    'vt_activeDate',
    null
  );
  const [fileName, setFileName] = usePersistentState<string | null>(
    'vt_fileName',
    null
  );
  const [minStopDuration, setMinStopDuration] = usePersistentState<number>(
    'vt_minStopDuration',
    5
  );
  const [clientRadius, setClientRadius] = usePersistentState<number>(
    'vt_clientRadius',
    50
  );
  const [error, setError] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [matchedStopsCount, setMatchedStopsCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [availableVendors, setAvailableVendors] = usePersistentState<string[]>(
    'vt_vendors',
    []
  );
  const [selection, setSelection] = usePersistentState<{
    mode: 'vendor' | 'driver';
    value: string | null;
  }>('vt_selection', { mode: 'vendor', value: null });
  const [viewMode, setViewMode] = usePersistentState<'current' | 'new'>(
    'vt_viewMode',
    'new'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'info' | 'analytics'>(
    'config'
  );
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const [timezoneSource, setTimezoneSource] = usePersistentState<
    'TIJ' | 'CDMX'
  >('vt_timezoneSource', 'TIJ');

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

  // ACTUALIZAR VENDEDORES DISPONIBLES CUANDO LLEGAN LOS CLIENTES DEL CONTEXTO
  useEffect(() => {
    if (masterClients && masterClients.length > 0) {
      const vendors = Array.from(
        new Set(masterClients.map((c) => c.vendor))
      ).sort();
      if (vendors.length !== availableVendors.length) {
        setAvailableVendors(vendors);
      }
    }
  }, [masterClients, availableVendors.length, setAvailableVendors]);

  // Restaurar la vista de clientes al regresar a la pestaña
  useEffect(() => {
    if (masterClients && masterClients.length > 0 && selection.value) {
      if (selection.mode === 'driver') {
        setClientData(masterClients);
      } else {
        const filteredClients = masterClients.filter(
          (client) => client.vendor === selection.value && !client.isVendorHome
        );

        const vendorHome = masterClients.find(
          (client) =>
            client.isVendorHome && client.vendorHomeInitial === selection.value
        );

        const finalClientList = [...filteredClients];
        if (vendorHome) {
          finalClientList.push(vendorHome);
        }

        setClientData(finalClientList);
      }
    }
  }, [masterClients, selection.value, selection.mode, setClientData]);

  // Efecto para establecer si hay match con respecto a la ubicacion y al cliente
  useEffect(() => {
    if (tripData && clientData) {
      const updatedFlags = tripData.flags.map((flag) => {
        if (flag.type === 'stop') {
          let matchedClient: Client | null = null;
          let minDistance = Infinity;
          for (const client of clientData) {
            const distance = calculateDistance(
              flag.lat,
              flag.lng,
              client.lat,
              client.lng
            );
            if (distance < clientRadius && distance < minDistance) {
              minDistance = distance;
              matchedClient = client;
            }
          }
          return {
            ...flag,
            clientName: matchedClient?.displayName || 'Sin coincidencia',
            clientKey: matchedClient?.key,
            clientBranchNumber: matchedClient?.branchNumber,
            clientBranchName: matchedClient?.branchName,
            isVendorHome: matchedClient?.isVendorHome,
          };
        }
        return flag;
      });

      const specialNonClientKeys = ['3689', '6395'];

      const matchedStops = updatedFlags.filter(
        (flag) =>
          flag.type === 'stop' &&
          flag.clientName !== 'Sin coincidencia' &&
          !flag.isVendorHome &&
          !specialNonClientKeys.includes(flag.clientKey || '')
      );
      const uniqueClientKeys = new Set(
        matchedStops.map((stop) => stop.clientKey)
      );
      setMatchedStopsCount(uniqueClientKeys.size);

      setTripData((prevData: ProcessedTrip | null) => {
        if (!prevData) return prevData;

        if (JSON.stringify(prevData.flags) !== JSON.stringify(updatedFlags)) {
          return { ...prevData, flags: updatedFlags };
        }
        return prevData;
      });
    }
  }, [clientData, clientRadius, tripData, setTripData]);

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

  // Efecto para reprocesar los datos cuando cambia el modo de vista
  useEffect(() => {
    if (rawTripData) {
      try {
        const processed = processTripData(
          rawTripData,
          viewMode,
          vehicleInfo?.fecha || '',
          clientData,
          timezoneSource
        );
        setTripData(processed);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : 'Ocurrió un error al reprocesar el viaje.'
        );
      }
    }
  }, [
    viewMode,
    rawTripData,
    vehicleInfo,
    clientData,
    timezoneSource,
    setTripData,
  ]);

  // Efecto para actualizar los datos activos cuando cambia la fecha seleccionada
  useEffect(() => {
    if (activeDate && allTripsData[activeDate]) {
      const { rawData, vehicleInfo, fileName } = allTripsData[activeDate];
      setRawTripData(rawData);
      setVehicleInfo(vehicleInfo);
      setFileName(fileName);
    } else {
      setRawTripData(null);
      setVehicleInfo(null);
      setTripData(null);
      setFileName(null);
    }
  }, [
    activeDate,
    allTripsData,
    setRawTripData,
    setVehicleInfo,
    setTripData,
    setFileName,
  ]);

  // Funcion para leer el archivo EXCEL para las rutas (GPS)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setIsGeneratingReport(true);

    try {
      const fileReadPromises = Array.from(files).map(async (file) => {
        return new Promise<[string, TripStorage]>((resolve, reject) => {
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
              if (!vehicleData.fecha || vehicleData.fecha === 'No encontrada') {
                throw new Error(`No se detectó fecha en: ${file.name}`);
              }
              const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, {
                header: 1,
                defval: '',
              });
              // ... lógica de detección de headers ...
              const expectedHeaders = [
                'latitud',
                'longitud',
                'descripción de evento',
                'velocidad',
              ];
              let headerRowIndex = -1;

              for (let i = 0; i < 20 && i < sheetAsArray.length; i++) {
                const row = sheetAsArray[i].map((cell) =>
                  String(cell || '').toLowerCase()
                );
                const matchCount = expectedHeaders.filter((header) =>
                  row.some((cellText) => cellText.includes(header))
                ).length;
                if (matchCount >= 3) {
                  headerRowIndex = i;
                  break;
                }
              }

              if (headerRowIndex === -1) {
                throw new Error(
                  `Formato inválido (sin encabezados) en: ${file.name}`
                );
              }
              const data = XLSX.utils.sheet_to_json(ws, {
                range: headerRowIndex,
                defval: '',
              });
              if (!Array.isArray(data) || data.length === 0) {
                throw new Error(`El archivo está vacío: ${file.name}`);
              }

              const hasMovement = data.some((row: any) => {
                const speedKey = Object.keys(row).find((key) => {
                  const k = key.toLowerCase();
                  return (
                    k.includes('velocidad') ||
                    k.includes('speed') ||
                    k.includes('km')
                  );
                });

                if (!speedKey) return false;
                const val = row[speedKey];
                if (typeof val === 'number') return val > 0;
                if (typeof val === 'string') {
                  const clean = val.replace(/[^\d.,-]/g, '').replace(',', '.');
                  const speed = parseFloat(clean);
                  return !isNaN(speed) && speed > 0;
                }
                return false;
              });

              if (!hasMovement) {
                throw new Error(
                  `El archivo NO tiene movimiento (Velocidad 0 km/h): ${file.name}`
                );
              }

              const tripEntry: TripStorage = {
                rawData: data,
                vehicleInfo: vehicleData,
                fileName: file.name,
              };

              const dateObj = parseISO(vehicleData.fecha);
              const dayIndex = dateObj.getDay();

              resolve([String(dayIndex), tripEntry]);
            } catch (err: any) {
              reject(new Error(err.message || `Error en ${file.name}`));
            }
          };

          reader.onerror = () =>
            reject(new Error(`Error de lectura en ${file.name}`));
          reader.readAsBinaryString(file);
        });
      });

      const results = await Promise.allSettled(fileReadPromises);

      const newTripsMap: Record<string, TripStorage> = {};
      const errors: string[] = [];
      let lastSuccessKey: string | null = null;
      let lastSuccessFileName: string | null = null;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [dayKey, tripEntry] = result.value;
          newTripsMap[dayKey] = tripEntry;
          lastSuccessKey = dayKey;
          lastSuccessFileName = tripEntry.fileName;
        } else {
          errors.push(result.reason.message);
        }
      });

      if (Object.keys(newTripsMap).length > 0) {
        setAllTripsData((prevData) => ({
          ...prevData,
          ...newTripsMap,
        }));

        if (lastSuccessKey) {
          setActiveDate(lastSuccessKey);
        }
        if (lastSuccessFileName) {
          setFileName(lastSuccessFileName);
        }
      }

      if (errors.length > 0) {
        console.error('Errores al cargar:', errors);
        setError(
          `Atención: ${errors[0]} ${
            errors.length > 1 ? `(+${errors.length - 1} más)` : ''
          }`
        );
      } else {
        setError(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error inesperado al procesar archivos.');
    } finally {
      setIsGeneratingReport(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // FUNCIÓN PARA MANEJAR LA SELECCIÓN DE VENDEDOR O MODO CHOFER
  const handleSelection = (selected: string) => {
    const newMode = availableVendors.includes(selected) ? 'vendor' : 'driver';
    setSelection({ mode: newMode, value: selected });
  };

  // Funcion para formatear fechas en Excel
  const formatExcelDate = (dateString: string | null): string => {
    if (!dateString) return '';

    const meses = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];

    const date = new Date(`${dateString}T12:00:00Z`);
    if (isNaN(date.getTime())) return '';

    const mes = meses[date.getMonth()];
    const dia = String(date.getDate()).padStart(2, '0');
    const anio = date.getFullYear();

    return `${mes}-${dia}-${anio}`;
  };

  // FUNCIÓN PARA GENERAR Y DESCARGAR EL REPORTE
  const downloadReport = async () => {
    const tripsToProcess = Object.keys(allTripsData);
    if (tripsToProcess.length === 0) {
      alert(
        'No hay ningún archivo de ruta cargado. Por favor, carga al menos un viaje.'
      );
      return;
    }

    let clientsForReport: Client[] = [];
    if (selection.mode === 'driver') {
      clientsForReport = masterClients || [];
    } else {
      clientsForReport = clientData || [];
    }

    if (clientsForReport.length === 0) {
      alert(
        'No se ha seleccionado un archivo de clientes o el vendedor no tiene clientes asignados.'
      );
      return;
    }

    setIsGeneratingReport(true);
    const specialNonClientKeys = ['3689', '6395'];

    const styles = {
      title: {
        font: { name: 'Arial', sz: 18, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF0275D8' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      subHeader: {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      subHeaderOutside: {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FFC00000' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      summarySubHeader: {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF444444' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      header: {
        font: { name: 'Arial', sz: 11, bold: true },
        fill: { fgColor: { rgb: 'FFDDDDDD' } },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      },
      cell: {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'top', wrapText: true },
      },
      cellCentered: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
      },
      clientVisitedCell: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFEBF5FF' } },
        alignment: { vertical: 'top', wrapText: true },
      },
      vendorHomeVisitedCell: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFE8FFDE' } },
        alignment: { vertical: 'top', wrapText: true },
      },
      toolsVisitedCell: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFFFD1D1' } },
        alignment: { vertical: 'top', wrapText: true },
      },
      summaryLabelRed: {
        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FF9C0006' } },
        alignment: { horizontal: 'right' },
        fill: { fgColor: { rgb: 'FFF2F2F2' } },
      },
      summaryValueRed: {
        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FF9C0006' } },
        alignment: { horizontal: 'center', wrapText: true },
      },
      summaryTotalColRed: {
        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FF9C0006' } },
        alignment: { horizontal: 'center', wrapText: true },
        fill: { fgColor: { rgb: 'FFDDEBF7' } },
      },
      summaryLabel: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'right' },
        fill: { fgColor: { rgb: 'FFF2F2F2' } },
      },
      summaryValue: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'center', wrapText: true },
      },
      summaryTotalCol: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'center', wrapText: true },
        fill: { fgColor: { rgb: 'FFDDEBF7' } },
      },
    };

    const timeToMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 60 + m + (s || 0) / 60;
    };

    const WORK_START_MINUTES = 8 * 60 + 30;
    const WORK_END_MINUTES = 19 * 60;

    const splitDurationByWorkingHours = (
      startTime: string,
      durationMinutes: number,
      dayOfWeek: number
    ): { withinHours: number; outsideHours: number } => {
      if (dayOfWeek === 6 || dayOfWeek === 0) {
        return { withinHours: 0, outsideHours: durationMinutes };
      }
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + durationMinutes;
      let withinHours = 0;
      let outsideHours = 0;
      for (let minute = startMinutes; minute < endMinutes; minute++) {
        const currentMinute = minute % (24 * 60);
        if (
          currentMinute >= WORK_START_MINUTES &&
          currentMinute < WORK_END_MINUTES
        ) {
          withinHours++;
        } else {
          outsideHours++;
        }
      }
      return { withinHours, outsideHours };
    };

    const calculateWorkingTimeBetween = (
      startTime: string,
      endTime: string,
      dayOfWeek: number
    ): {
      totalMinutes: number;
      workingMinutes: number;
      afterHoursMinutes: number;
    } => {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      let totalMinutes = 0;
      let workingMinutes = 0;
      let afterHoursMinutes = 0;

      if (endMinutes >= startMinutes) {
        totalMinutes = endMinutes - startMinutes;
      } else {
        totalMinutes = 24 * 60 - startMinutes + endMinutes;
      }

      if (dayOfWeek === 6 || dayOfWeek === 0) {
        return {
          totalMinutes,
          workingMinutes: 0,
          afterHoursMinutes: totalMinutes,
        };
      }

      if (endMinutes >= startMinutes) {
        for (let minute = startMinutes; minute < endMinutes; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
      } else {
        for (let minute = startMinutes; minute < 24 * 60; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
        for (let minute = 0; minute < endMinutes; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
      }
      return { totalMinutes, workingMinutes, afterHoursMinutes };
    };

    try {
      const allVisitsMap = new Map<string, any[]>();
      const summaryByDay: Record<
        number,
        {
          distanceWithin: number;
          distanceOutside: number;
          totalStops: number;
          clientsVisited: Set<string>;
          vehiclePlate: string;
          start24h: string;
          startClients: string;
          timeWithClients: number;
          timeWithNonClients: number;
          travelTime: number;
          timeAtTools: number;
          timeAtHome: number;
          timeWithClientsAfter: number;
          timeWithNonClientsAfter: number;
          travelTimeAfter: number;
        }
      > = {};

      const dayColumnMap: Record<number, number> = {
        1: 1, // Lunes
        2: 2, // Martes
        3: 3, // Miércoles
        4: 4, // Jueves
        5: 5, // Viernes
        6: 6, // Sábado
        0: 7, // Domingo
      };

      for (const dayKey of tripsToProcess) {
        const { rawData, vehicleInfo } = allTripsData[dayKey];
        const realDate = vehicleInfo.fecha;
        const dateObj = parseISO(realDate);

        const dayOfWeek = dateObj.getDay();

        if (dayColumnMap[dayOfWeek] === undefined) continue;

        let processedTrip: ProcessedTrip;
        try {
          processedTrip = processTripData(
            rawData,
            viewMode,
            realDate,
            clientsForReport
          );
        } catch (e) {
          console.error(`Error procesando el viaje del día ${realDate}:`, e);
          continue;
        }

        let start24h = 'N/A';
        let startClients = 'N/A';
        const events = processedTrip.events || [];
        const flags = processedTrip.flags || [];

        const evtStart = events.find((e) =>
          e.description.toLowerCase().includes('inicio de viaje')
        );
        const evtMove = events.find((e) => e.speed > 0);

        if (evtStart && evtMove) {
          start24h =
            evtStart.time < evtMove.time ? evtStart.time : evtMove.time;
        } else {
          start24h = evtStart?.time || evtMove?.time || 'N/A';
        }

        const firstValidVisit = flags.find(
          (f) =>
            f.type === 'stop' &&
            (f.duration || 0) >= minStopDuration &&
            f.clientKey &&
            !f.isVendorHome &&
            !specialNonClientKeys.includes(f.clientKey)
        );
        const startFlag = flags.find((f) => f.type === 'start');
        startClients = firstValidVisit?.time || startFlag?.time || 'N/A';

        let dailyTimeWithClients = 0;
        let dailyTimeWithNonClients = 0;
        let dailyTimeAtTools = 0;
        let dailyTimeAtHome = 0;
        let dailyTimeWithClientsAfter = 0;
        let dailyTimeWithNonClientsAfter = 0;
        let dailyTimeAtToolsAfter = 0;
        let dailyTimeAtHomeAfter = 0;

        const dailyClientsVisited = new Set<string>();
        let dailyTotalStops = 0;

        for (const flag of processedTrip.flags) {
          if (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration) {
            dailyTotalStops++;
            const duration = flag.duration || 0;
            const split = splitDurationByWorkingHours(
              flag.time,
              duration,
              dayOfWeek
            );

            if (flag.clientKey) {
              const visitKey = `${flag.clientKey}_${flag.clientBranchNumber || 'main'}`;
              if (
                !flag.isVendorHome &&
                !specialNonClientKeys.includes(flag.clientKey)
              ) {
                dailyClientsVisited.add(visitKey);
              }
              const clientVisits = allVisitsMap.get(visitKey) || [];
              clientVisits.push({
                date: realDate,
                time: flag.time,
                dayOfWeek: dayOfWeek,
                duration: flag.duration || 0,
              });
              allVisitsMap.set(visitKey, clientVisits);

              if (flag.isVendorHome) {
                dailyTimeAtHome += split.withinHours;
                dailyTimeAtHomeAfter += split.outsideHours;
              } else if (specialNonClientKeys.includes(flag.clientKey || '')) {
                dailyTimeAtTools += split.withinHours;
                dailyTimeAtToolsAfter += split.outsideHours;
              } else if (
                !flag.clientName ||
                flag.clientName === 'Sin coincidencia'
              ) {
                dailyTimeWithNonClients += split.withinHours;
                dailyTimeWithNonClientsAfter += split.outsideHours;
              } else {
                dailyTimeWithClients += split.withinHours;
                dailyTimeWithClientsAfter += split.outsideHours;
              }
            } else {
              dailyTimeWithNonClients += split.withinHours;
              dailyTimeWithNonClientsAfter += split.outsideHours;
            }
          }
        }

        const startEvents = processedTrip.flags.filter(
          (flag) => flag.type === 'start'
        );
        const endEvents = processedTrip.flags.filter(
          (flag) => flag.type === 'end'
        );
        let dailyTravelTime = 0;
        let dailyTravelTimeAfter = 0;

        if (startEvents.length > 0 && endEvents.length > 0) {
          const firstStartEvent = startEvents[0];
          const lastEndEvent = endEvents[endEvents.length - 1];
          const tripTimes = calculateWorkingTimeBetween(
            firstStartEvent.time,
            lastEndEvent.time,
            dayOfWeek
          );

          const totalStopTimeWorking =
            dailyTimeWithClients +
            dailyTimeWithNonClients +
            dailyTimeAtTools +
            dailyTimeAtHome;
          const totalStopTimeAfter =
            dailyTimeWithClientsAfter +
            dailyTimeWithNonClientsAfter +
            dailyTimeAtToolsAfter +
            dailyTimeAtHomeAfter;

          dailyTravelTime = Math.max(
            0,
            tripTimes.workingMinutes - totalStopTimeWorking
          );
          dailyTravelTimeAfter = Math.max(
            0,
            tripTimes.afterHoursMinutes - totalStopTimeAfter
          );
        }

        let distWithin = 0;
        let distOutside = 0;

        if (
          processedTrip.routes &&
          processedTrip.routes[0]?.path &&
          processedTrip.flags.length > 0
        ) {
          const routePath = processedTrip.routes[0].path;
          const startFlag = processedTrip.flags.find((f) => f.type === 'start');
          const endFlag = processedTrip.flags.find((f) => f.type === 'end');

          if (startFlag && endFlag) {
            if (dayOfWeek === 6 || dayOfWeek === 0) {
              distOutside = processedTrip.totalDistance;
            } else {
              const startMinutes = timeToMinutes(startFlag.time);
              const endMinutes = timeToMinutes(endFlag.time);
              const tripDuration =
                endMinutes >= startMinutes
                  ? endMinutes - startMinutes
                  : 24 * 60 - startMinutes + endMinutes;

              for (let i = 0; i < routePath.length - 1; i++) {
                const segDist = calculateDistance(
                  routePath[i].lat,
                  routePath[i].lng,
                  routePath[i + 1].lat,
                  routePath[i + 1].lng
                );
                const progress = i / (routePath.length - 1);
                const currentMin = startMinutes + tripDuration * progress;
                const h = Math.floor(currentMin / 60) % 24;
                const m = Math.floor(currentMin % 60);
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

                if (isWorkingHours(timeStr, vehicleInfo.fecha))
                  distWithin += segDist;
                else distOutside += segDist;
              }
            }
          } else {
            if (dayOfWeek === 6 || dayOfWeek === 0)
              distOutside = processedTrip.totalDistance;
            else distWithin = processedTrip.totalDistance;
          }
        }

        summaryByDay[dayOfWeek] = {
          start24h,
          startClients,
          distanceWithin: distWithin,
          distanceOutside: distOutside,
          totalStops: dailyTotalStops,
          clientsVisited: dailyClientsVisited,
          vehiclePlate: vehicleInfo.placa,
          timeWithClients: dailyTimeWithClients,
          timeWithNonClients: dailyTimeWithNonClients,
          travelTime: dailyTravelTime,
          timeAtTools: dailyTimeAtTools,
          timeAtHome: dailyTimeAtHome,
          timeWithClientsAfter: dailyTimeWithClientsAfter,
          timeWithNonClientsAfter: dailyTimeWithNonClientsAfter,
          travelTimeAfter: dailyTravelTimeAfter,
        };
      }

      const visitedClients: Client[] = [];
      const nonVisitedClients: Client[] = [];
      let vendorHome: Client | null = null;

      for (const client of clientsForReport) {
        if (client.isVendorHome) {
          vendorHome = client;
          continue;
        }
        const clientVisitKey = `${client.key}_${client.branchNumber || 'main'}`;
        if (allVisitsMap.has(clientVisitKey)) {
          visitedClients.push(client);
        } else {
          nonVisitedClients.push(client);
        }
      }

      const sortedClients: Client[] = [...visitedClients, ...nonVisitedClients];
      if (
        vendorHome &&
        allVisitsMap.has(
          `${vendorHome.key}_${vendorHome.branchNumber || 'main'}`
        )
      ) {
        sortedClients.unshift(vendorHome);
      } else if (vendorHome) {
        sortedClients.push(vendorHome);
      }

      const sheetData: any[][] = [];
      const headers = [
        'Cliente',
        'Lunes',
        'Martes',
        'Miércoles',
        'Jueves',
        'Viernes',
        'Sábado',
        'Domingo',
        'TOTAL SEMANAL',
      ];
      const numCols = headers.length;

      sheetData.push(['Reporte Semanal de Visitas']);
      sheetData.push([`Vendedor: ${selection.value || 'N/A'}`]);
      sheetData.push([]);
      sheetData.push(headers);
      const headerRowIndex = sheetData.length - 1;

      for (const client of sortedClients) {
        let clientName = `${client.key} - ${client.name}`;
        if (client.isVendorHome) clientName = `${clientName} (CASA)`;
        else if (client.branchName) clientName += ` (${client.branchName})`;
        else if (client.branchNumber)
          clientName += ` (Suc. ${client.branchNumber})`;

        const row = new Array(numCols).fill('');
        row[0] = clientName;
        const clientVisitKey = `${client.key}_${client.branchNumber || 'main'}`;
        const visits = allVisitsMap.get(clientVisitKey);

        if (visits) {
          for (const visit of visits) {
            const colIndex = dayColumnMap[visit.dayOfWeek];
            if (colIndex !== undefined) {
              const durationText = formatDuration(visit.duration || 0);
              const visitString = `${formatExcelDate(visit.date)}\n${visit.time} (${durationText})`;
              row[colIndex] =
                (row[colIndex] ? row[colIndex] + '\n' : '') + visitString;
            }
          }
        }
        sheetData.push(row);
      }

      sheetData.push([]);
      const summaryStartRow = sheetData.length;

      sheetData.push(['RESUMEN SEMANAL - DENTRO DE HORARIO (8:30 - 19:00)']);
      sheetData.push(['Resumen de Paradas y Distancia']);

      const vehicleRow = ['Vehículo', '', '', '', '', '', '', '', ''];
      const distWithinRow = [
        'Distancia Recorrida',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
      ];
      const totalStopsRow = ['Paradas Totales', 0, 0, 0, 0, 0, 0, 0, 0];
      const uniqueClientsRow = [
        'Clientes Únicos Visitados',
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ];

      const start24hRow = [
        'Inicio de Traslados',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ];
      const startClientsRow = [
        'Primer Cliente Visitado',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ];

      const timeWithClientsRow = [
        'Tiempo con Clientes',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const timeWithNonClientsRow = [
        'Tiempo con NO Clientes',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const timeAtToolsRow = [
        'Tiempo en Tools de Mexico',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const timeAtHomeRow = [
        'Tiempo en Casa',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const travelTimeRow = [
        'Tiempo en Traslados',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];

      const timeClientsOutRow = [
        'Tiempo con Clientes',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const timeNonClientsOutRow = [
        'Tiempo con NO Clientes',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const travelTimeOutRow = [
        'Tiempo en Traslados',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];
      const distOutsideRow = [
        'Distancia Recorrida',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
      ];

      let totDistWithin = 0,
        totStops = 0,
        totTimeClients = 0,
        totTimeNonClients = 0;
      let totTools = 0,
        totHome = 0,
        totTravel = 0;
      let totTimeClientsOut = 0,
        totTimeNonClientsOut = 0,
        totTravelOut = 0,
        totDistOut = 0;
      const allClientsVisitedWeek = new Set<string>();

      for (const dayNum in summaryByDay) {
        const colIndex = dayColumnMap[dayNum as any];
        if (colIndex !== undefined) {
          const stats = summaryByDay[dayNum as any];

          vehicleRow[colIndex] = stats.vehiclePlate;
          const dW = Math.round(stats.distanceWithin / 1000);
          distWithinRow[colIndex] = `${dW} km`;
          totalStopsRow[colIndex] = stats.totalStops;
          uniqueClientsRow[colIndex] = stats.clientsVisited.size;

          start24hRow[colIndex] = stats.start24h;
          startClientsRow[colIndex] = stats.startClients;

          timeWithClientsRow[colIndex] = formatDuration(stats.timeWithClients);
          timeWithNonClientsRow[colIndex] = formatDuration(
            stats.timeWithNonClients
          );
          timeAtToolsRow[colIndex] = formatDuration(stats.timeAtTools);
          timeAtHomeRow[colIndex] = formatDuration(stats.timeAtHome);
          travelTimeRow[colIndex] = formatDuration(stats.travelTime);

          timeClientsOutRow[colIndex] = formatDuration(
            stats.timeWithClientsAfter
          );
          timeNonClientsOutRow[colIndex] = formatDuration(
            stats.timeWithNonClientsAfter
          );
          travelTimeOutRow[colIndex] = formatDuration(stats.travelTimeAfter);
          const dO = Math.round(stats.distanceOutside / 1000);
          distOutsideRow[colIndex] = `${dO} km`;

          totDistWithin += dW;
          totStops += stats.totalStops;
          stats.clientsVisited.forEach((k) => allClientsVisitedWeek.add(k));
          totTimeClients += stats.timeWithClients;
          totTimeNonClients += stats.timeWithNonClients;
          totTools += stats.timeAtTools;
          totHome += stats.timeAtHome;
          totTravel += stats.travelTime;
          totTimeClientsOut += stats.timeWithClientsAfter;
          totTimeNonClientsOut += stats.timeWithNonClientsAfter;
          totTravelOut += stats.travelTimeAfter;
          totDistOut += dO;
        }
      }

      const lastIdx = 8;
      vehicleRow[lastIdx] = '';
      distWithinRow[lastIdx] = `${totDistWithin} km`;
      totalStopsRow[lastIdx] = totStops;
      uniqueClientsRow[lastIdx] = allClientsVisitedWeek.size;
      timeWithClientsRow[lastIdx] = formatDuration(totTimeClients);
      timeWithNonClientsRow[lastIdx] = formatDuration(totTimeNonClients);
      timeAtToolsRow[lastIdx] = formatDuration(totTools);
      timeAtHomeRow[lastIdx] = formatDuration(totHome);
      travelTimeRow[lastIdx] = formatDuration(totTravel);
      timeClientsOutRow[lastIdx] = formatDuration(totTimeClientsOut);
      timeNonClientsOutRow[lastIdx] = formatDuration(totTimeNonClientsOut);
      travelTimeOutRow[lastIdx] = formatDuration(totTravelOut);
      distOutsideRow[lastIdx] = `${totDistOut} km`;

      const totalClientsInList = clientsForReport.filter(
        (c) => !c.isVendorHome
      ).length;
      const clientsVisitedInList = Array.from(allClientsVisitedWeek).filter(
        (key) => {
          const clientKey = key.split('_')[0];
          return !specialNonClientKeys.includes(clientKey);
        }
      ).length;
      const totalNonVisitedWeek = Math.max(
        0,
        totalClientsInList - clientsVisitedInList
      );
      const nonVisitedClientsRow = [
        'Clientes NO Visitados',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        totalNonVisitedWeek,
      ];

      // 1.1 Paradas
      sheetData.push(vehicleRow);
      sheetData.push(distWithinRow);
      sheetData.push(totalStopsRow);
      sheetData.push(uniqueClientsRow);
      sheetData.push(nonVisitedClientsRow);

      // 1.2 Tiempos
      sheetData.push(['Resumen de Tiempos']);
      sheetData.push(start24hRow);
      sheetData.push(startClientsRow);
      sheetData.push(timeWithClientsRow);
      sheetData.push(timeWithNonClientsRow);
      sheetData.push(timeAtToolsRow);
      sheetData.push(timeAtHomeRow);
      sheetData.push(travelTimeRow);

      // 2. Fuera Horario
      sheetData.push([]);
      const summaryOutsideStartRow = sheetData.length;
      sheetData.push(['RESUMEN SEMANAL - FUERA DE HORARIO']);
      sheetData.push(timeClientsOutRow);
      sheetData.push(timeNonClientsOutRow);
      sheetData.push(travelTimeOutRow);
      sheetData.push(distOutsideRow);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const merges: XLSX.Range[] = [];
      const totalCols = headers.length - 1;

      ws['A1'].s = styles.title;
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols } });
      ws['A2'].s = styles.subHeader;
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols } });

      for (let c = 0; c <= totalCols; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRowIndex, c })];
        if (cell) cell.s = styles.header;
      }

      sortedClients.forEach((client, index) => {
        const r = headerRowIndex + 1 + index;
        const clientVisitKey = `${client.key}_${client.branchNumber || 'main'}`;
        const isVisited = allVisitsMap.has(clientVisitKey);
        let style;
        const isToolsClient = specialNonClientKeys.includes(client.key);
        if (isVisited) {
          if (client.isVendorHome) style = styles.vendorHomeVisitedCell;
          else if (isToolsClient) style = styles.toolsVisitedCell;
          else style = styles.clientVisitedCell;
        } else {
          if (client.isVendorHome)
            style = {
              ...styles.vendorHomeVisitedCell,
              fill: { fgColor: { rgb: 'FFFFF9E6' } },
            };
          else if (isToolsClient)
            style = {
              ...styles.toolsVisitedCell,
              fill: { fgColor: { rgb: 'FFFFF0F0' } },
            };
          else style = styles.cell;
        }
        ws[XLSX.utils.encode_cell({ r, c: 0 })].s = style;
        for (let c = 1; c <= 7; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell) cell.s = styles.cellCentered;
        }
        const totalCell = ws[XLSX.utils.encode_cell({ r, c: totalCols })];
        if (totalCell) totalCell.s = styles.cell;
      });

      ws[XLSX.utils.encode_cell({ r: summaryStartRow, c: 0 })].s =
        styles.subHeader;
      merges.push({
        s: { r: summaryStartRow, c: 0 },
        e: { r: summaryStartRow, c: totalCols },
      });

      const paradasHeaderRow = summaryStartRow + 1;
      ws[XLSX.utils.encode_cell({ r: paradasHeaderRow, c: 0 })].s =
        styles.summarySubHeader;
      merges.push({
        s: { r: paradasHeaderRow, c: 0 },
        e: { r: paradasHeaderRow, c: totalCols },
      });

      const tiemposHeaderRow = summaryStartRow + 7;
      ws[XLSX.utils.encode_cell({ r: tiemposHeaderRow, c: 0 })].s =
        styles.summarySubHeader;
      merges.push({
        s: { r: tiemposHeaderRow, c: 0 },
        e: { r: tiemposHeaderRow, c: totalCols },
      });

      const section1Rows = 14;
      const redRowsIndices = new Set([
        summaryStartRow + 6, // No Visitados
        summaryStartRow + 11, // Tiempo con no clientes
        summaryStartRow + 12, // Tiempo Tools
        summaryStartRow + 13, // Tiempo en casa
      ]);

      for (
        let r = summaryStartRow + 2;
        r <= summaryStartRow + section1Rows;
        r++
      ) {
        if (r === tiemposHeaderRow) continue;
        const isRedRow = redRowsIndices.has(r);
        const labelCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (labelCell)
          labelCell.s = isRedRow ? styles.summaryLabelRed : styles.summaryLabel;
        for (let c = 1; c < totalCols; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell)
            cell.s = isRedRow ? styles.summaryValueRed : styles.summaryValue;
        }
        const totalCell = ws[XLSX.utils.encode_cell({ r, c: totalCols })];
        if (totalCell)
          totalCell.s = isRedRow
            ? styles.summaryTotalColRed
            : styles.summaryTotalCol;
      }

      ws[XLSX.utils.encode_cell({ r: summaryOutsideStartRow, c: 0 })].s =
        styles.subHeaderOutside;
      merges.push({
        s: { r: summaryOutsideStartRow, c: 0 },
        e: { r: summaryOutsideStartRow, c: totalCols },
      });

      const section2Rows = 4;
      for (
        let r = summaryOutsideStartRow + 1;
        r <= summaryOutsideStartRow + section2Rows;
        r++
      ) {
        const isRedRow = r === summaryOutsideStartRow + 2;
        const labelCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (labelCell)
          labelCell.s = isRedRow ? styles.summaryLabelRed : styles.summaryLabel;
        for (let c = 1; c < totalCols; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell)
            cell.s = isRedRow ? styles.summaryValueRed : styles.summaryValue;
        }
        const totalCell = ws[XLSX.utils.encode_cell({ r, c: totalCols })];
        if (totalCell)
          totalCell.s = isRedRow
            ? styles.summaryTotalColRed
            : styles.summaryTotalCol;
      }

      ws['!cols'] = [
        { wch: 50 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
      ];
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte Semanal');

      const safeSelection =
        selection.value?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';
      const sortedKeys = Object.keys(allTripsData).sort((a, b) => {
        const dateA = parseISO(allTripsData[a].vehicleInfo.fecha).getTime();
        const dateB = parseISO(allTripsData[b].vehicleInfo.fecha).getTime();
        return dateA - dateB;
      });

      let datePart = 'SinDatos';
      if (sortedKeys.length > 0) {
        const firstDate = allTripsData[sortedKeys[0]].vehicleInfo.fecha;
        const lastDate =
          allTripsData[sortedKeys[sortedKeys.length - 1]].vehicleInfo.fecha;

        if (firstDate === lastDate) {
          datePart = formatExcelDate(firstDate).replace(/[^a-zA-Z0-9]/g, '-');
        } else {
          datePart = `${formatExcelDate(firstDate).replace(/[^a-zA-Z0-9]/g, '-')}_a_${formatExcelDate(lastDate).replace(/[^a-zA-Z0-9]/g, '-')}`;
        }
      }

      const fileName = `Reporte_Viaje_${safeSelection}_${datePart}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err: any) {
      console.error(err);
      alert(`Error al generar el reporte: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Función para descargar el mapa HTML
  const downloadMap = () => {
    const summaryStats = calculateSummaryStats();
    const mapClients = selection.mode === 'driver' ? [] : clientData;

    const htmlContent = generateMapHTML(
      tripData,
      vehicleInfo,
      mapClients,
      matchedStopsCount,
      selection.value,
      minStopDuration,
      viewMode,
      googleMapsApiKey,
      summaryStats
    );

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa_viaje_${fileName?.replace(/\.xlsx?$/, '') || 'reporte'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // FUNCIÓN PARA ABRIR EL MAPA
  const openMapInTab = () => {
    const summaryStats = calculateSummaryStats();

    const mapClients = selection.mode === 'driver' ? [] : clientData;

    const htmlContent = generateMapHTML(
      tripData,
      vehicleInfo,
      mapClients,
      matchedStopsCount,
      selection.value,
      minStopDuration,
      viewMode,
      googleMapsApiKey,
      summaryStats
    );

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Función auxiliar para calcular estadísticas del viaje
  const calculateSummaryStats = () => {
    const stats = {
      // Tiempos dentro de horario laboral
      timeWithClients: 0,
      timeWithNonClients: 0,
      travelTime: 0,
      timeAtHome: 0,
      timeAtTools: 0,

      // Tiempos fuera de horario laboral
      timeWithClientsAfterHours: 0,
      timeWithNonClientsAfterHours: 0,
      travelTimeAfterHours: 0,
      timeAtHomeAfterHours: 0,
      timeAtToolsAfterHours: 0,

      // Totales
      totalWorkingTime: 0,
      totalAfterHoursTime: 0,
      totalTimeWithNonClients: 0,
      totalTimeWithNonClientsAfterHours: 0,

      // Porcentajes (solo del horario laboral)
      percentageClients: 0,
      percentageNonClients: 0,
      percentageTravel: 0,
      percentageAtHome: 0,
      percentageAtTools: 0,
      percentageTotalNonClients: 0,

      // Distancias
      distanceWithinHours: 0,
      distanceAfterHours: 0,

      // Contador de clientes únicos
      uniqueClientsVisited: 0,
    };

    if (!tripData || !vehicleInfo?.fecha) return stats;

    const dateObj = parseISO(vehicleInfo.fecha);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const timeToMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 60 + m + (s || 0) / 60;
    };

    const WORK_START_MINUTES = 8 * 60 + 30;
    const WORK_END_MINUTES = 19 * 60;

    const splitDurationByWorkingHours = (
      startTime: string,
      durationMinutes: number
    ): { withinHours: number; outsideHours: number } => {
      if (isWeekend) {
        return { withinHours: 0, outsideHours: durationMinutes };
      }
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + durationMinutes;

      let withinHours = 0;
      let outsideHours = 0;

      for (let minute = startMinutes; minute < endMinutes; minute++) {
        const currentMinute = minute % (24 * 60);

        if (
          currentMinute >= WORK_START_MINUTES &&
          currentMinute < WORK_END_MINUTES
        ) {
          withinHours++;
        } else {
          outsideHours++;
        }
      }

      return { withinHours, outsideHours };
    };

    const startEvents = tripData.flags.filter((flag) => flag.type === 'start');
    const endEvents = tripData.flags.filter((flag) => flag.type === 'end');

    if (startEvents.length === 0 || endEvents.length === 0) return stats;

    const firstStartEvent = startEvents[0];
    const lastEndEvent = endEvents[endEvents.length - 1];

    // CALCULAR TIEMPO TOTAL DEL VIAJE
    const calculateWorkingTimeBetween = (
      startTime: string,
      endTime: string
    ): {
      totalMinutes: number;
      workingMinutes: number;
      afterHoursMinutes: number;
    } => {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);

      let totalMinutes = 0;
      let workingMinutes = 0;
      let afterHoursMinutes = 0;

      if (endMinutes >= startMinutes) {
        totalMinutes = endMinutes - startMinutes;
      } else {
        totalMinutes = 24 * 60 - startMinutes + endMinutes;
      }

      if (isWeekend) {
        return {
          totalMinutes,
          workingMinutes: 0,
          afterHoursMinutes: totalMinutes,
        };
      }

      if (endMinutes >= startMinutes) {
        totalMinutes = endMinutes - startMinutes;
        for (let minute = startMinutes; minute < endMinutes; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
      } else {
        totalMinutes = 24 * 60 - startMinutes + endMinutes;

        for (let minute = startMinutes; minute < 24 * 60; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
        for (let minute = 0; minute < endMinutes; minute++) {
          if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES) {
            workingMinutes++;
          } else {
            afterHoursMinutes++;
          }
        }
      }

      return { totalMinutes, workingMinutes, afterHoursMinutes };
    };

    const tripTimes = calculateWorkingTimeBetween(
      firstStartEvent.time,
      lastEndEvent.time
    );

    stats.totalWorkingTime = tripTimes.workingMinutes;
    stats.totalAfterHoursTime = tripTimes.afterHoursMinutes;

    const specialNonClientKeys = ['3689', '6395'];

    const realClientsVisited = tripData.flags.filter(
      (flag) =>
        flag.type === 'stop' &&
        (flag.duration || 0) >= minStopDuration &&
        flag.clientKey &&
        flag.clientName !== 'Sin coincidencia' &&
        !flag.isVendorHome &&
        !specialNonClientKeys.includes(flag.clientKey)
    );

    // CALCULAR TIEMPOS DE PARADA
    tripData.flags.forEach((flag) => {
      if (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration) {
        const duration = flag.duration || 0;
        const split = splitDurationByWorkingHours(flag.time, duration);

        if (flag.isVendorHome) {
          // 1. Casa del vendedor
          stats.timeAtHome += split.withinHours;
          stats.timeAtHomeAfterHours += split.outsideHours;
        } else if (specialNonClientKeys.includes(flag.clientKey || '')) {
          // 2. Tools de Mexico
          stats.timeAtTools += split.withinHours;
          stats.timeAtToolsAfterHours += split.outsideHours;
        } else if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
          // 3. Cliente válido
          stats.timeWithClients += split.withinHours;
          stats.timeWithClientsAfterHours += split.outsideHours;
        } else {
          // 4. Parada sin coincidencia
          stats.timeWithNonClients += split.withinHours;
          stats.timeWithNonClientsAfterHours += split.outsideHours;
        }
      }
    });

    //CALCULAR TOTAL DE TIEMPO CON NO CLIENTES
    if (stats.totalWorkingTime > 0) {
      stats.totalTimeWithNonClients =
        stats.timeAtHome + stats.timeAtTools + stats.timeWithNonClients;
      stats.percentageTotalNonClients =
        (stats.totalTimeWithNonClients / stats.totalWorkingTime) * 100;
    }

    //CALCULAR TOTAL DE TIEMPO CON NO CLIENTES - HORAS NO LABORALES
    if (stats.totalAfterHoursTime > 0) {
      stats.totalTimeWithNonClientsAfterHours =
        stats.timeAtHomeAfterHours +
        stats.timeAtToolsAfterHours +
        stats.timeWithNonClientsAfterHours;
    }

    // CALCULAR TIEMPO DE TRASLADO
    const totalStopTimeWorkingHours =
      stats.timeWithClients +
      stats.timeWithNonClients +
      stats.timeAtHome +
      stats.timeAtTools;
    stats.travelTime = Math.max(
      0,
      stats.totalWorkingTime - totalStopTimeWorkingHours
    );

    const totalStopTimeAfterHours =
      stats.timeWithClientsAfterHours +
      stats.timeWithNonClientsAfterHours +
      stats.timeAtHomeAfterHours +
      stats.timeAtToolsAfterHours;
    stats.travelTimeAfterHours = Math.max(
      0,
      stats.totalAfterHoursTime - totalStopTimeAfterHours
    );

    // CALCULAR PORCENTAJES (horario laboral)
    if (stats.totalWorkingTime > 0) {
      stats.percentageClients =
        (stats.timeWithClients / stats.totalWorkingTime) * 100;
      stats.percentageNonClients =
        (stats.timeWithNonClients / stats.totalWorkingTime) * 100;
      stats.percentageTravel =
        (stats.travelTime / stats.totalWorkingTime) * 100;
      stats.percentageAtHome =
        (stats.timeAtHome / stats.totalWorkingTime) * 100;
      stats.percentageAtTools =
        (stats.timeAtTools / stats.totalWorkingTime) * 100;
    }

    // CALCULAR DISTANCIAS POR HORARIO
    if (
      tripData.routes &&
      tripData.routes[0]?.path &&
      tripData.flags.length > 0
    ) {
      const routePath = tripData.routes[0].path;
      const startFlag = tripData.flags.find((f) => f.type === 'start');
      const endFlag = tripData.flags.find((f) => f.type === 'end');

      if (startFlag && endFlag) {
        const startMinutes = startFlag.time.split(':').map(Number);
        const endMinutes = endFlag.time.split(':').map(Number);
        const totalStartMinutes = startMinutes[0] * 60 + startMinutes[1];
        const totalEndMinutes = endMinutes[0] * 60 + endMinutes[1];
        const tripDurationMinutes =
          totalEndMinutes >= totalStartMinutes
            ? totalEndMinutes - totalStartMinutes
            : 24 * 60 - totalStartMinutes + totalEndMinutes;

        for (let i = 0; i < routePath.length - 1; i++) {
          const point1 = routePath[i];
          const point2 = routePath[i + 1];

          const segmentDistance = calculateDistance(
            point1.lat,
            point1.lng,
            point2.lat,
            point2.lng
          );

          const progressRatio = i / (routePath.length - 1);
          const estimatedMinutes =
            totalStartMinutes + tripDurationMinutes * progressRatio;
          const estimatedHours = Math.floor(estimatedMinutes / 60) % 24;
          const estimatedMins = Math.floor(estimatedMinutes % 60);
          const estimatedTime = `${String(estimatedHours).padStart(2, '0')}:${String(estimatedMins).padStart(2, '0')}:00`;

          const isInWorkingHours =
            !isWeekend &&
            isWorkingHours(estimatedTime, vehicleInfo?.fecha || '');

          if (isInWorkingHours) {
            stats.distanceWithinHours += segmentDistance;
          } else {
            stats.distanceAfterHours += segmentDistance;
          }
        }
      }
    }

    const uniqueRealClients = new Set(
      realClientsVisited.map((flag) => flag.clientKey)
    );
    stats.uniqueClientsVisited = uniqueRealClients.size;

    return stats;
  };

  const summaryStats = calculateSummaryStats();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* SIDEBAR IZQUIERDO */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-80'
        } bg-white shadow-lg transition-all duration-300 flex flex-col relative z-20`}
      >
        {/* Header del Sidebar */}
        <div className="pt-4 pl-4 pr-4 pb-2 border-b border-gray-200 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <Car className="w-7 h-7 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-800">Rutas</h1>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            <svg
              className={`w-5 h-5 transition-transform ${
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

        {/* LOGICA DE VISUALIZACIÓN DEL SIDEBAR */}
        {!sidebarCollapsed && (
          <>
            {/* COMPROBACIÓN DE BASE DE DATOS DE CLIENTES */}
            {!isLoadingClients &&
            (!masterClients || masterClients.length === 0) ? (
              // VISTA DE ERROR / BASE DE DATOS VACÍA
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
              // VISTA NORMAL (CONFIGURACIÓN)
              <>
                <div className="overflow-x-auto">
                  <div className="flex border-b border-gray-200">
                    <button
                      onClick={() => setActiveTab('config')}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                        activeTab === 'config'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Configuración
                    </button>
                    <button
                      onClick={() => setActiveTab('info')}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                        !tripData
                          ? 'text-gray-300 cursor-not-allowed'
                          : activeTab === 'info'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-600 hover:text-gray-800'
                      }`}
                      disabled={!tripData}
                    >
                      Información
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Tab: Configuración */}
                  {activeTab === 'config' && (
                    <div className="p-4 space-y-4">
                      {/* Upload de Ruta */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex gap-2 items-center">
                            <RiRoadMapLine className="w-4 h-4 text-blue-600" />
                            <label className="block text-sm font-medium text-gray-700">
                              Cargar Archivo(s) de Ruta
                            </label>
                          </div>

                          {/* Boton de borrar */}
                          {Object.keys(allTripsData).length > 0 && (
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    '¿Estás seguro de que deseas borrar todos los viajes cargados?'
                                  )
                                ) {
                                  setAllTripsData({});
                                  setActiveDate(null);
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
                        <label
                          htmlFor="dropzone-file"
                          className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Upload className="w-8 h-8 mb-2 text-blue-500 animate-bounce" />
                          {fileName ? (
                            <p className="text-xs font-semibold text-blue-700 text-center px-2">
                              {fileName}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-600">XLSX, XLS</p>
                          )}
                          <input
                            ref={fileInputRef}
                            id="dropzone-file"
                            type="file"
                            className="hidden"
                            onChange={handleFileUpload}
                            accept=".xlsx, .xls"
                            multiple
                          />
                        </label>
                      </div>

                      {/* Selección de Vendedor */}
                      {tripData && availableVendors.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-gray-200">
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Configuración de Filtros
                          </h3>

                          {/* Selección de Vendedor */}
                          <div>
                            <label className="flex text-sm font-medium text-gray-700 mb-2 items-center gap-2">
                              <UserCheck className="w-4 h-4 text-green-600" />{' '}
                              Vendedor
                            </label>

                            <div className="bg-gray-50 p-2 rounded-xl border border-gray-200">
                              <div className="flex flex-wrap gap-2 mt-2">
                                {availableVendors.map((vendor) => (
                                  <button
                                    key={vendor}
                                    onClick={() => handleSelection(vendor)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all duration-200 ${
                                      selection.value === vendor
                                        ? 'bg-green-500 text-white border-green-500 shadow-md shadow-green-200 transform scale-105'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-600'
                                    }
                                `}
                                  >
                                    {vendor}
                                  </button>
                                ))}

                                <button
                                  onClick={() => handleSelection('chofer')}
                                  className={`w-full px-3 py-2 text-xs font-semibold rounded border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                    selection.value === 'chofer'
                                      ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600'
                                  }`}
                                >
                                  <Truck className="w-4 h-4" />
                                  MODO CHOFER
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Control de Origen de Horario */}
                          <div>
                            <label className="flex text-sm font-medium items-center text-gray-700 mb-2 gap-2">
                              <ClockFading className="w-4 h-4 text-purple-600" />
                              Tipo de Horario (Archivo)
                            </label>
                            <div className="flex rounded-lg border border-purple-300 overflow-hidden">
                              <button
                                onClick={() => setTimezoneSource('TIJ')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                  timezoneSource === 'TIJ'
                                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                                    : 'bg-white text-purple-600 hover:bg-purple-50'
                                }`}
                                title="El archivo ya viene en hora de Tijuana (Archivos nuevos)"
                              >
                                Tijuana (Original)
                              </button>
                              <button
                                onClick={() => setTimezoneSource('CDMX')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                  timezoneSource === 'CDMX'
                                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                                    : 'bg-white text-purple-600 hover:bg-purple-50'
                                }`}
                                title="El archivo viene en hora CDMX y requiere conversión (Archivos viejos)"
                              >
                                CDMX (Convertir)
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 pl-1">
                              * Usa "Tijuana" para archivos nuevos y "CDMX" para
                              los anteriores al cambio.
                            </p>
                          </div>

                          {/* Modo de Vista */}
                          <div>
                            <label className="flex text-sm font-medium items-center text-gray-700 mb-2 gap-2">
                              <CarFront className="w-4 h-4 text-blue-600" />
                              Modo de Traslado
                            </label>
                            <div className="flex rounded-lg border border-blue-300 overflow-hidden">
                              <button
                                onClick={() => setViewMode('current')}
                                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                                  viewMode === 'current'
                                    ? 'bg-blue-600 text-white hover:bg-blue-800'
                                    : 'bg-white text-blue-600 hover:bg-blue-50'
                                }`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <Users className="w-4 h-4" />
                                  Clientes
                                </div>
                              </button>
                              <button
                                onClick={() => setViewMode('new')}
                                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                                  viewMode === 'new'
                                    ? 'bg-blue-600 text-white hover:bg-blue-800'
                                    : 'bg-white text-blue-600 hover:bg-blue-50'
                                }`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <CalendarClock className="w-4 h-4" />
                                  24 horas
                                </div>
                              </button>
                            </div>
                          </div>

                          {/* Configuración de Paradas */}
                          <div className="space-y-2 pt-4 border-t border-gray-200">
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                              <label className="flex justify-between text-xs font-semibold text-gray-600 mb-2">
                                <span>Duracion minima de paradas</span>
                                <span className="text-blue-600">
                                  {minStopDuration} minutos
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
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-full cursor-pointer
                                  border border-gray-300 hover:border-blue-500 hover:text-blue-700 shadow-sm transition-all active:scale-95"
                                  disabled={minStopDuration <= 1}
                                >
                                  <Minus className="w-3 h-3" />
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
                                  className="flex-1 h-2 bg-gray-200 rounded-lg cursor-pointer accent-blue-600"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMinStopDuration((prev) =>
                                      Math.min(120, prev + 1)
                                    )
                                  }
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-full cursor-pointer
                                  border border-gray-300 hover:border-blue-500 hover:text-blue-700 shadow-sm transition-all active:scale-95"
                                  disabled={minStopDuration >= 120}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                              <label className="flex justify-between text-xs font-semibold text-gray-600 mb-2">
                                <span>Radio de Coincidencia</span>
                                <span className="text-blue-600">
                                  {clientRadius} metros
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
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-full cursor-pointer
                                  border border-gray-300 hover:border-blue-500 hover:text-blue-700 shadow-sm transition-all active:scale-95"
                                  disabled={clientRadius <= 10}
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
                                  className="flex-1 h-2 bg-gray-200 rounded-lg cursor-pointer accent-blue-600"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setClientRadius((prev) =>
                                      Math.min(1000, prev + 10)
                                    )
                                  }
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-full cursor-pointer 
                                  border border-gray-300 hover:border-blue-500 hover:text-blue-700 shadow-sm transition-all active:scale-95"
                                  disabled={clientRadius >= 1000}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Información */}
                  {activeTab === 'info' && tripData && vehicleInfo && (
                    <div className="p-4 space-y-4">
                      {/* Info del Vehículo */}
                      <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <CarFront className="w-3 h-3 font-semibold text-blue-900" />
                          <h3 className="text-sm font-semibold text-blue-900">
                            Información del Vehículo
                          </h3>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Descripción:</span>
                            <span className="font-medium">
                              {vehicleInfo.descripcion}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Placa:</span>
                            <span className="font-medium">
                              {vehicleInfo.placa}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Fecha:</span>
                            <span className="font-medium">
                              {vehicleInfo.fecha}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Resumen del Viaje */}
                      <div className="bg-green-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Route className="w-3 h-3 font-semibold text-green-900" />
                          <h3 className="text-sm font-semibold text-green-900">
                            Resumen del Viaje
                          </h3>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Clientes visitados:
                            </span>
                            <span className="font-medium">
                              {summaryStats.uniqueClientsVisited}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Distancia total:
                            </span>
                            <span className="font-medium">
                              {Math.round(tripData.totalDistance / 1000)} km
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Inicio:</span>
                            <span className="font-medium">
                              {tripData.workStartTime || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Fin:</span>
                            <span className="font-medium">
                              {tripData.workEndTime || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Estadísticas de Tiempo */}
                      <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileClock className="w-3 h-3 font-semibold text-yellow-900" />
                          <h3 className="text-sm font-semibold text-yellow-900">
                            Distribución de Tiempo
                          </h3>
                        </div>

                        {/* Información dentro de horario laboral */}
                        <div className="space-y-1 text-xs">
                          <h4 className="font-semibold text-gray-800">
                            Dentro de Horario Laboral
                          </h4>
                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1">
                              Con Clientes:
                            </span>
                            <span className="text-gray-600 font-bold text-right col-span-1">
                              {formatDuration(summaryStats.timeWithClients)}
                            </span>
                            <span className="text-green-600 text-sm font-bold text-right col-span-1">
                              {summaryStats.percentageClients.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1">
                              Sin Clientes:
                            </span>
                            <span className="text-gray-600 font-bold text-right col-span-1">
                              {formatDuration(
                                summaryStats.totalTimeWithNonClients
                              )}
                            </span>
                            <span className="text-red-600 text-sm font-bold text-right col-span-1">
                              {summaryStats.percentageTotalNonClients.toFixed(
                                1
                              )}
                              %
                            </span>
                          </div>

                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1 pl-2">
                              - En paradas:
                            </span>
                            <span className="text-gray-800 text-right col-span-1">
                              {formatDuration(summaryStats.timeWithNonClients)}
                            </span>
                            <span className="text-red-800 text-right col-span-1">
                              {summaryStats.percentageNonClients.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1 pl-2">
                              - En Tools:
                            </span>
                            <span className="text-gray-800 text-right col-span-1">
                              {formatDuration(summaryStats.timeAtTools)}
                            </span>
                            <span className="text-red-800 text-right col-span-1">
                              {summaryStats.percentageAtTools.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1 pl-2">
                              - En Casa:
                            </span>
                            <span className="text-gray-800 text-right col-span-1">
                              {formatDuration(summaryStats.timeAtHome)}
                            </span>
                            <span className="text-red-800 text-right col-span-1">
                              {summaryStats.percentageAtHome.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 items-center gap-2">
                            <span className="text-gray-600 text-left col-span-1">
                              En Traslados:
                            </span>
                            <span className="text-gray-600 font-bold text-right col-span-1">
                              {formatDuration(summaryStats.travelTime)}
                            </span>
                            <span className="text-blue-600 text-sm font-bold text-right col-span-1">
                              {summaryStats.percentageTravel.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Información fuera de horario laboral */}
                        <div className="space-y-1 text-xs">
                          <h4 className="font-semibold text-gray-800">
                            Fuera de Horario Laboral
                          </h4>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Con clientes:</span>
                            <div className="text-right">
                              <span className="font-medium block">
                                {formatDuration(
                                  summaryStats.timeWithClientsAfterHours
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Sin clientes:</span>
                            <div className="text-right">
                              <span className="font-medium block">
                                {formatDuration(
                                  summaryStats.totalTimeWithNonClientsAfterHours
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">En traslados:</span>
                            <div className="text-right">
                              <span className="font-medium block">
                                {formatDuration(
                                  summaryStats.travelTimeAfterHours
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Iconos cuando está colapsado */}
        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <button
              onClick={() => {
                setSidebarCollapsed(false);
                setActiveTab('config');
              }}
              className="p-3 py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
              title="Configuración"
            >
              <Upload className="w-6 h-6 animate-bounce" />
            </button>
            {tripData && (
              <button
                onClick={() => {
                  setSidebarCollapsed(false);
                  setActiveTab('info');
                }}
                className="p-3 py-20 bg-green-100 text-green-600 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
                title="Información"
              >
                <Car className="w-6 h-6 animate-bounce" />
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ÁREA PRINCIPAL: MAPA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header del Mapa */}
        <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <h2 className="text-md font-semibold text-gray-800">
            {tripData
              ? 'Vista Previa del Mapa'
              : 'Carga el archivo para comenzar'}
          </h2>
          {tripData && (
            <div className="flex items-center gap-3">
              {/* Seleccion del dia */}
              {Object.keys(allTripsData).length > 0 && (
                <div className="relative">
                  <select
                    id="date-selector"
                    value={activeDate || ''}
                    onFocus={() => setIsSelectOpen(true)}
                    onBlur={() => setIsSelectOpen(false)}
                    onChange={(e) => {
                      setActiveDate(e.target.value);
                      setIsSelectOpen(false);
                      e.target.blur();
                    }}
                    className="w-full pl-3 pr-10 py-1.5 text-sm border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 hover:ring-2 hover:ring-blue-500"
                  >
                    <option value="" disabled>
                      Selecciona un día
                    </option>
                    {Object.keys(allTripsData)
                      .sort((a, b) => {
                        const dayA = parseInt(a) === 0 ? 7 : parseInt(a);
                        const dayB = parseInt(b) === 0 ? 7 : parseInt(b);
                        return dayA - dayB;
                      })
                      .map((dayKey) => {
                        const entry = allTripsData[dayKey];
                        const dateObj = parseISO(entry.vehicleInfo.fecha);

                        const formatted = formatDate(
                          dateObj,
                          'EEEE, dd-MM-yyyy',
                          { locale: es }
                        );

                        const capitalized =
                          formatted.charAt(0).toUpperCase() +
                          formatted.slice(1);

                        return (
                          <option key={dayKey} value={dayKey}>
                            {capitalized}
                          </option>
                        );
                      })}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isSelectOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Boton para generar el reporte */}
              <button
                onClick={downloadReport}
                disabled={isGeneratingReport || !selection.value}
                className="flex items-center text-sm justify-center font-medium px-4 py-2 bg-blue-600 text-white hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all disabled:bg-gray-300 disabled:text-white disabled:cursor-not-allowed"
              >
                <ChartBar className="w-4 h-4 mr-2" />
                {isGeneratingReport ? 'Generando...' : 'Generar Reporte'}
              </button>

              {/* Botón para móvil */}
              <button
                onClick={openMapInTab}
                className="flex sm:hidden items-center justify-center font-medium px-4 py-2 bg-teal-500 text-white hover:text-teal-500 hover:bg-teal-100 rounded-lg transition-all"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Mapa
              </button>

              {/* Botón para desktop */}
              <button
                onClick={downloadMap}
                className="hidden sm:flex items-center text-sm font-medium justify-center px-4 py-2 text-white bg-green-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar Mapa
              </button>
            </div>
          )}
        </div>

        {/* Contenedor del Mapa */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {tripData ? (
            <InteractiveMap
              tripData={tripData}
              vehicleInfo={vehicleInfo}
              clientData={selection.mode === 'driver' ? [] : clientData}
              minStopDuration={minStopDuration}
              selection={selection.value}
              viewMode={viewMode}
              summaryStats={summaryStats}
              googleMapsApiKey={googleMapsApiKey}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  No hay datos de ruta cargados
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Sube un archivo desde el panel lateral
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Error Toast */}
      {error && (
        <div
          className={`
            fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg 
            flex items-center gap-3 max-w-md z-50
            transition-all duration-500 ease-in-out
            ${
              isToastVisible
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-10'
            }
          `}
        >
          <button
            onClick={handleCloseToast}
            className="ml-auto hover:bg-red-600 p-1 rounded-4xl"
          >
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <p className="text-sm">{error}</p>
          <button
            onClick={handleCloseToast}
            className="ml-auto hover:bg-red-600 p-1 rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
