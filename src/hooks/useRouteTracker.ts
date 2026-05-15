/**
 * Hook Orquestador para la visualizacion de rutas
 * Ahora delega cache, retries y cancelacion a React Query (TanStack)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProcessedTripV1,
  RutaResumen,
  FechaDisponible,
  RutasResumenResponse,
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

type SummaryRequest = { fecha: string; vendedor?: string };
type DetailRequest = { idRuta: number; minStopDuration: number };

interface UseRouteTrackerReturn {
  mode: RouteMode;
  setMode: React.Dispatch<React.SetStateAction<RouteMode>>;
  loading: RouteLoadingState;
  errors: RouteErrorState;
  availableDates: FechaDisponible[];
  setAvailableDates: React.Dispatch<React.SetStateAction<FechaDisponible[]>>;
  selectedDate: string | null;
  setSelectedDate: React.Dispatch<React.SetStateAction<string | null>>;
  routesSummary: RutaResumen[];
  setRoutesSummary: React.Dispatch<React.SetStateAction<RutaResumen[]>>;
  selectedRouteId: number | null;
  setSelectedRouteId: React.Dispatch<React.SetStateAction<number | null>>;
  tripData: ProcessedTripV1 | null;
  setTripData: React.Dispatch<React.SetStateAction<ProcessedTripV1 | null>>;
  lastSummaryRequest: SummaryRequest | null;
  lastDetailRequest: DetailRequest | null;
  loadAvailableDates: () => Promise<void>;
  loadRoutesSummary: (fecha: string, vendedor?: string) => Promise<void>;
  loadRouteDetail: (idRuta: number, minStopDuration: number) => Promise<void>;
  processExcel: (file: File, minStopDuration: number) => Promise<void>;
  clearError: (scope: keyof RouteErrorState) => void;
  clearData: () => void;
}

const normalizeQueryError = (err: unknown): AppError | null => {
  const appError = toAppErrorSync(err, {
    title: 'Error inesperado',
    message: 'Ocurrio un error inesperado.',
  });

  if (appError.code === 'ABORTED') return null;
  return appError;
};

export function useRouteTracker(): UseRouteTrackerReturn {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<RouteMode>('database');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [lastSummaryRequest, setLastSummaryRequest] =
    useState<SummaryRequest | null>(null);
  const [lastDetailRequest, setLastDetailRequest] =
    useState<DetailRequest | null>(null);
  const [excelTripData, setExcelTripData] = useState<ProcessedTripV1 | null>(
    null
  );

  const datesQuery = useQuery({
    queryKey: ['availableDates'],
    queryFn: ({ signal }) => fetchAvailableDates(signal),
    enabled: mode === 'database',
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const routesSummaryQuery = useQuery({
    queryKey: [
      'routesSummary',
      lastSummaryRequest?.fecha ?? null,
      lastSummaryRequest?.vendedor ?? null,
    ],
    queryFn: ({ signal }) =>
      fetchRoutesSummary(
        lastSummaryRequest!.fecha,
        lastSummaryRequest!.vendedor,
        undefined,
        signal
      ),
    enabled: mode === 'database' && !!lastSummaryRequest,
    staleTime: 2 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
  });

  const routeDetailQuery = useQuery({
    queryKey: [
      'routeDetail',
      lastDetailRequest?.idRuta ?? null,
      lastDetailRequest?.minStopDuration ?? null,
    ],
    queryFn: ({ signal }) =>
      fetchRouteDetail(
        lastDetailRequest!.idRuta,
        lastDetailRequest!.minStopDuration,
        true,
        signal
      ),
    enabled: mode === 'database' && !!lastDetailRequest,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const excelMutation = useMutation({
    mutationFn: ({
      file,
      minStopDuration,
    }: {
      file: File;
      minStopDuration: number;
    }) => uploadExcelRoute(file, minStopDuration, true),
    onSuccess: (data) => {
      setExcelTripData(data);
      setMode('excel');
      setSelectedDate(null);
      setSelectedRouteId(null);
      setLastDetailRequest(null);
    },
  });

  useEffect(() => {
    if (mode === 'database') {
      setExcelTripData(null);
    }
  }, [mode]);

  const loadAvailableDates = useCallback(async (): Promise<void> => {
    await datesQuery.refetch();
  }, [datesQuery]);

  const loadRoutesSummary = useCallback(
    async (fecha: string, vendedor?: string): Promise<void> => {
      const vendedorKey = vendedor ?? null;
      setMode('database');
      setSelectedDate(fecha);
      setSelectedRouteId(null);
      setLastDetailRequest(null);
      setLastSummaryRequest({ fecha, vendedor });

      await queryClient.fetchQuery({
        queryKey: ['routesSummary', fecha, vendedorKey],
        queryFn: ({ signal }) =>
          fetchRoutesSummary(fecha, vendedor, undefined, signal),
        staleTime: 2 * 60 * 1000,
      });
    },
    [queryClient]
  );

  const loadRouteDetail = useCallback(
    async (idRuta: number, minStopDuration: number): Promise<void> => {
      setMode('database');
      setSelectedRouteId(idRuta);
      setLastDetailRequest({ idRuta, minStopDuration });

      await queryClient.fetchQuery({
        queryKey: ['routeDetail', idRuta, minStopDuration],
        queryFn: ({ signal }) =>
          fetchRouteDetail(idRuta, minStopDuration, true, signal),
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient]
  );

  const processExcel = useCallback(
    async (file: File, minStopDuration: number): Promise<void> => {
      await excelMutation.mutateAsync({ file, minStopDuration });
    },
    [excelMutation]
  );

  const availableDates = datesQuery.data ?? [];
  const routesSummary = routesSummaryQuery.data?.items ?? [];
  const tripData =
    mode === 'excel' ? excelTripData : (routeDetailQuery.data ?? null);

  const errors = useMemo<RouteErrorState>(
    () => ({
      dates: datesQuery.error ? normalizeQueryError(datesQuery.error) : null,
      routesSummary: routesSummaryQuery.error
        ? normalizeQueryError(routesSummaryQuery.error)
        : null,
      routeDetail: routeDetailQuery.error
        ? normalizeQueryError(routeDetailQuery.error)
        : null,
      excel: excelMutation.error
        ? normalizeQueryError(excelMutation.error)
        : null,
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

  const setAvailableDates = useCallback(
    (value: React.SetStateAction<FechaDisponible[]>) => {
      const nextValue =
        typeof value === 'function'
          ? (value as (prev: FechaDisponible[]) => FechaDisponible[])(
              queryClient.getQueryData<FechaDisponible[]>(['availableDates']) ||
                []
            )
          : value;
      queryClient.setQueryData(['availableDates'], nextValue);
    },
    [queryClient]
  );

  const setRoutesSummary = useCallback(
    (value: React.SetStateAction<RutaResumen[]>) => {
      if (!lastSummaryRequest) return;
      const key: [string, string, string | null] = [
        'routesSummary',
        lastSummaryRequest.fecha,
        lastSummaryRequest.vendedor ?? null,
      ];
      const current =
        queryClient.getQueryData<RutasResumenResponse>(key)?.items || [];
      const nextValue =
        typeof value === 'function'
          ? (value as (prev: RutaResumen[]) => RutaResumen[])(current)
          : value;
      queryClient.setQueryData<RutasResumenResponse>(key, {
        items: nextValue,
      });
    },
    [lastSummaryRequest, queryClient]
  );

  const setTripData = useCallback(
    (value: React.SetStateAction<ProcessedTripV1 | null>) => {
      const resolveValue =
        typeof value === 'function'
          ? (value as (prev: ProcessedTripV1 | null) => ProcessedTripV1 | null)
          : value;

      const nextValue =
        typeof resolveValue === 'function'
          ? resolveValue(tripData)
          : resolveValue;

      if (mode === 'excel') {
        setExcelTripData(nextValue);
        return;
      }

      if (!lastDetailRequest) return;
      queryClient.setQueryData(
        [
          'routeDetail',
          lastDetailRequest.idRuta,
          lastDetailRequest.minStopDuration,
        ],
        nextValue
      );
    },
    [lastDetailRequest, mode, queryClient, tripData]
  );

  const clearData = useCallback((): void => {
    setExcelTripData(null);
    setSelectedRouteId(null);
    setLastDetailRequest(null);
  }, []);

  const clearError = useCallback(
    (scope: keyof RouteErrorState) => {
      switch (scope) {
        case 'dates':
          queryClient.resetQueries({ queryKey: ['availableDates'] });
          break;
        case 'routesSummary':
          queryClient.resetQueries({ queryKey: ['routesSummary'] });
          break;
        case 'routeDetail':
          queryClient.resetQueries({ queryKey: ['routeDetail'] });
          break;
        case 'excel':
          excelMutation.reset();
          break;
      }
    },
    [excelMutation, queryClient]
  );

  return {
    mode,
    setMode,
    loading,
    errors,
    availableDates,
    setAvailableDates,
    selectedDate,
    setSelectedDate,
    routesSummary,
    setRoutesSummary,
    selectedRouteId,
    setSelectedRouteId,
    tripData,
    setTripData,
    lastSummaryRequest,
    lastDetailRequest,
    loadAvailableDates,
    loadRoutesSummary,
    loadRouteDetail,
    processExcel,
    clearError,
    clearData,
  };
}
