import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { MapPin, Upload, Download } from 'lucide-react';

interface TripEvent {
  id: number;
  time: string;
  description: string;
  speed: number;
  lat: number;
  lng: number;
  eventType: 'start' | 'end' | 'moving' | 'stopped';
  stopDuration?: number;
}

interface ProcessedTrip {
  events: TripEvent[];
  routes: Array<{
    path: Array<{ lat: number; lng: number }>;
    type: 'moving' | 'stopped';
    startTime: string;
    endTime: string;
    duration?: number;
  }>;
  flags: Array<{
    lat: number;
    lng: number;
    type: 'start' | 'stop';
    time: string;
    duration?: number;
    stopNumber?: number;
  }>;
}

export default function VehicleTracker() {
  const [tripData, setTripData] = useState<ProcessedTrip | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const googleMapsApiKey = 'AIzaSyBb7rJA438WYzdA3js2zJcMYOotPn-FR6s';

  const parseTimeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const calculateTimeDifference = (startTime: string, endTime: string): number => {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    return Math.abs(endMinutes - startMinutes);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processExcelData = (data: any[][]): ProcessedTrip => {
    const events: TripEvent[] = data.map((row, index) => ({
      id: row[0] || index + 1,
      time: row[1]?.toString() || '',
      description: row[2]?.toString() || '',
      speed: parseFloat(row[4]?.toString() || '0') || 0,
      lat: parseFloat(row[5]?.toString() || '0') || 0,
      lng: parseFloat(row[6]?.toString() || '0') || 0,
      eventType: 'moving' as const
    })).filter(event => event.lat !== 0 && event.lng !== 0);

    events.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

    const processedEvents: TripEvent[] = [];
    const routes: ProcessedTrip['routes'] = [];
    const flags: ProcessedTrip['flags'] = [];
    
    let currentRoute: Array<{ lat: number; lng: number }> = [];
    let routeStartTime = '';
    let lastEventType: 'start' | 'end' | null = null;
    let stopCounter = 0;

    // Marcar el primer evento como inicio
    if (events.length > 0) {
      flags.push({
        lat: events[0].lat,
        lng: events[0].lng,
        type: 'start',
        time: events[0].time
      });
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const description = event.description.toLowerCase();
      const isStart = description.includes('inicio') || description.includes('start');
      const isEnd = description.includes('fin') || description.includes('end') || description.includes('stop');

      let eventType: 'start' | 'end' | 'moving' | 'stopped' = 'moving';

      if (isStart && i > 0) { // No marcar el primer punto como start si ya lo hicimos
        eventType = 'start';
        if (currentRoute.length > 0) {
          routes.push({
            path: [...currentRoute],
            type: lastEventType === 'end' ? 'stopped' : 'moving',
            startTime: routeStartTime,
            endTime: events[i - 1]?.time || event.time
          });
        }
        currentRoute = [{ lat: event.lat, lng: event.lng }];
        routeStartTime = event.time;
        lastEventType = 'start';
      } else if (isEnd) {
        eventType = 'end';
        currentRoute.push({ lat: event.lat, lng: event.lng });
        
        if (i < events.length - 1) {
          const nextEvent = events[i + 1];
          const nextIsStart = nextEvent.description.toLowerCase().includes('inicio') || 
                           nextEvent.description.toLowerCase().includes('start');
          
          if (nextIsStart) {
            const stopDuration = calculateTimeDifference(event.time, nextEvent.time);
            stopCounter++;
            flags.push({
              lat: event.lat,
              lng: event.lng,
              type: 'stop',
              time: event.time,
              duration: stopDuration,
              stopNumber: stopCounter
            });
            eventType = 'stopped';
          }
        }
        lastEventType = 'end';
      } else {
        currentRoute.push({ lat: event.lat, lng: event.lng });
      }

      processedEvents.push({
        ...event,
        eventType
      });
    }

    // Marcar el último evento como fin
    if (events.length > 1) {
      flags.push({
        lat: events[events.length - 1].lat,
        lng: events[events.length - 1].lng,
        type: 'stop',
        time: events[events.length - 1].time,
        stopNumber: stopCounter + 1
      });
    }

    if (currentRoute.length > 0) {
      routes.push({
        path: currentRoute,
        type: 'moving',
        startTime: routeStartTime,
        endTime: events[events.length - 1]?.time || ''
      });
    }

    return {
      events: processedEvents,
      routes,
      flags
    };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dataRows = jsonData.slice(1) as any[];
        const processed = processExcelData(dataRows);
        setTripData(processed);
      } catch (error) {
        console.error('Error procesando archivo:', error);
        alert('Error al procesar el archivo Excel. Verifica el formato.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const generateMapHTML = (): string => {
    if (!tripData || tripData.events.length === 0) {
      console.error('No hay datos de viaje para generar el mapa');
      return '';
    }

    const lats = tripData.events.map(e => e.lat);
    const lngs = tripData.events.map(e => e.lng);
    const center = {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length
    };
    
    return `<!DOCTYPE html>
<html>
<head>
    <title>Mapa de Ruta</title>
    <style>
        #map { 
            height: 100vh; 
            width: 100%; 
        }
        .map-info-window {
            padding: 10px;
            min-width: 200px;
        }
        .map-info-window h3 {
            margin-top: 0;
            color: #1a73e8;
        }
        .map-info-window p {
            margin: 5px 0;
        }
        .stop-number {
            background: #fbbc04;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-right: 8px;
            font-weight: bold;
        }
        .error-message {
            padding: 20px;
            text-align: center;
            color: #d32f2f;
            background: #ffebee;
            border: 1px solid #f8bbd9;
            border-radius: 8px;
            margin: 20px;
        }
    </style>
</head>
<body>
    <div id="map"></div>

    <script>
        let map;
        const routes = ${JSON.stringify(tripData.routes)};
        const flags = ${JSON.stringify(tripData.flags)};
        let directionsService;
        let directionsRenderers = [];

        function initMap() {
            try {
                // Verificar si google maps está disponible
                if (typeof google === 'undefined' || !google.maps) {
                    throw new Error('Google Maps API no se ha cargado correctamente');
                }

                map = new google.maps.Map(document.getElementById('map'), {
                    zoom: 13,
                    center: { lat: ${center.lat}, lng: ${center.lng} },
                    mapTypeId: 'roadmap',
                    styles: [
                        {
                            featureType: 'poi',
                            elementType: 'labels',
                            stylers: [{ visibility: 'off' }]
                        }
                    ]
                });

                directionsService = new google.maps.DirectionsService();

                // Dibujar todas las rutas usando Directions API
                routes.forEach((route, index) => {
                    if (route.path.length < 2) return;
                    
                    const waypoints = [];
                    // Usar puntos intermedios para rutas largas
                    if (route.path.length > 10) {
                        const step = Math.floor(route.path.length / 8);
                        for (let i = 1; i < route.path.length - 1; i += step) {
                            waypoints.push({
                                location: new google.maps.LatLng(route.path[i].lat, route.path[i].lng),
                                stopover: false
                            });
                        }
                    }

                    const request = {
                        origin: new google.maps.LatLng(route.path[0].lat, route.path[0].lng),
                        destination: new google.maps.LatLng(route.path[route.path.length - 1].lat, route.path[route.path.length - 1].lng),
                        waypoints: waypoints,
                        travelMode: google.maps.TravelMode.DRIVING,
                        provideRouteAlternatives: false
                    };

                    directionsService.route(request, (result, status) => {
                        if (status === 'OK') {
                            const directionsRenderer = new google.maps.DirectionsRenderer({
                                map: map,
                                directions: result,
                                suppressMarkers: true,
                                preserveViewport: true,
                                polylineOptions: {
                                    strokeColor: route.type === 'moving' ? '#4285F4' : '#EA4335',
                                    strokeOpacity: 0.8,
                                    strokeWeight: 5
                                }
                            });
                            directionsRenderers.push(directionsRenderer);
                        } else {
                            // Fallback a Polyline simple si Directions falla
                            const polyline = new google.maps.Polyline({
                                path: route.path.map(p => new google.maps.LatLng(p.lat, p.lng)),
                                geodesic: true,
                                strokeColor: route.type === 'moving' ? '#4285F4' : '#EA4335',
                                strokeOpacity: 0.8,
                                strokeWeight: 4,
                                map: map
                            });
                        }
                    });
                });

                // Agregar marcadores para las paradas
                flags.forEach((flag, index) => {
                    let icon, title;
                    
                    if (flag.type === 'start') {
                        icon = {
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: '#34A853',
                            fillOpacity: 1,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            scale: 10
                        };
                        title = 'Punto de inicio del viaje';
                    } else if (index === flags.length - 1) {
                        icon = {
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: '#EA4335',
                            fillOpacity: 1,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            scale: 10
                        };
                        title = 'Punto final del viaje';
                    } else {
                        icon = {
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: '#FBBC04',
                            fillOpacity: 1,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            scale: 10
                        };
                        title = \`Parada #\${flag.stopNumber}\`;
                    }

                    const marker = new google.maps.Marker({
                        position: { lat: flag.lat, lng: flag.lng },
                        map: map,
                        title: title,
                        icon: icon,
                        zIndex: 1000
                    });

                    let infoContent;
                    if (flag.type === 'start') {
                        infoContent = \`
                            <div class="map-info-window">
                                <h3>🚦 Punto de Inicio del Viaje</h3>
                                <p><strong>Hora de salida:</strong> \${flag.time}</p>
                                <p><strong>Ubicación:</strong> \${flag.lat.toFixed(6)}, \${flag.lng.toFixed(6)}</p>
                            </div>
                        \`;
                    } else if (index === flags.length - 1) {
                        infoContent = \`
                            <div class="map-info-window">
                                <h3>🏁 Punto Final del Viaje</h3>
                                <p><strong>Hora de llegada:</strong> \${flag.time}</p>
                                <p><strong>Ubicación:</strong> \${flag.lat.toFixed(6)}, \${flag.lng.toFixed(6)}</p>
                            </div>
                        \`;
                    } else {
                        infoContent = \`
                            <div class="map-info-window">
                                <h3><span class="stop-number">\${flag.stopNumber}</span> 🛑 Punto de Parada</h3>
                                <p><strong>Hora de llegada:</strong> \${flag.time}</p>
                                <p><strong>Duración:</strong> \${flag.duration} minutos</p>
                                <p><strong>Ubicación:</strong> \${flag.lat.toFixed(6)}, \${flag.lng.toFixed(6)}</p>
                                <p><strong>Tiempo total en parada:</strong> \${flag.duration} minutos</p>
                            </div>
                        \`;
                    }

                    const infoWindow = new google.maps.InfoWindow({
                        content: infoContent
                    });

                    marker.addListener('click', () => {
                        infoWindow.open(map, marker);
                    });
                });

                // Ajustar el zoom para que se vean todos los puntos
                if (flags.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    flags.forEach(flag => {
                        bounds.extend(new google.maps.LatLng(flag.lat, flag.lng));
                    });
                    map.fitBounds(bounds);
                }

            } catch (error) {
                console.error('Error inicializando mapa:', error);
                document.getElementById('map').innerHTML = 
                    '<div class="error-message">' +
                    '<h3>⚠️ Error cargando Google Maps</h3>' +
                    '<p><strong>Posibles causas:</strong></p>' +
                    '<ul style="text-align: left; max-width: 400px; margin: 0 auto;">' +
                    '<li>API key inválida o no configurada</li>' +
                    '<li>API key sin permisos para Maps JavaScript API</li>' +
                    '<li>Límites de cuota excedidos</li>' +
                    '<li>Dominio no autorizado para esta API key</li>' +
                    '</ul>' +
                    '<p><strong>Soluciones:</strong></p>' +
                    '<ol style="text-align: left; max-width: 400px; margin: 0 auto;">' +
                    '<li>Obtén una API key válida de Google Cloud Console</li>' +
                    '<li>Habilita Maps JavaScript API</li>' +
                    '<li>Configura la facturación si es necesario</li>' +
                    '<li>Agrega tu dominio a las restricciones</li>' +
                    '</ol>' +
                    '<p style="font-size: 12px; color: #666; margin-top: 20px;">Error técnico: ' + error.message + '</p>' +
                    '</div>';
            }
        }

        function handleGoogleMapsError() {
            document.getElementById('map').innerHTML = 
                '<div class="error-message">' +
                '<h3>⚠️ No se pudo cargar Google Maps</h3>' +
                '<p>Por favor verifica tu conexión a internet y la configuración de la API key.</p>' +
                '</div>';
        }

        // Manejo de errores global para Google Maps
        window.gm_authFailure = function() {
            document.getElementById('map').innerHTML = 
                '<div class="error-message">' +
                '<h3>⚠️ Error de autenticación</h3>' +
                '<p>La API key de Google Maps no es válida o ha expirado.</p>' +
                '<p>Por favor configura una API key válida.</p>' +
                '</div>';
        };

        // Inicializar el mapa cuando se carga la API
        window.initMap = initMap;

        // Timeout de seguridad
        setTimeout(() => {
            if (typeof google === 'undefined') {
                handleGoogleMapsError();
            }
        }, 10000);
    </script>
    <script async defer 
            src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap&libraries=geometry,directions"
            onerror="handleGoogleMapsError()">
    </script>
</body>
</html>`;
  };

  const downloadMap = () => {
    if (!tripData) {
      alert('No hay datos para descargar. Por favor sube un archivo Excel primero.');
      return;
    }

    try {
      const htmlContent = generateMapHTML();
      
      if (!htmlContent || htmlContent.length < 100) {
        alert('Error generando el contenido del mapa. Verifica los datos.');
        return;
      }

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `mapa-ruta-${new Date().toISOString().split('T')[0]}.html`;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
    } catch (error) {
      console.error('Error en la descarga:', error);
      alert('Error al descargar el archivo. Verifica la consola para más detalles.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-8">
            <h1 className="text-3xl font-bold text-white flex items-center justify-center">
              <MapPin className="mr-3 h-8 w-8" />
              Rastreador de Vehículo - Generador de Mapas
            </h1>
          </div>

          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Panel de Configuración */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                    <Upload className="mr-2 text-blue-500" />
                    Configuración
                  </h2>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <h3 className="font-medium text-blue-900 mb-2">📋 Formato del Excel</h3>
                    <p className="text-blue-700 text-sm">
                      El archivo debe tener estas columnas:<br/>
                      <code className="bg-white px-1 rounded text-xs">
                      | Hora | Descripción | Nombre Lugar | Velocidad | Latitud | Longitud |
                      </code>
                    </p>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    Seleccionar Archivo Excel
                  </button>
                </div>
              </div>

              {/* Panel de Resultados */}
              <div className="space-y-6">
                {tripData ? (
                  <>
                    <div>
                      <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                        <MapPin className="mr-2 text-green-500" />
                        Datos Procesados
                      </h2>
                      
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{tripData.events.length}</div>
                            <div className="text-sm text-green-700">Eventos totales</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{tripData.routes.length}</div>
                            <div className="text-sm text-green-700">Rutas identificadas</div>
                          </div>
                        </div>
                        <div className="text-center pt-2 border-t border-green-200">
                          <div className="text-xl font-bold text-green-600">
                            {tripData.flags.filter(f => f.type === 'stop').length}
                          </div>
                          <div className="text-sm text-green-700">Puntos de parada</div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={downloadMap}
                      className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Descargar Mapa HTML
                    </button>
                  </>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <MapPin className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">
                      Sin datos aún
                    </h3>
                    <p className="text-gray-500">
                      Sube un archivo Excel para comenzar
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de Eventos */}
            {tripData && (
              <div className="mt-8 bg-gray-50 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  📍 Resumen de Eventos (primeros 10)
                </h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {tripData.events.slice(0, 10).map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          event.eventType === 'start' ? 'bg-green-500' :
                          event.eventType === 'end' ? 'bg-red-500' :
                          event.eventType === 'stopped' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`}></div>
                        <span className="font-medium text-gray-800">{event.time}</span>
                        <span className="text-gray-600 max-w-xs truncate">{event.description}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {event.speed} km/h
                        </span>
                        <span className="text-xs text-gray-400">
                          {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {tripData.events.length > 10 && (
                    <div className="text-center py-3 text-gray-500 bg-white rounded-lg border border-dashed">
                      ... y {tripData.events.length - 10} eventos más
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}