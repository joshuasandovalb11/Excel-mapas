/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Upload,
  Users,
  MapPin,
  CalendarDays,
  UserCheck,
  DollarSign,
  Package,
  XCircle,
  Plus,
  Minus,
  MapPinCheckInside,
  Coins,
  MapPinXInside,
  UserX,
  Crosshair,
  Download,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  processMasterClientFile,
  type Client,
  calculateDistance,
} from '../utils/tripUtils';

// Estructura de archivos de pedidos
interface IPedidoRaw {
  '#Pedido': string | number;
  '#Vend': string;
  Fecha: string | number;
  '#Cliente': string | number;
  'Nombre del Cliente': string;
  '#Suc': string | number;
  Sucursal: string;
  'Imp MN': number;
  'Imp US': number;
  'Gps Cliente': string;
  'GPS Captura': string;
  'GPS Envio': string;
  Procedencia: string;
}

// Interfaz para el dato procesado y limpio
interface IPedido {
  pedidoNum: string;
  vendedor: string;
  fechaStr: string;
  clienteNum: string;
  clienteName: string;
  sucursalNum: string;
  sucursalName: string;
  impMXN: number;
  impUS: number;
  pedidoClientGps: { lat: number; lng: number } | null;
  capturaGps: { lat: number; lng: number } | null;
  envioGps: { lat: number; lng: number } | null;
  procedencia: string;
  masterClientGps?: { lat: number; lng: number } | null;
  isMatch?: boolean;
  distance?: number;
}

interface IClientMarker {
  number: string;
  name: string;
  lat: number;
  lng: number;
  branchName: string;
  vendor: string;
  totalPedidos: number;
  totalMXN: number;
  totalUS: number;
}

interface IPedidoMarker {
  number: string;
  lat: number;
  lng: number;
  isMatch: boolean;
  distance: number;
  clienteKey: string;
  clienteName: string;
  impMXN: number;
  impUS: number;
  vendedor: string;
  offset?: { lat: number; lng: number };
}

const parseGps = (gpsString: string): { lat: number; lng: number } | null => {
  if (!gpsString || gpsString === '0,0' || gpsString === '0.0,0.0') return null;
  const parts = gpsString.trim().split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

// Formato de fecha de Excel
const parseExcelDate = (fecha: string | number): string => {
  if (typeof fecha === 'number') {
    const date = new Date((fecha - 25569) * 86400 * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    const str = String(fecha).split('T')[0];
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(
          2,
          '0'
        )}`;
      }
    }
    return str;
  }
};

// Aplicar offsets a marcadores duplicados
const applyOffsetsToMarkers = (markers: IPedidoMarker[]): IPedidoMarker[] => {
  const grouped = new Map<string, IPedidoMarker[]>();
  markers.forEach((marker) => {
    const key = `${marker.lat.toFixed(6)},${marker.lng.toFixed(6)}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(marker);
  });

  const result: IPedidoMarker[] = [];
  grouped.forEach((group) => {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      const radius = 0.0001;
      group.forEach((marker, idx) => {
        const angle = (idx * 2 * Math.PI) / group.length;
        result.push({
          ...marker,
          offset: {
            lat: marker.lat + radius * Math.cos(angle),
            lng: marker.lng + radius * Math.sin(angle),
          },
        });
      });
    }
  });
  return result;
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const specialClientKeys = ['3689', '6395'];

export default function PedidosTracker() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [pedidosData, setPedidosData] = usePersistentState<IPedido[] | null>(
    'pt_pedidosData',
    null
  );
  const [pedidosFileName, setPedidosFileName] = usePersistentState<
    string | null
  >('pt_pedidosFileName', null);

  const [allClientsFromFile, setAllClientsFromFile] = usePersistentState<
    Client[] | null
  >('pt_allClients', null);
  const [clientFileName, setClientFileName] = usePersistentState<string | null>(
    'pt_clientFileName',
    null
  );

  const [availableDates, setAvailableDates] = usePersistentState<string[]>(
    'pt_availableDates',
    []
  );
  const [availableVendors, setAvailableVendors] = usePersistentState<string[]>(
    'pt_availableVendors',
    []
  );
  const [selectedDate, setSelectedDate] = usePersistentState<string | null>(
    'pt_selectedDate',
    null
  );
  const [selectedVendor, setSelectedVendor] = usePersistentState<string | null>(
    'pt_selectedVendor',
    null
  );
  const [matchRadius, setMatchRadius] = usePersistentState<number>(
    'pt_matchRadius',
    50
  );
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [showNoVisitados, setShowNoVisitados] = usePersistentState<boolean>(
    'pt_showNoVisitados',
    false
  );
  const [gpsMode, setGpsMode] = usePersistentState<'envio' | 'captura'>(
    'pt_gpsMode',
    'envio'
  );

  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    if (error) {
      setIsToastVisible(true);
      toastTimerRef.current = window.setTimeout(() => {
        setIsToastVisible(false);
        setTimeout(() => setError(null), 500);
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
    setTimeout(() => setError(null), 500);
  };

  // Carga de Archivo de Clientes
  const handleClientFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setClientFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target?.result)
          throw new Error('No se pudo leer el archivo de clientes.');
        const bstr = event.target.result as string;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const { clients } = processMasterClientFile(ws);
        setAllClientsFromFile(clients);
      } catch (err: any) {
        setError(`Error al procesar archivo de clientes: ${err.message}`);
        setAllClientsFromFile(null);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePedidosFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setPedidosFileName(file.name);
    setError(null);
    setPedidosData(null);
    setAvailableDates([]);
    setAvailableVendors([]);
    setSelectedDate(null);
    setSelectedVendor(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target?.result)
          throw new Error('No se pudo leer el archivo de pedidos.');
        const bstr = event.target.result as string;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const data: IPedidoRaw[] = XLSX.utils.sheet_to_json(ws, {
          defval: '',
        });
        if (data.length === 0)
          throw new Error('El archivo de pedidos está vacío.');

        const headers = Object.keys(data[0]);
        const requiredHeaders = [
          '#Pedido',
          '#Vend',
          'Fecha',
          '#Cliente',
          'GPS Envio',
        ];
        if (!requiredHeaders.every((h) => headers.includes(h))) {
          throw new Error(
            'El archivo de pedidos no tiene las cabeceras requeridas.'
          );
        }

        const processed: IPedido[] = [];
        const dates = new Set<string>();
        const vendors = new Set<string>();

        for (const row of data) {
          const fechaStr = parseExcelDate(row.Fecha);
          dates.add(fechaStr);
          vendors.add(String(row['#Vend']));

          processed.push({
            pedidoNum: String(row['#Pedido']),
            vendedor: String(row['#Vend']),
            fechaStr,
            clienteNum: String(row['#Cliente']),
            clienteName: String(row['Nombre del Cliente']),
            sucursalNum: String(row['#Suc']),
            sucursalName: String(row.Sucursal),
            impMXN: Number(row['Imp MN']) || 0,
            impUS: Number(row['Imp US']) || 0,
            pedidoClientGps: parseGps(String(row['Gps Cliente'])),
            capturaGps: parseGps(String(row['GPS Captura'])),
            envioGps: parseGps(String(row['GPS Envio'])),
            procedencia: String(row.Procedencia),
            isMatch: false,
            distance: Infinity,
          });
        }

        setPedidosData(processed);
        const sortedDates = Array.from(dates).sort();

        if (sortedDates.length > 1) {
          sortedDates.unshift('__ALL_DATES__');
        }

        setAvailableDates(sortedDates);
        setAvailableVendors(Array.from(vendors).sort());
      } catch (err: any) {
        setError(`Error al procesar archivo de pedidos: ${err.message}`);
        setPedidosData(null);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processedMapData = useMemo(() => {
    if (
      !pedidosData ||
      !allClientsFromFile ||
      !selectedDate ||
      selectedVendor === null
    ) {
      return {
        clientMarkers: [],
        pedidoMarkers: [],
        stats: null,
        pedidosPorVendedor: [],
        clientesNoVisitados: [],
        closestSpecialClientKey: null,
      };
    }

    const filteredPedidos = pedidosData.filter((p) => {
      if (selectedDate !== '__ALL_DATES__' && p.fechaStr !== selectedDate) {
        return false;
      }

      if (selectedVendor === '__ALL__') {
        return true;
      }
      return p.vendedor === selectedVendor;
    });

    const clientMap = new Map<string, IClientMarker>();
    const pedidoMarkersRaw: IPedidoMarker[] = [];

    let pedidosConMatch = 0;
    let pedidosSinMatch = 0;
    let pedidosSinGps = 0;
    let pedidosSinGpsCliente = 0;
    let pedidosEnMatriz = 0;

    for (const pedido of filteredPedidos) {
      const gpsAAnalizar =
        gpsMode === 'envio' ? pedido.envioGps : pedido.capturaGps;

      if (!gpsAAnalizar) {
        const tieneImportes = pedido.impMXN > 0 || pedido.impUS > 0;

        if (tieneImportes) {
          pedidosEnMatriz++;

          const masterClient = allClientsFromFile.find(
            (c) => c.key === pedido.clienteNum
          );
          const clientGps = masterClient
            ? { lat: masterClient.lat, lng: masterClient.lng }
            : pedido.pedidoClientGps;

          if (clientGps) {
            if (clientMap.has(pedido.clienteNum)) {
              const existing = clientMap.get(pedido.clienteNum)!;
              existing.totalPedidos += 1;
              existing.totalMXN += pedido.impMXN;
              existing.totalUS += pedido.impUS;
            } else {
              clientMap.set(pedido.clienteNum, {
                number: pedido.clienteNum,
                name: pedido.clienteName,
                lat: clientGps.lat,
                lng: clientGps.lng,
                branchName: masterClient
                  ? masterClient.branchName || ''
                  : pedido.sucursalName,
                vendor: pedido.vendedor,
                totalPedidos: 1,
                totalMXN: pedido.impMXN,
                totalUS: pedido.impUS,
              });
            }
          }
        } else {
          pedidosSinGps++;
        }

        continue;
      }

      const masterClient = allClientsFromFile.find(
        (c) => c.key === pedido.clienteNum
      );
      const clientGps = masterClient
        ? { lat: masterClient.lat, lng: masterClient.lng }
        : pedido.pedidoClientGps;

      let distance = Infinity;
      let isMatch = false;

      if (clientGps) {
        distance = calculateDistance(
          clientGps.lat,
          clientGps.lng,
          gpsAAnalizar.lat,
          gpsAAnalizar.lng
        );
        isMatch = distance <= matchRadius;
        if (isMatch) pedidosConMatch++;
        else pedidosSinMatch++;
      } else {
        pedidosSinGpsCliente++;
      }

      pedidoMarkersRaw.push({
        number: pedido.pedidoNum,
        lat: gpsAAnalizar.lat,
        lng: gpsAAnalizar.lng,
        isMatch,
        distance,
        clienteKey: pedido.clienteNum,
        clienteName: pedido.clienteName,
        impMXN: pedido.impMXN,
        impUS: pedido.impUS,
        vendedor: pedido.vendedor,
      });

      if (clientGps) {
        if (clientMap.has(pedido.clienteNum)) {
          const existing = clientMap.get(pedido.clienteNum)!;
          existing.totalPedidos += 1;
          existing.totalMXN += pedido.impMXN;
          existing.totalUS += pedido.impUS;
        } else {
          clientMap.set(pedido.clienteNum, {
            number: pedido.clienteNum,
            name: pedido.clienteName,
            lat: clientGps.lat,
            lng: clientGps.lng,
            branchName: masterClient
              ? masterClient.branchName || ''
              : pedido.sucursalName,
            vendor: pedido.vendedor,
            totalPedidos: 1,
            totalMXN: pedido.impMXN,
            totalUS: pedido.impUS,
          });
        }
      }
    }

    const pedidosPorVendedor: {
      vendedor: string;
      match: number;
      noMatch: number;
    }[] = [];

    if (selectedVendor === '__ALL__') {
      const vendorMap = new Map<string, { match: number; noMatch: number }>();

      for (const pMarker of pedidoMarkersRaw) {
        if (!vendorMap.has(pMarker.vendedor)) {
          vendorMap.set(pMarker.vendedor, { match: 0, noMatch: 0 });
        }
        const statsVendedor = vendorMap.get(pMarker.vendedor)!;
        if (pMarker.isMatch) {
          statsVendedor.match++;
        } else {
          if (pMarker.isMatch) {
            // Ya está contado arriba
          } else if (pMarker.distance !== Infinity) {
            statsVendedor.noMatch++;
          }
        }
      }

      vendorMap.forEach((counts, vendedor) => {
        pedidosPorVendedor.push({ vendedor, ...counts });
      });

      pedidosPorVendedor.sort((a, b) => a.vendedor.localeCompare(b.vendedor));
    }

    const clientMarkers = Array.from(clientMap.values());
    const visitedClientKeys = new Set(clientMap.keys());
    const allVendorClients = allClientsFromFile.filter(
      (c) => selectedVendor === '__ALL__' || c.vendor === selectedVendor
    );

    const regularClientsOnRoute = allVendorClients.filter(
      (c) => !specialClientKeys.includes(c.key)
    );
    const allSpecialClientsOnRoute = allVendorClients.filter((c) =>
      specialClientKeys.includes(c.key)
    );

    let closestSpecialClient: Client | null = null;
    if (allSpecialClientsOnRoute.length > 0) {
      if (regularClientsOnRoute.length > 0) {
        const avgLat =
          regularClientsOnRoute.reduce((sum, c) => sum + c.lat, 0) /
          regularClientsOnRoute.length;
        const avgLng =
          regularClientsOnRoute.reduce((sum, c) => sum + c.lng, 0) /
          regularClientsOnRoute.length;
        const centroid = { lat: avgLat, lng: avgLng };

        let closestDist = Infinity;
        allSpecialClientsOnRoute.forEach((client) => {
          const dist = calculateDistance(
            centroid.lat,
            centroid.lng,
            client.lat,
            client.lng
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestSpecialClient = client;
          }
        });
      } else {
        closestSpecialClient = allSpecialClientsOnRoute[0];
      }
    }
    const closestSpecialClientKey = closestSpecialClient
      ? closestSpecialClient.key
      : null;

    const clientesNoVisitados: IClientMarker[] = [];
    regularClientsOnRoute.forEach((regularClient) => {
      if (!visitedClientKeys.has(regularClient.key)) {
        clientesNoVisitados.push({
          number: regularClient.key,
          name: regularClient.name,
          lat: regularClient.lat,
          lng: regularClient.lng,
          branchName: regularClient.branchName || '',
          vendor: regularClient.vendor,
          totalPedidos: 0,
          totalMXN: 0,
          totalUS: 0,
        });
      }
    });

    if (
      closestSpecialClient &&
      !visitedClientKeys.has(closestSpecialClient.key)
    ) {
      clientesNoVisitados.push({
        number: closestSpecialClient.key,
        name: closestSpecialClient.name,
        lat: closestSpecialClient.lat,
        lng: closestSpecialClient.lng,
        branchName: closestSpecialClient.branchName || '',
        vendor: closestSpecialClient.vendor,
        totalPedidos: 0,
        totalMXN: 0,
        totalUS: 0,
      });
    }

    const pedidoMarkers = applyOffsetsToMarkers(pedidoMarkersRaw);
    const totalPedidos = filteredPedidos.length;
    const totalMapeables = pedidosConMatch + pedidosSinMatch;

    const stats = {
      totalPedidos,
      pedidosConMatch,
      pedidosSinMatch,
      pedidosSinGpsCliente,
      pedidosSinGps,
      pedidosEnMatriz,
      matchPercentage:
        totalMapeables > 0 ? (pedidosConMatch / totalMapeables) * 100 : 0,
      sinMatchPercentage:
        totalMapeables > 0 ? (pedidosSinMatch / totalMapeables) * 100 : 0,
      totalMXN: clientMarkers.reduce((sum, c) => sum + c.totalMXN, 0),
      totalUS: clientMarkers.reduce((sum, c) => sum + c.totalUS, 0),
      totalClients: clientMarkers.length,
    };

    return {
      clientMarkers,
      pedidoMarkers,
      stats,
      pedidosPorVendedor,
      clientesNoVisitados,
      closestSpecialClientKey,
    };
  }, [
    pedidosData,
    allClientsFromFile,
    selectedDate,
    selectedVendor,
    matchRadius,
    gpsMode,
  ]);

  const generateMapHTML = () => {
    const {
      clientMarkers,
      pedidoMarkers,
      clientesNoVisitados,
      closestSpecialClientKey,
    } = processedMapData;
    const apiKey = import.meta.env.VITE_Maps_API_KEY;

    let center = '{lat: 25.0, lng: -100.0}';
    let zoom = 12;
    const allPoints = [
      ...clientMarkers,
      ...pedidoMarkers.map((p) => (p.offset ? p.offset : p)),
      ...clientesNoVisitados,
    ];

    if (allPoints.length > 0) {
      const avgLat =
        allPoints.reduce((sum, p) => sum + p.lat, 0) / allPoints.length;
      const avgLng =
        allPoints.reduce((sum, p) => sum + p.lng, 0) / allPoints.length;
      center = `{lat: ${avgLat}, lng: ${avgLng}}`;
    }
    if (allPoints.length === 1) {
      zoom = 15;
    }

    const totalMarkers =
      clientMarkers.length + pedidoMarkers.length + clientesNoVisitados.length;
    const isAllVendors = selectedVendor === '__ALL__';
    const useClustering = totalMarkers > 50 && isAllVendors;

    return `<!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
    <style>
        #map { height: 100%; } body, html { height: 100%; margin: 0; padding: 0; }
        .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-c { padding: 8px !important; }
        /* Estilos base para la tarjeta */
        .info-window { font-family: sans-serif; }
        /* Estilos personalizados para los clusters */
        .custom-cluster {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 50%;
          font-weight: bold;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          width: 50px;
          height: 50px;
        }
        .custom-cluster-large {
          width: 60px;
          height: 60px;
          font-size: 16px;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
    </style>
    </head>
    <body>
    <div id="map"></div>
    <script src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js"></script>
    <script>
        let map, openInfoWindows = new Set();
        
        function toTitleCase(str) {
          if (!str) return '';
          return str.toLowerCase().split(' ').map(function(word) {
            if (word.length <= 3 && (word === 'de' || word === 'la' || word === 'el' || word === 'y' || word === 'e')) {
              return word;
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
          }).join(' ');
        }

        function closeAllInfoWindows() {
          openInfoWindows.forEach(iw => iw.close());
          openInfoWindows.clear();
        }

        function initMap() {
          map = new google.maps.Map(document.getElementById('map'), {
            center: ${center},
            zoom: ${zoom},
            mapTypeControl: false, 
            streetViewControl: true,
            gestureHandling: 'greedy'
        });

        const bounds = new google.maps.LatLngBounds();
        
        const clientMarkers = ${JSON.stringify(clientMarkers)};
        const pedidoMarkers = ${JSON.stringify(pedidoMarkers)};
        const clientesNoVisitados = ${JSON.stringify(showNoVisitados ? clientesNoVisitados : [])};
        const closestSpecialClientKey = ${JSON.stringify(closestSpecialClientKey)};
        const useClustering = ${useClustering};

        // Arrays para almacenar todos los marcadores para clustering
        const allMarkersForClustering = [];

        // 1. Marcadores de Clientes (Casas)
        clientMarkers.forEach(client => {
            const isSpecial = client.number === closestSpecialClientKey;
            const iconFillColor = isSpecial ? '#FF0000' : '#000000';

            const marker = new google.maps.Marker({
            position: { lat: client.lat, lng: client.lng },
            map: map,
            icon: {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: '#000000',
                fillOpacity: 1,
                strokeWeight: 0,
                strokeColor: '#fff',
                scale: 1.3,
                anchor: new google.maps.Point(12, 24)
            },
            title: client.name
            });

            const coordinatesText = \`\${client.lat.toFixed(6)}, \${client.lng.toFixed(6)}\`;
            const googleMapsLink = \`https://www.google.com/maps?q=\${client.lat},\${client.lng}\`;
            const branchInfo = client.branchName ? 
                \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${toTitleCase(client.branchName)}</p>\` : '';

            const content = \`<div class="info-window" style="padding: 4px; color: black; background: white;">
            <h3 style="font-size: 15px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-house"></i> Cliente
            </h3>
            
            <div style="color:#059669;">
              <p style="margin: 2px 0; font-weight: 500; font-size: 12px;">
                <strong># \${client.number}</strong>
              </p>
              <strong><p style="margin: 2px 0; font-weight: 600; font-size: 12px;">\${toTitleCase(client.name)}</p></strong>
              \${branchInfo}
            </div>

            <p style="color: #374151; font-size: 12px; margin: 4px 0;">\${coordinatesText}</p>
            <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
              <strong>View on Google Maps</strong>
            </a>
            
            <p style="border-top:1px solid #eee; padding-top:4px; margin-top: 8px; font-size: 12px; margin-bottom: 0;">
                Vendedor: \${client.vendor}<br>
                Pedidos: \${client.totalPedidos}<br>
                MXN: \${client.totalMXN.toLocaleString('es-MX', {style: 'currency', currency: 'MXN'})}<br>
                USD: \${client.totalUS.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}
            </p>
            </div>\`;
            const info = new google.maps.InfoWindow({ content: content });
            marker.addListener('click', () => { closeAllInfoWindows(); info.open(map, marker); openInfoWindows.add(info); });
            bounds.extend(marker.getPosition());
            
            if (useClustering) allMarkersForClustering.push(marker);
        });

        // 2. Marcadores de Pedidos (Pines)
        pedidoMarkers.forEach(pedido => {
            const pos = pedido.offset || { lat: pedido.lat, lng: pedido.lng };
            const marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                fillColor: pedido.isMatch ? '#22c55e' : '#ef4444',
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.5,
                anchor: new google.maps.Point(12, 24)
            },
            title: 'Pedido ' + pedido.key
            });
            
            const coordinatesText = \`\${pos.lat.toFixed(6)}, \${pos.lng.toFixed(6)}\`;
            const googleMapsLink = \`https://www.google.com/maps?q=\${pos.lat},\${pos.lng}\`;
            
            const matchText = pedido.isMatch 
            ? \`<div style="color:#059669;">
                <p style="margin: 2px 0; font-weight: 600; font-size: 12px;">
                  <i class="fa-solid fa-check"></i> En ubicación
                </p>
              </div>\`
            : \`<div style="color:#FC2121;">
                <p style="margin: 2px 0; font-weight: 600; font-size: 12px;">
                  <i class="fa-solid fa-xmark"></i> Fuera de ubicación
                </p>
              </div>\`;

            const content = \`<div class="info-window" style="padding: 4px; color: black; background: white;">
            <h3 style="font-size: 15px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-cart-shopping"></i> Pedido #\${pedido.number}
            </h3>
            
            <strong>#\${pedido.clienteKey}</strong>
            <p style="margin: 2px 0; font-weight: 600; font-size: 12px; color: #374151;">
              Cliente: \${toTitleCase(pedido.clienteName)}
            </p>
            <p style="margin: 4px 0 2px 0; font-weight: 500; font-size: 12px; color: #374151;">
              Vendedor: <strong>\${pedido.vendedor}</strong>
            </p>

            \${matchText}


            <p style="color: #374151; font-size: 12px; margin: 4px 0;">\${coordinatesText}</p>
            <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
              <strong>View on Google Maps</strong>
            </a>

            <p style="border-top:1px solid #eee; padding-top:4px; margin-top: 8px; font-size: 12px; margin-bottom: 0;">
                MXN: \${pedido.impMXN.toLocaleString('es-MX', {style: 'currency', currency: 'MXN'})}<br>
                USD: \${pedido.impUS.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}
            </p>
            </div>\`;
            const info = new google.maps.InfoWindow({ content: content });
            marker.addListener('click', () => { closeAllInfoWindows(); info.open(map, marker); openInfoWindows.add(info); });
            bounds.extend(new google.maps.LatLng(pos.lat, pos.lng));
            
            if (useClustering) allMarkersForClustering.push(marker);
        });

        // 3. Marcadores de Clientes NO Visitados
        clientesNoVisitados.forEach(client => {
            const isSpecial = client.number === closestSpecialClientKey;
            const iconFillColor = isSpecial ? '#0059FF' : '#636970'; 
            const iconOpacity = isSpecial ? 1.0 : 0.8;

            const marker = new google.maps.Marker({
            position: { lat: client.lat, lng: client.lng },
            map: map,
            icon: {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: iconFillColor,
                fillOpacity: iconOpacity,
                strokeWeight: 1,
                strokeColor: "white",
                scale: 1.2,
                anchor: new google.maps.Point(12, 24)
            },
            title: 'NO VISITADO: ' + client.name
            });

            const coordinatesText = \`\${client.lat.toFixed(6)}, \${client.lng.toFixed(6)}\`;
            const googleMapsLink = \`https://www.google.com/maps?q=\${client.lat},\${client.lng}\`;
            const branchInfo = client.branchName ? 
                \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${toTitleCase(client.branchName)}</p>\` : '';

            const content = \`<div class="info-window" style="padding: 4px; color: black; background: white;">
            <h3 style="font-size: 14px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px; color: #212121;">
              <i class="fa-solid fa-house-chimney-user"></i> Cliente No Visitado
            </h3>
              
            <div style="color:#212121;">
              <p style="margin: 2px 0; font-weight: 500; font-size: 12px;">
                <strong># \${client.number}</strong>
              </p>
              <strong><p style="margin: 2px 0; font-weight: 600; font-size: 12px;">\${toTitleCase(client.name)}</p></strong>
              \${branchInfo}
            </div>

            <p style="color: #374151; font-size: 12px; margin: 4px 0;">\${coordinatesText}</p>
            <a href="\${googleMapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
              <strong>View on Google Maps</strong>
            </a>
              
            <p style="border-top:1px solid #eee; padding-top:4px; margin-top: 8px; font-size: 12px; margin-bottom: 0;">
              Vendedor: \${client.vendor}
            </p>
            </div>\`;
            const info = new google.maps.InfoWindow({ content: content });
            marker.addListener('click', () => { closeAllInfoWindows(); info.open(map, marker); openInfoWindows.add(info); });
            bounds.extend(marker.getPosition());

            if (useClustering) allMarkersForClustering.push(marker);
        });

        // Crear clusterer si hay muchos marcadores
        if (useClustering && allMarkersForClustering.length > 0) {
            const renderer = {
                render: ({ count, position }) => {
                    const color = count > 100 ? '#f5576c' : count > 50 ? '#87D665' : '#667eea';
                    const size = count > 100 ? 60 : count > 50 ? 55 : 50;
                    
                    return new google.maps.Marker({
                        position,
                        icon: {
                            url: \`data:image/svg+xml;charset=UTF-8,\${encodeURIComponent(\`
                                <svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 \${size} \${size}">
                                    <circle cx="\${size/2}" cy="\${size/2}" r="\${size/2 - 2}" fill="\${color}" stroke="white" stroke-width="3"/>
                                    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">\${count}</text>
                                </svg>
                            \`)}\`,
                            scaledSize: new google.maps.Size(size, size),
                        },
                        label: {
                            text: String(count),
                            color: 'transparent',
                        },
                        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
                    });
                },
            };

            new markerClusterer.MarkerClusterer({
                map,
                markers: allMarkersForClustering,
                renderer: renderer,
            });
        }

        if (bounds.isEmpty() === false) {
            map.fitBounds(bounds);
        }
        }
    </script>
    <script async defer src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=geometry"></script>
    </body>
    </html>`;
  };

  const { stats, pedidosPorVendedor } = processedMapData;

  // Configuración Gráfica 1: Dona de Estado General
  const doughnutData = {
    labels: [
      'En Ubicación',
      'Fuera de Ubicación',
      'Sin GPS Cliente',
      gpsMode === 'envio' ? 'Sin GPS Envío' : 'Sin GPS Captura',
      'En Tools',
    ],
    datasets: [
      {
        label: 'Pedidos',
        data: [
          stats?.pedidosConMatch || 0,
          stats?.pedidosSinMatch || 0,
          stats?.pedidosSinGpsCliente || 0,
          stats?.pedidosSinGps || 0,
          stats?.pedidosEnMatriz || 0,
        ],
        backgroundColor: [
          '#22c55e', // Verde (match)
          '#ef4444', // Rojo (no match)
          '#f59e0b', // Naranja (sin GPS cliente)
          '#6b7280', // Gris (sin GPS envío)
          '#3b82f6', // Azul (en Tools)
        ],
        borderColor: ['#ffffff'],
        borderWidth: 3,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Estado de Pedidos',
        font: { size: 16 },
      },
    },
  };

  // Configuración Gráfica 2: Barras por Vendedor
  const barData = {
    labels: pedidosPorVendedor?.map((v) => v.vendedor) || [],
    datasets: [
      {
        label: 'En Ubicación',
        data: pedidosPorVendedor?.map((v) => v.match) || [],
        backgroundColor: '#22c55e', // Verde
      },
      {
        label: 'Fuera de Ubicación',
        data: pedidosPorVendedor?.map((v) => v.noMatch) || [],
        backgroundColor: '#ef4444', // Rojo
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Rendimiento por Vendedor',
        font: { size: 16 },
      },
    },
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
      },
    },
  };

  const downloadPedidosExcel = () => {
    if (
      !pedidosData ||
      !selectedDate ||
      !selectedVendor ||
      !allClientsFromFile
    ) {
      setError('No hay datos suficientes para generar el reporte.');
      return;
    }

    const isAllVendors = selectedVendor === '__ALL__';
    const vendorsToProcess = isAllVendors ? availableVendors : [selectedVendor];

    const styles = {
      title: {
        font: { name: 'Arial', sz: 18, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF0275D8' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      header: {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      },
      vendorHeader: {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF00B050' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      totalRow: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFF2F2F2' } },
        alignment: { horizontal: 'right' },
        border: { top: { style: 'thin', color: { auto: 1 } } },
      },
      cell: {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'center', horizontal: 'left' },
      },
      cellCentered: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
      cellRight: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'right', vertical: 'center' },
      },
      clientVisitCell: {
        font: { name: 'Arial', sz: 10, bold: true },
        fill: { fgColor: { rgb: 'FFEBF5FF' } },
        alignment: { vertical: 'center', horizontal: 'left' },
      },
      nonVisitedHeader: {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FFC00000' } },
        alignment: { horizontal: 'center' },
      },
      // Estilos para el panel de resumen
      infoLabel: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'right' },
      },
      infoValue: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'left' },
      },
      subHeader: {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: { vertical: 'center', horizontal: 'center' },
      },
    };

    const filteredPedidos = pedidosData.filter((p) => {
      if (selectedDate !== '__ALL_DATES__' && p.fechaStr !== selectedDate) {
        return false;
      }
      return isAllVendors ? true : p.vendedor === selectedVendor;
    });

    const clientesConCoincidencia: IPedido[] = [];
    const clientesFueraUbicacion: IPedido[] = [];
    const clientesConPedidos = new Set<string>();

    for (const pedido of filteredPedidos) {
      const gpsAAnalizar =
        gpsMode === 'envio' ? pedido.envioGps : pedido.capturaGps;
      let isMatch = false;

      if (!gpsAAnalizar) {
        if (pedido.impMXN > 0 || pedido.impUS > 0) {
          isMatch = true;
        } else {
          continue;
        }
      } else {
        const masterClient = allClientsFromFile.find(
          (c) => c.key === pedido.clienteNum
        );
        const clientGps = masterClient
          ? { lat: masterClient.lat, lng: masterClient.lng }
          : pedido.pedidoClientGps;

        if (clientGps) {
          const distance = calculateDistance(
            clientGps.lat,
            clientGps.lng,
            gpsAAnalizar.lat,
            gpsAAnalizar.lng
          );
          isMatch = distance <= matchRadius;
        }
      }

      clientesConPedidos.add(pedido.clienteNum);
      if (isMatch) {
        clientesConCoincidencia.push(pedido);
      } else {
        clientesFueraUbicacion.push(pedido);
      }
    }

    const clientesVendedor = isAllVendors
      ? allClientsFromFile
      : allClientsFromFile.filter((c) => c.vendor === selectedVendor);
    const clientesSinPedidos =
      clientesVendedor.filter((c) => !clientesConPedidos.has(c.key)) || [];
    const grandTotalPedidosEnUbicacion = clientesConCoincidencia.length;
    const grandTotalPedidosFueraUbicacion = clientesFueraUbicacion.length;
    const grandTotalSinPedidos = clientesSinPedidos.length;

    const allPedidosConImporte = [
      ...clientesConCoincidencia,
      ...clientesFueraUbicacion,
    ];
    const grandTotalMXN = allPedidosConImporte.reduce(
      (sum, p) => sum + p.impMXN,
      0
    );
    const grandTotalUSD = allPedidosConImporte.reduce(
      (sum, p) => sum + p.impUS,
      0
    );

    let dateRangeStr = selectedDate;
    if (selectedDate === '__ALL_DATES__') {
      const allDates = [...new Set(filteredPedidos.map((p) => p.fechaStr))]
        .filter((date) => date)
        .sort();

      if (allDates.length === 0) {
        dateRangeStr = 'N/A';
      } else if (allDates.length === 1) {
        dateRangeStr = allDates[0];
      } else {
        dateRangeStr = `${allDates[0]} a ${allDates[allDates.length - 1]}`;
      }
    }

    const wb = XLSX.utils.book_new();

    // Headers y Columnas (SIN VENDEDOR)
    const headersPedidos = [
      '# Pedido',
      'Fecha',
      'Cliente',
      'Sucursal',
      'Imp MXN',
      'Imp USD',
    ];
    const colsPedidos = [
      { wch: 17 }, // # Pedido
      { wch: 12 }, // Fecha
      { wch: 43 }, // Cliente
      { wch: 25 }, // Sucursal
      { wch: 15 }, // Imp MXN
      { wch: 15 }, // Imp USD
    ];
    const headersSinPedidos = ['Cliente', 'Sucursal'];
    const colsSinPedidos = [
      { wch: 40 }, // Cliente
      { wch: 25 }, // Sucursal
    ];
    const summaryColWidths = [
      { wch: 2 }, // Espaciador
      { wch: 30 }, // Label
      { wch: 25 }, // Value
    ];

    // --- HOJA 1: Clientes en Ubicación ---
    {
      const wsName = 'Clientes en Ubicación';
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      let currentRow = 0;
      const tableWidth = headersPedidos.length; // 6
      const summaryStartCol = tableWidth + 1; // Col 7 (índice 6)

      data.push(['Clientes en Ubicación']);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: summaryStartCol + 1 },
      }); // Título abarca todo
      currentRow += 2; // + Título y + Fila vacía

      for (const vendor of vendorsToProcess) {
        const vendorPedidos = clientesConCoincidencia
          .filter((p) => p.vendedor === vendor)
          .sort((a, b) => a.clienteName.localeCompare(b.clienteName));
        if (vendorPedidos.length === 0) continue;

        let vendorTotalMXN = 0;
        let vendorTotalUSD = 0;

        if (isAllVendors) {
          const vendorRow = Array(tableWidth).fill('');
          vendorRow[0] = `Vendedor: ${vendor}`;
          data.push(vendorRow);
          merges.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow, c: tableWidth - 1 },
          });
          currentRow++;
        }

        data.push([...headersPedidos]);
        currentRow++;

        vendorPedidos.forEach((p) => {
          const clientName = p.clienteName;
          const clientKey = p.clienteNum;
          let branchInfo = '--';
          if (p.sucursalNum && p.sucursalNum !== '0' && p.sucursalNum !== '') {
            branchInfo = p.sucursalName
              ? `Suc. ${p.sucursalName}`
              : `Suc. ${p.sucursalNum}`;
          }
          const row = [
            p.pedidoNum,
            p.fechaStr,
            `${clientKey} - ${clientName}`,
            branchInfo,
            p.impMXN,
            p.impUS,
          ];
          data.push(row);
          vendorTotalMXN += p.impMXN;
          vendorTotalUSD += p.impUS;
          currentRow++;
        });

        const totalRow = [
          '',
          '',
          '',
          'Total Vendedor:',
          vendorTotalMXN,
          vendorTotalUSD,
        ];
        data.push(totalRow);
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow, c: 3 }, // Columnas 0-3
        });
        currentRow++;

        data.push([]);
        currentRow++;
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [...colsPedidos, ...summaryColWidths];
      ws['!merges'] = merges;

      // Aplicar Estilos
      ws['A1'].s = styles.title;
      data.forEach((row, rIdx) => {
        if (row.length === 0) return;

        if (isAllVendors && row[0]?.startsWith('Vendedor:')) {
          for (let cIdx = 0; cIdx < tableWidth; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
            ws[cellRef].s = styles.vendorHeader;
          }
        } else if (row[0] === '# Pedido') {
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (ws[cellRef]) {
              ws[cellRef].s = styles.header;
            }
          }
        } else if (row[3] === 'Total Vendedor:') {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })].s = styles.totalRow;
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
        } else if (rIdx > 0 && !row[0]?.startsWith('Clientes en Ubicación')) {
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s =
              styles.cellCentered;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })].s =
              styles.cellCentered;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 2 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 2 })].s =
              styles.clientVisitCell;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })].s = styles.cell;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })].s = {
              ...styles.cellRight,
              numFmt: '"$"#,##0.00',
            };
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })].s = {
              ...styles.cellRight,
              numFmt: '"$"#,##0.00',
            };
        }
      });
      XLSX.utils.book_append_sheet(wb, ws, wsName);
    }

    // --- HOJA 2: Clientes Fuera de Ubicación ---
    {
      const wsName = 'Clientes Fuera Ubicación';
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      let currentRow = 0;
      const tableWidth = headersPedidos.length; // 6
      const summaryStartCol = tableWidth + 1; // Col 7 (índice 6)

      data.push(['Clientes Fuera de Ubicación']);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: summaryStartCol + 1 },
      });
      currentRow += 2;

      for (const vendor of vendorsToProcess) {
        const vendorPedidos = clientesFueraUbicacion
          .filter((p) => p.vendedor === vendor)
          .sort((a, b) => a.clienteName.localeCompare(b.clienteName));
        if (vendorPedidos.length === 0) continue;

        let vendorTotalMXN = 0;
        let vendorTotalUSD = 0;

        if (isAllVendors) {
          const vendorRow = Array(tableWidth).fill('');
          vendorRow[0] = `Vendedor: ${vendor}`;
          data.push(vendorRow);
          merges.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow, c: tableWidth - 1 },
          });
          currentRow++;
        }

        data.push([...headersPedidos]);
        currentRow++;

        vendorPedidos.forEach((p) => {
          const clientName = p.clienteName;
          const clientKey = p.clienteNum;
          let branchInfo = '--';
          if (p.sucursalNum && p.sucursalNum !== '0' && p.sucursalNum !== '') {
            branchInfo = p.sucursalName
              ? `Suc. ${p.sucursalName}`
              : `Suc. ${p.sucursalNum}`;
          }
          const row = [
            p.pedidoNum,
            p.fechaStr,
            `${clientKey} - ${clientName}`,
            branchInfo,
            p.impMXN,
            p.impUS,
          ];
          data.push(row);
          vendorTotalMXN += p.impMXN;
          vendorTotalUSD += p.impUS;
          currentRow++;
        });

        const totalRow = [
          '',
          '',
          '',
          'Total Vendedor:',
          vendorTotalMXN,
          vendorTotalUSD,
        ];
        data.push(totalRow);
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow, c: 3 },
        });
        currentRow++;

        data.push([]);
        currentRow++;
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [...colsPedidos, ...summaryColWidths];
      ws['!merges'] = merges;

      // Aplicar Estilos
      ws['A1'].s = styles.title;
      data.forEach((row, rIdx) => {
        if (row.length === 0) return;

        if (isAllVendors && row[0]?.startsWith('Vendedor:')) {
          // Aplicar estilo a toda la fila del vendedor
          for (let cIdx = 0; cIdx < tableWidth; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
            ws[cellRef].s = styles.vendorHeader;
          }
        } else if (row[0] === '# Pedido') {
          // Aplicar estilo a los headers
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (ws[cellRef]) {
              ws[cellRef].s = styles.header;
            }
          }
        } else if (row[3] === 'Total Vendedor:') {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })].s = styles.totalRow;
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
        } else if (rIdx > 0 && !row[0]?.startsWith('Clientes Fuera')) {
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s =
              styles.cellCentered;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })].s =
              styles.cellCentered;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 2 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 2 })].s =
              styles.clientVisitCell;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })].s = styles.cell;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })].s = {
              ...styles.cellRight,
              numFmt: '"$"#,##0.00',
            };
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })].s = {
              ...styles.cellRight,
              numFmt: '"$"#,##0.00',
            };
        }
      });
      XLSX.utils.book_append_sheet(wb, ws, wsName);
    }

    // --- HOJA 3: Clientes Sin Pedidos ---
    {
      const wsName = 'Clientes Sin Pedidos';
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      let currentRow = 0;
      const tableWidth = headersSinPedidos.length; // 2
      const summaryStartCol = tableWidth + 1; // Col 3 (índice 2)

      data.push(['Clientes Sin Pedidos']);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: summaryStartCol + 1 },
      });
      currentRow += 2;

      for (const vendor of vendorsToProcess) {
        const vendorClientesSin = clientesSinPedidos
          .filter((c) => c.vendor === vendor)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (vendorClientesSin.length === 0) continue;

        if (isAllVendors) {
          data.push([`Vendedor: ${vendor}`]);
          merges.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow, c: tableWidth - 1 },
          });
          currentRow++;
        }

        data.push(headersSinPedidos);
        currentRow++;

        vendorClientesSin.forEach((c) => {
          const row = [`${c.key} - ${c.name}`, c.branchName || '--'];
          data.push(row);
          currentRow++;
        });

        if (isAllVendors) {
          const totalRow = ['Total Vendedor:', vendorClientesSin.length];
          data.push(totalRow);
          merges.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow, c: 0 },
          });
          currentRow++;
        }
        data.push([]);
        currentRow++;
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [...colsSinPedidos, ...summaryColWidths];
      ws['!merges'] = merges;

      // Aplicar Estilos
      ws['A1'].s = styles.title;
      data.forEach((row, rIdx) => {
        if (row.length === 0) return;
        if (isAllVendors && row[0]?.startsWith('Vendedor:')) {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s = styles.vendorHeader;
        } else if (row[0] === 'Cliente') {
          row.forEach((_, cIdx) => {
            ws[XLSX.utils.encode_cell({ r: rIdx, c: cIdx })].s =
              styles.nonVisitedHeader;
          });
        } else if (row[0] === 'Total Vendedor:') {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s = styles.totalRow;
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })].s = {
            ...styles.totalRow,
            alignment: { horizontal: 'center' },
          };
        } else if (rIdx > 0 && !row[0]?.startsWith('Clientes Sin Pedidos')) {
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s = styles.cell;
          if (ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })])
            ws[XLSX.utils.encode_cell({ r: rIdx, c: 1 })].s = styles.cell;
        }
      });
      XLSX.utils.book_append_sheet(wb, ws, wsName);
    }

    const summaryData = [
      ['Información del Reporte'],
      ['Fecha(s):', dateRangeStr],
      ['Vendedor:', isAllVendors ? 'TODOS' : selectedVendor],
      [],
      ['Resumen General'],
      ['Pedidos en Ubicación:', grandTotalPedidosEnUbicacion],
      ['Pedidos Fuera Ubicación:', grandTotalPedidosFueraUbicacion],
      ['Clientes Sin Pedidos:', grandTotalSinPedidos],
      ['Total Importe MXN:', grandTotalMXN],
      ['Total Importe USD:', grandTotalUSD],
    ];

    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const tableCols =
        sheetName === 'Clientes Sin Pedidos'
          ? colsSinPedidos.length
          : colsPedidos.length;
      const startCol = tableCols + 1;
      const startRow = 2;

      const merges = ws['!merges'] || [];

      summaryData.forEach((row, rIdx) => {
        const r = startRow + rIdx;
        XLSX.utils.sheet_add_aoa(ws, [row], { origin: { r, c: startCol } });

        const cellRefA = XLSX.utils.encode_cell({ r, c: startCol });
        const cellRefB = XLSX.utils.encode_cell({ r, c: startCol + 1 });

        if (rIdx === 0 || rIdx === 4) {
          if (ws[cellRefA]) ws[cellRefA].s = styles.subHeader;
          if (ws[cellRefB]) ws[cellRefB].s = styles.subHeader;
          merges.push({
            s: { r, c: startCol },
            e: { r, c: startCol + 1 },
          });
        } else if (row.length > 1) {
          if (ws[cellRefA]) ws[cellRefA].s = styles.infoLabel;
          if (ws[cellRefB]) ws[cellRefB].s = styles.infoValue;
          if (
            String(row[0]).includes('MXN') ||
            String(row[0]).includes('USD')
          ) {
            ws[cellRefB].s = {
              ...styles.infoValue,
              numFmt: '"$"#,##0.00',
            };
          }
        }
      });
      ws['!merges'] = merges;

      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'][startCol - 1] = { wch: 3 }; // Espaciador
      ws['!cols'][startCol] = { wch: 30 }; // Label
      ws['!cols'][startCol + 1] = { wch: 25 }; // Value
    });

    const vendorName = isAllVendors ? 'TODOS' : selectedVendor;
    const fileName = `Reporte_Pedidos_${vendorName}_${dateRangeStr.replace(/ a /g, '-')}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* SIDEBAR */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-80'
        } bg-white shadow-lg transition-all duration-300 flex flex-col relative z-20`}
      >
        {/* Header */}
        <div className="pt-4 pl-4 pr-4 pb-2 border-b border-gray-200 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <Coins className="w-7 h-7 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-800">Pedidos</h1>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              className={`w-5 h-5 transition-transform ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Contenido (Scrollable) */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 1. Cargar Archivo de Pedidos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Archivo de Pedidos
              </label>
              <label
                htmlFor="pedidos-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100"
              >
                <Upload className="w-8 h-8 mb-2 text-blue-500 animate-bounce" />
                <span className="text-xs font-semibold text-blue-700 text-center px-2">
                  {pedidosFileName || 'Seleccionar archivo...'}
                </span>
                <input
                  id="pedidos-file"
                  type="file"
                  className="hidden"
                  onChange={handlePedidosFileChange}
                  accept=".xlsx,.xls,.csv"
                />
              </label>
            </div>

            {/* 2. Cargar Archivo de Clientes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Archivo de Clientes
              </label>
              <label
                htmlFor="client-file-pedidos"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100"
              >
                <Users className="w-8 h-8 mb-2 text-green-500 animate-bounce" />
                <span className="text-xs font-semibold text-green-700 text-center px-2">
                  {clientFileName || 'Seleccionar archivo...'}
                </span>
                <input
                  id="client-file-pedidos"
                  type="file"
                  className="hidden"
                  onChange={handleClientFileChange}
                  accept=".xlsx,.xls"
                />
              </label>
            </div>

            {/* 3. Filtros */}
            {pedidosData && allClientsFromFile && (
              <div className="space-y-4 pt-2 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  3. Filtros
                </h3>
                {/* Filtro de Fecha */}
                <div>
                  <label
                    htmlFor="date-select"
                    className="flex text-sm font-medium text-gray-700 mb-1 items-center gap-2"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Selecciona una Fecha
                  </label>
                  <select
                    id="date-select"
                    value={selectedDate || ''}
                    onChange={(e) => setSelectedDate(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Seleccionar</option>

                    {availableDates.map((date) => (
                      <option key={date} value={date}>
                        {date === '__ALL_DATES__' ? 'Todas las Fechas' : date}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seleccion de Vendedor*/}
                <div>
                  <label className="flex text-sm font-medium text-gray-700 mb-2 items-center gap-2">
                    <UserCheck className="w-4 h-4" />
                    Selecciona un Vendedor
                  </label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 mt-2 mb-2">
                      {!showNoVisitados && (
                        <button
                          onClick={() => setSelectedVendor('__ALL__')}
                          className={`w-full px-3 py-2 text-xs font-medium rounded border flex items-center cursor-pointer justify-center gap-2 transition-all ${
                            selectedVendor === '__ALL__'
                              ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                              : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-sky-100 hover:border-blue-400'
                          }`}
                        >
                          <Users className="w-4 h-4" />
                          TODOS LOS VENDEDORES
                        </button>
                      )}
                      {availableVendors.map((vendor) => (
                        <button
                          key={vendor}
                          onClick={() => setSelectedVendor(vendor)}
                          className={`
                            px-4 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out
                            ${
                              selectedVendor === vendor
                                ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105'
                                : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-green-100 hover:border-green-400'
                            }
                          `}
                        >
                          {vendor}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Toggle de Modo GPS */}
                <div className="flex items-center justify-between mt-4">
                  <label htmlFor="toggle-gps-mode" className="flex flex-col">
                    <span className="flex text-sm font-medium text-gray-700 items-center gap-2">
                      <Crosshair className="w-4 h-4" />
                      Tipo de GPS
                    </span>
                    <span className="text-xs text-gray-500">
                      Modo:{' '}
                      {gpsMode === 'envio' ? (
                        <b className="text-blue-600">GPS Envío</b>
                      ) : (
                        <b className="text-purple-600">GPS Captura</b>
                      )}
                    </span>
                  </label>

                  {/* El Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gpsMode === 'captura'}
                    id="toggle-gps-mode"
                    onClick={() =>
                      setGpsMode(gpsMode === 'envio' ? 'captura' : 'envio')
                    }
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out ${
                      gpsMode === 'captura' ? 'bg-purple-600' : 'bg-blue-600'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                  >
                    <span
                      className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                        gpsMode === 'captura'
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle de Clientes No Visitados */}
                {selectedVendor != '__ALL__' && (
                  <div className="flex items-center justify-between pt-2">
                    {/* El título */}
                    <label
                      htmlFor="toggle-no-visitados"
                      className="flex flex-col"
                    >
                      <span className="flex text-sm font-medium text-gray-700 items-center gap-2">
                        <UserX className="w-4 h-4" />
                        Clientes No Visitados
                      </span>
                      <span className="text-xs text-gray-500">
                        {showNoVisitados ? 'Mostrando en el mapa' : 'Ocultos'}
                      </span>
                    </label>

                    {/* Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showNoVisitados}
                      id="toggle-no-visitados"
                      onClick={() => setShowNoVisitados(!showNoVisitados)}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out ${
                        showNoVisitados ? 'bg-green-500' : 'bg-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                          showNoVisitados ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* Filtro de Radio */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Radio de detección de cliente
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Disminuir radio"
                      onClick={() =>
                        setMatchRadius((prev) => Math.max(10, prev - 10))
                      }
                      className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
                      disabled={matchRadius <= 10}
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    <input
                      type="range"
                      min={10}
                      max={500}
                      step={10}
                      value={matchRadius}
                      onChange={(e) => setMatchRadius(Number(e.target.value))}
                      className="flex-1 accent-blue-600"
                      aria-label="Radio de detección de cliente"
                    />

                    <button
                      type="button"
                      aria-label="Aumentar radio"
                      onClick={() =>
                        setMatchRadius((prev) => Math.min(1000, prev + 10))
                      }
                      className="px-1 py-1 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
                      disabled={matchRadius >= 1000}
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    <span className="text-sm font-semibold text-gray-700 w-16 text-right">
                      {matchRadius} m
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Iconos colapsados */}
        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-3 py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
              title="Configuración"
            >
              <Upload className="w-6 h-6 animate animate-bounce" />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <h2 className="text-md font-semibold text-gray-800">
            {isLoading
              ? 'Cargando datos...'
              : selectedDate
                ? `Análisis de Pedidos: ${
                    selectedVendor === '__ALL__' ? 'TODOS' : selectedVendor
                  } - ${
                    selectedDate === '__ALL_DATES__'
                      ? 'Todas las Fechas'
                      : selectedDate
                  }`
                : 'Carga archivos y selecciona filtros'}
          </h2>
          {processedMapData.stats && (
            <div className="flex items-center gap-3">
              <button
                onClick={downloadPedidosExcel}
                className="sm:flex items-center text-sm font-medium justify-center px-4 py-2 gap-2 text-white bg-green-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-all"
              >
                <Download className="w-4 h-4" />
                Descargar Excel
              </button>
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg
                  className={`w-5 h-5 transition-transform ${
                    showAnalytics ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                {showAnalytics ? 'Ocultar' : 'Mostrar'} Análisis
              </button>
            </div>
          )}
        </div>

        {/* Contenido (Mapa) */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {selectedDate && selectedVendor !== undefined && !isLoading ? (
            processedMapData.clientMarkers.length > 0 ||
            processedMapData.pedidoMarkers.length > 0 ? (
              <iframe
                srcDoc={generateMapHTML()}
                className="w-full h-full border-0"
                title="Mapa de Pedidos"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    No se encontraron datos
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    No hay pedidos para esta selección en esta fecha.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Coins className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {isLoading ? 'Cargando...' : 'Selecciona archivos y filtros'}
                </p>
                {!isLoading && (
                  <p className="text-gray-400 text-sm mt-2">
                    Carga un archivo de pedidos y de clientes.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ANÁLISIS */}
        {showAnalytics && processedMapData.stats && (
          <div className="bg-white h-full overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Análisis y datos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Pedidos */}
              <div className="bg-blue-50 text-center rounded-lg p-4 border border-blue-200 text-blue-800">
                <div className="justify-center flex items-center gap-2 mb-2">
                  <Package className="w-5 h-5 text-blue-600 animate-pulse" />
                  <h4 className="text-sm font-semibold">Total Pedidos</h4>
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  {processedMapData.stats.totalPedidos}
                </p>
              </div>

              {/* % Match */}
              <div className="grid grid-cols-2">
                {/* Con coincidencia */}
                <div className="bg-green-50 text-center rounded-l-lg p-3 border-y border-l border-green-200 text-green-800">
                  <div className="justify-center flex items-center gap-2 mb-2">
                    <MapPinCheckInside className="w-5 h-5 text-green-600 animate-pulse" />
                    <h4 className="text-sm font-semibold">% Coincidencia</h4>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">
                      {processedMapData.stats.matchPercentage.toFixed(1)}%
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      ({processedMapData.stats.pedidosConMatch} de{' '}
                      {processedMapData.stats.pedidosConMatch +
                        processedMapData.stats.pedidosSinMatch}
                      {''})
                    </p>
                  </div>
                </div>
                {/* Sin coincidencia */}
                <div className="bg-red-50 text-center rounded-r-lg p-3 border-y border-r border-red-200 text-red-800">
                  <div className="justify-center flex items-center gap-2 mb-2">
                    <MapPinXInside className="w-6 h-6 text-ref-600 animate-pulse" />
                    <h4 className="text-sm font-semibold">
                      % Sin Coincidencia
                    </h4>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-800">
                      {processedMapData.stats.sinMatchPercentage.toFixed(1)}%
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      ({processedMapData.stats.pedidosSinMatch} de{' '}
                      {processedMapData.stats.pedidosConMatch +
                        processedMapData.stats.pedidosSinMatch}
                      {''})
                    </p>
                  </div>
                </div>
              </div>

              {/* Clientes (Visitados vs. No Visitados) */}
              {selectedVendor != '__ALL__' && (
                <div className="grid grid-cols-2">
                  {/* Visitados */}
                  <div className="bg-yellow-50 text-center rounded-l-lg p-4 border-y border-l border-yellow-200 text-yellow-800">
                    <div className="justify-center flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-yellow-600 animate-pulse" />
                      <h4 className="text-sm font-semibold">Visitados</h4>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-900">
                        {processedMapData.stats.totalClients}
                      </p>
                    </div>
                  </div>

                  {/* No Visitados */}
                  <div className="bg-orange-50 text-center rounded-r-lg pt-4 2xl:p-4 border-y border-r border-orange-200 text-orange-800">
                    <div className="justify-center flex items-center gap-2 mb-2">
                      <UserX className="w-5 h-5 text-orange-600 animate-pulse" />
                      <h4 className="text-sm font-semibold">No Visitados</h4>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-900">
                        {processedMapData.clientesNoVisitados.length}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Clientes */}
              {selectedVendor === '__ALL__' && (
                <div className="bg-yellow-50 text-center rounded-lg p-4 border border-yellow-200 text-yellow-800">
                  <div className="justify-center flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-yellow-600 animate-pulse" />
                    <h4 className="text-sm font-semibold">Clientes</h4>
                  </div>
                  <p className="text-2xl font-bold text-yellow-900">
                    {processedMapData.stats.totalClients}
                  </p>
                </div>
              )}

              {/* Ventas */}
              <div className="grid grid-cols-2">
                <div className="bg-sky-50 text-center rounded-l-lg border-y border-l border-sky-200 text-sky-800">
                  <div className="justify-center px-4 pt-4 flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-sky-600 animate-pulse" />
                    <h4 className="text-sm font-semibold">Ventas - MXN</h4>
                  </div>
                  <p className="text-lg text-center font-bold text-sky-900">
                    {processedMapData.stats.totalMXN.toLocaleString('es-MX', {
                      style: 'currency',
                      currency: 'MXN',
                    })}
                  </p>
                </div>
                <div className="bg-indigo-50 text-center rounded-r-lg border-y border-r border-indigo-200 text-indigo-800">
                  <div className="justify-center px-4 pt-4 flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-indigo-600 animate-pulse" />
                    <h4 className="text-sm font-semibold">Ventas - US</h4>
                  </div>
                  <p className="text-lg text-center font-bold text-indigo-900">
                    {processedMapData.stats.totalUS.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE GRÁFICAS */}
            <div className="mt-8 flex flex-wrap lg:flex-nowrap justify-center gap-8">
              {/* Gráfica 1: Dona*/}
              <div className="bg-white p-4 rounded-lg border border-gray-300 w-full max-w-md">
                <Doughnut options={doughnutOptions} data={doughnutData} />
              </div>

              {/* Gráfica 2: Barras ('TODOS') */}
              {selectedVendor === '__ALL__' &&
                pedidosPorVendedor &&
                pedidosPorVendedor.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border border-gray-300 w-full max-w-md">
                    <Bar options={barOptions} data={barData} />
                  </div>
                )}
            </div>
          </div>
        )}
      </main>

      {/* ERROR TOAST */}
      {error && (
        <div
          className={`
            fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg 
            flex items-center gap-3 max-w-md z-50
            transition-all duration-500 ease-in-out
            ${
              isToastVisible
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-10'
            }
          `}
        >
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={handleCloseToast}
            className="ml-auto hover:bg-red-600 p-1 rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
