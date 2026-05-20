# Source Directory: Frontend Guidelines

Este archivo contiene instrucciones específicas para el desarrollo dentro de la carpeta `src/`.

## Component Development

- **Functional Components:** Todos los componentes deben ser funciones declaradas con `export default function ComponentName()`.
- **Props:** Definir interfaces para las props de los componentes.
- **Styling:** Usar clases de Tailwind CSS. Seguir el patrón de diseño ya establecido (ej. sombras, bordes redondeados, colores azules para acentos).
- **Icons:**
  - `lucide-react`: Para botones, navegación y UI general.
  - `FontAwesomeIcon`: Exclusivamente para elementos dentro del mapa si ya se están usando allí.

## Hooks & State

- **Custom Hooks:** Extraer la lógica compleja de los componentes a hooks en `src/hooks/`.
- **React Query:**
  - Usar `useQuery` para obtener datos.
  - Usar `useMutation` para acciones que modifican datos (ej. subir Excel).
  - Configurar `staleTime` y `gcTime` adecuadamente en `main.tsx` o localmente si es necesario.
- **Context:** Usar Context solo para estado global que realmente lo requiera (Auth, UI global, datos de cliente compartidos). Para todo lo demás, preferir React Query o props.

## Data Utilities

- **Processing:** La lógica de procesamiento de coordenadas, cálculos de distancia y formateo de datos de viaje debe residir en `src/utils/tripUtils.ts` o similares.
- **Mapping:** `src/utils/mapUtils.ts` y `src/utils/multiMapUtils.ts` contienen la lógica específica para la interacción con Google Maps.

## API Consumption

- No realizar llamadas a `fetch` directamente en los componentes.
- Usar las funciones exportadas en `src/services/`.
- Manejar errores usando el sistema de `AppError`.

## Testing & Validation

- Antes de finalizar un cambio, verificar que no rompa la visualización del mapa.
- Probar con diferentes duraciones de parada (`minStopDuration`) si se modifica la lógica de procesamiento de rutas.
