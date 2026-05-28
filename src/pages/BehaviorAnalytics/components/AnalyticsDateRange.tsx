import PopoverDateRangePicker from './PopoverDateRangePicker';

interface AnalyticsDateRangeProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  availableDates: { fecha: string; totalRutas: number }[];
  isLoadingDates: boolean;
}

export default function AnalyticsDateRange({
  startDate,
  endDate,
  onChange,
  availableDates,
  isLoadingDates,
}: AnalyticsDateRangeProps) {
  return (
    <div className="relative">
      <label className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
        Rango de Fechas
      </label>
      <PopoverDateRangePicker
        startDate={startDate}
        endDate={endDate}
        onSelectRange={onChange}
        availableDates={availableDates}
        disabled={isLoadingDates}
      />
    </div>
  );
}
