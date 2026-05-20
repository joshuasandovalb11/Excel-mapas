import PopoverDatePicker from './PopoverDatePicker';

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
    <div className="space-y-3">
      <div className="relative">
        <label className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
          Fecha Desde
        </label>
        <PopoverDatePicker
          selectedDate={startDate}
          onSelectDate={setStartDate}
          availableDates={availableDates}
          disabled={isLoadingDates}
          label="Desde"
        />
      </div>

      <div className="relative">
        <label className="text-[10px] 2xl:text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
          Fecha Hasta
        </label>
        <PopoverDatePicker
          selectedDate={endDate}
          onSelectDate={setEndDate}
          availableDates={availableDates}
          disabled={isLoadingDates}
          label="Hasta"
        />
      </div>
    </div>
  );
}
