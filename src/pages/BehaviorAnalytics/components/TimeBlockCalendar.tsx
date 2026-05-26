import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import type {
  DailyBreakdown,
  DetailedStop,
} from '../../../types/behavior.types';
import { formatName } from '../../../utils/tripUtils';

interface TimeBlockCalendarProps {
  daysData: DailyBreakdown[];
}

// Helpers
const timeToMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const cleanStr = timeStr.trim().toUpperCase();
  const hasAMPM = cleanStr.includes('AM') || cleanStr.includes('PM');

  if (hasAMPM) {
    const [time, period] = cleanStr.split(/\s+/);
    const [h, m] = time.split(':').map(Number);
    let hours = h;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + (m || 0);
  } else {
    // Formato 24h (ej. "14:30" o "14:30:00")
    const [h, m] = cleanStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
};

const getBlockColor = (tipo: string) => {
  const t = tipo.toUpperCase();
  if (t.includes('CASA')) return 'bg-purple-500 border-purple-600 text-white';
  if (t.includes('TRASLADO')) return 'bg-slate-500 border-slate-700 text-white';
  if (t.includes('CLIENTE') && !t.includes('SIN CLIENTE'))
    return 'bg-green-500 border-green-600 text-white';
  if (t.includes('SIN CLIENTE') || t.includes('NO PRODUCTIVO'))
    return 'bg-red-500 border-red-600 text-white';
  if (t.includes('TOOLS')) return 'bg-blue-500 border-blue-600 text-white';
  return 'bg-gray-400 border-gray-500 text-white';
};

const formatDur = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function TimeBlockCalendar({
  daysData,
}: TimeBlockCalendarProps) {
  const [isFullDay, setIsFullDay] = useState(false);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: DetailedStop;
  } | null>(null);

  const VIEW_START_MIN = isFullDay ? 0 : 510; // 00:00 o 08:30 AM
  const VIEW_END_MIN = isFullDay ? 1440 : 1050; // 24:00 o 05:30 PM
  const TOTAL_VIEW_MINS = VIEW_END_MIN - VIEW_START_MIN;

  const handleMouseMove = (e: React.MouseEvent, parada: DetailedStop) => {
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, data: parada });
  };
  const handleMouseLeave = () => setTooltip(null);

  // Generar etiquetas de hora para el eje Y
  const hourLabels: { label: string; offset: number; isHalf: boolean }[] = [];
  const step = 30; // cada media hora
  const firstHour = Math.ceil(VIEW_START_MIN / 30) * 30;
  for (let m = firstHour; m <= VIEW_END_MIN; m += step) {
    const h = Math.floor(m / 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    hourLabels.push({
      label: `${displayH}:00 ${ampm}`,
      offset: ((m - VIEW_START_MIN) / TOTAL_VIEW_MINS) * 100,
      isHalf: m % 60 !== 0,
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[640px] 2xl:h-[860px] relative">
      {/* Cabecera del Componente */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-center bg-gray-50/50">
        {/* Toggle Horario */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setIsFullDay(false)}
            className={`px-3 py-1 text-[10px] 2xl:text-[11px] font-bold rounded-md transition-all ${
              !isFullDay
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Horario Laboral
          </button>
          <button
            onClick={() => setIsFullDay(true)}
            className={`px-3 py-1 text-[10px] 2xl:text-[11px] font-bold rounded-md transition-all ${
              isFullDay
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Día Completo
          </button>
        </div>
      </div>

      {/* Cuerpo (Grid base) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max h-full">
          {/* Eje de tiempo (Y) */}
          <div className="w-16 border-r border-gray-100 bg-gray-50/30 flex flex-col relative">
            <div className="h-10 border-b border-gray-100 flex items-center justify-center sticky top-0 bg-gray-50 z-20">
              <CalendarIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 relative">
              {hourLabels.map((hl, i) => (
                <div
                  key={i}
                  className="absolute w-full flex justify-center"
                  style={{
                    top: `${hl.offset}%`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  {hl.isHalf ? (
                    <span className="text-[12px] font-bold text-gray-500">
                      -
                    </span>
                  ) : (
                    <span className="text-[9px] 2xl:text-[10px] font-medium text-gray-500">
                      {hl.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Columnas de Días */}
          <div className="flex flex-1">
            {daysData.length > 0 ? (
              daysData.map((day, idx) => {
                const inicioParada = day.paradasDetalladas?.find((p) =>
                  p.tipo.toUpperCase().includes('INICIO')
                );
                const finParada = day.paradasDetalladas?.find((p) =>
                  p.tipo.toUpperCase().includes('FIN')
                );
                const inicioMin = inicioParada
                  ? timeToMinutes(inicioParada.hora)
                  : VIEW_START_MIN;
                const finMin = finParada
                  ? timeToMinutes(finParada.hora)
                  : VIEW_END_MIN;

                return (
                  <div
                    key={idx}
                    className="min-w-[90px] flex-1 border-r border-gray-100 flex flex-col"
                  >
                    {/* Fecha sticky */}
                    <div className="h-10 border-b border-gray-100 bg-gray-50/30 flex items-center justify-center px-2 sticky top-0 z-20 backdrop-blur-sm">
                      <span className="text-[11px] font-bold text-gray-600 uppercase">
                        {day.fecha
                          ? day.fecha.split('-').reverse().join('-')
                          : `Día ${idx + 1}`}
                      </span>
                    </div>

                    <div className="flex-1 relative bg-gray-50/20 overflow-hidden">
                      {hourLabels.map((hl, i) => (
                        <div
                          key={i}
                          className={`absolute w-full border-b ${hl.isHalf ? 'border-gray-100/30' : 'border-gray-100/50'}`}
                          style={{ top: `${hl.offset}%` }}
                        />
                      ))}

                      {inicioMin > VIEW_START_MIN && (
                        <div
                          className="absolute w-full bg-gray-200/60 z-0 flex items-center justify-center border-b border-gray-300/30"
                          style={{
                            top: '0%',
                            height: `${((Math.min(inicioMin, VIEW_END_MIN) - VIEW_START_MIN) / TOTAL_VIEW_MINS) * 100}%`,
                          }}
                        >
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter rotate-90 sm:rotate-0">
                            Sin Actividad
                          </span>
                        </div>
                      )}

                      {finMin < VIEW_END_MIN && (
                        <div
                          className="absolute w-full bg-gray-200/60 z-0 flex items-center justify-center border-t border-gray-300/30"
                          style={{
                            top: `${((Math.max(finMin, VIEW_START_MIN) - VIEW_START_MIN) / TOTAL_VIEW_MINS) * 100}%`,
                            height: `${((VIEW_END_MIN - Math.max(finMin, VIEW_START_MIN)) / TOTAL_VIEW_MINS) * 100}%`,
                          }}
                        >
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter rotate-90 sm:rotate-0">
                            Sin Actividad
                          </span>
                        </div>
                      )}

                      {day.paradasDetalladas?.map((parada, pIdx) => {
                        const startMin = timeToMinutes(parada.hora);
                        const durMin = parada.duracion;
                        const endMin = startMin + durMin;

                        if (
                          parada.tipo.includes('INICIO') ||
                          parada.tipo.includes('FIN')
                        )
                          return null;
                        if (
                          endMin <= VIEW_START_MIN ||
                          startMin >= VIEW_END_MIN
                        )
                          return null;

                        const visibleStart = Math.max(startMin, VIEW_START_MIN);
                        const visibleEnd = Math.min(endMin, VIEW_END_MIN);
                        const visibleDur = visibleEnd - visibleStart;

                        if (visibleDur <= 0) return null;

                        const top =
                          ((visibleStart - VIEW_START_MIN) / TOTAL_VIEW_MINS) *
                          100;
                        const height = (visibleDur / TOTAL_VIEW_MINS) * 100;

                        return (
                          <div
                            key={pIdx}
                            onMouseMove={(e) => handleMouseMove(e, parada)}
                            onMouseLeave={handleMouseLeave}
                            className={`absolute left-1 right-1 border-l-2 px-1 py-0.5 text-[9px] overflow-hidden leading-tight z-10 shadow-sm 
                              transition-all hover:scale-[1.02] hover:z-20 cursor-default ${getBlockColor(
                                parada.tipo
                              )}`}
                            style={{
                              top: `${top}%`,
                              height: `${Math.max(height, 2)}%`,
                            }}
                          >
                            {durMin >= 15 && (
                              <div className="font-bold truncate">
                                {parada.claveCliente
                                  ? `[${parada.claveCliente}] `
                                  : ''}
                                {parada.tipo} ({formatDur(durMin)})
                              </div>
                            )}

                            {durMin >= 30 && (
                              <div className="opacity-80 truncate">
                                {parada.descripcion}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic">
                No hay datos disponibles para mostrar el calendario
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip Flotante */}
      {tooltip?.visible && tooltip.data && (
        <div
          className="fixed z-[100] bg-gray-900 text-white rounded-xl p-3 shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-[calc(100%+15px)] border border-gray-700/50"
          style={{ left: tooltip.x, top: tooltip.y, minWidth: '220px' }}
        >
          <div className="font-black text-[13px] mb-1.5 border-b border-gray-700 pb-1.5 flex justify-between items-center">
            <span>{tooltip.data.hora}</span>
            <span className="text-[10px] uppercase tracking-wider bg-gray-800 px-2 py-0.5 rounded-md text-gray-300">
              {tooltip.data.tipo}
            </span>
          </div>
          {tooltip.data.claveCliente && (
            <div className="text-gray-300 text-xs mt-1">
              <span className="font-bold text-gray-400">ID:</span>{' '}
              {tooltip.data.claveCliente}
            </div>
          )}
          <div className="text-gray-200 text-xs leading-relaxed">
            <span className="font-bold text-gray-400">Detalle:</span>{' '}
            {formatName(tooltip.data.descripcion)}
          </div>
          <div className="text-gray-300 text-xs mt-1.5 pt-1.5 border-t border-gray-800">
            <span className="font-bold text-gray-400">Duración:</span>{' '}
            {formatDur(tooltip.data.duracion)}
          </div>
          <div className="absolute left-1/2 bottom-[-6px] w-3 h-3 bg-gray-900 rotate-45 transform -translate-x-1/2 border-b border-r border-gray-700/50"></div>
        </div>
      )}
    </div>
  );
}
