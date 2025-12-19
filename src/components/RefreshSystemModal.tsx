import { BrushCleaning, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clear } from 'idb-keyval';

interface RefreshSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RefreshSystem({
  isOpen,
  onClose,
}: RefreshSystemModalProps) {
  const handleRefresh = async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    await clear();
    window.location.reload();
  };

  return (
    <>
      {/* MODAL DE CERRAR SESION */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
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
                <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-blue-100 mb-4">
                  <BrushCleaning className="h-8 w-8 text-blue-600 animate-pulse" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Limpiar Datos de la Aplicacion
                </h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  ¿Seguro que deseas <strong>Reiniciar</strong> la aplicación y
                  borrar todos los datos guardados?
                </p>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 cursor-pointer text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      handleRefresh();
                    }}
                    className="flex-1 px-4 py-2.5 cursor-pointer text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                  >
                    <div className="flex items-center gap-2 justify-center text-center">
                      Reiniciar
                      <RefreshCw className="h-4 w-4" />
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
