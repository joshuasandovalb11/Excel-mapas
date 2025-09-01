/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Upload,
  Users,
  BarChart,
  Download,
  AlertCircle,
  UserCheck,
  CalendarDays,
  Users2,
  Info,
  UsersRound,
  Truck,
  Flag,
  FlagOff,
  SquareParking,
} from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

import {
  processTripData,
  parseVehicleInfo,
  calculateDistance,
  formatDuration,
  processMasterClientFile,
  type Client,
  type ProcessedTrip,
  type VehicleInfo,
  type TripEvent,
} from '../utils/tripUtils';

// --- INTEGRACIÓN DE GOOGLE MAPS API ---
const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

// --- FUNCIÓN DE GEOCODIFICACIÓN CON DIRECCIÓN COMPLETA ---
const getAddress = async (lat: number, lng: number): Promise<string> => {
  if (!googleMapsApiKey) {
    return 'API Key de Google Maps no configurada';
  }
  if (!lat || !lng) return 'Coordenadas inválidas';

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsApiKey}`
    );
    if (!response.ok) {
      throw new Error(
        `Error en la respuesta de la API de Google: ${response.statusText}`
      );
    }
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results[0]) {
      return data.results[0].formatted_address;
    } else {
      console.error(
        'Error de Geocodificación de Google:',
        data.error_message || data.status
      );
      return `Dirección no encontrada (${data.status})`;
    }
  } catch (error) {
    console.error('Error de red en la llamada a Google Maps:', error);
    return `Dirección no disponible (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
};

// --- ESTRUCTURAS DE DATOS ---
interface ReportEntry {
  key: string;
  name: string;
  visitCount: number;
  totalDuration: number;
  vehicles: string[];
  visitTimes: string[];
  type: 'visit' | 'stop' | 'start' | 'end';
}

interface DailyReport {
  visits: ReportEntry[];
  totalDistance: number;
  date: string | null;
}

type WeeklyReportData = {
  [day: string]: DailyReport;
};

interface ReportMetadata {
  dateRange: string;
  vehicles: string[];
}

interface TripFileResult {
  vehicleInfo: VehicleInfo;
  processedTrip: ProcessedTrip;
  fileName: string;
}

// Función para obtener el día de la semana a partir de una fecha
const getDayOfWeek = (dateString: string): string => {
  if (!dateString || isNaN(new Date(dateString).getTime())) return '';
  const date = new Date(`${dateString}T12:00:00Z`);
  const dayIndex = date.getUTCDay();
  const days = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  return days[dayIndex];
};

export default function ReportesView() {
  const [vehicleFiles, setVehicleFiles] = useState<File[]>([]);
  const [clientFile, setClientFile] = useState<File | null>(null);
  const [reportData, setReportData] =
    usePersistentState<WeeklyReportData | null>('rv_reportData', null);
  const [nonVisitedClients, setNonVisitedClients] = usePersistentState<
    Client[]
  >('rv_nonVisitedClients', []);
  const [minStopDuration, setMinStopDuration] = usePersistentState<number>(
    'rv_minStopDuration',
    5
  );
  const [clientRadius, setClientRadius] = usePersistentState<number>(
    'rv_clientRadius',
    50
  );
  const [vehicleFileNames, setVehicleFileNames] = usePersistentState<string[]>(
    'rv_vehicleFileNames',
    []
  );

  const [clientFileName, setClientFileName] = usePersistentState<string | null>(
    'rv_clientFileName',
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [allClientsFromFile, setAllClientsFromFile] = usePersistentState<
    Client[] | null
  >('rv_allClients', null);
  const [availableVendors, setAvailableVendors] = usePersistentState<string[]>(
    'rv_vendors',
    []
  );
  const [selection, setSelection] = usePersistentState<{
    mode: 'vendor' | 'driver';
    value: string | null;
  }>('rv_selection', { mode: 'vendor', value: null });
  const [reportMetadata, setReportMetadata] =
    usePersistentState<ReportMetadata | null>('rv_reportMetadata', null);

  // Función para leer un archivo como cadena binaria
  const readFileAsBinary = (file: File): Promise<string | ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) resolve(event.target.result);
        else reject(new Error(`No se pudo leer el archivo: ${file.name}`));
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  // Funcion para manejar el cambio en los archivos de viaje
  const handleVehicleFilesChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    setError(null);
    setWarnings([]);
    setReportData(null);

    const validFiles: File[] = [];
    const errorMessages: string[] = [];

    for (const file of files) {
      try {
        const bstr = await readFileAsBinary(file);
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
        });

        let headerRowIndex = -1;
        const tripKeywords = ['latitud', 'longitud', 'velocidad'];
        const clientKeywords = ['clave', 'razon', 'gps'];
        let isLikelyClientFile = false;

        for (let i = 0; i < 20 && i < sheetAsArray.length; i++) {
          const lowerCaseRow = sheetAsArray[i].map((cell) =>
            String(cell || '')
              .toLowerCase()
              .trim()
          );
          const tripHeadersFound = tripKeywords.every((keyword) =>
            lowerCaseRow.some((cell) => cell.startsWith(keyword))
          );
          if (tripHeadersFound) {
            headerRowIndex = i;
            break;
          }
          const clientHeadersFound = clientKeywords.filter((keyword) =>
            lowerCaseRow.some((cell) => cell.startsWith(keyword))
          ).length;
          if (clientHeadersFound >= 2) {
            isLikelyClientFile = true;
          }
        }

        if (headerRowIndex === -1) {
          if (isLikelyClientFile) {
            throw new Error(`'${file.name}' parece ser de clientes.`);
          }
          throw new Error(
            `'${file.name}' no es un archivo de viaje válido (faltan cabeceras).`
          );
        }

        validFiles.push(file);
      } catch (err: any) {
        errorMessages.push(err.message);
      }
    }

    if (errorMessages.length > 0) {
      setError(`Archivos rechazados: ${errorMessages.join('; ')}`);
    }

    setVehicleFiles(validFiles);
    setVehicleFileNames(validFiles.map((f) => f.name));
  };

  // Funcion para manejar el cambio en el archivo de clientes
  const handleClientFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setClientFile(file);
    setClientFileName(file?.name || null);
    setReportData(null);
    setNonVisitedClients([]);
    setAllClientsFromFile(null);
    setAvailableVendors([]);
    setSelection({ mode: 'vendor', value: null });
    setError(null);
    setWarnings([]);
    setReportMetadata(null);

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          if (!event.target?.result)
            throw new Error('No se pudo leer el archivo.');
          const bstr = event.target.result as string;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const { clients, vendors } = processMasterClientFile(ws);
          setAllClientsFromFile(clients);
          setAvailableVendors(vendors);
        } catch (err: any) {
          setError(`Error al procesar archivo de clientes: ${err.message}`);
          setAllClientsFromFile(null);
          setAvailableVendors([]);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  // Funcion para procesar un solo archivo de viaje
  const processSingleTripFile = async (file: File): Promise<TripFileResult> => {
    const bstr = await readFileAsBinary(file);
    const wb = XLSX.read(bstr, { type: 'binary' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];

    const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
    });
    let headerRowIndex = -1;
    const tripKeywords = ['latitud', 'longitud', 'velocidad'];
    for (let i = 0; i < 20 && i < sheetAsArray.length; i++) {
      const lowerCaseRow = sheetAsArray[i].map((cell) =>
        String(cell || '')
          .toLowerCase()
          .trim()
      );
      const tripHeadersFound = tripKeywords.every((keyword) =>
        lowerCaseRow.some((cell) => cell.startsWith(keyword))
      );
      if (tripHeadersFound) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1)
      throw new Error(
        'Error inesperado: No se encontró cabecera en un archivo pre-validado.'
      );

    const vehicleInfo = parseVehicleInfo(ws, file.name);
    const data: any[] = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex });

    const findTimeColumn = (row: any): string | null => {
      if (!row) return null;
      const timePattern = /^\d{1,2}:\d{2}(:\d{2})?$/;
      for (const key in row) {
        if (typeof row[key] === 'string' && timePattern.test(row[key].trim()))
          return key;
      }
      return null;
    };

    const timeColumn = data.length > 0 ? findTimeColumn(data[0]) : null;
    if (!timeColumn)
      throw new Error(
        `No se encontró una columna de tiempo válida en: ${file.name}`
      );

    const events: TripEvent[] = data
      .map((row: any, index: number) => ({
        id: index + 1,
        time: row[timeColumn] || '00:00:00',
        description: row['Descripción de Evento:'] || 'Sin descripción',
        speed: Number(row['Velocidad(km)']) || 0,
        lat: Number(row['Latitud']),
        lng: Number(row['Longitud']),
      }))
      .filter((event) => event.lat && event.lng);

    if (events.length === 0)
      throw new Error(`No hay eventos con coordenadas en: ${file.name}`);

    try {
      const processedTrip = processTripData(data);
      return { vehicleInfo, processedTrip, fileName: file.name };
    } catch (error: any) {
      if (
        error.message?.includes(
          'No se encontraron eventos con velocidad mayor a 0'
        )
      ) {
        const emptyTrip: ProcessedTrip = {
          events,
          routes: [{ path: [] }],
          flags: [],
          totalDistance: 0,
          processingMethod: 'speed-based',
        };
        return { vehicleInfo, processedTrip: emptyTrip, fileName: file.name };
      } else {
        throw error;
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

  // Funcion para manejar la generación del reporte
  const handleGenerateReport = async () => {
    if (!googleMapsApiKey) {
      setError(
        'Error: La clave de la API de Google Maps (VITE_Maps_API_KEY) no está configurada.'
      );
      return;
    }
    if (vehicleFiles.length === 0 || !clientFile) {
      setError(
        'Por favor, sube los archivos de viajes y el archivo de clientes.'
      );
      return;
    }
    if (!selection.value) {
      setError(
        'Por favor, selecciona un vendedor o el Modo Chofer para generar el reporte.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarnings([]);
    setReportData(null);
    setNonVisitedClients([]);
    setReportMetadata(null);

    try {
      let clientsForReport: Client[] = [];
      if (selection.mode === 'driver') {
        clientsForReport = allClientsFromFile || [];
      } else {
        clientsForReport =
          allClientsFromFile?.filter((c) => c.vendor === selection.value) || [];
      }

      if (clientsForReport.length === 0) {
        const errorMessage =
          selection.mode === 'driver'
            ? 'No se encontraron clientes en el archivo maestro.'
            : `No se encontraron clientes para el vendedor: ${selection.value}`;
        throw new Error(errorMessage);
      }

      const allTripsData = await Promise.all(
        vehicleFiles.map((file) => processSingleTripFile(file))
      );

      const dates = allTripsData
        .map((trip) => trip.vehicleInfo.fecha)
        .filter(
          (date) => date !== 'No encontrada' && !isNaN(new Date(date).getTime())
        )
        .map((date) => new Date(date));
      let dateRangeStr = 'Sin Fecha';
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        dateRangeStr =
          formatDate(minDate) === formatDate(maxDate)
            ? formatDate(minDate)
            : `${formatDate(minDate)} a ${formatDate(maxDate)}`;
      }
      const uniqueVehicles = [
        ...new Set(allTripsData.map((trip) => trip.vehicleInfo.placa)),
      ];
      setReportMetadata({ dateRange: dateRangeStr, vehicles: uniqueVehicles });

      const coordsToFetch = new Map<string, { lat: number; lng: number }>();
      const allFlagsToProcess: any[] = [];
      const visitedClientKeys = new Set<string>();

      const activeWeekendFiles: string[] = [];
      const inactiveFiles: string[] = [];

      for (const tripResult of allTripsData) {
        const dayOfWeek = getDayOfWeek(tripResult.vehicleInfo.fecha);
        if (!dayOfWeek) continue;

        const isWeekend = dayOfWeek === 'Sábado' || dayOfWeek === 'Domingo';
        const hasMovement = tripResult.processedTrip.totalDistance > 0;

        if (isWeekend) {
          if (hasMovement) {
            activeWeekendFiles.push(`${tripResult.fileName} (${dayOfWeek})`);
          } else {
            inactiveFiles.push(`${tripResult.fileName} (${dayOfWeek})`);
          }
        }

        for (const flag of tripResult.processedTrip.flags) {
          if (
            flag.type === 'start' ||
            flag.type === 'end' ||
            (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration)
          ) {
            let isClientVisit = false;
            let clientInfo = null;

            if (flag.type === 'stop' && !isWeekend) {
              for (const client of clientsForReport) {
                const distance = calculateDistance(
                  flag.lat,
                  flag.lng,
                  client.lat,
                  client.lng
                );
                if (distance < clientRadius) {
                  isClientVisit = true;
                  clientInfo = { key: client.key, name: client.name };
                  visitedClientKeys.add(client.key);
                  break;
                }
              }
            }

            const coordKey = `${flag.lat.toFixed(5)},${flag.lng.toFixed(5)}`;
            if (!isClientVisit) {
              if (!coordsToFetch.has(coordKey)) {
                coordsToFetch.set(coordKey, { lat: flag.lat, lng: flag.lng });
              }
            }

            allFlagsToProcess.push({
              ...flag,
              isClientVisit,
              clientInfo,
              coordKey,
              dayOfWeek,
              vehicle: tripResult.vehicleInfo.placa,
              totalDistance: tripResult.processedTrip.totalDistance,
              date: tripResult.vehicleInfo.fecha,
              fileName: tripResult.fileName,
            });
          }
        }
      }

      const addressCache = new Map<string, string>();
      const uniqueCoords = Array.from(coordsToFetch.entries());
      const batchSize = 10;

      for (let i = 0; i < uniqueCoords.length; i += batchSize) {
        const batch = uniqueCoords.slice(i, i + batchSize);
        const promises = batch.map(([key, coords]) =>
          getAddress(coords.lat, coords.lng).then((address) => ({
            key,
            address,
          }))
        );
        const results = await Promise.all(promises);
        for (const result of results) {
          addressCache.set(result.key, result.address);
        }
      }

      const initialDailyReport = (): DailyReport => ({
        visits: [],
        totalDistance: 0,
        date: null,
      });
      const weeklyReport: WeeklyReportData = {
        Lunes: initialDailyReport(),
        Martes: initialDailyReport(),
        Miércoles: initialDailyReport(),
        Jueves: initialDailyReport(),
        Viernes: initialDailyReport(),
        Sábado: initialDailyReport(),
        Domingo: initialDailyReport(),
      };

      const processedFilesForDistance: Set<string> = new Set();

      for (const tripResult of allTripsData) {
        const dayOfWeek = getDayOfWeek(tripResult.vehicleInfo.fecha);
        if (!dayOfWeek) continue;

        const dayData = weeklyReport[dayOfWeek];

        if (!processedFilesForDistance.has(tripResult.fileName)) {
          dayData.totalDistance += tripResult.processedTrip.totalDistance;
          if (tripResult.vehicleInfo.fecha !== 'No encontrada')
            dayData.date = tripResult.vehicleInfo.fecha;
          processedFilesForDistance.add(tripResult.fileName);
        }
      }

      for (const flag of allFlagsToProcess) {
        const dayData = weeklyReport[flag.dayOfWeek];
        let name = '';
        let entryType: 'visit' | 'stop' | 'start' | 'end' = flag.type;

        if (flag.isClientVisit) {
          name = `${flag.clientInfo.key} - ${flag.clientInfo.name}`;
          entryType = 'visit';
        } else {
          const address =
            addressCache.get(flag.coordKey) ||
            `Dirección para ${flag.coordKey} no encontrada`;
          if (flag.type === 'start') name = `${address}`;
          if (flag.type === 'end') name = `${address}`;
          if (flag.type === 'stop') name = `${address}`;
        }

        dayData.visits.push({
          key: `${flag.type}-${flag.time}-${flag.lat.toFixed(5)}`,
          name: name,
          visitCount: 1,
          totalDuration: flag.duration || 0,
          vehicles: [flag.vehicle],
          visitTimes: [flag.time],
          type: entryType,
        });
      }

      const warningsToShow: string[] = [];
      if (inactiveFiles.length > 0) {
        warningsToShow.push(
          `Se detectaron ${inactiveFiles.length} día(s) de fin de semana sin actividad. No sumarán distancia ni visitas: ${inactiveFiles.join(', ')}`
        );
      }
      if (activeWeekendFiles.length > 0) {
        warningsToShow.push(
          `Se detectó actividad en ${activeWeekendFiles.length} día(s) no laborales. El kilometraje ha sido sumado al total, y las paradas se muestran como genéricas: ${activeWeekendFiles.join(', ')}`
        );
      }
      setWarnings(warningsToShow);

      for (const day in weeklyReport) {
        weeklyReport[day].visits.sort((a, b) =>
          a.visitTimes[0].localeCompare(b.visitTimes[0])
        );
      }

      setReportData(weeklyReport);
      setNonVisitedClients(
        clientsForReport.filter((c) => !visitedClientKeys.has(c.key))
      );
    } catch (err: any) {
      console.error(err);
      setWarnings([]);
      setError(`Error al generar el reporte: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Funcion para descargar el reporte en Excel
  const downloadReport = () => {
    if (!reportData || !reportMetadata) return;

    const styles = {
      title: {
        font: { name: 'Arial', sz: 18, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF0275D8' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      infoLabel: {
        font: {
          name: 'Arial',
          sz: 10,
          bold: true,
        },
        alignment: { horizontal: 'right' },
      },
      infoValue: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'left' },
      },
      header: {
        font: { name: 'Arial', sz: 11, bold: true },
        fill: { fgColor: { rgb: 'FFDDDDDD' } },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      },
      subHeader: {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      },
      summaryLabel: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'right' },
      },
      summaryValue: {
        font: { name: 'Arial', sz: 10 },
      },
      totalRow: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFF2F2F2' } },
        alignment: { horizontal: 'center' },
        border: {
          top: { style: 'thin', color: { auto: 1 } },
          bottom: { style: 'thin', color: { auto: 1 } },
        },
      },
      cell: {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'center' },
      },
      cellCentered: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      cellRight: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'right', vertical: 'center' },
      },
      clientVisitCell: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFEBF5FF' } },
        alignment: { vertical: 'center' },
      },
      eventCell: (type: 'visit' | 'stop' | 'start' | 'end') => {
        const baseStyle = {
          font: { name: 'Arial', sz: 10, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
        const typeSpecificStyles = {
          visit: {
            font: { ...baseStyle.font, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF0066CC' } },
          },
          stop: {
            font: { ...baseStyle.font, color: { rgb: '00000000' } },
            fill: { fgColor: { rgb: 'FFFFC000' } },
          },
          start: {
            font: { ...baseStyle.font, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF00B050' } },
          },
          end: {
            font: { ...baseStyle.font, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FFFF0000' } },
          },
        };
        return { ...baseStyle, ...typeSpecificStyles[type] };
      },
      nonVisitedHeader: {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FFC00000' } },
        alignment: { horizontal: 'center' },
      },
    };

    const wb = XLSX.utils.book_new();
    const weekDays = [
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ];
    const finalSheetData: any[][] = [];
    const merges: XLSX.Range[] = [];

    const totalWeeklyDuration = Object.values(reportData).reduce(
      (sum, day) =>
        sum +
        day.visits.reduce(
          (dSum, v) =>
            dSum +
            (v.type === 'visit' || v.type === 'stop' ? v.totalDuration : 0),
          0
        ),
      0
    );
    const totalWeeklyKms = Object.values(reportData).reduce(
      (sum, day) => sum + day.totalDistance,
      0
    );
    const uniqueClientsVisited = new Set(
      Object.values(reportData).flatMap((day) =>
        day.visits
          .filter((v) => v.type === 'visit')
          .map((v) => v.name.split(' - ')[0])
      )
    ).size;
    const totalMinutesForPercentage = 48 * 60;
    const percentageOfTimeUsed =
      totalWeeklyDuration > 0
        ? (totalWeeklyDuration / totalMinutesForPercentage) * 100
        : 0;
    const formattedPercentage = `${percentageOfTimeUsed.toFixed(2)}%`;

    const rightSideData = [
      ['Información del Reporte'],
      ['Rango de Fechas:', reportMetadata.dateRange],
      ['Vehículo Involucrado:', reportMetadata.vehicles.join(', ')],
      [
        'Reporte para:',
        selection.mode === 'driver' ? 'CHOFER' : `${selection.value}`,
      ],
      [],
      ['Resumen General de la Semana'],
      ['Clientes Únicos Visitados:', String(uniqueClientsVisited || 0)],
      ['Tiempo Total en Paradas/Visitas:', formatDuration(totalWeeklyDuration)],
      ['% de tiempo utilizado (48h):', formattedPercentage],
      ['Kilometraje Total:', `${Math.round(totalWeeklyKms / 1000)} km`],
    ];

    const leftSideData: any[][] = [];
    weekDays.forEach((day) => {
      const dayData = reportData[day] || {
        visits: [],
        totalDistance: 0,
        date: null,
      };
      const dateString = dayData.date ? `, ${dayData.date}` : '';
      leftSideData.push([`${day}${dateString}`, '', '', '', '']);

      const headerRow = [
        'Fecha',
        'Hora',
        'Evento',
        '# - Cliente / Descripción',
        'Duración',
      ];
      leftSideData.push(headerRow);

      if (dayData.visits.length > 0) {
        dayData.visits.forEach((v) => {
          let eventType = '';
          switch (v.type) {
            case 'start':
              eventType = 'Inicio de Viaje';
              break;
            case 'end':
              eventType = 'Fin de Viaje';
              break;
            case 'visit':
              eventType = 'Visita a Cliente';
              break;
            case 'stop':
              eventType = 'Parada';
              break;
          }
          const formattedDate = formatExcelDate(dayData.date);
          leftSideData.push([
            formattedDate,
            v.visitTimes[0] || '',
            eventType,
            v.name,
            v.totalDuration > 0 ? formatDuration(v.totalDuration) : '--',
          ]);
        });
        const totalDayDuration = dayData.visits.reduce(
          (sum, v) => sum + v.totalDuration,
          0
        );
        const totalStopsAndVisits = dayData.visits.filter(
          (v) => v.type === 'visit' || v.type === 'stop'
        ).length;
        leftSideData.push([
          '',
          'Totales del Día:',
          `${totalStopsAndVisits} parada(s)`,
          `${Math.round(dayData.totalDistance / 1000)} km`,
          formatDuration(totalDayDuration),
        ]);
      } else {
        leftSideData.push(['', 'No se registró actividad', '', '', '']);
      }
      leftSideData.push([]);
    });

    finalSheetData.push(['Reporte de Actividad Semanal']);
    finalSheetData.push([]);

    const numRows = Math.max(leftSideData.length, rightSideData.length);
    const startRow = 2;

    for (let i = 0; i < numRows; i++) {
      const leftRow = leftSideData[i] || ['', '', '', '', ''];
      const rightRow = rightSideData[i] || [];
      finalSheetData[startRow + i] = [
        ...leftRow,
        '',
        ...(rightRow || ['', '']),
      ];
    }

    const weeklySheet = XLSX.utils.aoa_to_sheet(finalSheetData);

    if (weeklySheet['A1']) weeklySheet['A1'].s = styles.title;
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    const rightSideStartCol = 6;
    if (weeklySheet[XLSX.utils.encode_cell({ r: 2, c: rightSideStartCol })])
      weeklySheet[XLSX.utils.encode_cell({ r: 2, c: rightSideStartCol })].s =
        styles.subHeader;
    merges.push({
      s: { r: 2, c: rightSideStartCol },
      e: { r: 2, c: rightSideStartCol + 1 },
    });

    for (let i = 3; i <= 5; i++) {
      if (weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })])
        weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })].s =
          styles.infoLabel;
      if (
        weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })]
      )
        weeklySheet[
          XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })
        ].s = styles.infoValue;
    }

    if (weeklySheet[XLSX.utils.encode_cell({ r: 7, c: rightSideStartCol })])
      weeklySheet[XLSX.utils.encode_cell({ r: 7, c: rightSideStartCol })].s =
        styles.subHeader;
    merges.push({
      s: { r: 7, c: rightSideStartCol },
      e: { r: 7, c: rightSideStartCol + 1 },
    });

    for (let i = 8; i <= 11; i++) {
      if (weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })])
        weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })].s =
          styles.summaryLabel;
      if (
        weeklySheet[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })]
      )
        weeklySheet[
          XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })
        ].s = styles.summaryValue;
    }

    let currentRowIndex = 2;
    weekDays.forEach((day) => {
      const dayData = reportData[day] || { visits: [], totalDistance: 0 };

      const subHeaderCell =
        weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 0 })];
      if (subHeaderCell && subHeaderCell.v) {
        subHeaderCell.s = styles.subHeader;
        merges.push({
          s: { r: currentRowIndex, c: 0 },
          e: { r: currentRowIndex, c: 4 },
        });
      }
      currentRowIndex++;

      const tableHeaderRow = currentRowIndex;
      if (
        leftSideData[tableHeaderRow - startRow] &&
        leftSideData[tableHeaderRow - startRow].length > 1
      ) {
        for (let c = 0; c < 5; c++) {
          const cell =
            weeklySheet[XLSX.utils.encode_cell({ r: tableHeaderRow, c })];
          if (cell) cell.s = styles.header;
        }
      }
      currentRowIndex++;

      dayData.visits.forEach((v) => {
        const cellFecha =
          weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 0 })];
        const cellHora =
          weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 1 })];
        const cellEvento =
          weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 2 })];
        const cellDesc =
          weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 3 })];
        const cellDuracion =
          weeklySheet[XLSX.utils.encode_cell({ r: currentRowIndex, c: 4 })];
        if (cellFecha) cellFecha.s = styles.cellCentered; // Estilo para la fecha
        if (cellHora) cellHora.s = styles.cellCentered; // Estilo para la hora
        if (cellEvento) cellEvento.s = styles.eventCell(v.type); // Estilo para el tipo de evento
        if (cellDesc)
          cellDesc.s =
            v.type === 'visit' ? styles.clientVisitCell : styles.cell; // Estilo para descripción
        if (cellDuracion) cellDuracion.s = styles.cellRight; // Estilo para duración
        currentRowIndex++;
      });

      const totalRow = currentRowIndex;
      const totalRowData = leftSideData[totalRow - startRow] || [];
      if (totalRowData[1] === 'No se registró actividad') {
        const cell = weeklySheet[XLSX.utils.encode_cell({ r: totalRow, c: 1 })];
        if (cell) cell.s = styles.cellCentered;
        merges.push({ s: { r: totalRow, c: 1 }, e: { r: totalRow, c: 4 } });
      } else if (totalRowData.length > 1) {
        for (let c = 0; c < 5; c++) {
          const cell = weeklySheet[XLSX.utils.encode_cell({ r: totalRow, c })];
          if (cell) cell.s = styles.totalRow;
        }
      }
      currentRowIndex++;
      currentRowIndex++;
    });

    weeklySheet['!merges'] = merges;
    weeklySheet['!cols'] = [
      { wch: 18 }, //Fecha
      { wch: 15 }, //Hora
      { wch: 20 }, //Evento
      { wch: 70 }, //Descripción
      { wch: 15 }, //Duración
      { wch: 3 }, //Espacio
      { wch: 30 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, weeklySheet, 'Reporte Semanal');

    if (nonVisitedClients.length > 0) {
      const nonVisitedSheetData = [
        ['Clientes No Visitados'],
        [],
        [
          'Reporte para:',
          selection.mode === 'driver' ? 'CHOFER' : selection.value,
        ],
        [],
        ['Clave Cliente', 'Nombre Cliente'],
      ];
      nonVisitedClients
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => nonVisitedSheetData.push([c.key, c.name]));
      const nonVisitedSheet = XLSX.utils.aoa_to_sheet(nonVisitedSheetData);
      if (nonVisitedSheet['A1']) nonVisitedSheet['A1'].s = styles.title;
      if (nonVisitedSheet['A5'])
        nonVisitedSheet['A5'].s = styles.nonVisitedHeader;
      if (nonVisitedSheet['B5'])
        nonVisitedSheet['B5'].s = styles.nonVisitedHeader;
      nonVisitedSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      nonVisitedSheet['!cols'] = [{ wch: 25 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(
        wb,
        nonVisitedSheet,
        'Clientes No Visitados'
      );
    }

    const safeSelection =
      selection.value?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';
    const fileName = `Reporte_Actividad_${safeSelection}_${reportMetadata.dateRange.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <BarChart className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-800">
            Generador de Reportes
          </h1>
          <p className="text-gray-500 mt-2">
            Sube los archivos de viaje de la semana y un archivo de clientes
            para consolidar la información.
          </p>
        </div>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                1. Cargar Archivos de Viajes
              </h2>
              <label
                htmlFor="vehicle-files"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100 p-2"
              >
                <Upload className="w-8 h-8 mb-2 text-blue-500 shrink-0 motion-safe:animate-bounce" />
                {vehicleFileNames.length > 0 ? (
                  <div className="text-blue-700 text-center font-medium text-sm overflow-y-auto px-2">
                    <p>{vehicleFileNames.join(', ')}</p>
                  </div>
                ) : (
                  <span className="text-sm text-gray-600">
                    Seleccionar archivos...
                  </span>
                )}
                <input
                  id="vehicle-files"
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleVehicleFilesChange}
                  accept=".xlsx, .xls"
                />
              </label>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                2. Cargar Archivo de Clientes
              </h2>
              <label
                htmlFor="client-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100"
              >
                <Users className="w-8 h-8 mb-2 text-green-500 motion-safe:animate-bounce" />
                {clientFileName ? (
                  <span className="font-semibold text-green-700">
                    {clientFileName}
                  </span>
                ) : (
                  <span className="text-sm text-gray-600">
                    Seleccionar archivo...
                  </span>
                )}
                <input
                  id="client-file"
                  type="file"
                  className="hidden"
                  onChange={handleClientFileChange}
                  accept=".xlsx, .xls"
                />
              </label>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg space-y-4">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              3. Configurar Reporte
            </h2>
            {availableVendors.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4" />
                  Selecciona un vendedor o modo chofer:
                </label>
                <label className="block text-sm font-medium text-gray-700 mb-2 items-center gap-2 border-b border-b-gray-300">
                  Vendedores
                </label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {availableVendors.map((vendor) => (
                    <button
                      key={vendor}
                      onClick={() =>
                        setSelection({ mode: 'vendor', value: vendor })
                      }
                      className={`px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out ${
                        selection.mode === 'vendor' &&
                        selection.value === vendor
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-100 hover:border-blue-400'
                      }`}
                    >
                      {vendor}
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-2 items-center gap-2 border-b border-b-gray-300">
                  Modo chofer
                </label>
                <button
                  key="driver-mode"
                  onClick={() =>
                    setSelection({ mode: 'driver', value: 'CHOFER' })
                  }
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out flex items-center gap-2 ${
                    selection.mode === 'driver'
                      ? 'bg-red-600 text-white border-red-600 shadow-md transform scale-105'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-red-100 hover:border-red-400'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  CHOFER
                </button>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <label
                htmlFor="stop-duration-report"
                className="text-sm font-medium text-gray-700"
              >
                Paradas con duración mayor a:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="stop-duration-report"
                  min="1"
                  max="120"
                  value={minStopDuration}
                  onChange={(e) => setMinStopDuration(Number(e.target.value))}
                  className="w-20 px-3 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="client-radius-report"
                className="text-sm font-medium text-gray-700"
              >
                Radio de detección de cliente:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="client-radius-report"
                  min="10"
                  max="1000"
                  step="10"
                  value={clientRadius}
                  onChange={(e) => setClientRadius(Number(e.target.value))}
                  className="w-20 px-3 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">mts</span>
              </div>
            </div>
            <button
              onClick={handleGenerateReport}
              disabled={
                isLoading ||
                vehicleFiles.length === 0 ||
                !clientFile ||
                !selection.value
              }
              className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed transform hover:scale-105"
            >
              {isLoading ? 'Generando...' : 'Generar Reporte'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-6 text-center p-4 bg-red-100 text-red-700 rounded-lg flex items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5" />{' '}
            <p>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="mt-4 text-center p-4 bg-yellow-100 text-yellow-800 rounded-lg flex flex-col items-center justify-center gap-2">
            {warnings.map((warning, index) => (
              <div key={index} className="flex items-start gap-2 w-full">
                <AlertCircle className="h-5 w-5 mt-1 shrink-0" />
                <p className="text-left">
                  <strong>Advertencia:</strong> {warning}
                </p>
              </div>
            ))}
          </div>
        )}
        {reportData && (
          <div className="space-y-8 pt-8">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  Resultados del Reporte
                </h2>
                <div className="flex">
                  <button
                    onClick={downloadReport}
                    disabled={!reportMetadata}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:bg-green-300"
                  >
                    <Download className="h-5 w-5" />
                    Descargar Excel
                  </button>
                </div>
              </div>

              <div className="p-3 mb-4 bg-blue-50 text-blue-800 rounded-lg flex items-center gap-2 text-sm">
                <Info className="h-5 w-5 shrink-0" />
                <span>
                  El inicio, fin y las paradas sin cliente ahora muestran una
                  dirección aproximada.
                </span>
              </div>

              <div className="space-y-6">
                {[
                  'Lunes',
                  'Martes',
                  'Miércoles',
                  'Jueves',
                  'Viernes',
                  'Sábado',
                  'Domingo',
                ].map((day) => (
                  <div key={day}>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2 border-b-2 border-blue-200 pb-1">
                      <CalendarDays className="w-5 h-5 text-blue-500" /> {day}
                      {reportData[day]?.date && (
                        <span className="text-base font-normal text-gray-700 pt-1">
                          - {reportData[day].date}
                        </span>
                      )}
                    </h3>
                    {reportData[day] && reportData[day].visits.length > 0 ? (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full bg-white">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="py-2 px-3 border-b text-center text-sm font-semibold text-gray-600 w-12"></th>
                              <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                                Hora
                              </th>
                              <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                                Evento
                              </th>
                              <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                                Clave - Cliente / Descripción
                              </th>
                              <th className="py-2 px-4 border-b text-right text-sm font-semibold text-gray-600">
                                Duración
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData[day].visits.map((row) => (
                              <tr key={row.key} className="hover:bg-gray-50">
                                <td className="py-2 px-3 border-b text-center">
                                  {row.type === 'start' && (
                                    <Flag className="w-5 h-5 mx-auto text-green-500" />
                                  )}
                                  {row.type === 'end' && (
                                    <FlagOff className="w-5 h-5 mx-auto text-red-500" />
                                  )}
                                  {row.type === 'visit' && (
                                    <UsersRound className="w-5 h-5 mx-auto text-blue-600" />
                                  )}
                                  {row.type === 'stop' && (
                                    <SquareParking className="w-5 h-5 mx-auto text-yellow-500" />
                                  )}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-left">
                                  {row.visitTimes[0]}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-left font-medium">
                                  {
                                    {
                                      start: 'Inicio de Viaje',
                                      end: 'Fin de Viaje',
                                      visit: 'Visita a Cliente',
                                      stop: 'Parada',
                                    }[row.type]
                                  }
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-left">
                                  {row.name}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-right">
                                  {row.totalDuration > 0
                                    ? formatDuration(row.totalDuration)
                                    : '--'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 px-4 py-2 bg-gray-50 rounded-md">
                        No se registró actividad este día.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {nonVisitedClients.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-gray-700 mt-8 mb-2 flex items-center gap-2">
                  <Users2 className="text-red-600" /> Clientes No Visitados en
                  el Periodo
                </h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                          Clave
                        </th>
                        <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                          Nombre
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonVisitedClients.map((client) => (
                        <tr key={client.key} className="hover:bg-gray-50">
                          <td className="py-2 px-4 border-b text-sm">
                            {client.key}
                          </td>
                          <td className="py-2 px-4 border-b text-sm">
                            {client.name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
