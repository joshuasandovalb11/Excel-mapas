import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  fetchAvailableDates, 
  fetchRoutesSummary, 
  fetchRoutesBatch, 
  uploadExcelBatch 
} from '../../../services/apiRutas';
import type { ProcessedTripV1 } from '../../../types/route.types';
import type { AppError } from '../../../utils/appError';
import { toAppErrorSync } from '../../../utils/appError';

const normalizeQueryError = (err: unknown): AppError | null => {
  if (!err) return null;
  const appError = toAppErrorSync(err, {
    title: 'Error inesperado',
    message: 'Ocurrio un error inesperado.',
  });

  if (appError.code === 'ABORTED') return null;
  return appError;
};

export interface UseMultiRouteTrackerParams {
  mode: 'database' | 'excel';
  fecha: string;
  routeIds: number[];
  minStopDuration: number;
  sourceType?: 'camiones' | 'celulares';
}

export function useMultiRouteTracker(params: UseMultiRouteTrackerParams) {
  const [excelTripData, setExcelTripData] = useState<ProcessedTripV1[]>([]);

  // 1. Fetch de Fechas Disponibles
  const availableDatesQuery = useQuery({
    queryKey: ['availableDates', params.sourceType],
    queryFn: ({ signal }) => fetchAvailableDates(signal, params.sourceType),
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch del Catálogo de Rutas (Depende de la fecha)
  const routesSummaryQuery = useQuery({
    queryKey: ['routesSummary', params.fecha, params.sourceType],
    queryFn: ({ signal }) => fetchRoutesSummary(params.fecha, undefined, undefined, signal, params.sourceType),
    enabled: params.mode === 'database' && !!params.fecha,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Fetch Batch de Detalles de Rutas (Depende de IDs seleccionados)
  const routeBatchQuery = useQuery({
    queryKey: ['routeBatch', params.routeIds, params.minStopDuration, params.sourceType],
    queryFn: ({ signal }) => fetchRoutesBatch(params.routeIds, params.minStopDuration, signal, params.sourceType),
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
      dates: normalizeQueryError(availableDatesQuery.error),
      summary: normalizeQueryError(routesSummaryQuery.error),
      detail: normalizeQueryError(routeBatchQuery.error),
      excel: normalizeQueryError(excelBatchMutation.error),
    },
    availableDates: availableDatesQuery.data || [],
    routesSummary: routesSummaryQuery.data?.items || [],
    combinedTripData,
    processMultipleExcels,
    clearExcelData,
    retryBatch
  };
}
