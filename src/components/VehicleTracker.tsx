/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Upload,
  Download,
  Car,
  Users,
  UserCheck,
  Truck,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

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

export default function VehicleTracker() {
  // Estados principales
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
    'current'
  );

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

  // Función para obtener la dirección a partir de coordenadas usando la API de Google Maps
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

  // Funcion para leer el archivo EXCEL para las rutas
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTripData(null);
    setRawTripData(null);
    setVehicleInfo(null);
    setError(null);
    setFileName(file.name);
    // setClientData(null);
    // setClientFileName(null);
    // setAllClientsFromFile(null);
    // setAvailableVendors([]);
    // setSelection(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          throw new Error('No se pudo leer el archivo.');
        }
        const bstr = event.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const vehicleData = parseVehicleInfo(ws, file.name);
        setVehicleInfo(vehicleData);

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
            "No se pudo encontrar la fila de encabezados. Verifique que el archivo contenga 'Latitud', 'Longitud', 'Velocidad(km)', etc."
          );
        }
        const data = XLSX.utils.sheet_to_json(ws, {
          range: headerRowIndex,
          defval: '',
        });
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(
            'No se encontraron datos en el archivo de viaje o el formato es incorrecto.'
          );
        }
        setRawTripData(data);
        const processed = processTripData(
          data,
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
            : 'Ocurrió un error desconocido al procesar el archivo.'
        );
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
    setSelection({ mode: selection.mode, value: selected });
    if (allClientsFromFile) {
      if (selected === 'chofer') {
        // Modo chofer: usa todos los clientes para matching, pero no los muestra en el mapa
        setClientData(allClientsFromFile);
      } else {
        // Modo vendedor: filtra los clientes por vendedor
        const filteredClients = allClientsFromFile.filter(
          (client) => client.vendor === selected
        );
        setClientData(filteredClients);
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

  // FUNCIÓN PARA GENERAR Y DESCARGAR EL REPORTE
  const downloadReport = async () => {
    if (!tripData || !vehicleInfo || !clientData) {
      alert(
        'Se necesita un archivo de viaje y un archivo de clientes para generar el reporte.'
      );
      return;
    }

    setIsGeneratingReport(true);

    const styles = {
      title: {
        font: { name: 'Arial', sz: 18, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF0275D8' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      infoLabel: {
        font: { name: 'Arial', sz: 10, bold: true },
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
    };

    try {
      let clientsForReport: Client[] = [];
      if (selection.mode === 'driver') {
        clientsForReport = allClientsFromFile || [];
      } else {
        clientsForReport = clientData || [];
      }
      if (clientsForReport.length === 0) {
        throw new Error('No se encontraron clientes para este reporte.');
      }
      const coordsToFetch = new Map<string, { lat: number; lng: number }>();
      const allFlagsToProcess: any[] = [];
      const visitedClientKeys = new Set<string>();
      for (const flag of tripData.flags) {
        if (
          flag.type === 'start' ||
          flag.type === 'end' ||
          (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration)
        ) {
          let isClientVisit = false;
          let clientInfo = null;
          if (flag.type === 'stop') {
            for (const client of clientsForReport) {
              const distance = calculateDistance(
                flag.lat,
                flag.lng,
                client.lat,
                client.lng
              );
              if (distance < clientRadius) {
                isClientVisit = true;
                clientInfo = {
                  key: client.key,
                  name: client.name,
                  branchNumber: client.branchNumber,
                  branchName: client.branchName,
                };
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
          });
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
      const reportEntries: any[] = [];
      for (const flag of allFlagsToProcess) {
        let name = '';
        let entryType = flag.type;
        let branchNumber = undefined;
        let branchName = undefined;
        if (flag.isClientVisit) {
          name = `${flag.clientInfo.key} - ${flag.clientInfo.name}`;
          entryType = 'visit';
          branchNumber = flag.clientBranchNumber;
          branchName = flag.clientBranchName;
        } else {
          const address =
            addressCache.get(flag.coordKey) || 'Dirección no disponible';
          if (
            flag.type === 'start' ||
            flag.type === 'end' ||
            flag.type === 'stop'
          )
            name = address;
        }
        reportEntries.push({
          fecha: formatExcelDate(vehicleInfo.fecha),
          time: flag.time,
          type: entryType,
          name: name,
          duration: flag.duration || 0,
          branchNumber,
          branchName,
        });
      }
      reportEntries.sort((a, b) => a.time.localeCompare(b.time));

      const uniqueClientsVisited = new Set(
        reportEntries
          .filter((e) => e.type === 'visit')
          .map((e) => e.name.split(' - ')[0])
      ).size;
      const totalDuration = reportEntries.reduce(
        (sum, entry) => sum + entry.duration,
        0
      );
      const totalMinutesForPercentage = 8 * 60;
      const percentageOfTimeUsed = Math.min(
        (totalDuration / totalMinutesForPercentage) * 100,
        100
      );
      const formattedPercentage = `${percentageOfTimeUsed.toFixed(2)}%`;
      const totalStopsAndVisits = reportEntries.filter(
        (e) => e.type === 'visit' || e.type === 'stop'
      ).length;

      const rightSideData = [
        ['Información del Viaje'],
        ['Fecha:', vehicleInfo.fecha],
        ['Vehículo:', vehicleInfo.placa],
        [
          'Reporte para:',
          selection.mode === 'driver' ? 'CHOFER' : selection.value,
        ],
        [],
        ['Resumen del Viaje'],
        ['Número de Paradas:', String(totalStopsAndVisits)],
        ['Clientes Únicos Visitados:', String(uniqueClientsVisited)],
        [
          'Kilometraje Total:',
          `${Math.round(tripData.totalDistance / 1000)} km`,
        ],
        ['Duración Total en Paradas:', formatDuration(totalDuration)],
        ['% de Tiempo Utilizado (8h):', formattedPercentage],
      ];

      const leftSideData: any[][] = [];
      leftSideData.push([
        `Detalle de Actividades (${vehicleInfo.fecha})`,
        '',
        '',
        '',
        '',
        '',
      ]);
      leftSideData.push([
        'Fecha',
        'Hora',
        'Evento',
        '# - Cliente / Descripción',
        'Sucursal',
        'Duración',
      ]);

      reportEntries.forEach((entry) => {
        let eventType = '';
        switch (entry.type) {
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

        let branchInfo = '--';
        if (entry.type === 'visit' && entry.branchNumber) {
          branchInfo = entry.branchName
            ? `Suc. ${entry.branchNumber} (${entry.branchName})`
            : `Suc. ${entry.branchNumber}`;
        }

        const formattedDate = formatExcelDate(vehicleInfo.fecha);
        leftSideData.push([
          formattedDate,
          entry.time,
          eventType,
          entry.name,
          branchInfo,
          entry.duration > 0 ? formatDuration(entry.duration) : '--',
        ]);
      });

      const finalSheetData: any[][] = [];
      finalSheetData.push(['Reporte de Viaje Individual']);
      finalSheetData.push([]);

      const numRows = Math.max(leftSideData.length, rightSideData.length);
      const startRow = 2;

      for (let i = 0; i < numRows; i++) {
        const leftRow = leftSideData[i] || ['', '', '', '', '', ''];
        const rightRow = rightSideData[i] || [];
        finalSheetData[startRow + i] = [
          ...leftRow,
          '',
          ...(rightRow || ['', '']),
        ];
      }

      const ws = XLSX.utils.aoa_to_sheet(finalSheetData);
      const merges: XLSX.Range[] = [];

      if (ws['A1']) ws['A1'].s = styles.title;
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });

      const rightSideStartCol = 7;
      if (ws[XLSX.utils.encode_cell({ r: 2, c: rightSideStartCol })])
        ws[XLSX.utils.encode_cell({ r: 2, c: rightSideStartCol })].s =
          styles.subHeader;
      merges.push({
        s: { r: 2, c: rightSideStartCol },
        e: { r: 2, c: rightSideStartCol + 1 },
      });

      for (let i = 3; i <= 5; i++) {
        if (ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })])
          ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })].s =
            styles.infoLabel;
        if (ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })])
          ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })].s =
            styles.infoValue;
      }

      if (ws[XLSX.utils.encode_cell({ r: 7, c: rightSideStartCol })])
        ws[XLSX.utils.encode_cell({ r: 7, c: rightSideStartCol })].s =
          styles.subHeader;
      merges.push({
        s: { r: 7, c: rightSideStartCol },
        e: { r: 7, c: rightSideStartCol + 1 },
      });

      for (let i = 8; i <= 12; i++) {
        if (ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })])
          ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol })].s =
            styles.summaryLabel;
        if (ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })])
          ws[XLSX.utils.encode_cell({ r: i, c: rightSideStartCol + 1 })].s =
            styles.summaryValue;
      }

      if (ws['A3']) ws['A3'].s = styles.subHeader;
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } });

      const tableHeaderRow = 3;
      for (let c = 0; c < 6; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: tableHeaderRow, c })];
        if (cell) cell.s = styles.header;
      }

      reportEntries.forEach((entry, index) => {
        const r = tableHeaderRow + 1 + index;
        const cellFecha = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        const cellHora = ws[XLSX.utils.encode_cell({ r, c: 1 })];
        const cellEvento = ws[XLSX.utils.encode_cell({ r, c: 2 })];
        const cellDesc = ws[XLSX.utils.encode_cell({ r, c: 3 })];
        const cellSucursal = ws[XLSX.utils.encode_cell({ r, c: 4 })];
        const cellDuracion = ws[XLSX.utils.encode_cell({ r, c: 5 })];

        if (cellFecha) cellFecha.s = styles.cellCentered; //Estilo para la fecha
        if (cellHora) cellHora.s = styles.cellCentered; //Estilo para la hora
        if (cellEvento) cellEvento.s = styles.eventCell(entry.type); //Estilo para el tipo de evento
        if (cellDesc)
          cellDesc.s =
            entry.type === 'visit' ? styles.clientVisitCell : styles.cell; //Estilo para la descripción
        if (cellSucursal) cellSucursal.s = styles.cellCentered; //Estilo para la sucursal
        if (cellDuracion) cellDuracion.s = styles.cellRight; //Estilo para la duración
      });

      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 18 }, //Fecha
        { wch: 15 }, //Hora
        { wch: 20 }, //Evento
        { wch: 50 }, //Descripción
        { wch: 25 }, //Sucursal
        { wch: 15 }, //Duración
        { wch: 3 }, //Espacio
        { wch: 30 },
        { wch: 25 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Viaje');

      const safeSelection =
        selection.value?.replace(/[^a-zA-Z0-9]/g, '') || 'S_V';
      const safeDate = vehicleInfo.fecha.replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `Reporte_Viaje_${safeSelection}_${safeDate}.xlsx`;
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
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <h4 style="margin: 0;">Información del Viaje</h4>
            <button class="toggle-btn toggle-info-btn" aria-label="Minimizar/Maximizar">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
          </div>
          <div class="info-content info-grid" style="display: grid; grid-template-columns: 1.5fr 1.4fr; gap: 1px;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
          <h4 style="margin: 0;">Resumen del Viaje (8:30 - 19:00)</h4>
          <button class="toggle-btn toggle-summary-btn" aria-label="Minimizar/Maximizar">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        <div class="summary-content summary-grid" style="display: grid; grid-template-columns: 1.5fr 1fr 0.2fr; gap: 1px;">
          <p><strong>Estado inicial:</strong></p>
          <p style="text-align: left;">${tripData.initialState}</p>
          <p></p>
          
          <p><strong>Inicio de labores:</strong></p>
          <p style="text-align: left;"><strong>${tripData.workStartTime || 'N/A'}</strong></p>
          <p></p>
          
          <p><strong>Clientes Visitados:</strong></p>
          <p style="text-align: left;"><span class="visited-clients-count">0</span> / ${totalMatchedStops}</p>
          <p></p>
          
          <p><strong>Tiempo con Clientes:</strong></p>
          <p style="text-align: left;">${formatDuration(summaryStats.timeWithClients)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageClients.toFixed(1)}%</strong></p>
          
          <p style="color: #FF0000;"><strong>Tiempo con NO Clientes:</strong></p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeWithNonClients)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageNonClients.toFixed(1)}%</strong></p>
          
          <p><strong>Tiempo en Traslados:</strong></p>
          <p style="text-align: left;">${formatDuration(summaryStats.travelTime)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageTravel.toFixed(1)}%</strong></p>
          
          <p><strong>Distancia Tramo:</strong></p>
          <p style="text-align: left;"><span id="segment-distance">0.00 km</span></p>
          <p></p>
          
          <p><strong>Distancia Total:</strong></p>
          <p style="text-align: left;"><span id="total-distance">0.00 km</span></p>
          <p></p>
          
          <p><strong>Fin de labores:</strong></p>
          <p style="text-align: left;">
            <strong>
              ${
                viewMode === 'new' && tripData.isTripOngoing
                  ? 'En movimiento...'
                  : tripData.workEndTime || 'N/A'
              }
            </strong>
          </p>
          <p></p>

          <!-- TIEMPOS FUERA DE HORARIO LABORAL -->
          <p style="color: #888; border-top: 1px solid #ccc; padding-top: 5px;"><strong>Fuera de Horario:</strong></p>
          <p style="color: #888; border-top: 1px solid #ccc; padding-top: 5px;"></p>
          <p style="color: #888; border-top: 1px solid #ccc; padding-top: 5px;"></p>
          
          <p style="color: #888;"><strong>• Con Clientes:</strong></p>
          <p style="text-align: left; color: #888;">${formatDuration(summaryStats.timeWithClientsAfterHours)}</p>
          <p style="text-align: left; color: #888;"></p>
          
          <p style="color: #888;"><strong>• Con NO Clientes:</strong></p>
          <p style="text-align: left; color: #888;">${formatDuration(summaryStats.timeWithNonClientsAfterHours)}</p>
          <p style="text-align: left; color: #888;"></p>
          
          <p style="color: #888;"><strong>• En Traslados:</strong></p>
          <p style="text-align: left; color: #888;">${formatDuration(summaryStats.travelTimeAfterHours)}</p>
          <p style="text-align: left; color: #888;"></p>
          
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
              gap: 10px; 
            }
            
            .info-card { 
              background: rgba(255, 255, 255, 0.9); 
              padding: 8px 12px; 
              border-radius: 6px; 
              border: 1px solid #ccc; 
              box-shadow: 0 1px 4px rgba(0,0,0,0.2); 
              font-family: sans-serif; 
              font-size: 12px; 
              width: 280px; 
            }
            
            .info-card h4 { 
              font-size: 14px; 
              font-weight: bold; 
              margin: 0; 
              padding-bottom: 4px; 
              border-bottom: 1px solid #ddd; 
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
              margin: 3px 0; 
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
              
              const icon = {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: isSpecial ? '#007bff' : '#A12323',
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

              const content = \`
                <div>
                  <h3 style="display:flex; align-items:center; font-size: 15px;">
                    <span style="margin-right: 8px; font-size:15px;">
                      <i class="fa-solid fa-house"></i>
                    </span>
                    Cliente
                  </h3>
                  <strong><p style="margin: 2px 0 0 0; color: #059669; font-size: 12px;"><strong>#</strong> <strong> \${client.key} </strong></p></strong>
                  <strong><p style="margin: 2px 0 0 0; color: #059669; font-size: 12px;"><strong> \${client.displayName} </strong></p></strong>
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

      // Tiempos fuera de horario laboral
      timeWithClientsAfterHours: 0,
      timeWithNonClientsAfterHours: 0,
      travelTimeAfterHours: 0,

      // Totales
      totalWorkingTime: 0,
      totalAfterHoursTime: 0,

      // Porcentajes (solo del horario laboral)
      percentageClients: 0,
      percentageNonClients: 0,
      percentageTravel: 0,
    };

    if (!tripData || !vehicleInfo?.fecha) return stats;

    const timeToMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 60 + m + (s || 0) / 60;
    };

    // Horario laboral: 8:30 (510 minutos) a 19:00 (1140 minutos)
    const WORK_START_MINUTES = 8 * 60 + 30; // 510
    const WORK_END_MINUTES = 19 * 60; // 1140

    // Función para calcular cuántos minutos de una duración caen dentro del horario laboral
    const splitDurationByWorkingHours = (
      startTime: string,
      durationMinutes: number
    ): { withinHours: number; outsideHours: number } => {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + durationMinutes;

      let withinHours = 0;
      let outsideHours = 0;

      // Iterar minuto por minuto para determinar si está dentro o fuera del horario
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

    // Obtener eventos de inicio y fin reales del viaje
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

    // CALCULAR TIEMPOS DE PARADA (dividiendo según horario)
    tripData.flags.forEach((flag) => {
      if (flag.type === 'stop' && (flag.duration || 0) >= minStopDuration) {
        const duration = flag.duration || 0;
        const split = splitDurationByWorkingHours(flag.time, duration);

        if (
          flag.clientName &&
          flag.clientName !== 'Sin coincidencia' &&
          !specialNonClientKeys.includes(flag.clientKey || '')
        ) {
          stats.timeWithClients += split.withinHours;
          stats.timeWithClientsAfterHours += split.outsideHours;
        } else {
          stats.timeWithNonClients += split.withinHours;
          stats.timeWithNonClientsAfterHours += split.outsideHours;
        }
      }
    });

    // CALCULAR TIEMPO DE TRASLADO
    const totalStopTimeWorkingHours =
      stats.timeWithClients + stats.timeWithNonClients;
    stats.travelTime = Math.max(
      0,
      stats.totalWorkingTime - totalStopTimeWorkingHours
    );

    const totalStopTimeAfterHours =
      stats.timeWithClientsAfterHours + stats.timeWithNonClientsAfterHours;
    stats.travelTimeAfterHours = Math.max(
      0,
      stats.totalAfterHoursTime - totalStopTimeAfterHours
    );

    // CALCULAR PORCENTAJES (solo del horario laboral)
    if (stats.totalWorkingTime > 0) {
      stats.percentageClients =
        (stats.timeWithClients / stats.totalWorkingTime) * 100;
      stats.percentageNonClients =
        (stats.timeWithNonClients / stats.totalWorkingTime) * 100;
      stats.percentageTravel =
        (stats.travelTime / stats.totalWorkingTime) * 100;
    }

    return stats;
  };

  const summaryStats = calculateSummaryStats();

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="flex justify-center items-center mb-4">
            <Car className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">
            Visualizador de Rutas
          </h1>
          <p className="text-gray-500 mt-2">
            Paso 1: Sube el archivo de eventos de vehículo para generar el mapa.
          </p>
        </div>
        <div>
          <label
            htmlFor="dropzone-file"
            className="flex flex-col items-center justify-center w-full h-64 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                handleFileUpload({ target: { files } } as any);
              }
            }}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-10 h-10 mb-3 text-blue-500 motion-safe:animate-bounce" />
              {fileName ? (
                <p className="font-semibold text-blue-700">{fileName}</p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-gray-600">
                    <span className="font-semibold">Haz clic para subir</span> o
                    arrastra y suelta
                  </p>
                  <p className="text-xs text-gray-500">XLSX, XLS</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="dropzone-file"
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".xlsx, .xls"
            />
          </label>
        </div>

        {tripData && (
          <div className="mt-6">
            <p className="text-center text-gray-600 mb-2">
              Paso 2 (Opcional): Sube el archivo de clientes para identificar
              paradas.
            </p>
            <label
              htmlFor="clients-file"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100 transition-colors"
            >
              <div className="flex flex-col items-center justify-center">
                <Users className="w-8 h-8 mb-2 text-green-500 motion-safe:animate-bounce" />
                {clientFileName ? (
                  <p className="font-semibold text-green-700">
                    {clientFileName}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">
                        Subir archivo de Clientes
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">XLSX, XLS</p>
                  </>
                )}
              </div>
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

        {/* SECCIÓN PARA SELECCIONAR VENDEDOR O CHOFER */}
        {availableVendors.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 items-center gap-2">
              <UserCheck className="w-5 h-5 text-gray-500" />
              Paso 3: Selecciona un vendedor o modo chofer
            </label>
            <label className="block text-sm font-medium text-gray-700 mb-2 items-center gap-2 border-b border-b-gray-300">
              Vendedores
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {availableVendors.map((vendor) => (
                <button
                  key={vendor}
                  onClick={() => handleSelection(vendor)}
                  className={`
                            px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out
                            ${
                              selection.value === vendor
                                ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-green-100 hover:border-green-400'
                            }
                          `}
                >
                  {vendor}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2 mt-2 items-center gap-2 border-b border-b-gray-300">
              Modo chofer
            </label>
            <button
              key="chofer"
              onClick={() => handleSelection('chofer')}
              className={`
                            px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out flex items-center gap-2
                            ${
                              selection.value === 'chofer'
                                ? 'bg-red-500 text-white border-red-500 shadow-lg transform scale-105'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-red-100 hover:border-red-400'
                            }
                          `}
            >
              <Truck className="w-4 h-4" />
              CHOFER
            </button>
          </div>
        )}

        {error && (
          <div className="text-center p-4 bg-red-100 text-red-700 rounded-lg">
            <p>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {tripData && (
          <div className="border-t border-t-gray-300 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
              Modo de Vista de Jornada
            </label>
            <div className="flex justify-center">
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('current')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'current'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Vista Actual
                </button>
                <button
                  onClick={() => setViewMode('new')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'new'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Vista Completa
                </button>
              </div>
            </div>
          </div>
        )}

        {tripData && (
          <div className="space-y-4">
            {/* Input para determinar las paradas mayor a que minutos */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="stop-duration"
                className="text-sm font-medium text-gray-700"
              >
                Mostrar paradas mayores a:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  id="stop-duration"
                  min="1"
                  max="120"
                  value={minStopDuration}
                  onChange={(e) => setMinStopDuration(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">minutos</span>
              </div>
            </div>
            {/* Input para el radio de coincidencia del cliente */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="client-radius"
                className="text-sm font-medium text-gray-700"
              >
                Radio de detección de cliente:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  id="client-radius"
                  min="10"
                  max="1000"
                  step="10"
                  value={clientRadius}
                  onChange={(e) => setClientRadius(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">metros</span>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-1 lg:flex lg:gap-4">
              <button
                onClick={downloadReport}
                disabled={isGeneratingReport || !selection.value}
                className="flex items-center justify-center w-full px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-transform transform hover:scale-105 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                <FileText className="h-5 w-5 mr-2" />
                {isGeneratingReport ? 'Generando...' : 'Descargar Reporte'}
              </button>

              {/* Contenedor para los botones de mapa */}
              <div className="w-full">
                {/* BOTÓN SOLO PARA MÓVILES */}
                <button
                  onClick={openMapInTab}
                  className="flex sm:hidden items-center justify-center w-full px-4 py-3 bg-teal-500 text-white font-bold rounded-lg hover:bg-teal-600 transition-transform transform hover:scale-105"
                >
                  <ExternalLink className="h-5 w-5 mr-2" />
                  Abrir Mapa
                </button>

                {/* BOTÓN SOLO PARA ESCRITORIO */}
                <button
                  onClick={downloadMap}
                  className="hidden sm:flex items-center justify-center w-full px-4 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-transform transform hover:scale-105"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Descargar Mapa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {tripData && (
        <div className="relative w-full max-w-6xl mt-8">
          <h2 className="text-2xl font-bold text-center mb-4">
            Vista Previa del Mapa
          </h2>
          <iframe
            srcDoc={generateMapHTML(
              vehicleInfo,
              clientData,
              matchedStopsCount,
              selection.value,
              summaryStats
            )}
            className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-md"
            title="Vista Previa del Mapa"
          />
        </div>
      )}
    </div>
  );
}
