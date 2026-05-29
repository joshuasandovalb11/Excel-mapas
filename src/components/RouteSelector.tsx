import { useState, useMemo } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import { formatName } from '../utils/tripUtils';
import type { RutaResumen } from '../types/route.types';

interface RouteSelectorProps {
  routes: RutaResumen[];
  selectedRouteId?: number | null;
  onSelectRoute?: (id: number) => void;
  selectedDate?: string | null;
  isLoading?: boolean;
  selectionMode?: 'single' | 'multiple';
  selectedIds?: number[];
  onToggleRoute?: (id: number) => void;
}

export default function RouteSelector({
  routes,
  selectedRouteId,
  onSelectRoute,
  selectedDate,
  isLoading = false,
  selectionMode = 'single',
  selectedIds = [],
  onToggleRoute,
}: RouteSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSortedRoutes = useMemo(() => {
    if (!routes) return [];

    let processed = [...routes];

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      processed = processed.filter((r) => {
        const idMatch = String(r.vendedor || '')
          .toLowerCase()
          .includes(query);
        const nameMatch = String(r.nombreVendedor || '')
          .toLowerCase()
          .includes(query);
        return idMatch || nameMatch;
      });
    }

    processed.sort((a, b) => {
      const nameA = a.nombreVendedor
        ? formatName(a.nombreVendedor)
        : 'Sin Vendedor Asignado';
      const nameB = b.nombreVendedor
        ? formatName(b.nombreVendedor)
        : 'Sin Vendedor Asignado';
      return nameA.localeCompare(nameB);
    });

    return processed;
  }, [routes, searchQuery]);

  if (!selectedDate) {
    return (
      <div className="mt-3 2xl:mt-4 flex flex-col items-center justify-center h-[100px] 2xl:h-[120px] bg-gray-50 border border-gray-200 border-dashed rounded-lg p-3 2xl:p-4 text-center">
        <div className="p-1 2xl:p-1.5 bg-white border border-gray-200 rounded-md shadow-sm mb-1.5 2xl:mb-2">
          <CalendarClock className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400" />
        </div>
        <p className="text-[11px] 2xl:text-[12px] font-semibold text-gray-700">
          Ningún día seleccionado
        </p>
        <p className="text-[10px] 2xl:text-[11px] text-gray-500 mt-0.5">
          Elige una fecha para ver las rutas.
        </p>
      </div>
    );
  }

  if (!routes || routes.length === 0) {
    return (
      <div className="mt-3 2xl:mt-4 flex flex-col items-center justify-center h-[80px] 2xl:h-[100px] bg-gray-50 border border-gray-200 rounded-lg p-3 2xl:p-4 text-center">
        <p className="text-[11px] 2xl:text-[12px] font-medium text-gray-500">
          No hay vehículos registrados en este día.
        </p>
      </div>
    );
  }

  const activeBorderClass = 'border-blue-600';
  const activeRingClass = 'ring-blue-600/10';
  const activeBgClass = 'bg-blue-600';
  const activeTextDarkClass = 'text-blue-700';
  const activeTextClass = 'text-blue-600';
  const focusRingClass = 'focus:ring-blue-500 focus:border-blue-500';
  const checkboxAccentClass = 'accent-blue-600';

  return (
    <div className="mt-3 2xl:mt-4 flex flex-col h-full max-h-[300px] 2xl:max-h-[350px]">
      <div className="flex items-center gap-1.5 mb-2 2xl:mb-2.5">
        <h4 className="text-[10px] 2xl:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Vehículos en Ruta ({filteredAndSortedRoutes.length})
        </h4>
      </div>

      <div className="relative mb-2 2xl:mb-3">
        <div className="absolute inset-y-0 left-0 pl-2 2xl:pl-2.5 flex items-center pointer-events-none">
          <Search className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por ID o Nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isLoading}
          className={`w-full pl-7 2xl:pl-8 pr-2 2xl:pr-3 py-1.5 2xl:py-2 text-[10px] 2xl:text-[11px] bg-white border border-gray-200 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors disabled:bg-gray-50 ${focusRingClass}`}
        />
      </div>

      <div
        className={`flex-1 overflow-y-auto pr-1 space-y-1.5 2xl:space-y-2 custom-scrollbar ${isLoading ? 'pointer-events-none opacity-70' : ''}`}
        aria-busy={isLoading}
      >
        {filteredAndSortedRoutes.length === 0 ? (
          <p className="text-center text-[10px] 2xl:text-[11px] text-gray-500 mt-3 2xl:mt-4">
            No se encontraron coincidencias.
          </p>
        ) : (
          filteredAndSortedRoutes.map((r) => {
            const isSelected = selectionMode === 'multiple'
              ? selectedIds.includes(r.id_ruta)
              : selectedRouteId === r.id_ruta;

            const vendorName = r.nombreVendedor
              ? formatName(r.nombreVendedor)
              : 'Sin Vendedor Asignado';

            const handleClick = () => {
              if (isLoading) return;
              if (selectionMode === 'multiple') {
                onToggleRoute && onToggleRoute(r.id_ruta);
              } else {
                onSelectRoute && onSelectRoute(r.id_ruta);
              }
            };

            return (
              <button
                key={r.id_ruta}
                onClick={handleClick}
                disabled={isLoading}
                className={`w-full text-left py-1.5 2xl:py-2 px-2 2xl:px-3 rounded-md 2xl:rounded-lg border transition-all duration-200 group relative overflow-hidden flex items-center gap-2
                  ${isSelected
                    ? `bg-gray-50 ${activeBorderClass} shadow-xs ring-1 ${activeRingClass}`
                    : 'bg-white border-gray-200 shadow-xs hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                {isSelected && (
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-md 2xl:rounded-l-lg ${activeBgClass}`}></div>
                )}

                {selectionMode === 'multiple' && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => { }}
                    className={`w-3.5 h-3.5 rounded border-gray-300 pointer-events-none ${checkboxAccentClass} flex-shrink-0 ${isSelected ? '' : 'ml-1'}`}
                  />
                )}

                <div className={`flex flex-col gap-0.5 2xl:gap-1 w-full ${selectionMode === 'multiple' && !isSelected ? '' : (selectionMode === 'single' ? '' : 'pl-0.5')}`}>
                  <div className="flex justify-between items-center pl-1 2xl:pl-1.5 w-full">
                    <span
                      className={`text-[10px] 2xl:text-[11px] font-semibold truncate pr-2 ${isSelected ? 'text-gray-900' : 'text-gray-700'
                        }`}
                    >
                      {r.vehiculo}
                    </span>
                    <span className="text-[9px] 2xl:text-[11px] font-mono text-gray-600 bg-gray-50 border border-gray-200 px-1 2xl:px-1.5 py-[1px] 2xl:py-0.5 rounded flex-shrink-0">
                      {r.placa}
                    </span>
                  </div>

                  <div className="flex gap-1 items-center pl-1 2xl:pl-1.5 w-full">
                    <span
                      className={`text-[11px] 2xl:text-[12px] font-bold truncate whitespace-nowrap ${isSelected ? activeTextDarkClass : activeTextClass
                        }`}
                    >
                      ({r.vendedor})
                    </span>
                    <span
                      className={`text-[11px] 2xl:text-[12px] font-semibold truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'
                        }`}
                    >
                      {vendorName}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

