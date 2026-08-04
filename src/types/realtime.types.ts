export interface MobileDeviceUpdate {
  deviceId: string;       // ID único del dispositivo/celular
  lat: number;            // Latitud
  lng: number;            // Longitud
  speed: number;          // Velocidad en km/h
  heading: number;        // Rumbo/Dirección en grados
  timestamp: number;      // Marca de tiempo del evento (Unix Epoch)
  vendorName?: string;    // Nombre del vendedor asignado
  vendorId?: string;      // ID del vendedor (ej. TEST)
  vehiculo?: string;      // Modelo del dispositivo (celular)
  isOnline?: boolean;     // Estado de conexión desde backend
  battery?: number;       // Nivel de batería (0-100)
  stoppedSince?: number;  // Timestamp de cuándo se detuvo (para calcular tiempo detenido real)
}
