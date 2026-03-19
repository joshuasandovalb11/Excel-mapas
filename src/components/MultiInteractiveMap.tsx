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
  Marker,
  Polyline,
  InfoWindow,
} from '@react-google-maps/api';
import {
  type Client,
  calculateDistance,
  useCopyToClipboard,
  isWorkingHours,
} from '../utils/tripUtils';
import { type MultiVehicleData } from '../pages/MultipleVehicleTracker';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFlag,
  faRoad,
  faTriangleExclamation,
  faCar,
} from '@fortawesome/free-solid-svg-icons';
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  MapPinOff,
  MapPin,
  BellRing,
  X as CloseIcon,
  SkipBack,
  SkipForward,
  Eye,
  LoaderPinwheel,
  Bell,
  BellOff,
} from 'lucide-react';
import { FaPlay, FaPause } from 'react-icons/fa';
import { FaCarOn } from 'react-icons/fa6';
import { GOOGLE_MAPS_LIBRARIES } from '../utils/mapConfig';

interface MultiInteractiveMapProps {
  vehicles: MultiVehicleData[];
  minStopDuration: number;
  clientData: Client[] | null;
  googleMapsApiKey: string;
}

const containerStyle = { width: '100%', height: '100%' };
const mapOptions = {
  mapTypeControl: false,
  streetViewControl: true,
  gestureHandling: 'greedy' as const,
  fullscreenControl: false,
};

// Tiempo a segundos
const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return (
    parseInt(parts[0]) * 3600 +
    parseInt(parts[1]) * 60 +
    (parseInt(parts[2]) || 0)
  );
};

// Segundos a tiempo
const secondsToTime = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
};

// Fprmatp de duración
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
};

interface GlobalStop {
  vehicleId: string;
  vehicleColor: string;
  vehicleName: string;
  markerIndex: number;
  pathIndex: number;
  timeSeconds: number;
  type: string;
  lat: number;
  lng: number;
}

interface StopNotification {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleColor: string;
  message: string;
  time: string;
  type?: 'stop' | 'coincidence' | 'reset';
}

/**
 * Búsqueda binaria: devuelve el índice del último evento
 */
const findLastEventIndexByTime = (
  eventTimesInSeconds: number[],
  targetSeconds: number
): number => {
  if (eventTimesInSeconds.length === 0) return -1;
  let lo = 0;
  let hi = eventTimesInSeconds.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (eventTimesInSeconds[mid] <= targetSeconds) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
};

export default function MultiInteractiveMap({
  vehicles,
  minStopDuration,
  googleMapsApiKey,
}: MultiInteractiveMapProps) {
  const [copiedText, copyToClipboard] = useCopyToClipboard();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [hiddenVehicleIds, setHiddenVehicleIds] = useState<Set<string>>(
    new Set()
  );
  const [pathRefreshKey, setPathRefreshKey] = useState(0);
  const [showMarkers, setShowMarkers] = useState(false);
  const [showNotifications, setShowNotifications] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(0);
  const [isResetting, setIsResetting] = useState(false);
  const [notifications, setNotifications] = useState<StopNotification[]>([]);
  const [animatedPaths, setAnimatedPaths] = useState<
    Record<string, google.maps.LatLngLiteral[]>
  >({});

  const notifiedStopsRef = useRef<Set<string>>(new Set());
  const notifiedCoincidencesRef = useRef<Set<string>>(new Set());
  const prevTimeRef = useRef<number>(0);
  const lastFitRef = useRef<number>(0);

  /**
   * CÁLCULO DEL RANGO TEMPORAL GLOBAL
   */
  const { globalStartTime, globalEndTime, globalStops, vehicleEventSeconds } =
    useMemo(() => {
      let start = 86400;
      let end = 0;
      const allStops: GlobalStop[] = [];

      const evSeconds: Record<string, number[]> = {};

      vehicles.forEach((vehicle) => {
        const events = vehicle.tripData.events;
        const routePath = vehicle.tripData.routes[0]?.path || [];
        const vehicleFlags = vehicle.tripData.flags;

        if (events.length === 0 || routePath.length === 0) return;

        const timesInSec = events.map((e) => timeToSeconds(e.time));
        evSeconds[vehicle.id] = timesInSec;

        const vStart = timesInSec[0];
        const vEnd = timesInSec[timesInSec.length - 1];
        if (vStart < start) start = vStart;
        if (vEnd > end) end = vEnd;

        const validFlags = vehicleFlags.filter(
          (f) =>
            f.type !== 'stop' || (f.duration && f.duration >= minStopDuration)
        );

        validFlags.forEach((flag, index) => {
          if (
            flag.type === 'start' ||
            flag.type === 'stop' ||
            flag.type === 'end'
          ) {
            let closestPathIndex = 0;
            let minDist = Infinity;
            routePath.forEach((pathPoint, i) => {
              const distance = calculateDistance(
                flag.lat,
                flag.lng,
                pathPoint.lat,
                pathPoint.lng
              );
              if (distance < minDist) {
                minDist = distance;
                closestPathIndex = i;
              }
            });

            allStops.push({
              vehicleId: vehicle.id,
              vehicleColor: vehicle.color,
              vehicleName: vehicle.vehicleInfo.descripcion || vehicle.fileName,
              markerIndex: index,
              pathIndex: closestPathIndex,
              timeSeconds: timeToSeconds(flag.time),
              type: flag.type,
              lat: flag.lat,
              lng: flag.lng,
            });
          }
        });
      });

      if (start === 86400) start = 28800;
      if (end === 0) end = 64800;

      return {
        globalStartTime: start,
        globalEndTime: end,
        globalStops: allStops.sort((a, b) => a.timeSeconds - b.timeSeconds),
        vehicleEventSeconds: evSeconds,
      };
    }, [vehicles, minStopDuration]);

  const visibleVehicles = useMemo(
    () => vehicles.filter((v) => !hiddenVehicleIds.has(v.id)),
    [vehicles, hiddenVehicleIds]
  );

  // Inicialización o Cambio de Vehículos
  useEffect(() => {
    setCurrentTimeSeconds(globalStartTime);
    prevTimeRef.current = globalStartTime;
    setIsPlaying(false);
    setIsFinished(false);
    setIsPaused(false);
    setNotifications([]);
    notifiedStopsRef.current.clear();
    setSelectedMarkerId(null);
    setSelectedVehicleId(null);

    const initialPaths: Record<string, google.maps.LatLngLiteral[]> = {};
    vehicles.forEach((v) => {
      initialPaths[v.id] = [];
    });
    setAnimatedPaths(initialPaths);
  }, [vehicles, globalStartTime]);

  // Encuadrar el mapa
  useEffect(() => {
    if (!map || visibleVehicles.length === 0) return;

    const isSingleVehicle = visibleVehicles.length === 1;

    if (isSingleVehicle && !showMarkers) {
      const vehicle = visibleVehicles[0];
      const path = animatedPaths[vehicle.id];
      const currentPos =
        path && path.length > 0
          ? path[path.length - 1]
          : vehicle.tripData.routes[0]?.path[0];

      if (!currentPos) return;

      const isFirstLoad = lastFitRef.current === 0;

      if (isFirstLoad) {
        const fullBounds = new window.google.maps.LatLngBounds();
        vehicle.tripData.routes[0]?.path.forEach((p) => fullBounds.extend(p));
        map.fitBounds(fullBounds, 60);
        setTimeout(() => {
          const z = map.getZoom();
          if (z && z > 16) map.setZoom(16);
        }, 150);
        lastFitRef.current = Date.now();
        return;
      }

      const visibleBounds = map.getBounds();
      if (visibleBounds && !visibleBounds.contains(currentPos)) {
        map.panTo(currentPos);
      }
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;
    let usedFallback = false;

    if (showMarkers) {
      visibleVehicles.forEach((vehicle) => {
        vehicle.tripData.routes[0]?.path.forEach((p) => {
          bounds.extend({ lat: p.lat, lng: p.lng });
          hasPoints = true;
        });
      });
    } else {
      visibleVehicles.forEach((vehicle) => {
        const path = animatedPaths[vehicle.id];
        if (path && path.length > 0) {
          bounds.extend({
            lat: path[path.length - 1].lat,
            lng: path[path.length - 1].lng,
          });
          hasPoints = true;
        } else if (vehicle.tripData.routes[0]?.path.length > 0) {
          bounds.extend({
            lat: vehicle.tripData.routes[0].path[0].lat,
            lng: vehicle.tripData.routes[0].path[0].lng,
          });
          hasPoints = true;
          usedFallback = true;
        }
      });
    }

    if (!hasPoints) return;

    const now = Date.now();
    const isFirstLoad = lastFitRef.current === 0;

    if (isFirstLoad || showMarkers || now - lastFitRef.current >= 1500) {
      map.fitBounds(bounds, 60);
      setTimeout(() => {
        const z = map.getZoom();
        if (z && z > 16) map.setZoom(16);
      }, 150);
      if (!usedFallback) {
        lastFitRef.current = now;
      }
    }
  }, [map, visibleVehicles, showMarkers, animatedPaths]);

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);

  // Función para manejar las notificaciones
  const addNotification = useCallback((notif: StopNotification) => {
    setNotifications((prev) => [notif, ...prev].slice(0, 4));
    const duration = notif.type === 'coincidence' ? 10000 : 5000;
    setTimeout(
      () => setNotifications((prev) => prev.filter((n) => n.id !== notif.id)),
      duration
    );
  }, []);

  // MOTOR DE ANIMACIÓN
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTimeSeconds((prevTime) => {
          const VIRTUAL_SECONDS_PER_TICK = 30;
          const nextTime = prevTime + VIRTUAL_SECONDS_PER_TICK * playbackSpeed;

          if (nextTime >= globalEndTime) {
            setIsPlaying(false);
            setIsFinished(true);
            setIsPaused(false);
            return globalEndTime;
          }
          return nextTime;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, globalEndTime]);

  /**
   * ACTUALIZADOR DE RUTAS Y NOTIFICACIONES
   */
  useEffect(() => {
    if (!isPlaying && currentTimeSeconds === globalStartTime && !isFinished)
      return;

    const newAnimatedPaths: Record<string, google.maps.LatLngLiteral[]> = {};

    const timeDelta = currentTimeSeconds - prevTimeRef.current;
    const isManualJump = timeDelta > 360 || timeDelta < 0;

    visibleVehicles.forEach((vehicle) => {
      const fullPath = vehicle.tripData.routes[0]?.path || [];
      const events = vehicle.tripData.events;

      if (fullPath.length === 0 || events.length === 0) return;

      const timesInSec = vehicleEventSeconds[vehicle.id];
      if (!timesInSec || timesInSec.length === 0) return;

      const vStart = timesInSec[0];
      const vEnd = timesInSec[timesInSec.length - 1];

      if (currentTimeSeconds < vStart) {
        newAnimatedPaths[vehicle.id] = [fullPath[0]];
        return;
      }

      if (currentTimeSeconds >= vEnd) {
        newAnimatedPaths[vehicle.id] = fullPath;
        return;
      }

      const evIdx = findLastEventIndexByTime(timesInSec, currentTimeSeconds);

      const eventProgress = events.length > 1 ? evIdx / (events.length - 1) : 1;
      const targetIndex = Math.min(
        Math.floor(eventProgress * (fullPath.length - 1)),
        fullPath.length - 1
      );

      newAnimatedPaths[vehicle.id] = fullPath.slice(0, targetIndex + 1);

      if (!isManualJump) {
        const stopsToNotify = globalStops.filter(
          (stop) =>
            stop.vehicleId === vehicle.id &&
            stop.timeSeconds > prevTimeRef.current &&
            stop.timeSeconds <= currentTimeSeconds
        );

        stopsToNotify.forEach((stop) => {
          const stopUniqueId = `${stop.vehicleId}-${stop.markerIndex}`;
          if (!notifiedStopsRef.current.has(stopUniqueId)) {
            notifiedStopsRef.current.add(stopUniqueId);

            let message = '';
            if (stop.type === 'start') message = 'Inició recorrido';
            else if (stop.type === 'end') message = 'Finalizó recorrido';
            else
              message = `Hizo una parada de ${formatDuration(
                vehicle.tripData.flags[stop.markerIndex]?.duration || 0
              )}`;

            addNotification({
              id: `notif-${stopUniqueId}-${Date.now()}`,
              vehicleId: vehicle.id,
              vehicleName: vehicle.vehicleInfo.descripcion || vehicle.fileName,
              vehicleColor: vehicle.color,
              message,
              time: secondsToTime(currentTimeSeconds),
            });
          }
        });
      }
    });

    const activos = visibleVehicles
      .filter(
        (v) => newAnimatedPaths[v.id] && newAnimatedPaths[v.id].length > 0
      )
      .map((v) => ({
        vehicle: v,
        pos: newAnimatedPaths[v.id][newAnimatedPaths[v.id].length - 1],
      }));

    if (
      visibleVehicles.length >= 3 &&
      activos.length === visibleVehicles.length
    ) {
      let todosCoinciden = true;

      for (let i = 0; i < activos.length; i++) {
        for (let j = i + 1; j < activos.length; j++) {
          const distancia = calculateDistance(
            activos[i].pos.lat,
            activos[i].pos.lng,
            activos[j].pos.lat,
            activos[j].pos.lng
          );
          if (distancia >= 100) {
            todosCoinciden = false;
            break;
          }
        }
        if (!todosCoinciden) break;
      }

      if (todosCoinciden) {
        const groupKey = activos
          .map((a) => a.vehicle.id)
          .sort()
          .join('::');

        if (!notifiedCoincidencesRef.current.has(groupKey)) {
          notifiedCoincidencesRef.current.add(groupKey);

          const primerVehiculo = activos[0];
          const nombres = activos
            .map((a) => a.vehicle.vehicleInfo.descripcion || a.vehicle.fileName)
            .join(', ');

          addNotification({
            id: `coincidencia-${groupKey}-${Date.now()}`,
            vehicleId: primerVehiculo.vehicle.id,
            vehicleName:
              primerVehiculo.vehicle.vehicleInfo.descripcion ||
              primerVehiculo.vehicle.fileName,
            vehicleColor: primerVehiculo.vehicle.color,
            message: `Vehiculos: ${nombres}`,
            time: secondsToTime(currentTimeSeconds),
            type: 'coincidence',
          });
        }
      } else {
        notifiedCoincidencesRef.current.clear();
      }
    }

    setAnimatedPaths(newAnimatedPaths);
    prevTimeRef.current = currentTimeSeconds;
  }, [
    currentTimeSeconds,
    isPlaying,
    isFinished,
    vehicles,
    globalStops,
    globalStartTime,
    vehicleEventSeconds,
    addNotification,
    visibleVehicles,
    pathRefreshKey,
  ]);

  // Función para pausar
  const togglePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setIsPaused(true);
    } else {
      if (isFinished) {
        resetState();
        setTimeout(() => setIsPlaying(true), 100);
      } else {
        setIsPlaying(true);
        setIsPaused(false);
      }
    }
  };

  const SKIP_OPTIONS = [5, 15, 30] as const;
  const [skipMinutes, setSkipMinutes] = useState<5 | 15 | 30>(15);

  // Manejador de skip
  const handleSkip = (direction: 'forward' | 'backward') => {
    const delta = (direction === 'forward' ? 1 : -1) * skipMinutes * 60;

    setCurrentTimeSeconds((prev) => {
      const next = Math.max(
        globalStartTime,
        Math.min(globalEndTime, prev + delta)
      );

      if (direction === 'backward') {
        const keysToRemove: string[] = [];
        notifiedStopsRef.current.forEach((key) => {
          const stop = globalStops.find(
            (s) => `${s.vehicleId}-${s.markerIndex}` === key
          );
          if (stop && stop.timeSeconds >= next) {
            keysToRemove.push(key);
          }
        });
        keysToRemove.forEach((k) => notifiedStopsRef.current.delete(k));
      }

      prevTimeRef.current = next;

      if (isFinished && direction === 'backward') {
        setIsFinished(false);
        setIsPaused(true);
      }

      return next;
    });
  };

  // Manejador de rango para el tiempo
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);

    if (isPlaying) {
      setIsPlaying(false);
      setIsPaused(true);
    }

    const keysToRemove: string[] = [];
    notifiedStopsRef.current.forEach((key) => {
      const stop = globalStops.find(
        (s) => `${s.vehicleId}-${s.markerIndex}` === key
      );
      if (stop && stop.timeSeconds >= next) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((k) => notifiedStopsRef.current.delete(k));

    if (isFinished && next < globalEndTime) {
      setIsFinished(false);
      setIsPaused(true);
    }

    prevTimeRef.current = next;
    setCurrentTimeSeconds(next);
  };

  // Funcion para manejar el reseto de los controles
  const resetState = () => {
    setIsResetting(true);
    setTimeout(() => setIsResetting(false), 1000);

    setIsPlaying(false);
    setIsFinished(false);
    setIsPaused(false);
    setPlaybackSpeed(1);
    setSkipMinutes(15);
    setHiddenVehicleIds(new Set());
    setCurrentTimeSeconds(globalStartTime);
    prevTimeRef.current = globalStartTime;
    lastFitRef.current = 0;
    setNotifications([]);
    notifiedStopsRef.current.clear();
    notifiedCoincidencesRef.current.clear();
    setShowNotifications(true);
    setSelectedMarkerId(null);
    setSelectedVehicleId(null);

    const initialPaths: Record<string, google.maps.LatLngLiteral[]> = {};
    vehicles.forEach((v) => {
      initialPaths[v.id] = [];
    });
    setAnimatedPaths(initialPaths);

    if (map && vehicles.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      let hasPoints = false;

      if (showMarkers) {
        vehicles.forEach((vehicle) => {
          const flags = vehicle.tripData.flags.filter(
            (f) =>
              f.type !== 'stop' || (f.duration && f.duration >= minStopDuration)
          );
          flags.forEach((flag) => {
            bounds.extend({ lat: flag.lat, lng: flag.lng });
            hasPoints = true;
          });
        });
      } else {
        vehicles.forEach((vehicle) => {
          const fullPath = vehicle.tripData.routes[0]?.path;
          if (fullPath && fullPath.length > 0) {
            bounds.extend({ lat: fullPath[0].lat, lng: fullPath[0].lng });
            hasPoints = true;
          }
        });
      }

      if (hasPoints) {
        map.fitBounds(bounds);
        setTimeout(() => {
          const currentZoom = map.getZoom();
          if (currentZoom && currentZoom > 16) {
            map.setZoom(16);
          }
        }, 100);
      }
    }
  };

  // Funcion para manejar el reset de los controles
  const handleReset = () => {
    resetState();
    addNotification({
      id: `reset-${Date.now()}`,
      vehicleId: '',
      vehicleName: '',
      vehicleColor: '',
      message: `Todos los valores se han reiniciado correctamente.`,
      time: '',
      type: 'reset',
    });
  };

  // Funcion para mostrar/ocultar el vehiculo
  const toggleVehicleVisibility = (id: string) => {
    setHiddenVehicleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    const isHiding = !hiddenVehicleIds.has(id);

    if (isHiding) {
      setAnimatedPaths((prev) => ({ ...prev, [id]: [] }));
    } else {
      setPathRefreshKey((prev) => prev + 1);
    }

    lastFitRef.current = 0;
  };

  // Función para manejar la velocidad
  const toggleSpeed = () => {
    setPlaybackSpeed((prev) => {
      if (prev === 1) return 2;
      if (prev === 2) return 4;
      if (prev === 4) return 0.5;
      return 1;
    });
  };

  // Función para obtener el icono del marcador
  const getMarkerIcon = (vehicleColor: string) => {
    return {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
      fillColor: vehicleColor,
      fillOpacity: 1,
      strokeColor: 'white',
      strokeWeight: 0,
      scale: 1.3,
      anchor: new google.maps.Point(12, 24),
    };
  };

  if (loadError)
    return (
      <div className="flex items-center justify-center h-full">
        Error cargando el mapa
      </div>
    );
  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-full">
        Cargando mapa...
      </div>
    );

  return (
    <div className="relative w-full h-full overflow-hidden">
      <style>{`
        .coords-hover { transition: color 0.2s ease; }
        .coords-hover:hover { color: #000000 !important; }
      `}</style>

      <GoogleMap
        mapContainerStyle={containerStyle}
        zoom={12}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        {visibleVehicles.map((vehicle) => (
          <Polyline
            key={`poly-${vehicle.id}`}
            path={animatedPaths[vehicle.id] || []}
            options={{
              strokeColor: vehicle.color,
              strokeOpacity: 0.9,
              strokeWeight: 5,
            }}
          />
        ))}

        {visibleVehicles.map((vehicle) => {
          const path = animatedPaths[vehicle.id];
          const fullPath = vehicle.tripData.routes[0]?.path;
          if (!fullPath || fullPath.length === 0) return null;

          const currentPos =
            path && path.length > 0 ? path[path.length - 1] : fullPath[0];

          return (
            <React.Fragment key={`marker-fragment-${vehicle.id}`}>
              <Marker
                key={`car-${vehicle.id}`}
                position={{ lat: currentPos.lat, lng: currentPos.lng }}
                icon={{
                  path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
                  fillColor: vehicle.color,
                  fillOpacity: 2,
                  strokeColor: 'white',
                  strokeWeight: 0,
                  scale: 1.2,
                  anchor: new google.maps.Point(12, 12),
                }}
                zIndex={999}
                onClick={() =>
                  setSelectedVehicleId(
                    selectedVehicleId === vehicle.id ? null : vehicle.id
                  )
                }
              />

              {selectedVehicleId === vehicle.id && (
                <InfoWindow
                  position={{ lat: currentPos.lat, lng: currentPos.lng }}
                  onCloseClick={() => setSelectedVehicleId(null)}
                >
                  <div
                    style={{
                      maxWidth: '200px',
                      color: '#FF0000',
                      paddingBottom: '10px',
                      paddingRight: '10px',
                    }}
                  >
                    <h3
                      style={{
                        color: 'black',
                        fontSize: '15px',
                        fontWeight: 500,
                        margin: '0 0 8px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faCar}
                        style={{ color: vehicle.color }}
                      />{' '}
                      Vehiculo
                    </h3>
                    <p
                      className="flex gap-2"
                      style={{
                        color: 'black',
                        margin: '0 0 4px 0',
                        fontSize: '12px',
                      }}
                    >
                      <strong>Nombre:</strong>{' '}
                      <span
                        style={{ color: vehicle.color, fontWeight: 'bold' }}
                      >
                        {vehicle.vehicleInfo.descripcion}
                      </span>
                    </p>
                    <div
                      className="flex gap-2 items-center"
                      style={{
                        color: 'black',
                        margin: '0 0 4px 0',
                        fontSize: '12px',
                      }}
                    >
                      <strong>Archivo:</strong>{' '}
                      <span
                        style={{
                          fontSize: '11px',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {vehicle.fileName}
                      </span>
                    </div>
                  </div>
                </InfoWindow>
              )}
            </React.Fragment>
          );
        })}

        {showMarkers &&
          visibleVehicles.map((vehicle) => {
            const flags = vehicle.tripData.flags.filter(
              (f) =>
                f.type !== 'stop' ||
                (f.duration && f.duration >= minStopDuration)
            );
            return flags.map((flag, index) => {
              const markerId = `v-${vehicle.id}-m-${index}`;
              const iconColor =
                flag.type === 'start'
                  ? '#22c55e'
                  : flag.type === 'end'
                    ? '#ef4444'
                    : vehicle.color;
              const isWorking =
                flag.type === 'stop'
                  ? isWorkingHours(flag.time, vehicle.vehicleInfo.fecha)
                  : true;
              const coords = `${flag.lat.toFixed(6)}, ${flag.lng.toFixed(6)}`;

              return (
                <React.Fragment key={markerId}>
                  <Marker
                    position={{ lat: flag.lat, lng: flag.lng }}
                    icon={getMarkerIcon(vehicle.color)}
                    onClick={() =>
                      setSelectedMarkerId(
                        selectedMarkerId === markerId ? null : markerId
                      )
                    }
                  />

                  {selectedMarkerId === markerId && (
                    <InfoWindow
                      position={{ lat: flag.lat, lng: flag.lng }}
                      onCloseClick={() => setSelectedMarkerId(null)}
                    >
                      <div
                        style={{
                          maxWidth: '280px',
                          color: isWorking ? 'black' : '#FF0000',
                          paddingBottom: '6px',
                          paddingRight: '10px',
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: vehicle.color,
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            marginBottom: '8px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <FontAwesomeIcon icon={faCar} />{' '}
                          {vehicle.vehicleInfo.descripcion || vehicle.fileName}
                        </div>

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
                            style={{ color: iconColor, marginRight: '8px' }}
                          >
                            <FontAwesomeIcon
                              icon={
                                flag.type === 'start' || flag.type === 'end'
                                  ? faRoad
                                  : isWorking
                                    ? faFlag
                                    : faTriangleExclamation
                              }
                            />
                          </span>
                          {flag.type === 'start'
                            ? 'Inicio'
                            : flag.type === 'end'
                              ? 'Fin'
                              : `Parada ${flag.stopNumber}`}
                        </h3>

                        {flag.type === 'stop' && (
                          <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
                            <strong>Duración:</strong>{' '}
                            {formatDuration(flag.duration || 0)}
                          </p>
                        )}
                        <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
                          <strong>Hora:</strong> {flag.time}
                        </p>

                        {flag.clientName &&
                          flag.clientName !== 'Sin coincidencia' && (
                            <div
                              style={{
                                color: isWorking ? '#059669' : '#10b981',
                                margin: '4px 0',
                                fontWeight: 600,
                              }}
                            >
                              <p style={{ margin: 0, fontSize: '12px' }}>
                                <strong>#{flag.clientKey}</strong>
                              </p>
                              <p
                                style={{
                                  margin: '2px 0 0 0',
                                  fontSize: '12px',
                                }}
                              >
                                {flag.clientName}
                              </p>
                            </div>
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
                              style={{ fontWeight: 'bold', color: '#059669' }}
                            >
                              ¡Coordenadas Copiadas! ✅
                            </span>
                          ) : (
                            <span>{coords}</span>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </React.Fragment>
              );
            });
          })}
      </GoogleMap>

      {isResetting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/10 backdrop-blur-sm">
          <LoaderPinwheel size={50} className="animate-spin text-green-600" />
        </div>
      )}

      {/* Relog de simulacion */}
      {vehicles.length > 0 && (
        <div className="absolute top-4 right-[10px] w-[130px] min-[1350px]:w-[160px] z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-center">
          <p className="text-[11px] uppercase font-bold text-[#00004F] tracking-wider mb-0.5">
            Reloj Simulación
          </p>
          <p className="text-xl font-mono font-bold text-green-700">
            {secondsToTime(currentTimeSeconds)}
          </p>
        </div>
      )}

      {/* Notificaciones */}
      <div className="absolute top-4 left-[10px] z-20 flex flex-col gap-2 pointer-events-none">
        {notifications
          .filter((notif) => showNotifications || notif.type === 'reset')
          .map((notif) =>
            notif.type === 'coincidence' ? (
              // Notificación exclusiva de coincidencia total
              <div
                key={notif.id}
                className="pointer-events-auto bg-linear-to-l from-amber-50 to-amber-100 backdrop-blur-sm border-l-4 rounded-r-lg shadow-lg p-3 pr-8 relative transition-all duration-300 w-64"
                style={{
                  borderLeftColor: '#F54927',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FaCarOn
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{
                        color: '#F54927',
                      }}
                    />
                    <span className="text-xs font-bold text-gray-900 truncate">
                      COINCIDENCIA
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 font-semibold">
                    {notif.time}
                  </span>
                </div>
                <p className="text-[11px] text-gray-800 font-medium leading-tight">
                  {notif.message}
                </p>
                <button
                  onClick={() =>
                    setNotifications((prev) =>
                      prev.filter((n) => n.id !== notif.id)
                    )
                  }
                  className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full cursor-pointer"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            ) : notif.type === 'reset' ? (
              // Notificación exclusiva para reseteo
              <div
                key={notif.id}
                className="pointer-events-auto bg-white/95 backdrop-blur-sm border-l-4 rounded-r-lg shadow-lg p-3 pr-8 relative transition-all duration-300 w-64"
                style={{
                  borderLeftColor: '#374151',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <BellRing
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{
                        color: '#374151',
                      }}
                    />
                    <p className="text-[11px] text-gray-800 font-medium leading-tight">
                      {notif.message}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setNotifications((prev) =>
                      prev.filter((n) => n.id !== notif.id)
                    )
                  }
                  className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-700 hover:bg-red-100 rounded-full cursor-pointer"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              // Notificación normal de parada
              <div
                key={notif.id}
                className="pointer-events-auto bg-white/95 backdrop-blur-sm border-l-4 rounded-r-lg shadow-lg p-3 pr-8 relative transition-all duration-300 w-64"
                style={{ borderLeftColor: notif.vehicleColor }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <BellRing
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: notif.vehicleColor }}
                    />
                    <span className="text-xs font-bold text-gray-800 truncate">
                      {notif.vehicleName}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 font-semibold">
                    {notif.time}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 font-medium leading-tight">
                  {notif.message}
                </p>
                <button
                  onClick={() =>
                    setNotifications((prev) =>
                      prev.filter((n) => n.id !== notif.id)
                    )
                  }
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            )
          )}
      </div>

      {/* Vehiculos agregados */}
      <div className="absolute top-[100px] min-[1350px]:top-[90px] right-[10px] w-[130px] min-[1350px]:w-[160px] z-10 bg-white/95 rounded-xl shadow-lg">
        <div className="flex items-center px-3 py-2 border-b border-gray-300">
          <h4 className="text-[11px] uppercase font-bold text-[#00004F] tracking-wider m-0">
            Vehículos
          </h4>
          <button
            onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
            className="absolute items-center right-[10px] text-[#00004F] hover:text-blue-600 transition-colors cursor-pointer"
          >
            {isLegendCollapsed ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronUp size={16} />
            )}
          </button>
        </div>

        <div
          className={`transition-all duration-300 overflow-hidden ${isLegendCollapsed ? 'max-h-0 opacity-0' : 'max-h-[300px] opacity-100 overflow-y-auto'}`}
        >
          <div className="p-3 flex flex-col gap-2">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className={`flex items-center gap-2 text-xs font-semibold text-gray-700 ${hiddenVehicleIds.has(v.id) ? 'opacity-40' : ''}`}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-sm"
                  style={{ backgroundColor: v.color }}
                />
                <span className="truncate" title={v.fileName}>
                  {v.vehicleInfo.descripcion || v.fileName}
                </span>

                <button
                  className="absolute right-[10px] p-1 rounded-full hover:bg-blue-100"
                  onClick={() => toggleVehicleVisibility(v.id)}
                >
                  {hiddenVehicleIds.has(v.id) ? (
                    <Eye size={13} className="text-gray-700" />
                  ) : (
                    <Eye size={13} className="text-blue-700" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Boton para ocultar/mostrar las notificaciones */}
      <div className="absolute right-[10px] bottom-[200px] z-10">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          title={
            showNotifications
              ? 'Ocultar Notificaciones'
              : 'Mostrar Notificaciones'
          }
          className="w-[38px] h-[38px] bg-white text-green-600 border border-green-600 hover:bg-green-600 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          style={{
            boxShadow: 'rgba(0, 0, 0, 0.3) 1px 3px 5px -1px',
            borderRadius: '50%',
          }}
        >
          {showNotifications ? <BellOff size={25} /> : <Bell size={25} />}
        </button>
      </div>

      {/* Boton para mostrar/ocultar marcadores */}
      <div className="absolute right-[10px] bottom-[150px] z-10">
        <button
          onClick={() => {
            setShowMarkers(!showMarkers);
            setSelectedMarkerId(null);
            lastFitRef.current = 0;
          }}
          title={showMarkers ? 'Ocultar Marcadores' : 'Mostrar Marcadores'}
          className="w-[38px] h-[38px] bg-white text-blue-600 border border-blue-600 flex items-center justify-center cursor-pointer transition-colors hover:bg-blue-600 hover:text-white"
          style={{
            boxShadow: 'rgba(0, 0, 0, 0.3) 1px 3px 5px -1px',
            borderRadius: '50%',
          }}
        >
          {showMarkers ? <MapPinOff size={25} /> : <MapPin size={25} />}
        </button>
      </div>

      {/* Controles de animacion */}
      <div className="absolute bottom-5 min-[1350px]:top-2.5 min-[1350px]:bottom-auto left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          {/* Botón retroceder */}
          <button
            onClick={() => handleSkip('backward')}
            disabled={isPlaying}
            title={`Retroceder ${skipMinutes} min`}
            className={`flex flex-col items-center justify-center w-[52px] h-[52px] rounded-full shadow-lg border bg-white transition-all
              ${
                isPlaying
                  ? 'opacity-30 cursor-not-allowed border-gray-200 text-gray-300'
                  : 'cursor-pointer border-gray-200 hover:bg-gray-100 text-gray-700 hover:text-gray-900 active:scale-95'
              }`}
          >
            <SkipBack size={16} />
            <span className="text-[9px] font-bold leading-none mt-0.5">
              {skipMinutes} min
            </span>
          </button>

          {/* Barra central */}
          <div className="bg-white bg-opacity-95 rounded-full shadow-lg p-2 flex gap-1 border border-gray-200">
            <button
              onClick={handleReset}
              className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
              title="Reiniciar"
            >
              <RotateCcw size={16} strokeWidth={2.4} />
            </button>

            <div className="w-px bg-gray-400 mx-1 my-2"></div>

            <button
              onClick={togglePlayPause}
              className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 transition-colors shadow-sm cursor-pointer 
                ${
                  isPlaying
                    ? 'bg-orange-100 text-orange-700'
                    : isFinished
                      ? 'bg-green-100 text-green-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                }`}
            >
              {isPlaying ? (
                <>
                  <FaPause size={13} />
                  <span className="hidden sm:inline">Pausar</span>
                </>
              ) : isFinished ? (
                <>
                  <RotateCcw size={16} />
                  <span className="hidden sm:inline">Repetir</span>
                </>
              ) : isPaused ? (
                <>
                  <FaPlay size={13} />
                  <span className="hidden sm:inline">Continuar</span>
                </>
              ) : (
                <>
                  <FaPlay size={13} />
                  <span className="hidden sm:inline">Iniciar Recorrido</span>
                </>
              )}
            </button>

            <div className="w-px bg-gray-400 mx-1 my-2"></div>

            <button
              onClick={toggleSpeed}
              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 hover:text-gray-900 rounded-full text-xs font-bold items-center transition-colors cursor-pointer justify-center"
              title="Cambiar velocidad"
            >
              x
              {playbackSpeed === 1
                ? '1.0'
                : playbackSpeed === 2
                  ? '2.0'
                  : playbackSpeed === 4
                    ? '4.0'
                    : '0.5'}
            </button>
          </div>

          {/* Botón adelantar */}
          <button
            onClick={() => handleSkip('forward')}
            disabled={isPlaying}
            title={`Adelantar ${skipMinutes} min`}
            className={`flex flex-col items-center justify-center w-[52px] h-[52px] rounded-full shadow-lg border bg-white transition-all
              ${
                isPlaying
                  ? 'opacity-30 cursor-not-allowed border-gray-200 text-gray-300'
                  : 'cursor-pointer border-gray-200 hover:bg-gray-100 text-gray-800 hover:text-gray-900 active:scale-95'
              }`}
          >
            <SkipForward size={16} />
            <span className="text-[9px] font-bold leading-none mt-0.5">
              {skipMinutes} min
            </span>
          </button>
        </div>
      </div>

      {/* Selector de duración de salto + Scrubber */}
      <div className="absolute top-5 min-[1350px]:bottom-2.5 min-[1350px]:top-auto left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <div
          className="bg-white/95 border border-gray-200 rounded-2xl shadow-lg px-4 pt-2.5 pb-3 flex flex-col gap-2"
          style={{ width: '340px' }}
        >
          {/* Selector de salto */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Salto
            </span>
            <div className="flex gap-1">
              {SKIP_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSkipMinutes(opt)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer
                    ${
                      skipMinutes === opt
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                  {opt} min
                </button>
              ))}
            </div>
          </div>

          {/* Barra de tiempo (scrubber) */}
          <div className="flex flex-col gap-1">
            <input
              type="range"
              min={globalStartTime}
              max={globalEndTime}
              step={30}
              value={currentTimeSeconds}
              onChange={handleScrub}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-green-600"
              style={{
                background: `linear-gradient(to right, #10b981 ${((currentTimeSeconds - globalStartTime) / (globalEndTime - globalStartTime)) * 100}%, #e5e7eb ${((currentTimeSeconds - globalStartTime) / (globalEndTime - globalStartTime)) * 100}%)`,
              }}
            />
            <div className="flex justify-between text-[13px] font-mono text-gray-500 font-semibold">
              <span>{secondsToTime(globalStartTime)}</span>
              <span className="text-green-700 font-bold">
                {secondsToTime(currentTimeSeconds)}
              </span>
              <span>{secondsToTime(globalEndTime)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
