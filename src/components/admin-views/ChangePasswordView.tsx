/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Key,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ArrowDownToLine,
  Check,
} from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { AnimatePresence, motion } from 'framer-motion';

export default function ChangePasswordView() {
  const { changePassword, logout, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Validaciones en tiempo real
  const hasMinLength = newPassword.length >= 6;
  const hasNoSpaces = !/\s/.test(newPassword) && newPassword.length > 0;
  const passwordsMatch =
    newPassword === confirmPassword && newPassword.length > 0;

  // useEffect para manejar la visibilidad y el temporizador del toast
  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    if (error) {
      setIsToastVisible(true);

      toastTimerRef.current = window.setTimeout(() => {
        setIsToastVisible(false);

        setTimeout(() => {
          setError(null);
        }, 500);
      }, 5000);
    } else {
      setIsToastVisible(false);
    }

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [error]);

  const handleCloseToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setIsToastVisible(false);
    setTimeout(() => {
      setError(null);
    }, 500);
  };

  const resetView = async () => {
    setError(null);
    window.location.reload();
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const cleanValue = e.target.value.replace(/\s/g, '');
    setter(cleanValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    if (/\s/.test(newPassword)) {
      setError('La contraseña no puede contener espacios en blanco.');
      return;
    }

    if (newPassword.length < 6) {
      setError('La contraseña nueva debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      if (auth.currentUser && user?.email) {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      } else {
        throw new Error('No hay sesión activa.');
      }

      if (currentPassword === newPassword) {
        setError('La nueva contraseña no puede ser igual a la anterior.');
        return;
      }

      await changePassword(newPassword);

      setSuccess(true);
    } catch (error: any) {
      console.error(error);
      const errorCode = error.code;

      if (
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/wrong-password'
      ) {
        setError('La contraseña actual es incorrecta.');
      } else if (errorCode === 'auth/requires-recent-login') {
        setError('Por seguridad, tu sesión expiró. Redirigiendo...');
        setTimeout(async () => {
          await logout();
        }, 2000);
      } else {
        setError('Error al actualizar. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-8 text-center"
        >
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <CheckCircle className="w-16 h-16 text-green-600" />
          </div>
          <h4 className="text-xl font-bold text-gray-800">
            ¡Contraseña Actualizada!
          </h4>
          <p className="text-gray-600 mt-2">
            Tu contraseña se ha cambiado correctamente.
          </p>
          <div className="py-8">
            <button
              onClick={resetView}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:scale-105 font-medium cursor-pointer"
            >
              Recargar Pagina
            </button>
          </div>
        </motion.div>
      ) : (
        <>
          {/* HEADER */}
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-[#2951FF] animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-gray-800">
              Cambiar Contraseña
            </h3>
            <p className="text-gray-500 mt-2">
              Actualiza tus credenciales de acceso.
            </p>
          </div>

          {/* FORMULARIO */}
          <div className="px-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo: Correo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-blue-500" />
                  </div>
                  <span className="font-semibold text-gray-500 bg-blue-50 block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg">
                    {user?.email || 'Admin'}
                  </span>
                </div>
              </div>

              {/* Campo: Contraseña Actual */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña Actual
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => handleInputChange(e, setCurrentPassword)}
                    required
                    className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0022B5] transition-colors"
                    placeholder="Ingresa tu contraseña actual"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showCurrent ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <hr className="border-gray-200 my-4" />

              {/* Campo: Nueva Contraseña */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Key className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => handleInputChange(e, setNewPassword)}
                      required
                      className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0022B5] transition-colors"
                      placeholder="Escribe la nueva contrseña"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showNew ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Campo: Confirmar Contraseña */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar Nueva Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Key className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => handleInputChange(e, setConfirmPassword)}
                      required
                      className={`block w-full pl-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0022B5] transition-colors ${
                        confirmPassword && newPassword !== confirmPassword
                          ? 'border-red-300 bg-red-50 focus:ring-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder="Repite la nueva contraseña"
                    />
                  </div>
                </div>
              </div>

              {/* Validadores Visuales */}
              <div className="mt-6 space-y-2">
                <RequirementItem
                  met={hasMinLength}
                  label="Mínimo 6 caracteres"
                />
                <RequirementItem
                  met={hasNoSpaces}
                  label="Sin espacios en blanco"
                />
                <RequirementItem
                  met={passwordsMatch}
                  label="Las contraseñas coinciden"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={
                    loading || !hasMinLength || !hasNoSpaces || !passwordsMatch
                  }
                  className={`w-full flex cursor-pointer justify-center items-center py-3 px-4 border border-transparent 
                    rounded-lg shadow-sm text-sm font-bold text-white bg-[#0022B5] hover:bg-[#00187D] 
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0022B5] transition-all 
                    ${
                      loading ||
                      !hasMinLength ||
                      !hasNoSpaces ||
                      !passwordsMatch
                        ? 'opacity-70 cursor-not-allowed'
                        : ''
                    }`}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-5 h-5 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* ERROR */}
            <AnimatePresence>
              {error && (
                <div
                  className={`fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-1 max-w-md z-50 transition-all duration-500 ease-in-out ${
                    isToastVisible
                      ? 'opacity-100 translate-x-0'
                      : 'opacity-0 translate-x-10'
                  }`}
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                  <button
                    onClick={handleCloseToast}
                    className="ml-6 hover:bg-red-600 p-1 rounded"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

// Subcomponente para los requisitos
const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <div
    className={`flex items-center gap-2 text-sm transition-colors duration-300 ${
      met ? 'text-green-600 font-medium' : 'text-slate-400'
    }`}
  >
    <div
      className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${
        met
          ? 'bg-green-500 border-green-500'
          : 'border-slate-300 bg-transparent'
      }`}
    >
      {met && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </div>
    <span>{label}</span>
  </div>
);
