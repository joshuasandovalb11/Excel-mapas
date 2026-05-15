/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/VehicleTracker/hooks/useMapExport.ts
import { useCallback } from 'react';
import type {
  ProcessedTripV1,
  RouteSummaryStats,
} from '../../../types/route.types';
import type { Client } from '../../../utils/tripUtils';
import { generateMapHTML } from '../../../utils/mapUtils';
import { createAppError, type AppError } from '../../../utils/appError';

interface UseMapExportProps {
  enrichedTripData: ProcessedTripV1 | null;
  mapClients: Client[];
  matchedStopsCount: number;
  selectionValue: string | null;
  minStopDuration: number;
  googleMapsApiKey: string;
  summaryStats: RouteSummaryStats;
  onError: (error: AppError, options?: any) => void;
}

export function useMapExport({
  enrichedTripData,
  mapClients,
  matchedStopsCount,
  selectionValue,
  minStopDuration,
  googleMapsApiKey,
  summaryStats,
  onError,
}: UseMapExportProps) {
  const getDownloadFileName = useCallback(() => {
    if (!enrichedTripData) return 'mapa_ruta.html';

    let prefix = 'VEND';
    const rawId = enrichedTripData.vendedor;
    if (rawId) {
      if (/^\d+$/.test(rawId)) {
        prefix = rawId;
      } else if (rawId.length <= 4) {
        prefix = rawId.toUpperCase();
      } else {
        prefix = rawId
          .split(' ')
          .map((n) => n[0])
          .join('')
          .substring(0, 3)
          .toUpperCase();
      }
    } else if (enrichedTripData.idRuta) {
      prefix = String(enrichedTripData.idRuta);
    }

    let vendorName = 'Vendedor';
    if (enrichedTripData.nombreVendedor) {
      vendorName = enrichedTripData.nombreVendedor
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    } else if (enrichedTripData.descripcion) {
      vendorName = enrichedTripData.descripcion;
    }

    let dateStr = 'Sin Fecha';
    if (enrichedTripData.fecha) {
      const parts = enrichedTripData.fecha.split('-');
      if (parts.length === 3) {
        const [year, monthStr, day] = parts;
        const monthNum = parseInt(monthStr, 10) - 1;
        const months = [
          'Ene',
          'Feb',
          'Mar',
          'Abr',
          'May',
          'Jun',
          'Jul',
          'Ago',
          'Sep',
          'Oct',
          'Nov',
          'Dic',
        ];
        dateStr = `${day}/${months[monthNum] || monthStr}/${year}`;
      } else {
        dateStr = enrichedTripData.fecha;
      }
    }

    return `[${prefix}] ${vendorName} — ${dateStr}.html`;
  }, [enrichedTripData]);

  const generateHTML = useCallback(() => {
    if (!enrichedTripData) {
      onError(
        createAppError({
          title: 'Error de exportación',
          message: 'No hay datos de ruta procesados para generar el mapa.',
          code: 'UNKNOWN',
        })
      );
      return null;
    }

    const htmlContent = generateMapHTML(
      enrichedTripData,
      {
        descripcion: enrichedTripData.descripcion || '',
        vehiculo: enrichedTripData.vehiculo || '',
        placa: enrichedTripData.vehiculo || '',
        fecha: enrichedTripData.fecha || '',
      },
      mapClients || [],
      matchedStopsCount,
      selectionValue,
      minStopDuration,
      googleMapsApiKey,
      summaryStats
    );

    return htmlContent;
  }, [
    enrichedTripData,
    mapClients,
    matchedStopsCount,
    selectionValue,
    minStopDuration,
    googleMapsApiKey,
    summaryStats,
    onError,
  ]);

  const downloadMap = useCallback(() => {
    const htmlContent = generateHTML();
    if (!htmlContent) return;

    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getDownloadFileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al generar el archivo HTML:', err);
      onError(
        createAppError({
          title: 'Error de exportación',
          message:
            'Hubo un error al intentar descargar el mapa. Revisa la consola.',
          code: 'UNKNOWN',
        })
      );
    }
  }, [generateHTML, getDownloadFileName, onError]);

  const openMapInTab = useCallback(() => {
    const htmlContent = generateHTML();
    if (!htmlContent) return;

    try {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.open();
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        newWindow.document.title = getDownloadFileName().replace('.html', '');
      } else {
        onError(
          createAppError({
            title: 'Ventana bloqueada',
            message:
              'El navegador bloqueó la apertura de la nueva pestaña. Por favor, permite las ventanas emergentes (Pop-ups).',
            code: 'UNKNOWN',
          })
        );
      }
    } catch (err) {
      console.error('Error al abrir el mapa en nueva pestaña:', err);
      onError(
        createAppError({
          title: 'Error de visualización',
          message:
            'Hubo un error al intentar abrir el mapa en una nueva pestaña.',
          code: 'UNKNOWN',
        })
      );
    }
  }, [generateHTML, getDownloadFileName, onError]);

  return { downloadMap, openMapInTab };
}
