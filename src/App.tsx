import { useState } from 'react';
import VehicleTracker from './components/VehicleTracker';
import ReportesView from './components/ReportesView';
import { Map, FileText, RotateCw } from 'lucide-react';

export default function App() {
  const [activeView, setActiveView] = useState<'tracker' | 'reports'>(
    'tracker'
  );

  const buttonClasses = (view: 'tracker' | 'reports') =>
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white shadow-sm">
        <nav className="container mx-auto flex justify-center items-center p-4 relative">
          {/* Boton para el visualizador de rutas */}
          <button
            onClick={() => setActiveView('tracker')}
            className={buttonClasses('tracker')}
          >
            <Map className="w-5 h-5 mr-2" />
            Visualizador de Rutas
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
              p-2 rounded-full text-blue-500 bg-gray-200 hover:bg-blue-500 
              hover:text-white transition-colors hover:animate-spin"
            >
              <RotateCw className="w-6 h-6" />
            </button>
          </div>
        </nav>
      </header>

      <main className="p-4">
        {activeView === 'tracker' ? <VehicleTracker /> : <ReportesView />}
      </main>
    </div>
  );
}
