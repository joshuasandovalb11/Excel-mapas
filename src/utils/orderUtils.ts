/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';

export interface Order {
  pedidoId: number;
  vend: string;
  fecha: string;
  clienteId: number;
  nombreCliente: string;
  sucursalId: number;
  sucursalNombre: string;
  importeMN: number;
  importeUS: number;
  gpsCliente: string;
  gpsCaptura: string;
  gpsEnvio: string;
  procedencia: string;
}

const parseExcelDate = (excelDate: any): string => {
  if (!excelDate) return '';

  try {
    if (typeof excelDate === 'number') {
      const date = XLSX.SSF.parse_date_code(excelDate);
      if (!date) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
    }
    const str = String(excelDate).trim();

    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        let year = parts[2];

        if (year.length === 2) year = `20${year}`;

        return `${year}-${month}-${day}`;
      }
    }

    if (str.includes('T')) {
      return str.split('T')[0];
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    return '';
  } catch (e) {
    console.warn('Error parseando fecha:', excelDate);
    return '';
  }
};

export const processOrderFile = (worksheet: XLSX.WorkSheet): Order[] => {
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  let headerRowIndex = -1;

  for (let i = 0; i < 20 && i < data.length; i++) {
    const row = data[i].map((cell) => String(cell).toUpperCase().trim());
    const hasPedido = row.some(
      (cell) => cell.includes('PEDIDO') || cell.includes('DOCUMENTO')
    );
    const hasCliente = row.some(
      (cell) => cell.includes('CLIENTE') || cell.includes('CLAVE')
    );

    if (hasPedido && hasCliente) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      'No se encontraron encabezados válidos (Busqué: "Pedido", "Cliente"). Revisa el Excel.'
    );
  }

  const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, {
    range: headerRowIndex,
  });

  const orders: Order[] = jsonData
    .map((row) => {
      const getVal = (keys: string[]) => {
        for (const k of keys) {
          const val =
            row[k] ||
            Object.entries(row).find(
              ([key]) => key.toUpperCase().trim() === k
            )?.[1];
          if (val !== undefined && val !== '') return val;
        }
        return '';
      };

      const pedidoId =
        parseInt(getVal(['PEDIDO', '#PEDIDO', 'DOCUMENTO', 'FOLIO'])) || 0;
      const clienteId =
        parseInt(getVal(['CLIENTE', '#CLIENTE', 'CLAVE', 'ID CLIENTE'])) || 0;

      if (!pedidoId || !clienteId) return null;

      const cleanNum = (val: any) =>
        parseFloat(String(val || '0').replace(/[^0-9.-]+/g, '')) || 0;

      return {
        pedidoId,
        vend: String(getVal(['VEND', 'VENDEDOR', '#VEND']))
          .trim()
          .toUpperCase(),
        fecha: parseExcelDate(getVal(['FECHA', 'DATE'])),
        clienteId,
        nombreCliente: String(
          getVal(['NOMBRE', 'NOMBRE DEL CLIENTE', 'RAZON SOCIAL'])
        ).trim(),
        sucursalId: parseInt(getVal(['SUCURSAL', '#SUC', 'ID SUCURSAL'])) || 0,
        sucursalNombre: String(
          getVal(['NOMBRE SUCURSAL', 'SUCURSAL NOMBRE'])
        ).trim(),
        importeMN: cleanNum(
          getVal(['IMP MN', 'IMPORTE MN', 'TOTAL', 'VENTA', 'IMPORTE'])
        ),
        importeUS: cleanNum(getVal(['IMP US', 'IMPORTE US', 'USD', 'DOLARES'])),
        gpsCliente: String(getVal(['GPS CLIENTE', 'GPS'])).trim(),
        gpsCaptura: String(getVal(['GPS CAPTURA'])).trim(),
        gpsEnvio: String(getVal(['GPS ENVIO'])).trim(),
        procedencia: String(getVal(['PROCEDENCIA', 'ORIGEN'])).trim(),
      };
    })
    .filter((o): o is Order => o !== null);

  return orders;
};
