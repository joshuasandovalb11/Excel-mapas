/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';

// INTERFACES
export interface TripEvent {
  id: number;
  time: string;
  description: string;
  speed: number;
  lat: number;
  lng: number;
}

export interface ProcessedTrip {
  events: TripEvent[];
  routes: Array<{
    path: Array<{ lat: number; lng: number }>;
  }>;
  flags: Array<{
    lat: number;
    lng: number;
    type: 'start' | 'stop' | 'end';
    time: string;
    description: string;
    duration?: number;
    stopNumber?: number;
    clientKey?: string;
    clientName?: string;
  }>;
  totalDistance: number; // en metros
  processingMethod: 'event-based' | 'speed-based';
}

export interface VehicleInfo {
  descripcion: string;
  vehiculo: string;
  placa: string;
  fecha: string;
}

// Interfaz de Cliente
export interface Client {
  key: string;
  name: string;
  lat: number;
  lng: number;
  vendor: string; 
}

// Estructura del resultado del procesamiento del archivo de clientes
export interface MasterClientData {
    clients: Client[];
    vendors: string[];
}


// FUNCIONES DE UTILIDAD

export const toTitleCase = (str: string): string => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Devuelve distancia en metros
};

const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2) return 0;
    const [hours, minutes] = parts;
    return hours * 60 + minutes;
};

export const formatDuration = (minutes: number): string => {
    if (minutes < 1) return "Menos de 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours} h ${mins} min`;
};

export const parseVehicleInfo = (worksheet: XLSX.WorkSheet, fileName: string): VehicleInfo => {
    const info: VehicleInfo = {
        descripcion: "No encontrado",
        vehiculo: "No encontrado",
        placa: "No encontrada",
        fecha: "No encontrada",
    };

    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const rowsToSearch = data.slice(0, 20); 

    for (const row of rowsToSearch) {
        if (!Array.isArray(row)) continue;

        for (let i = 0; i < row.length; i++) {
            const currentCellText = String(row[i] || '').trim().toLowerCase();
            if (!currentCellText) continue;

            const findNextValue = () => {
                for (let j = i + 1; j < row.length; j++) {
                    const nextValue = String(row[j] || '').trim();
                    if (nextValue) return nextValue; 
                }
                return null;
            };
            
            let value: string | null = null;

            if (currentCellText.includes('descripción de vehículo')) {
                value = findNextValue();
                if (value) info.descripcion = toTitleCase(value);
            } else if (currentCellText.includes('tipo de vehículo')) {
                value = findNextValue();
                if (value) info.vehiculo = toTitleCase(value);
            } else if (currentCellText.includes('vehículo placa')) {
                value = findNextValue();
                if (value) info.placa = value.toUpperCase();
            } else if (currentCellText.includes('período')) {
                value = findNextValue();
                if (value) {
                    info.fecha = value.split('..')[0].trim().split(' ')[0];
                }
            }
        }
    }

    if (info.placa === "No encontrada") {
        info.placa = fileName.split('.')[0]?.toUpperCase() || "No encontrada";
    }

    return info;
};

// FUNCIÓN UNIFICADA PARA PROCESAR EL ARCHIVO DE CLIENTES
export const processMasterClientFile = (worksheet: XLSX.WorkSheet): MasterClientData => {
    const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    let headerRowIndex = -1;
    for (let i = 0; i < 10 && i < sheetAsArray.length; i++) {
        const row = sheetAsArray[i].map(cell => String(cell || '').toUpperCase());
        if ((row.includes('VND') || row.includes('CVE')) && 
            row.includes('CLAVE') && 
            row.includes('RAZON') && 
            row.includes('GPS')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        throw new Error("Archivo de clientes: No se encontraron los encabezados requeridos (VND o CVE, CLAVE, RAZON, GPS).");
    }

    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
    const allVendors = new Set<string>();

    const clients: Client[] = data.map(row => {
        const vendor = String(row['VND'] || row['CVE'] || 'N/A').trim().toUpperCase();
        if (vendor && vendor !== 'N/A') {
            allVendors.add(vendor);
        }

        let gpsString = String(row['GPS'] || '');
        if (!gpsString) return null;
        gpsString = gpsString.replace('&', ',');
        const coords = gpsString.split(',');
        if (coords.length !== 2) return null;

        const lat = Number(coords[0]?.trim());
        const lng = Number(coords[1]?.trim());
        if (isNaN(lat) || isNaN(lng)) return null;

        return {
            key: String(row['CLAVE'] || 'N/A'),
            name: toTitleCase(String(row['RAZON'] || '')),
            lat,
            lng,
            vendor,
        };
    }).filter((c): c is Client => c !== null);

    if (clients.length === 0) {
        throw new Error("No se pudo extraer ningún dato de cliente válido del archivo.");
    }

    return { clients, vendors: Array.from(allVendors).sort() };
};

// PROCESAMIENTO DE VIAJES
export const processTripData = (data: any[]): ProcessedTrip => {
    const findTimeColumn = (row: any): string | null => {
      const timePattern = /^\d{1,2}:\d{2}(:\d{2})?$/;
      for (const key in row) {
        if (typeof row[key] === 'string' && timePattern.test(row[key].trim())) {
          return key;
        }
      }
      return null;
    };
    const timeColumn = data.length > 0 ? findTimeColumn(data[0]) : null;
    if (!timeColumn) {
      throw new Error("No se encontró una columna con datos de tiempo válidos en el archivo.");
    }
    const events: TripEvent[] = data.map((row, index) => ({
      id: index + 1,
      time: row[timeColumn] || '00:00:00',
      description: row['Descripción de Evento:'] || 'Sin descripción',
      speed: Number(row['Velocidad(km)']) || 0,
      lat: Number(row['Latitud']),
      lng: Number(row['Longitud']),
    })).filter(event => event.lat && event.lng);
    
    if (events.length === 0) {
      throw new Error("El archivo no contiene datos de eventos válidos con coordenadas.");
    }
    
    // Función para calcular la distancia total de una ruta
    const getPathDistance = (path: Array<{ lat: number; lng: number }>): number => {
        let distance = 0;
        for (let i = 1; i < path.length; i++) {
            const prev = path[i-1];
            const curr = path[i];
            distance += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        return distance;
    };

    const hasStartEndEvents = events.some(e => e.description.toLowerCase().includes('inicio de viaje')) &&
                              events.some(e => e.description.toLowerCase().includes('fin de viaje'));

    // METODO #1 = Archivos que contienen incio y fin de viaje
    if (hasStartEndEvents) {
      console.log("Procesando con eventos de Inicio/Fin de Viaje.");
      const flags: ProcessedTrip['flags'] = [];
      const routes: ProcessedTrip['routes'] = [{ path: [] }];
      let stopCounter = 0;
      
      const firstStartEvent = events.find(event => event.description.toLowerCase().includes('inicio de viaje'));
      if (!firstStartEvent) throw new Error("No se encontró 'Inicio de Viaje'.");
      
      const lastEndEventIndex = events.map(e => e.description.toLowerCase().includes('fin de viaje')).lastIndexOf(true);
      const lastEndEvent = lastEndEventIndex !== -1 ? events[lastEndEventIndex] : null;
      if (!lastEndEvent) throw new Error("No se encontró 'Fin de Viaje'.");

      const startIndex = events.findIndex(e => e.id === firstStartEvent.id);
      flags.push({
        lat: firstStartEvent.lat,
        lng: firstStartEvent.lng,
        type: 'start',
        time: firstStartEvent.time,
        description: `Inicio del Recorrido`,
      });

      for (let i = startIndex; i < events.length; i++) {
        const currentEvent = events[i];
        if (currentEvent.description.toLowerCase().includes('fin de viaje') && currentEvent.id !== lastEndEvent.id) {
            stopCounter++;
            const stopFlag: ProcessedTrip['flags'][0] = {
                lat: currentEvent.lat,
                lng: currentEvent.lng,
                type: 'stop',
                time: currentEvent.time,
                description: `Parada ${stopCounter}: ${currentEvent.description}`,
                duration: 0,
                stopNumber: stopCounter,
            };
            const nextStartEvent = events.find((event, j) => j > i && event.description.toLowerCase().includes('inicio de viaje'));
            if (nextStartEvent) {
                const stopEndTime = parseTimeToMinutes(currentEvent.time);
                const moveStartTime = parseTimeToMinutes(nextStartEvent.time);
                let duration = moveStartTime - stopEndTime;
                if (duration < 0) { duration += 24 * 60; }
                stopFlag.duration = duration;
            }
            flags.push(stopFlag);
        }
      }
      flags.push({
        lat: lastEndEvent.lat,
        lng: lastEndEvent.lng,
        type: 'end',
        time: lastEndEvent.time,
        description: `Fin del Recorrido`,
      });

      const endIndex = events.findIndex(e => e.id === lastEndEvent.id);
      if(startIndex !== -1 && endIndex !== -1) {
          routes[0].path = events.slice(startIndex, endIndex + 1).map(e => ({ lat: e.lat, lng: e.lng }));
      }
      const totalDistance = getPathDistance(routes[0].path);
      return { events, routes, flags, totalDistance, processingMethod: 'event-based' };

    // METODO #2 = Archivos que NO contienen incio y fin de viaje
    } else {
      console.log("Eventos de Inicio/Fin no encontrados. Procesando por velocidad.");
      
      let lastMovementIndex = -1;
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].speed > 0) {
          lastMovementIndex = i;
          break;
        }
      }
      if (lastMovementIndex === -1) {
        throw new Error("No se encontraron eventos con velocidad mayor a 0. No se puede definir un recorrido.");
      }

      const trueEndIndex = Math.min(lastMovementIndex + 1, events.length - 1);
      const relevantEvents = events.slice(0, trueEndIndex + 1);

      const flags: ProcessedTrip['flags'] = [];
      const routes: ProcessedTrip['routes'] = [{ path: [] }];
      let stopCounter = 0;

      flags.push({
          lat: relevantEvents[0].lat,
          lng: relevantEvents[0].lng,
          type: 'start',
          time: relevantEvents[0].time,
          description: 'Inicio del Recorrido (Detectado)',
      });

      let stopStartInfo: TripEvent | null = null;
      for (let i = 1; i < relevantEvents.length - 1; i++) {
          const prevEvent = relevantEvents[i-1];
          const currentEvent = relevantEvents[i];

          if (currentEvent.speed === 0 && prevEvent.speed > 0) {
              stopStartInfo = currentEvent;
          }

          if (currentEvent.speed > 0 && prevEvent.speed === 0 && stopStartInfo) {
              const stopStartTime = parseTimeToMinutes(stopStartInfo.time);
              const lastStopTime = parseTimeToMinutes(prevEvent.time);
              let duration = lastStopTime - stopStartTime;
              if (duration < 0) { duration += 24 * 60; }

              if (duration >= 2) { // Considera paradas de al menos 2 minutos
                stopCounter++;
                flags.push({
                    lat: stopStartInfo.lat,
                    lng: stopStartInfo.lng,
                    type: 'stop',
                    time: stopStartInfo.time,
                    description: `Parada ${stopCounter} (Detectada por velocidad)`,
                    duration: duration,
                    stopNumber: stopCounter,
                });
              }
              stopStartInfo = null;
          }
      }
      
      const lastTripEvent = relevantEvents[relevantEvents.length - 1];
      flags.push({
          lat: lastTripEvent.lat,
          lng: lastTripEvent.lng,
          type: 'end',
          time: lastTripEvent.time,
          description: 'Fin del Recorrido (Detectado)',
      });

      routes[0].path = relevantEvents.map(e => ({ lat: e.lat, lng: e.lng }));
      const totalDistance = getPathDistance(routes[0].path);

      return { events: relevantEvents, routes, flags, totalDistance, processingMethod: 'speed-based' };
    }
};