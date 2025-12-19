/* eslint-disable react-hooks/exhaustive-deps */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Download,
  MapPinned,
  XCircle,
  Database,
  RefreshCw,
} from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { useClients } from '../context/ClientContext';
import {
  type Client,
  calculateDistance,
  toTitleCase,
} from '../utils/tripUtils';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
} from '@react-google-maps/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faHouseUser } from '@fortawesome/free-solid-svg-icons';
import { GOOGLE_MAPS_LIBRARIES } from '../utils/mapConfig';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 28.6139, lng: -106.0889 };

const mapOptions = {
  mapTypeControl: false,
  streetViewControl: true,
  gestureHandling: 'greedy' as const,
  fullscreenControl: false,
};

interface RoutesViewState {
  selectedVendor: string | null;
  error: string | null;
}

export default function Routes() {
  const [state, setState] = usePersistentState<RoutesViewState>(
    'routes_view_state_v3',
    {
      selectedVendor: null,
      error: null,
    }
  );

  const { masterClients, loading: isLoading, refreshClients } = useClients();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const { selectedVendor, error } = state;

  useEffect(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [error, setState]);

  const handleCloseToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setIsToastVisible(false);
    setTimeout(() => {
      setState((prevState) => ({ ...prevState, error: null }));
    }, 500);
  };

  const specialClientKeys = ['3689', '6395'];

  const availableVendors = useMemo(() => {
    if (!masterClients) return [];
    return Array.from(new Set(masterClients.map((c) => c.vendor))).sort();
  }, [masterClients]);

  const { regularClients, closestSpecialClient } = useMemo(() => {
    if (!masterClients || !selectedVendor) {
      return {
        regularClients: [],
        closestSpecialClient: null,
      };
    }

    const filteredClients = masterClients.filter(
      (c) => c.vendor === selectedVendor && !c.isVendorHome
    );

    const vendorHome = masterClients.find(
      (c) => c.isVendorHome && c.vendorHomeInitial === selectedVendor
    );

    const allVendorClients = [...filteredClients];
    if (vendorHome) {
      allVendorClients.push(vendorHome);
    }

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

    return {
      regularClients: newRegularClients,
      closestSpecialClient: newClosestSpecialClient,
    };
  }, [masterClients, selectedVendor]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  useEffect(() => {
    if (map && regularClients.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      regularClients.forEach((client) => {
        bounds.extend({ lat: client.lat, lng: client.lng });
      });
      if (closestSpecialClient) {
        bounds.extend({
          lat: closestSpecialClient.lat,
          lng: closestSpecialClient.lng,
        });
      }
      map.fitBounds(bounds);
    }
  }, [map, regularClients, closestSpecialClient]);

  const generateMapHTML = () => {
    let staticMapCenter = '{ lat: 28.6139, lng: -106.0889 }';
    const clientsForCenter = closestSpecialClient
      ? [...regularClients, closestSpecialClient]
      : regularClients;

    if (clientsForCenter.length > 0) {
      const centerLat =
        clientsForCenter.reduce((sum, c) => sum + c.lat, 0) /
        clientsForCenter.length;
      const centerLng =
        clientsForCenter.reduce((sum, c) => sum + c.lng, 0) /
        clientsForCenter.length;
      staticMapCenter = `{ lat: ${centerLat}, lng: ${centerLng} }`;
    }

    const regularClientsJSON = JSON.stringify(regularClients);
    const closestSpecialClientJSON = JSON.stringify(
      closestSpecialClient ? [closestSpecialClient] : []
    );

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Mapa de Ruta - ${selectedVendor}</title>
          <style> 
            #map { height: 100%; } body, html { height: 100%; margin: 0; padding: 0; }
            .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-c { padding: 8px !important; }
            .info-window { font-family: sans-serif; }
          </style>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
        </head>
        <body>
          <div id="map"></div>
          <script>
            function toTitleCase(str) {
              if (!str) return '';
              return str.toLowerCase().split(' ').map(function(word) {
                if (word.length <= 3 && (word === 'de' || word === 'la' || word === 'el' || word === 'y' || word === 'e')) {
                  return word;
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
              }).join(' ');
            }

            function initMap() {
              const map = new google.maps.Map(document.getElementById('map'), {
                center: ${staticMapCenter},
                zoom: 12,
                mapTypeControl: false, 
                streetViewControl: true,
                gestureHandling: 'greedy'
              });
              
              const regularClients = ${regularClientsJSON};
              const closestSpecialClient = ${closestSpecialClientJSON};
              
              const bounds = new google.maps.LatLngBounds();

              const createInfoWindowContent = (client, showVendor = false) => {
                const coordinatesText = \`\${client.lat.toFixed(6)}, \${client.lng.toFixed(6)}\`;
                const googleMapsLink = \`https://www.google.com/maps/search/?api=1&query=\${client.lat},\${client.lng}\`;
                
                const branchInfo = client.branchNumber ?
                  (client.branchName ?
                    \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${toTitleCase(client.branchName)}</p>\` :
                    \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${client.branchNumber}</p>\`)
                  : '';
                
                const vendorInfo = showVendor && client.vendor ?
                  \`<p style="border-top:2px solid #eee; padding-top:4px; margin-top: 8px; font-size: 12px; margin-bottom: 0;">
                    Vendedor: <strong style="font-weight: 700; color: #FF0000; font-size: 12px;"> \${client.vendor} </strong>
                  </p>\` : '';
                
                const titleIcon = client.isVendorHome ? '<i class="fa-solid fa-house-user"></i> Casa Vendedor' : '<i class="fa-solid fa-user"></i> Cliente';

                return \`<div class="info-window" style="padding: 4px; color: black; background: white;">
                  <h3 style="font-size: 15px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
                    \${titleIcon}
                  </h3>

                  <div style="color:#059669;">
                    <p style="margin: 2px 0; font-weight: 500; font-size: 12px;">
                      <strong># \${client.key}</strong>
                    </p>
                    <strong><p style="margin: 2px 0; font-weight: 600; font-size: 12px;">\${toTitleCase(client.name)}</p></strong>
                    \${branchInfo}
                  </div>

                  <p style="color: #374151; font-size: 12px; margin: 4px 0;">\${coordinatesText}</p>
                  <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                    <strong>View on Google Maps</strong>
                  </a>
                  \${vendorInfo}
                </div>\`;
              };

              regularClients.forEach(client => {
                const fillColor = client.isVendorHome ? '#5D00FF' : '#000000'; // Morado si es casa, Negro si es cliente
                
                const marker = new google.maps.Marker({
                  position: { lat: client.lat, lng: client.lng },
                  map: map,
                  title: \`\${client.name}\`,
                  icon: {
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: fillColor,
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 0,
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
              
              closestSpecialClient.forEach(client => {
                const marker = new google.maps.Marker({
                  position: { lat: client.lat, lng: client.lng },
                  map: map,
                  title: \`\${client.name} (SEDE MÁS CERCANA)\`,
                  icon: {
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: '#FF0000',
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 0,
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
      {/* SIDEBAR */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-80'
        } bg-white shadow-lg transition-all duration-300 flex flex-col relative z-20`}
      >
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

        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* INDICADOR DE ESTADO SQL */}
            <div className="bg-green-50 p-2 rounded border border-green-200 mb-4 flex justify-between items-center">
              {masterClients && masterClients.length > 0 ? (
                <div className="flex items-center gap-2 text-green-700">
                  <Database className="w-4 h-4" />
                  <span className="text-xs font-semibold">
                    {masterClients.length} clientes sincronizados (SQL)
                  </span>
                </div>
              ) : (
                <div className="text-xs text-orange-600 flex items-center gap-2">
                  {isLoading ? 'Cargando...' : 'Sin conexión a BD'}
                </div>
              )}
              <button
                onClick={() => refreshClients(true)}
                className="bg-green-100 rounded-full p-1 text-green-700 hover:text-green-900 hover:scale-120 transition-transform"
                title="Recargar clientes"
                disabled={isLoading}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {availableVendors.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  1. Selecciona un vendedor:
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
        <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <h2 className="text-md font-semibold text-gray-800">
            {isLoading
              ? 'Cargando...'
              : selectedVendor
                ? `Mapa de Vendedor: ${selectedVendor}`
                : 'Selecciona un vendedor para ver el mapa'}
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

        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {selectedVendor &&
          (regularClients.length > 0 || closestSpecialClient) ? (
            isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={defaultCenter}
                zoom={12}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={mapOptions}
              >
                {/* 1. Marcadores de Clientes Regulares (AHORA CON LÓGICA DE COLOR) */}
                {regularClients.map((client, index) => (
                  <Marker
                    key={`reg-${index}`}
                    position={{ lat: client.lat, lng: client.lng }}
                    icon={{
                      path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                      fillColor: client.isVendorHome ? '#5D00FF' : '#000000',
                      fillOpacity: 1,
                      strokeColor: 'white',
                      strokeWeight: 0,
                      scale: 1.3,
                      anchor: new google.maps.Point(12, 24),
                    }}
                    onClick={() => setSelectedClient(client)}
                  />
                ))}

                {/* 2. Marcador Sede Especial (Closest) */}
                {closestSpecialClient && (
                  <Marker
                    position={{
                      lat: closestSpecialClient.lat,
                      lng: closestSpecialClient.lng,
                    }}
                    icon={{
                      path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                      fillColor: '#FF0000',
                      fillOpacity: 1,
                      strokeColor: 'white',
                      strokeWeight: 0,
                      scale: 1.3,
                      anchor: new google.maps.Point(12, 24),
                    }}
                    onClick={() => setSelectedClient(closestSpecialClient)}
                  />
                )}

                {/* InfoWindow */}
                {selectedClient && (
                  <InfoWindow
                    position={{
                      lat: selectedClient.lat,
                      lng: selectedClient.lng,
                    }}
                    onCloseClick={() => setSelectedClient(null)}
                    options={{
                      pixelOffset: new window.google.maps.Size(0, -25),
                    }}
                  >
                    <div className="font-sans text-sm pr-4">
                      <h3 className="text-[15px] font-bold mb-2 flex items-center gap-2 text-black">
                        {/* ICONO DINÁMICO */}
                        {selectedClient.isVendorHome ? (
                          <FontAwesomeIcon icon={faHouseUser} />
                        ) : (
                          <FontAwesomeIcon icon={faUser} />
                        )}{' '}
                        {selectedClient.isVendorHome
                          ? 'Casa Vendedor'
                          : 'Cliente'}
                      </h3>

                      {selectedClient.isVendorHome ? (
                        <div className="text-[#5D00FF] mb-2">
                          <p className="font-medium m-0 text-xs">
                            <strong># {selectedClient.key}</strong>
                          </p>
                          <p className="font-bold m-0 text-xs">
                            {toTitleCase(selectedClient.name)}
                          </p>
                          {selectedClient.branchNumber && (
                            <p className="text-[#2563eb] font-bold text-xs m-0">
                              {selectedClient.branchName
                                ? `Suc. ${toTitleCase(selectedClient.branchName)}`
                                : `Suc. ${selectedClient.branchNumber}`}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-[#059669] mb-2">
                          <p className="font-medium m-0 text-xs">
                            <strong># {selectedClient.key}</strong>
                          </p>
                          <p className="font-bold m-0 text-xs">
                            {toTitleCase(selectedClient.name)}
                          </p>
                          {selectedClient.branchNumber && (
                            <p className="text-[#2563eb] font-bold text-xs m-0">
                              {selectedClient.branchName
                                ? `Suc. ${toTitleCase(selectedClient.branchName)}`
                                : `Suc. ${selectedClient.branchNumber}`}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="text-[#374151] font-medium text-xs mt-1">
                        {selectedClient.lat.toFixed(6)},{' '}
                        {selectedClient.lng.toFixed(6)}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=\${selectedClient.lat},${selectedClient.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1a73e8] font-semibold text-xs hover:underline block mb-2"
                      >
                        View on Google Maps
                      </a>
                      {selectedClient.vendor && (
                        <div className="flex pt-1 pb-4 border-t border-gray-200 text-xs text-black mt-2 gap-1">
                          <p className="m-0 font-semibold">Vendedor:</p>
                          <p className="m-0 font-bold text-red-600">
                            {selectedClient.vendor}
                          </p>
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Cargando mapa...
              </div>
            )
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
                    Sincroniza los clientes desde el servidor SQL si no ves
                    datos.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Toast de Error */}
      {error && (
        <div
          className={`fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md z-50 transition-all duration-500 ease-in-out ${
            isToastVisible
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-10'
          }`}
        >
          <XCircle className="w-5 h-5 flex-shrink-0" />
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
