/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from 'react';
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

    // Obtener el nombre de la columna de tiempo del primer registro válido
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
    const coordCounts = new Map<string, number>(); // Para contar paradas en el mismo lugar

    // 1. Encontrar el primer "Inicio de Viaje" para marcar el comienzo de todo el recorrido.
    const firstStartEvent = events.find(event => event.description.toLowerCase().includes('inicio de viaje'));
    if (!firstStartEvent) {
        throw new Error("No se encontró ningún evento de 'Inicio de Viaje' para comenzar el recorrido.");
    }
    
    // Se obtiene el índice del primer inicio para ignorar cualquier evento anterior.
    const startIndex = events.findIndex(e => e.id === firstStartEvent.id);

    flags.push({
      lat: firstStartEvent.lat,
      lng: firstStartEvent.lng,
      type: 'start',
      time: firstStartEvent.time,
      description: `Inicio del Recorrido`,
    });

    // 2. Encontrar el último "Fin de Viaje" para marcar el final de todo el recorrido.
    const lastEndEventIndex = events.map(e => e.description.toLowerCase().includes('fin de viaje')).lastIndexOf(true);
    const lastEndEvent = lastEndEventIndex !== -1 ? events[lastEndEventIndex] : null;

    if (!lastEndEvent) {
        throw new Error("No se encontró ningún evento de 'Fin de Viaje' para finalizar el recorrido.");
    }

    // 3. Procesar todas las paradas, COMENZANDO DESDE el primer "inicio de viaje".
    for (let i = startIndex; i < events.length; i++) {
        const currentEvent = events[i];

        // Una "parada" es cualquier evento de "Fin de Viaje", excepto el último (que será el final del recorrido).
        if (currentEvent.description.toLowerCase().includes('fin de viaje') && currentEvent.id !== lastEndEvent.id) {
            stopCounter++;

            // --- INICIO: Lógica de desplazamiento para iconos superpuestos ---
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
            // --- FIN: Lógica de desplazamiento ---
            
            const stopFlag: ProcessedTrip['flags'][0] = {
                lat: displayLat, // Usar latitud de visualización
                lng: displayLng, // Usar longitud de visualización
                type: 'stop',
                time: currentEvent.time,
                description: `Parada ${stopCounter}: ${currentEvent.description}`,
                duration: 0,
                stopNumber: stopCounter,
            };

            // Buscar el siguiente "Inicio de Viaje" para calcular la duración de la parada.
            const nextStartEvent = events.find((event, j) => j > i && event.description.toLowerCase().includes('inicio de viaje'));

            if (nextStartEvent) {
                const stopEndTime = parseTimeToMinutes(currentEvent.time);
                const moveStartTime = parseTimeToMinutes(nextStartEvent.time);
                let duration = moveStartTime - stopEndTime;

                if (duration < 0) {
                    duration += 24 * 60;
                }
                stopFlag.duration = duration;
            }
            flags.push(stopFlag);
        }
    }

    // 4. Agregar la bandera del fin de viaje definitivo.
    flags.push({
      lat: lastEndEvent.lat,
      lng: lastEndEvent.lng,
      type: 'end',
      time: lastEndEvent.time,
      description: `Fin del Recorrido`,
    });
    
    // 5. Generar la ruta completa para el mapa, desde el primer inicio hasta el último fin.
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
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Inicia la lectura desde la fila 5 (A5), que corresponde al índice 4 en base cero.
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

    // FIX: Limpiar el valor del input para permitir cargar el mismo archivo de nuevo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const generateMapHTML = (): string => {
    if (!tripData) return '';

    // Filtrar las paradas según la duración mínima establecida en la UI
    const filteredFlags = tripData.flags.filter(flag => 
      flag.type !== 'stop' || (flag.duration && flag.duration >= minStopDuration)
    );

    const { routes } = tripData;
    const mapCenter = filteredFlags.length > 0 ? 
      `{lat: ${filteredFlags[0].lat}, lng: ${filteredFlags[0].lng}}` : 
      '{lat: 25.0, lng: -100.0}';

    const flagMarkers = filteredFlags.map(flag => {
      let icon, title, content;

      // Función para generar un ícono de marcador de mapa con un color específico
      const createMarkerIcon = (color: string) => `{
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
        fillColor: '${color}',
        fillOpacity: 1,
        strokeWeight: 0,
        scale: 1.5,
        anchor: new google.maps.Point(12, 24)
      }`;

      switch (flag.type) {
        case 'start':
          icon = createMarkerIcon('#22c55e');
          title = `'Inicio del Recorrido'`;
          content = `'<h3><span style="color: #22c55e;">&#127937;</span> Inicio del Recorrido</h3><p><strong>Hora:</strong> ${flag.time}</p>'`;
          break;
        case 'end':
          icon = createMarkerIcon('#ef4444');
          title = `'Fin del Recorrido'`;
          content = `'<h3><span style="color: #ef4444;">&#127937;</span> Fin del Recorrido</h3><p><strong>Hora:</strong> ${flag.time}</p>'`;
          break;
        case 'stop':
          icon = createMarkerIcon('#f1c40f');
          title = `'Parada ${flag.stopNumber}'`;
          content = `'<h3><span style="color: #f1c40f;">&#9209;</span> Parada ${flag.stopNumber}</h3><p><strong>Duración:</strong> ${formatDuration(flag.duration || 0)}</p><p><strong>Hora:</strong> ${flag.time}</p><p>${flag.description.replace(`Parada ${flag.stopNumber}: `, '')}</p>'`;
          break;
      }
      return `
        (function() {
          if(!${icon}) return;
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
            .gm-style-iw-c { padding: 12px !important; }
            h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; }
            h3 span { font-size: 20px; margin-right: 8px; }
            p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            function initMap() {
              const map = new google.maps.Map(document.getElementById('map'), {
                center: ${mapCenter},
                zoom: 12,
                mapTypeControl: false,
                streetViewControl: false,
              });

              const bounds = new google.maps.LatLngBounds();

              ${flagMarkers}

              const routePath = ${JSON.stringify(routes[0]?.path || [])};
              let animatedPolyline;

              if (routePath.length > 1) {
                  const animationInterval = 50; // ms entre frames
                  const animationStep = 2; // puntos a agregar por frame
                  let currentAnimationStep = 0;
                  
                  animatedPolyline = new google.maps.Polyline({
                    path: [],
                    strokeColor: '#3b82f6',
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                    map: map
                  });

                  function animateRoute() {
                    const end = Math.min(currentAnimationStep + animationStep, routePath.length);
                    const newPath = routePath.slice(0, end);
                    animatedPolyline.setPath(newPath);
                    
                    if (newPath.length > 0) {
                      bounds.extend(new google.maps.LatLng(newPath[newPath.length-1].lat, newPath[newPath.length-1].lng));
                    }
                    
                    currentAnimationStep += animationStep;
                    
                    if (currentAnimationStep < routePath.length) {
                      setTimeout(animateRoute, animationInterval);
                    } else {
                        map.fitBounds(bounds);
                        animatedPolyline.setOptions({
                          icons: [{
                            icon: {
                              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                              strokeColor: '#3b82f6',
                              fillColor: '#3b82f6',
                              fillOpacity: 1,
                              scale: 3
                            },
                            offset: '0',
                            repeat: '100px'
                          }]
                        });
                    }
                  }
                  map.fitBounds(bounds);
                  setTimeout(animateRoute, 1000);
              } else if (bounds.getNorthEast() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
                  map.fitBounds(bounds);
              }
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap"></script>
        </body>
      </html>
    `;
  };
  
  const downloadMap = () => {
    const htmlContent = generateMapHTML();
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
          <div className="flex justify-center items-center mb-4">
              <Car className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Visualizador de Rutas</h1>
          <p className="text-gray-500 mt-2">
            Sube tu archivo de eventos de vehículo (XLSX, XLS, CSV) para generar un mapa interactivo del viaje.
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
                                <span className="font-semibold">Haz clic para subir</span> o arrastra y suelta tu archivo
                            </p>
                            <p className="text-xs text-gray-500">XLSX, XLS o CSV</p>
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
                <p><strong>Error:</strong> {error}</p>
            </div>
        )}

        {tripData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="stop-duration" className="text-sm font-medium text-gray-700">
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
          <div className="w-full max-w-6xl mt-8">
              <h2 className="text-2xl font-bold text-center mb-4">Vista Previa del Mapa</h2>
              <iframe
                  srcDoc={generateMapHTML()}
                  className="w-full h-[600px] border-2 border-gray-300 rounded-lg shadow-md"
                  title="Vista Previa del Mapa"
              />
          </div>
        )}
    </div>
  );
}