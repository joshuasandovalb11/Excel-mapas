import { useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onApply: (start: string, end: string) => void;
  onClear: () => void;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onApply,
  onClear,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  const handleApply = () => {
    onApply(localStart, localEnd);
    setIsOpen(false);
  };

  // Texto para mostrar en el botón principal
  const buttonText =
    startDate && endDate
      ? `${startDate} - ${endDate}`
      : startDate
        ? startDate
        : 'Seleccionar Fechas';

  const isActive = !!startDate || !!endDate;

  return (
    <div className="relative">
      {/* Botón Principal */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
          isActive
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        <CalendarIcon className="w-4 h-4" />
        <span>{buttonText}</span>
        {isActive && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onClear();
              setLocalStart('');
              setLocalEnd('');
            }}
            className="ml-1 p-0.5 hover:bg-blue-200 rounded-full cursor-pointer"
          >
            <X className="w-3 h-3" />
          </div>
        )}
      </button>

      {/* Popover Flotante */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full mt-2 left-0 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-72"
            >
              <h4 className="text-sm font-bold text-gray-800 mb-3">
                Rango de Fechas
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={!localStart && !localEnd}
                    className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    Aplicar Filtro
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
