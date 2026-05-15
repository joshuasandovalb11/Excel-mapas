import * as XLSX from 'xlsx-js-style';
import { parseISO } from 'date-fns';
import { formatDuration, type Client } from './tripUtils';
import type {
  ProcessedTripV1,
  RouteSummaryStats,
  TripFlag,
} from '../types/route.types';

export const formatExcelDate = (dateString: string | null): string => {
  if (!dateString) return '';
  const meses = [
    'Enero',
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
  if (isNaN(date.getTime())) return dateString;
  const mes = meses[date.getMonth()];
  const dia = String(date.getDate()).padStart(2, '0');
  const anio = date.getFullYear();
  return `${dia}/${mes}/${anio}`;
};

type ReportParams = {
  tripData: ProcessedTripV1 | null;
  mode: 'database' | 'excel';
  databaseClientsAsClients: Client[];
  selection: { mode: 'vendor' | 'driver'; value: string | null };
  masterClients: Client[] | null;
  clientData: Client[] | null;
  minStopDuration: number;
  summaryStats: RouteSummaryStats;
  setIsGeneratingReport: (val: boolean) => void;
};

type ClientVisit = {
  date: string;
  time: string;
  dayOfWeek: number;
  duration: number;
};

export const downloadExcelReport = async (params: ReportParams) => {
  const {
    tripData,
    mode,
    databaseClientsAsClients,
    selection,
    masterClients,
    clientData,
    minStopDuration,
    summaryStats,
    setIsGeneratingReport,
  } = params;

  if (!tripData) {
    alert(
      'No hay ninguna ruta cargada. Por favor, selecciona o carga un viaje.'
    );
    return;
  }

  let clientsForReport: Client[] = [];
  if (mode === 'database') {
    clientsForReport = databaseClientsAsClients;
  } else {
    if (selection.mode === 'driver') {
      clientsForReport = masterClients || [];
    } else {
      clientsForReport = clientData || [];
    }
  }

  if (clientsForReport.length === 0) {
    alert('No se encontraron clientes para generar el reporte.');
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

  try {
    const allVisitsMap = new Map<string, ClientVisit[]>();
    const realDate = tripData.fecha;
    const dayOfWeek = parseISO(realDate).getDay();

    const dayColumnMap: Record<number, number> = {
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      0: 7,
    };
    if (dayColumnMap[dayOfWeek] === undefined)
      throw new Error('Día no válido para reporte');

    const start24h = tripData.summary.workStartTime || 'N/A';
    const startFlag = tripData.flags.find(
      (f: TripFlag) => f.type === 'trip_start'
    );
    const firstValidVisit = tripData.flags.find(
      (f: TripFlag) =>
        f.type === 'stop' &&
        (f.durationMin || 0) >= minStopDuration &&
        f.clientKey &&
        !f.isVendorHome &&
        !specialNonClientKeys.includes(f.clientKey)
    );
    const startClients = firstValidVisit?.time || startFlag?.time || 'N/A';

    for (const flag of tripData.flags) {
      if (
        flag.type === 'stop' &&
        (flag.durationMin || 0) >= minStopDuration &&
        flag.clientKey
      ) {
        const visitKey = `${flag.clientKey}_${flag.clientBranchNumber || 'main'}`;
        const clientVisits = allVisitsMap.get(visitKey) || [];
        clientVisits.push({
          date: realDate,
          time: flag.time,
          dayOfWeek: dayOfWeek,
          duration: flag.durationMin || 0,
        });
        allVisitsMap.set(visitKey, clientVisits);
      }
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
      if (allVisitsMap.has(clientVisitKey)) visitedClients.push(client);
      else nonVisitedClients.push(client);
    }

    const sortedClients: Client[] = [...visitedClients, ...nonVisitedClients];
    if (
      vendorHome &&
      allVisitsMap.has(`${vendorHome.key}_${vendorHome.branchNumber || 'main'}`)
    ) {
      sortedClients.unshift(vendorHome);
    } else if (vendorHome) {
      sortedClients.push(vendorHome);
    }

    const sheetData: Array<Array<string | number>> = [];
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

    sheetData.push(['Reporte Diario de Visitas']);
    sheetData.push([
      `Vehículo / Vendedor: ${tripData.vehiculo} - ${tripData.nombreVendedor || 'S_V'}`,
    ]);
    sheetData.push([]);
    sheetData.push(headers);
    const headerRowIndex = sheetData.length - 1;

    for (const client of sortedClients) {
      let clientName = `${client.key} - ${client.name}`;
      if (client.isVendorHome) clientName += ` (CASA)`;
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

    sheetData.push(['RESUMEN DIARIO - DENTRO DE HORARIO (8:30 - 19:00)']);
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

    const colIndex = dayColumnMap[dayOfWeek];
    if (colIndex !== undefined) {
      vehicleRow[colIndex] = tripData.vehiculo;
      distWithinRow[colIndex] =
        `${Math.round(summaryStats.distanceWithinHours / 1000)} km`;
      totalStopsRow[colIndex] = tripData.flags.filter(
        (f: TripFlag) =>
          f.type === 'stop' && (f.durationMin || 0) >= minStopDuration
      ).length;
      uniqueClientsRow[colIndex] = summaryStats.uniqueClientsVisited;
      start24hRow[colIndex] = start24h;
      startClientsRow[colIndex] = startClients;
      timeWithClientsRow[colIndex] = formatDuration(
        summaryStats.timeWithClients
      );
      timeWithNonClientsRow[colIndex] = formatDuration(
        summaryStats.timeWithNonClients
      );
      timeAtToolsRow[colIndex] = formatDuration(summaryStats.timeAtTools);
      timeAtHomeRow[colIndex] = formatDuration(summaryStats.timeAtHome);
      travelTimeRow[colIndex] = formatDuration(summaryStats.travelTime);

      timeClientsOutRow[colIndex] = formatDuration(
        summaryStats.timeWithClientsAfterHours
      );
      timeNonClientsOutRow[colIndex] = formatDuration(
        summaryStats.timeWithNonClientsAfterHours
      );
      travelTimeOutRow[colIndex] = formatDuration(
        summaryStats.travelTimeAfterHours
      );
      distOutsideRow[colIndex] =
        `${Math.round(summaryStats.distanceAfterHours / 1000)} km`;
    }

    const totalClientsInList = clientsForReport.filter(
      (c) => !c.isVendorHome
    ).length;
    const nonVisitedClientsRow = [
      'Clientes NO Visitados',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      totalClientsInList - summaryStats.uniqueClientsVisited,
    ];

    sheetData.push(vehicleRow);
    sheetData.push(distWithinRow);
    sheetData.push(totalStopsRow);
    sheetData.push(uniqueClientsRow);
    sheetData.push(nonVisitedClientsRow);

    sheetData.push(['Resumen de Tiempos']);
    sheetData.push(start24hRow);
    sheetData.push(startClientsRow);
    sheetData.push(timeWithClientsRow);
    sheetData.push(timeWithNonClientsRow);
    sheetData.push(timeAtToolsRow);
    sheetData.push(timeAtHomeRow);
    sheetData.push(travelTimeRow);

    sheetData.push([]);
    const summaryOutsideStartRow = sheetData.length;
    sheetData.push(['RESUMEN DIARIO - FUERA DE HORARIO']);
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
      summaryStartRow + 6,
      summaryStartRow + 11,
      summaryStartRow + 12,
      summaryStartRow + 13,
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
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Diario');

    const safeSelection =
      tripData.nombreVendedor?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';
    const datePart = formatExcelDate(tripData.fecha).replace(
      /[^a-zA-Z0-9]/g,
      '-'
    );
    const fileNameStr = `Reporte_Viaje_${safeSelection}_${datePart}.xlsx`;
    XLSX.writeFile(wb, fileNameStr);
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    alert(`Error al generar el reporte: ${message}`);
  } finally {
    setIsGeneratingReport(false);
  }
};
