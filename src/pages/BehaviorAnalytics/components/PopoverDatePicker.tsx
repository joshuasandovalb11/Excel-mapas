/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import useOnClickOutside from '../../../hooks/useOnClickOutside';
import DatePicker from '../../../components/DatePicker';

interface PopoverDatePickerProps {
  selectedDate: string;
  onSelectDate: (v: string) => void;
  availableDates: { fecha: string; totalRutas: number }[];
  label: string;
  disabled?: boolean;
}

export default function PopoverDatePicker({
  selectedDate,
  onSelectDate,
  availableDates,
  label,
  disabled = false,
}: PopoverDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<any>(null);

  useOnClickOutside(containerRef, () => setIsOpen(false));

  const handleSelect = (date: string) => {
    onSelectDate(date);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-1.5 2xl:py-2 border border-gray-200 rounded-lg text-[11px] 2xl:text-[13px] bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400 shrink-0" />
          <span
            className={
              selectedDate ? 'text-gray-900 font-medium' : 'text-gray-400'
            }
          >
            {selectedDate || `Seleccionar ${label.toLowerCase()}`}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 mt-2 overflow-hidden w-[250px] 2xl:w-[290px] animate-fadeIn origin-top-left shadow-2xl">
          <DatePicker
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelectDate={handleSelect}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
