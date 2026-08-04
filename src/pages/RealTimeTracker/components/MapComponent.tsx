import React, { useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import type { Socket } from 'socket.io-client';
import type { MobileDeviceUpdate } from '../../../types/realtime.types';
import LoadingLayer from '../../../components/LoadingLayer';

interface MapComponentProps {
  socket: Socket | null;
  lockedDeviceId: string | null;
  onUnlockDevice: () => void;
  onLockDevice: (deviceId: string) => void;
  initialDevices: Record<string, MobileDeviceUpdate>;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 32.52682061474156,
  lng: -117.02407614683818,
};

const libraries: ("geometry" | "places")[] = ["geometry"];

const MAX_TAIL_LENGTH = 100;
const TWEEN_DURATION = 1000;

const PERSON_SVG = 'M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z';

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

const MapComponent = React.memo(({ socket, lockedDeviceId, onUnlockDevice, onLockDevice, initialDevices }: MapComponentProps) => {
  const mapRef = useRef<google.maps.Map | null>(null);

  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const polylinesRef = useRef<Record<string, google.maps.Polyline>>({});
  const pathsRef = useRef<Record<string, google.maps.LatLngLiteral[]>>({});
  const animationsRef = useRef<Record<string, number>>({});

  const lockedDeviceIdRef = useRef(lockedDeviceId);
  const onUnlockDeviceRef = useRef(onUnlockDevice);
  const onLockDeviceRef = useRef(onLockDevice);
  const initialDevicesRef = useRef(initialDevices);

  useEffect(() => {
    lockedDeviceIdRef.current = lockedDeviceId;
  }, [lockedDeviceId]);

  useEffect(() => {
    onUnlockDeviceRef.current = onUnlockDevice;
  }, [onUnlockDevice]);

  useEffect(() => {
    onLockDeviceRef.current = onLockDevice;
  }, [onLockDevice]);

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY || '';

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey,
    libraries,
  });

  const handleDashboardUpdateRef = useRef<((update: MobileDeviceUpdate, isInitialSeed?: boolean) => void) | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (lockedDeviceId) {
      const device = initialDevicesRef.current[lockedDeviceId];
      if (device && markersRef.current[lockedDeviceId]) {
        const marker = markersRef.current[lockedDeviceId];
        const pos = marker.getPosition();
        if (pos) {
          map.panTo(pos);
          map.setZoom(17);
        }
      }
    }
  }, [lockedDeviceId]);

  const onMapLoad = React.useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    map.addListener('dragstart', () => {
      if (lockedDeviceIdRef.current) {
        onUnlockDeviceRef.current();
      }
    });

    const devices = initialDevicesRef.current;
    if (devices && Object.keys(devices).length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;

      Object.values(devices).forEach((device) => {
        if ((device as MobileDeviceUpdate & { _noLocation?: boolean })._noLocation || (device.lat === 0 && device.lng === 0)) return;

        if (handleDashboardUpdateRef.current) {
          handleDashboardUpdateRef.current(device, true);
        }

        bounds.extend({ lat: device.lat, lng: device.lng });
        hasPoints = true;
      });

      if (hasPoints) {
        map.fitBounds(bounds);
        setTimeout(() => {
          if (map.getZoom()! > 15) {
            map.setZoom(15);
          }
        }, 100);
      }
    }
  }, []);

  const onMapUnmount = React.useCallback(() => {
    mapRef.current = null;

    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    Object.values(polylinesRef.current).forEach((polyline) => polyline.setMap(null));
    Object.values(animationsRef.current).forEach((id) => cancelAnimationFrame(id));

    markersRef.current = {};
    polylinesRef.current = {};
    pathsRef.current = {};
    animationsRef.current = {};
  }, []);

  useEffect(() => {
    if (!socket || !isLoaded) return;

    const handleDashboardUpdate = (update: MobileDeviceUpdate, isInitialSeed = false) => {
      const map = mapRef.current;
      if (!map) return;

      const { deviceId, lat, lng, vendorName } = update;
      const endPosition = { lat, lng };

      initialDevicesRef.current = {
        ...initialDevicesRef.current,
        [deviceId]: update
      };

      if (!pathsRef.current[deviceId]) {
        pathsRef.current[deviceId] = [];
      }
      const path = pathsRef.current[deviceId];
      path.push(endPosition);
      if (path.length > MAX_TAIL_LENGTH) {
        path.shift();
      }

      if (!polylinesRef.current[deviceId]) {
        const polyline = new google.maps.Polyline({
          path,
          map,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.35,
          strokeWeight: 4,
          geodesic: true,
          zIndex: 0,
        });
        polylinesRef.current[deviceId] = polyline;
      } else {
        polylinesRef.current[deviceId].setPath(path);
      }

      const isLocked = lockedDeviceIdRef.current === deviceId;

      if (!markersRef.current[deviceId]) {
        const marker = new google.maps.Marker({
          position: endPosition,
          map,
          title: vendorName || deviceId,
          icon: {
            path: PERSON_SVG,
            scale: 1.4,
            fillColor: update.isOnline === false ? '#9ca3af' : '#3b82f6',
            fillOpacity: 1,
            strokeWeight: 0,
            anchor: new google.maps.Point(12, 12),
          },
          zIndex: isLocked ? 1000 : 2,
        });

        marker.addListener('click', () => {
          onLockDeviceRef.current(deviceId);
        });

        markersRef.current[deviceId] = marker;

        if (!isInitialSeed && Object.keys(markersRef.current).length === 1) {
          map.panTo(endPosition);
          map.setZoom(15);
        }
      } else {
        const marker = markersRef.current[deviceId];

        marker.setZIndex(isLocked ? 1000 : 2);
        const startLat = marker.getPosition()?.lat() || endPosition.lat;
        const startLng = marker.getPosition()?.lng() || endPosition.lng;
        const icon = marker.getIcon() as google.maps.Symbol;

        if (animationsRef.current[deviceId]) {
          cancelAnimationFrame(animationsRef.current[deviceId]);
        }

        const startTime = performance.now();

        const animate = (time: number) => {
          let t = (time - startTime) / TWEEN_DURATION;
          if (t > 1) t = 1;

          const easing = t * (2 - t);

          const currentLat = lerp(startLat, endPosition.lat, easing);
          const currentLng = lerp(startLng, endPosition.lng, easing);

          marker.setPosition({ lat: currentLat, lng: currentLng });

          if (icon && typeof icon !== 'string') {
            marker.setIcon({
              ...icon,
              fillColor: update.isOnline === false ? '#9ca3af' : '#3b82f6'
            });
          }

          if (t < 1) {
            animationsRef.current[deviceId] = requestAnimationFrame(animate);
          } else {
            delete animationsRef.current[deviceId];
          }
        };

        animationsRef.current[deviceId] = requestAnimationFrame(animate);
      }

      if (isLocked) {
        map.panTo(endPosition);
      }
    };

    handleDashboardUpdateRef.current = handleDashboardUpdate;

    socket.on('dashboard_update', handleDashboardUpdate);

    return () => {
      socket.off('dashboard_update', handleDashboardUpdate);
    };
  }, [socket, isLoaded]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full relative bg-gray-50 flex items-center justify-center">
        <LoadingLayer variant="absolute" spinnerSizeClass="w-10 h-10" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={defaultCenter}
      zoom={11}
      onLoad={onMapLoad}
      onUnmount={onMapUnmount}
      options={{
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: true,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy' as const,
      }}
    />
  );
});

MapComponent.displayName = 'MapComponent';

export default MapComponent;
