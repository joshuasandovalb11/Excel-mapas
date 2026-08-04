import { Radio, Smartphone, Crosshair, RefreshCw } from 'lucide-react';
import type { MobileDeviceUpdate } from '../../../types/realtime.types';
import { useEffect, useState } from 'react';

interface RealTimeSidebarProps {
  devices: Record<string, MobileDeviceUpdate>;
  isConnected: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  lockedDeviceId: string | null;
  setLockedDeviceId: React.Dispatch<React.SetStateAction<string | null>>;
  forceRefresh: () => void;
}

export default function RealTimeSidebar({ devices, sidebarCollapsed, setSidebarCollapsed, lockedDeviceId, setLockedDeviceId, forceRefresh }: RealTimeSidebarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const deviceList = Object.values(devices).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <aside
      className={`${sidebarCollapsed ? 'w-[60px] 2xl:w-16' : 'w-[280px] 2xl:w-80'
        } bg-white border-r border-gray-200 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 flex flex-col relative z-20`}
    >
      {/* Header */}
      <div className="h-12 2xl:h-14 flex items-center justify-between px-3 2xl:px-4 border-b border-gray-200 bg-white">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1 2xl:p-1.5 bg-blue-600 rounded-md shadow-sm">
              <Radio className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
            </div>
            <h1 className="text-[13px] 2xl:text-[15px] font-semibold tracking-tight text-gray-900">
              Tiempo Real
            </h1>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 2xl:p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
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
      </div>

      {/* Lista de Dispositivos */}
      {!sidebarCollapsed && (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FAFAFA] p-3 2xl:p-4 space-y-2">
          {deviceList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
              <Radio className="w-8 h-8 opacity-50" />
              <p className="text-sm font-medium">Esperando datos...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 2xl:mb-2.5">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Dispositivos
                  </h4>
                  <span className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    ({deviceList.length})
                  </span>
                </div>
                <button
                  onClick={forceRefresh}
                  className="text-gray-400 hover:text-blue-500 p-1 rounded-md hover:bg-blue-50 transition-colors"
                  title="Forzar actualización de datos"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {deviceList.map((device) => {
                const isOnline = device.isOnline ?? false;
                const isLocked = lockedDeviceId === device.deviceId;
                const stateBadgeColor = isOnline ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500';
                const stateText = isOnline ? 'En línea' : 'Desconectado';

                const displayName = device.vendorId
                  ? `(${device.vendorId}) ${device.vendorName || 'Desconocido'}`
                  : (device.vendorName || device.deviceId);

                return (

                  <div
                    key={device.deviceId}
                    className={`bg-white border p-2.5 shadow-sm transition-all ${isLocked ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:shadow-md'
                      } ${!isOnline ? 'opacity-70' : 'opacity-100'}`}
                  >
                    <div className="flex justify-between text-center items-center">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${stateBadgeColor}`}>
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-xs font-bold text-gray-900 truncate max-w-[140px]" title={displayName}>
                              {displayName}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
                            <p className="text-[10px] font-medium text-gray-500">
                              {stateText}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setLockedDeviceId(isLocked ? null : device.deviceId)}
                          className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-[11px] font-medium transition-colors ${isLocked
                            ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          {isLocked ? 'Desenfocar' : 'Enfocar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {sidebarCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 2xl:space-y-6 py-6 2xl:py-8">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 2xl:p-3 py-16 2xl:py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
            title="Expandir panel"
          >
            <Radio className="w-5 h-5 2xl:w-6 2xl:h-6 animate-bounce" />
          </button>
        </div>
      )}
    </aside>
  );
}
