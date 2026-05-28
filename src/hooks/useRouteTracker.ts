/**
 * Hook Declarativo para la visualizacion de rutas
 * Ahora reacciona estrictamente a los argumentos (Sparse URLs)
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ProcessedTripV1,
  RutaResumen,
  FechaDisponible,
} from '../types/route.types';
import type { AppError } from '../utils/appError';
import { toAppErrorSync } from '../utils/appError';
import {
  fetchAvailableDates,
  fetchRoutesSummary,
  fetchRouteDetail,
  uploadExcelRoute,
} from '../services/apiRutas';

type RouteMode = 'database' | 'excel';

type RouteLoadingState = {
  dates: boolean;
  routesSummary: boolean;
  routeDetail: boolean;
  excel: boolean;
};

type RouteErrorState = {
  dates: AppError | null;
  routesSummary: AppError | null;
  routeDetail: AppError | null;
  excel: AppError | null;
};

interface UseRouteTrackerParams {
  mode: RouteMode;
  fecha: string;
  vendedor: string;
  idRuta: number | null;
  minStopDuration: number;
}

interface UseRouteTrackerReturn {
  loading: RouteLoadingState;
  errors: RouteErrorState;
  availableDates: FechaDisponible[];
  routesSummary: RutaResumen[];
  tripData: ProcessedTripV1 | null;
  processExcel: (file: File, minStopDuration: number) => Promise<void>;
  clearData: () => void;
  retryDetail: () => void;
}

const normalizeQueryError = (err: unknown): AppError | null => {
  const appError = toAppErrorSync(err, {
    title: 'Error inesperado',
    message: 'Ocurrio un error inesperado.',
  });

  if (appError.code === 'ABORTED') return null;
  return appError;
};

export function useRouteTracker({
  mode,
  fecha,
  vendedor,
  idRuta,
  minStopDuration,
}: UseRouteTrackerParams): UseRouteTrackerReturn {
  // Estado efímero único para retener el binario del Excel procesado
  const [excelTripData, setExcelTripData] = useState<ProcessedTripV1 | null>(null);

  // 1. Available Dates
  const datesQuery = useQuery({
    queryKey: ['availableDates'],
    queryFn: ({ signal }) => fetchAvailableDates(signal),
    enabled: mode === 'database',
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  // 2. Routes Summary
  const routesSummaryQuery = useQuery({
    queryKey: ['routesSummary', fecha, vendedor || null],
    queryFn: ({ signal }) =>
      fetchRoutesSummary(fecha, vendedor || undefined, undefined, signal),
    enabled: mode === 'database' && !!fecha,
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
  });

  // 3. Route Detail
  const routeDetailQuery = useQuery({
    queryKey: ['routeDetail', idRuta, minStopDuration],
    queryFn: ({ signal }) =>
      fetchRouteDetail(idRuta!, minStopDuration, true, signal),
    enabled: mode === 'database' && !!idRuta,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // 4. Excel Upload (Mutación)
  const excelMutation = useMutation({
    mutationFn: ({ file, minStopDuration }: { file: File; minStopDuration: number }) =>
      uploadExcelRoute(file, minStopDuration, true),
    onSuccess: (data) => {
      setExcelTripData(data);
    },
  });

  const processExcel = useCallback(
    async (file: File, minStopDuration: number): Promise<void> => {
      await excelMutation.mutateAsync({ file, minStopDuration });
    },
    [excelMutation]
  );

  const clearData = useCallback((): void => {
    setExcelTripData(null);
    excelMutation.reset();
  }, [excelMutation]);

  const retryDetail = useCallback(() => {
    routeDetailQuery.refetch();
  }, [routeDetailQuery]);

  const availableDates = datesQuery.data ?? [];
  const routesSummary = routesSummaryQuery.data?.items ?? [];
  const tripData = mode === 'excel' ? excelTripData : (routeDetailQuery.data ?? null);

  const errors = useMemo<RouteErrorState>(
    () => ({
      dates: datesQuery.error ? normalizeQueryError(datesQuery.error) : null,
      routesSummary: routesSummaryQuery.error
        ? normalizeQueryError(routesSummaryQuery.error)
        : null,
      routeDetail: routeDetailQuery.error
        ? normalizeQueryError(routeDetailQuery.error)
        : null,
      excel: excelMutation.error ? normalizeQueryError(excelMutation.error) : null,
    }),
    [
      datesQuery.error,
      routesSummaryQuery.error,
      routeDetailQuery.error,
      excelMutation.error,
    ]
  );

  const loading: RouteLoadingState = {
    dates: datesQuery.isFetching,
    routesSummary: routesSummaryQuery.isFetching,
    routeDetail: routeDetailQuery.isFetching,
    excel: excelMutation.isPending,
  };

  return {
    loading,
    errors,
    availableDates,
    routesSummary,
    tripData,
    processExcel,
    clearData,
    retryDetail,
  };
}
