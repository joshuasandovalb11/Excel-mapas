/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { MapPin, Upload, Download, Clock, Car, ParkingSquare } from 'lucide-react';

// INTERFACES PARA ESTRUCTURAR LOS DATOS
interface TripEvent {
  id: number;
  time: string;
  description: string;
  speed: number;
  lat: number;
  lng: number;
}

interface ProcessedTrip {
  events: TripEvent[];
  routes: Array<{
    path: Array<{ lat: number; lng: number }>;
  }>;
  flags: Array<{
    lat: number;
    lng: number;
    type: 'start' | 'stop' | 'end';
    time: string;
    description: string;
    duration?: number;
    stopNumber?: number;
    clientKey?: string;
    clientName?: string;
  }>;
}

interface VehicleInfo {
  descripcion: string;
  vehiculo: string;
  placa: string;
  fecha: string;
}

interface Client {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export default function VehicleTracker() {
  const [tripData, setTripData] = useState<ProcessedTrip | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [clientData, setClientData] = useState<Client[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientFileName, setClientFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minStopDuration, setMinStopDuration] = useState<number>(5);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const googleMapsApiKey = 'AIzaSyBb7rJA438WYzdA3js2zJcMYOotPn-FR6s';

  const toTitleCase = (str: string): string => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  };

  const parseVehicleInfo = (worksheet: XLSX.WorkSheet): VehicleInfo => {
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const info: Partial<VehicleInfo> = {
        descripcion: "No encontrado",
        vehiculo: "No encontrado",
        placa: "No encontrada",
        fecha: "No encontrada",
    };
    for (const row of data.slice(0, 10)) {
        if (!Array.isArray(row)) continue;
        const descIndex = row.findIndex((cell: any) => typeof cell === 'string' && cell.trim().startsWith('Descripción de Vehículo:'));
        const placaIndex = row.findIndex((cell: any) => typeof cell === 'string' && cell.trim().startsWith('Vehículo Placa:'));
        if (descIndex !== -1) {
            for (let i = descIndex + 1; i < (placaIndex !== -1 ? placaIndex : row.length); i++) {
                if (row[i]) { info.descripcion = row[i]; break; }
            }
        }
        if (placaIndex !== -1) {
             for (let i = placaIndex + 1; i < row.length; i++) {
                if (row[i]) { info.placa = row[i]; break; }
            }
        }
        const vehicleIndex = row.findIndex((cell: any) => typeof cell === 'string' && cell.trim().startsWith('Tipo de Vehículo:'));
        if (vehicleIndex !== -1) {
            for (let i = vehicleIndex + 1; i < row.length; i++) {
                if (row[i]) { info.vehiculo = row[i]; break; }
            }
        }
        const periodIndex = row.findIndex((cell: any) => typeof cell === 'string' && cell.trim().startsWith('Período:'));
        if (periodIndex !== -1) {
             for (let i = periodIndex + 1; i < row.length; i++) {
                if (row[i]) { info.fecha = String(row[i]).split(' ')[0]; break; }
            }
        }
    }
    return info as VehicleInfo;
  };
  
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (tripData && clientData) {
      const updatedFlags = tripData.flags.map(flag => {
        if (flag.type === 'stop') {
          let matchedClient: Client | null = null;
          let minDistance = Infinity;
          for (const client of clientData) {
            const distance = calculateDistance(flag.lat, flag.lng, client.lat, client.lng);
            if (distance < 150 && distance < minDistance) {
              minDistance = distance;
              matchedClient = client;
            }
          }
          return {
            ...flag,
            clientName: matchedClient?.name || "Sin coincidencia",
            clientKey: matchedClient?.key 
          };
        }
        return flag;
      });
      setTripData(prevData => ({ ...prevData!, flags: updatedFlags }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientData]);

  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2) return 0;
    const [hours, minutes] = parts;
    return hours * 60 + minutes;
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) return "Menos de 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours} h ${mins} min`;
  };

  const processTripData = (data: any[]): ProcessedTrip => {
    const findTimeColumn = (row: any): string | null => {
      const timePattern = /^\d{1,2}:\d{2}(:\d{2})?$/;
      for (const key in row) {
        if (typeof row[key] === 'string' && timePattern.test(row[key].trim())) {
          return key;
        }
      }
      return null;
    };
    const timeColumn = data.length > 0 ? findTimeColumn(data[0]) : null;
    if (!timeColumn) {
      throw new Error("No se encontró una columna con datos de tiempo válidos en el archivo.");
    }
    const events: TripEvent[] = data.map((row, index) => ({
      id: index + 1,
      time: row[timeColumn] || '00:00:00',
      description: row['Descripción de Evento:'] || 'Sin descripción',
      speed: Number(row['Velocidad(km)']) || 0,
      lat: Number(row['Latitud']),
      lng: Number(row['Longitud']),
    })).filter(event => event.lat && event.lng);
    if (events.length === 0) {
      throw new Error("El archivo no contiene datos de eventos válidos con coordenadas.");
    }
    const flags: ProcessedTrip['flags'] = [];
    const routes: ProcessedTrip['routes'] = [{ path: [] }];
    let stopCounter = 0;
    const coordCounts = new Map<string, number>();
    const firstStartEvent = events.find(event => event.description.toLowerCase().includes('inicio de viaje'));
    if (!firstStartEvent) {
        throw new Error("No se encontró ningún evento de 'Inicio de Viaje' para comenzar el recorrido.");
    }
    const startIndex = events.findIndex(e => e.id === firstStartEvent.id);
    flags.push({
      lat: firstStartEvent.lat,
      lng: firstStartEvent.lng,
      type: 'start',
      time: firstStartEvent.time,
      description: `Inicio del Recorrido`,
    });
    const lastEndEventIndex = events.map(e => e.description.toLowerCase().includes('fin de viaje')).lastIndexOf(true);
    const lastEndEvent = lastEndEventIndex !== -1 ? events[lastEndEventIndex] : null;
    if (!lastEndEvent) {
        throw new Error("No se encontró ningún evento de 'Fin de Viaje' para finalizar el recorrido.");
    }
    for (let i = startIndex; i < events.length; i++) {
        const currentEvent = events[i];
        if (currentEvent.description.toLowerCase().includes('fin de viaje') && currentEvent.id !== lastEndEvent.id) {
            stopCounter++;
            const coordKey = `${currentEvent.lat.toFixed(5)},${currentEvent.lng.toFixed(5)}`;
            const count = coordCounts.get(coordKey) || 0;
            let displayLat = currentEvent.lat;
            let displayLng = currentEvent.lng;
            if (count > 0) {
                const offsetDistance = 0.004 * Math.sqrt(count);
                const angle = count * 137.5; 
                displayLat += offsetDistance * Math.cos(angle * (Math.PI / 180));
                displayLng += offsetDistance * Math.sin(angle * (Math.PI / 180));
            }
            coordCounts.set(coordKey, count + 1);
            const stopFlag: ProcessedTrip['flags'][0] = {
                lat: displayLat,
                lng: displayLng,
                type: 'stop',
                time: currentEvent.time,
                description: `Parada ${stopCounter}: ${currentEvent.description}`,
                duration: 0,
                stopNumber: stopCounter,
            };
            const nextStartEvent = events.find((event, j) => j > i && event.description.toLowerCase().includes('inicio de viaje'));
            if (nextStartEvent) {
                const stopEndTime = parseTimeToMinutes(currentEvent.time);
                const moveStartTime = parseTimeToMinutes(nextStartEvent.time);
                let duration = moveStartTime - stopEndTime;
                if (duration < 0) { duration += 24 * 60; }
                stopFlag.duration = duration;
            }
            flags.push(stopFlag);
        }
    }
    flags.push({
      lat: lastEndEvent.lat,
      lng: lastEndEvent.lng,
      type: 'end',
      time: lastEndEvent.time,
      description: `Fin del Recorrido`,
    });
    const endIndex = events.findIndex(e => e.id === lastEndEvent.id);
    if(startIndex !== -1 && endIndex !== -1) {
        const relevantEvents = events.slice(startIndex, endIndex + 1);
        routes[0].path = relevantEvents.map(e => ({ lat: e.lat, lng: e.lng }));
    }
    return { events, routes, flags };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTripData(null);
    setVehicleInfo(null);
    setClientData(null);
    setClientFileName(null);
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const vehicleData = parseVehicleInfo(ws);
        setVehicleInfo(vehicleData);
        const expectedHeaders = ['Latitud', 'Longitud', 'Descripción de Evento:'];
        const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        let headerRowIndex = -1;
        for (let i = 0; i < 20 && i < sheetAsArray.length; i++) {
          const row = sheetAsArray[i];
          const matchCount = expectedHeaders.filter(header => row.includes(header)).length;
          if (matchCount >= 2) { headerRowIndex = i; break; }
        }
        if (headerRowIndex === -1) {
            throw new Error("No se pudo encontrar la fila de encabezados en el archivo de viaje.");
        }
        const data = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("No se encontraron datos en el archivo de viaje o el formato es incorrecto.");
        }
        const processed = processTripData(data);
        setTripData(processed);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Ocurrió un error desconocido al procesar el archivo.");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) { fileInputRef.current.value = ''; }
  };

  const handleClientFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setClientFileName(file.name);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const bstr = event.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            
            const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

            let headerRowIndex = -1;
            let isGpsFormat = false;

            for (let i = 0; i < 10 && i < sheetAsArray.length; i++) {
                const row = sheetAsArray[i];
                if (row.includes('CLAVE') && row.includes('RAZON') && row.includes('GPS')) {
                    headerRowIndex = i;
                    isGpsFormat = true;
                    break;
                }
                if (row.includes('CLAVE') && row.includes('Cliente') && row.includes('Latitud') && row.includes('Longitud')) {
                    headerRowIndex = i;
                    isGpsFormat = false;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                setError("No se encontraron encabezados compatibles. Verifique que el archivo contenga las columnas necesarias (ej: 'CLAVE', 'RAZON', 'GPS').");
                return;
            }

            const data: any[] = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex });
            
            let clients: Client[] = [];

            if (isGpsFormat) {
                clients = data.map(row => {
                    let gpsString = String(row['GPS'] || '');
                    if (!gpsString) return null;
                    gpsString = gpsString.replace('&', ',');
                    const coords = gpsString.split(',');
                    if (coords.length !== 2) return null;
                    const lat = Number(coords[0]?.trim());
                    const lng = Number(coords[1]?.trim());
                    if (isNaN(lat) || isNaN(lng)) return null;
                    
                    return {
                        key: String(row['CLAVE'] || 'N/A'),
                        name: toTitleCase(row['RAZON']),
                        lat: lat,
                        lng: lng
                    };
                }).filter((c): c is Client => c !== null);
            } else {
                clients = data.map(row => {
                    const lat = Number(row['Latitud']);
                    const lng = Number(row['Longitud']);
                    if (isNaN(lat) || isNaN(lng)) return null;
                    
                    return {
                        key: String(row['CLAVE'] || 'N/A'),
                        name: toTitleCase(row['Cliente']),
                        lat: lat,
                        lng: lng
                    };
                }).filter((c): c is Client => c !== null);
            }

            if (clients.length === 0) {
               setError("Se encontraron los encabezados, pero no se pudo extraer ningún dato de cliente válido. Verifique los datos debajo de los encabezados.");
               return;
            }
            
            setClientData(clients);

        } catch (err) {
            console.error(err);
            setError("Ocurrió un error crítico al procesar el archivo de clientes.");
        }
    };
    reader.readAsBinaryString(file);
  };
  
  const generateMapHTML = (vehicleInfo: VehicleInfo | null): string => {
    if (!tripData) return '';
    const filteredFlags = tripData.flags.filter(flag => 
      flag.type !== 'stop' || (flag.duration && flag.duration >= minStopDuration)
    );
    const { routes } = tripData;
    const mapCenter = filteredFlags.length > 0 ? 
      `{lat: ${filteredFlags[0].lat}, lng: ${filteredFlags[0].lng}}` : 
      '{lat: 25.0, lng: -100.0}';
    const infoBoxHTML = vehicleInfo ? `
        <div id="info-box">
            <h4>Información del Viaje</h4>
            <p><strong>Descripción:</strong> ${vehicleInfo.descripcion}</p>
            <p><strong>Vehículo:</strong> ${vehicleInfo.vehiculo}</p>
            <p><strong>Placa:</strong> ${vehicleInfo.placa}</p>
            <p><strong>Fecha:</strong> ${vehicleInfo.fecha}</p>
        </div>
    ` : '';
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #map { height: 100%; width: 100%; } body, html { height: 100%; margin: 0; padding: 0; } .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-c { padding: 12px !important; } h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; } h3 span { font-size: 20px; margin-right: 8px; } p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }
            #controls { position: absolute; top: 10px; left: 50%; transform: translateX(-220%); z-index: 10; background: white; padding: 8px; border: 1px solid #ccc; border-radius: 8px; display: flex; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            #controls button { font-family: sans-serif; font-size: 14px; padding: 8px 12px; cursor: pointer; border-radius: 5px; border: 1px solid #aaa; } #controls button:disabled { cursor: not-allowed; background-color: #f0f0f0; color: #aaa; }
            #info-box { position: absolute; top: 10px; right: 10px; transform: translateX(-25%); z-index: 10; background: rgba(255, 255, 255, 0.9); padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-shadow: 0 1px 4px rgba(0,0,0,0.2); font-family: sans-serif; font-size: 12px; width: 220px; }
            #info-box h4 { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; padding-bottom: 4px; border-bottom: 1px solid #ddd; } #info-box p { margin: 3px 0; font-size: 12px; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          ${infoBoxHTML}
          <div id="controls"><button id="playPauseBtn">Reproducir</button><button id="nextStopBtn">Siguiente Parada</button></div>
          <script>
            let map, markers = [], infowindows = [], openInfoWindow = null, stopInfo = [];
            const routePath = ${JSON.stringify(routes[0]?.path || [])}; const allFlags = ${JSON.stringify(filteredFlags)}; const formatDuration = ${formatDuration.toString()};
            let animatedPolyline, currentPathIndex = 0, animationFrameId, isAnimating = false, currentStopIndex = 0;
            function initMap() {
                map = new google.maps.Map(document.getElementById('map'), { center: ${mapCenter}, zoom: 12, mapTypeControl: false, streetViewControl: false });
                const bounds = new google.maps.LatLngBounds();
                allFlags.forEach((flag, index) => {
                    if (!flag) return;
                    const marker = createMarker(flag); const infowindow = createInfoWindow(flag);
                    markers.push(marker); infowindows.push(infowindow);
                    marker.addListener('click', () => { if (openInfoWindow) openInfoWindow.close(); infowindow.open(map, marker); openInfoWindow = infowindow; });
                    if (flag.type === 'stop' || flag.type === 'end') {
                        const flagLatLng = new google.maps.LatLng(flag.lat, flag.lng); let closestPathIndex = -1; let minDistance = Infinity;
                        routePath.forEach((pathPoint, i) => { const pathLatLng = new google.maps.LatLng(pathPoint.lat, pathPoint.lng); const distance = google.maps.geometry.spherical.computeDistanceBetween(flagLatLng, pathLatLng); if (distance < minDistance) { minDistance = distance; closestPathIndex = i; } });
                        stopInfo.push({ markerIndex: index, pathIndex: closestPathIndex, type: flag.type });
                    }
                    bounds.extend(marker.getPosition());
                });
                map.fitBounds(bounds);
                animatedPolyline = new google.maps.Polyline({ path: [], strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 5, map: map });
                document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause); document.getElementById('nextStopBtn').addEventListener('click', animateToNextStop);
            }
            function createMarker(flag) {
                const colors = { start: '#22c55e', stop: '#4F4E4E', end: '#ef4444' };
                const icon = { path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', fillColor: colors[flag.type], fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 24) };
                return new google.maps.Marker({ position: { lat: flag.lat, lng: flag.lng }, map, icon, title: flag.description });
            }
            function createInfoWindow(flag) {
                let content = '';
                switch (flag.type) {
                    case 'start': content = \`<h3><span style="color: #22c55e;">&#127937;</span> Inicio del Recorrido</h3><p><strong>Hora:</strong> \${flag.time}</p>\`; break;
                    case 'end': content = \`<h3><span style="color: #ef4444;">&#127937;</span> Fin del Recorrido</h3><p><strong>Hora:</strong> \${flag.time}</p>\`; break;
                    case 'stop':
                        const clientInfo = flag.clientName && flag.clientName !== 'Sin coincidencia'
                            ? \`<div style="color:#059669;">
                                 <p style="margin: 2px 0; font-weight: 500;"><strong>#</strong> \${flag.clientKey || 'N/A'}</p>
                                 <p style="margin: 2px 0; font-weight: 500;"><strong> \${flag.clientName} </strong></p>
                               </div>\`
                            : \`<p style="color:#FF2800; font-weight: 500;"><strong>Cliente:</strong> Sin coincidencia</p>\`;
                        content = \`<h3><span style="color: #4F4E4E;">&#9209;</span> Parada \${flag.stopNumber}</h3><p><strong>Duración:</strong> \${formatDuration(flag.duration || 0)}</p><p><strong>Hora:</strong> \${flag.time}</p>\${clientInfo}<p>\${flag.description.replace(\`Parada \${flag.stopNumber}: \`, '')}</p>\`;
                        break;
                }
                return new google.maps.InfoWindow({ content });
            }
            function togglePlayPause() {
                const btn = document.getElementById('playPauseBtn'); isAnimating = !isAnimating;
                if (isAnimating) { btn.textContent = 'Pausa'; document.getElementById('nextStopBtn').disabled = true; if (openInfoWindow) openInfoWindow.close(); animate(routePath.length); }
                else { btn.textContent = 'Reproducir'; document.getElementById('nextStopBtn').disabled = false; cancelAnimationFrame(animationFrameId); }
            }
            function animateToNextStop() {
                if (currentStopIndex >= stopInfo.length) return;
                isAnimating = true; if (openInfoWindow) openInfoWindow.close(); document.getElementById('playPauseBtn').disabled = true; document.getElementById('nextStopBtn').disabled = true;
                const nextStop = stopInfo[currentStopIndex];
                animate(nextStop.pathIndex, () => {
                    const marker = markers[nextStop.markerIndex]; const infowindow = infowindows[nextStop.markerIndex];
                    marker.setAnimation(google.maps.Animation.BOUNCE); setTimeout(() => marker.setAnimation(null), 1400);
                    if (openInfoWindow) openInfoWindow.close(); infowindow.open(map, marker); openInfoWindow = infowindow;
                    currentStopIndex++; isAnimating = false; document.getElementById('playPauseBtn').disabled = false;
                    if (currentStopIndex >= stopInfo.length) { document.getElementById('nextStopBtn').disabled = true; } else { document.getElementById('nextStopBtn').disabled = false; }
                });
            }
            function animate(targetPathIndex, onComplete = () => {}) {
                const animationStep = 2;
                function step() {
                    if (!isAnimating || currentPathIndex >= targetPathIndex) {
                        onComplete();
                        if (currentPathIndex >= routePath.length) { isAnimating = false; document.getElementById('playPauseBtn').textContent = 'Reproducir'; document.getElementById('playPauseBtn').disabled = false; document.getElementById('nextStopBtn').disabled = true; }
                        return;
                    }
                    const end = Math.min(currentPathIndex + animationStep, targetPathIndex);
                    const newPathSegment = routePath.slice(currentPathIndex, end);
                    const newFullPath = animatedPolyline.getPath().getArray().concat(newPathSegment);
                    animatedPolyline.setPath(newFullPath); currentPathIndex = end;
                    animationFrameId = requestAnimationFrame(step);
                }
                animationFrameId = requestAnimationFrame(step);
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap&libraries=geometry"></script>
        </body>
      </html>
    `;
  };
  
  const downloadMap = () => {
    const htmlContent = generateMapHTML(vehicleInfo);
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="flex justify-center items-center mb-4"><Car className="w-12 h-12 text-blue-600" /></div>
          <h1 className="text-3xl font-bold text-gray-800">Visualizador de Rutas</h1>
          <p className="text-gray-500 mt-2">Paso 1: Sube el archivo de eventos de vehículo para generar el mapa.</p>
        </div>
        <div>
            <label 
              htmlFor="dropzone-file" 
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const files = e.dataTransfer.files; if (files && files.length > 0) { handleFileUpload({ target: { files } } as any); } }}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-blue-500 motion-safe:animate-bounce" />
                    {fileName ? (<p className="font-semibold text-blue-700">{fileName}</p>) : (<>
                        <p className="mb-2 text-sm text-gray-600"><span className="font-semibold">Haz clic para subir</span> o arrastra y suelta</p>
                        <p className="text-xs text-gray-500">XLSX, XLS o CSV</p>
                    </>)}
                </div>
                <input ref={fileInputRef} id="dropzone-file" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls, .csv" />
            </label>
        </div>
        
        {tripData && (
            <div className="mt-6">
                <p className="text-center text-gray-600 mb-2">Paso 2: Sube el archivo de clientes para identificar las paradas.</p>
                <label htmlFor="clients-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100 transition-colors">
                    <div className="flex flex-col items-center justify-center">
                        <ParkingSquare className="w-8 h-8 mb-2 text-green-500" />
                        {clientFileName ? (<p className="font-semibold text-green-700">{clientFileName}</p>) : (<>
                            <p className="text-sm text-gray-600"><span className="font-semibold">Subir archivo de Clientes</span></p>
                            <p className="text-xs text-gray-500">XLSX, XLS o CSV</p>
                        </>)}
                    </div>
                    <input id="clients-file" type="file" className="hidden" onChange={handleClientFileUpload} accept=".xlsx, .xls, .csv" />
                </label>
            </div>
        )}

        {error && (<div className="text-center p-4 bg-red-100 text-red-700 rounded-lg"><p><strong>Error:</strong> {error}</p></div>)}

        {tripData && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="stop-duration" className="text-sm font-medium text-gray-700">Mostrar paradas mayores a:</label>
              <div className="flex items-center space-x-2">
                <input type="number" id="stop-duration" min="1" max="120" value={minStopDuration} onChange={(e) => setMinStopDuration(Number(e.target.value))} className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                <span className="text-sm text-gray-500">minutos</span>
              </div>
            </div>
            <button onClick={downloadMap} className="flex items-center justify-center w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-transform transform hover:scale-105">
              <Download className="h-5 w-5 mr-2" />Descargar Mapa HTML
            </button>
          </div>
        )}
      </div>

      {tripData && (
          <div className="relative w-full max-w-6xl mt-8">
              <h2 className="text-2xl font-bold text-center mb-4">Vista Previa del Mapa</h2>
              <iframe srcDoc={generateMapHTML(vehicleInfo)} className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-md" title="Vista Previa del Mapa" />
          </div>
      )}
    </div>
  );
}