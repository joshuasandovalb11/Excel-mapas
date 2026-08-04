import { X, Smartphone, Battery, Navigation, Clock, Activity } from 'lucide-react';
import type { MobileDeviceUpdate } from '../../../types/realtime.types';
import { useEffect, useState } from 'react';

interface DeviceOverlayInfoProps {
  device: MobileDeviceUpdate;
  onClose: () => void;
}

export default function DeviceOverlayInfo({ device, onClose }: DeviceOverlayInfoProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const displayName = device.vendorId
    ? `(${device.vendorId}) ${device.vendorName || 'Desconocido'}`
    : (device.vendorName || device.deviceId);

  let statusText = '';
  let statusColor = '';

  if (device.speed < 2) {
    if (device.stoppedSince) {
      const diffMs = Date.now() - device.stoppedSince;
      const clampedMs = Math.max(0, diffMs);
      const totalMins = Math.floor(clampedMs / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;

      const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
      statusText = `Detenido por ${timeStr}`;
    } else {
      statusText = 'Detenido';
    }
    statusColor = 'text-red-600 bg-red-50 ring-red-100';
  } else {
    statusText = 'En movimiento';
    statusColor = 'text-green-600 bg-green-50 ring-green-100';
  }

  const isOnline = device.isOnline ?? false;

  return (
    <div className="absolute top-1 right-1 z-50 w-72 bg-white/95 backdrop-blur-md shadow-2xl border border-white/40 overflow-hidden font-sans ring-1 ring-black/5 animate-in slide-in-from-right-8 fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-50 to-white px-4 py-3 border-b border-gray-100 flex items-start justify-between relative">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-full shadow-sm ${isOnline ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'}`}>
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[12px] 2xl:text-[14px] font-bold text-gray-900 leading-tight pr-4">
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-400'}`}></span>
              <span className="text-[9px] 2xl:text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                {isOnline ? 'En línea' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors absolute right-3 top-3"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Status Badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 shadow-sm ${statusColor}`}>
          <Activity className="w-3.5 h-3.5" />
          <span className="text-[11px] 2xl:text-[12px] font-semibold tracking-wider">{statusText}</span>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-100 rounded-xl p-2 2xl:p-3 border border-gray-100/50">
            <div className="flex items-center gap-1.5 mb-1 text-gray-500">
              <Navigation className="w-3.5 h-3.5" />
              <span className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider">Velocidad</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg 2xl:text-xl font-bold text-gray-900">{device.speed.toFixed(1)}</span>
              <span className="text-[10px] 2xl:text-[11px] font-medium text-gray-500">km/h</span>
            </div>
          </div>

          <div className="bg-gray-100 rounded-xl p-2 2xl:p-3 border border-gray-100/50">
            <div className="flex items-center gap-1.5 mb-1 text-gray-500">
              <Battery className="w-3.5 h-3.5" />
              <span className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider">Batería</span>
            </div>
            <div className="flex items-baseline gap-1">
              {device.battery !== undefined ? (
                <>
                  <span className={`text-lg 2xl:text-xl font-bold ${device.battery > 20 ? 'text-green-600' : 'text-red-600'}`}>
                    {device.battery}
                  </span>
                  <span className="text-[10px] 2xl:text-[11px] font-medium text-gray-500">%</span>
                </>
              ) : (
                <span className="text-[10px] 2xl:text-[11px] font-medium text-gray-400">N/A</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Smartphone className="w-3.5 h-3.5" />
            <span className="text-[10px] 2xl:text-[11px] font-medium">{device.vehiculo || 'Desconocido'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <p className="text-[10px] 2xl:text-[11px] font-medium">Actualización</p>
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] 2xl:text-[11px] font-medium">{new Date(device.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
