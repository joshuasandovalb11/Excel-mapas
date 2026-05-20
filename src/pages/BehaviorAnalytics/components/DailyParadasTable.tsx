import {
  Home,
  Users,
  Wrench,
  Navigation,
  HelpCircle,
  Clock,
  Tag,
  MapPin,
  Info,
  PlayCircle,
  StopCircle,
} from 'lucide-react';
import type { DetailedStop } from '../../../types/behavior.types';

interface DailyParadasTableProps {
  paradas: DetailedStop[];
}

const getStopIcon = (tipo: string) => {
  const t = tipo.toUpperCase();
  if (t.includes('INICIO'))
    return {
      icon: PlayCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
    };
  if (t.includes('FIN'))
    return { icon: StopCircle, color: 'text-red-600', bg: 'bg-red-100' };
  if (t.includes('CASA'))
    return { icon: Home, color: 'text-purple-600', bg: 'bg-purple-100' };
  if (t.includes('CLIENTE'))
    return { icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' };
  if (t.includes('TOOLS'))
    return { icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-100' };
  if (t.includes('TRASLADO') || t.includes('MOVIMIENTO'))
    return { icon: Navigation, color: 'text-orange-600', bg: 'bg-orange-100' };
  return { icon: HelpCircle, color: 'text-gray-600', bg: 'bg-gray-100' };
};

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatDuration = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function DailyParadasTable({ paradas }: DailyParadasTableProps) {
  if (!paradas || paradas.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <Info className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">
          No hay paradas detalladas para este día.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/* Encabezado */}
      <div className="grid grid-cols-[100px_190px_1fr_170px_140px] 2xl:grid-cols-[120px_210px_1fr_210px_160px] gap-2 2xl:gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider items-center">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Hora
        </div>
        <div className="flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Tipo
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3" /> Lugar / Descripción
        </div>
        <div className="justify-self-center">Duración</div>
        <div className="justify-self-center">Categoría</div>
      </div>

      {/* Cuerpo */}
      <div className="overflow-y-auto max-h-[420px] 2xl:max-h-[600px] flex flex-col divide-y divide-gray-100 scrollbar-thin">
        {paradas.map((parada, idx) => {
          const { icon: Icon, color, bg } = getStopIcon(parada.tipo);
          const isExtra = !parada.esLaboral;
          const categoriaStr = parada.esLaboral ? 'LABORAL' : 'EXTRA';
          const isBoundary =
            parada.tipo.toUpperCase().includes('INICIO') ||
            parada.tipo.toUpperCase().includes('FIN');

          const displayDescription =
            parada.tipo.toUpperCase().includes('CLIENTE') && parada.claveCliente
              ? `#${parada.claveCliente} - ${toTitleCase(parada.descripcion)}`
              : toTitleCase(parada.descripcion);

          const isClient = parada.tipo.toUpperCase().includes('CLIENTE');

          return (
            <div
              key={idx}
              className="grid grid-cols-[100px_190px_1fr_170px_130px] 2xl:grid-cols-[120px_210px_1fr_210px_150px] gap-2 2xl:gap-4 px-4 py-3 hover:bg-gray-50/80 transition-colors items-center group"
            >
              <div
                className={`text-[11px] 2xl:text-[12px] font-bold text-gray-700${
                  isBoundary
                    ? 'font-bold text-gray-900'
                    : 'font-semibold text-gray-600'
                }`}
              >
                {parada.hora}
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <span
                  className={`text-[12px] 2xl:text-[13px] ${
                    isBoundary
                      ? 'font-bold text-gray-900'
                      : 'font-semibold text-gray-600'
                  }`}
                >
                  {toTitleCase(parada.tipo)}
                </span>
              </div>
              <div
                className={`text-[12px] 2xl:text-[13px] truncate ${
                  isBoundary
                    ? 'font-bold text-gray-900'
                    : isClient
                      ? 'font-semibold text-blue-700'
                      : 'font-semibold text-gray-600'
                }`}
              >
                {displayDescription}
              </div>
              <div className="justify-self-center">
                {isBoundary ? (
                  <span className="text-gray-400 font-bold">-</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-[11px] 2xl:text-[12px] font-bold text-gray-800">
                    {formatDuration(parada.duracion)}
                  </span>
                )}
              </div>
              <div className="justify-self-center">
                {isBoundary ? (
                  <span className="text-gray-400 font-bold">-</span>
                ) : (
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-md text-[9px] 2xl:text-[10px] font-black uppercase ${
                      isExtra
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {categoriaStr}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
