import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(
        `Error al leer del sessionStorage para la clave "${key}":`,
        error
      );
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const valueToStore = JSON.stringify(storedValue);
      window.sessionStorage.setItem(key, valueToStore);
    } catch (error) {
      console.error(
        `Error al guardar en el sessionStorage para la clave "${key}":`,
        error
      );
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
