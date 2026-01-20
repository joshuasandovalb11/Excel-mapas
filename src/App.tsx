import { useState, lazy, Suspense, useRef, useEffect } from 'react';
import {
  Map,
  // FileText,
  RefreshCcw,
  MapPinHouse,
  HandCoins,
  TriangleAlert,
  User,
  ChevronDown,
  KeyRound,
  LogOut,
  ShieldCheck, // Icono para el Panel Admin
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import RefreshSystem from './components/RefreshSystemModal';
import ChangePassword from './components/ChangePasswordModal';
import { motion, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderAnimation from './assets/Globe.json';
import { ClientProvider } from './context/ClientContext';
import { OrderProvider } from './context/OrderContext';
import AdminPanel from './components/AdminPanel';

const VehicleTracker = lazy(() => import('./components/VehicleTracker'));
// const ReportesView = lazy(() => import('./components/ReportesView'));
const Routes = lazy(() => import('./components/Routes'));
const PedidosTracker = lazy(() => import('./components/PedidosTracker'));

type ViewType = 'tracker' | 'routes' | 'pedidos' | 'reports' | 'admin';

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
  const [isRefreshSystemModalOpen, setIsRefreshSystemModalOpen] =
    useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [activeView, setActiveView] = useState<ViewType>('tracker');

  const isAdmin = userRole === 'admin';

  const tabs = [
    { id: 'tracker', label: 'Visualizador de Rutas', icon: Map },
    { id: 'routes', label: 'Mapas de Vendedores', icon: MapPinHouse },
    { id: 'pedidos', label: 'Pedidos de Vendedores', icon: HandCoins },
    // { id: 'reports', label: 'Generador de Reportes', icon: FileText },
  ] as const;

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

  const renderActiveView = () => {
    switch (activeView) {
      case 'tracker':
        return <VehicleTracker />;
      case 'routes':
        return <Routes />;
      case 'pedidos':
        return <PedidosTracker />;
      // case 'reports':
      //   return <ReportesView />;
      case 'admin':
        return isAdmin ? <AdminPanel /> : <VehicleTracker />;
      default:
        return <VehicleTracker />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-sm flex flex-col">
      <ClientProvider>
        <OrderProvider>
          {/* HEADER */}
          <header className="bg-white shadow-sm relative z-20 flex-shrink-0">
            <nav className="mx-auto flex justify-center items-center p-2 relative">
              {/* TABS DE NAVEGACIÓN */}
              <div className="relative flex gap-1 bg-gray-200 p-1 rounded-xl">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeView === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as ViewType)}
                      className="relative px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-2"
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute inset-0 bg-white rounded-lg shadow-sm border border-gray-100"
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}

                      {/* ESTILO DE BORDE */}
                      <AnimatePresence>
                        {isActive && (
                          <motion.svg
                            key="border-sweep"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            viewBox="0 0 100 40"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id="gemini-gradient"
                                gradientUnits="userSpaceOnUse"
                                x1="0"
                                y1="0"
                                x2="100"
                                y2="0"
                              >
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#22d3ee" />
                              </linearGradient>
                            </defs>

                            <motion.rect
                              x="0"
                              y="0.5"
                              width="100"
                              height="39"
                              rx="5"
                              ry="5"
                              fill="none"
                              stroke="url(#gemini-gradient)"
                              strokeWidth="2"
                              strokeDasharray="50 410"
                              initial={{
                                strokeDashoffset: 500,
                                opacity: 1,
                              }}
                              animate={{
                                strokeDashoffset: 0,
                                opacity: 0,
                              }}
                              transition={{
                                duration: 2.5,
                                ease: 'easeInOut',
                              }}
                            />
                          </motion.svg>
                        )}
                      </AnimatePresence>

                      <span
                        className={`relative z-10 flex items-center gap-2 font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </span>
                    </button>
                  );
                })}

                {/* TAB EXTRA SOLO PARA ADMIN */}
                {isAdmin && activeView === 'admin' && (
                  <button
                    onClick={() => setActiveView('admin')}
                    className="relative px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-2"
                  >
                    {activeView === 'admin' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-indigo-50 rounded-lg border border-indigo-100"
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}

                    {/* ESTILO DE BORDE */}
                    <AnimatePresence>
                      {activeView === 'admin' && (
                        <motion.svg
                          key="border-sweep"
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          viewBox="0 0 100 40"
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <linearGradient
                              id="gemini-gradient"
                              gradientUnits="userSpaceOnUse"
                              x1="0"
                              y1="0"
                              x2="100"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#22d3ee" />
                            </linearGradient>
                          </defs>

                          <motion.rect
                            x="0"
                            y="0.5"
                            width="100"
                            height="39"
                            rx="5"
                            ry="5"
                            fill="none"
                            stroke="url(#gemini-gradient)"
                            strokeWidth="2"
                            strokeDasharray="50 410"
                            initial={{
                              strokeDashoffset: 500,
                              opacity: 1,
                            }}
                            animate={{
                              strokeDashoffset: 0,
                              opacity: 0,
                            }}
                            transition={{
                              duration: 2.5,
                              ease: 'easeInOut',
                            }}
                          />
                        </motion.svg>
                      )}
                    </AnimatePresence>

                    <span
                      className={`relative z-10 flex items-center gap-2 font-medium ${activeView === 'admin' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span className="hidden sm:inline">Administrador</span>
                    </span>
                  </button>
                )}
              </div>

              {/* ÁREA DE USUARIO */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className={`flex items-center cursor-pointer justify-between gap-2 px-3 py-1.5 rounded-full border transition-all ${
                      isUserMenuOpen
                        ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-6 h-6 bg-blue-100 ring-1 ring-blue-700 rounded-full flex items-center justify-center text-blue-700 shadow-sm">
                      <User className="w-4 h-4" />
                    </div>
                    <p className="font-semibold">Cuenta</p>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* MENÚ DESPLEGABLE */}
                  <AnimatePresence>
                    {isUserMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden origin-top-right"
                      >
                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                          <p className="text-xs font-bold text-gray-400 uppercase">
                            Usuario
                          </p>
                          <p
                            className="text-sm font-semibold text-gray-800 truncate"
                            title={user.email || ''}
                          >
                            {user.email}
                          </p>
                          {isAdmin && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">
                              ADMINISTRADOR
                            </span>
                          )}
                        </div>

                        <div className="p-1.5">
                          {/* REFRESCAR SISTEMA */}
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setIsRefreshSystemModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 cursor-pointer text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg flex items-center gap-3 transition-colors"
                          >
                            <RefreshCcw className="w-4 h-4" />
                            Recargar Datos
                          </button>

                          {/* OPCIÓN ADMIN */}
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setActiveView('admin');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 cursor-pointer text-sm text-indigo-700 hover:bg-indigo-50 rounded-lg flex items-center gap-3 transition-colors mb-1"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              Panel Administrador
                            </button>
                          )}

                          {/* CAMBIAR CONTRASEÑA */}
                          {!isAdmin && (
                            <button
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                setIsPasswordModalOpen(true);
                              }}
                              className="w-full text-left px-3 py-2 cursor-pointer text-sm text-blue-600 hover:bg-blue-100 rounded-lg flex items-center gap-3 transition-colors"
                            >
                              <KeyRound className="w-4 h-4" />
                              Cambiar Contraseña
                            </button>
                          )}

                          <div className="h-px bg-gray-100 my-1 mx-2"></div>

                          {/* CERRAR SESIÓN */}
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setIsLogoutModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 cursor-pointer text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-3 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Cerrar Sesión
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </nav>
          </header>

          {/* ÁREA PRINCIPAL DE CONTENIDO */}
          <main className="flex-1 overflow-hidden relative bg-gray-100">
            <Suspense fallback={<PageLoader />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  className="w-full h-full p-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
                  {renderActiveView()}
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </main>

          {/* MODALES FLOTANTES */}
          <AnimatePresence>
            {isLogoutModalOpen && (
              <motion.div
                className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLogoutModalOpen(false)}
              >
                <motion.div
                  className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
                  initial={{ scale: 0.9, opacity: 0, x: -400 }}
                  animate={{ scale: 1, opacity: 1, x: 0 }}
                  exit={{ scale: 0.95, opacity: 0, x: 400 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <TriangleAlert className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                      ¿Cerrar Sesión?
                    </h3>
                    <p className="text-sm text-gray-500 mb-6">
                      ¿Estás seguro? Tendrás que volver a ingresar tus
                      credenciales.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setIsLogoutModalOpen(false)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          setIsLogoutModalOpen(false);
                          logout();
                        }}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                      >
                        Salir
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Modales para usuarios no admin */}
          <RefreshSystem
            isOpen={isRefreshSystemModalOpen}
            onClose={() => setIsRefreshSystemModalOpen(false)}
          />
          <ChangePassword
            isOpen={isPasswordModalOpen}
            onClose={() => setIsPasswordModalOpen(false)}
          />
        </OrderProvider>
      </ClientProvider>
    </div>
  );
}
