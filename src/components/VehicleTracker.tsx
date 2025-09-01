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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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
            clientName: matchedClient?.name || 'Sin coincidencia',
            clientKey: matchedClient?.key,
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

  // Funcion para leer el archivo EXCEL para las rutas
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTripData(null);
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
        const processed = processTripData(data);
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
        if (flag.isClientVisit) {
          name = `${flag.clientInfo.key} - ${flag.clientInfo.name}`;
          entryType = 'visit';
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
      ]);
      leftSideData.push([
        'Fecha',
        'Hora',
        'Evento',
        '# - Cliente / Descripción',
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
        const formattedDate = formatExcelDate(vehicleInfo.fecha);
        leftSideData.push([
          formattedDate,
          entry.time,
          eventType,
          entry.name,
          entry.duration > 0 ? formatDuration(entry.duration) : '--',
        ]);
      });

      const finalSheetData: any[][] = [];
      finalSheetData.push(['Reporte de Viaje Individual']);
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

      const ws = XLSX.utils.aoa_to_sheet(finalSheetData);
      const merges: XLSX.Range[] = [];

      if (ws['A1']) ws['A1'].s = styles.title;
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

      const rightSideStartCol = 6;
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
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 4 } });

      const tableHeaderRow = 3;
      for (let c = 0; c < 5; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: tableHeaderRow, c })];
        if (cell) cell.s = styles.header;
      }

      reportEntries.forEach((entry, index) => {
        const r = tableHeaderRow + 1 + index;
        const cellFecha = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        const cellHora = ws[XLSX.utils.encode_cell({ r, c: 1 })];
        const cellEvento = ws[XLSX.utils.encode_cell({ r, c: 2 })];
        const cellDesc = ws[XLSX.utils.encode_cell({ r, c: 3 })];
        const cellDuracion = ws[XLSX.utils.encode_cell({ r, c: 4 })];

        if (cellFecha) cellFecha.s = styles.cellCentered; //Estilo para la fecha
        if (cellHora) cellHora.s = styles.cellCentered; //Estilo para la hora
        if (cellEvento) cellEvento.s = styles.eventCell(entry.type); //Estilo para el tipo de evento
        if (cellDesc)
          cellDesc.s =
            entry.type === 'visit' ? styles.clientVisitCell : styles.cell; //Estilo para la descripción
        if (cellDuracion) cellDuracion.s = styles.cellRight; //Estilo para la duración
      });

      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 18 }, //Fecha
        { wch: 15 }, //Hora
        { wch: 20 }, //Evento
        { wch: 70 }, //Descripción
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
    selection: string | null
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
            <h4>Información del Viaje</h4>
            <p><strong>Descripción:</strong> ${vehicleInfo.descripcion}</p>
            <p><strong>Vehículo:</strong> ${vehicleInfo.vehiculo}</p>
            <p><strong>Placa:</strong> ${vehicleInfo.placa}</p>
            <p><strong>Fecha:</strong> ${vehicleInfo.fecha}</p>
        </div>
    `
      : '';

    const clientsToRender = selection === 'chofer' ? [] : clientData || [];

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #map { height: 100%; width: 100%; } body, html { height: 100%; margin: 0; padding: 0; } .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-c { padding: 12px !important; } h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; } h3 span { font-size: 20px; margin-right: 8px; } p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }
            #controls { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 10; background: white; padding: 8px; border: 1px solid #ccc; border-radius: 8px; display: flex; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            #controls button { font-family: sans-serif; font-size: 12px; padding: 8px 12px; cursor: pointer; border-radius: 5px; border: 1px solid #aaa; } #controls button:disabled { cursor: not-allowed; background-color: #f0f0f0; color: #aaa; }
            #info-container { position: absolute; top: 10px; right: 10px; transform: translateY(20%); z-index: 10; display: flex; flex-direction: column; gap: 10px; }
            .info-card { background: rgba(255, 255, 255, 0.9); padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; box-shadow: 0 1px 4px rgba(0,0,0,0.2); font-family: sans-serif; font-size: 12px; width: 240px; }
            .info-card h4 { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
            .info-card p { margin: 3px 0; font-size: 12px; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <div id="info-container">
            ${infoBoxHTML}
            <div id="distance-box" class="info-card">
              <h4>Kilometraje</h4>
              <p><strong>Recorrido del Tramo:</strong> <span id="segment-distance">0.00 km</span></p>
              <p><strong>Recorrido Total:</strong> <span id="total-distance">0.00 km</span></p>
            </div>

            <div id="clients-box" class="info-card">
              <h4>Clientes Visitados</h4>
              <p style="font-size: 16px; text-align: center; font-weight: bold; margin-top: 8px;">
                <span id="visited-clients-count">0</span> / ${totalMatchedStops}
              </p>
            </div>
          </div>

          <div id="controls">
            <button id="playPauseBtn">Ruta completa</button>
            <button id="prevStopBtn" disabled>Anterior Parada</button>
            <button id="nextStopBtn">Siguiente Parada</button>
          </div>
          
          <script>
            let map, markers = [], infowindows = [], openInfoWindow = null, stopInfo = [];
            const routePath = ${JSON.stringify(routes[0]?.path || [])};
            const allFlags = ${JSON.stringify(filteredFlags)};
            const allClients = ${JSON.stringify(clientsToRender)};
            const formatDuration = ${formatDuration.toString()};
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
              document.getElementById('segment-distance').textContent = formatDistance(segmentMeters);
              document.getElementById('total-distance').textContent = formatDistance(totalMeters);
            }

            function createClientMarker(client) {
              const icon = {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: '#A12323',
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.3,
                anchor: new google.maps.Point(12, 24)
              };
              return new google.maps.Marker({
                position: { lat: client.lat, lng: client.lng },
                map,
                icon,
                title: client.name
              });
            }

            function createClientInfoWindow(client) {
              const content = \`
                <div>
                  <h3 style="display:flex; align-items:center;">
                    <span style="margin-right: 8px;">
                       <svg fill="#000000" width="20" height="20" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></svg>
                    </span>
                    Cliente
                  </h3>
                  <p style="margin: 2px 0 0 0; color: #059669;"><strong>#</strong> <strong> \${client.key} </strong></p>
                  <p style="margin: 2px 0 0 0; color: #059669;"><strong> \${client.name} </strong></p>
                </div>\`;
              return new google.maps.InfoWindow({ content });
            }

            function initMap() {
                map = new google.maps.Map(document.getElementById('map'), { center: ${mapCenter}, zoom: 12, mapTypeControl: false, streetViewControl: true });
                const bounds = new google.maps.LatLngBounds();

                allFlags.forEach((flag, index) => {
                    if (!flag) return;
                    const marker = createMarker(flag); const infowindow = createInfoWindow(flag);
                    markers.push(marker); infowindows.push(infowindow);
                    marker.addListener('click', () => { if (openInfoWindow) openInfoWindow.close(); infowindow.open(map, marker); openInfoWindow = infowindow; });
                    if (flag.type === 'start' || flag.type === 'stop' || flag.type === 'end') {
                        const flagLatLng = new google.maps.LatLng(flag.lat, flag.lng);
                        let closestPathIndex = -1; let minDistance = Infinity;
                        routePath.forEach((pathPoint, i) => { const pathLatLng = new google.maps.LatLng(pathPoint.lat, pathPoint.lng); const distance = google.maps.geometry.spherical.computeDistanceBetween(flagLatLng, pathLatLng); if (distance < minDistance) { minDistance = distance; closestPathIndex = i; } });
                        stopInfo.push({ markerIndex: index, pathIndex: closestPathIndex, type: flag.type });
                    }
                    bounds.extend(marker.getPosition());
                });

                allClients.forEach(client => {
                  const clientMarker = createClientMarker(client);
                  const clientInfoWindow = createClientInfoWindow(client);
                  clientMarker.addListener('click', () => {
                    if (openInfoWindow) openInfoWindow.close();
                    clientInfoWindow.open(map, clientMarker);
                    openInfoWindow = clientInfoWindow;
                  });
                  bounds.extend(clientMarker.getPosition());
                });

                let lastPathIndex = 0;
                for (let i = 0; i < stopInfo.length; i++) {
                  const stop = stopInfo[i];
                  if (stop.type === 'start') continue;
                  const segmentPath = routePath.slice(lastPathIndex, stop.pathIndex + 1);
                  const segmentLength = google.maps.geometry.spherical.computeLength(segmentPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                  segmentDistances.push(segmentLength);
                  lastPathIndex = stop.pathIndex;
                }
                
                totalTripDistanceMeters = google.maps.geometry.spherical.computeLength(routePath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                updateDistanceCard(0, cumulativeDistance);

                map.fitBounds(bounds);
                animatedPolyline = new google.maps.Polyline({ path: [], strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 5, map: map });
                document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
                document.getElementById('nextStopBtn').addEventListener('click', animateToNextStop);

                // CAMBIO: Se añade el event listener para el nuevo botón
                document.getElementById('prevStopBtn').addEventListener('click', animateToPreviousStop);
            }

            function createMarker(flag) {
                const colors = { start: '#22c55e', stop: '#4F4E4E', end: '#ef4444' };
                const icon = { path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', fillColor: colors[flag.type], fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 24) };
                return new google.maps.Marker({ position: { lat: flag.lat, lng: flag.lng }, map, icon, title: flag.description });
            }

            function createInfoWindow(flag) {
                let content = '';
                switch (flag.type) {
                    case 'start': content = \`<h3><span style="color: #22c55e;">&#127937;</span> \${flag.description}</h3><p><strong>Hora:</strong> \${flag.time}</p>\`; break;
                    case 'end': content = \`<h3><span style="color: #ef4444;">&#127937;</span> \${flag.description}</h3><p><strong>Hora:</strong> \${flag.time}</p>\`; break;
                    case 'stop':
                        const clientInfo = flag.clientName && flag.clientName !== 'Sin coincidencia'
                            ? \`<div style="color:#059669;">
                                 <p style="margin: 2px 0; font-weight: 500;"><strong>#</strong> <strong>\${flag.clientKey || 'N/A'}</strong></p>
                                 <p style="margin: 2px 0; font-weight: 500;"><strong> \${flag.clientName} </strong></p>
                               </div>\`
                            : \`<p style="color:#FC2121; font-weight: 500;"><strong>Cliente:</strong> Sin coincidencia</p>\`;
                        content = \`<h3><span style="color: #4F4E4E;">&#9209;</span> Parada \${flag.stopNumber}</h3><p><strong>Duración:</strong> \${formatDuration(flag.duration || 0)}</p><p><strong>Hora:</strong> \${flag.time}</p>\${clientInfo}<p>\${flag.description.replace(\`Parada \${flag.stopNumber}: \`, '')}</p>\`;
                        break;
                }
                return new google.maps.InfoWindow({ content });
            }

            function drawEntireRoute() {
                if (openInfoWindow) openInfoWindow.close();
                animatedPolyline.setPath(routePath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                currentPathIndex = routePath.length;
                updateDistanceCard(0, totalTripDistanceMeters);
                document.getElementById('playPauseBtn').disabled = true;
                document.getElementById('nextStopBtn').disabled = true;
                // CAMBIO: Deshabilitar también el botón de parada anterior
                document.getElementById('prevStopBtn').disabled = true;
                const endMarker = markers[markers.length - 1];
                if (endMarker) {
                    endMarker.setAnimation(google.maps.Animation.BOUNCE);
                    setTimeout(() => endMarker.setAnimation(null), 1400);
                    infowindows[infowindows.length - 1].open(map, endMarker);
                }
            }

            function togglePlayPause() {
                if (processingMethod === 'speed-based') {
                    drawEntireRoute();
                    return;
                }
                
                const btn = document.getElementById('playPauseBtn');
                isAnimating = !isAnimating;
                if (isAnimating) {
                    btn.textContent = 'Pausa';
                    document.getElementById('nextStopBtn').disabled = true;
                    // CAMBIO: Deshabilitar también el botón de parada anterior durante la animación
                    document.getElementById('prevStopBtn').disabled = true;
                    if (openInfoWindow) openInfoWindow.close();
                    animateSmoothly(routePath.length - 1, () => {
                        updateDistanceCard(0, totalTripDistanceMeters);
                    });
                } else {
                    btn.textContent = 'Reproducir';
                    if (currentStopIndex < stopInfo.length - 1) {
                       document.getElementById('nextStopBtn').disabled = false;
                    }
                    // CAMBIO: Habilitar el botón de parada anterior si no estamos en el inicio
                    if (currentStopIndex > 0) {
                        document.getElementById('prevStopBtn').disabled = false;
                    }
                    cancelAnimationFrame(animationFrameId);
                }
            }
            
            function animateToNextStop() {
                if (currentStopIndex >= stopInfo.length - 1) return;
                const nextStop = stopInfo[currentStopIndex + 1];
                isAnimating = true;
                if (openInfoWindow) openInfoWindow.close();
                document.getElementById('playPauseBtn').disabled = true;
                document.getElementById('nextStopBtn').disabled = true;
                // CAMBIO: Deshabilitar también el botón de parada anterior
                document.getElementById('prevStopBtn').disabled = true;
                
                const onSegmentComplete = () => {
                    isAnimating = false;
                    const marker = markers[nextStop.markerIndex];
                    const infowindow = infowindows[nextStop.markerIndex];
                    marker.setAnimation(google.maps.Animation.BOUNCE);
                    setTimeout(() => marker.setAnimation(null), 1400);
                    if (openInfoWindow) openInfoWindow.close();
                    infowindow.open(map, marker);
                    openInfoWindow = infowindow;
                    const segmentMeters = segmentDistances[currentStopIndex] || 0;
                    cumulativeDistance += segmentMeters;
                    updateDistanceCard(segmentMeters, cumulativeDistance);

                    const currentFlag = allFlags[nextStop.markerIndex];
                    if (currentFlag && currentFlag.type === 'stop' && currentFlag.clientKey && !countedClientKeys.has(currentFlag.clientKey)) {
                        countedClientKeys.add(currentFlag.clientKey);
                        document.getElementById('visited-clients-count').textContent = countedClientKeys.size;
                    }
                    currentStopIndex++;
                    document.getElementById('playPauseBtn').disabled = false;

                    // CAMBIO: Habilitar siempre el botón de parada anterior después de avanzar
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

            // CAMBIO: NUEVA FUNCIÓN para ir a la parada anterior
            function animateToPreviousStop() {
                if (currentStopIndex <= 0) return;

                if (openInfoWindow) openInfoWindow.close();
                document.getElementById('playPauseBtn').disabled = true;
                document.getElementById('nextStopBtn').disabled = true;
                document.getElementById('prevStopBtn').disabled = true;

                // Identificar el cliente de la parada que estamos "deshaciendo"
                const lastStopFlag = allFlags[stopInfo[currentStopIndex].markerIndex];
                
                currentStopIndex--;
                
                const previousStop = stopInfo[currentStopIndex];
                const segmentMetersToUndo = segmentDistances[currentStopIndex] || 0;
                cumulativeDistance -= segmentMetersToUndo;

                // Recortar el polyline
                const newPath = routePath.slice(0, previousStop.pathIndex + 1);
                animatedPolyline.setPath(newPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                currentPathIndex = newPath.length - 1;

                // Lógica para decrementar el contador de clientes visitados
                if (lastStopFlag && lastStopFlag.type === 'stop' && lastStopFlag.clientKey) {
                    const clientKeyToRemove = lastStopFlag.clientKey;
                    // Verificar si este cliente fue visitado en otra parada anterior que aún está en la ruta
                    let isStillVisited = false;
                    for (let i = 0; i <= currentStopIndex; i++) {
                        const flag = allFlags[stopInfo[i].markerIndex];
                        if (flag.clientKey === clientKeyToRemove) {
                            isStillVisited = true;
                            break;
                        }
                    }
                    // Si no hay otra visita a este cliente, lo eliminamos del set
                    if (!isStillVisited && countedClientKeys.has(clientKeyToRemove)) {
                        countedClientKeys.delete(clientKeyToRemove);
                        document.getElementById('visited-clients-count').textContent = countedClientKeys.size;
                    }
                }

                updateDistanceCard(segmentMetersToUndo, cumulativeDistance);

                const marker = markers[previousStop.markerIndex];
                const infowindow = infowindows[previousStop.markerIndex];
                marker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => marker.setAnimation(null), 1400);
                infowindow.open(map, marker);
                openInfoWindow = infowindow;

                // Reactivar botones
                document.getElementById('playPauseBtn').disabled = false;
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
    const htmlContent = generateMapHTML(
      vehicleInfo,
      clientData,
      matchedStopsCount,
      selection.value
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
            <div className="flex gap-4">
              <button
                onClick={downloadReport}
                disabled={isGeneratingReport || !selection.value}
                className="flex items-center justify-center w-full px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-transform transform hover:scale-105 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                <FileText className="h-5 w-5 mr-2" />
                {isGeneratingReport ? 'Generando...' : 'Descargar Reporte'}
              </button>

              <button
                onClick={downloadMap}
                className="flex items-center justify-center w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-transform transform hover:scale-105"
              >
                <Download className="h-5 w-5 mr-2" />
                Descargar Mapa HTML
              </button>
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
              selection.value
            )}
            className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-md"
            title="Vista Previa del Mapa"
          />
        </div>
      )}
    </div>
  );
}
