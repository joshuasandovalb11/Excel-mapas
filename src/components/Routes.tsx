/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx-js-style';
import { Download, Users, MapPinned } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  processMasterClientFile,
  type Client,
  calculateDistance,
} from '../utils/tripUtils';
import { useMemo, useState, useRef, useEffect } from 'react';

interface RoutesViewState {
  allClients: Client[] | null;
  availableVendors: string[];
  selectedVendor: string | null;
  clientFileName: string | null;
  error: string | null;
  isLoading: boolean;
}

export default function Routes() {
  const [state, setState] = usePersistentState<RoutesViewState>(
    'routes_view_state',
    {
      allClients: null,
      availableVendors: [],
      selectedVendor: null,
      clientFileName: null,
      error: null,
      isLoading: false,
    }
  );

  // Nuevo estado para la barra lateral
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const {
    allClients,
    availableVendors,
    selectedVendor,
    clientFileName,
    error,
    isLoading,
  } = state;

  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    if (error) {
      setIsToastVisible(true);

      toastTimerRef.current = window.setTimeout(() => {
        setIsToastVisible(false);

        setTimeout(() => {
          setState((prevState) => ({ ...prevState, error: null }));
        }, 500);
      }, 5000);
    } else {
      setIsToastVisible(false);
    }
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [error, setState]);

  // Función para cerrar el toast manualmente
  const handleCloseToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setIsToastVisible(false);
    setTimeout(() => {
      setState((prevState) => ({ ...prevState, error: null }));
    }, 500);
  };

  const specialClientKeys = ['3689', '6395'];

  const { regularClients, closestSpecialClient, mapCenter } = useMemo(() => {
    if (!allClients || !selectedVendor) {
      return {
        regularClients: [],
        closestSpecialClient: null,
        mapCenter: '{ lat: 28.6139, lng: -106.0889 }',
      };
    }

    const allVendorClients = allClients.filter(
      (c) => c.vendor === selectedVendor
    );

    const newRegularClients = allVendorClients.filter(
      (c) => !specialClientKeys.includes(c.key)
    );
    const allSpecialClients = allVendorClients.filter((c) =>
      specialClientKeys.includes(c.key)
    );

    let newClosestSpecialClient: Client | null = null;

    if (allSpecialClients.length > 0) {
      if (newRegularClients.length > 0) {
        const avgLat =
          newRegularClients.reduce((sum, c) => sum + c.lat, 0) /
          newRegularClients.length;
        const avgLng =
          newRegularClients.reduce((sum, c) => sum + c.lng, 0) /
          newRegularClients.length;
        const centroid = { lat: avgLat, lng: avgLng };

        let closestDist = Infinity;

        allSpecialClients.forEach((client) => {
          const dist = calculateDistance(
            centroid.lat,
            centroid.lng,
            client.lat,
            client.lng
          );

          if (dist < closestDist) {
            closestDist = dist;
            newClosestSpecialClient = client;
          }
        });
      } else {
        newClosestSpecialClient = allSpecialClients[0];
      }
    }

    const clientsForCentering = newClosestSpecialClient
      ? [...newRegularClients, newClosestSpecialClient]
      : newRegularClients;

    let newMapCenter = '{ lat: 28.6139, lng: -106.0889 }';
    if (clientsForCentering.length > 0) {
      const centerLat =
        clientsForCentering.reduce((sum, c) => sum + c.lat, 0) /
        clientsForCentering.length;
      const centerLng =
        clientsForCentering.reduce((sum, c) => sum + c.lng, 0) /
        clientsForCentering.length;
      newMapCenter = `{ lat: ${centerLat}, lng: ${centerLng} }`;
    }

    return {
      regularClients: newRegularClients,
      closestSpecialClient: newClosestSpecialClient,
      mapCenter: newMapCenter,
    };
  }, [allClients, selectedVendor, specialClientKeys]);

  // Funcion para manejar la carga del archivo de clientes
  const handleClientFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({
      ...state,
      isLoading: true,
      error: null,
      clientFileName: file.name,
      allClients: null,
      availableVendors: [],
      selectedVendor: null,
    });

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
        setState((prevState) => ({
          ...prevState,
          allClients: clients,
          availableVendors: vendors,
          isLoading: false,
        }));
      } catch (err: any) {
        setState((prevState) => ({
          ...prevState,
          error: `Error al procesar archivo de clientes: ${err.message}`,
          isLoading: false,
        }));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Generar el HTML del mapa con los marcadores
  const generateMapHTML = () => {
    const regularClientsJSON = JSON.stringify(regularClients);
    const closestSpecialClientJSON = JSON.stringify(
      closestSpecialClient ? [closestSpecialClient] : []
    );

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style> #map { height: 100%; } body, html { height: 100%; margin: 0; padding: 0; } </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            function initMap() {
              const map = new google.maps.Map(document.getElementById('map'), {
                center: ${mapCenter},
                zoom: 12,
                mapTypeControl: false, 
                streetViewControl: true,
                gestureHandling: 'greedy'
              });
              
              const regularClients = ${regularClientsJSON};
              const closestSpecialClient = ${closestSpecialClientJSON};
              
              const bounds = new google.maps.LatLngBounds();

              const createInfoWindowContent = (client, showVendor = false) => {
                const branchInfo = client.branchNumber ?
                  (client.branchName ?
                    \`<br>Sucursal: <strong>\${client.branchName}</strong>\` :
                    \`<br>Suc. \${client.branchNumber}\`)
                  : '';
                
                return \`<div><strong>#\${client.key}</strong><br><strong>\${client.name}</strong></br>\${branchInfo}</div>\`;
              };

              // 1. Bucle para clientes regulares (casas negras)
              regularClients.forEach(client => {
                const marker = new google.maps.Marker({
                  position: { lat: client.lat, lng: client.lng },
                  map: map,
                  title: \`\${client.name}\`,
                  icon: {
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: '#000000',
                    fillOpacity: 1,
                    strokeColor: 0,
                    strokeWeight: 1,
                    scale: 1.3,
                    anchor: new google.maps.Point(12, 24)
                  }
                });
                const infowindow = new google.maps.InfoWindow({
                    content: createInfoWindowContent(client, true)
                });
                marker.addListener('click', () => {
                    infowindow.open(map, marker);
                });
                bounds.extend(marker.getPosition());
              });
              
              // 2. Bucle para cliente especial CERCANO (casa roja)
              closestSpecialClient.forEach(client => {
                const marker = new google.maps.Marker({
                  position: { lat: client.lat, lng: client.lng },
                  map: map,
                  title: \`\${client.name} (SEDE MÁS CERCANA)\`,
                  icon: {
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: '#FF0000', // Color Rojo
                    fillOpacity: 1,
                    strokeColor: 0,
                    strokeWeight: 1,
                    scale: 1.3,
                    anchor: new google.maps.Point(12, 24)
                  }
                });
                const infowindow = new google.maps.InfoWindow({
                    content: createInfoWindowContent(client, false)
                });
                marker.addListener('click', () => {
                    infowindow.open(map, marker);
                });
                bounds.extend(marker.getPosition());
              });

              // 3. Se eliminó el bucle para 'otherSpecialClients'
              
              if (regularClients.length > 0 || closestSpecialClient.length > 0) {
                map.fitBounds(bounds);
              }
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${
            import.meta.env.VITE_Maps_API_KEY
          }&callback=initMap"></script>
        </body>
      </html>
    `;
  };

  // Función para descargar el mapa como archivo HTML
  const downloadMap = () => {
    const htmlContent = generateMapHTML();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa_${selectedVendor || 'vendedor'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* SIDEBAR IZQUIERDO (NUEVO) */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-80'
        } bg-white shadow-lg transition-all duration-300 flex flex-col relative z-20`}
      >
        {/* Header del Sidebar */}
        <div className="pt-4 pl-4 pr-4 pb-2 border-b border-gray-200 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <MapPinned className="w-7 h-7 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-800">Mapas</h1>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            <svg
              className={`w-5 h-5 transition-transform ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Contenido del Sidebar */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Controles movidos aquí */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Cargar Archivo de Clientes
              </label>
              <label
                htmlFor="client-file-routes"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100"
              >
                <Users className="w-8 h-8 mb-2 text-green-500 animate-bounce" />
                <span className="text-xs font-semibold text-green-700 text-center px-2">
                  {clientFileName || 'Seleccionar archivo...'}
                </span>
                <input
                  id="client-file-routes"
                  type="file"
                  className="hidden"
                  onChange={handleClientFileChange}
                  accept=".xlsx, .xls"
                />
              </label>
            </div>
            {availableVendors.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  2. Selecciona un vendedor:
                </label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {availableVendors.map((vendor) => (
                    <button
                      key={vendor}
                      onClick={() =>
                        setState({
                          ...state,
                          selectedVendor: vendor,
                        })
                      }
                      className={`
                          px-4 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out
                          ${
                            state.selectedVendor === vendor
                              ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105'
                              : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-green-100 hover:border-green-400'
                          }
                        `}
                    >
                      {vendor}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Iconos cuando está colapsado */}
        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-3 py-20 bg-green-100 text-green-600 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
              title="Configuración"
            >
              <MapPinned className="w-6 h-6 animate-bounce" />
            </button>
          </div>
        )}
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header del Mapa */}
        <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <h2 className="text-md font-semibold text-gray-800">
            {isLoading
              ? 'Cargando...'
              : selectedVendor
                ? `Mapa de Vendedor: ${selectedVendor}`
                : 'Carga un archivo y selecciona un vendedor'}
          </h2>

          {availableVendors.length > 0 && (
            <div>
              <button
                onClick={downloadMap}
                disabled={
                  !selectedVendor ||
                  (regularClients.length === 0 && !closestSpecialClient)
                }
                className="flex items-center justify-center px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Download className="h-5 w-5 mr-2" />
                Descargar Mapa
              </button>
            </div>
          )}
        </div>

        {/* Contenedor del Mapa */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {selectedVendor &&
          (regularClients.length > 0 || closestSpecialClient) ? (
            <iframe
              srcDoc={generateMapHTML()}
              className="w-full h-full border-0"
              title="Vista Previa de Rutas"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <MapPinned className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {isLoading
                    ? 'Cargando clientes...'
                    : 'Selecciona un vendedor para ver el mapa.'}
                </p>
                {!isLoading && (
                  <p className="text-gray-400 text-sm mt-2">
                    Carga un archivo desde el panel lateral
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Error Toast */}
      {error && (
        <div
          className={`
            fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg 
            flex items-center gap-3 max-w-md z-50
            transition-all duration-500 ease-in-out
            ${
              isToastVisible
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-10'
            }
          `}
        >
          <p className="text-sm">{error}</p>
          <button
            onClick={handleCloseToast}
            className="ml-auto hover:bg-red-600 p-1 rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
