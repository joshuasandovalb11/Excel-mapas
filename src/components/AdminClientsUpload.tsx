/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Database,
  CheckCircle,
  AlertCircle,
  FileText,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { processMasterClientFile, type Client } from '../utils/tripUtils';
import { syncClientsToSQL } from '../services/clientService';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminClientsUpload({
  isOpen,
  onClose,
}: AdminModalProps) {
  const [step, setStep] = useState<
    'upload' | 'preview' | 'syncing' | 'success'
  >('upload');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<{
    count: number;
    vendorsCount: number;
    clients: Client[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reiniciar estado al cerrar
  const handleClose = () => {
    setStep('upload');
    setError(null);
    setPreviewData(null);
    setFileName(null);
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        const { clients, vendors } = processMasterClientFile(ws);

        if (clients.length === 0)
          throw new Error('El archivo no contiene clientes válidos.');

        const clientsWithGPS = clients.filter(
          (c) => c.lat !== 0 && c.lng !== 0
        ).length;
        if (clientsWithGPS < clients.length * 0.5) {
          throw new Error(
            'Más del 50% de los clientes no tienen GPS válido. Revisa el archivo.'
          );
        }

        setPreviewData({
          count: clients.length,
          vendorsCount: vendors.length,
          clients: clients,
        });
        setStep('preview');
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error al leer el archivo Excel.');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmSync = async () => {
    if (!previewData) return;

    setStep('syncing');
    setProgress(0);

    try {
      await syncClientsToSQL(previewData.clients, (percent) => {
        setProgress(percent);
      });
      setStep('success');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al sincronizar con el servidor.');
      setStep('preview');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-10 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden relative"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-800 p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Database className="w-6 h-6 text-white" />
                Actualizar Base de Datos
              </h3>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8">
              {/* PASO 1: SUBIR ARCHIVO */}
              {step === 'upload' && (
                <motion.div
                  className="space-y-6"
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-center">
                    <h4 className="text-lg font-semibold text-gray-800">
                      Carga de Archivo Maestro
                    </h4>
                    <p className="text-sm text-gray-500 mt-1">
                      Selecciona el Excel (.xlsx) con la lista actualizada de
                      clientes.
                    </p>
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
                      <p className="mb-2 text-sm text-blue-700 font-semibold">
                        Clic para seleccionar archivo
                      </p>
                      <p className="text-xs text-blue-500">
                        Formato Excel (.xlsx)
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                    />
                  </label>
                </motion.div>
              )}

              {/* PASO 2: VISTA PREVIA Y CONFIRMACIÓN */}
              {step === 'preview' && previewData && (
                <motion.div
                  className="space-y-6 animate-in fade-in slide-in-from-bottom-4"
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                    <div className="flex items-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-yellow-800">
                          ¡Advertencia!
                        </h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          Esta acción <strong>borrará</strong> la base de datos
                          actual y la reemplazará con estos datos.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                      <span className="text-gray-600 text-sm">Archivo:</span>
                      <span className="font-medium text-gray-800 text-sm flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {fileName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">
                        Total Clientes:
                      </span>
                      <span className="font-bold text-blue-600 text-lg">
                        {previewData.count}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Vendedores:</span>
                      <span className="font-medium text-gray-800">
                        {previewData.vendorsCount}
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setStep('upload');
                        setPreviewData(null);
                      }}
                      className="flex-1 cursor-pointer py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmSync}
                      className="flex-1 cursor-pointer py-2.5 px-4 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      Confirmar y Subir <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* PASO 3: SINCRONIZANDO (LOADING) */}
              {step === 'syncing' && (
                <motion.div
                  className="text-center py-8 space-y-4"
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800">
                      Sincronizando...
                    </h4>
                    <p className="text-sm text-gray-500">
                      Enviando datos al servidor SQL
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </motion.div>
              )}

              {/* PASO 4: ÉXITO */}
              {step === 'success' && (
                <motion.div
                  className="bg-green-50 border border-green-200 rounded-xl p-6 text-center animate-in zoom-in"
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h5 className="text-xl font-bold text-green-800 mb-2">
                    ¡Sincronización Exitosa!
                  </h5>
                  <p className="text-sm text-green-700 mb-6">
                    La base de datos se ha actualizado correctamente con{' '}
                    <strong>{previewData?.count}</strong> registros.
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg transition-transform hover:scale-105"
                  >
                    Finalizar y Recargar
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
