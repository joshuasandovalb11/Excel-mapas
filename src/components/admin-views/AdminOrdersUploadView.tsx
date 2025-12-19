/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { processOrderFile, type Order } from '../../utils/orderUtils';
import { syncOrdersToSQL } from '../../services/orderService';
import { useOrders } from '../../context/OrderContext';
import { motion } from 'framer-motion';
import { clear } from 'idb-keyval';

export default function AdminOrdersUploadView() {
  const { refreshOrders } = useOrders();
  const [step, setStep] = useState<
    'upload' | 'preview' | 'syncing' | 'success'
  >('upload');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<{
    count: number;
    totalAmount: number;
    orders: Order[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    await clear();
    window.location.reload();
  };

  const resetView = () => {
    setStep('upload');
    setError(null);
    setPreviewData(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

        const orders = processOrderFile(ws);

        if (orders.length === 0)
          throw new Error('El archivo no contiene pedidos válidos.');

        const totalAmount = orders.reduce(
          (sum, order) => sum + order.importeMN,
          0
        );

        setPreviewData({
          count: orders.length,
          totalAmount: totalAmount,
          orders: orders,
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
      await syncOrdersToSQL(previewData.orders, (percent) => {
        setProgress(percent);
      });

      await refreshOrders();

      setStep('success');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al sincronizar con el servidor.');
      setStep('preview');
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      {/* HEADER SIMPLE */}
      {step === 'upload' && (
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-[#0022B5] animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-gray-800">
            Actualizar Datos de Pedidos
          </h3>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Sube el archivo Excel semanal o mensual para actualizar los pedidos
            en el sistema.
          </p>
        </div>
      )}

      {/* CONTENIDO DINÁMICO */}
      <div>
        {/* VISTA 1: SUBIDA */}
        {step === 'upload' && (
          <>
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100 animate-pulse">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}

              <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-[#0022B5] rounded-xl cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="bg-white p-3 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8 text-[#0022B5]" />
                  </div>
                  <p className="mb-2 text-sm text-[#0022B5] font-semibold">
                    Clic para seleccionar archivo
                  </p>
                  <p className="text-xs text-[#2951FF]">
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
            </div>
          </>
        )}

        {/* VISTA 2: PREVIEW */}
        {step === 'preview' && previewData && (
          <>
            <motion.div
              className="space-y-6 animate-in fade-in slide-in-from-bottom-2"
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <FileText className="w-6 h-6 text-[#0022B5]" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Archivo seleccionado:</p>
                  <p className="font-semibold text-gray-800">{fileName}</p>
                </div>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-yellow-800">
                      ¡Advertencia!
                    </h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Se <strong>reemplazarán</strong> todos los pedidos
                      existentes por los de este nuevo archivo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg flex flex-col justify-center text-center">
                  <span className="text-gray-500 text-xs uppercase font-bold mb-1">
                    Total Pedidos
                  </span>
                  <div className="flex items-center justify-center gap-2 text-[#0022B5]">
                    <ShoppingCart className="w-5 h-5" />
                    <span className="text-2xl font-bold">
                      {previewData.count}
                    </span>
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg flex flex-col justify-center text-center">
                  <span className="text-gray-500 text-xs uppercase font-bold mb-1">
                    Importe Total
                  </span>
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <span className="text-xl font-bold">
                      {formatMoney(previewData.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={resetView}
                  className="flex-1 py-2.5 cursor-pointer border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmSync}
                  className="flex-1 py-2.5 cursor-pointer bg-[#0022B5] text-white rounded-lg font-bold hover:bg-[#00187D] shadow-md transition-all flex items-center justify-center gap-2"
                >
                  Confirmar y Subir <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}

        {/* VISTA 3: SINCRONIZANDO */}
        {step === 'syncing' && (
          <>
            <motion.div
              className="text-center py-12 space-y-6"
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#0022B5] rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-[#0022B5] animate-pulse" />
                </div>
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800">
                  Sincronizando Base de Datos
                </h4>
                <p className="text-gray-500 mt-2">
                  Enviando datos al servidor SQL...
                </p>
              </div>
              <div className="max-w-xs mx-auto w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#0022B5] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 font-mono">
                {progress}% completado
              </p>
            </motion.div>
          </>
        )}

        {/* VISTA 4: ÉXITO */}
        {step === 'success' && (
          <>
            <motion.div
              className="bg-green-50 border border-green-200 rounded-xl py-8 text-center animate-in zoom-in"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <CheckCircle className="w-18 h-18 text-green-600" />
              </div>
              <h5 className="text-xl font-bold text-green-800 mb-2">
                ¡Sincronización Exitosa!
              </h5>
              <p className="text-sm text-green-700 mb-6">
                La base de datos se ha actualizado correctamente con{' '}
                <strong>{previewData?.count}</strong> registros.
              </p>
              <button
                onClick={() => handleRefresh()}
                className="px-8 py-3 cursor-pointer bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg transition-transform hover:scale-105"
              >
                Finalizar y Recargar
              </button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
