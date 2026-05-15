/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';
import { useCallback, useState } from 'react';

// INTERFACES Y TIPOS

export interface VehicleInfo {
  descripcion: string;
  vehiculo: string;
  placa: string;
  fecha: string;
}

export interface Client {
  key: string;
  name: string;
  lat: number;
  lng: number;
  vendor: string;
  branchNumber?: string;
  branchName?: string;
  displayName: string;
  isVendorHome?: boolean;
  vendorHomeInitial?: string;
  city?: string;
  isEmpleadoTME?: boolean;
  commercialName?: string;
}

export interface MasterClientData {
  clients: Client[];
  vendors: string[];
}

// Funcion para convertir una cadena a Title Case
export const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

// Funcion para calcular la distancia entre dos puntos GPS
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const deltaP = ((lat2 - lat1) * Math.PI) / 180;
  const deltaL = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Formatea la duracion en minutos a un string legible
export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours} h ${mins} min`;
};

// Función para verificar si una parada está en horario laboral
export const isWorkingHours = (
  time: string,
  tripDate: string | undefined
): boolean => {
  if (!time || !tripDate) return true;

  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const WORK_START_MINUTES = 8 * 60 + 30;
  const WORK_END_MINUTES = 19 * 60;

  return totalMinutes >= WORK_START_MINUTES && totalMinutes < WORK_END_MINUTES;
};

// Funcion para copiar un texto al portapapeles
export function useCopyToClipboard(): [
  boolean | null,
  (text: string) => Promise<boolean>,
] {
  const [copied, setCopied] = useState<boolean | null>(null);

  const copy = useCallback(async (text: string) => {
    if (!navigator.clipboard) {
      console.warn('El API del portapapeles no está disponible');
      setCopied(false);
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);
      setTimeout(() => setCopied(null), 2000);

      return true;
    } catch (error) {
      console.error('Error al copiar al portapapeles:', error);
      setCopied(false);
      return false;
    }
  }, []);

  return [copied, copy];
}

// FUNCIÓN PARA EXTRAER INFORMACIÓN DEL VEHÍCULO
export const parseVehicleInfo = (
  worksheet: XLSX.WorkSheet,
  fileName: string
): VehicleInfo => {
  const info: VehicleInfo = {
    descripcion: 'No encontrado',
    vehiculo: 'No encontrado',
    placa: 'No encontrada',
    fecha: 'No encontrada',
  };

  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });
  const rowsToSearch = data.slice(0, 20);
  const dateRegex = /\d{4}-\d{2}-\d{2}/;

  for (const row of rowsToSearch) {
    if (!Array.isArray(row)) continue;

    for (let i = 0; i < row.length; i++) {
      const currentCellText = String(row[i] || '')
        .trim()
        .toLowerCase();
      if (!currentCellText) continue;

      const findNextValue = () => {
        for (let j = i + 1; j < row.length; j++) {
          const nextValue = String(row[j] || '').trim();
          if (nextValue) return nextValue;
        }
        return null;
      };

      let value: string | null = null;

      if (currentCellText.includes('descripción de vehículo')) {
        value = findNextValue();
        if (value) info.descripcion = toTitleCase(value);
      } else if (currentCellText.includes('tipo de vehículo')) {
        value = findNextValue();
        if (value) info.vehiculo = toTitleCase(value);
      } else if (currentCellText.includes('vehículo placa')) {
        value = findNextValue();
        if (value) info.placa = value.toUpperCase();
      } else if (currentCellText.includes('período')) {
        value = findNextValue();
        if (value) {
          info.fecha = value.split('..')[0].trim().split(' ')[0];
        }
      } else if (
        currentCellText.includes('período') ||
        currentCellText.includes('periodo')
      ) {
        const sameCellMatch = currentCellText.match(dateRegex);

        if (sameCellMatch) {
          info.fecha = sameCellMatch[0];
        } else {
          value = findNextValue();
          if (value) {
            const nextCellMatch = value.match(dateRegex);
            if (nextCellMatch) {
              info.fecha = nextCellMatch[0];
            } else {
              info.fecha = value.split('..')[0].trim().split(' ')[0];
            }
          }
        }
      }
    }
  }

  if (info.fecha === 'No encontrada' || !dateRegex.test(info.fecha)) {
    console.log('Fecha no encontrada en encabezados, buscando en datos...');

    for (const row of data) {
      if (Array.isArray(row) && row.length > 0) {
        const firstCol = String(row[0] || '');
        const match = firstCol.match(dateRegex);
        if (match) {
          info.fecha = match[0];
          console.log(`Fecha recuperada de los datos: ${info.fecha}`);
          break;
        }
      }
    }
  }

  if (info.placa === 'No encontrada') {
    info.placa = fileName.split('.')[0]?.toUpperCase() || 'No encontrada';
  }

  return info;
};

export const formatName = (name?: string | null): string => {
  if (!name || name.trim() === '') return '';
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};
