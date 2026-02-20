import {
  Database,
  RefreshCw,
  Users,
  ShoppingCart,
  // DollarSign,
  Briefcase,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useClients } from '../../context/ClientContext';
import { useOrders } from '../../context/OrderContext';
import { usePersistentState } from '../../hooks/usePersistentState';

export default function AdminDashboardView() {
  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();

  const { orders, loading: isLoadingOrders, refreshOrders } = useOrders();

  const [availableVendors, setAvailableVendors] = usePersistentState<string[]>(
    'vt_vendors',
    []
  );

  const stats = useMemo(() => {
    const totalMXN =
      orders?.reduce((acc, order) => acc + (order.importeMN || 0), 0) || 0;
    const totalUSD =
      orders?.reduce((acc, order) => acc + (order.importeUS || 0), 0) || 0;

    const uniqueVendors = masterClients
      ? Array.from(new Set(masterClients.map((c) => c.vendor))).filter(Boolean)
      : [];

    return {
      totalClients: masterClients?.length || 0,
      totalOrders: orders?.length || 0,
      totalMXN,
      totalUSD,
      totalVendors: uniqueVendors.length,
    };
  }, [masterClients, orders]);

  useEffect(() => {
    if (masterClients && masterClients.length > 0) {
      const vendors = Array.from(
        new Set(masterClients.map((c) => c.vendor))
      ).sort();
      if (vendors.length !== availableVendors.length) {
        setAvailableVendors(vendors);
      }
    }
  }, [masterClients, availableVendors.length, setAvailableVendors]);

  // Formateador de moneda
  // const formatMoney = (amount: number, currency: 'MXN' | 'USD') => {
  //   return amount.toLocaleString('es-MX', {
  //     style: 'currency',
  //     currency: currency,
  //     minimumFractionDigits: 2,
  //   });
  // };

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-8">
      {/* HEADER */}
      <div>
        <h3 className="text-2xl font-bold text-gray-800">
          Dashboard Administrativo
        </h3>
        <p className="text-gray-500">
          Resumen general del estado de la base de datos.
        </p>
      </div>

      {/* GRID DE TARJETAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* TARJETA 1: CLIENTES */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Users className="w-6 h-6" />
            </div>
            <button
              onClick={() => refreshClients(true)}
              disabled={isLoadingClients}
              className="text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-colors p-1"
              title="Actualizar Clientes"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingClients ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Clientes</p>
            <h4 className="text-2xl font-bold text-gray-800 mt-1">
              {isLoadingClients ? '...' : stats.totalClients.toLocaleString()}
            </h4>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>

        {/* TARJETA 2: PEDIDOS */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <button
              onClick={() => refreshOrders()}
              disabled={isLoadingOrders}
              className="text-gray-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors p-1"
              title="Actualizar Pedidos"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Pedidos Activos</p>
            <h4 className="text-2xl font-bold text-gray-800 mt-1">
              {isLoadingOrders ? '...' : stats.totalOrders.toLocaleString()}
            </h4>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>

        {/* TARJETA 3: VENTAS (Resumen Financiero) */}
        {/* <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-green-50 rounded-lg text-green-600">
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
              Total
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Ventas Totales</p>
            <div className="mt-1">
              <p className="text-lg font-bold text-gray-800">
                {formatMoney(stats.totalMXN, 'MXN')}
              </p>
              <p className="text-xs text-gray-400 font-medium">
                + {formatMoney(stats.totalUSD, 'USD')}
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-green-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div> */}

        {/* TARJETA 4: VENDEDORES */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">
              Total Vendedores
            </p>
            <h4 className="text-2xl font-bold text-gray-800 mt-1">
              {stats.totalVendors}
            </h4>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-orange-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>
      </div>

      {/* SECCIÓN INFORMATIVA / ESTADO */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-white p-3 rounded-full shadow-sm">
            <Database className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-800">
              Estado de Sincronización
            </h4>
            <p className="text-sm text-gray-500">
              {isLoadingClients || isLoadingOrders
                ? 'Sincronizando datos con el servidor...'
                : 'Todos los sistemas están actualizados y operativos.'}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Botón de Acción Global opcional */}
          <button
            onClick={async () => {
              await refreshClients(true);
              await refreshOrders();
            }}
            disabled={isLoadingClients || isLoadingOrders}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-300 hover:text-gray-900 cursor-pointer disabled:opacity-50 shadow-sm transition-all"
          >
            {isLoadingClients || isLoadingOrders
              ? 'Actualizando...'
              : 'Recargar Todo'}
          </button>
        </div>
      </div>
    </div>
  );
}
