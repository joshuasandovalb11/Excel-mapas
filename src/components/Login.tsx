/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import {
  Lock,
  Mail,
  AlertCircle,
  LogIn,
  Eye,
  EyeOff,
  LockKeyhole,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ForgotPassword from './ForgotPasswordModal';
import mapsBg from '../assets/maps.jpg';

interface LoginProps {
  onLoginTransition?: (isTransitioning: boolean) => void;
}

export default function Login({ onLoginTransition }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [buttonSuccess, setButtonSuccess] = useState(false);
  const errorTimerRef = useRef<number | null>(null);
  const [, setIsErrorVisible] = useState(false);

  useEffect(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    if (error) {
      setIsErrorVisible(true);
      errorTimerRef.current = window.setTimeout(() => {
        setIsErrorVisible(false);
        setTimeout(() => setError(null), 500);
      }, 5000);
    } else {
      setIsErrorVisible(false);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [error]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (onLoginTransition) onLoginTransition(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);

      setLoading(false);
      setButtonSuccess(true);

      setTimeout(() => {
        if (onLoginTransition) onLoginTransition(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);

      if (onLoginTransition) onLoginTransition(false);

      setLoading(false);
      setButtonSuccess(false);

      if (err.code === 'auth/invalid-credential') {
        setError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intenta más tarde.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No existe cuenta con este correo.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Error de red. Verifica tu conexión.');
      } else if (err.code === 'auth/user-disabled') {
        setError('Cuenta deshabilitada por el administrador.');
      } else {
        setError('Error al iniciar sesión.');
      }
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* SECCIÓN DEL FORMULARIO */}
      <div className="w-full md:w-[40%] h-full flex flex-col justify-center px-8 md:px-12 relative z-20 bg-white shadow-2xl">
        <div className="w-full max-w-lg mx-auto">
          {/* Header Compacto */}
          <div className="text-center mb-6">
            <div className="bg-blue-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
              <LockKeyhole className="w-10 h-10 text-white animate-pulse" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">
              Acceso al Sistema
            </h2>
            <p className="text-md text-gray-500 mt-1">
              Ingresa las credenciales para continuar.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Mensaje de Error */}
            <div className="h-10 relative">
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute inset-0 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs flex items-center gap-2 border border-red-100 shadow-sm"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate font-medium">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input Correo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 tracking-wide mb-1">
                Correo Electrónico
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white text-sm"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || buttonSuccess}
                />
              </div>
            </div>

            {/* Input Contraseña */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 tracking-wide mb-1">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || buttonSuccess}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer focus:outline-none"
                  disabled={loading || buttonSuccess}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors hover:underline focus:outline-none"
                  disabled={loading || buttonSuccess}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

            {/* Botón Login */}
            <button
              type="submit"
              disabled={loading || buttonSuccess}
              className={`w-full flex justify-center items-center cursor-pointer mt-8 py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white transition-all duration-300 transform active:scale-95
                ${
                  buttonSuccess
                    ? 'bg-green-500 hover:bg-green-600 shadow-green-500/30'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                }
                disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none
              `}
            >
              <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </motion.div>
                ) : buttonSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    ¡Bienvenido!
                  </motion.div>
                ) : (
                  <motion.div
                    key="default"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Iniciar Sesión
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </form>

          {/* Footer discreto */}
          <div className="mt-8 text-center">
            <p className="text-[12px] text-gray-400">
              © {new Date().getFullYear()} Sistema de Rastreo v1.0
            </p>
          </div>
        </div>
      </div>

      {/* SECCIÓN DE LA IMAGEN */}
      <div className="hidden md:block md:w-[65%] h-full relative bg-gray-900">
        <img
          src={mapsBg}
          alt="Fondo Logístico"
          className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-white via-transparent to-transparent opacity-20"></div>
        {/* <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 to-transparent"></div> */}
        <div className="absolute inset-0 bg-gradient-to-bl from-blue-900/90 to-transparent"></div>

        <div className="relative z-10 h-full flex flex-col justify-center p-16 pb-20 text-white max-w-4xl">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <h1 className="text-5xl lg:text-6xl font-extrabold mb-4 leading-tight tracking-tight">
              Control Total de <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white">
                Operaciones Logísticas
              </span>
            </h1>
            <p className="text-blue-100 text-lg lg:text-xl font-light max-w-2xl border-l-4 border-blue-400 pl-6">
              Plataforma para la gestión y visualización del seguimiento de
              vehículos y pedidos.
            </p>
          </motion.div>
        </div>
      </div>

      <ForgotPassword
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        initialEmail={email}
      />
    </div>
  );
}
