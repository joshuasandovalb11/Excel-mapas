import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Polyline,
  InfoWindow,
} from '@react-google-maps/api';
import type { ProcessedTripV1, RouteSummaryStats } from '../types/route.types';
import { type Client, type VehicleInfo } from '../utils/tripUtils';
import {
  calculateDistance,
  useCopyToClipboard,
  formatName,
} from '../utils/tripUtils';
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
  tripData: ProcessedTripV1;
  vehicleInfo: VehicleInfo | null;
  clientData: Client[] | null;
  minStopDuration: number;
  selection: string | null;
  summaryStats: RouteSummaryStats;
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

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins} min`;
};

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
    <div className="bg-white/95 rounded-md shadow-sm w-[230px] 2xl:w-[260px] transition-all duration-300">
      <div className="flex justify-between items-center px-2 py-1 2xl:px-3">
        <h4 className="text-[13px] 2xl:text-[14px] font-bold text-[#00004F] m-0">
          {title}
        </h4>
        <button
          onClick={onToggle}
          className="hidden lg:flex p-0.5 2xl:p-1 text-[#00004F] hover:text-blue-600 transition-colors"
        >
          {collapsed ? (
            <ChevronDown className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
          ) : (
            <ChevronUp className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
          )}
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
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const pathRef = useRef<google.maps.MVCArray<google.maps.LatLng> | null>(null);
  const flagMarkersRef = useRef<google.maps.Marker[]>([]);
  const clientMarkersRef = useRef<google.maps.Marker[]>([]);

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

  const polylineOptions = useMemo(
    () => ({
      strokeColor: '#3b82f6',
      strokeOpacity: 0.8,
      strokeWeight: 5,
    }),
    []
  );

  const toggleMarkerSelection = useCallback((index: number) => {
    setSelectedMarkers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const filteredFlags = React.useMemo(() => {
    return tripData.flags.filter(
      (flag) =>
        flag.type !== 'stop' ||
        (flag.durationMin && flag.durationMin >= minStopDuration)
    );
  }, [tripData.flags, minStopDuration]);

  const initialCenter = React.useMemo(() => {
    if (filteredFlags.length > 0) {
      return { lat: filteredFlags[0].lat, lng: filteredFlags[0].lng };
    }
    return { lat: 25.0, lng: -100.0 };
  }, [filteredFlags]);

  const routePath = useMemo(() => {
    return tripData.path || [];
  }, [tripData.path]);

  const stopInfo = React.useMemo(() => {
    const stops: StopInfo[] = [];
    let lastPathIndex = 0;

    filteredFlags.forEach((flag, index) => {
      let closestPathIndex = lastPathIndex;

      if (flag.type === 'trip_start') {
        closestPathIndex = 0;
      } else if (flag.type === 'trip_end') {
        closestPathIndex = Math.max(0, routePath.length - 1);
      } else {
        let minDistance = Infinity;

        for (let i = lastPathIndex; i < routePath.length; i++) {
          const distance = calculateDistance(
            flag.lat,
            flag.lng,
            routePath[i].lat,
            routePath[i].lng
          );
          if (distance < minDistance) {
            minDistance = distance;
            closestPathIndex = i;
          }
        }
      }

      lastPathIndex = closestPathIndex;

      stops.push({
        markerIndex: index,
        pathIndex: closestPathIndex,
        type: flag.type,
      });
    });

    return stops;
  }, [filteredFlags, routePath]);

  useEffect(() => {
    if (isLoaded && window.google && stopInfo.length > 1) {
      const segments: number[] = [];
      let lastPathIndex = 0;

      for (let i = 1; i < stopInfo.length; i++) {
        const stop = stopInfo[i];
        const safeStartIndex = Math.min(lastPathIndex, stop.pathIndex);
        const safeEndIndex = Math.max(lastPathIndex, stop.pathIndex);

        const segmentPath = routePath
          .slice(safeStartIndex, safeEndIndex + 1)
          .map((p) => new google.maps.LatLng(p.lat, p.lng));

        const segmentLength =
          google.maps.geometry.spherical.computeLength(segmentPath);
        segments.push(segmentLength);
        lastPathIndex = stop.pathIndex;
      }

      segmentDistancesRef.current = segments;
    }
  }, [isLoaded, stopInfo, routePath]);

  useEffect(() => {
    if (map && filteredFlags.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      filteredFlags.forEach((flag) => {
        bounds.extend({ lat: flag.lat, lng: flag.lng });
      });
      (clientData || []).forEach((client) => {
        bounds.extend({ lat: client.lat, lng: client.lng });
      });
      map.fitBounds(bounds);
    }
  }, [map, filteredFlags, clientData]);

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

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    setSelectedMarkers(new Set([0]));
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const getMarkerIcon = useCallback((flag: (typeof filteredFlags)[0]) => {
    const colors: Record<string, string> = {
      trip_start: '#22c55e',
      stop: '#4F4E4E',
      trip_end: '#ef4444',
    };
    const color = colors[flag.type] || '#4F4E4E';
    const path =
      'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
    const size = 36;

    let anchorX = size / 2;
    if (flag.type === 'trip_start') anchorX = size / 2 + 4;
    if (flag.type === 'trip_end') anchorX = size / 2 - 4;

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${path}" fill="${color}" /></svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgStr)}`,
      scaledSize: window.google
        ? new window.google.maps.Size(size, size)
        : null,
      anchor: window.google
        ? new window.google.maps.Point(anchorX, size)
        : null,
    };
  }, []);

  const getClientIcon = useCallback((client: Client) => {
    const specialBlueIds = ['3689', '6395'];
    const isSpecial = specialBlueIds.includes(String(client.key));

    let markerColor = '#A12323';
    if (client.isVendorHome) {
      markerColor = '#5D00FF';
    } else if (isSpecial) {
      markerColor = '#005EFF';
    }

    const path = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';
    const size = 31;

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${path}" fill="${markerColor}" /></svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgStr)}`,
      scaledSize: window.google
        ? new window.google.maps.Size(size, size)
        : null,
      anchor: window.google
        ? new window.google.maps.Point(size / 2, size)
        : null,
    };
  }, []);

  useEffect(() => {
    if (!map || !window.google) return;

    flagMarkersRef.current.forEach((marker) => marker.setMap(null));
    flagMarkersRef.current = [];

    filteredFlags.forEach((flag, index) => {
      let zIndex = 10;
      if (flag.type === 'trip_start') zIndex = 100;
      if (flag.type === 'trip_end') zIndex = 101;

      const marker = new window.google.maps.Marker({
        position: { lat: flag.lat, lng: flag.lng },
        map: map,
        icon: getMarkerIcon(flag) as google.maps.Icon,
        optimized: true,
        zIndex,
      });

      marker.addListener('click', () => {
        toggleMarkerSelection(index);
      });

      flagMarkersRef.current.push(marker);
    });

    clientMarkersRef.current.forEach((marker) => marker.setMap(null));
    clientMarkersRef.current = [];

    (clientData || []).forEach((client, index) => {
      const markerKey = -index - 1;
      const marker = new window.google.maps.Marker({
        position: { lat: client.lat, lng: client.lng },
        map: map,
        icon: getClientIcon(client) as google.maps.Icon,
        optimized: true,
        zIndex: 50,
      });

      marker.addListener('click', () => {
        toggleMarkerSelection(markerKey);
      });

      clientMarkersRef.current.push(marker);
    });

    return () => {
      flagMarkersRef.current.forEach((marker) => marker.setMap(null));
      clientMarkersRef.current.forEach((marker) => marker.setMap(null));
    };
  }, [
    map,
    filteredFlags,
    getMarkerIcon,
    getClientIcon,
    toggleMarkerSelection,
    clientData,
  ]);

  const animateToStop = useCallback(
    (targetStopIndex: number, onComplete?: () => void) => {
      if (isAnimating || targetStopIndex >= stopInfo.length) return;

      setIsAnimating(true);
      const targetStop = stopInfo[targetStopIndex];
      const targetPathIndex = targetStop.pathIndex;
      const animationStep =
        tripData.summary.processingMethod === 'speed-based' ? 35 : 1;

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

          if (pathRef.current && window.google) {
            newSegment.forEach((p) => {
              pathRef.current!.push(
                new window.google.maps.LatLng(p.lat, p.lng)
              );
            });
          }
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
      tripData.summary.processingMethod,
      map,
    ]
  );

  const handleReset = () => {
    if (Date.now() - lastNavigationTime.current < NAVIGATION_COOLDOWN) return;
    lastNavigationTime.current = Date.now();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (pathRef.current) {
      pathRef.current.clear();
    }

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

    if (pathRef.current && window.google) {
      pathRef.current.clear();
      const newPath = routePath.slice(0, prevStop.pathIndex + 1);
      newPath.forEach((p) => {
        pathRef.current!.push(new window.google.maps.LatLng(p.lat, p.lng));
      });
    }

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

    const isTools =
      flag.clientKey && ['3689', '6395'].includes(String(flag.clientKey));
    const clientMatchColor = flag.isVendorHome
      ? '#5D00FF'
      : isTools
        ? '#005EFF'
        : inWorkingHours
          ? '#059669'
          : '#10b981';
    const clientNoMatchColor = inWorkingHours ? '#FC2121' : '#C40000';
    const branchColor = inWorkingHours ? '#2563eb' : '#60a5fa';

    let content: React.ReactNode = null;
    const coords = `${flag.lat.toFixed(6)}, ${flag.lng.toFixed(6)}`;
    const googleMapsUrl = `https://maps.google.com/?q=${flag.lat},${flag.lng}`;

    if (flag.type === 'trip_start') {
      content = (
        <div
          style={{
            backgroundColor: bgColor,
            color: textColor,
            paddingBottom: '6px',
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
            Inicio de Viaje
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
              <span style={{ fontWeight: 'bold', color: '#059669' }}>
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <span>{coords}</span>
            )}
          </div>
          <a
            href={googleMapsUrl}
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
            <strong>Ver en Google Maps</strong>
          </a>
        </div>
      );
    } else if (flag.type === 'trip_end') {
      content = (
        <div
          style={{
            backgroundColor: bgColor,
            color: textColor,
            paddingBottom: '6px',
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
            Fin de Viaje
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
              <span style={{ fontWeight: 'bold', color: '#059669' }}>
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <span>{coords}</span>
            )}
          </div>
          <a
            href={googleMapsUrl}
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
            <strong>Ver en Google Maps</strong>
          </a>
        </div>
      );
    } else if (flag.type === 'stop') {
      let clientInfo: React.ReactNode = null;

      if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
        const formattedClientName = formatName(flag.clientName || '');
        const formattedBranchName = formatName(flag.clientBranchName || '');

        const branchInfo =
          flag.clientBranchNumber && String(flag.clientBranchNumber) !== '0'
            ? formattedBranchName
              ? `Suc. ${formattedBranchName}`
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
            <p style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>
              <strong>#{flag.clientKey}</strong>
            </p>
            <p
              style={{ margin: '2px 0 0 0', fontWeight: 600, fontSize: '12px' }}
            >
              <strong>{formattedClientName}</strong>
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
            paddingBottom: '6px',
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
            Parada {flag.stopNumber || index}
          </h3>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
            <strong>Duración:</strong> {formatDuration(flag.durationMin || 0)}
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
              <span style={{ fontWeight: 'bold', color: '#059669' }}>
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <span>{coords}</span>
            )}
          </div>
          <a
            href={googleMapsUrl}
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
            <strong>Ver en Google Maps</strong>
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
        <div style={{ maxWidth: '200px', overflow: 'hidden' }}>{content}</div>
      </InfoWindow>
    );
  };

  const renderClientInfoWindow = (client: Client, clientIndex: number) => {
    const markerKey = -clientIndex - 1;
    if (!selectedMarkers.has(markerKey)) return null;

    const isHome = client.isVendorHome;
    const isSpecial = ['3689', '6395'].includes(String(client.key));
    const titleText = isHome
      ? 'Casa Vendedor'
      : isSpecial
        ? 'Tools de Mexico'
        : 'Cliente';
    const nameColor = isHome ? '#5D00FF' : isSpecial ? '#005EFF' : '#059669';

    const formattedClientName = formatName(client.name || '');
    const formattedBranchName = formatName(client.branchName || '');

    const branchInfo =
      client.branchNumber && String(client.branchNumber) !== '0'
        ? formattedBranchName
          ? `Suc. ${formattedBranchName}`
          : `Suc. ${client.branchNumber}`
        : '';

    const coords = `${client.lat.toFixed(6)}, ${client.lng.toFixed(6)}`;
    const googleMapsUrl = `https://maps.google.com/?q=${client.lat},${client.lng}`;

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
            maxWidth: '200px',
            paddingBottom: '6px',
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
            <strong>{formattedClientName}</strong>
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
              <span style={{ fontWeight: 'bold', color: '#059669' }}>
                ¡Coordenadas Copiadas! ✅
              </span>
            ) : (
              <span>{coords}</span>
            )}
          </div>
          <a
            href={googleMapsUrl}
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
            <strong>Ver en Google Maps</strong>
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

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={initialCenter}
        zoom={12}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        <Polyline
          options={polylineOptions}
          onLoad={(polyline) => {
            polylineRef.current = polyline;
            pathRef.current = polyline.getPath();
          }}
          onUnmount={() => {
            polylineRef.current = null;
            pathRef.current = null;
          }}
        />

        {Array.from(selectedMarkers).map((markerKey) => {
          if (markerKey >= 0) {
            const flag = filteredFlags[markerKey];
            if (!flag) return null;
            return (
              <React.Fragment key={`info-flag-${markerKey}`}>
                {renderStopInfoWindow(flag, markerKey)}
              </React.Fragment>
            );
          } else {
            const clientIndex = Math.abs(markerKey) - 1;
            const client = (clientData || [])[clientIndex];
            if (!client) return null;
            return (
              <React.Fragment key={`info-client-${clientIndex}`}>
                {renderClientInfoWindow(client, clientIndex)}
              </React.Fragment>
            );
          }
        })}
      </GoogleMap>

      {!isStreetViewVisible && (
        <>
          <button
            onClick={() => setIsInfoModalOpen(true)}
            className="min-[1350px]:hidden absolute top-2.5 left-2.5 z-[15] bg-white border-2 border-blue-600 rounded-full w-10 h-10 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Info size={24} className="text-blue-600" />
          </button>

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
                        <p>
                          <strong>Distancia total:</strong>
                        </p>
                        <p className="text-left">
                          {(
                            (summaryStats.distanceWithinHours +
                              summaryStats.distanceAfterHours) /
                            1000
                          ).toFixed(2)}{' '}
                          km
                        </p>
                      </div>
                    </div>
                  )}

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
                        <strong>
                          {tripData.summary.workStartTime || 'N/A'}
                        </strong>
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
                        <strong>Distancia recorrida:</strong>
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
                        <strong>{tripData.summary.workEndTime || 'N/A'}</strong>
                      </p>
                      <p className="col-span-3 text-[11px] font-bold text-blue-700 bg-blue-50 py-0.5 rounded mt-2">
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

          <div className="hidden min-[1350px]:flex absolute top-2.5 right-2.5 z-10 flex-col gap-1.5">
            {vehicleInfo && (
              <InfoCard
                title="Información del Vehículo"
                collapsed={isInfoCardCollapsed}
                onToggle={() => setIsInfoCardCollapsed(!isInfoCardCollapsed)}
              >
                <div className="grid grid-cols-[1.5fr_1.4fr] gap-0.5 2xl:gap-1 text-[11px] 2xl:text-[12px] text-[#00004F] px-2 pb-1.5 2xl:px-3 2xl:pb-2">
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
                  <p>
                    <strong>Distancia total:</strong>
                  </p>
                  <p className="text-left">
                    {(
                      (summaryStats.distanceWithinHours +
                        summaryStats.distanceAfterHours) /
                      1000
                    ).toFixed(2)}{' '}
                    km
                  </p>
                </div>
              </InfoCard>
            )}

            <InfoCard
              title="Resumen del día"
              collapsed={isSummaryCardCollapsed}
              onToggle={() =>
                setIsSummaryCardCollapsed(!isSummaryCardCollapsed)
              }
            >
              <div className="grid grid-cols-[1.5fr_0.9fr_0.2fr] gap-0.5 2xl:gap-1 text-[11px] 2xl:text-[12px] text-[#00004F] px-2 pb-1.5 2xl:px-3 2xl:pb-2">
                <p className="col-span-3 text-[12px] 2xl:text-[13px] font-bold text-blue-700 bg-blue-50 py-0.5 px-1 rounded">
                  Dentro de horario (8:30 - 19:00)
                </p>
                <p>
                  <strong>Inicio de labores:</strong>
                </p>
                <p className="text-left col-span-2">
                  <strong>{tripData.summary.workStartTime || 'N/A'}</strong>
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
                  <strong>Distancia recorrida:</strong>
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
                  <strong>{tripData.summary.workEndTime || 'N/A'}</strong>
                </p>
                <p className="col-span-3 text-[10px] 2xl:text-[13px] font-bold text-blue-700 bg-blue-50 py-0.5 px-1 rounded mt-1 2xl:mt-0">
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
