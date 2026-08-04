import RealTimeSidebar from './components/RealTimeSidebar';
import MapComponent from './components/MapComponent';
import DeviceOverlayInfo from './components/DeviceOverlayInfo';
import { useRealTimeSocket } from '../../hooks/useRealTimeSocket';
import { useState } from 'react';
import LoadingLayer from '../../components/LoadingLayer';

export default function RealTimeTracker() {
  const { isConnected, devices, socket, isLoadingCatalog, catalogError, forceRefresh } = useRealTimeSocket();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lockedDeviceId, setLockedDeviceId] = useState<string | null>(null);

  return catalogError ? (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center p-6 bg-white rounded-xl shadow-sm border border-red-100 max-w-md">
        <div className="text-red-500 mb-3">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-[16px] font-bold text-gray-900 mb-1">Error de Conexión</h2>
        <p className="text-[13px] text-gray-500 leading-relaxed">{catalogError}</p>
      </div>
    </div>
  ) : (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA] relative font-sans">
      {isLoadingCatalog && (
        <div className="absolute inset-0 z-50 bg-white">
          <LoadingLayer variant="absolute" spinnerSizeClass="w-12 h-12" spinnerClassName="text-blue-600" />
        </div>
      )}

      <RealTimeSidebar
        devices={devices}
        isConnected={isConnected}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        lockedDeviceId={lockedDeviceId}
        setLockedDeviceId={setLockedDeviceId}
        forceRefresh={forceRefresh}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {!isLoadingCatalog && (
          <>
            <MapComponent 
              socket={socket} 
              lockedDeviceId={lockedDeviceId} 
              onUnlockDevice={() => setLockedDeviceId(null)} 
              onLockDevice={setLockedDeviceId}
              initialDevices={devices}
            />
            {lockedDeviceId && devices[lockedDeviceId] && (
               <DeviceOverlayInfo 
                  device={devices[lockedDeviceId]} 
                  onClose={() => setLockedDeviceId(null)} 
               />
            )}
          </>
        )}
      </main>
    </div>
  );
}
