import { useSearchParams } from 'react-router-dom';
import { useMemo, useRef } from 'react';

// Tipado base
export type QueryParamsMap = Record<string, string>;

export function useViewQueryParams<T extends QueryParamsMap>(defaultParams: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Guardamos defaultParams en una ref para estabilizar dependencias
  const defaultsRef = useRef(defaultParams);

  // 1. DERIVACIÓN EN MEMORIA (No muta la URL)
  const params = useMemo(() => {
    const merged: Record<string, string> = {};
    const currentUrlParams = new URLSearchParams(searchParams);

    Object.entries(defaultsRef.current).forEach(([key, defaultValue]) => {
      // Si la URL lo tiene, manda la URL. Si no, inyectamos el valor por defecto en memoria.
      merged[key] = currentUrlParams.has(key) 
        ? currentUrlParams.get(key)! 
        : defaultValue;
    });

    return merged as T;
  }, [searchParams]);

  // 2. MUTACIÓN EXPLÍCITA (Mantiene la URL limpia)
  const updateParams = (newValues: Partial<T>, options?: { replace?: boolean }) => {
    const updatedSearchParams = new URLSearchParams(searchParams);
    
    Object.entries(newValues).forEach(([key, value]) => {
      const defaultValue = defaultsRef.current[key];
      const stringValue = String(value);
      
      // REGLA SPARSE URLs: Si el valor está vacío, es nulo, o es EXACTAMENTE
      // igual al valor por defecto, lo eliminamos de la URL.
      if (
        value === undefined || 
        value === null || 
        value === '' || 
        stringValue === defaultValue
      ) {
        updatedSearchParams.delete(key);
      } else {
        // Solo manchamos la URL si diverge del estado base
        updatedSearchParams.set(key, stringValue);
      }
    });

    setSearchParams(updatedSearchParams, { 
      replace: options?.replace ?? true 
    });
  };

  return {
    params,        // <- Los parámetros combinados para nutrir React Query
    updateParams,  // <- Función para que los componentes interactúen
    searchParams
  };
}
