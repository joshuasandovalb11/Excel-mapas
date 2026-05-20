import { useQuery } from '@tanstack/react-query';
import { fetchBehaviorAnalytics, type FetchBehaviorParams } from '../../../services/apiBehavior';

/**
 * Hook para obtener el análisis de comportamiento basado en filtros.
 * Se habilita solo cuando los parámetros están presentes.
 */
export function useBehaviorData(params: FetchBehaviorParams | null) {
  return useQuery({
    queryKey: [
      'behaviorAnalytics',
      params?.vendedor,
      params?.startDate,
      params?.endDate,
      params?.minStopDuration,
    ],
    queryFn: ({ signal }) => {
      if (!params) throw new Error('Parámetros requeridos para la consulta');
      return fetchBehaviorAnalytics(params, signal);
    },
    enabled: !!params && !!params.vendedor && !!params.startDate && !!params.endDate,
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: 1,
  });
}
