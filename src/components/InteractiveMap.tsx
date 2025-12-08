import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polyline,
  InfoWindow,
} from '@react-google-maps/api';
import {
  type Client,
  type ProcessedTrip,
  type VehicleInfo,
} from '../utils/tripUtils';
import { calculateDistance, useCopyToClipboard } from '../utils/tripUtils';
import {
  ChevronUp,
  ChevronDown,
  Info,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFlag,
  faHome,
  faRoad,
  faTriangleExclamation,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import { GOOGLE_MAPS_LIBRARIES } from '../utils/mapConfig';

interface InteractiveMapProps {
  tripData: ProcessedTrip;
  vehicleInfo: VehicleInfo | null;
  clientData: Client[] | null;
  minStopDuration: number;
  selection: string | null;
  viewMode: 'current' | 'new';
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
    totalTimeWithNonClientsAfterHours: number;
    distanceWithinHours: number;
    distanceAfterHours: number;
    timeAtHome: number;
    percentageAtHome: number;
    timeAtTools: number;
    percentageAtTools: number;
    uniqueClientsVisited: number;
  };
  googleMapsApiKey: string;
}

const containerStyle = {
  width: '100%',
  height: '100%',
};

const mapOptions = {
  mapTypeControl: false,
  streetViewControl: true,
  gestureHandling: 'greedy' as const,
  fullscreenControl: false,
};

const WORK_START_MINUTES = 8 * 60 + 30;
const WORK_END_MINUTES = 19 * 60;
const NAVIGATION_COOLDOWN = 100;

interface StopInfo {
  markerIndex: number;
  pathIndex: number;
  type: string;
}

// Función auxiliar para formatear duración
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins} min`;
};

// Función auxiliar para verificar horario laboral
const isWorkingHours = (
  time: string,
  tripDate: string | undefined
): boolean => {
  if (!time || !tripDate) return true;

  const dateObj = new Date(tripDate + 'T12:00:00');
  const day = dateObj.getDay();

  if (day === 0 || day === 6) {
    return false;
  }

  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  return totalMinutes >= WORK_START_MINUTES && totalMinutes < WORK_END_MINUTES;
};

// Componente de tarjeta de información
interface InfoCardProps {
  title: string;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}

const InfoCard: React.FC<InfoCardProps> = ({
  title,
  children,
  collapsed,
  onToggle,
}) => {
  return (
    <div className="bg-white/95 rounded-md" style={{ width: '260px' }}>
      <div className="flex justify-between items-center px-3 py-1.5">
        <h4 className="text-sm font-bold text-[#00004F] m-0">{title}</h4>
        <button
          onClick={onToggle}
          className="hidden lg:flex p-1 text-[#00004F] hover:text-blue-600 transition-colors"
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export default function InteractiveMap({
  tripData,
  vehicleInfo,
  clientData,
  minStopDuration,
  selection,
  viewMode,
  summaryStats,
  googleMapsApiKey,
}: InteractiveMapProps) {
  const [copiedText, copyToClipboard] = useCopyToClipboard();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedMarkers, setSelectedMarkers] = useState<Set<number>>(
    new Set()
  );

  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [animatedPath, setAnimatedPath] = useState<google.maps.LatLngLiteral[]>(
    []
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const [visitedClients, setVisitedClients] = useState<Set<string>>(new Set());
  const [, setCumulativeDistance] = useState(0);
  const [, setSegmentDistance] = useState(0);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isInfoCardCollapsed, setIsInfoCardCollapsed] = useState(false);
  const [isSummaryCardCollapsed, setIsSummaryCardCollapsed] = useState(false);
  const [isStreetViewVisible, setIsStreetViewVisible] = useState(false);
  const lastNavigationTime = useRef(0);

  const animationFrameRef = useRef<number | null>(null);
  const currentPathIndexRef = useRef(0);
  const segmentDistancesRef = useRef<number[]>([]);

  // Función auxiliar para alternar (toggle) un marcador manualmente
  const toggleMarkerSelection = (index: number) => {
    setSelectedMarkers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const filteredFlags = React.useMemo(() => {
    return tripData.flags.filter(
      (flag) =>
        flag.type !== 'stop' ||
        (flag.duration && flag.duration >= minStopDuration)
    );
  }, [tripData.flags, minStopDuration]);

  // Nuevo useMemo para estabilizar el centro inicial del mapa
  const initialCenter = React.useMemo(() => {
    if (filteredFlags.length > 0) {
      return { lat: filteredFlags[0].lat, lng: filteredFlags[0].lng };
    }
    return { lat: 25.0, lng: -100.0 };
  }, [filteredFlags]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const routePath = tripData.routes[0]?.path || [];

  // Filtrar clientes para mostrar (lógica de Tools de Mexico)
  const clientsToRender = React.useMemo(() => {
    if (selection === 'chofer' || !clientData) return clientData || [];

    const specialClientKeys = ['3689', '6395'];
    const regularClients = clientData.filter(
      (c) => !specialClientKeys.includes(c.key) && !c.isVendorHome
    );
    const specialClients = clientData.filter((c) =>
      specialClientKeys.includes(c.key)
    );
    const vendorHome = clientData.find((c) => c.isVendorHome);

    let closestSpecialClient: Client | null = null;

    if (specialClients.length > 0 && regularClients.length > 0) {
      const avgLat =
        regularClients.reduce((sum, c) => sum + c.lat, 0) /
        regularClients.length;
      const avgLng =
        regularClients.reduce((sum, c) => sum + c.lng, 0) /
        regularClients.length;

      let closestDist = Infinity;
      specialClients.forEach((client) => {
        const dist = calculateDistance(avgLat, avgLng, client.lat, client.lng);
        if (dist < closestDist) {
          closestDist = dist;
          closestSpecialClient = client;
        }
      });
    } else if (specialClients.length > 0) {
      closestSpecialClient = specialClients[0];
    }

    const result = [...regularClients];
    if (closestSpecialClient) result.push(closestSpecialClient);
    if (vendorHome) result.push(vendorHome);

    return result;
  }, [clientData, selection]);

  // Calcular información de paradas para navegación
  const stopInfo = React.useMemo(() => {
    const stops: StopInfo[] = [];

    filteredFlags.forEach((flag, index) => {
      if (
        flag.type === 'start' ||
        flag.type === 'stop' ||
        flag.type === 'end'
      ) {
        let closestPathIndex = 0;
        let minDistance = Infinity;

        routePath.forEach((pathPoint, i) => {
          const distance = calculateDistance(
            flag.lat,
            flag.lng,
            pathPoint.lat,
            pathPoint.lng
          );
          if (distance < minDistance) {
            minDistance = distance;
            closestPathIndex = i;
          }
        });

        stops.push({
          markerIndex: index,
          pathIndex: closestPathIndex,
          type: flag.type,
        });
      }
    });

    return stops;
  }, [filteredFlags, routePath]);

  // Calcular distancias de segmentos cuando el mapa se carga
  useEffect(() => {
    if (isLoaded && window.google && stopInfo.length > 1) {
      const segments: number[] = [];
      let lastPathIndex = 0;

      for (let i = 1; i < stopInfo.length; i++) {
        const stop = stopInfo[i];
        const segmentPath = routePath
          .slice(lastPathIndex, stop.pathIndex + 1)
          .map((p) => new google.maps.LatLng(p.lat, p.lng));
        const segmentLength =
          google.maps.geometry.spherical.computeLength(segmentPath);
        segments.push(segmentLength);
        lastPathIndex = stop.pathIndex;
      }

      segmentDistancesRef.current = segments;
    }
  }, [isLoaded, stopInfo, routePath]);

  // Este efecto se encarga de encuadrar el mapa SOLO cuando cambian los datos importantes
  useEffect(() => {
    if (map && filteredFlags.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();

      filteredFlags.forEach((flag) => {
        bounds.extend({ lat: flag.lat, lng: flag.lng });
      });

      clientsToRender.forEach((client) => {
        bounds.extend({ lat: client.lat, lng: client.lng });
      });

      map.fitBounds(bounds);
    }
  }, [map, filteredFlags, clientsToRender]);

  // Efecto para detectar cambios en Street View
  useEffect(() => {
    if (map) {
      const panorama = map.getStreetView();
      if (panorama) {
        const listener = panorama.addListener('visible_changed', () => {
          const isVisible = panorama.getVisible();
          setIsStreetViewVisible(isVisible);
        });

        return () => {
          google.maps.event.removeListener(listener);
        };
      }
    }
  }, [map]);

  // Callback cuando el mapa se carga
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    setSelectedMarkers(new Set([0]));
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Función para obtener el ícono del marcador de parada
  const getMarkerIcon = (flag: (typeof filteredFlags)[0]) => {
    const colors: Record<string, string> = {
      start: '#22c55e',
      stop: '#4F4E4E',
      end: '#ef4444',
    };

    return {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
      fillColor: colors[flag.type] || '#4F4E4E',
      fillOpacity: 1,
      strokeWeight: 0,
      scale: 1.5,
      anchor: new google.maps.Point(12, 24),
    };
  };

  // Función para obtener el ícono del cliente
  const getClientIcon = (client: Client) => {
    const specialBlueIds = ['3689', '6395'];
    const isSpecial = specialBlueIds.includes(String(client.key));

    let markerColor = '#A12323';
    if (client.isVendorHome) {
      markerColor = '#5D00FF';
    } else if (isSpecial) {
      markerColor = '#005EFF';
    }

    return {
      path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
      fillColor: markerColor,
      fillOpacity: 1,
      strokeWeight: 0,
      scale: 1.3,
      anchor: new google.maps.Point(12, 24),
    };
  };

  // Animación de la ruta
  const animateToStop = useCallback(
    (targetStopIndex: number, onComplete?: () => void) => {
      if (isAnimating || targetStopIndex >= stopInfo.length) return;

      setIsAnimating(true);
      const targetStop = stopInfo[targetStopIndex];
      const targetPathIndex = targetStop.pathIndex;
      const animationStep =
        tripData.processingMethod === 'speed-based' ? 35 : 1;

      const animate = () => {
        const end = Math.min(
          currentPathIndexRef.current + animationStep,
          targetPathIndex
        );

        if (end > currentPathIndexRef.current) {
          const newSegment = routePath.slice(
            currentPathIndexRef.current,
            end + 1
          );
          setAnimatedPath((prev) => [
            ...prev,
            ...newSegment.map((p) => ({ lat: p.lat, lng: p.lng })),
          ]);
        }

        currentPathIndexRef.current = end;

        if (currentPathIndexRef.current >= targetPathIndex) {
          setIsAnimating(false);
          setCurrentStopIndex(targetStopIndex);

          const segmentMeters =
            segmentDistancesRef.current[targetStopIndex - 1] || 0;
          setCumulativeDistance((prev) => prev + segmentMeters);
          setSegmentDistance(segmentMeters);

          const flag = filteredFlags[targetStop.markerIndex];
          const specialNonClientKeys = ['3689', '6395'];

          if (
            flag.type === 'stop' &&
            flag.clientKey &&
            !flag.isVendorHome &&
            !specialNonClientKeys.includes(flag.clientKey)
          ) {
            setVisitedClients((prev) => new Set(prev).add(flag.clientKey!));
          }

          setSelectedMarkers(new Set([targetStop.markerIndex]));

          if (map) {
            map.panTo({ lat: flag.lat, lng: flag.lng });
          }

          if (onComplete) onComplete();
          return;
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [
      isAnimating,
      stopInfo,
      routePath,
      filteredFlags,
      tripData.processingMethod,
      map,
    ]
  );

  // Controles de navegación
  const handleReset = () => {
    if (Date.now() - lastNavigationTime.current < NAVIGATION_COOLDOWN) return;
    lastNavigationTime.current = Date.now();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setAnimatedPath([]);
    setCurrentStopIndex(0);
    currentPathIndexRef.current = 0;
    setIsAnimating(false);
    setVisitedClients(new Set());
    setCumulativeDistance(0);
    setSegmentDistance(0);
    setSelectedMarkers(new Set([0]));

    if (map && filteredFlags.length > 0) {
      map.setCenter({ lat: filteredFlags[0].lat, lng: filteredFlags[0].lng });
      map.setZoom(14);
    }
  };

  const handleNextStop = () => {
    if (
      currentStopIndex >= stopInfo.length - 1 ||
      isAnimating ||
      Date.now() - lastNavigationTime.current < NAVIGATION_COOLDOWN
    ) {
      return;
    }
    lastNavigationTime.current = Date.now();

    animateToStop(currentStopIndex + 1);
  };

  const handlePrevStop = () => {
    if (
      currentStopIndex <= 0 ||
      Date.now() - lastNavigationTime.current < NAVIGATION_COOLDOWN
    ) {
      return;
    }
    lastNavigationTime.current = Date.now();

    const prevStopIndex = currentStopIndex - 1;
    const prevStop = stopInfo[prevStopIndex];

    const newPath = routePath
      .slice(0, prevStop.pathIndex + 1)
      .map((p) => ({ lat: p.lat, lng: p.lng }));

    setAnimatedPath(newPath);
    currentPathIndexRef.current = prevStop.pathIndex;
    setCurrentStopIndex(prevStopIndex);
    setSelectedMarkers(new Set([prevStop.markerIndex]));

    const flag = filteredFlags[prevStop.markerIndex];
    if (map) {
      map.panTo({ lat: flag.lat, lng: flag.lng });
    }

    const segmentToUndo = segmentDistancesRef.current[prevStopIndex] || 0;
    setCumulativeDistance((prev) => prev - segmentToUndo);
    setSegmentDistance(
      prevStopIndex > 0
        ? segmentDistancesRef.current[prevStopIndex - 1] || 0
        : 0
    );

    const newVisited = new Set<string>();
    const specialNonClientKeys = ['3689', '6395'];

    for (let i = 0; i <= prevStopIndex; i++) {
      const flag = filteredFlags[stopInfo[i].markerIndex];
      if (
        flag.type === 'stop' &&
        flag.clientKey &&
        !flag.isVendorHome &&
        !specialNonClientKeys.includes(flag.clientKey)
      ) {
        newVisited.add(flag.clientKey);
      }
    }
    setVisitedClients(newVisited);
  };

  // Renderizado de InfoWindow para paradas
  const renderStopInfoWindow = (
    flag: (typeof filteredFlags)[0],
    index: number
  ) => {
    if (!selectedMarkers.has(index)) return null;

    const inWorkingHours =
      flag.type === 'stop'
        ? isWorkingHours(flag.time, vehicleInfo?.fecha)
        : true;
    const bgColor = inWorkingHours ? 'white' : 'white';
    const textColor = inWorkingHours ? 'black' : '#FF0000';
    const titleColor = inWorkingHours ? '#000' : '#C40000';
    const squareColor = inWorkingHours ? '#4F4E4E' : '#C40000';
    const clientMatchColor = inWorkingHours ? '#059669' : '#10b981';
    const clientNoMatchColor = inWorkingHours ? '#FC2121' : '#C40000';
    const branchColor = inWorkingHours ? '#2563eb' : '#60a5fa';

    let content: React.ReactNode = null;
    const coords = `${flag.lat.toFixed(6)}, ${flag.lng.toFixed(6)}`;

    if (flag.type === 'start') {
      content = (
        <div
          style={{
            backgroundColor: bgColor,
            color: textColor,
            paddingBottom: '4px',
            paddingRight: '10px',
          }}
        >
          <h3
            style={{
              color: titleColor,
              fontSize: '15px',
              fontWeight: 500,
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{ color: '#22c55e', marginRight: '8px', fontSize: '15px' }}
            >
              <FontAwesomeIcon icon={faRoad} />
            </span>
            {flag.description}
          </h3>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
            <strong>Hora:</strong> {flag.time}
          </p>
          <div
            onClick={() => copyToClipboard(coords)}
            className="coords-hover"
            style={{
              margin: '0 0 4px 0',
              fontSize: '12px',
              fontWeight: 400,
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Haga clic para copiar coordenadas"
          >
            {copiedText === true ? (
              <span
                style={{
                  fontWeight: 'bold',
                  color: '#059669',
                }}
              >
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <>
                <span>{coords}</span>
              </>
            )}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${flag.lat},${flag.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline"
            style={{
              color: '#1a73e8',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              margin: 0,
            }}
          >
            <strong>View on Google Maps</strong>
          </a>
        </div>
      );
    } else if (flag.type === 'end') {
      content = (
        <div
          style={{
            backgroundColor: bgColor,
            color: textColor,
            paddingBottom: '4px',
            paddingRight: '10px',
          }}
        >
          <h3
            style={{
              color: titleColor,
              fontSize: '15px',
              fontWeight: 500,
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{ color: '#ef4444', marginRight: '8px', fontSize: '15px' }}
            >
              <FontAwesomeIcon icon={faRoad} />
            </span>
            {flag.description}
          </h3>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
            <strong>Hora:</strong> {flag.time}
          </p>
          <div
            onClick={() => copyToClipboard(coords)}
            className="coords-hover"
            style={{
              margin: '0 0 4px 0',
              fontSize: '12px',
              fontWeight: 400,
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Haga clic para copiar coordenadas"
          >
            {copiedText === true ? (
              <span
                style={{
                  fontWeight: 'bold',
                  color: '#059669',
                }}
              >
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <>
                <span>{coords}</span>
              </>
            )}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${flag.lat},${flag.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline"
            style={{
              color: '#1a73e8',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              margin: 0,
            }}
          >
            <strong>View on Google Maps</strong>
          </a>
        </div>
      );
    } else if (flag.type === 'stop') {
      let clientInfo: React.ReactNode = null;

      if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
        const branchInfo = flag.clientBranchNumber
          ? flag.clientBranchName
            ? `Suc. ${flag.clientBranchName}`
            : `Suc. ${flag.clientBranchNumber}`
          : null;

        clientInfo = (
          <div
            style={{
              color: clientMatchColor,
              margin: '0 0 4px 0',
              fontWeight: 600,
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              <strong>#{flag.clientKey}</strong>
            </p>
            <p
              style={{ margin: '2px 0 0 0', fontWeight: 600, fontSize: '12px' }}
            >
              <strong>{flag.clientName}</strong>
            </p>
            {branchInfo && (
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontWeight: 600,
                  fontSize: '12px',
                  color: branchColor,
                }}
              >
                <strong>{branchInfo}</strong>
              </p>
            )}
          </div>
        );
      } else {
        clientInfo = (
          <p
            style={{
              color: clientNoMatchColor,
              fontWeight: 500,
              fontSize: '12px',
              margin: '0 0 4px 0',
            }}
          >
            <strong>Cliente:</strong> Sin coincidencia
          </p>
        );
      }

      const stopIcon = !inWorkingHours ? (
        <FontAwesomeIcon icon={faTriangleExclamation} />
      ) : (
        <FontAwesomeIcon icon={faFlag} />
      );

      content = (
        <div
          style={{
            backgroundColor: bgColor,
            color: textColor,
            paddingBottom: '4px',
            paddingRight: '10px',
          }}
        >
          <h3
            style={{
              color: titleColor,
              fontSize: '15px',
              fontWeight: 500,
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                color: squareColor,
                marginRight: '8px',
                fontSize: '15px',
              }}
            >
              {stopIcon}
            </span>
            Parada {flag.stopNumber}
          </h3>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
            <strong>Duración:</strong> {formatDuration(flag.duration || 0)}
          </p>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
            <strong>Hora:</strong> {flag.time}
          </p>
          {clientInfo}
          <div
            onClick={() => copyToClipboard(coords)}
            className="coords-hover"
            style={{
              margin: '0 0 4px 0',
              fontSize: '12px',
              fontWeight: 400,
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Haga clic para copiar coordenadas"
          >
            {copiedText === true ? (
              <span
                style={{
                  fontWeight: 'bold',
                  color: '#059669',
                }}
              >
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <>
                <span>{coords}</span>
              </>
            )}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${flag.lat},${flag.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline"
            style={{
              color: '#1a73e8',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              margin: 0,
            }}
          >
            <strong>View on Google Maps</strong>
          </a>
        </div>
      );
    }

    return (
      <InfoWindow
        position={{ lat: flag.lat, lng: flag.lng }}
        onCloseClick={() => toggleMarkerSelection(index)}
        options={{
          pixelOffset: new google.maps.Size(0, -40),
          disableAutoPan: false,
        }}
      >
        <div style={{ maxWidth: '280px', overflow: 'hidden' }}>{content}</div>
      </InfoWindow>
    );
  };

  // Renderizado de InfoWindow para clientes
  const renderClientInfoWindow = (client: Client, clientIndex: number) => {
    const markerKey = -clientIndex - 1;
    if (!selectedMarkers.has(markerKey)) return null;

    const isHome = client.isVendorHome;
    const titleText = isHome ? 'Casa Vendedor' : 'Cliente';
    const nameColor = isHome ? '#5D00FF' : '#059669';

    const branchInfo = client.branchNumber
      ? client.branchName
        ? `Suc. ${client.branchName}`
        : `Suc. ${client.branchNumber}`
      : '';

    const coords = `${client.lat.toFixed(6)}, ${client.lng.toFixed(6)}`;

    return (
      <InfoWindow
        position={{ lat: client.lat, lng: client.lng }}
        onCloseClick={() => toggleMarkerSelection(markerKey)}
        options={{
          pixelOffset: new google.maps.Size(0, -40),
          disableAutoPan: false,
        }}
      >
        <div
          style={{
            paddingBottom: '4px',
            paddingRight: '10px',
            overflow: 'hidden',
          }}
        >
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 500,
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{ marginRight: '8px', fontSize: '15px', color: nameColor }}
            >
              {isHome ? (
                <FontAwesomeIcon icon={faUserTie} />
              ) : (
                <FontAwesomeIcon icon={faHome} />
              )}
            </span>
            {titleText}
          </h3>
          <p
            style={{
              margin: 0,
              color: nameColor,
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <strong>#{client.key}</strong>
          </p>
          <p
            style={{
              margin: '2px 0 0 0',
              color: nameColor,
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <strong>{client.displayName}</strong>
          </p>
          {branchInfo && (
            <p
              style={{
                margin: '2px 0 0 0',
                fontWeight: 600,
                color: '#2563eb',
                fontSize: '12px',
              }}
            >
              {branchInfo}
            </p>
          )}
          <div
            onClick={() => copyToClipboard(coords)}
            className="coords-hover"
            style={{
              margin: '4px 0 4px 0',
              fontSize: '12px',
              fontWeight: 400,
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Haga clic para copiar coordenadas"
          >
            {copiedText === true ? (
              <span
                style={{
                  fontWeight: 'bold',
                  color: '#059669',
                }}
              >
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <>
                <span>{coords}</span>
              </>
            )}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${client.lat},${client.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline"
            style={{
              color: '#1a73e8',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              margin: 0,
            }}
          >
            <strong>View on Google Maps</strong>
          </a>
        </div>
      </InfoWindow>
    );
  };

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        Error cargando el mapa
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        Cargando mapa...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <style>{`
        .coords-hover {
          transition: color 0.2s ease, background-color 0.2s ease;
        }
        .coords-hover:hover {
          color: #000000 !important;
        }
      `}</style>

      {/* Mapa de Google */}
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={initialCenter}
        zoom={12}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        {/* Polyline animada */}
        <Polyline
          path={animatedPath}
          options={{
            strokeColor: '#3b82f6',
            strokeOpacity: 0.8,
            strokeWeight: 5,
          }}
        />

        {/* Marcadores de paradas */}
        {filteredFlags.map((flag, index) => (
          <React.Fragment key={`flag-${index}`}>
            <Marker
              position={{ lat: flag.lat, lng: flag.lng }}
              icon={getMarkerIcon(flag)}
              onClick={() => toggleMarkerSelection(index)}
            />
            {renderStopInfoWindow(flag, index)}
          </React.Fragment>
        ))}

        {/* Marcadores de clientes */}
        {clientsToRender.map((client, index) => (
          <React.Fragment key={`client-${index}`}>
            <Marker
              position={{ lat: client.lat, lng: client.lng }}
              icon={getClientIcon(client)}
              onClick={() => toggleMarkerSelection(-index - 1)}
            />
            {renderClientInfoWindow(client, index)}
          </React.Fragment>
        ))}
      </GoogleMap>

      {/* Solo mostrar controles si NO estamos en Street View */}
      {!isStreetViewVisible && (
        <>
          {/* Botón de información para móviles */}
          <button
            onClick={() => setIsInfoModalOpen(true)}
            className="min-[1350px]:hidden absolute top-2.5 left-2.5 z-[15] bg-white border-2 border-blue-600 rounded-full w-10 h-10 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Info size={24} className="text-blue-600" />
          </button>

          {/* Modal de información para móviles */}
          {isInfoModalOpen && (
            <div
              className="min-[1350px]:hidden absolute inset-0 z-50 flex items-center justify-center p-5"
              style={{
                backdropFilter: 'blur(8px)',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
              }}
              onClick={() => setIsInfoModalOpen(false)}
            >
              <div
                className="bg-white rounded-xl max-h-[85vh] w-full max-w-md shadow-lg p-4 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold">Información</h3>
                  <button
                    onClick={() => setIsInfoModalOpen(false)}
                    className="text-gray-600 hover:text-black"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1">
                  {/* Info Card */}
                  {vehicleInfo && (
                    <div className="mb-3 bg-white border border-gray-300 rounded-lg p-3">
                      <h4 className="text-sm font-bold text-[#00004F] mb-2">
                        Información del Vehículo
                      </h4>
                      <div className="grid grid-cols-[1.5fr_1.6fr] gap-1 text-[10px]">
                        <p>
                          <strong>Descripción:</strong>
                        </p>
                        <p className="text-left">{vehicleInfo.descripcion}</p>
                        <p>
                          <strong>Vehículo:</strong>
                        </p>
                        <p className="text-left">{vehicleInfo.vehiculo}</p>
                        <p>
                          <strong>Placa:</strong>
                        </p>
                        <p className="text-left">{vehicleInfo.placa}</p>
                        <p>
                          <strong>Fecha:</strong>
                        </p>
                        <p className="text-left">{vehicleInfo.fecha}</p>
                      </div>
                    </div>
                  )}

                  {/* Summary Card */}
                  <div className="bg-white border border-gray-300 rounded-lg p-3">
                    <h4 className="text-sm font-bold text-[#00004F] mb-2">
                      Resumen del día
                    </h4>
                    <div className="grid grid-cols-[1.7fr_1.3fr_0.5fr] gap-1 text-[9px]">
                      <p className="col-span-3 text-[11px] font-bold text-blue-700 bg-blue-50 py-1 rounded">
                        Dentro de horario (8:30 - 19:00)
                      </p>
                      <p>
                        <strong>Inicio de labores:</strong>
                      </p>
                      <p className="text-left col-span-2">
                        <strong>{tripData.workStartTime || 'N/A'}</strong>
                      </p>
                      <p>
                        <strong>Clientes Visitados:</strong>
                      </p>
                      <p className="text-left col-span-2">
                        {visitedClients.size} /{' '}
                        {summaryStats.uniqueClientsVisited}
                      </p>
                      <p className="col-span-3">
                        <strong>Tiempo con:</strong>
                      </p>
                      <p className="pl-3">• Clientes:</p>
                      <p className="text-left">
                        {formatDuration(summaryStats.timeWithClients)}
                      </p>
                      <p className="text-left">
                        <strong>
                          {summaryStats.percentageClients.toFixed(1)}%
                        </strong>
                      </p>
                      <p className="pl-3 text-red-600">• No Clientes:</p>
                      <p className="text-left text-red-600">
                        {formatDuration(summaryStats.timeWithNonClients)}
                      </p>
                      <p className="text-left text-red-600">
                        <strong>
                          {summaryStats.percentageNonClients.toFixed(1)}%
                        </strong>
                      </p>
                      <p className="pl-3 text-red-600">• En su casa:</p>
                      <p className="text-left text-red-600">
                        {formatDuration(summaryStats.timeAtHome)}
                      </p>
                      <p className="text-left text-red-600">
                        <strong>
                          {summaryStats.percentageAtHome.toFixed(1)}%
                        </strong>
                      </p>
                      <p className="pl-3 text-red-600">• Tools de Mexico:</p>
                      <p className="text-left text-red-600">
                        {formatDuration(summaryStats.timeAtTools)}
                      </p>
                      <p className="text-left text-red-600">
                        <strong>
                          {summaryStats.percentageAtTools.toFixed(1)}%
                        </strong>
                      </p>
                      <p className="pl-3">• En Traslados:</p>
                      <p className="text-left">
                        {formatDuration(summaryStats.travelTime)}
                      </p>
                      <p className="text-left">
                        <strong>
                          {summaryStats.percentageTravel.toFixed(1)}%
                        </strong>
                      </p>
                      <p>
                        <strong>Distancia total:</strong>
                      </p>
                      <p className="text-left col-span-2">
                        <strong>
                          {(summaryStats.distanceWithinHours / 1000).toFixed(2)}{' '}
                          km
                        </strong>
                      </p>
                      <p>
                        <strong>Fin de labores:</strong>
                      </p>
                      <p className="text-left col-span-2">
                        <strong>
                          {viewMode === 'new' && tripData.isTripOngoing
                            ? 'En movimiento...'
                            : tripData.workEndTime || 'N/A'}
                        </strong>
                      </p>
                      <p className="col-span-3 text-[11px] font-bold text-blue-700 bg-blue-50 py-1 rounded mt-2">
                        Fuera de horario
                      </p>
                      <p className="col-span-3 text-[#00004F]">
                        <strong>Tiempo con:</strong>
                      </p>
                      <p className="pl-3 text-[#00004F]">• Clientes:</p>
                      <p className="text-left text-[#00004F] col-span-2">
                        {formatDuration(summaryStats.timeWithClientsAfterHours)}
                      </p>
                      <p className="pl-3 text-red-600">• No Clientes:</p>
                      <p className="text-left text-red-600 col-span-2">
                        {formatDuration(
                          summaryStats.totalTimeWithNonClientsAfterHours
                        )}
                      </p>
                      <p className="pl-3 text-[#00004F]">• En Traslados:</p>
                      <p className="text-left text-[#00004F] col-span-2">
                        {formatDuration(summaryStats.travelTimeAfterHours)}
                      </p>
                      <p className="text-[#00004F]">
                        <strong>Distancia recorrida:</strong>
                      </p>
                      <p className="text-left text-[#00004F] col-span-2">
                        <strong>
                          {(summaryStats.distanceAfterHours / 1000).toFixed(2)}{' '}
                          km
                        </strong>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contenedor de información para desktop */}
          <div className="hidden min-[1350px]:flex absolute top-2.5 right-2.5 z-10 flex-col gap-1.5">
            {/* Info Card */}
            {vehicleInfo && (
              <InfoCard
                title="Información del Vehículo"
                collapsed={isInfoCardCollapsed}
                onToggle={() => setIsInfoCardCollapsed(!isInfoCardCollapsed)}
              >
                <div className="grid grid-cols-[1.5fr_1.4fr] gap-1 text-[12px] text-[#00004F] px-3 pb-2">
                  <p>
                    <strong>Descripción:</strong>
                  </p>
                  <p className="text-left">{vehicleInfo.descripcion}</p>
                  <p>
                    <strong>Vehículo:</strong>
                  </p>
                  <p className="text-left">{vehicleInfo.vehiculo}</p>
                  <p>
                    <strong>Placa:</strong>
                  </p>
                  <p className="text-left">{vehicleInfo.placa}</p>
                  <p>
                    <strong>Fecha:</strong>
                  </p>
                  <p className="text-left">{vehicleInfo.fecha}</p>
                </div>
              </InfoCard>
            )}

            {/* Summary Card */}
            <InfoCard
              title="Resumen del día"
              collapsed={isSummaryCardCollapsed}
              onToggle={() =>
                setIsSummaryCardCollapsed(!isSummaryCardCollapsed)
              }
            >
              <div className="grid grid-cols-[1.5fr_0.9fr_0.2fr] gap-1 text-[12px] text-[#00004F] px-3 pb-2">
                <p className="col-span-3 text-[13px] font-bold text-blue-700 bg-blue-50 py-0.5 rounded">
                  Dentro de horario (8:30 - 19:00)
                </p>
                <p>
                  <strong>Inicio de labores:</strong>
                </p>
                <p className="text-left col-span-2">
                  <strong>{tripData.workStartTime || 'N/A'}</strong>
                </p>
                <p>
                  <strong>Clientes Visitados:</strong>
                </p>
                <p className="text-left col-span-2">
                  {visitedClients.size} / {summaryStats.uniqueClientsVisited}
                </p>
                <p className="col-span-3">
                  <strong>Tiempo con:</strong>
                </p>
                <p className="pl-2">• Clientes:</p>
                <p className="text-left">
                  {formatDuration(summaryStats.timeWithClients)}
                </p>
                <p className="text-left">
                  <strong>{summaryStats.percentageClients.toFixed(1)}%</strong>
                </p>
                <p className="pl-2 text-red-600">• No Clientes:</p>
                <p className="text-left text-red-600">
                  {formatDuration(summaryStats.timeWithNonClients)}
                </p>
                <p className="text-left text-red-600">
                  <strong>
                    {summaryStats.percentageNonClients.toFixed(1)}%
                  </strong>
                </p>
                <p className="pl-2 text-red-600">• En su casa:</p>
                <p className="text-left text-red-600">
                  {formatDuration(summaryStats.timeAtHome)}
                </p>
                <p className="text-left text-red-600">
                  <strong>{summaryStats.percentageAtHome.toFixed(1)}%</strong>
                </p>
                <p className="pl-2 text-red-600">• Tools de Mexico:</p>
                <p className="text-left text-red-600">
                  {formatDuration(summaryStats.timeAtTools)}
                </p>
                <p className="text-left text-red-600">
                  <strong>{summaryStats.percentageAtTools.toFixed(1)}%</strong>
                </p>
                <p className="pl-2">• En Traslados:</p>
                <p className="text-left">
                  {formatDuration(summaryStats.travelTime)}
                </p>
                <p className="text-left">
                  <strong>{summaryStats.percentageTravel.toFixed(1)}%</strong>
                </p>
                <p>
                  <strong>Distancia total:</strong>
                </p>
                <p className="text-left col-span-2">
                  <strong>
                    {(summaryStats.distanceWithinHours / 1000).toFixed(2)} km
                  </strong>
                </p>
                <p>
                  <strong>Fin de labores:</strong>
                </p>
                <p className="text-left col-span-2">
                  <strong>
                    {viewMode === 'new' && tripData.isTripOngoing
                      ? 'En movimiento...'
                      : tripData.workEndTime || 'N/A'}
                  </strong>
                </p>
                <p className="col-span-3 text-[13px] font-bold text-blue-700 bg-blue-50 py-0.5 rounded">
                  Fuera de horario
                </p>
                <p className="col-span-3 text-[#00004F]">
                  <strong>Tiempo con:</strong>
                </p>
                <p className="pl-2 text-[#00004F]">• Clientes:</p>
                <p className="text-left text-[#00004F] col-span-2">
                  {formatDuration(summaryStats.timeWithClientsAfterHours)}
                </p>
                <p className="pl-2 text-red-600">• No Clientes:</p>
                <p className="text-left text-red-600 col-span-2">
                  {formatDuration(
                    summaryStats.totalTimeWithNonClientsAfterHours
                  )}
                </p>
                <p className="pl-2 text-[#00004F]">• En Traslados:</p>
                <p className="text-left text-[#00004F] col-span-2">
                  {formatDuration(summaryStats.travelTimeAfterHours)}
                </p>
                <p className="text-[#00004F]">
                  <strong>Distancia recorrida:</strong>
                </p>
                <p className="text-left text-[#00004F] col-span-2">
                  <strong>
                    {(summaryStats.distanceAfterHours / 1000).toFixed(2)} km
                  </strong>
                </p>
              </div>
            </InfoCard>
          </div>

          {/* Controles de navegación */}
          <div className="absolute bottom-5 min-[1350px]:top-2.5 min-[1350px]:bottom-auto left-1/2 transform -translate-x-1/2 z-10 bg-white bg-opacity-95 rounded-lg shadow-lg p-2 flex gap-2.5">
            <button
              onClick={handleReset}
              disabled={isAnimating}
              className="px-3 py-2 min-[1350px]:px-4 min-[1350px]:py-2 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              title="Reiniciar"
            >
              <RotateCcw size={18} className="min-[1350px]:hidden" />
              <span className="hidden min-[1350px]:inline">Reiniciar</span>
            </button>

            <button
              onClick={handlePrevStop}
              disabled={currentStopIndex <= 0 || isAnimating}
              className="px-3 py-2 min-[1350px]:px-4 min-[1350px]:py-2 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              title="Anterior Parada"
            >
              <ChevronLeft size={18} className="min-[1350px]:hidden" />
              <span className="hidden min-[1350px]:inline">
                Anterior Parada
              </span>
            </button>

            <button
              onClick={handleNextStop}
              disabled={currentStopIndex >= stopInfo.length - 1 || isAnimating}
              className="px-3 py-2 min-[1350px]:px-4 min-[1350px]:py-2 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              title="Siguiente Parada"
            >
              <ChevronRight size={18} className="min-[1350px]:hidden" />
              <span className="hidden min-[1350px]:inline">
                Siguiente Parada
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
