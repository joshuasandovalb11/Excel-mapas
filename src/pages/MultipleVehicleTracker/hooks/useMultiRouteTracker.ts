import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  fetchAvailableDates, 
  fetchRoutesSummary, 
  fetchRoutesBatch, 
  uploadExcelBatch 
} from '../../../services/apiRutas';
import type { ProcessedTripV1 } from '../../../types/route.types';

export interface UseMultiRouteTrackerParams {
  mode: 'database' | 'excel';
  fecha: string;
  routeIds: number[];
  minStopDuration: number;
}

export function useMultiRouteTracker(params: UseMultiRouteTrackerParams) {
  const [excelTripData, setExcelTripData] = useState<ProcessedTripV1[]>([]);

  // 1. Fetch de Fechas Disponibles
  const availableDatesQuery = useQuery({
    queryKey: ['availableDates'],
    queryFn: ({ signal }) => fetchAvailableDates(signal),
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch del Catálogo de Rutas (Depende de la fecha)
  const routesSummaryQuery = useQuery({
    queryKey: ['routesSummary', params.fecha],
    queryFn: ({ signal }) => fetchRoutesSummary(params.fecha, undefined, undefined, signal),
    enabled: params.mode === 'database' && !!params.fecha,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Fetch Batch de Detalles de Rutas (Depende de IDs seleccionados)
  const routeBatchQuery = useQuery({
    queryKey: ['routeBatch', params.routeIds, params.minStopDuration],
    queryFn: ({ signal }) => fetchRoutesBatch(params.routeIds, params.minStopDuration, signal),
    enabled: params.mode === 'database' && params.routeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 4. Procesamiento de Excels
  const excelBatchMutation = useMutation({
    mutationFn: (files: File[]) => uploadExcelBatch(files, params.minStopDuration),
    onSuccess: (data) => {
      setExcelTripData(data);
    },
  });

  const processMultipleExcels = (files: File[]) => {
    excelBatchMutation.mutate(files);
  };

  const clearExcelData = () => {
    setExcelTripData([]);
  };
  
  const retryBatch = () => {
    routeBatchQuery.refetch();
  };

  // 5. Determinar la fuente de verdad consolidada
  const combinedTripData = params.mode === 'database' 
    ? (routeBatchQuery.data || []) 
    : excelTripData;

  return {
    loading: {
      dates: availableDatesQuery.isFetching,
      summary: routesSummaryQuery.isFetching,
      detail: routeBatchQuery.isFetching,
      excel: excelBatchMutation.isPending,
    },
    errors: {
      dates: availableDatesQuery.error,
      summary: routesSummaryQuery.error,
      detail: routeBatchQuery.error,
      excel: excelBatchMutation.error,
    },
    availableDates: availableDatesQuery.data || [],
    routesSummary: routesSummaryQuery.data?.items || [],
    combinedTripData,
    processMultipleExcels,
    clearExcelData,
    retryBatch
  };
}
