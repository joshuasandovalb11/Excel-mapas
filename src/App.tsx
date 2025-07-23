/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Car, Flag, ParkingSquare, MapPinned } from 'lucide-react';

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
  }>;
}

export default function VehicleTracker() {
  const [tripData, setTripData] = useState<ProcessedTrip | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minStopDuration, setMinStopDuration] = useState<number>(5); // Valor predeterminado: 5 minutos
  const fileInputRef = useRef<HTMLInputElement>(null);

  const googleMapsApiKey = 'AIzaSyBb7rJA438WYzdA3js2zJcMYOotPn-FR6s';

  // --- FUNCIONES DE PROCESAMIENTO DE DATOS ---

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
    // Buscar dinámicamente la columna que contiene los datos de tiempo
    const findTimeColumn = (row: any): string | null => {
      const timePattern = /^\d{1,2}:\d{2}(:\d{2})?$/; // Patrón para formato de hora (HH:MM o HH:MM:SS)
      for (const key in row) {
        if (typeof row[key] === 'string' && timePattern.test(row[key].trim())) {
          return key;
        }
      }
      return null;
    };

    const timeColumnKey = data.length > 0 ? findTimeColumn(data[0]) : null;
    if (!timeColumnKey) {
      throw new Error("No se encontró una columna con formato de tiempo (HH:MM:SS) en el archivo.");
    }
    
    // Mapeo de nombres de columna flexibles
    const descriptionKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('descripción')) || 'Descripción de Evento:';
    const speedKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('velocidad')) || 'Velocidad(km)';
    const latKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('latitud')) || 'Latitud';
    const lonKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('longitud')) || 'Longitud';


    let stopCounter = 0;
    const events: TripEvent[] = data.map((row, index) => ({
      id: index + 1,
      time: row[timeColumnKey] || '00:00:00',
      description: row[descriptionKey] || 'Sin descripción',
      speed: Number(row[speedKey]) || 0,
      lat: Number(row[latKey]),
      lng: Number(row[lonKey]),
    })).filter(event => event.lat && event.lng);

    if (events.length === 0) {
      throw new Error("El archivo no contiene datos de eventos válidos con coordenadas.");
    }

    const flags: ProcessedTrip['flags'] = [];
    const routes: ProcessedTrip['routes'] = [{ path: [] }];
    
    // El primer evento siempre es el inicio
    const startEvent = events[0];
    flags.push({
      lat: startEvent.lat,
      lng: startEvent.lng,
      type: 'start',
      time: startEvent.time,
      description: `Inicio del Recorrido: ${startEvent.description}`,
    });

    let stopStartTime: string | null = null;
    
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        routes[0].path.push({ lat: event.lat, lng: event.lng });
        
        const isStopped = event.speed === 0;
        const nextEvent = events[i + 1];

        if (isStopped && !stopStartTime) {
            // Inicia una nueva parada
            stopStartTime = event.time;
        }

        if (!isStopped && stopStartTime) {
            // El vehículo se movió, fin de la parada
            const stopEndTime = event.time;
            const duration = parseTimeToMinutes(stopEndTime) - parseTimeToMinutes(stopStartTime);

            if (duration >= minStopDuration) {
                stopCounter++;
                const stopEvent = events[i - 1]; // El último punto donde estaba detenido
                flags.push({
                    lat: stopEvent.lat,
                    lng: stopEvent.lng,
                    type: 'stop',
                    time: stopStartTime,
                    description: stopEvent.description,
                    duration: duration,
                    stopNumber: stopCounter,
                });
            }
            stopStartTime = null; // Reiniciar para la próxima parada
        }
    }


    // El último evento siempre es el fin
    const endEvent = events[events.length - 1];
    flags.push({
      lat: endEvent.lat,
      lng: endEvent.lng,
      type: 'end',
      time: endEvent.time,
      description: `Fin del Recorrido: ${endEvent.description}`,
    });

    return { events, routes, flags };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTripData(null);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { range: 3, defval: "" });
        
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("No se encontraron datos en el archivo o el formato es incorrecto.");
        }

        const processed = processTripData(data);
        setTripData(processed);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Ocurrió un error desconocido al procesar el archivo.");
      }
    };
    reader.readAsBinaryString(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const generateMapHTML = (): string => {
    if (!tripData) return '';

    const filteredFlags = tripData.flags.filter(flag => 
      flag.type !== 'stop' || (flag.duration && flag.duration >= minStopDuration)
    );

    const { routes } = tripData;
    const mapCenter = filteredFlags.length > 0 ? 
      `{lat: ${filteredFlags[0].lat}, lng: ${filteredFlags[0].lng}}` : 
      '{lat: 25.0, lng: -100.0}';

    const flagMarkers = filteredFlags.map(flag => {
      let icon, title, content;
      // SVG Paths for custom icons
      const flagIconPath = `'M14.4,6L14,4H5V21H7V14H12.6L13,16H20V6H14.4Z'`;
      const parkingIconPath = `'M13 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4h3a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4h-3zm0 2h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3V5z'`;

      switch (flag.type) {
        case 'start':
          icon = `{ path: ${flagIconPath}, fillColor: '#22c55e', fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(5, 21) }`;
          title = `'Inicio del Recorrido'`;
          content = `'<h3><span style="color: #22c55e;">&#127937;</span> Inicio del Recorrido</h3><p><strong>Hora:</strong> ${flag.time}</p><p>${flag.description.replace('Inicio del Recorrido: ', '')}</p>'`;
          break;
        case 'end':
          icon = `{ path: ${flagIconPath}, fillColor: '#ef4444', fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(5, 21) }`;
          title = `'Fin del Recorrido'`;
          content = `'<h3><span style="color: #ef4444;">&#127937;</span> Fin del Recorrido</h3><p><strong>Hora:</strong> ${flag.time}</p><p>${flag.description.replace('Fin del Recorrido: ', '')}</p>'`;
          break;
        case 'stop':
          icon = `{ path: ${parkingIconPath}, fillColor: '#3b82f6', fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 12) }`;
          title = `'Parada ${flag.stopNumber}'`;
          content = `'<h3><span style="color: #3b82f6;">&#127359;</span> Parada ${flag.stopNumber}</h3><p><strong>Duración:</strong> ${formatDuration(flag.duration || 0)}</p><p><strong>Desde:</strong> ${flag.time}</p><p>${flag.description}</p>'`;
          break;
      }
      return `
        (function() {
          const marker = new google.maps.Marker({
            position: {lat: ${flag.lat}, lng: ${flag.lng}},
            map: map,
            icon: ${icon},
            title: ${title}
          });
          const infowindow = new google.maps.InfoWindow({ content: ${content} });
          marker.addListener('click', () => {
            infowindow.open(map, marker);
          });
          bounds.extend(marker.getPosition());
        })();
      `;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #map { height: 100%; width: 100%; }
            body, html { height: 100%; margin: 0; padding: 0; }
            .gm-style-iw-d { overflow: hidden !important; }
            .gm-style-iw-c { padding: 12px !important; border-radius: 8px !important; }
            h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; font-weight: 600; }
            h3 span { font-size: 24px; margin-right: 8px; line-height: 1; }
            p { margin: 4px 0; font-family: sans-serif; font-size: 14px; color: #333; }
            p strong { color: #000; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            function initMap() {
              const map = new google.maps.Map(document.getElementById('map'), {
                zoom: 12,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
              });

              const bounds = new google.maps.LatLngBounds();
              
              ${flagMarkers}

              const routePath = ${JSON.stringify(routes[0]?.path || [])};
              if (routePath.length > 0) {
                  const animatedPolyline = new google.maps.Polyline({
                    path: [],
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                    map: map
                  });

                  // Animar la ruta
                  let step = 0;
                  const animationInterval = setInterval(() => {
                      if (step >= routePath.length) {
                          clearInterval(animationInterval);
                          // Añadir flechas después de la animación para mejor rendimiento
                          animatedPolyline.setOptions({
                              icons: [{
                                  icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#4f46e5' },
                                  offset: '0',
                                  repeat: '100px'
                              }]
                          });
                          return;
                      }
                      const currentPath = animatedPolyline.getPath();
                      currentPath.push(new google.maps.LatLng(routePath[step].lat, routePath[step].lng));
                      step++;
                  }, 10); // Intervalo de animación
              }
              
              map.fitBounds(bounds);
              // Añadir un pequeño padding al hacer zoom para que los marcadores no queden en el borde
              google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
                  if (this.getZoom() > 16) {
                      this.setZoom(16);
                  }
              });
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap"></script>
        </body>
      </html>
    `;
  };
  
  const downloadMap = () => {
    if (!tripData) return;
    const htmlContent = generateMapHTML();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa_recorrido_${fileName?.replace(/\.xlsx?$/, '') || 'reporte'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl shadow-blue-100 p-8 space-y-6">
        <div className="text-center">
          <div className="flex justify-center items-center mb-4">
              <MapPinned className="w-16 h-16 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Visualizador de Recorridos</h1>
          <p className="text-gray-500 mt-2">
            Sube tu archivo de eventos (XLSX o CSV) para generar un mapa interactivo del recorrido.
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
                    <Upload className="w-10 h-10 mb-3 text-blue-500" />
                    {fileName ? (
                        <p className="font-semibold text-blue-700">{fileName}</p>
                    ) : (
                        <>
                            <p className="mb-2 text-sm text-gray-600">
                                <span className="font-semibold">Haz clic para subir</span> o arrastra tu archivo
                            </p>
                            <p className="text-xs text-gray-500">Formatos soportados: XLSX, XLS, CSV</p>
                        </>
                    )}
                </div>
                <input 
                    ref={fileInputRef}
                    id="dropzone-file" 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileUpload}
                    accept=".xlsx, .xls, .csv"
                />
            </label>
        </div>
        
        {error && (
            <div className="text-center p-4 bg-red-100 text-red-700 rounded-lg">
                <p><strong>Error al procesar:</strong> {error}</p>
            </div>
        )}

        {tripData && (
          <div className="space-y-5 pt-4">
            <div className="relative flex items-center justify-between">
              <label htmlFor="stop-duration" className="text-sm font-medium text-gray-700">
                Filtrar paradas de más de:
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

            <button
              onClick={downloadMap}
              className="flex items-center justify-center w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-transform transform hover:scale-105 shadow-lg shadow-green-200"
            >
              <Download className="h-5 w-5 mr-2" />
              Descargar Mapa Interactivo (HTML)
            </button>
          </div>
        )}
      </div>

      {tripData && (
          <div className="w-full max-w-6xl mt-8">
              <h2 className="text-2xl font-bold text-center mb-4 text-gray-700">Vista Previa del Mapa</h2>
              <div className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden">
                <iframe
                    srcDoc={generateMapHTML()}
                    className="w-full h-full border-0"
                    title="Vista Previa del Mapa"
                />
              </div>
          </div>
        )}
    </div>
  );
}