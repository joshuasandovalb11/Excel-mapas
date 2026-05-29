import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface GlobalFiltersProps {
  minStopDuration: number;
  clientRadius?: number;
  onDurationChange: (val: string) => void;
  onRadiusChange?: (val: string) => void;
}

export default function GlobalFilters({
  minStopDuration,
  clientRadius,
  onDurationChange,
  onRadiusChange,
}: GlobalFiltersProps) {
  const [localDuration, setLocalDuration] = useState<number>(minStopDuration);
  const [localRadius, setLocalRadius] = useState<number | undefined>(clientRadius);

  useEffect(() => {
    setLocalDuration(minStopDuration);
  }, [minStopDuration]);

  useEffect(() => {
    setLocalRadius(clientRadius);
  }, [clientRadius]);

  const handleDurationCommit = () => {
    onDurationChange(String(localDuration));
  };

  const handleRadiusCommit = () => {
    if (onRadiusChange && localRadius !== undefined) {
      onRadiusChange(String(localRadius));
    }
  };

  const incrementDuration = () => {
    const newVal = Math.min(60, localDuration + 1);
    setLocalDuration(newVal);
    onDurationChange(String(newVal));
  };

  const decrementDuration = () => {
    const newVal = Math.max(1, localDuration - 1);
    setLocalDuration(newVal);
    onDurationChange(String(newVal));
  };

  const incrementRadius = () => {
    if (localRadius === undefined || !onRadiusChange) return;
    const newVal = Math.min(500, localRadius + 10);
    setLocalRadius(newVal);
    onRadiusChange(String(newVal));
  };

  const decrementRadius = () => {
    if (localRadius === undefined || !onRadiusChange) return;
    const newVal = Math.max(10, localRadius - 10);
    setLocalRadius(newVal);
    onRadiusChange(String(newVal));
  };

  return (
    <div className="space-y-4 2xl:space-y-5">
      <div>
        <div className="flex justify-between items-center mb-1.5 2xl:mb-2">
          <span className="text-[11px] 2xl:text-[12px] font-medium text-gray-700">
            Duración Mínima (Stop)
          </span>
          <span className="text-[10px] 2xl:text-[12px] font-semibold text-blue-600 bg-blue-50 px-1.5 2xl:px-2 py-0.5 rounded border border-blue-100">
            {localDuration} min
          </span>
        </div>
        <div className="flex items-center gap-2 2xl:gap-3">
          <button
            onClick={decrementDuration}
            className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="range"
            min={1}
            max={60}
            value={localDuration}
            onChange={(e) => setLocalDuration(Number(e.target.value))}
            onMouseUp={handleDurationCommit}
            onTouchEnd={handleDurationCommit}
            className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <button
            onClick={incrementDuration}
            className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {clientRadius !== undefined && onRadiusChange && localRadius !== undefined && (
        <div>
          <div className="flex justify-between items-center mb-1.5 2xl:mb-2">
            <span className="text-[11px] 2xl:text-[12px] font-medium text-gray-700">
              Radio de Coincidencia
            </span>
            <span className="text-[10px] 2xl:text-[12px] font-semibold text-blue-600 bg-blue-50 px-1.5 2xl:px-2 py-0.5 rounded border border-blue-100">
              {localRadius} mts
            </span>
          </div>
          <div className="flex items-center gap-2 2xl:gap-3">
            <button
              onClick={decrementRadius}
              className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={localRadius}
              onChange={(e) => setLocalRadius(Number(e.target.value))}
              onMouseUp={handleRadiusCommit}
              onTouchEnd={handleRadiusCommit}
              className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <button
              onClick={incrementRadius}
              className="p-1 bg-white border border-gray-200 rounded shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
