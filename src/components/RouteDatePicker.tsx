import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';

interface RouteDatePickerProps {
  availableDates: { fecha: string; totalRutas: number }[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  disabled?: boolean;
}

export default function RouteDatePicker({
  availableDates,
  selectedDate,
  onSelectDate,
  disabled = false,
}: RouteDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (selectedDate) return new Date(`${selectedDate}T12:00:00Z`);
    if (availableDates.length > 0)
      return new Date(`${availableDates[0].fecha}T12:00:00Z`);
    return new Date();
  });

  useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(new Date(`${selectedDate}T12:00:00Z`));
    }
  }, [selectedDate]);

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
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div key={`empty-${i}`} className="w-7 h-7 2xl:w-8 2xl:h-8"></div>
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const totalRutas = datesMap.get(dateStr);
      const isAvailable = totalRutas !== undefined;
      const isSelected = selectedDate === dateStr;

      days.push(
        <button
          key={dateStr}
          disabled={disabled || !isAvailable}
          onClick={() => !disabled && isAvailable && onSelectDate(dateStr)}
          className={`relative flex items-center justify-center w-7 h-7 2xl:w-8 2xl:h-8 text-[11px] 2xl:text-[12px] transition-all duration-200 rounded-md
            ${isSelected ? 'bg-blue-600 text-white font-semibold shadow-sm' : ''}
            ${!isSelected && isAvailable ? 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm' : ''}
            ${!isAvailable || disabled ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {day}
          {isAvailable && !isSelected && (
            <span className="absolute bottom-1 w-1 h-1 bg-blue-300 rounded-full"></span>
          )}
        </button>
      );
    }
    return days;
  };

  return (
    <>
      <div className="flex items-center gap-1.5 mb-2 2xl:mb-2.5">
        <h4 className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Fechas Disponibles
        </h4>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5 2xl:p-2">
        <div className="flex items-center justify-between mb-2 2xl:mb-3 px-1">
          <div className="flex items-center gap-1 2xl:gap-1.5 text-gray-900">
            <CalendarIcon className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 text-gray-400" />
            <span className="text-[12px] 2xl:text-[13px] font-semibold">
              {monthNames[month]} {year}
            </span>
          </div>
          <div className="flex gap-0.5">
            <button
              onClick={handlePrevMonth}
              disabled={disabled}
              className="p-0.5 2xl:p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            >
              <ChevronLeft className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              disabled={disabled}
              className="p-0.5 2xl:p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            >
              <ChevronRight className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-1 2xl:mb-1.5">
          {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((d) => (
            <div
              key={d}
              className="text-[9px] 2xl:text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1 2xl:gap-y-1.5 gap-x-1 justify-items-center">
          {renderDays()}
        </div>

        {selectedDate && datesMap.has(selectedDate) && (
          <div className="mt-2 2xl:mt-3 pt-1.5 2xl:pt-2 border-t border-gray-100 text-[10px] 2xl:text-[11px] text-center text-gray-500 font-medium flex justify-center items-center gap-1.5">
            <span className="flex w-1 h-1 2xl:w-1.5 2xl:h-1.5 rounded-full bg-black"></span>
            {datesMap.get(selectedDate)} rutas disponibles
          </div>
        )}
      </div>
    </>
  );
}
