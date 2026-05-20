# Project: Maps - Visualizador de Rutas

Este proyecto es una aplicación web para la visualización y seguimiento de rutas de vehículos, integrando datos de GPS con mapas interactivos de Google Maps.

## Architecture & Tech Stack

- **Frontend:** React 19 (TypeScript) + Vite.
- **Backend (BFF - Backend For Frontend):** Node.js (Express) alojado en `visualizador_rutas/`. No es un simple puente, es el motor principal de lógica.
- **Databases:** Conexión dual a SQL Server (`db_rutas` para telemetría y `db_remota_visualizador` para catálogos).
- **Styling:** Tailwind CSS v4 + Framer Motion para animaciones.
- **State Management:**
  - **Server State:** Persistencia en `IndexedDB` (para catálogos pesados con TTL de 24h) y `localStorage` (preferencias de usuario).
  - **Global UI State:** React Context (`src/context`).
- **Maps:** `@react-google-maps/api` para integración con Google Maps.

## Core Conventions & Business Logic

### Lógica de Negocio (Backend-First)

- **Cero Procesamiento Pesado en React:** El cálculo de distancias (Haversine), detección de paradas, normalización de horarios, recortes de "Fin de Viaje" y "Fuzzy Match" de la casa del vendedor se ejecutan EXCLUSIVAMENTE en `visualizador_rutas/services/ruta_mapper.js`.
- El Frontend debe confiar ciegamente en el payload estructurado (`ProcessedTripV1`) que envía el backend.

### Manejo de Errores (Fail-Fast)

- **Tolerancia a Fallos:** Si el backend pierde conexión con la BD remota de clientes, ABORTA la operación y devuelve un HTTP `503` estructurado.
- **Frontend Interceptor:** `src/services/apiRutas.ts` intercepta cualquier status `!response.ok`, lanza un `AppError` y evita que promesas fallidas se guarden en la persistencia local. Los errores se muestran mediante `ErrorState.tsx` o el `globalUIStore` (Toasts).

### Coding Style (Frontend)

- **Components:** Priorizar componentes funcionales con hooks.
- **Types:** TypeScript es obligatorio para todos los nuevos archivos (`src/types`).
- **Icons:** Preferir `lucide-react` para UI general y `FontAwesome` para marcadores dentro de Google Maps.

### File Structure

- `src/components`: UI components reutilizables.
- `src/hooks`: Lógica de negocio de la UI y estados persistentes.
- `src/services`: Capa de red (`apiRutas.ts`, `httpClient.ts`).
- `visualizador_rutas/services`: Orquestadores backend y Mappers (`ruta_mapper.js`).

## Workflows

- Iniciar servidor de desarrollo: `npm run dev`
- Iniciar backend de visualizador: `node visualizador_rutas/index.js`
- Linting: `npm run lint`

## Environment Variables

- `VITE_FIREBASE_API_KEY`, etc. (Ver `src/firebaseConfig.ts`).
- `VITE_Maps_API_KEY`: Clave de Google Maps.
- Variables SQL en el backend para las conexiones locales y remotas.
