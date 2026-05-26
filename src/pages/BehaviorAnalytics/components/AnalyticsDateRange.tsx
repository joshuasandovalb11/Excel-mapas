import PopoverDateRangePicker from './PopoverDateRangePicker';

interface AnalyticsDateRangeProps {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  availableDates: { fecha: string; totalRutas: number }[];
  isLoadingDates: boolean;
}

export default function AnalyticsDateRange({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
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
        onSelectRange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
        availableDates={availableDates}
        disabled={isLoadingDates}
      />
    </div>
  );
}
