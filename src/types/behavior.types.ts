export interface Vendor {
  id: string;
  nombre: string;
}

export interface TimeRangeBreakdown {
  laboral: number;
  extra: number;
}

export interface GlobalSummary {
  diasTrabajados: number;
  distanciaTotalKm: number;
  tiempos: {
    productivo: TimeRangeBreakdown;
    noProductivo: TimeRangeBreakdown;
    casa: TimeRangeBreakdown;
    tools: TimeRangeBreakdown;
    traslados: TimeRangeBreakdown;
  };
  clientesUnicosVisitados: number;
  totalParadas: number;
}

export interface TiemposBreakdown {
  clientes: number;
  noClientes: number;
  casa: number;
  tools: number;
  traslados: number;
}

export interface HorariosBreakdown {
  inicio: string;
  fin: string;
}

export interface DetailedStop {
  hora: string;
  tipo: string;
  descripcion: string;
  duracion: number;
  esLaboral: boolean;
  claveCliente?: string;
}

export interface DailyBreakdown {
  fecha: string;
  vehiculo: string;
  distanciaKm: number;
  paradasCount: number;
  clientesVisitadosCount: number;
  tiempos: {
    laboral: TiemposBreakdown;
    extra: TiemposBreakdown;
  };
  horarios: HorariosBreakdown;
  paradasDetalladas: DetailedStop[];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface BehaviorSummaryResponse {
  vendedor: string;
  rango: DateRange;
  globalSummary: GlobalSummary;
  dailyBreakdown: DailyBreakdown[];
}
