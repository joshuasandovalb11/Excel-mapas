/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useMemo, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import useOnClickOutside from '../../../hooks/useOnClickOutside';

interface PopoverDateRangePickerProps {
  startDate: string;
  endDate: string;
  onSelectRange: (start: string, end: string) => void;
  availableDates: { fecha: string; totalRutas: number }[];
  disabled?: boolean;
}

export default function PopoverDateRangePicker({
  startDate,
  endDate,
  onSelectRange,
  availableDates,
  disabled = false,
}: PopoverDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<any>(null);

  const [tempStartDate, setTempStartDate] = useState<string | null>(startDate || null);
  const [tempEndDate, setTempEndDate] = useState<string | null>(endDate || null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (startDate) return new Date(`${startDate}T12:00:00Z`);
    if (availableDates.length > 0) return new Date(`${availableDates[0].fecha}T12:00:00Z`);
    return new Date();
  });

  useEffect(() => {
    if (isOpen) {
      setTempStartDate(startDate || null);
      setTempEndDate(endDate || null);
      if (startDate) {
        setCurrentMonth(new Date(`${startDate}T12:00:00Z`));
      }
    }
  }, [isOpen, startDate, endDate]);

  useOnClickOutside(containerRef, () => setIsOpen(false));

  const formatDisplayDate = (d: string | null) => {
    if (!d) return '';
    return d.split('-').reverse().join('-');
  };

  const datesMap = useMemo(() => {
    const map = new Map<string, number>();
    availableDates.forEach((d) => map.set(d.fecha, d.totalRutas));
    return map;
  }, [availableDates]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const handleDateClick = (dateStr: string) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(dateStr);
      setTempEndDate(null);
    } else {
      if (dateStr < tempStartDate) {
        setTempStartDate(dateStr);
      } else {
        setTempEndDate(dateStr);
      }
    }
  };

  const handleApply = () => {
    if (tempStartDate && tempEndDate) {
      onSelectRange(tempStartDate, tempEndDate);
      setIsOpen(false);
    } else if (tempStartDate && !tempEndDate) {
      onSelectRange(tempStartDate, tempStartDate);
      setIsOpen(false);
    }
  };

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="w-7 h-7 2xl:w-8 2xl:h-8"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const totalRutas = datesMap.get(dateStr);
      const isAvailable = totalRutas !== undefined;

      const isStart = tempStartDate === dateStr;
      const isEnd = tempEndDate === dateStr;

      let isInRange = false;
      if (tempStartDate && tempEndDate) {
        isInRange = dateStr > tempStartDate && dateStr < tempEndDate;
      } else if (tempStartDate && hoveredDate && !tempEndDate) {
        isInRange = dateStr > tempStartDate && dateStr <= hoveredDate;
      }

      let rangeClass = '';
      if (isStart && isEnd) {
        rangeClass = 'bg-blue-600 text-white border-blue-600 rounded-md font-semibold';
      } else if (isStart) {
        rangeClass = 'bg-blue-600 text-white border-blue-600 rounded-l-md rounded-r-none font-semibold';
      } else if (isEnd) {
        rangeClass = 'bg-blue-600 text-white border-blue-600 rounded-r-md rounded-l-none font-semibold';
      } else if (isInRange) {
        rangeClass = 'bg-blue-50 text-blue-800 border-blue-50 rounded-none font-medium hover:bg-blue-100 hover:border-blue-100';
      } else if (isAvailable) {
        rangeClass = 'bg-white text-gray-700 border-gray-100 hover:bg-gray-100 rounded-md';
      } else {
        rangeClass = 'text-gray-300 border-transparent cursor-not-allowed opacity-40';
      }

      days.push(
        <button
          key={dateStr}
          type="button"
          disabled={disabled || !isAvailable}
          onClick={() => !disabled && isAvailable && handleDateClick(dateStr)}
          onMouseEnter={() => isAvailable && setHoveredDate(dateStr)}
          onMouseLeave={() => setHoveredDate(null)}
          className={`relative flex items-center justify-center w-7 h-7 2xl:w-8 2xl:h-8 text-[11px] 2xl:text-[12px] border transition-all duration-150 ${rangeClass}`}
        >
          {day}
          {isAvailable && !isStart && !isEnd && !isInRange && (
            <span className="absolute bottom-1 w-1 h-1 bg-blue-300 rounded-full"></span>
          )}
        </button>
      );
    }
    return days;
  };

  const displayText = useMemo(() => {
    if (startDate && endDate) {
      if (startDate === endDate) return formatDisplayDate(startDate);
      return `${formatDisplayDate(startDate)} al ${formatDisplayDate(endDate)}`;
    }
    if (startDate) return `Desde ${formatDisplayDate(startDate)}`;
    return 'Seleccionar rango de fechas';
  }, [startDate, endDate]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-[11px] 2xl:text-[13px] bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400 shrink-0" />
          <span className={startDate ? 'text-gray-900 font-semibold' : 'text-gray-400'}>
            {displayText}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
            }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 mt-2 overflow-hidden w-[260px] 2xl:w-[290px] animate-fadeIn origin-top-left shadow-2xl border border-gray-200 rounded-xl bg-white p-2">
          {/* Cabecera del calendario */}
          <div className="flex items-center justify-between mb-2 2xl:mb-3 px-1">
            <div className="flex items-center gap-1.5 text-gray-900">
              <CalendarIcon className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 text-gray-400" />
              <span className="text-[12px] 2xl:text-[13px] font-bold">
                {monthNames[month]} {year}
              </span>
            </div>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={disabled}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={disabled}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
              </button>
            </div>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((d) => (
              <div
                key={d}
                className="text-[9px] 2xl:text-[10px] font-bold text-gray-400 uppercase tracking-wider"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7 gap-y-1 gap-x-1 justify-items-center">
            {renderDays()}
          </div>

          {/* Footer del Modal */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-col gap-2">
            <div className="text-[10px] 2xl:text-[11px] text-gray-500 font-medium px-1 flex flex-col gap-0.5 leading-tight">
              {tempStartDate ? (
                <div>
                  <span className="font-bold text-gray-400 mr-1">Desde:</span>
                  <span className="text-gray-800 font-semibold">{formatDisplayDate(tempStartDate)}</span>
                </div>
              ) : (
                <div className="italic text-gray-400">Selecciona fecha inicial</div>
              )}
              {tempEndDate ? (
                <div>
                  <span className="font-bold text-gray-400 mr-1">Hasta:</span>
                  <span className="text-gray-800 font-semibold">{formatDisplayDate(tempEndDate)}</span>
                </div>
              ) : tempStartDate ? (
                <div className="italic text-gray-400">Selecciona fecha final</div>
              ) : null}
            </div>

            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-[10px] 2xl:text-[11px] font-bold text-gray-500 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!tempStartDate}
                className={`px-3 py-1 text-[10px] 2xl:text-[11px] font-bold text-white rounded-md transition-all shadow-sm
                  ${tempStartDate ? 'bg-blue-600 hover:bg-blue-700 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
