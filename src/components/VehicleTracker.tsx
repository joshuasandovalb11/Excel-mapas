/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Car, Users, UserCheck } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

// Importa la lógica y tipos compartidos desde el nuevo archivo de utilidades
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
  // Estados existentes
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
    150
  );
  const [error, setError] = useState<string | null>(null);
  const [matchedStopsCount, setMatchedStopsCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ESTADOS PARA MANEJAR VENDEDORES
  const [allClientsFromFile, setAllClientsFromFile] = usePersistentState<
    Client[] | null
  >('vt_allClients', null);
  const [availableVendors, setAvailableVendors] = usePersistentState<string[]>(
    'vt_vendors',
    []
  );
  const [selectedVendor, setSelectedVendor] = usePersistentState<string | null>(
    'vt_selectedVendor',
    null
  );

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY;

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
    setClientData(null);
    setClientFileName(null);
    setAllClientsFromFile(null);
    setAvailableVendors([]);
    setSelectedVendor(null);
    setError(null);
    setFileName(file.name);

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
    setSelectedVendor(null);

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

  // FUNCIÓN PARA MANEJAR LA SELECCIÓN DE VENDEDOR
  const handleVendorSelect = (vendor: string) => {
    setSelectedVendor(vendor);
    if (allClientsFromFile) {
      const filteredClients = allClientsFromFile.filter(
        (client) => client.vendor === vendor
      );
      setClientData(filteredClients);
    }
  };

  const generateMapHTML = (
    vehicleInfo: VehicleInfo | null,
    clientData: Client[] | null,
    totalMatchedStops: number
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

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #map { height: 100%; width: 100%; } body, html { height: 100%; margin: 0; padding: 0; } .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-c { padding: 12px !important; } h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; } h3 span { font-size: 20px; margin-right: 8px; } p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }
            #controls { position: absolute; top: 10px; left: 50%; transform: translateX(-220%); z-index: 10; background: white; padding: 8px; border: 1px solid #ccc; border-radius: 8px; display: flex; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            #controls button { font-family: sans-serif; font-size: 14px; padding: 8px 12px; cursor: pointer; border-radius: 5px; border: 1px solid #aaa; } #controls button:disabled { cursor: not-allowed; background-color: #f0f0f0; color: #aaa; }
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

          <div id="controls"><button id="playPauseBtn">Reproducir</button><button id="nextStopBtn">Siguiente Parada</button></div>
          
          <script>
            let map, markers = [], infowindows = [], openInfoWindow = null, stopInfo = [];
            const routePath = ${JSON.stringify(routes[0]?.path || [])};
            const allFlags = ${JSON.stringify(filteredFlags)};
            const allClients = ${JSON.stringify(clientData || [])};
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
                map = new google.maps.Map(document.getElementById('map'), { center: ${mapCenter}, zoom: 12, mapTypeControl: false, streetViewControl: false });
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
                    if (openInfoWindow) openInfoWindow.close();
                    animateSmoothly(routePath.length - 1, () => {
                        updateDistanceCard(0, totalTripDistanceMeters);
                    });
                } else {
                    btn.textContent = 'Reproducir';
                    if (currentStopIndex < stopInfo.length - 1) {
                       document.getElementById('nextStopBtn').disabled = false;
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

  const downloadMap = () => {
    const htmlContent = generateMapHTML(
      vehicleInfo,
      clientData,
      matchedStopsCount
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

        {/* SECCIÓN PARA SELECCIONAR VENDEDOR */}
        {availableVendors.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 items-center gap-2">
              <UserCheck className="w-5 h-5 text-gray-500" />
              Paso 3: Selecciona un vendedor
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {availableVendors.map((vendor) => (
                <button
                  key={vendor}
                  onClick={() => handleVendorSelect(vendor)}
                  className={`
                            px-4 py-1.5 text-sm font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out
                            ${
                              selectedVendor === vendor
                                ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105' // Estilo activo
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-green-100 hover:border-green-400' // Estilo inactivo
                            }
                          `}
                >
                  {vendor}
                </button>
              ))}
            </div>
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
          <div className="space-y-4 pt-4">
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
            <button
              onClick={downloadMap}
              className="flex items-center justify-center w-full px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-transform transform hover:scale-105"
            >
              <Download className="h-5 w-5 mr-2" />
              Descargar Mapa HTML
            </button>
          </div>
        )}
      </div>

      {tripData && (
        <div className="relative w-full max-w-6xl mt-8">
          <h2 className="text-2xl font-bold text-center mb-4">
            Vista Previa del Mapa
          </h2>
          <iframe
            srcDoc={generateMapHTML(vehicleInfo, clientData, matchedStopsCount)}
            className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-md"
            title="Vista Previa del Mapa"
          />
        </div>
      )}
    </div>
  );
}
