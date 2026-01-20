/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useState } from 'react';
import {
  Users,
  ShoppingCart,
  Key,
  ShieldCheck,
  RefreshCw,
  Server,
  Database,
} from 'lucide-react';
import AdminDashboardView from './admin-views/AdminDashboardView';
import AdminClientsUploadView from './admin-views/AdminClientsUploadView';
import AdminOrdersUploadView from './admin-views/AdminOrdersUploadView';
import ChangePasswordView from './admin-views/ChangePasswordView';
import loaderAnimation from '../assets/Globe.json';
import Lottie from 'lottie-react';
import { AnimatePresence, motion } from 'framer-motion';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

type AdminView = 'dashboard' | 'clients' | 'orders' | 'security';
type Status = 'checking' | 'online' | 'offline';

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="w-48 h-48">
        <Lottie
          animationData={loaderAnimation}
          loop={true}
          className="w-full h-full"
        />
      </div>
      <p className="text-sm font-medium text-gray-500 tracking-wide animate-pulse">
        Cargando vista...
      </p>
    </div>
  );
}

export default function AdminPanel() {
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [apiStatus, setApiStatus] = useState<Status>('checking');
  const [dbStatus, setDbStatus] = useState<Status>('checking');

  const menuItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: ShieldCheck },
    { id: 'clients', label: 'Base de Datos Clientes', icon: Users },
    { id: 'orders', label: 'Base de Datos Pedidos', icon: ShoppingCart },
    { id: 'security', label: 'Seguridad y Contraseñas', icon: Key },
  ];

  const checkSystemStatus = async () => {
    setApiStatus('checking');
    setDbStatus('checking');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}/health`, {
        signal: controller.signal,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setApiStatus('online');
        setDbStatus('online');
      } else {
        setApiStatus('online');
        setDbStatus('offline');
      }
    } catch (error: any) {
      setApiStatus('offline');
      setDbStatus('offline');

      if (error.name !== 'AbortError') {
        console.error('System Health Check Error:', error);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      checkSystemStatus();
    }, 1000);

    const interval = setInterval(checkSystemStatus, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-10 flex-shrink-0">
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-[#0022B5] font-bold text-xl">
            <ShieldCheck className="w-7 h-7" />
            <span>Admin Panel</span>
          </div>
          <p className="text-xs text-gray-400 mt-1 font-medium tracking-wide">
            CENTRO DE CONTROL
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as AdminView)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#0022B5] text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 group-hover:text-gray-600'
                  }`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="bg-slate-50 rounded-xl p-2 text-xs border border-slate-100 relative group">
            {/* Header y Botón Refresh */}
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-slate-700 uppercase tracking-wider">
                Estado del Sistema
              </p>
              <button
                onClick={checkSystemStatus}
                className="text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-200 transition-colors p-1"
                title="Actualizar estado"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${apiStatus === 'checking' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            <hr className="border-gray-100 my-2" />

            <div className="space-y-3">
              {/* ESTADO API */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <Server className="w-3.5 h-3.5" />
                  <span>API Node.js</span>
                </div>
                {apiStatus === 'checking' && (
                  <span className="text-gray-400 animate-pulse">...</span>
                )}
                {apiStatus === 'online' && (
                  <div className="flex items-center gap-1.5 text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                    Activo
                  </div>
                )}
                {apiStatus === 'offline' && (
                  <div className="flex items-center gap-1.5 text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Error
                  </div>
                )}
              </div>

              {/* ESTADO SQL */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <Database className="w-3.5 h-3.5" />
                  <span>SQL Server</span>
                </div>
                {dbStatus === 'checking' && (
                  <span className="text-gray-400 animate-pulse">...</span>
                )}
                {dbStatus === 'online' && (
                  <div className="flex items-center gap-1.5 text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    Activo
                  </div>
                )}
                {dbStatus === 'offline' && (
                  <div className="flex items-center gap-1.5 text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Error
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO */}
      <main className="flex-1 relative bg-gray-50/50 flex flex-col min-w-0">
        {/* Contenedor Scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-6">
          <div className="w-full max-w-5xl lg:max-w-6xl mx-auto h-full flex flex-col">
            <Suspense fallback={<PageLoader />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="flex-1 flex flex-col"
                >
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-10 lg:p-12 flex-1 flex flex-col justify-center">
                    <div className="w-full max-w-3xl mx-auto">
                      {currentView === 'dashboard' && <AdminDashboardView />}
                      {currentView === 'clients' && <AdminClientsUploadView />}
                      {currentView === 'orders' && <AdminOrdersUploadView />}
                      {currentView === 'security' && <ChangePasswordView />}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
