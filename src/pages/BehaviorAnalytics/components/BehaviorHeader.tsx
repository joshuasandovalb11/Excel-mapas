import React from 'react';

interface BehaviorHeaderProps {
  vendedorName: string;
  startDate: string;
  endDate: string;
  children?: React.ReactNode;
}

export default function BehaviorHeader({
  vendedorName,
  startDate,
  endDate,
  children,
}: BehaviorHeaderProps) {
  if (!vendedorName || !startDate || !endDate) {
    return (
      <div className="h-12 2xl:h-14 bg-white border-b border-gray-200 px-4 2xl:px-6 flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300">
        <h2 className="text-[13px] 2xl:text-[14px] font-semibold text-gray-400">
          Selecciona los filtros para comenzar el análisis
        </h2>
      </div>
    );
  }

  return (
    <div className="h-12 2xl:h-14 bg-white border-b border-gray-200 px-4 2xl:px-6 flex items-center justify-between z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300">
      {/* Lado Izquierdo (Info) */}
      <div className="flex flex-col">
        <h2 className="text-[13px] 2xl:text-[14px] font-bold text-gray-900">
          Análisis de: <span className="text-blue-600">{vendedorName}</span>
        </h2>
        <div className="inline-flex items-center gap-1.5 text-[11px] 2xl:text-[12px] font-medium text-gray-700">
          Periodo: <strong>{startDate}</strong> al <strong>{endDate}</strong>
        </div>
      </div>

      {/* Lado Derecho (Acciones) */}
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
