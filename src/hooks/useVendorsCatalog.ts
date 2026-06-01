import { useQuery } from '@tanstack/react-query';
import { fetchVendedoresCatalog } from '../services/apiBehavior';

/**
 * Hook para obtener el catálogo de vendedores.
 * Caché de larga duración (12 horas) ya que es un catálogo estático.
 */
export function useVendorsCatalog() {
  return useQuery({
    queryKey: ['vendorsCatalog', 'v2'],
    queryFn: ({ signal }) => fetchVendedoresCatalog(signal),
    staleTime: 1000 * 60 * 60 * 12, // 12 horas
    gcTime: 1000 * 60 * 60 * 12, // 12 horas
    retry: 1,
  });
}
