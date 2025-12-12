/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import {
  X,
  Upload,
  Database,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { processMasterClientFile } from '../utils/tripUtils';
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        const { clients } = processMasterClientFile(ws);

        if (clients.length === 0)
          throw new Error('No se encontraron clientes válidos en el archivo.');

        console.log(
          `Preparando para subir ${clients.length} clientes a SQL Server...`
        );

        await syncClientsToSQL(clients, (percent) => {
          setProgress(percent);
        });

        setSuccess(true);

        window.location.reload();
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error al procesar el archivo.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-10 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
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
                Actualizar Base de Datos SQL
              </h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8">
              <div className="mb-6 text-center">
                <h4 className="text-lg font-semibold text-gray-800">
                  Carga de Clientes
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  Este archivo reemplazará los datos existentes en el Servidor
                  SQL. Asegúrate de que el formato sea correcto.
                </p>
              </div>

              {/* Estado: Éxito */}
              {success ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center animate-in zoom-in">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h5 className="text-lg font-bold text-green-800">
                    ¡Base de Datos Actualizada!
                  </h5>
                  <p className="text-sm text-green-600 mt-1">
                    Se han insertado los registros de{' '}
                    <strong>{fileName}</strong> en el servidor.
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                /* Estado: Upload / Loading */
                <div className="space-y-6">
                  {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <label
                    className={`
                    relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all
                    ${loading ? 'border-gray-300 bg-gray-50 cursor-wait' : 'border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400'}
                  `}
                  >
                    {loading ? (
                      <div className="text-center w-full px-10">
                        <div className="flex justify-center mb-3">
                          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                        </div>
                        <p className="text-sm font-semibold text-blue-800">
                          Procesando e insertando en SQL...
                        </p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Esto puede tardar unos segundos.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-blue-500 mb-3" />
                        <span className="text-sm font-semibold text-blue-700">
                          Seleccionar Excel de Clientes
                        </span>
                        <span className="text-xs text-blue-500 mt-1 block">
                          Formato .xlsx
                        </span>

                        {fileName && (
                          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200">
                            <FileText className="w-3 h-3" /> {fileName}
                          </div>
                        )}

                        <input
                          type="file"
                          className="hidden"
                          onChange={handleFileUpload}
                          accept=".xlsx,.xls"
                          disabled={loading}
                        />
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
