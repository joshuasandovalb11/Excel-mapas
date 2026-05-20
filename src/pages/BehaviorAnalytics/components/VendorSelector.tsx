/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { Search, User } from 'lucide-react';
import { formatName } from '../../../utils/tripUtils';
import type { Vendor } from '../../../types/behavior.types';

interface VendorSelectorProps {
  vendors: Vendor[];
  selectedVendor: string;
  setSelectedVendor: (id: string) => void;
  isLoading: boolean;
}

export default function VendorSelector({
  vendors,
  selectedVendor,
  setSelectedVendor,
  isLoading,
}: VendorSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVendors = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return vendors;
    return vendors.filter((v: any) => {
      const id = typeof v === 'string' ? v : v?.id || '';
      const nombre = formatName(typeof v === 'string' ? v : v?.nombre || '');
      return (
        id.toLowerCase().includes(term) || nombre.toLowerCase().includes(term)
      );
    });
  }, [vendors, searchTerm]);

  return (
    <div className="space-y-2.5">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-2.5 2xl:pl-3 flex items-center pointer-events-none">
          <Search className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Buscar vendedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-7 2xl:pl-8 pr-2 2xl:pr-3 py-1.5 2xl:py-2 text-[10px] 2xl:text-[11px] bg-white border border-gray-200 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-50"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="max-h-[250px] 2xl:max-h-[300px] overflow-y-auto custom-scrollbar p-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[11px] 2xl:text-[12px] text-gray-400 font-medium">
                Cargando catálogo...
              </span>
            </div>
          ) : filteredVendors.length > 0 ? (
            <div className="space-y-1">
              {filteredVendors.map((v: any, index: number) => {
                const vendorId =
                  typeof v === 'string' ? v : v?.id || `fallback-${index}`;
                const vendorName =
                  typeof v === 'string'
                    ? v
                    : formatName(v?.nombre || 'Sin nombre');
                const isSelected = selectedVendor === vendorId;

                return (
                  <button
                    key={vendorId}
                    onClick={() => setSelectedVendor(vendorId)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all duration-200 group
                      ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-200 shadow-sm'
                          : 'bg-white border border-transparent hover:bg-gray-50'
                      }
                    `}
                  >
                    <div
                      className={`flex-shrink-0 w-5 h-5 2xl:w-6 2xl:h-6 rounded-full flex items-center justify-center transition-colors
                        ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600'
                        }
                      `}
                    >
                      <User className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-blue-600 font-bold text-[11px] 2xl:text-[12px] whitespace-nowrap">
                          ({vendorId})
                        </span>
                        <span
                          className={`text-[11px] 2xl:text-[12px] font-medium truncate
                            ${isSelected ? 'text-blue-900' : 'text-gray-700'}
                          `}
                        >
                          {vendorName}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <span className="text-[11px] 2xl:text-[12px] text-gray-400">
                No se encontraron vendedores
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
