import { useState, lazy, Suspense } from 'react';
import {
  Map,
  FileText,
  RefreshCcw,
  MapPinHouse,
  HandCoins,
} from 'lucide-react';

const VehicleTracker = lazy(() => import('./components/VehicleTracker'));
const ReportesView = lazy(() => import('./components/ReportesView'));
const Routes = lazy(() => import('./components/Routes'));
const PedidosTracker = lazy(() => import('./components/PedidosTracker'));

// Componente de carga
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-gray-600 font-medium">Cargando página...</p>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<
    'tracker' | 'routes' | 'pedidos' | 'reports'
  >('tracker');

  const buttonClasses = (view: 'tracker' | 'routes' | 'pedidos' | 'reports') =>
    `flex items-center justify-center px-4 py-2 mx-2 rounded-lg transition-colors ${
      activeView === view
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`;

  // Manejo para refrescar la informacion
  const handleRefresh = () => {
    window.sessionStorage.clear();
    window.location.reload();
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'tracker':
        return <VehicleTracker />;
      case 'routes':
        return <Routes />;
      case 'pedidos':
        return <PedidosTracker />;
      case 'reports':
        return <ReportesView />;
      default:
        return <VehicleTracker />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-sm">
      <header className="bg-white shadow-sm">
        <nav className="container mx-auto flex justify-center items-center p-3 relative">
          {/* Boton para el visualizador de rutas */}
          <button
            onClick={() => setActiveView('tracker')}
            className={buttonClasses('tracker')}
          >
            <Map className="w-5 h-5 mr-2" />
            Visualizador de Rutas
          </button>

          {/* Boton para la visualizacion de rutas y clientes de los vendedores */}
          <button
            onClick={() => setActiveView('routes')}
            className={buttonClasses('routes')}
          >
            <MapPinHouse className="w-5 h-5 mr-2" />
            Mapas de Vendedores
          </button>

          {/* Boton para la visualizacion de rutas y clientes de los vendedores */}
          <button
            onClick={() => setActiveView('pedidos')}
            className={buttonClasses('pedidos')}
          >
            <HandCoins className="w-5 h-5 mr-2" />
            Pedidos de Vendedores
          </button>

          {/* Boton para el generador de reportes */}
          <button
            onClick={() => setActiveView('reports')}
            className={buttonClasses('reports')}
          >
            <FileText className="w-5 h-5 mr-2" />
            Generador de Reportes
          </button>

          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {/* Boton para recargar el sistema */}
            <button
              onClick={handleRefresh}
              title="Recargar Aplicación y Limpiar Datos"
              className="
              p-2 rounded-full text-gray-700 bg-gray-200 hover:bg-blue-500 
              hover:text-white transition-colors hover:animate-spin"
            >
              <RefreshCcw className="w-6 h-6" />
            </button>
          </div>
        </nav>
      </header>

      <main className={activeView === 'tracker' ? 'p-2' : 'p-2'}>
        <Suspense fallback={<LoadingSpinner />}>{renderActiveView()}</Suspense>
      </main>
    </div>
  );
}
