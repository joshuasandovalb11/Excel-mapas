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
} from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

import { parseISO, format as formatDate } from 'date-fns';
import { es } from 'date-fns/locale';

import {
  processTripData,
  parseVehicleInfo,
  calculateDistance,
  formatDuration,
  processMasterClientFile,
  type ProcessedTrip,
  type VehicleInfo,
  type Client,
} from '../utils/tripUtils';

// Definimos una interfaz para lo que vamos a almacenar por cada viaje
interface TripStorage {
  rawData: any[];
  vehicleInfo: VehicleInfo;
  fileName: string;
}

export default function VehicleTracker() {
  const [allTripsData, setAllTripsData] = usePersistentState<
    Record<string, TripStorage>
  >('vt_allTripsData', {});

  const [activeDate, setActiveDate] = usePersistentState<string | null>(
    'vt_activeDate',
    null
  );

  const [tripData, setTripData] = usePersistentState<ProcessedTrip | null>(
    'vt_tripData',
    null
  );
  const [rawTripData, setRawTripData] = usePersistentState<any[] | null>(
    'vt_rawTripData',
    null
  );
  const [vehicleInfo, setVehicleInfo] = usePersistentState<VehicleInfo | null>(
    'vt_vehicleInfo',
    null
  );
  const [clientData, setClientData] = usePersistentState<Client[] | null>(
    'vt_clientData',
    null
  );
  const [fileName, setFileName] = usePersistentState<string | null>(
    'vt_fileName',
    null
  );
  const [clientFileName, setClientFileName] = usePersistentState<string | null>(
    'vt_clientFileName',
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

  const [allClientsFromFile, setAllClientsFromFile] = usePersistentState<
    Client[] | null
  >('vt_allClients', null);
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
  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

  // Función para obtener la dirección a partir de coordenadas usando la API de Google Maps
  // const getAddress = async (lat: number, lng: number): Promise<string> => {
  //   if (!googleMapsApiKey) {
  //     return 'API Key de Google Maps no configurada';
  //   }
  //   if (!lat || !lng) return 'Coordenadas inválidas';

  //   try {
  //     const response = await fetch(
  //       `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsApiKey}`
  //     );
  //     if (!response.ok) {
  //       throw new Error(
  //         `Error en la respuesta de la API de Google: ${response.statusText}`
  //       );
  //     }
  //     const data = await response.json();

  //     if (data.status === 'OK' && data.results && data.results[0]) {
  //       return data.results[0].formatted_address;
  //     } else {
  //       console.error(
  //         'Error de Geocodificación de Google:',
  //         data.error_message || data.status
  //       );
  //       return `Dirección no encontrada (${data.status})`;
  //     }
  //   } catch (error) {
  //     console.error('Error de red en la llamada a Google Maps:', error);
  //     return `Dirección no disponible (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  //   }
  // };

  // Función para verificar si una parada está en horario laboral
  const isWorkingHours = (
    time: string,
    tripDate: string | undefined
  ): boolean => {
    if (!time || !tripDate) return true;

    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;

    // Horario laboral: 8:30 (510 minutos) a 19:00 (1140 minutos)
    const WORK_START_MINUTES = 8 * 60 + 30; // 510
    const WORK_END_MINUTES = 19 * 60; // 1140

    return (
      totalMinutes >= WORK_START_MINUTES && totalMinutes < WORK_END_MINUTES
    );
  };

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
      const matchedStops = updatedFlags.filter(
        (flag) => flag.type === 'stop' && flag.clientName !== 'Sin coincidencia'
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

  // Función para cerrar el toast manualmente
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
          clientData
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
  }, [viewMode, rawTripData, vehicleInfo, clientData, setTripData]);

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

  // Funcion para leer el archivo EXCEL para las rutas
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
                throw new Error(
                  `No se pudo detectar la fecha para el archivo: ${file.name}`
                );
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
                  `No se encontraron encabezados en el archivo: ${file.name}`
                );
              }
              const data = XLSX.utils.sheet_to_json(ws, {
                range: headerRowIndex,
                defval: '',
              });
              if (!Array.isArray(data) || data.length === 0) {
                throw new Error(
                  `No se encontraron datos de viaje en: ${file.name}`
                );
              }

              const tripEntry: TripStorage = {
                rawData: data,
                vehicleInfo: vehicleData,
                fileName: file.name,
              };

              resolve([vehicleData.fecha, tripEntry]);
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = (err) =>
            reject(new Error(`Error leyendo ${file.name}: ${err}`));
          reader.readAsBinaryString(file);
        });
      });

      const newEntries = await Promise.all(fileReadPromises);
      const newTripsMap = Object.fromEntries(newEntries);

      setAllTripsData((prevData) => ({
        ...prevData,
        ...newTripsMap,
      }));

      const lastUploadedDate = newEntries[newEntries.length - 1][0];
      setActiveDate(lastUploadedDate);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al procesar uno o más archivos.'
      );
    } finally {
      setIsGeneratingReport(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // FUNCIÓN PARA PROCESAR EL ARCHIVO MAESTRO DE CLIENTES
  const handleClientFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setClientFileName(file.name);
    setError(null);
    setClientData(null);
    setSelection({ mode: 'vendor', value: null });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target?.result)
          throw new Error('No se pudo leer el archivo.');
        const bstr = event.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const { clients, vendors } = processMasterClientFile(ws);

        setAllClientsFromFile(clients);
        setAvailableVendors(vendors);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : 'Ocurrió un error crítico al procesar el archivo de clientes.'
        );
        setAllClientsFromFile(null);
        setAvailableVendors([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  // FUNCIÓN PARA MANEJAR LA SELECCIÓN DE VENDEDOR O MODO CHOFER
  const handleSelection = (selected: string) => {
    const newMode = availableVendors.includes(selected) ? 'vendor' : 'driver';
    setSelection({ mode: newMode, value: selected });

    if (allClientsFromFile) {
      if (newMode === 'driver') {
        setClientData(allClientsFromFile);
      } else {
        console.log('=== SELECCIÓN DE VENDEDOR ===');
        console.log('Vendedor seleccionado:', selected);
        console.log('Total clientes disponibles:', allClientsFromFile.length);

        // Filtrar clientes del vendedor (excluyendo casas)
        const filteredClients = allClientsFromFile.filter(
          (client) => client.vendor === selected && !client.isVendorHome
        );

        console.log(
          'Clientes del vendedor (sin casa):',
          filteredClients.length
        );

        // Buscar la casa del vendedor
        console.log('Buscando casa con vendorHomeInitial:', selected);

        const allHomes = allClientsFromFile.filter((c) => c.isVendorHome);
        console.log(
          'Todas las casas disponibles:',
          allHomes.map((h) => ({
            key: h.key,
            name: h.name,
            vendor: h.vendor,
            vendorHomeInitial: h.vendorHomeInitial,
          }))
        );

        const vendorHome = allClientsFromFile.find(
          (client) =>
            client.isVendorHome && client.vendorHomeInitial === selected
        );

        console.log(
          'Casa encontrada:',
          vendorHome
            ? {
                key: vendorHome.key,
                name: vendorHome.name,
                vendor: vendorHome.vendor,
                vendorHomeInitial: vendorHome.vendorHomeInitial,
              }
            : 'NINGUNA'
        );

        const finalClientList = [...filteredClients];
        if (vendorHome) {
          finalClientList.push(vendorHome);
          console.log('✓ Casa agregada a la lista final');
        } else {
          console.warn('✗ No se agregó ninguna casa');
        }

        console.log('Lista final de clientes:', finalClientList.length);
        console.log('==============================');

        setClientData(finalClientList);
      }
    }
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

  // FUNCIÓN PARA GENERAR Y DESCARGAR EL REPORTE (VERSIÓN SEMANAL)
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
      clientsForReport = allClientsFromFile || [];
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
      header: {
        font: { name: 'Arial', sz: 11, bold: true },
        fill: { fgColor: { rgb: 'FFDDDDDD' } },
        alignment: {
          wrapText: true,
          vertical: 'center',
          horizontal: 'center',
        },
      },
      cell: {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'top', wrapText: true },
      },
      cellCentered: {
        font: { name: 'Arial', sz: 10 },
        alignment: {
          horizontal: 'center',
          vertical: 'top',
          wrapText: true,
        },
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
      summarySubHeader: {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF444444' } },
        alignment: { horizontal: 'center', vertical: 'center' },
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
      durationMinutes: number
    ): { withinHours: number; outsideHours: number } => {
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

    try {
      const allVisitsMap = new Map<string, any[]>();
      const summaryByDay: Record<
        number,
        {
          distance: number;
          totalStops: number;
          clientsVisited: Set<string>;
          vehiclePlate: string;
          timeWithClients: number;
          timeWithNonClients: number;
          travelTime: number;
          timeAtTools: number;
          timeAtHome: number;
        }
      > = {};

      const dayColumnMap: Record<number, number> = {
        1: 1, // Lunes
        2: 2, // Martes
        3: 3, // Miércoles
        4: 4, // Jueves
        5: 5, // Viernes
      };

      for (const date of tripsToProcess) {
        const { rawData, vehicleInfo } = allTripsData[date];
        const dateObj = parseISO(date);
        const dayOfWeek = dateObj.getDay();

        if (!dayColumnMap[dayOfWeek]) continue;

        let processedTrip: ProcessedTrip;
        try {
          processedTrip = processTripData(
            rawData,
            viewMode,
            date,
            clientsForReport
          );
        } catch (e) {
          console.error(`Error procesando el viaje del día ${date}:`, e);
          continue;
        }

        let dailyTimeWithClients = 0;
        let dailyTimeWithNonClients = 0;
        let dailyTimeAtTools = 0;
        let dailyTimeAtHome = 0;
        const dailyClientsVisited = new Set<string>();
        let dailyTotalStops = 0;
        const specialNonClientKeys = ['3689', '6395'];

        for (const flag of processedTrip.flags) {
          if (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration) {
            dailyTotalStops++;
            const duration = flag.duration || 0;
            const split = splitDurationByWorkingHours(flag.time, duration);

            if (flag.clientKey) {
              const visitKey = `${flag.clientKey}_${
                flag.clientBranchNumber || 'main'
              }`;
              dailyClientsVisited.add(visitKey);
              const clientVisits = allVisitsMap.get(visitKey) || [];
              clientVisits.push({
                date: date,
                time: flag.time,
                dayOfWeek: dayOfWeek,
                duration: flag.duration || 0,
              });
              allVisitsMap.set(visitKey, clientVisits);

              if (flag.isVendorHome) {
                // 1. Es la casa del vendedor
                dailyTimeAtHome += split.withinHours;
              } else if (specialNonClientKeys.includes(flag.clientKey || '')) {
                // 2. Es Tools de Mexico
                dailyTimeAtTools += split.withinHours;
              } else if (
                !flag.clientName ||
                flag.clientName === 'Sin coincidencia'
              ) {
                // 3. Es una parada sin coincidencia
                dailyTimeWithNonClients += split.withinHours;
              } else {
                // 4. Es un cliente real
                dailyTimeWithClients += split.withinHours;
              }
            } else {
              dailyTimeWithNonClients += split.withinHours;
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

        if (startEvents.length > 0 && endEvents.length > 0) {
          const firstStartEvent = startEvents[0];
          const lastEndEvent = endEvents[endEvents.length - 1];
          const tripTimes = calculateWorkingTimeBetween(
            firstStartEvent.time,
            lastEndEvent.time
          );
          const totalWorkingTime = tripTimes.workingMinutes;
          const totalStopTimeWorkingHours =
            dailyTimeWithClients +
            dailyTimeWithNonClients +
            dailyTimeAtTools +
            dailyTimeAtHome;
          dailyTravelTime = Math.max(
            0,
            totalWorkingTime - totalStopTimeWorkingHours
          );
        }

        summaryByDay[dayOfWeek] = {
          distance: processedTrip.totalDistance,
          totalStops: dailyTotalStops,
          clientsVisited: dailyClientsVisited,
          vehiclePlate: vehicleInfo.placa,
          timeWithClients: dailyTimeWithClients,
          timeWithNonClients: dailyTimeWithNonClients,
          travelTime: dailyTravelTime,
          timeAtTools: dailyTimeAtTools,
          timeAtHome: dailyTimeAtHome,
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
              const visitString = `${formatExcelDate(visit.date)}\n${
                visit.time
              } (${durationText})`;
              row[colIndex] =
                (row[colIndex] ? row[colIndex] + '\n' : '') + visitString;
            }
          }
        }
        sheetData.push(row);
      }

      sheetData.push([]);
      const summaryStartRow = sheetData.length;
      sheetData.push(['RESUMEN SEMANAL']);

      const vehicleRow = ['Vehículo', '', '', '', '', ''];
      const totalDistRow = [
        'Distancia Total (km)',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
        '0 km',
      ];
      const totalStopsRow = ['Paradas Totales', 0, 0, 0, 0, 0];
      const uniqueClientsRow = ['Clientes Únicos Visitados', 0, 0, 0, 0, 0];
      const timeWithClientsRow = [
        'Tiempo con Clientes',
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
      ];
      const timeAtToolsRow = [
        'Tiempo en Tools de Mexico',
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
      ];
      const travelTimeRow = [
        'Tiempo en Traslados',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
        '0 min',
      ];

      let totalDistanceWeek = 0;
      let totalStopsWeek = 0;
      const allClientsVisitedWeek = new Set<string>();
      let totalTimeWithClientsWeek = 0;
      let totalTimeWithNonClientsWeek = 0;
      let totalTimeAtToolsWeek = 0;
      let totalTimeAtHomeWeek = 0;
      let totalTravelTimeWeek = 0;

      for (const dayNum in summaryByDay) {
        const colIndex = dayColumnMap[dayNum as any];
        if (colIndex !== undefined) {
          const stats = summaryByDay[dayNum as any];
          const distKm = Math.round(stats.distance / 1000);

          vehicleRow[colIndex] = stats.vehiclePlate;
          totalDistRow[colIndex] = `${distKm} km`;
          totalStopsRow[colIndex] = stats.totalStops;
          uniqueClientsRow[colIndex] = stats.clientsVisited.size;
          timeWithClientsRow[colIndex] = formatDuration(stats.timeWithClients);
          timeWithNonClientsRow[colIndex] = formatDuration(
            stats.timeWithNonClients
          );
          timeAtToolsRow[colIndex] = formatDuration(stats.timeAtTools);
          timeAtHomeRow[colIndex] = formatDuration(stats.timeAtHome);
          travelTimeRow[colIndex] = formatDuration(stats.travelTime);

          totalDistanceWeek += distKm;
          totalStopsWeek += stats.totalStops;
          stats.clientsVisited.forEach((key) => allClientsVisitedWeek.add(key));
          totalTimeWithClientsWeek += stats.timeWithClients;
          totalTimeWithNonClientsWeek += stats.timeWithNonClients;
          totalTimeAtToolsWeek += stats.timeAtTools;
          totalTimeAtHomeWeek += stats.timeAtHome;
          totalTravelTimeWeek += stats.travelTime;
        }
      }

      const totalClientsInList = clientsForReport.filter(
        (c) => !c.isVendorHome
      ).length;
      const clientsVisitedInList = Array.from(allClientsVisitedWeek).filter(
        (key) => {
          const clientKey = key.split('_')[0];
          const client = clientsForReport.find((c) => c.key === clientKey);
          return client && !client.isVendorHome;
        }
      ).length;

      const totalNonVisitedWeek = totalClientsInList - clientsVisitedInList;

      vehicleRow.push('');
      totalDistRow.push(`${totalDistanceWeek} km`);
      totalStopsRow.push(totalStopsWeek);
      uniqueClientsRow.push(allClientsVisitedWeek.size);
      const nonVisitedClientsRow = [
        'Clientes NO Visitados',
        '',
        '',
        '',
        '',
        '',
        totalNonVisitedWeek,
      ];
      timeWithClientsRow.push(formatDuration(totalTimeWithClientsWeek));
      timeWithNonClientsRow.push(formatDuration(totalTimeWithNonClientsWeek));
      timeAtToolsRow.push(formatDuration(totalTimeAtToolsWeek));
      timeAtHomeRow.push(formatDuration(totalTimeAtHomeWeek));
      travelTimeRow.push(formatDuration(totalTravelTimeWeek));

      // Sección 1: Paradas
      sheetData.push(['Resumen de Paradas y Distancia']);
      sheetData.push(vehicleRow);
      sheetData.push(totalDistRow);
      sheetData.push(totalStopsRow);
      sheetData.push(uniqueClientsRow);
      sheetData.push(nonVisitedClientsRow);

      // Sección 2: Tiempos
      sheetData.push(['Resumen de Tiempos']);
      sheetData.push(timeWithClientsRow);
      sheetData.push(timeWithNonClientsRow);
      sheetData.push(timeAtToolsRow);
      sheetData.push(timeAtHomeRow);
      sheetData.push(travelTimeRow);

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
          if (client.isVendorHome) {
            style = styles.vendorHomeVisitedCell;
          } else if (isToolsClient) {
            style = styles.toolsVisitedCell;
          } else {
            style = styles.clientVisitedCell;
          }
        } else {
          if (client.isVendorHome) {
            style = {
              ...styles.vendorHomeVisitedCell,
              fill: { fgColor: { rgb: 'FFFFF9E6' } },
            };
          } else if (isToolsClient) {
            style = {
              ...styles.toolsVisitedCell,
              fill: { fgColor: { rgb: 'FFFFF0F0' } },
            };
          } else {
            style = styles.cell;
          }
        }

        ws[XLSX.utils.encode_cell({ r, c: 0 })].s = style;

        for (let c = 1; c <= 5; c++) {
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
      const tiemposHeaderRow = summaryStartRow + 7;

      ws[XLSX.utils.encode_cell({ r: paradasHeaderRow, c: 0 })].s =
        styles.summarySubHeader;
      merges.push({
        s: { r: paradasHeaderRow, c: 0 },
        e: { r: paradasHeaderRow, c: totalCols },
      });

      ws[XLSX.utils.encode_cell({ r: tiemposHeaderRow, c: 0 })].s =
        styles.summarySubHeader;
      merges.push({
        s: { r: tiemposHeaderRow, c: 0 },
        e: { r: tiemposHeaderRow, c: totalCols },
      });

      const numSummaryRows = 12;

      const redSummaryRows = new Set([
        summaryStartRow + 6, // No Visitadas
        summaryStartRow + 9, // Paradas
        summaryStartRow + 10, // Tools de Mexico
        summaryStartRow + 11, // Tiempo en Casa
      ]);

      const headerSummaryRows = new Set([paradasHeaderRow, tiemposHeaderRow]);

      for (
        let r = summaryStartRow + 1;
        r <= summaryStartRow + numSummaryRows;
        r++
      ) {
        if (headerSummaryRows.has(r)) continue;

        const isRedRow = redSummaryRows.has(r);

        // Estilo para la Etiqueta
        const labelCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (labelCell) {
          labelCell.s = isRedRow ? styles.summaryLabelRed : styles.summaryLabel;
        }

        // Estilo para los Valores Diarios
        for (let c = 1; c < totalCols; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell) {
            cell.s = isRedRow ? styles.summaryValueRed : styles.summaryValue;
          }
        }

        // Estilo para el Total Semanal (Última Columna)
        const totalCell = ws[XLSX.utils.encode_cell({ r, c: totalCols })];
        if (totalCell) {
          totalCell.s = isRedRow
            ? styles.summaryTotalColRed
            : styles.summaryTotalCol;
        }
      }

      ws['!cols'] = [
        { wch: 50 }, // Cliente
        { wch: 18 }, // Lun
        { wch: 18 }, // Mar
        { wch: 18 }, // Mie
        { wch: 18 }, // Jue
        { wch: 18 }, // Vie
        { wch: 20 }, // Total Semanal
      ];

      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte Semanal de Visitas');

      const safeSelection =
        selection.value?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';

      const sortedDates = Object.keys(allTripsData)
        .filter((date) => {
          const day = parseISO(date).getDay();
          return day !== 0 && day !== 6;
        })
        .sort();

      let datePart = '';
      if (sortedDates.length === 0) {
        datePart = 'SinFechasHabiles';
      } else {
        const firstDate = sortedDates[0];
        const lastDate = sortedDates[sortedDates.length - 1];

        if (firstDate === lastDate) {
          datePart = formatExcelDate(firstDate).replace(/[^a-zA-Z0-9]/g, '-');
        } else {
          datePart = `${formatExcelDate(firstDate).replace(
            /[^a-zA-Z0-9]/g,
            '-'
          )}_a_${formatExcelDate(lastDate).replace(/[^a-zA-Z0-9]/g, '-')}`;
        }
      }

      const fileName = `Reporte_Viaje(s)_${safeSelection}_${datePart}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err: any) {
      console.error(err);
      alert(`Error al generar el reporte: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // FUNCIÓN PARA GENERAR EL HTML DEL MAPA
  const generateMapHTML = (
    vehicleInfo: VehicleInfo | null,
    clientData: Client[] | null,
    totalMatchedStops: number,
    selection: string | null,
    summaryStats: {
      timeWithClients: number;
      timeWithNonClients: number;
      travelTime: number;
      percentageClients: number;
      percentageNonClients: number;
      percentageTravel: number;
      timeWithClientsAfterHours: number;
      timeWithNonClientsAfterHours: number;
      travelTimeAfterHours: number;
      totalAfterHoursTime: number;
      distanceWithinHours: number;
      distanceAfterHours: number;
      timeAtHome: number;
      percentageAtHome: number;
      timeAtTools: number;
      percentageAtTools: number;
    }
  ): string => {
    if (!tripData) return '';
    const filteredFlags = tripData.flags.filter(
      (flag) =>
        flag.type !== 'stop' ||
        (flag.duration && flag.duration >= minStopDuration)
    );
    const { routes, processingMethod } = tripData;
    const mapCenter =
      filteredFlags.length > 0
        ? `{lat: ${filteredFlags[0].lat}, lng: ${filteredFlags[0].lng}}`
        : '{lat: 25.0, lng: -100.0}';

    const infoBoxHTML = vehicleInfo
      ? `
        <div id="info-box" class="info-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1px;">
            <h4 style="margin: 0;">Información del Vehiculo</h4>
            <button class="toggle-btn toggle-info-btn" aria-label="Minimizar/Maximizar">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
          </div>
          <div class="info-content info-grid" style="display: grid; grid-template-columns: 1.5fr 1.6fr; gap: 1px;">
              <p><strong>Descripción:</strong></p>
              <p style="text-align: left;">${vehicleInfo.descripcion}</p>

              <p><strong>Vehículo:</strong></p>
              <p style="text-align: left;">${vehicleInfo.vehiculo}</p>

              <p><strong>Placa:</strong></p>
              <p style="text-align: left;">${vehicleInfo.placa}</p>

              <p><strong>Fecha:</strong></p>
              <p style="text-align: left;">${vehicleInfo.fecha}</p>
          </div>
        </div>
    `
      : '';

    const clientsToRender = selection === 'chofer' ? [] : clientData || [];

    const summaryCardHTML = `
      <div id="summary-box" class="info-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1px;">
          <h4 style="margin: 0;">Resumen del dia</h4>
          <button class="toggle-btn toggle-summary-btn" aria-label="Minimizar/Maximizar">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        <div class="summary-content summary-grid" style="display: grid; grid-template-columns: 1.5fr 1.2fr 0.2fr; gap: 1px;">
          
          <p style="grid-column: span 3; font-size: 13px; font-weight: bold; color: #002FFF; background-color: #EDF0FF;">
            Dentro de horario (8:30 - 19:00)
          </p>

          <p><strong>Inicio de labores:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><strong>${tripData.workStartTime || 'N/A'}</strong></p>
          
          <p><strong>Clientes Visitados:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><span class="visited-clients-count">0</span> / ${totalMatchedStops}</p>
          
          <p style="grid-column: span 3;"><strong>Tiempo con:</strong></p>
          
          <p style="padding-left: 15px;">• Clientes:</p>
          <p style="text-align: left;">${formatDuration(summaryStats.timeWithClients)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageClients.toFixed(1)}%</strong></p>
          
          <p style="padding-left: 15px; color: #FF0000;">• No Clientes:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeWithNonClients)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageNonClients.toFixed(1)}%</strong></p>

          <p style="padding-left: 15px; color: #FF0000;">• En su casa:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeAtHome)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageAtHome.toFixed(1)}%</strong></p>

          <p style="padding-left: 15px; color: #FF0000;">• Tools de Mexico:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeAtTools)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageAtTools.toFixed(1)}%</strong></p>
              
          <p style="padding-left: 15px;">• En Traslados:</p>
          <p style="text-align: left;">${formatDuration(summaryStats.travelTime)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageTravel.toFixed(1)}%</strong></p>
          
          
          <p><strong>Distancia total:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><strong>${(summaryStats.distanceWithinHours / 1000).toFixed(2)} km</strong></p>
          
          <p><strong>Fin de labores:</strong></p>
          <p style="text-align: left; grid-column: span 2;">
            <strong>
              ${
                viewMode === 'new' && tripData.isTripOngoing
                  ? 'En movimiento...'
                  : tripData.workEndTime || 'N/A'
              }
            </strong>
          </p>

          <p style="grid-column: span 3; font-size: 13px; font-weight: bold; color: #002FFF; background-color: #EDF0FF;">
            Fuera de horario
          </p>

          <p style="grid-column: span 3; color: #00004F;"><strong>Tiempo con:</strong></p>

          <p style="padding-left: 15px; color: #00004F;">• Clientes:</p>
          <p style="text-align: left; color: #00004F; grid-column: span 2;">${formatDuration(summaryStats.timeWithClientsAfterHours)}</p>
          
          <p style="padding-left: 15px; color: #FF0000;">• No Clientes:</p>
          <p style="text-align: left; color: #FF0000; grid-column: span 2;">${formatDuration(summaryStats.timeWithNonClientsAfterHours)}</p>
          
          <p style="padding-left: 15px; color: #00004F;">• En Traslados:</p>
          <p style="text-align: left; color: ##00004F; grid-column: span 2;">${formatDuration(summaryStats.travelTimeAfterHours)}</p>
          
          <p style="color: #00004F;"><strong>Distancia recorrida:</strong></p>
          <p style="text-align: left; color: #00004F; grid-column: span 2;"><strong>${(summaryStats.distanceAfterHours / 1000).toFixed(2)} km</strong></p>
          
        </div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
          />

          <style>
            #map { height: 100%; width: 100%; } 
            body, html { height: 100%; margin: 0; padding: 0; }
            .gm-style-iw-d { overflow: hidden !important; }
            .gm-style-iw-c { padding: 12px !important; }
            h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; }
            h3 span { font-size: 20px; margin-right: 8px; }
            p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }
            
            #controls { 
              position: absolute; 
              top: 10px; 
              left: 50%; 
              transform: translateX(-50%); 
              z-index: 10; 
              background: white; 
              padding: 8px; 
              border: 1px solid #ccc; 
              border-radius: 8px; 
              display: flex; 
              gap: 8px; 
              box-shadow: 0 2px 6px rgba(0,0,0,0.3); 
            }

            #controls button { 
              font-family: sans-serif; 
              font-size: 12px; 
              padding: 8px 12px; 
              cursor: pointer; 
              border-radius: 5px; 
              border: 1px solid #aaa; 
              background: white;
              display: flex;
              align-items: center;
              gap: 6px;
            } 

            #controls button:disabled { 
              cursor: not-allowed; 
              background-color: #f0f0f0; 
              color: #aaa; 
            }

            #controls .btn-icon {
              display: none;
              font-size: 14px;
              font-weight: bold;
            }

            #controls .btn-text {
              display: inline;
            }
            
            #info-container { 
              position: absolute; 
              top: 10px; 
              right: 10px; 
              transform: translateY(10%); 
              z-index: 10; 
              display: flex; 
              flex-direction: column; 
              gap: 5px; 
            }
            
            .info-card { 
              background: rgba(255, 255, 255, 0.9); 
              padding: 6px 10px; 
              border-radius: 5px; 
              border: 1px solid #ccc; 
              font-family: sans-serif; 
              font-size: 12px; 
              width: 260px; 
            }
            
            .info-card h4 { 
              font-size: 14px; 
              font-weight: bold; 
              margin: 0; 
              color: #00004F
            }

            .toggle-btn {
              display: none;
              background: transparent;
              border: none;
              cursor: pointer;
              padding: 4px;
              color: #00004F;
              transition: transform 0.3s ease;
            }

            .toggle-btn:hover {
              color: #0275D8;
            }

            .toggle-btn.collapsed i {
              transform: rotate(360deg);
            }

            .info-grid, .summary-grid {
              transition: all 0.3s ease;
              overflow: hidden;
              max-height: 500px;
              opacity: 1;
            }

            .info-grid.collapsed, .summary-grid.collapsed {
              max-height: 0 !important;
              opacity: 0;
              padding-top: 0 !important;
              padding-bottom: 0 !important;
              margin: 0 !important;
              visibility: hidden;
            }
            
            .info-card p { 
              margin: 2.7px 0; 
              font-size: 12px; 
              color: #00004F
            }

            /* Botón de información para móvil */
            #info-toggle-btn {
              display: none;
              position: absolute;
              top: 10px;
              left: 10px;
              z-index: 15;
              background: white;
              border: 2px solid #0275D8;
              border-radius: 50%;
              width: 38px;
              height: 38px;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              align-items: center;
              justify-content: center;
              font-size: 24px;
              color: #0275D8;
              transition: all 0.3s ease;
            }

            #info-toggle-btn:active {
              transform: scale(0.95);
              background: #f0f0f0;
            }

            /* Modal para información en móvil */
            #info-modal {
              display: none;
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.5);
              z-index: 20;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            #info-modal.active {
              display: flex;
            }

            #info-modal-content {
              background: white;
              border-radius: 12px;
              max-height: 85vh;
              width: 100%;
              max-width: 400px;
              box-shadow: 0 4px 16px rgba(0,0,0,0.3);
              padding: 16px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }

            #info-modal-content > div:last-child {
              overflow-y: auto;
              flex: 1;
              margin-top: 10px;
            }

            #info-modal-close {
              float: right;
              font-size: 28px;
              font-weight: bold;
              color: #666;
              cursor: pointer;
              line-height: 20px;
            }

            #info-modal-close:hover {
              color: #000;
            }

            @media (max-width: 768px) {
              body, html {
                height: 100vh;
                overflow: hidden;
              }

              #map {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                height: 100vh !important;
                width: 100vw !important;
              }

              #controls {
                position: fixed;
                bottom: 20px;
                left: 50%;
                top: auto;
                transform: translateX(-50%);
                flex-direction: row;
                gap: 10px;
                padding: 8px;
                background: rgba(255, 255, 255, 0.95);
              }

              #controls button {
                padding: 6px 10px;
                min-width: 30px;
                min-height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              #controls .btn-text {
                display: none;
              }

              #controls .btn-icon {
                display: inline;
                font-size: 18px;
              }

              #info-container {
                display: none !important;
              }

              #info-toggle-btn {
                display: flex !important;
              }

              #info-modal-content {
                max-height: 80vh;
                overflow: hidden;
                padding: 12px;
              }

              .info-card {
                width: 90%;
                margin-bottom: 10px;
                padding: 8px 10px;
                font-size: 10px;
              }

              .info-card h4 {
                font-size: 12px;
                margin: 0 0 4px 0;
                padding-bottom: 3px;
              }

              .info-card p {
                margin: 2px 0;
                font-size: 10px;
                line-height: 1.3;
              }

              #info-modal-content {
                display: flex;
                flex-direction: column;
                max-height: 80vh;
              }

              #info-modal-content > div {
                overflow-y: auto;
                flex: 1;
              }

              .info-card .summary-grid {
                grid-template-columns: 1.7fr 1fr 0.5fr !important;
                font-size: 9px !important;
              }

              .info-card .summary-grid p {
                font-size: 9px !important;
                word-break: break-word;
              }

              .info-card .summary-grid strong {
                font-size: 9px !important;
              }

              .info-card .info-grid {
                grid-template-columns: 1fr 0.9fr !important;
                font-size: 9px !important;
              }

              .info-card .info-grid p {
                font-size: 9px !important;
                word-break: break-word;
              }

              .info-card .info-grid strong {
                font-size: 9px !important;
              }
            }

            @media (min-width: 1025px) {
              .toggle-btn {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
              }

              .info-grid, .summary-grid {
                max-height: 1000px;
              }
            }

            @media (min-width: 768px) and (max-width: 1024px) {
              body, html {
                height: 100vh;
                overflow: hidden;
              }

              #map {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                height: 100vh !important;
                width: 100vw !important;
              }

              #controls {
                position: fixed;
                bottom: 20px;
                left: 50%;
                top: auto;
                transform: translateX(-50%);
                flex-direction: row;
                gap: 12px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.95);
              }

              #controls button {
                padding: 8px 12px;
                min-width: 40px;
                min-height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              #controls .btn-text {
                display: none;
              }

              #controls .btn-icon {
                display: inline;
                font-size: 24px;
              }

              #info-container {
                display: none !important;
              }

              #info-toggle-btn {
                display: flex !important;
              }

              #info-modal-content {
                max-height: 80vh;
                overflow: hidden;
                padding: 14px;
                display: flex;
                flex-direction: column;
              }

              #info-modal-content > div {
                overflow-y: auto;
                flex: 1;
              }

              .info-card {
                width: 90%;
                margin-bottom: 12px;
                padding: 10px 12px;
                font-size: 12px;
              }

              .info-card h4 {
                font-size: 14px;
                margin: 0 0 6px 0;
                padding-bottom: 4px;
              }

              .info-card p {
                margin: 3px 0;
                font-size: 11px;
                line-height: 1.4;
              }

              .info-card .summary-grid {
                grid-template-columns: 1.7fr 1fr 0.5fr !important;
                font-size: 10px !important;
              }

              .info-card .summary-grid p,
              .info-card .summary-grid strong,
              .info-card .info-grid p,
              .info-card .info-grid strong {
                font-size: 10px !important;
                word-break: break-word;
              }

              .info-card .info-grid {
                grid-template-columns: 1fr 0.9fr !important;
              }
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          
          <!-- Botón de información para móvil -->
          <button id="info-toggle-btn" aria-label="Ver información">
            <i class="fa-solid fa-info"></i>
          </button>

          <!-- Modal de información para móvil -->
          <div id="info-modal">
            <div id="info-modal-content">
              <div style="position: sticky; top: 0; background: white; z-index: 1; padding-bottom: 5px;">
                <span id="info-modal-close">&times;</span>
              </div>
              <div>
                ${infoBoxHTML}
                ${summaryCardHTML}
              </div>
            </div>
          </div>

          <!-- Contenedor de información para desktop -->
          <div id="info-container">
            <div>${infoBoxHTML}</div>
            <div>${summaryCardHTML}</div>
          </div>

          <div id="controls">
            <button id="resetBtn">
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 4v6h6M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </span>
              <span class="btn-text">Reiniciar</span>
            </button>
            <button id="prevStopBtn" disabled>
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </span>
              <span class="btn-text">Anterior Parada</span>
            </button>
            <button id="nextStopBtn">
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
              <span class="btn-text">Siguiente Parada</span>
            </button>
          </div>
          
          <script>
            let map, markers = [], infowindows = [], openInfoWindows = new Set(), stopInfo = [];
            let lastNavigationTime = 0;
            const NAVIGATION_COOLDOWN = 100;

            const toggleInfoModal = () => {
              const modal = document.getElementById('info-modal');
              modal.classList.toggle('active');
            };

            const toggleInfoCard = () => {
              const content = document.getElementById('info-content');
              const btn = document.getElementById('toggle-info-btn');
              
              if (content && btn) {
                const icon = btn.querySelector('i');
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                  content.classList.remove('collapsed');
                  btn.classList.remove('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-up';
                } else {
                  content.classList.add('collapsed');
                  btn.classList.add('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-down';
                }
                console.log('Info card toggled, collapsed:', !isCollapsed);
              }
            };

            const toggleSummaryCard = () => {
              const content = document.getElementById('summary-content');
              const btn = document.getElementById('toggle-summary-btn');
              
              if (content && btn) {
                const icon = btn.querySelector('i');
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                  content.classList.remove('collapsed');
                  btn.classList.remove('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-up';
                } else {
                  content.classList.add('collapsed');
                  btn.classList.add('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-down';
                }
                console.log('Summary card toggled, collapsed:', !isCollapsed);
              }
            };

            window.onclick = (event) => {
              const modal = document.getElementById('info-modal');
              if (event.target === modal) {
                modal.classList.remove('active');
              }
            };

            const routePath = ${JSON.stringify(routes[0]?.path || [])};
            const allFlags = ${JSON.stringify(filteredFlags)};
            const allClients = ${JSON.stringify(clientsToRender)};
            const formatDuration = ${formatDuration.toString()};
            const isWorkingHoursFunc = ${isWorkingHours.toString()};
            const tripDateForCheck = '${vehicleInfo?.fecha || ''}';
            const processingMethod = '${processingMethod}';
            let animatedPolyline, currentPathIndex = 0, animationFrameId, isAnimating = false, currentStopIndex = 0;
            let segmentDistances = [];
            let cumulativeDistance = 0;
            let totalTripDistanceMeters = 0;
            const countedClientKeys = new Set();

            function formatDistance(meters) {
              if (meters < 1000) return meters.toFixed(0) + ' m';
              return (meters / 1000).toFixed(2) + ' km';
            }

            function updateDistanceCard(segmentMeters, totalMeters) {
              console.log('Actualizando distancias - Segmento:', segmentMeters, 'Total:', totalMeters);
              
              const segmentElements = document.querySelectorAll('#segment-distance');
              const totalElements = document.querySelectorAll('#total-distance');
              
              segmentElements.forEach(el => {
                if (el) el.textContent = formatDistance(segmentMeters);
              });
              
              totalElements.forEach(el => {
                if (el) el.textContent = formatDistance(totalMeters);
              });
            }

            function closeAllInfoWindows() {
              openInfoWindows.forEach(infoWindow => {
                infoWindow.close();
              });
              openInfoWindows.clear();
            }

            function closeAllInfoWindowsExcept(exceptInfoWindow = null) {
              openInfoWindows.forEach(infoWindow => {
                if (infoWindow !== exceptInfoWindow) {
                  infoWindow.close();
                  openInfoWindows.delete(infoWindow);
                }
              });
            }

            function openInfoWindow(marker, infowindow) {
              infowindow.open(map, marker);
              openInfoWindows.add(infowindow);
            }

            function closeInfoWindow(infowindow) {
              infowindow.close();
              openInfoWindows.delete(infowindow);
            }

            function toggleInfoWindow(marker, infowindow) {
              if (openInfoWindows.has(infowindow)) {
                closeInfoWindow(infowindow);
              } else {
                openInfoWindow(marker, infowindow);
              }
            }

            function createClientMarker(client) {
              const specialBlueIds  = [ '3689', '6395' ];
              const isSpecial = specialBlueIds.includes(String(client.key));

              let markerColor = '#A12323'; // Color por defecto (Cliente normal)

              if (client.isVendorHome) {
                markerColor = '#5D00FF';
              } else if (isSpecial) {
                markerColor = '#005EFF'; // Color Azul para especiales
              }

              const icon = {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: markerColor,
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.3,
                anchor: new google.maps.Point(12, 24)
              };
              
              return new google.maps.Marker({
                position: { lat: client.lat, lng: client.lng },
                map,
                icon,
                title: client.displayName
              });
            }

            function createClientInfoWindow(client) {
              const branchInfo = client.branchNumber ? 
                (client.branchName ? 
                  \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${client.branchName}</p>\` : 
                  \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${client.branchNumber}</p>\`) 
                : '';
              const googleMapsLink = \`https://www.google.com/maps/search/?api=1&query=\${client.lat},\${client.lng}\`;
              const coordinatesText = \`\${client.lat.toFixed(6)}, \${client.lng.toFixed(6)}\`;

              const isHome = client.isVendorHome;
              const titleText = isHome ? 'Casa Vendedor' : 'Cliente';
              const titleIcon = isHome ? 'fa-solid fa-user-tie' : 'fa-solid fa-house';
              const nameColor = isHome ? '#5D00FF' : '#059669';

              const content = \`
                <div>
                  <h3 style="display:flex; align-items:center; font-size: 15px;">
                    <span style="margin-right: 8px; font-size:15px; color: \${nameColor};">
                      <i class="\${titleIcon}"></i>
                    </span>
                    \${titleText}
                  </h3>
                  <strong><p style="margin: 2px 0 0 0; color: \${nameColor}; font-size: 12px;"><strong>#</strong> <strong> \${client.key} </strong></p></strong>
                  <strong><p style="margin: 2px 0 0 0; color: \${nameColor}; font-size: 12px;"><strong> \${client.displayName} </strong></p></strong>
                  <strong>\${branchInfo}</strong>
                  <p style="color: #374151; font-size: 12px;">\${coordinatesText}</p>
                  <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                    <strong>View on Google Maps</strong>
                  </a>
                </div>\`;
              return new google.maps.InfoWindow({ content });
            }

            function initMap() {
              map = new google.maps.Map(document.getElementById('map'), { 
                center: ${mapCenter}, 
                zoom: 12, 
                mapTypeControl: false, 
                streetViewControl: true,
                gestureHandling: 'greedy'
              });
              const bounds = new google.maps.LatLngBounds();

              allFlags.forEach((flag, index) => {
                if (!flag) return;
                const marker = createMarker(flag);
                const infowindow = createInfoWindow(flag);
                markers.push(marker);
                infowindows.push(infowindow);
                
                marker.addListener('click', () => {
                  toggleInfoWindow(marker, infowindow);
                });
                
                if (flag.type === 'start' || flag.type === 'stop' || flag.type === 'end') {
                  const flagLatLng = new google.maps.LatLng(flag.lat, flag.lng);
                  let closestPathIndex = -1;
                  let minDistance = Infinity;
                  routePath.forEach((pathPoint, i) => {
                    const pathLatLng = new google.maps.LatLng(pathPoint.lat, pathPoint.lng);
                    const distance = google.maps.geometry.spherical.computeDistanceBetween(flagLatLng, pathLatLng);
                    if (distance < minDistance) {
                      minDistance = distance;
                      closestPathIndex = i;
                    }
                  });
                  stopInfo.push({ markerIndex: index, pathIndex: closestPathIndex, type: flag.type });
                }
                bounds.extend(marker.getPosition());
              });

              allClients.forEach(client => {
                const clientMarker = createClientMarker(client);
                const clientInfoWindow = createClientInfoWindow(client);
                clientMarker.addListener('click', () => {
                  toggleInfoWindow(clientMarker, clientInfoWindow);
                });
                bounds.extend(clientMarker.getPosition());
              });

              let lastPathIndex = 0;
              for (let i = 1; i < stopInfo.length; i++) {
                const stop = stopInfo[i];
                const segmentPath = routePath.slice(lastPathIndex, stop.pathIndex + 1);
                const segmentLength = google.maps.geometry.spherical.computeLength(segmentPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                segmentDistances.push(segmentLength);
                lastPathIndex = stop.pathIndex;
              }
              
              totalTripDistanceMeters = google.maps.geometry.spherical.computeLength(routePath.map(p => new google.maps.LatLng(p.lat, p.lng)));
              updateDistanceCard(0, cumulativeDistance);

              map.fitBounds(bounds);
              animatedPolyline = new google.maps.Polyline({ path: [], strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 5, map: map });
              
              document.getElementById('resetBtn').addEventListener('click', resetRoute);
              document.getElementById('prevStopBtn').addEventListener('click', animateToPreviousStop);
              document.getElementById('nextStopBtn').addEventListener('click', animateToNextStop);
              document.getElementById('info-toggle-btn').addEventListener('click', toggleInfoModal);
              document.getElementById('info-modal-close').addEventListener('click', toggleInfoModal);

              // Asigna eventos SOLAMENTE a los botones que están dentro de #info-container (escritorio)
              document.querySelectorAll('#info-container .toggle-info-btn, #info-container .toggle-summary-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const card = btn.closest('.info-card');
                  if (!card) return;

                  // La lógica interna para encontrar el contenido y el ícono sigue siendo la misma
                  const content = card.querySelector('.info-content, .summary-content');
                  const icon = btn.querySelector('i');

                  if (content && icon) {
                    const isCollapsed = content.classList.contains('collapsed');

                    content.classList.toggle('collapsed');
                    btn.classList.toggle('collapsed');

                    // Cambia el ícono de la flecha
                    icon.className = isCollapsed ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
                  }
                });
              });
            }

            function createMarker(flag) { 
              const colors = { start: '#22c55e', stop: '#4F4E4E', end: '#ef4444' };
              const icon = { path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', fillColor: colors[flag.type], fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 24) };
              return new google.maps.Marker({ position: { lat: flag.lat, lng: flag.lng }, map, icon, title: flag.description });
            }

            function createInfoWindow(flag) {
              const isWorkingHoursFlag = ${isWorkingHours.toString()};
              const tripDate = '${vehicleInfo?.fecha || ''}';
              const inWorkingHours = flag.type === 'stop' ? isWorkingHoursFlag(flag.time, tripDate) : true;
              
              const containerStyle = inWorkingHours 
                ? 'background: white; color: black;' 
                : 'background: white; color: #FF0000;';
              const titleColor = inWorkingHours ? '#000' : '#C40000';
              const squareColor = inWorkingHours ? '#4F4E4E' : '#C40000';
              const labelColor = inWorkingHours ? '#374151' : '#C40000';
              const clientMatchColor = inWorkingHours ? '#059669' : '#10b981';
              const clientNoMatchColor = inWorkingHours ? '#FC2121' : '#C40000';
              const branchColor = inWorkingHours ? '#2563eb' : '#60a5fa';
              
              const googleMapsLink = \`https://www.google.com/maps/search/?api=1&query=\${flag.lat},\${flag.lng}\`;
              const coordinatesText = \`\${flag.lat.toFixed(6)}, \${flag.lng.toFixed(6)}\`;
              
              let content = '';
              
              switch (flag.type) {
                case 'start': 
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: #22c55e;">
                          <i class="fa-solid fa-road-circle-check"></i>
                        </span> 
                        \${flag.description}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Hora:</strong> \${flag.time}</p>
                      <p style="color: #374151; font-size: 12px;">\${coordinatesText}</p>
                      <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                        <strong>View on Google Maps</strong>
                      </a>
                    </div>\`; 
                  break;
                  
                case 'end': 
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: #ef4444;">
                          <i class="fa-solid fa-road-circle-xmark"></i>
                        </span>
                        \${flag.description}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Hora:</strong> \${flag.time}</p>
                      <p style="color: #374151; font-size: 12px;">\${coordinatesText}</p>
                      <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                        <strong>View on Google Maps</strong>
                      </a>
                    </div>\`; 
                  break;
                  
                case 'stop':
                  let clientInfo = '';
                  if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
                    const clientKey = flag.clientKey || 'N/A';
                    const clientBaseName = flag.clientName;
                    const branchInfo = flag.clientBranchNumber ? 
                      (flag.clientBranchName ? 
                        \`Suc. \${flag.clientBranchName}\` : 
                        \`Suc. \${flag.clientBranchNumber}\`) 
                      : null;
                    
                    clientInfo = \`
                      <div style="color:\${clientMatchColor};">
                        <p style="margin: 2px 0; font-weight: 500; font-size: 12px;">
                          <strong>#</strong> <strong>\${clientKey}</strong>
                        </p>
                        <strong><p style="margin: 2px 0; font-weight: 600; font-size: 12px;">\${clientBaseName}</p></strong>
                        <strong>\${branchInfo ? \`<p style="margin: 2px 0; font-weight: 600; font-size: 12px; color: \${branchColor};">\${branchInfo}</p>\` : ''}</strong>
                      </div>\`;
                  } else {
                    clientInfo = \`<p style="color:\${clientNoMatchColor}; font-weight: 500; font-size: 12px;"><strong>Cliente:</strong> Sin coincidencia</p>\`;
                  } 
                  
                  const stopIcon = !inWorkingHours
                    ? \`<i class="fa-solid fa-triangle-exclamation"></i>\`
                    : \`<i class="fa-solid fa-flag"></i>\`;
                  
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: \${squareColor}; font-size: 15px;">
                          \${stopIcon}
                        </span> 
                        Parada \${flag.stopNumber}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Duración:</strong> \${formatDuration(flag.duration || 0)}</p>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Hora:</strong> \${flag.time}</p>
                      \${clientInfo}
                      <p style="color: #374151; font-size: 12px;">\${coordinatesText}</p>
                      <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                        <strong>View on Google Maps</strong>
                      </a>
                    </div>\`;
                  break;
              }
              
              return new google.maps.InfoWindow({ content });
            }

            function resetRoute() {
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();
              
              closeAllInfoWindows();
              
              animatedPolyline.setPath([]);
              currentPathIndex = 0;
              currentStopIndex = 0;
              cumulativeDistance = 0;
              isAnimating = false;
              
              countedClientKeys.clear();
              document.querySelectorAll('.visited-clients-count').forEach(el => el.textContent = '0');
              
              updateDistanceCard(0, 0);
              
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              
              document.getElementById('resetBtn').disabled = false;
              document.getElementById('nextStopBtn').disabled = false;
              document.getElementById('prevStopBtn').disabled = true;
              
              const startMarker = markers[0];
              const startInfowindow = infowindows[0];
              if (startMarker && startInfowindow) {
                startMarker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => startMarker.setAnimation(null), 1400);
                openInfoWindow(startMarker, startInfowindow);
              }
              
              if (allFlags.length > 0) {
                map.setCenter({ lat: allFlags[0].lat, lng: allFlags[0].lng });
                map.setZoom(14);
              }
            }

            function animateToNextStop() {
              if (currentStopIndex >= stopInfo.length - 1) return;
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();
              
              const nextStop = stopInfo[currentStopIndex + 1];
              isAnimating = true;
              
              closeAllInfoWindows();
              
              document.getElementById('resetBtn').disabled = true;
              document.getElementById('nextStopBtn').disabled = true;
              document.getElementById('prevStopBtn').disabled = true;
              
              const onSegmentComplete = () => {
                isAnimating = false;
                const marker = markers[nextStop.markerIndex];
                const infowindow = infowindows[nextStop.markerIndex];
                marker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => marker.setAnimation(null), 1400);
                
                openInfoWindow(marker, infowindow);

                const segmentMeters = segmentDistances[currentStopIndex] || 0;
                cumulativeDistance += segmentMeters;

                let currentSegmentMeters = segmentMeters;
                updateDistanceCard(currentSegmentMeters, cumulativeDistance);

                const currentFlag = allFlags[nextStop.markerIndex];
                if (currentFlag && currentFlag.type === 'stop' && currentFlag.clientKey && !countedClientKeys.has(currentFlag.clientKey)) {
                  countedClientKeys.add(currentFlag.clientKey);
                  document.querySelectorAll('.visited-clients-count').forEach(el => el.textContent = countedClientKeys.size);
                }
                currentStopIndex++;
                
                document.getElementById('resetBtn').disabled = false;
                document.getElementById('prevStopBtn').disabled = false;

                if (currentStopIndex >= stopInfo.length - 1) {
                  document.getElementById('nextStopBtn').disabled = true;
                  updateDistanceCard(segmentMeters, totalTripDistanceMeters);
                } else {
                  document.getElementById('nextStopBtn').disabled = false;
                }
              };

              if (processingMethod === 'speed-based') {
                animateVeryFast(nextStop.pathIndex, onSegmentComplete);
              } else {
                animateSmoothly(nextStop.pathIndex, onSegmentComplete);
              }
            }

            function animateToPreviousStop() {
              if (currentStopIndex <= 0) return;
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();

              const lastStopFlag = allFlags[stopInfo[currentStopIndex].markerIndex];
              
              currentStopIndex--;
              
              closeAllInfoWindows();
              
              document.getElementById('resetBtn').disabled = true;
              document.getElementById('nextStopBtn').disabled = true;
              document.getElementById('prevStopBtn').disabled = true;

              const previousStop = stopInfo[currentStopIndex];
              const segmentMetersToUndo = segmentDistances[currentStopIndex] || 0;
              cumulativeDistance -= segmentMetersToUndo;

              const newPath = routePath.slice(0, previousStop.pathIndex + 1);
              animatedPolyline.setPath(newPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
              currentPathIndex = newPath.length - 1;

              if (lastStopFlag && lastStopFlag.type === 'stop' && lastStopFlag.clientKey) {
                const clientKeyToRemove = lastStopFlag.clientKey;
                let isStillVisited = false;
                for (let i = 0; i <= currentStopIndex; i++) {
                  const flag = allFlags[stopInfo[i].markerIndex];
                  if (flag.clientKey === clientKeyToRemove) {
                    isStillVisited = true;
                    break;
                  }
                }
                if (!isStillVisited && countedClientKeys.has(clientKeyToRemove)) {
                  countedClientKeys.delete(clientKeyToRemove);
                  document.querySelectorAll('.visited-clients-count').forEach(el => el.textContent = countedClientKeys.size);
                }
              }

              let currentSegmentMeters = 0;
              if (currentStopIndex > 0) {
                currentSegmentMeters = segmentDistances[currentStopIndex - 1] || 0;
              }

              updateDistanceCard(currentSegmentMeters, cumulativeDistance);

              const marker = markers[previousStop.markerIndex];
              const infowindow = infowindows[previousStop.markerIndex];
              marker.setAnimation(google.maps.Animation.BOUNCE);
              setTimeout(() => marker.setAnimation(null), 1400);
              
              openInfoWindow(marker, infowindow);

              document.getElementById('resetBtn').disabled = false;
              document.getElementById('nextStopBtn').disabled = false;
              if (currentStopIndex > 0) {
                document.getElementById('prevStopBtn').disabled = false;
              }
            }

            function runAnimation(targetPathIndex, onComplete, animationStep) {
              function step() {
                if (!isAnimating) {
                  cancelAnimationFrame(animationFrameId);
                  return;
                }
                
                const end = Math.min(currentPathIndex + animationStep, targetPathIndex);
                
                if (end > currentPathIndex) {
                  const newPathSegment = routePath.slice(currentPathIndex, end + 1);
                  if (newPathSegment.length > 0) {
                    const existingPath = animatedPolyline.getPath();
                    newPathSegment.forEach(p => existingPath.push(new google.maps.LatLng(p.lat, p.lng)));
                  }
                }
                
                currentPathIndex = end;

                if (currentPathIndex >= targetPathIndex) {
                  onComplete();
                  return;
                }
                animationFrameId = requestAnimationFrame(step);
              }
              animationFrameId = requestAnimationFrame(step);
            }

            function animateVeryFast(targetPathIndex, onComplete) {
              runAnimation(targetPathIndex, onComplete, 35);
            }

            function animateSmoothly(targetPathIndex, onComplete = () => {}) {
              runAnimation(targetPathIndex, onComplete, 1);
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap&libraries=geometry"></script>
        </body>
      </html>
    `;
  };

  // Función para descargar el mapa HTML
  const downloadMap = () => {
    const summaryStats = calculateSummaryStats();

    const htmlContent = generateMapHTML(
      vehicleInfo,
      clientData,
      matchedStopsCount,
      selection.value,
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

  // FUNCIÓN PARA ABRIR EL MAPA EN UNA NUEVA PESTAÑA (PARA MÓVILES)
  const openMapInTab = () => {
    const summaryStats = calculateSummaryStats();
    const htmlContent = generateMapHTML(
      vehicleInfo,
      clientData,
      matchedStopsCount,
      selection.value,
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
      // Tiempos dentro de horario laboral (8:30 - 19:00)
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
    };

    if (!tripData || !vehicleInfo?.fecha) return stats;

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

    // CALCULAR TIEMPOS DE PARADA
    tripData.flags.forEach((flag) => {
      if (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration) {
        const duration = flag.duration || 0;
        const split = splitDurationByWorkingHours(flag.time, duration);

        if (flag.isVendorHome) {
          // 1. Es la casa del vendedor
          stats.timeAtHome += split.withinHours;
          stats.timeAtHomeAfterHours += split.outsideHours;
        } else if (specialNonClientKeys.includes(flag.clientKey || '')) {
          // 2. Es Tools de Mexico
          stats.timeAtTools += split.withinHours;
          stats.timeAtToolsAfterHours += split.outsideHours;
        } else if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
          // 3. Es un cliente válido (y no es la casa ni Tools)
          stats.timeWithClients += split.withinHours;
          stats.timeWithClientsAfterHours += split.outsideHours;
        } else {
          // 4. Es una parada sin coincidencia
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

          const isInWorkingHours = isWorkingHours(
            estimatedTime,
            vehicleInfo?.fecha || ''
          );

          if (isInWorkingHours) {
            stats.distanceWithinHours += segmentDistance;
          } else {
            stats.distanceAfterHours += segmentDistance;
          }
        }
      }
    }

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

        {/* Tabs de Navegación */}
        {!sidebarCollapsed && (
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
          </>
        )}

        {/* Contenido del Sidebar */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto">
            {/* Tab: Configuración */}
            {activeTab === 'config' && (
              <div className="p-4 space-y-4">
                {/* Upload de Ruta */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      1. Cargar Archivo(s) de Ruta
                    </label>
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
                        className="text-xs p-0.5 text-red-500 hover:text-red-700 font-medium"
                        title="Limpiar todas las rutas"
                      >
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

                {/* Upload de Clientes */}
                {tripData && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      2. Archivo de Clientes (Opcional)
                    </label>
                    <label
                      htmlFor="clients-file"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <Users className="w-6 h-6 mb-1 text-green-500 animate-bounce" />
                      {clientFileName ? (
                        <p className="text-xs font-semibold text-green-700 text-center px-2">
                          {clientFileName}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600">XLSX, XLS</p>
                      )}
                      <input
                        id="clients-file"
                        type="file"
                        className="hidden"
                        onChange={handleClientFileUpload}
                        accept=".xlsx, .xls"
                      />
                    </label>
                  </div>
                )}

                {/* Selección de Vendedor */}
                {availableVendors.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      3. Seleccionar Vendedor
                    </label>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 mt-2">
                        {availableVendors.map((vendor) => (
                          <button
                            key={vendor}
                            onClick={() => handleSelection(vendor)}
                            className={`
                            px-4 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out
                            ${
                              selection.value === vendor
                                ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105'
                                : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-green-100 hover:border-green-400'
                            }
                          `}
                          >
                            {vendor}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => handleSelection('chofer')}
                        className={`w-full px-3 py-2 text-xs font-medium rounded border flex items-center justify-center gap-2 transition-all ${
                          selection.value === 'chofer'
                            ? 'bg-red-500 text-white border-red-500 shadow-md transform scale-105'
                            : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-red-100 hover:border-red-400'
                        }`}
                      >
                        <Truck className="w-4 h-4" />
                        MODO CHOFER
                      </button>
                    </div>
                  </div>
                )}

                {/* Modo de Vista */}
                {tripData && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                )}

                {/* Configuración de Paradas */}
                {tripData && (
                  <div className="space-y-3 pt-3 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Duración mínima de paradas
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Disminuir duración"
                          onClick={() =>
                            setMinStopDuration((prev) => Math.max(1, prev - 1))
                          }
                          className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
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
                          className="flex-1 accent-blue-600"
                          aria-label="Duración mínima de paradas"
                        />

                        <button
                          type="button"
                          aria-label="Aumentar duración"
                          onClick={() =>
                            setMinStopDuration((prev) =>
                              Math.min(120, prev + 1)
                            )
                          }
                          className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
                          disabled={minStopDuration >= 120}
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <span className="text-sm font-semibold text-gray-700 w-16 text-right">
                          {minStopDuration} min
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Radio de detección de cliente
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Disminuir radio"
                          onClick={() =>
                            setClientRadius((prev) => Math.max(10, prev - 10))
                          }
                          className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
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
                          className="flex-1 accent-blue-600"
                          aria-label="Radio de detección de cliente"
                        />

                        <button
                          type="button"
                          aria-label="Aumentar radio"
                          onClick={() =>
                            setClientRadius((prev) => Math.min(1000, prev + 10))
                          }
                          className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
                          disabled={clientRadius >= 1000}
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <span className="text-sm font-semibold text-gray-700 w-16 text-right">
                          {clientRadius} m
                        </span>
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
                      <span className="font-medium">{vehicleInfo.placa}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fecha:</span>
                      <span className="font-medium">{vehicleInfo.fecha}</span>
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
                      <span className="text-gray-600">Clientes visitados:</span>
                      <span className="font-medium">{matchedStopsCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Distancia total:</span>
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
                      <span className="text-green-600 font-medium text-right col-span-1">
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
                      <span className="text-red-600 font-medium text-right col-span-1">
                        {formatDuration(summaryStats.totalTimeWithNonClients)}
                      </span>
                      <span className="text-red-600 text-sm font-bold text-right col-span-1">
                        {summaryStats.percentageTotalNonClients.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-gray-600 text-left col-span-1 pl-2">
                        - En paradas:
                      </span>
                      <span className="text-red-800 text-right col-span-1">
                        {formatDuration(summaryStats.timeWithNonClients)}
                      </span>
                      <span className="text-red-800 font-bold text-right col-span-1">
                        {summaryStats.percentageNonClients.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-gray-600 text-left col-span-1 pl-2">
                        - En Tools:
                      </span>
                      <span className="text-red-800 text-right col-span-1">
                        {formatDuration(summaryStats.timeAtTools)}
                      </span>
                      <span className="text-red-800 font-bold text-right col-span-1">
                        {summaryStats.percentageAtTools.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-gray-600 text-left col-span-1 pl-2">
                        - En Casa:
                      </span>
                      <span className="text-red-800 text-right col-span-1">
                        {formatDuration(summaryStats.timeAtHome)}
                      </span>
                      <span className="text-red-800 font-bold text-right col-span-1">
                        {summaryStats.percentageAtHome.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-gray-600 text-left col-span-1">
                        En Traslados:
                      </span>
                      <span className="text-blue-600 font-medium text-right col-span-1">
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
                            summaryStats.timeWithNonClientsAfterHours
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">En traslados:</span>
                      <div className="text-right">
                        <span className="font-medium block">
                          {formatDuration(summaryStats.travelTimeAfterHours)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
                <div>
                  <select
                    id="date-selector"
                    value={activeDate || ''}
                    onChange={(e) => setActiveDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
                    hover:ring-2 hover:ring-blue-500"
                  >
                    <option value="" disabled>
                      Selecciona un día
                    </option>
                    {Object.keys(allTripsData)
                      .sort(
                        (a, b) => new Date(a).getTime() - new Date(b).getTime()
                      )
                      .map((date) => {
                        const dateObj = parseISO(date);
                        const formatted = formatDate(
                          dateObj,
                          'EEEE, dd-MM-yyyy',
                          {
                            locale: es,
                          }
                        );
                        return (
                          <option key={date} value={date}>
                            {formatted}
                          </option>
                        );
                      })}
                  </select>
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
            <iframe
              srcDoc={generateMapHTML(
                vehicleInfo,
                clientData,
                matchedStopsCount,
                selection.value,
                summaryStats
              )}
              className="w-full h-full border-0"
              title="Vista Previa del Mapa"
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

      {/* Error Toast (Opcional) */}
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
