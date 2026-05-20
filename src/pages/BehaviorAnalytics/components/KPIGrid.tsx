import {
  CalendarDays,
  Route,
  Users,
  MapPin,
  CheckCircle2,
  Home,
  Wrench,
  AlertTriangle,
  Navigation,
} from 'lucide-react';
import type { GlobalSummary } from '../../../types/behavior.types';

interface KPIGridProps {
  summary: GlobalSummary;
}

/**
 * Formatea minutos en un string legible de Horas y Minutos.
 */
function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface KPICardProps {
  title: string;
  value: string | number;
  extraValue?: number;
  icon: React.ElementType;
  iconColorClass: string;
  bgClass?: string;
}

const KPICard = ({
  title,
  value,
  extraValue,
  icon: Icon,
  iconColorClass,
  bgClass = 'bg-white',
}: KPICardProps) => (
  <div
    className={`${bgClass} border border-gray-200 rounded-xl p-3 2xl:p-4 shadow-sm flex flex-col justify-between transition-all hover:shadow-md`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
        {title}
      </span>
      <Icon className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 ${iconColorClass}`} />
    </div>
    <div className="flex items-baseline gap-2">
      <div className="text-lg 2xl:text-xl font-bold text-gray-900">{value}</div>
      {extraValue !== undefined && extraValue > 0 && (
        <span className="text-[10px] 2xl:text-[11px] text-gray-400 font-medium whitespace-nowrap">
          + {formatMins(extraValue)} extra
        </span>
      )}
    </div>
  </div>
);

export default function KPIGrid({ summary }: KPIGridProps) {
  return (
    <div className="flex flex-col gap-3 2xl:gap-4 mb-6">
      {/* Fila Superior: 4 Métricas Absolutas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 2xl:gap-4">
        <KPICard
          title="Días Analizados"
          value={summary.diasTrabajados}
          icon={CalendarDays}
          iconColorClass="text-gray-500"
        />
        <KPICard
          title="Distancia Total"
          value={`${summary.distanciaTotalKm.toFixed(2)} km`}
          icon={Route}
          iconColorClass="text-gray-500"
        />
        <KPICard
          title="Clientes Únicos Visitados"
          value={summary.clientesUnicosVisitados}
          icon={Users}
          iconColorClass="text-gray-500"
        />
        <KPICard
          title="Total Paradas"
          value={summary.totalParadas}
          icon={MapPin}
          iconColorClass="text-gray-500"
        />
      </div>

      {/* Fila Inferior: 5 Métricas de Tiempo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 2xl:gap-4">
        <KPICard
          title="Tiempo con Clientes"
          value={formatMins(summary.tiempos.productivo.laboral)}
          extraValue={summary.tiempos.productivo.extra}
          icon={CheckCircle2}
          iconColorClass="text-green-600"
          bgClass="bg-green-50/30"
        />
        <KPICard
          title="Tiempo sin Clientes"
          value={formatMins(summary.tiempos.noProductivo.laboral)}
          extraValue={summary.tiempos.noProductivo.extra}
          icon={AlertTriangle}
          iconColorClass="text-red-600"
          bgClass="bg-red-50/30"
        />
        <KPICard
          title="Tiempo en Traslados"
          value={formatMins(summary.tiempos.traslados.laboral)}
          extraValue={summary.tiempos.traslados.extra}
          icon={Navigation}
          iconColorClass="text-orange-500"
          bgClass="bg-orange-50/30"
        />
        <KPICard
          title="Tiempo en Casa"
          value={formatMins(summary.tiempos.casa.laboral)}
          extraValue={summary.tiempos.casa.extra}
          icon={Home}
          iconColorClass="text-purple-600"
          bgClass="bg-purple-50/30"
        />
        <KPICard
          title="Tiempo Tools México"
          value={formatMins(summary.tiempos.tools.laboral)}
          extraValue={summary.tiempos.tools.extra}
          icon={Wrench}
          iconColorClass="text-blue-600"
          bgClass="bg-blue-50/30"
        />
      </div>
    </div>
  );
}
