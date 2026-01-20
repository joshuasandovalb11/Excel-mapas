/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  availableDates: string[];
  onApply: (start: string, end: string) => void;
  onClear: () => void;
}

const MONTH_NAMES = [
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

export default function DateRangePicker({
  startDate,
  endDate,
  availableDates,
  onApply,
  onClear,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [positionConfig, setPositionConfig] = useState<{
    style: React.CSSProperties;
    initial: any;
    animate: any;
    exit: any;
  }>({
    style: {},
    initial: {},
    animate: {},
    exit: {},
  });

  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);
  const [viewDate, setViewDate] = useState(new Date());

  // LÓGICA DE POSICIONAMIENTO INTELIGENTE
  const updatePosition = () => {
    if (!isOpen || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const SAFETY_MARGIN = 10;
    const MODAL_WIDTH = 320;

    let newConfig: any = {};

    if (viewportWidth < 768) {
      newConfig = {
        style: {
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '90vw',
          maxWidth: '340px',
          maxHeight: '85vh',
          transform: 'translate(-50%, -50%)',
          overflowY: 'auto',
        },
        initial: { opacity: 0, scale: 0.95, x: '-50%', y: '-40%' },
        animate: { opacity: 1, scale: 1, x: '-50%', y: '-50%' },
        exit: { opacity: 0, scale: 0.95, x: '-50%', y: '-40%' },
      };
    } else {
      const spaceBelow = viewportHeight - rect.bottom - SAFETY_MARGIN;
      const spaceAbove = rect.top - SAFETY_MARGIN;
      const contentHeightEstim = 380;

      let verticalStyle: React.CSSProperties = {};
      let origin = 'center';

      if (spaceBelow < contentHeightEstim && spaceAbove > spaceBelow) {
        verticalStyle = {
          bottom: viewportHeight - rect.top + 8,
          maxHeight: spaceAbove,
        };
        origin = 'bottom left';
      } else {
        verticalStyle = {
          top: rect.bottom + 8,
          maxHeight: spaceBelow,
        };
        origin = 'top left';
      }

      newConfig = {
        style: {
          position: 'fixed',
          left: rect.left,
          width: `${MODAL_WIDTH}px`,
          overflowY: 'auto',
          ...verticalStyle,
        },
        initial: { opacity: 0, scale: 0.95, transformOrigin: origin },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
      };
    }

    setPositionConfig(newConfig);
  };

  const toggleOpen = () => {
    if (!isOpen) {
      setTempStart(startDate);
      setTempEnd(endDate);
      if (startDate) {
        setViewDate(new Date(startDate + 'T12:00:00'));
      } else if (availableDates && availableDates.length > 0) {
        const lastDate = availableDates[availableDates.length - 1];
        setViewDate(new Date(lastDate + 'T12:00:00'));
      }
      setTimeout(updatePosition, 0);
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, { capture: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();
  const handlePrevMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const handleDateClick = (dateStr: string) => {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateStr);
      setTempEnd('');
    } else {
      if (dateStr < tempStart) {
        setTempEnd(tempStart);
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
    }
  };

  const selectAllDates = () => {
    onClear();
    setIsOpen(false);
  };
  const applySelection = () => {
    if (tempStart) {
      onApply(tempStart, tempEnd || tempStart);
      setIsOpen(false);
    }
  };
  const availableSet = useMemo(
    () => new Set(availableDates || []),
    [availableDates]
  );

  const renderDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const days = [];
    for (let i = 0; i < startOffset; i++)
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    for (let d = 1; d <= daysInMonth; d++) {
      const dayString = d < 10 ? `0${d}` : `${d}`;
      const monthString = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
      const fullDate = `${year}-${monthString}-${dayString}`;
      const isAvailable = availableSet.has(fullDate);
      let isSelected = false;
      let isRange = false;
      let isRangeStart = false;
      let isRangeEnd = false;
      if (tempStart && tempEnd) {
        if (fullDate >= tempStart && fullDate <= tempEnd) isRange = true;
        if (fullDate === tempStart) isRangeStart = true;
        if (fullDate === tempEnd) isRangeEnd = true;
      } else if (tempStart && fullDate === tempStart) isSelected = true;

      days.push(
        <button
          key={fullDate}
          onClick={() => isAvailable && handleDateClick(fullDate)}
          disabled={!isAvailable}
          className={`
            h-8 w-full flex items-center justify-center text-xs font-medium rounded-full transition-all relative
            ${!isAvailable ? 'text-gray-300 cursor-not-allowed opacity-50' : 'text-gray-700 hover:bg-blue-100 cursor-pointer'}
            ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700 font-bold z-10' : ''}
            ${isRange ? 'bg-blue-100 text-blue-800 rounded-none' : ''}
            ${isRangeStart ? 'bg-blue-600 text-white rounded-l-full rounded-r-none z-10' : ''}
            ${isRangeEnd ? 'bg-blue-600 text-white rounded-r-full rounded-l-none z-10' : ''}
            ${isRangeStart && isRangeEnd ? 'rounded-full' : ''} 
          `}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  const buttonText =
    startDate && endDate
      ? `${startDate} ➜ ${endDate}`
      : startDate
        ? startDate
        : 'Todas las Fechas';
  const isActive = !!startDate || !!endDate;

  return (
    <>
      <div className="relative w-full">
        <button
          ref={buttonRef}
          onClick={toggleOpen}
          className={`w-full bg-white border rounded-xl px-3 py-3 flex items-center justify-between transition-all group shadow-sm ${
            isOpen
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-gray-200 hover:border-blue-400'
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div className="flex flex-col items-start truncate">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                {isActive ? 'Filtro Actual' : 'Mostrando'}
              </span>
              <span className="text-sm font-bold text-gray-800 truncate">
                {buttonText}
              </span>
            </div>
          </div>
          {isActive ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </div>
          ) : (
            <div
              className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
            >
              <ChevronRight className="w-4 h-4 rotate-90" />
            </div>
          )}
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              {...positionConfig}
              className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 pointer-events-auto"
            >
              <button
                onClick={selectAllDates}
                className={`w-full flex items-center justify-between px-3 py-2.5 mb-3 rounded-lg text-sm font-medium transition-colors border ${
                  !isActive
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  <span>Ver Todas las Fechas</span>
                </div>
                {!isActive && <Check className="w-4 h-4" />}
              </button>

              <div className="border-t border-gray-100 mb-3"></div>

              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-600"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-gray-800">
                  {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-600"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(
                  (day) => (
                    <div
                      key={day}
                      className="h-6 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase"
                    >
                      {day}
                    </div>
                  )
                )}
              </div>

              <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 mb-4">
                {renderDays()}
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 px-1">
                  <span>Selección:</span>
                  <span className="font-bold text-gray-800">
                    {tempStart ? tempStart : '--'}{' '}
                    {tempEnd ? ` a ${tempEnd}` : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={applySelection}
                    disabled={!tempStart}
                    className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-200 disabled:opacity-50"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </>
  );
}
