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
        setError(
          'No existe un registro de usuario que corresponda al correo electrónico proporcionado.'
        );
      } else if (err.code === 'auth/network-request-failed') {
        setError('Ocurrio un error de red. Verifica tu conexion a internet');
      } else if (err.code === 'auth/user-disabled') {
        setError(
          'La cuenta de este usuario fue desabilitada por un administrador. El usuario no puede acceder a menos que el administrador re-habilite la cuenta'
        );
      } else {
        setError('Error al iniciar sesión. Intenta nuevamente.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-300 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row h-auto min-h-[600px]">
        {/* FORMULARIO DE LOGIN */}
        <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center">
          <div className="text-center mb-2">
            <div className="bg-blue-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <LockKeyhole className="w-10 h-10 text-white animate-pulse" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Acceso al Sistema
            </h2>
            <p className="text-gray-500">Ingresa las credenciales.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Mensaje de Error Animado */}
            <div className="h-14 relative">
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute inset-0 bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || buttonSuccess}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50"
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

              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors hover:underline focus:outline-none disabled:opacity-50"
                  disabled={loading || buttonSuccess}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || buttonSuccess}
              className={`w-full flex justify-center items-center cursor-pointer py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white transition-all duration-200 
                ${
                  buttonSuccess
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-blue-600 hover:bg-blue-700'
                }
                disabled:opacity-70 disabled:cursor-not-allowed
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
        </div>

        {/* IMAGEN Y DESCRIPCIÓN */}
        <div className="hidden md:block md:w-1/2 relative bg-blue-900">
          <img
            src={mapsBg}
            // src="./src/assets/image.png"
            alt="Mapa y Logística"
            className="absolute inset-0 w-full h-full object-cover opacity-95 mix-blend-overlay"
          />

          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 to-blue-800/40"></div>

          <div className="relative z-10 h-full flex flex-col justify-center p-12 text-white">
            <h3 className="text-3xl font-bold mb-4">
              Visualizador de Rutas y Pedidos
            </h3>
            <p className="text-blue-100 text-lg leading-relaxed">
              Gestión y visualización del seguimiento de vehículos y pedidos.
            </p>

            <div className="mt-8 flex gap-3 opacity-80">
              <div className="w-12 h-1 bg-white/30 rounded-full"></div>
              <div className="w-8 h-1 bg-white/30 rounded-full"></div>
              <div className="w-4 h-1 bg-white/30 rounded-full"></div>
            </div>
          </div>
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
