import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import type { DailyBreakdown } from '../../../types/behavior.types';

interface DateCarouselProps {
  data: DailyBreakdown[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function DateCarousel({
  data,
  selectedDate,
  onSelectDate,
}: DateCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => {
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [data]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return {
      dayNum: day,
      month: date
        .toLocaleDateString('es-ES', { month: 'short' })
        .toUpperCase()
        .replace('.', ''),
      weekday: date
        .toLocaleDateString('es-ES', { weekday: 'short' })
        .toUpperCase()
        .replace('.', ''),
    };
  };

  return (
    <div className="relative w-full px-8">
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 transition-colors"
          title="Scroll anterior"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="overflow-hidden pb-4 w-full snap-x scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <div className="flex w-max min-w-full justify-center gap-2 sm:gap-3 px-8">
          {data.map((day) => {
            const isSelected = day.fecha === selectedDate;
            const { dayNum, month, weekday } = formatDate(day.fecha);

            return (
              <button
                key={day.fecha}
                onClick={() => onSelectDate(day.fecha)}
                className={`snap-start flex-shrink-0 flex flex-col items-center justify-center w-10 h-13 2xl:w-12 2xl:h-15 rounded-xl border-2 transition-all duration-200 ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md transform scale-105'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-blue-500 hover:bg-blue-50/30'
                }`}
              >
                <span
                  className={`text-[8px] 2xl:text-[10px] font-bold ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}
                >
                  {month}
                </span>
                <span className="text-sm 2xl:text-lg font-black leading-tight">
                  {dayNum}
                </span>
                <span
                  className={`text-[8px] 2xl:text-[10px] font-medium ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}
                >
                  {weekday}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 transition-colors"
          title="Scroll siguiente"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      )}
    </div>
  );
}
