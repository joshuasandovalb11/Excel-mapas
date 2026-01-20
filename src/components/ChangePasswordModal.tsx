/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  X,
  KeyRound,
  Loader2,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebaseConfig';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePassword({
  isOpen,
  onClose,
}: ChangePasswordModalProps) {
  const { changePassword, logout, user } = useAuth();

  // Estados
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasMinLength = newPassword.length >= 6;
  const hasNoSpaces = !/\s/.test(newPassword) && newPassword.length > 0;
  const passwordsMatch =
    newPassword === confirmPassword && newPassword.length > 0;

  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    if (error) {
      errorTimerRef.current = window.setTimeout(() => {
        setError(null);
      }, 5000);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [error]);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(false);
      setLoading(false);
    }
  }, [isOpen]);

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
        setLoading(false);
        return;
      }

      await changePassword(newPassword);

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
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
          onClose();
          await logout();
        }, 2000);
      } else {
        setError('Error al actualizar. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    'w-full pl-10 pr-10 py-3 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-gray-700 placeholder:text-gray-400';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden relative"
            initial={{ scale: 0.9, opacity: 0, x: -400 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            exit={{ scale: 0.95, opacity: 0, x: 400 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -20, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: -20, x: '-50%' }}
                  className="absolute top-5 left-1/2 z-50 w-max max-w-[85%] bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2 shadow-lg"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="font-medium truncate">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-8">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 text-center"
                >
                  <div className="flex justify-center mb-3">
                    <ShieldCheck className="w-12 h-12 text-green-500" />
                  </div>
                  <h4 className="text-lg font-bold text-green-800 mb-2">
                    ¡Contraseña Actualizada!
                  </h4>
                  <p className="text-sm text-green-700 mb-4">
                    Tu contraseña ha sido modificada correctamente.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="text-center mb-8">
                    <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <KeyRound className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">
                      Cambiar Contraseña
                    </h3>
                    <p className="text-sm text-gray-500 mt-2">
                      Usuario actual:{' '}
                      <span className="font-medium text-gray-700">
                        {user?.email}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* 1. Contraseña Actual */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 ml-1 uppercase tracking-wide">
                        Contraseña Actual
                      </label>
                      <div className="relative group">
                        <div className="absolute left-3 top-3 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                          <Lock className="w-5 h-5" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className={inputClasses}
                          placeholder="Ingresa tu contraseña actual"
                          value={currentPassword}
                          onChange={(e) =>
                            handleInputChange(e, setCurrentPassword)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 my-2"></div>

                    {/* 2. Nueva Contraseña */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 ml-1 uppercase tracking-wide">
                        Nueva Contraseña
                      </label>
                      <div className="relative group">
                        <div className="absolute left-3 top-3 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                          <KeyRound className="w-5 h-5" />
                        </div>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          className={inputClasses}
                          placeholder="Ingresa la nueva contraseña"
                          value={newPassword}
                          onChange={(e) => handleInputChange(e, setNewPassword)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 3. Confirmar Contraseña */}
                    <div className="relative group">
                      <div className="absolute left-3 top-3 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        className={inputClasses}
                        placeholder="Confirmar nueva contraseña"
                        value={confirmPassword}
                        onChange={(e) =>
                          handleInputChange(e, setConfirmPassword)
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
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
                      label="Las contraseñas nuevas coinciden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !currentPassword ||
                      !hasMinLength ||
                      !hasNoSpaces ||
                      !passwordsMatch
                    }
                    className={`w-full mt-8 py-3 px-4 rounded-lg font-bold text-white shadow-md flex justify-center items-center gap-2 transition-all transform hover:shadow-lg active:scale-[0.98]
                      ${
                        loading ||
                        !currentPassword ||
                        !hasMinLength ||
                        !hasNoSpaces ||
                        !passwordsMatch
                          ? 'bg-gray-300 cursor-not-allowed shadow-none'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />{' '}
                        Procesando...
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <div
    className={`flex items-center gap-2 text-xs transition-colors duration-300 ${
      met ? 'text-green-600 font-medium' : 'text-gray-400'
    }`}
  >
    <div
      className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${
        met ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-transparent'
      }`}
    >
      {met && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </div>
    <span>{label}</span>
  </div>
);
