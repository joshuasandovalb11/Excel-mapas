import { useState, lazy, Suspense, useRef, useEffect } from 'react';
import {
  Map,
  FileText,
  RefreshCcw,
  MapPinHouse,
  HandCoins,
  TriangleAlert,
  User,
  ChevronDown,
  KeyRound,
  LogOut,
  DatabaseBackup,
} from 'lucide-react';
import AdminClientsUpload from './components/AdminClientsUpload';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import ChangePassword from './components/ChangePasswordModal';
import { motion, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderAnimation from './assets/Globe.json';
import { clear } from 'idb-keyval';
import { ClientProvider } from './context/ClientContext';

const VehicleTracker = lazy(() => import('./components/VehicleTracker'));
const ReportesView = lazy(() => import('./components/ReportesView'));
const Routes = lazy(() => import('./components/Routes'));
const PedidosTracker = lazy(() => import('./components/PedidosTracker'));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="w-64 h-64">
        <Lottie
          animationData={loaderAnimation}
          loop={true}
          className="w-full h-full"
        />
      </div>

      <p className="text-sm font-medium text-gray-500 tracking-wide animate-pulse">
        Cargando página...
      </p>
    </div>
  );
}

export default function App() {
  const { user, userRole, loading, logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isLoginTransition, setIsLoginTransition] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const [activeView, setActiveView] = useState<
    'tracker' | 'routes' | 'pedidos' | 'reports'
  >('tracker');

  const canManageData = userRole === 'admin';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) return <PageLoader />;

  if (!user || isLoginTransition) {
    return <Login onLoginTransition={setIsLoginTransition} />;
  }

  const buttonClasses = (view: 'tracker' | 'routes' | 'pedidos' | 'reports') =>
    `flex items-center cursor-pointer justify-center px-4 py-2 mx-2 rounded-lg transition-colors ${
      activeView === view
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`;

  const handleRefresh = async () => {
    const confirm = window.confirm(
      '¿Deseas reiniciar la aplicación y borrar todos los datos guardados?'
    );
    if (confirm) {
      window.sessionStorage.clear();
      window.localStorage.clear();
      await clear();
      window.location.reload();
    }
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
      <ClientProvider>
        <header className="bg-white shadow-sm relative z-20">
          <nav className="mx-auto flex justify-center items-center p-3 relative">
            <button
              onClick={() => setActiveView('tracker')}
              className={buttonClasses('tracker')}
            >
              <Map className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Visualizador de Rutas</span>
            </button>

            <button
              onClick={() => setActiveView('routes')}
              className={buttonClasses('routes')}
            >
              <MapPinHouse className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Mapas de Vendedores</span>
            </button>

            <button
              onClick={() => setActiveView('pedidos')}
              className={buttonClasses('pedidos')}
            >
              <HandCoins className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Pedidos de Vendedores</span>
            </button>

            <button
              onClick={() => setActiveView('reports')}
              className={buttonClasses('reports')}
            >
              <FileText className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Generador de Reportes</span>
            </button>

            {/* ÁREA DERECHA */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
              {/* Botón Refresh */}
              <button
                onClick={handleRefresh}
                title="Recargar Aplicación"
                className="p-2 rounded-full cursor-pointer border border-gray-200 bg-gray-200 text-gray-600
              hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 hover:ring-2 hover:ring-blue-100 transition-colors hover:animate-spin"
              >
                <RefreshCcw className="w-5 h-5" />
              </button>

              {/* MENÚ DESPLEGABLE DE USUARIO */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={`flex items-center cursor-pointer gap-2 pl-3 pr-2 py-1.5 rounded-full border transition-all ${
                    isUserMenuOpen
                      ? 'bg-blue-50 border-blue-200 text-blue-700 ring-2 ring-blue-100'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium hidden sm:block">
                    Cuenta
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown cuenta */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                    {/* Info del Usuario */}
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                        Usuario
                      </p>
                      <p
                        className="text-sm font-medium text-gray-800 truncate"
                        title={user.email || ''}
                      >
                        {user.email}
                      </p>
                    </div>

                    {/* Opciones */}
                    <div className="p-1">
                      {/* 3. BOTÓN DE ADMIN */}
                      {canManageData && (
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setIsAdminModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2.5 cursor-pointer text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 rounded-lg flex items-center gap-3 transition-colors"
                        >
                          <DatabaseBackup className="w-4 h-4" />
                          Administrar Datos
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsPasswordModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2.5 cursor-pointer text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <KeyRound className="w-4 h-4" />
                        Cambiar Contraseña
                      </button>

                      <div className="h-px bg-gray-100 my-1 mx-2"></div>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsLogoutModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2.5 cursor-pointer text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </header>

        <main className={activeView === 'tracker' ? 'p-2' : 'p-2'}>
          <Suspense fallback={<PageLoader />}>{renderActiveView()}</Suspense>
        </main>

        {/* 4. RENDERIZAR EL MODAL DE ADMIN */}
        {canManageData && (
          <AdminClientsUpload
            isOpen={isAdminModalOpen}
            onClose={() => setIsAdminModalOpen(false)}
          />
        )}

        {/* MODAL DE CERRAR SESION */}
        <AnimatePresence>
          {isLogoutModalOpen && (
            <motion.div
              className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsLogoutModalOpen(false)}
            >
              <motion.div
                className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-4">
                    <TriangleAlert className="h-8 w-8 text-red-600" />
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    ¿Cerrar Sesión?
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                    ¿Estás seguro de que quieres salir? Tendrás que volver a
                    ingresar tus credenciales.
                  </p>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setIsLogoutModalOpen(false)}
                      className="flex-1 px-4 py-2.5 cursor-pointer text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        setIsLogoutModalOpen(false);
                        logout();
                      }}
                      className="flex-1 px-4 py-2.5 cursor-pointer text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
                    >
                      Salir
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL DE CAMBIO DE CONTRASEÑA */}
        <ChangePassword
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
        />
      </ClientProvider>
    </div>
  );
}
