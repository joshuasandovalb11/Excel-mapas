import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useClients } from '../../context/ClientContext';
import { type Client, calculateDistance, toTitleCase } from '../../utils/tripUtils';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faHouseUser } from '@fortawesome/free-solid-svg-icons';
import { GOOGLE_MAPS_LIBRARIES } from '../../utils/mapConfig';
import VendorSelector from '../../components/VendorSelector';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import { useVendorsCatalog } from '../../hooks/useVendorsCatalog';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 28.6139, lng: -106.0889 };
const mapOptions = {
  mapTypeControl: false,
  streetViewControl: true,
  gestureHandling: 'greedy' as const,
  fullscreenControl: false,
};

const specialClientKeys = ['3689', '6395'];

export default function Routes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedVendor = searchParams.get('vendedor') || '';

  const { masterClients, loading: isLoading, error, refreshClients } = useClients();
  const { data: vendors = [], isLoading: isLoadingVendors } = useVendorsCatalog();

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isVendorSelectorOpen, setIsVendorSelectorOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isVendorSelectorOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsVendorSelectorOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVendorSelectorOpen]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });



  const { regularClients, closestSpecialClient } = useMemo(() => {
    if (!masterClients || !selectedVendor) {
      return { regularClients: [], closestSpecialClient: null };
    }

    const filteredClients = masterClients.filter(
      (c) => c.vendor === selectedVendor && !c.isVendorHome
    );

    const vendorHome = masterClients.find(
      (c) => c.isVendorHome && c.vendorHomeInitial === selectedVendor
    );

    const allVendorClients = [...filteredClients];
    if (vendorHome) allVendorClients.push(vendorHome);

    const newRegularClients = allVendorClients.filter(
      (c) => !specialClientKeys.includes(c.key)
    );
    const allSpecialClients = allVendorClients.filter((c) =>
      specialClientKeys.includes(c.key)
    );

    let newClosestSpecialClient: Client | null = null;

    if (allSpecialClients.length > 0) {
      if (newRegularClients.length > 0) {
        const avgLat = newRegularClients.reduce((sum, c) => sum + c.lat, 0) / newRegularClients.length;
        const avgLng = newRegularClients.reduce((sum, c) => sum + c.lng, 0) / newRegularClients.length;

        let closestDist = Infinity;
        allSpecialClients.forEach((client) => {
          const dist = calculateDistance(avgLat, avgLng, client.lat, client.lng);
          if (dist < closestDist) {
            closestDist = dist;
            newClosestSpecialClient = client;
          }
        });
      } else {
        newClosestSpecialClient = allSpecialClients[0];
      }
    }

    return { regularClients: newRegularClients, closestSpecialClient: newClosestSpecialClient };
  }, [masterClients, selectedVendor]);

  const onLoad = useCallback((map: google.maps.Map) => setMap(map), []);
  const onUnmount = useCallback(() => setMap(null), []);

  useEffect(() => {
    if (map && (regularClients.length > 0 || closestSpecialClient)) {
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

  if (error) {
    return (
      <div className="h-screen w-full flex bg-gray-50 p-6">
        <ErrorState error={{ message: error, title: 'Error de Catálogo', action: 'Intenta recargar la página', code: 'DB_ERROR' }} onRetry={() => refreshClients(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* HEADER */}
      <header className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
            <Users className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
          </div>
          <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
            Mapa de Clientes
          </h1>

          <span className="text-gray-300">|</span>

          {/* Seccion de seleccion de vendedores */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsVendorSelectorOpen(!isVendorSelectorOpen)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-[12px] 2xl:text-[13px] font-medium text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedVendor ? `Vendedor: ${selectedVendor}` : 'Seleccionar Vendedor...'}
            </button>
            {isVendorSelectorOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2">
                <VendorSelector
                  vendors={vendors}
                  selectedVendor={selectedVendor}
                  onChange={(val) => {
                    setSearchParams({ vendedor: val });
                    setIsVendorSelectorOpen(false);
                  }}
                  isLoading={isLoadingVendors}
                />
              </div>
            )}
          </div>
        </div>

        {/* <div>
          <button
            onClick={downloadMap}
            disabled={!selectedVendor || (regularClients.length === 0 && !closestSpecialClient)}
            className="flex items-center justify-center px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar Mapa
          </button>
        </div> */}
      </header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 overflow-hidden relative">
        {!selectedVendor ? (
          <div className="h-full flex items-center justify-center p-6">
            <EmptyState
              title="Selecciona un Vendedor"
              message="Utiliza el selector en la cabecera para cargar el mapa de clientes de un vendedor."
              icon="Users"
            />
          </div>
        ) : isLoading && (!masterClients || masterClients.length === 0) ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : regularClients.length === 0 && !closestSpecialClient ? (
          <div className="h-full flex items-center justify-center p-6">
            <EmptyState
              title="Sin Clientes"
              message={`El vendedor ${selectedVendor} no tiene clientes asignados en el catálogo.`}
              icon="Users"
            />
          </div>
        ) : (
          isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={defaultCenter}
              zoom={12}
              onLoad={onLoad}
              onUnmount={onUnmount}
              options={mapOptions}
            >
              {regularClients.map((client, index) => (
                <Marker
                  key={`reg-${index}`}
                  position={{ lat: client.lat, lng: client.lng }}
                  icon={{
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: client.isVendorHome ? '#EF4444' : '#2563EB',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 0,
                    scale: 1.3,
                    anchor: new window.google.maps.Point(12, 24),
                  }}
                  onClick={() => setSelectedClient(client)}
                />
              ))}

              {closestSpecialClient && (
                <Marker
                  position={{
                    lat: closestSpecialClient.lat,
                    lng: closestSpecialClient.lng,
                  }}
                  icon={{
                    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                    fillColor: '#9333EA',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 0,
                    scale: 1.3,
                    anchor: new window.google.maps.Point(12, 24),
                  }}
                  onClick={() => setSelectedClient(closestSpecialClient)}
                />
              )}

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
                  <div className="font-sans text-sm pr-4 p-1">
                    <h3 className="text-[14px] font-bold mb-2 flex items-center gap-2 text-gray-800">
                      {selectedClient.isVendorHome ? (
                        <FontAwesomeIcon icon={faHouseUser} className="text-red-500" />
                      ) : (
                        <FontAwesomeIcon icon={faUser} className="text-blue-500" />
                      )}{' '}
                      {selectedClient.isVendorHome ? 'Casa Vendedor' : 'Cliente'}
                    </h3>

                    <div className="mb-2">
                      <p className="font-medium m-0 text-xs text-gray-500">
                        <strong># {selectedClient.key}</strong>
                      </p>
                      <p className="font-bold m-0 text-[13px] text-gray-900">
                        {toTitleCase(selectedClient.name)}
                      </p>
                      {selectedClient.branchNumber && (
                        <p className="text-blue-600 font-semibold text-xs m-0">
                          {selectedClient.branchName
                            ? `Suc. ${toTitleCase(selectedClient.branchName)}`
                            : `Suc. ${selectedClient.branchNumber}`}
                        </p>
                      )}
                    </div>

                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedClient.lat},${selectedClient.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-medium text-[11px] hover:underline block mb-2"
                    >
                      Ver en Google Maps
                    </a>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
              Cargando mapa...
            </div>
          )
        )}
      </main>
    </div>
  );
}
