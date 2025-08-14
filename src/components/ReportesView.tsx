/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Users,
  BarChart,
  Download,
  AlertCircle,
  UserCheck,
  CalendarDays,
  Users2,
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

// --- ESTRUCTURAS DE DATOS ---
interface DailyVisit {
  key: string;
  name: string;
  visitCount: number;
  totalDuration: number;
  vehicles: string[];
  visitTimes: string[];
}

interface DailyReport {
  visits: DailyVisit[];
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
    150
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
  const [selectedVendor, setSelectedVendor] = usePersistentState<string | null>(
    'rv_selectedVendor',
    null
  );
  const [reportMetadata, setReportMetadata] =
    usePersistentState<ReportMetadata | null>('rv_reportMetadata', null);

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

  const handleClientFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setClientFile(file);
    setClientFileName(file?.name || null);
    setReportData(null);
    setNonVisitedClients([]);
    setAllClientsFromFile(null);
    setAvailableVendors([]);
    setSelectedVendor(null);
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

  const handleGenerateReport = async () => {
    if (vehicleFiles.length === 0 || !clientFile) {
      setError(
        'Por favor, sube los archivos de viajes y el archivo de clientes.'
      );
      return;
    }
    if (!selectedVendor) {
      setError('Por favor, selecciona un vendedor para generar el reporte.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarnings([]);
    setReportData(null);
    setNonVisitedClients([]);
    setReportMetadata(null);

    try {
      const clientsForReport =
        allClientsFromFile?.filter((c) => c.vendor === selectedVendor) || [];
      if (clientsForReport.length === 0) {
        throw new Error(
          `No se encontraron clientes para el vendedor: ${selectedVendor}`
        );
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
      const visitedClientKeys = new Set<string>();

      const warningsToShow: string[] = [];
      const activeWeekendFiles: string[] = [];
      const inactiveFiles: string[] = [];

      for (const tripResult of allTripsData) {
        const dayOfWeek = getDayOfWeek(tripResult.vehicleInfo.fecha);
        if (!dayOfWeek || !weeklyReport[dayOfWeek]) continue;

        if (tripResult.vehicleInfo.fecha !== 'No encontrada') {
          weeklyReport[dayOfWeek].date = tripResult.vehicleInfo.fecha;
        }

        const isWeekend = dayOfWeek === 'Sábado' || dayOfWeek === 'Domingo';
        const hasMovement = tripResult.processedTrip.totalDistance > 0;

        weeklyReport[dayOfWeek].totalDistance +=
          tripResult.processedTrip.totalDistance;

        if (isWeekend) {
          if (hasMovement) {
            activeWeekendFiles.push(`${tripResult.fileName} (${dayOfWeek})`);
          } else {
            inactiveFiles.push(`${tripResult.fileName} (${dayOfWeek})`);
          }
        } else {
          const realStops = tripResult.processedTrip.flags.filter(
            (flag) =>
              flag.type === 'stop' && (flag.duration || 0) >= minStopDuration
          );

          for (const stop of realStops) {
            for (const client of clientsForReport) {
              const distance = calculateDistance(
                stop.lat,
                stop.lng,
                client.lat,
                client.lng
              );
              if (distance < clientRadius) {
                visitedClientKeys.add(client.key);
                const dayVisits = weeklyReport[dayOfWeek].visits;
                let clientVisit = dayVisits.find((v) => v.key === client.key);
                if (!clientVisit) {
                  clientVisit = {
                    key: client.key,
                    name: client.name,
                    visitCount: 0,
                    totalDuration: 0,
                    vehicles: [],
                    visitTimes: [],
                  };
                  dayVisits.push(clientVisit);
                }
                clientVisit.visitCount++;
                clientVisit.totalDuration += stop.duration || 0;
                clientVisit.visitTimes.push(stop.time);
                if (
                  !clientVisit.vehicles.includes(tripResult.vehicleInfo.placa)
                ) {
                  clientVisit.vehicles.push(tripResult.vehicleInfo.placa);
                }
                break;
              }
            }
          }
        }
      }

      if (inactiveFiles.length > 0) {
        warningsToShow.push(
          `Se detectaron ${inactiveFiles.length} día(s) de fin de semana sin actividad. No sumarán distancia ni visitas: ${inactiveFiles.join(', ')}`
        );
      }
      if (activeWeekendFiles.length > 0) {
        warningsToShow.push(
          `Se detectó actividad en ${activeWeekendFiles.length} día(s) no laborales. El kilometraje ha sido sumado al total: ${activeWeekendFiles.join(', ')}`
        );
      }

      setWarnings(warningsToShow);

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

  const downloadReport = () => {
    if (!reportData || !reportMetadata) return;

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
    const weeklySheetData: any[][] = [];
    const totalWeeklyDuration = Object.values(reportData).reduce(
      (sum, day) =>
        sum + day.visits.reduce((dSum, v) => dSum + v.totalDuration, 0),
      0
    );
    const totalWeeklyKms = Object.values(reportData).reduce(
      (sum, day) => sum + day.totalDistance,
      0
    );
    const uniqueClientsVisited = new Set(
      Object.values(reportData).flatMap((day) => day.visits.map((v) => v.key))
    ).size;
    const totalMinutesForPercentage = 48 * 60;
    const percentageOfTimeUsed =
      totalWeeklyDuration > 0
        ? (totalWeeklyDuration / totalMinutesForPercentage) * 100
        : 0;
    const formattedPercentage = `${percentageOfTimeUsed.toFixed(2)}%`;

    weeklySheetData.push(['Reporte de Visitas Semanal']);
    weeklySheetData.push([]);
    weeklySheetData.push([
      'Vendedor:',
      selectedVendor || 'N/A',
      '',
      '',
      '',
      '',
      'Resumen General de la Semana',
    ]);
    weeklySheetData.push([
      'Rango de Fechas:',
      reportMetadata.dateRange,
      '',
      '',
      '',
      '',
      'Clientes Únicos Visitados:',
      String(uniqueClientsVisited || 0),
    ]);
    weeklySheetData.push([
      'Vehículos Involucrados:',
      reportMetadata.vehicles.join(', '),
      '',
      '',
      '',
      '',
      'Tiempo Total en Visitas:',
      formatDuration(totalWeeklyDuration),
    ]);
    weeklySheetData.push([
      '',
      '',
      '',
      '',
      '',
      '',
      'Porcentaje de tiempo utilizado (48h):',
      formattedPercentage,
    ]);
    weeklySheetData.push([
      '',
      '',
      '',
      '',
      '',
      '',
      'Kilometraje Total:',
      `${Math.round(totalWeeklyKms / 1000)} km`,
    ]);
    weeklySheetData.push([]);

    weekDays.forEach((day) => {
      const dayData = reportData[day] || {
        visits: [],
        totalDistance: 0,
        date: null,
      };
      const dateString = dayData.date ? `, ${dayData.date}` : '';
      weeklySheetData.push([`${day}${dateString}`]);

      weeklySheetData.push([
        'Clave Cliente',
        'Nombre Cliente',
        '# Visitas',
        'Duración',
        'Hora de Visita',
      ]);

      if (dayData.visits.length > 0) {
        const sortedVisits = [...dayData.visits].sort((a, b) =>
          (a.visitTimes[0] || '23:59').localeCompare(b.visitTimes[0] || '23:59')
        );
        sortedVisits.forEach((v) => {
          weeklySheetData.push([
            String(v.key),
            String(v.name),
            String(v.visitCount),
            formatDuration(v.totalDuration),
            [...v.visitTimes].sort().join(', '),
          ]);
        });
        const totalVisits = dayData.visits.reduce(
          (sum, v) => sum + v.visitCount,
          0
        );
        const totalDayDuration = dayData.visits.reduce(
          (sum, v) => sum + v.totalDuration,
          0
        );
        weeklySheetData.push([
          'Totales del Día:',
          '',
          String(totalVisits),
          formatDuration(totalDayDuration),
          `${Math.round(dayData.totalDistance / 1000)} km`,
        ]);
      } else {
        weeklySheetData.push([
          'No se registraron visitas',
          '',
          '0',
          '00:00',
          `${Math.round(dayData.totalDistance / 1000)} km`,
        ]);
      }
      weeklySheetData.push([]);
    });

    const weeklySheet = XLSX.utils.aoa_to_sheet(weeklySheetData);
    weeklySheet['!cols'] = [
      { wch: 20 },
      { wch: 40 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 5 },
      { wch: 35 },
      { wch: 20 },
    ];
    const styleHeader = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'D9E1F2' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const styleDayHeader = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4F81BD' } },
      alignment: { horizontal: 'center' },
    };
    const styleAlignRight = { alignment: { horizontal: 'right' } };
    const styleAlignLeft = { alignment: { horizontal: 'left' } };
    const styleAlignCenter = { alignment: { horizontal: 'center' } };

    if (weeklySheet['A1'])
      weeklySheet['A1'].s = {
        font: { sz: 16, bold: true, color: { rgb: '003366' } },
      };
    if (weeklySheet['G3'])
      weeklySheet['G3'].s = {
        font: { sz: 14, bold: true, color: { rgb: '003366' } },
      };
    if (weeklySheet['H4']) weeklySheet['H4'].s = styleAlignRight;
    if (weeklySheet['H5']) weeklySheet['H5'].s = styleAlignRight;
    if (weeklySheet['H6']) weeklySheet['H6'].s = styleAlignRight;
    if (weeklySheet['H7']) weeklySheet['H7'].s = styleAlignRight;

    weeklySheetData.forEach((row, rowIndex) => {
      // MODIFICADO: Se aplica el estilo al encabezado del día (que ahora puede tener fecha).
      if (row.length === 1 && weekDays.some((day) => row[0].startsWith(day))) {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
        if (weeklySheet[cellRef]) weeklySheet[cellRef].s = styleDayHeader;
      } else if (row[0] === 'Clave Cliente') {
        for (let c = 0; c < 5; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (weeklySheet[cellRef]) weeklySheet[cellRef].s = styleHeader;
        }
      } else if (row.length === 5 && !row[0].includes('Totales')) {
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })].s =
            styleAlignCenter;
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })].s =
            styleAlignLeft;
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 2 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 2 })].s =
            styleAlignLeft;
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 3 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 3 })].s =
            styleAlignRight;
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })].s =
            styleAlignRight;
      } else if (
        typeof row[0] === 'string' &&
        row[0].includes('Totales del Día')
      ) {
        const totalStyleRight = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'F2F2F2' } },
          alignment: { horizontal: 'right' },
        };
        const totalStyleLeft = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'F2F2F2' } },
          alignment: { horizontal: 'left' },
        };
        if (weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })])
          weeklySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })].s =
            totalStyleLeft;
        for (let c = 2; c < 5; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (weeklySheet[cellRef]) weeklySheet[cellRef].s = totalStyleRight;
        }
      }
    });
    XLSX.utils.book_append_sheet(wb, weeklySheet, 'Reporte Semanal');

    if (nonVisitedClients.length > 0) {
      const nonVisitedSheetData = [
        ['Clientes No Visitados'],
        [],
        ['Vendedor:', selectedVendor || 'N/A'],
        [],
        ['Clave Cliente', 'Nombre Cliente'],
      ];
      nonVisitedClients
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => nonVisitedSheetData.push([c.key, c.name]));
      const nonVisitedSheet = XLSX.utils.aoa_to_sheet(nonVisitedSheetData);
      nonVisitedSheet['!cols'] = [{ wch: 20 }, { wch: 40 }];
      if (nonVisitedSheet['A1'])
        nonVisitedSheet['A1'].s = {
          font: { sz: 16, bold: true, color: { rgb: '003366' } },
        };
      if (nonVisitedSheet['A5']) nonVisitedSheet['A5'].s = styleHeader;
      if (nonVisitedSheet['B5']) nonVisitedSheet['B5'].s = styleHeader;
      XLSX.utils.book_append_sheet(
        wb,
        nonVisitedSheet,
        'Clientes No Visitados'
      );
    }
    const safeDateRange = reportMetadata.dateRange.replace(
      /[^a-zA-Z0-9]/g,
      '_'
    );
    const safeVendor = selectedVendor?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';
    const fileName = `Reporte_Semanal_${safeVendor}_${safeDateRange}.xlsx`;
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
          <div className="bg-gray-50 p-2 rounded-lg space-y-4">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              3. Configurar Reporte
            </h2>
            {availableVendors.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4" />
                  Selecciona Vendedor:
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableVendors.map((vendor) => (
                    <button
                      key={vendor}
                      onClick={() => setSelectedVendor(vendor)}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out ${
                        selectedVendor === vendor
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-100 hover:border-blue-400'
                      }`}
                    >
                      {vendor}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <label
                htmlFor="stop-duration-report"
                className="text-sm font-medium text-gray-700"
              >
                Visitas con parada mayor a:
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
                !selectedVendor
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
                              <th className="py-2 px-4 border-b text-center text-sm font-semibold text-gray-600">
                                Clave
                              </th>
                              <th className="py-2 px-4 border-b text-left text-sm font-semibold text-gray-600">
                                Nombre Cliente
                              </th>
                              <th className="py-2 px-4 border-b text-center text-sm font-semibold text-gray-600">
                                # Visitas
                              </th>
                              <th className="py-2 px-4 border-b text-right text-sm font-semibold text-gray-600">
                                Duración
                              </th>
                              <th className="py-2 px-4 border-b text-right text-sm font-semibold text-gray-600">
                                Hora de Visita(s)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData[day].visits.map((row) => (
                              <tr key={row.key} className="hover:bg-gray-50">
                                <td className="py-2 px-4 border-b text-sm text-center">
                                  {row.key}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-left">
                                  {row.name}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-center">
                                  {row.visitCount}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-right">
                                  {formatDuration(row.totalDuration)}
                                </td>
                                <td className="py-2 px-4 border-b text-sm text-right">
                                  {row.visitTimes.sort().join(', ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 px-4 py-2 bg-gray-50 rounded-md">
                        No se registraron visitas este día.
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
