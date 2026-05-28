import React, { useState, useRef, useEffect } from 'react';
import { useClients } from '../../context/ClientContext';
import InteractiveMap from '../../components/InteractiveMap';
import { useRouteTracker } from '../../hooks/useRouteTracker';
import { downloadExcelReport } from '../../utils/reportUtils';
import VehicleTrackerHeader from './components/Header';
import VehicleTrackerSidebar from './components/Sidebar';
import VehicleTrackerEmptyState from './components/EmptyState';
import VehicleTrackerErrorState from '../../components/ErrorState';
import { useVehicleClients } from './hooks/useVehicleClients';
import { useVehicleStats } from './hooks/useVehicleStats';
import { useMapExport } from './hooks/useMapExport';
import { useGlobalUI } from '../../context/globalUIStore';
import LoadingLayer from '../../components/LoadingLayer';
import { useViewQueryParams } from '../../hooks/useViewQueryParams';

export default function VehicleTracker() {
  const { params, updateParams } = useViewQueryParams({
    mode: 'database',
    fecha: '',
    vendedor: '',
    idRuta: '',
    minStopDuration: '5',
    clientRadius: '50',
    selectionMode: 'vendor',
    selectionValue: '',
  });

  const mode = params.mode as 'database' | 'excel';
  const idRuta = params.idRuta ? Number(params.idRuta) : null;
  const minStopDuration = Number(params.minStopDuration) || 5;
  const clientRadius = Number(params.clientRadius) || 50;
  const fecha = params.fecha;
  const vendedor = params.vendedor;

  const {
    loading,
    errors,
    availableDates,
    routesSummary,
    tripData,
    processExcel,
    clearData,
    retryDetail,
  } = useRouteTracker({
    mode,
    fecha,
    vendedor,
    idRuta,
    minStopDuration,
  });

  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY || '';
  const { showError } = useGlobalUI();

  const {
    availableVendors,
    selection,
    clientData,
    databaseClientsAsClients,
    mapClients,
    enrichedTripData,
    matchedStopsCount,
  } = useVehicleClients({
    mode,
    tripData,
    masterClients,
    clientRadius,
    minStopDuration,
    selectionMode: (params.selectionMode as 'vendor' | 'driver') || 'vendor',
    selectionValue: params.selectionValue || null,
  });

  useEffect(() => {
    if (errors.dates) {
      showError(errors.dates);
    }
  }, [errors.dates, showError]);

  useEffect(() => {
    if (errors.routesSummary) {
      showError(errors.routesSummary);
    }
  }, [errors.routesSummary, showError]);

  useEffect(() => {
    if (errors.excel) {
      showError(errors.excel);
    }
  }, [errors.excel, showError]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    try {
      await processExcel(file, minStopDuration);
      updateParams({ mode: 'excel', fecha: '', idRuta: '' });
    } catch (err: unknown) {
      console.error('Error al subir Excel:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const summaryStats = useVehicleStats(
    enrichedTripData,
    minStopDuration,
    matchedStopsCount
  );

  const handleDownloadReport = () => {
    downloadExcelReport({
      tripData: enrichedTripData,
      mode,
      databaseClientsAsClients,
      selection,
      masterClients,
      clientData,
      minStopDuration,
      summaryStats,
      setIsGeneratingReport,
    });
  };

  const { downloadMap, openMapInTab } = useMapExport({
    enrichedTripData,
    mapClients,
    matchedStopsCount,
    selectionValue: selection.value,
    minStopDuration,
    googleMapsApiKey,
    summaryStats,
    onError: showError,
  });

  const handleClearAll = () => {
    clearData();
    setUploadedFileName(null);
    updateParams({ mode: 'database', fecha: '', idRuta: '' });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA] relative font-sans text-gray-900">
      <VehicleTrackerSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        isLoadingClients={isLoadingClients}
        hasClients={Boolean(masterClients && masterClients.length > 0)}
        onRefreshClients={() => refreshClients(true)}
        onClearAll={handleClearAll}
        uploadedFileName={uploadedFileName}
        availableDates={availableDates}
        loadingDates={loading.dates}
        loadingRoutesSummary={loading.routesSummary}
        loadingRouteDetail={loading.routeDetail}
        loadingExcel={loading.excel}
        errors={errors}
        routesSummary={routesSummary}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        availableVendors={availableVendors}
        selection={selection}
        hasTripData={Boolean(enrichedTripData)}
        params={params}
        updateParams={updateParams}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <VehicleTrackerHeader
          tripData={enrichedTripData}
          isGeneratingReport={isGeneratingReport}
          onDownloadReport={handleDownloadReport}
          onOpenMapInTab={openMapInTab}
          onDownloadMap={downloadMap}
        />

        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {errors.routeDetail && !loading.routeDetail ? (
            <VehicleTrackerErrorState
              error={errors.routeDetail}
              onRetry={retryDetail}
              isRetrying={loading.routeDetail}
            />
          ) : enrichedTripData ? (
            <InteractiveMap
              key={`${enrichedTripData.idRuta}-${enrichedTripData.fecha}`}
              tripData={enrichedTripData}
              vehicleInfo={{
                descripcion: enrichedTripData.descripcion,
                vehiculo: enrichedTripData.vehiculo,
                placa: enrichedTripData.vehiculo,
                fecha: enrichedTripData.fecha,
              }}
              clientData={
                mode === 'database'
                  ? databaseClientsAsClients
                  : selection.mode === 'driver'
                    ? []
                    : clientData
              }
              minStopDuration={minStopDuration}
              selection={
                enrichedTripData.nombreVendedor || selection.value || 'S_V'
              }
              summaryStats={summaryStats}
              googleMapsApiKey={googleMapsApiKey}
            />
          ) : loading.routeDetail || loading.excel ? (
            <div className="w-full h-full relative bg-gray-50">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <h3 className="text-gray-900 font-bold text-[16px] tracking-tight">
                    Cargando ruta
                  </h3>
                  <p className="text-gray-500 text-[13px] mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Estamos preparando la visualización y los marcadores.
                  </p>
                </div>
              </div>
              <LoadingLayer
                variant="absolute"
                spinnerSizeClass="w-12 h-12"
                spinnerClassName="text-blue-600"
              />
            </div>
          ) : (
            <VehicleTrackerEmptyState />
          )}

          {(loading.routeDetail || loading.excel) && (
            <LoadingLayer
              variant="absolute"
              spinnerSizeClass="w-12 h-12"
              spinnerClassName="text-blue-600"
            />
          )}
        </div>
      </main>
    </div>
  );
}
