import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';

export function useIndexedDBState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    get(key).then((val) => {
      if (mounted) {
        if (val !== undefined) {
          setState(val);
        }
        setLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [key]);

  const setValue = (value: T | ((val: T) => T)) => {
    const valueToStore = value instanceof Function ? value(state) : value;

    setState(valueToStore);
    set(key, valueToStore).catch((err) =>
      console.warn('Error guardando en IndexedDB:', err)
    );
  };

  return [state, setValue, loaded] as const;
}
