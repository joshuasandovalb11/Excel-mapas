import React, { useState, useRef, useEffect } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
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

export default function VehicleTracker() {
  const {
    mode,
    setMode,
    loading,
    errors,
    availableDates,
    selectedDate,
    setSelectedDate,
    routesSummary,
    loadRoutesSummary,
    selectedRouteId,
    loadRouteDetail,
    processExcel,
    tripData,
    clearData,
    loadAvailableDates,
    lastSummaryRequest,
    lastDetailRequest,
    clearError,
  } = useRouteTracker();

  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [minStopDuration, setMinStopDuration] = usePersistentState<number>(
    'vt_minStopDuration',
    5
  );
  const [clientRadius, setClientRadius] = usePersistentState<number>(
    'vt_clientRadius',
    50
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const googleMapsApiKey = import.meta.env.VITE_Maps_API_KEY || '';
  const { showError } = useGlobalUI();

  const {
    availableVendors,
    selection,
    handleSelection,
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
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA] relative font-sans text-gray-900">
      <VehicleTrackerSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        isLoadingClients={isLoadingClients}
        hasClients={Boolean(masterClients && masterClients.length > 0)}
        onRefreshClients={() => refreshClients(true)}
        mode={mode}
        setMode={setMode}
        clearData={handleClearAll}
        uploadedFileName={uploadedFileName}
        availableDates={availableDates}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        loadingDates={loading.dates}
        loadingRoutesSummary={loading.routesSummary}
        loadingRouteDetail={loading.routeDetail}
        loadingExcel={loading.excel}
        errors={errors}
        loadAvailableDates={loadAvailableDates}
        lastSummaryRequest={lastSummaryRequest}
        clearError={clearError}
        loadRoutesSummary={loadRoutesSummary}
        routesSummary={routesSummary}
        selectedRouteId={selectedRouteId}
        loadRouteDetail={loadRouteDetail}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        availableVendors={availableVendors}
        onSelection={handleSelection}
        selection={selection}
        minStopDuration={minStopDuration}
        setMinStopDuration={setMinStopDuration}
        clientRadius={clientRadius}
        setClientRadius={setClientRadius}
        hasTripData={Boolean(enrichedTripData)}
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
              onRetry={() =>
                lastDetailRequest &&
                loadRouteDetail(
                  lastDetailRequest.idRuta,
                  lastDetailRequest.minStopDuration
                )
              }
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
