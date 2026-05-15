/**
 * Tipos centrales para el sistema de visualización de rutas
 * Contrato estricto con el backend SQL Server
 */

/**
 * Punto en la trayectoria de la ruta
 */
export interface PathPoint {
  lat: number;
  lng: number;
  time: string;
  speed: number;
  odo: number;
}

/**
 * Evento registrado durante el viaje
 */
export interface TripEvent {
  id: string;
  rawIndex: number;
  time: string;
  description: string;
  speed: number;
  lat: number;
  lng: number;
  odo: number;
}

/**
 * Bandera/marcador de eventos importantes (inicio, fin, parada)
 */
export interface TripFlag {
  type: 'trip_start' | 'trip_end' | 'stop';
  lat: number;
  lng: number;
  time: string;
  duration?: number;
  durationMin?: number;
  source: string;
  clientKey: string | null;
  clientName: string | null;
  clientBranchNumber: string | null;
  clientBranchName: string | null;
  isVendorHome: boolean;
  description?: string;
  stopNumber?: number;
}

/**
 * Resumen de análisis del viaje
 */
export interface TripSummary {
  totalDistanceKm: number;
  totalDistanceMeters: number;
  workStartTime: string;
  workEndTime: string;
  isTripOngoing: boolean;
  processingMethod: string;
}

/**
 * Estadisticas calculadas para el reporte y el resumen de la ruta
 */
export interface RouteSummaryStats {
  timeWithClients: number;
  timeWithNonClients: number;
  travelTime: number;
  timeAtHome: number;
  timeAtTools: number;
  timeWithClientsAfterHours: number;
  timeWithNonClientsAfterHours: number;
  travelTimeAfterHours: number;
  timeAtHomeAfterHours: number;
  timeAtToolsAfterHours: number;
  totalWorkingTime: number;
  totalAfterHoursTime: number;
  totalTimeWithNonClients: number;
  totalTimeWithNonClientsAfterHours: number;
  percentageClients: number;
  percentageNonClients: number;
  percentageTravel: number;
  percentageAtHome: number;
  percentageAtTools: number;
  percentageTotalNonClients: number;
  distanceWithinHours: number;
  distanceAfterHours: number;
  uniqueClientsVisited: number;
}

/**
 * Cliente visitado en la ruta
 */
export interface RouteClient {
  clientKey: string;
  clientName: string;
  clientBranchNumber: string;
  clientBranchName: string;
  latitude: number;
  longitude: number;
  visitTime: string | null;
  durationMin: number;
  key?: string;
  name?: string;
  branchNumber?: string;
  branchName?: string;
  lat?: number;
  lng?: number;
  isEmpleadoTME?: boolean;
  isVendorHome?: boolean;
  commercialName?: string;
}

/**
 * Viaje analítico procesado (v1)
 */
export interface AnalyticTrip {
  idRuta: number | null;
  fecha: string;
  vendedor: string;
  nombreVendedor: string;
  vehiculo: string;
  descripcion: string;
  events: TripEvent[];
  path: PathPoint[];
  flags: TripFlag[];
  summary: TripSummary;
  clients: RouteClient[];
}

/**
 * Ruta procesada v1 - Respuesta principal del backend
 */
export interface ProcessedTripV1 {
  idRuta: number | null;
  fecha: string;
  vendedor: string;
  nombreVendedor: string;
  vehiculo: string;
  descripcion: string;
  events: TripEvent[];
  path: PathPoint[];
  flags: TripFlag[];
  viajesAnaliticos: AnalyticTrip[];
  summary: TripSummary;
  clients: RouteClient[];
  source: string;
}

/**
 * Resumen de ruta para listado
 */
export interface RutaResumen {
  id_ruta: number;
  fecha: string;
  vendedor: string;
  nombreVendedor: string;
  placa: string;
  vehiculo: string;
  viajesCount: number;
}

/**
 * Fecha disponible con conteo de rutas
 */
export interface FechaDisponible {
  fecha: string;
  totalRutas: number;
}

/**
 * Respuesta paginada de resumen de rutas
 */
export interface RutasResumenResponse {
  items: RutaResumen[];
  total?: number;
  page?: number;
  limit?: number;
}
