import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { MobileDeviceUpdate } from '../types/realtime.types';
import { fetchDispositivosEstado } from '../services/apiRutas';

export function useRealTimeSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, MobileDeviceUpdate>>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const forceRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleDeviceUpdate = useCallback((update: MobileDeviceUpdate) => {
    setDevices((prev) => ({
      ...prev,
      [update.deviceId]: update,
    }));
  }, []);

  // Fetch inicial del catálogo de dispositivos
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        setIsLoadingCatalog(true);
        setCatalogError(null);

        const data = await fetchDispositivosEstado();

        const initialDevices: Record<string, MobileDeviceUpdate> = {};
        data.forEach(item => {
          initialDevices[item.deviceId] = {
            deviceId: item.deviceId,
            vendorName: item.vendorName,
            lat: item.lastLat || 0,
            lng: item.lastLng || 0,
            speed: item.lastSpeed || 0,
            heading: 0,
            timestamp: typeof item.lastUpdateTimestamp === 'string'
              ? new Date(item.lastUpdateTimestamp.endsWith('Z') ? item.lastUpdateTimestamp.slice(0, -1) : item.lastUpdateTimestamp).getTime()
              : (item.lastUpdateTimestamp || Date.now()),
            vehiculo: item.vehiculo,
            isOnline: item.isOnline,
            vendorId: item.vendorId,
            battery: item.nivel_bateria ?? item.battery,
            stoppedSince: typeof item.stoppedSince === 'string'
              ? new Date(item.stoppedSince.endsWith('Z') ? item.stoppedSince.slice(0, -1) : item.stoppedSince).getTime()
              : item.stoppedSince,
          };
          if (item.lastLat === null || item.lastLng === null) {
            (initialDevices[item.deviceId] as MobileDeviceUpdate & { _noLocation?: boolean })._noLocation = true;
          }
        });

        setDevices(initialDevices);
      } catch (error) {
        setCatalogError(error instanceof Error ? error.message : 'Error desconocido al cargar catálogo');
      } finally {
        setIsLoadingCatalog(false);
      }
    };

    fetchCatalog();
  }, []);

  useEffect(() => {
    const env = import.meta.env as Record<string, string | undefined>;
    const SOCKET_URL = env.SQL_API_URL?.replace('/api', '') || 'http://200.94.8.242:3001';

    const socketInstance = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log(`[WebSocket] Conectado a ${SOCKET_URL}`);
      socketInstance.emit('join_dashboards');
    });

    socketInstance.on('disconnect', (reason: Socket.DisconnectReason) => {
      setIsConnected(false);
      console.log(`[WebSocket] Desconectado: ${reason}`);
    });

    socketInstance.on('connect_error', (error: Error) => {
      console.error('[WebSocket] Error de conexión:', error.message);
      setIsConnected(false);
    });

    socketInstance.on('dashboard_update', (update: MobileDeviceUpdate & Record<string, unknown>) => {
      const fixedUpdate: MobileDeviceUpdate = {
        ...update,
        battery: (update.nivel_bateria as number | undefined) ?? update.battery,
        timestamp: typeof update.timestamp === 'string'
          ? new Date((update.timestamp as string).endsWith('Z') ? (update.timestamp as string).slice(0, -1) : (update.timestamp as string)).getTime()
          : update.timestamp
      };

      if (update.stoppedSince && typeof (update.stoppedSince as unknown) === 'string') {
        const stoppedSinceStr = update.stoppedSince as unknown as string;
        fixedUpdate.stoppedSince = new Date(stoppedSinceStr.endsWith('Z') ? stoppedSinceStr.slice(0, -1) : stoppedSinceStr).getTime();
      }

      handleDeviceUpdate(fixedUpdate);
    });

    return () => {
      socketInstance.off('connect');
      socketInstance.off('disconnect');
      socketInstance.off('connect_error');
      socketInstance.off('dashboard_update');
      socketInstance.disconnect();
    };
  }, [handleDeviceUpdate, refreshTrigger]);

  return {
    socket,
    isConnected,
    devices,
    isLoadingCatalog,
    catalogError,
    forceRefresh,
  };
}
