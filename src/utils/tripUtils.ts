/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';
import { format, fromZonedTime } from 'date-fns-tz';

const convertToTijuanaTime = (
  timeString: string,
  dateString: string
): string => {
  if (!timeString || !dateString) {
    return timeString;
  }
  const cdmxTimeZone = 'America/Mexico_City';
  const tijuanaTimeZone = 'America/Tijuana';

  const dateTimeString = `${dateString}T${timeString}`;

  try {
    const dateInCdmx = fromZonedTime(dateTimeString, cdmxTimeZone);
    return format(dateInCdmx, 'HH:mm:ss', { timeZone: tijuanaTimeZone });
  } catch (error) {
    console.error(`Error convirtiendo la hora: ${dateTimeString}`, error);
    return timeString;
  }
};

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
    clientBranchNumber?: string;
    clientBranchName?: string;
  }>;
  totalDistance: number; // en metros
  processingMethod: 'event-based' | 'speed-based';
  initialState: 'Apagado' | 'En movimiento';
  workStartTime?: string; // Hora de inicio de labores
  workEndTime?: string; // Hora de fin de labores
  isTripOngoing?: boolean; // Indica si el viaje esta en curso
}

export interface VehicleInfo {
  descripcion: string;
  vehiculo: string;
  placa: string;
  fecha: string;
}

// Interfaz de Cliente actualizada para incluir sucursales
export interface Client {
  key: string;
  name: string;
  lat: number;
  lng: number;
  vendor: string;
  branchNumber?: string; // Número de sucursal
  branchName?: string; // Nombre de sucursal
  displayName: string; // Nombre para mostrar
}

// Estructura del resultado del procesamiento del archivo de clientes
export interface MasterClientData {
  clients: Client[];
  vendors: string[];
}

// FUNCIONES DE UTILIDAD

export const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

// Funcion para calcular la distancia entre dos puntos GPS
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 6371e3; // Radio de la Tierra en metros
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const deltaP = ((lat2 - lat1) * Math.PI) / 180;
  const deltaL = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Convierte una cadena de tiempo a minutos
const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + minutes;
};

// Formatea la duracion en minutos a un string legible
export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return 'Menos de 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours} h ${mins} min`;
};

// FUNCIÓN PARA EXTRAER INFORMACIÓN DEL VEHÍCULO
export const parseVehicleInfo = (
  worksheet: XLSX.WorkSheet,
  fileName: string
): VehicleInfo => {
  const info: VehicleInfo = {
    descripcion: 'No encontrado',
    vehiculo: 'No encontrado',
    placa: 'No encontrada',
    fecha: 'No encontrada',
  };

  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });
  const rowsToSearch = data.slice(0, 20);

  for (const row of rowsToSearch) {
    if (!Array.isArray(row)) continue;

    for (let i = 0; i < row.length; i++) {
      const currentCellText = String(row[i] || '')
        .trim()
        .toLowerCase();
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

  if (info.placa === 'No encontrada') {
    info.placa = fileName.split('.')[0]?.toUpperCase() || 'No encontrada';
  }

  return info;
};

// FUNCIÓN PARA PROCESAR AMBOS FORMATOS DE ARCHIVO DE CLIENTES
export const processMasterClientFile = (
  worksheet: XLSX.WorkSheet
): MasterClientData => {
  const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  let headerRowIndex = -1;
  let isNewFormat = false;

  // Buscar los encabezados en las primeras 10 filas
  for (let i = 0; i < 10 && i < sheetAsArray.length; i++) {
    const row = sheetAsArray[i].map((cell) =>
      String(cell || '')
        .toUpperCase()
        .trim()
    );

    // Verificar formato nuevo (VND, CLAVE, RAZON, GPS)
    const hasNewFormatHeaders =
      row.some((cell) => cell === 'VEND') &&
      row.some((cell) => cell.includes('#CLIENTE')) &&
      row.some((cell) => cell.includes('NOMBRE') && cell.includes('CLIENTE')) &&
      row.some((cell) => cell === 'GPS');

    // Verificar formato anterior (Vend, #Cliente, Nombre del Cliente, GPS)
    const hasOldFormatHeaders =
      row.some((cell) => cell.includes('VND')) &&
      row.some((cell) => cell.includes('CLAVE')) &&
      row.some((cell) => cell.includes('RAZON')) &&
      row.some((cell) => cell.includes('GPS'));

    if (hasNewFormatHeaders || hasOldFormatHeaders) {
      headerRowIndex = i;
      isNewFormat = hasNewFormatHeaders;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      'Archivo de clientes: No se encontraron los encabezados requeridos. ' +
        'Formato esperado: (VND/Vend, CLAVE/#Cliente, RAZON/Nombre del Cliente, GPS)'
    );
  }

  const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
    range: headerRowIndex,
  });

  const allVendors = new Set<string>();

  const clients = data
    .map((row): Client | null => {
      // Determinar las columnas según el formato
      let vendor: string;
      let clientKey: string;
      let clientName: string;
      let gpsString: string;
      let branchNumber: string | undefined;
      let branchName: string | undefined;

      if (isNewFormat) {
        // Formato nuevo
        vendor = String(row['Vend'] || 'N/A')
          .trim()
          .toUpperCase();
        clientKey = String(row['#Cliente'] || 'N/A').trim();
        clientName = String(row['Nombre del Cliente'] || '').trim();
        gpsString = String(row['GPS'] || '').trim();
        branchNumber = String(row['#Suc'] || '').trim();
        branchName = String(row['Sucursal'] || '').trim();
      } else {
        // Formato anterior
        vendor = String(row['VND'] || 'N/A')
          .trim()
          .toUpperCase();
        clientKey = String(row['CLAVE'] || 'N/A').trim();
        clientName = String(row['RAZON'] || '').trim();
        gpsString = String(row['GPS'] || '').trim();
        // En el formato anterior no hay sucursales
        branchNumber = undefined;
        branchName = undefined;
      }

      // Validar vendor
      if (vendor && vendor !== 'N/A') {
        allVendors.add(vendor);
      }

      // Procesar coordenadas GPS
      if (!gpsString) return null;
      gpsString = gpsString.replace('&', ',');
      const coords = gpsString.split(',');
      if (coords.length !== 2) return null;

      const lat = Number(coords[0]?.trim());
      const lng = Number(coords[1]?.trim());
      if (isNaN(lat) || isNaN(lng)) return null;

      // Crear nombre para mostrar
      const displayName = toTitleCase(clientName);

      // Si tiene información de sucursal, agregarla al nombre para mostrar
      /*
      if (branchNumber && branchNumber !== '' && branchNumber !== '0') {
        if (branchName && branchName !== '') {
          displayName += ` - Suc. ${branchNumber} (${toTitleCase(branchName)})`;
        } else {
          displayName += ` - Suc. ${branchNumber}`;
        }
      }
      */

      return {
        key: clientKey,
        name: toTitleCase(clientName),
        lat,
        lng,
        vendor,
        branchNumber:
          branchNumber && branchNumber !== '' && branchNumber !== '0'
            ? branchNumber
            : undefined,
        branchName:
          branchName && branchName !== '' ? toTitleCase(branchName) : undefined,
        displayName,
      };
    })
    .filter((c): c is Client => c !== null);

  if (clients.length === 0) {
    throw new Error(
      'No se pudo extraer ningún dato de cliente válido del archivo.'
    );
  }

  return { clients, vendors: Array.from(allVendors).sort() };
};

// Formatea la informacion de la sucursal
export const formatBranchInfo = (client: Client): string | null => {
  if (client.branchNumber && client.branchNumber !== '0') {
    if (client.branchName) {
      return `Suc. ${client.branchName}`;
    }
    return `Suc. ${client.branchNumber}`;
  }
  return null;
};

// --- NUEVA FUNCIÓN PARA UNIR PARADAS CON CLIENTES ---
const matchStopsWithClients = (
  flags: ProcessedTrip['flags'],
  clients: Client[] | null,
  matchingThreshold = 50
): ProcessedTrip['flags'] => {
  if (!clients || clients.length === 0) {
    return flags;
  }

  return flags.map((flag) => {
    if (flag.type !== 'stop') {
      return flag;
    }

    let closestClient: Client | null = null;
    let minDistance = Infinity;

    for (const client of clients) {
      const distance = calculateDistance(
        flag.lat,
        flag.lng,
        client.lat,
        client.lng
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestClient = client;
      }
    }

    if (closestClient && minDistance <= matchingThreshold) {
      return {
        ...flag,
        clientKey: closestClient.key,
        clientName: closestClient.name,
        clientBranchNumber: closestClient.branchNumber,
        clientBranchName: closestClient.branchName,
      };
    }
    return flag;
  });
};

/**
 * Procesa un viaje basándose en los eventos de "Inicio de viaje" y "Fin de viaje".
 * Esta es la lógica para el MÉTODO #1.
 */
const processByEventMarkers = (
  events: TripEvent[]
): Omit<ProcessedTrip, 'initialState' | 'workStartTime' | 'workEndTime'> => {
  console.log('Procesando con eventos de Inicio/Fin de Viaje.');

  const flags: ProcessedTrip['flags'] = [];
  const routes: ProcessedTrip['routes'] = [{ path: [] }];
  let stopCounter = 0;

  const firstStartEvent = events.find((event) =>
    event.description.toLowerCase().includes('inicio de viaje')
  );
  if (!firstStartEvent) throw new Error("No se encontró 'Inicio de Viaje'.");

  const lastEndEventIndex = events
    .map((e) => e.description.toLowerCase().includes('fin de viaje'))
    .lastIndexOf(true);
  const lastEndEvent =
    lastEndEventIndex !== -1 ? events[lastEndEventIndex] : null;
  if (!lastEndEvent) throw new Error("No se encontró 'Fin de Viaje'.");

  const startIndex = events.findIndex((e) => e.id === firstStartEvent.id);
  flags.push({
    lat: firstStartEvent.lat,
    lng: firstStartEvent.lng,
    type: 'start',
    time: firstStartEvent.time,
    description: `Inicio del Recorrido`,
  });

  for (let i = startIndex; i < events.length; i++) {
    const currentEvent = events[i];
    if (
      currentEvent.description.toLowerCase().includes('fin de viaje') &&
      currentEvent.id !== lastEndEvent.id
    ) {
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
      const nextStartEvent = events.find(
        (event, j) =>
          j > i && event.description.toLowerCase().includes('inicio de viaje')
      );
      if (nextStartEvent) {
        const stopEndTime = parseTimeToMinutes(currentEvent.time);
        const moveStartTime = parseTimeToMinutes(nextStartEvent.time);
        let duration = moveStartTime - stopEndTime;
        if (duration < 0) duration += 24 * 60;
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

  const endIndex = events.findIndex((e) => e.id === lastEndEvent.id);
  if (startIndex !== -1 && endIndex !== -1) {
    routes[0].path = events
      .slice(startIndex, endIndex + 1)
      .map((e) => ({ lat: e.lat, lng: e.lng }));
  }

  const totalDistance = routes.reduce((total, route) => {
    for (let i = 0; i < route.path.length - 1; i++) {
      total += calculateDistance(
        route.path[i].lat,
        route.path[i].lng,
        route.path[i + 1].lat,
        route.path[i + 1].lng
      );
    }
    return total;
  }, 0);

  return {
    events,
    routes,
    flags,
    totalDistance,
    processingMethod: 'event-based',
  };
};

/*
 * Procesa un viaje basándose en la velocidad y el movimiento.
 * Esta es la lógica para el MÉTODO #2.
 */
const processBySpeedAndMovement = (
  events: TripEvent[]
): Omit<ProcessedTrip, 'initialState' | 'workStartTime' | 'workEndTime'> => {
  console.log(
    'Eventos de Inicio/Fin no encontrados. Procesando por velocidad.'
  );

  const firstMovementIndex = events.findIndex((e) => e.speed > 0);
  if (firstMovementIndex === -1) {
    throw new Error('No se encontraron eventos con velocidad > 0.');
  }

  const lastMovementIndex = events.map((e) => e.speed > 0).lastIndexOf(true);

  const relevantEvents = events.slice(
    firstMovementIndex,
    lastMovementIndex + 1
  );

  if (relevantEvents.length === 0) {
    throw new Error('No hay eventos relevantes para procesar.');
  }

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
  for (let i = 1; i < relevantEvents.length; i++) {
    const prevEvent = relevantEvents[i - 1];
    const currentEvent = relevantEvents[i];

    if (currentEvent.speed === 0 && prevEvent.speed > 0) {
      stopStartInfo = currentEvent;
    }

    if (currentEvent.speed > 0 && prevEvent.speed === 0 && stopStartInfo) {
      const stopStartTime = parseTimeToMinutes(stopStartInfo.time);
      const lastStopTime = parseTimeToMinutes(prevEvent.time);
      let duration = lastStopTime - stopStartTime;
      if (duration < 0) duration += 24 * 60;
      if (duration >= 2) {
        stopCounter++;
        flags.push({
          lat: stopStartInfo.lat,
          lng: stopStartInfo.lng,
          type: 'stop',
          time: stopStartInfo.time,
          description: `Parada ${stopCounter} (Detectada)`,
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

  routes[0].path = relevantEvents.map((e) => ({ lat: e.lat, lng: e.lng }));

  const totalDistance = routes.reduce((total, route) => {
    for (let i = 0; i < route.path.length - 1; i++) {
      total += calculateDistance(
        route.path[i].lat,
        route.path[i].lng,
        route.path[i + 1].lat,
        route.path[i + 1].lng
      );
    }
    return total;
  }, 0);

  return {
    events: relevantEvents,
    routes,
    flags,
    totalDistance,
    processingMethod: 'speed-based',
  };
};

/**
 * --- FUNCIÓN PRINCIPAL Y PUNTO DE ENTRADA ---
 * Determina qué método de procesamiento usar y enriquece los datos
 * según el modo de vista seleccionado ('current' o 'new').
 */
// tripUtils.ts

// ... (El resto de tus funciones se mantienen exactamente igual)

/**
 * --- FUNCIÓN PRINCIPAL Y PUNTO DE ENTRADA ---
 * Determina qué método de procesamiento usar y enriquece los datos
 * según el modo de vista seleccionado ('current' o 'new').
 */
// tripUtils.ts

// ... (todas las demás funciones como las tienes actualmente)

export const processTripData = (
  rawData: any[],
  processingMode: 'current' | 'new',
  tripDate: string,
  clientData: Client[] | null
): ProcessedTrip => {
  // 1. Lectura y saneamiento de datos (tu código actual está bien aquí)
  const findTimeColumn = (row: any): string | null => {
    if (!row) return null;
    const timePattern = /^\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?$/i;
    for (const key in row) {
      const value = row[key];
      if (typeof value === 'string' && timePattern.test(value.trim())) {
        return key;
      }
      if (typeof value === 'number' && value > 0 && value < 1) {
        return key;
      }
    }
    const commonTimeColumns = ['hora', 'tiempo', 'time'];
    const rowKeys = Object.keys(row);
    for (const commonKey of commonTimeColumns) {
      const foundKey = rowKeys.find((key) =>
        key.toLowerCase().includes(commonKey)
      );
      if (foundKey) return foundKey;
    }
    return null;
  };

  const timeColumn = rawData.length > 0 ? findTimeColumn(rawData[0]) : null;
  if (!timeColumn) {
    throw new Error(
      'No se pudo encontrar una columna de tiempo válida en el archivo.'
    );
  }

  const allEvents: TripEvent[] = rawData
    .map((row: any, index: number) => {
      const excelTimeValue = row[timeColumn];
      let originalTime = '00:00:00';
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

      if (typeof excelTimeValue === 'number' && excelTimeValue > 0) {
        const date = XLSX.SSF.parse_date_code(excelTimeValue);
        const pad = (num: number) => num.toString().padStart(2, '0');
        if (date) {
          originalTime = `${pad(date.H)}:${pad(date.M)}:${pad(date.S)}`;
        }
      } else if (typeof excelTimeValue === 'string') {
        originalTime = excelTimeValue.trim();
      }

      // Si el formato de hora no es válido, se ignora la fila
      if (!timeRegex.test(originalTime)) {
        return null;
      }

      const convertedTime = convertToTijuanaTime(originalTime, tripDate);
      if (!convertedTime) {
        return null; // Ignorar si la conversión de zona horaria falla
      }

      return {
        id: index + 1,
        time: convertedTime,
        description: row['Descripción de Evento:'] || 'Sin descripción',
        speed: Number(row['Velocidad(km)']) || 0,
        lat: Number(row['Latitud']),
        lng: Number(row['Longitud']),
      };
    })
    .filter(
      (event): event is TripEvent =>
        event !== null && !!event.lat && !!event.lng
    );

  if (allEvents.length === 0) {
    throw new Error(
      'No se encontraron eventos con coordenadas válidas en el archivo.'
    );
  }

  // 2. Procesamiento del viaje (sin cambios)
  const hasStartEndEvents = allEvents.some((e) =>
    e.description.toLowerCase().includes('inicio de viaje')
  );

  let coreTripData: Omit<
    ProcessedTrip,
    'initialState' | 'workStartTime' | 'workEndTime'
  >;

  try {
    if (hasStartEndEvents) {
      coreTripData = processByEventMarkers(allEvents);
    } else {
      coreTripData = processBySpeedAndMovement(allEvents);
    }
  } catch (error) {
    console.warn(
      'Fallo el método por eventos, usando método por velocidad como respaldo:',
      error
    );
    coreTripData = processBySpeedAndMovement(allEvents);
  }

  coreTripData.flags = matchStopsWithClients(coreTripData.flags, clientData);

  // 3. Determinar estado y horas de trabajo (LÓGICA CORREGIDA)
  const initialState: ProcessedTrip['initialState'] =
    allEvents[0].speed > 0 ? 'En movimiento' : 'Apagado';
  const isTripOngoing = allEvents[allEvents.length - 1].speed > 0;

  const firstMovingEvent = allEvents.find((e) => e.speed > 0);
  const firstClientVisit = coreTripData.flags.find(
    (flag) =>
      flag.type === 'stop' &&
      flag.clientKey &&
      flag.clientName !== 'Sin coincidencia'
  );

  let workStartTime: string | undefined;
  let workEndTime: string | undefined;

  // --- 👇 AQUÍ ESTÁ LA LÓGICA CLAVE CORREGIDA ---

  // Asignar hora de inicio
  if (processingMode === 'new') {
    // Vista Completa
    workStartTime = firstClientVisit?.time || firstMovingEvent?.time;
  } else {
    // Vista Actual
    workStartTime =
      firstClientVisit?.time ||
      coreTripData.flags.find((f) => f.type === 'start')?.time;
  }

  // Asignar hora de fin para CÁLCULOS
  // Para la Vista Completa, el fin es SIEMPRE la hora del último evento.
  // Para la Vista Actual, es el "Fin de viaje" o, si no existe, la hora del último evento.
  if (processingMode === 'new') {
    workEndTime = allEvents[allEvents.length - 1].time;
  } else {
    workEndTime =
      coreTripData.flags.find((f) => f.type === 'end')?.time ||
      allEvents[allEvents.length - 1].time;
  }

  // 4. Construir el objeto final
  const finalTripData: ProcessedTrip = {
    ...coreTripData,
    initialState: initialState,
    isTripOngoing: isTripOngoing, // La UI usará esto para decidir si muestra la hora o "En movimiento"
    workStartTime: workStartTime,
    workEndTime: workEndTime, // Este valor siempre existirá para que los cálculos funcionen
  };

  // (Ya no necesitas los logs de depuración, los puedes quitar)

  return finalTripData;
};
