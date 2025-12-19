/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Users,
  MapPin,
  CalendarDays,
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
  ChartNoAxesCombined,
  Search,
  Check,
  Calendar,
  Database,
  RefreshCw,
  ShoppingCart,
  UserCheck,
} from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCartShopping,
  faHouse,
  faMapLocationDot,
} from '@fortawesome/free-solid-svg-icons';
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
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  MarkerClusterer,
} from '@react-google-maps/api';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  type Client,
  calculateDistance,
  toTitleCase,
} from '../utils/tripUtils';
import { GOOGLE_MAPS_LIBRARIES } from '../utils/mapConfig';
import { useClients } from '../context/ClientContext';
import { useOrders } from '../context/OrderContext';

// Mantenemos la interfaz interna que usa tu lógica actual
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
  type: 'client';
  id: string;
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
  type: 'pedido';
  id: string;
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

interface INoVisitadoMarker {
  type: 'no-visitado';
  id: string;
  number: string;
  name: string;
  lat: number;
  lng: number;
  branchName: string;
  vendor: string;
}

type MapMarker = IClientMarker | IPedidoMarker | INoVisitadoMarker;

const parseGps = (gpsString: string): { lat: number; lng: number } | null => {
  if (!gpsString || gpsString === '0,0' || gpsString === '0.0,0.0') return null;
  const parts = gpsString.trim().split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

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
      const radius = 0.0008;
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
const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 25.0, lng: -100.0 };

export default function PedidosTracker() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading] = useState(false);

  const {
    masterClients,
    loading: isLoadingClients,
    refreshClients,
  } = useClients();

  const {
    orders: sqlOrders,
    loading: isLoadingOrders,
    error: ordersError,
    refreshOrders,
  } = useOrders();

  const [pedidosData, setPedidosData] = usePersistentState<IPedido[] | null>(
    'pt_pedidosData',
    null
  );

  const [availableDates, setAvailableDates] = usePersistentState<string[]>(
    'pt_availableDates',
    []
  );
  const [dateSearchTerm, setDateSearchTerm] = useState('');
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
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

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    if (!sqlOrders || sqlOrders.length === 0) {
      if (!isLoadingOrders && sqlOrders.length === 0) {
        setPedidosData(null);
        setAvailableDates([]);
        setAvailableVendors([]);
      }
      return;
    }

    const processed: IPedido[] = sqlOrders.map((o) => ({
      pedidoNum: String(o.pedidoId),
      vendedor: o.vend,
      fechaStr: o.fecha,
      clienteNum: String(o.clienteId),
      clienteName: o.nombreCliente,
      sucursalNum: String(o.sucursalId),
      sucursalName: o.sucursalNombre,
      impMXN: o.importeMN,
      impUS: o.importeUS,
      pedidoClientGps: parseGps(o.gpsCliente),
      capturaGps: parseGps(o.gpsCaptura),
      envioGps: parseGps(o.gpsEnvio),
      procedencia: o.procedencia,
      isMatch: false,
      distance: Infinity,
    }));

    setPedidosData(processed);

    const dates = new Set<string>();
    const vendors = new Set<string>();
    processed.forEach((p) => {
      dates.add(p.fechaStr);
      vendors.add(p.vendedor);
    });

    const sortedDates = Array.from(dates).sort();
    if (sortedDates.length > 1) {
      sortedDates.unshift('__ALL_DATES__');
    }
    setAvailableDates(sortedDates);
    setAvailableVendors(Array.from(vendors).sort());
  }, [
    sqlOrders,
    isLoadingOrders,
    setPedidosData,
    setAvailableDates,
    setAvailableVendors,
  ]);

  // Manejo de errores del contexto
  useEffect(() => {
    if (ordersError) setError(ordersError);
  }, [ordersError]);

  const processedMapData = useMemo(() => {
    if (
      !pedidosData ||
      !masterClients ||
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

      let masterClient = masterClients.find((c) => c.key === pedido.clienteNum);

      if (['3689', '6395'].includes(pedido.clienteNum)) {
        const clientByName = masterClients.find(
          (c) =>
            c.name.trim().toLowerCase() ===
            pedido.clienteName.trim().toLowerCase()
        );

        if (clientByName) {
          masterClient = clientByName;
        }
      }

      const clientGps = masterClient
        ? { lat: masterClient.lat, lng: masterClient.lng }
        : null;
      const displayKey = masterClient ? masterClient.key : pedido.clienteNum;
      const displayName = masterClient ? masterClient.name : pedido.clienteName;

      if (!gpsAAnalizar) {
        const tieneImportes = pedido.impMXN > 0 || pedido.impUS > 0;

        if (tieneImportes) {
          pedidosEnMatriz++;

          if (clientGps) {
            if (clientMap.has(displayKey)) {
              const existing = clientMap.get(displayKey)!;
              existing.totalPedidos += 1;
              existing.totalMXN += pedido.impMXN;
              existing.totalUS += pedido.impUS;
            } else {
              clientMap.set(displayKey, {
                type: 'client',
                id: `client-${displayKey}`,
                number: displayKey,
                name: displayName,
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
        type: 'pedido',
        id: `pedido-${pedido.pedidoNum}`,
        number: pedido.pedidoNum,
        lat: gpsAAnalizar.lat,
        lng: gpsAAnalizar.lng,
        isMatch,
        distance,
        clienteKey: displayKey,
        clienteName: displayName,
        impMXN: pedido.impMXN,
        impUS: pedido.impUS,
        vendedor: pedido.vendedor,
      });

      if (clientGps) {
        if (clientMap.has(displayKey)) {
          const existing = clientMap.get(displayKey)!;
          existing.totalPedidos += 1;
          existing.totalMXN += pedido.impMXN;
          existing.totalUS += pedido.impUS;
        } else {
          clientMap.set(displayKey, {
            type: 'client',
            id: `client-${displayKey}`,
            number: displayKey,
            name: displayName,
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
          if (pMarker.distance !== Infinity) {
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

    const allVendorClients = masterClients.filter(
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

    if (closestSpecialClient) {
      if (!visitedClientKeys.has(closestSpecialClient.key)) {
        clientMarkers.push({
          type: 'client',
          id: `client-${closestSpecialClient.key}`,
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
        visitedClientKeys.add(closestSpecialClient.key);
      }
    }

    const closestSpecialClientKey = closestSpecialClient
      ? closestSpecialClient.key
      : null;

    const clientesNoVisitados: INoVisitadoMarker[] = [];
    regularClientsOnRoute.forEach((regularClient) => {
      if (!visitedClientKeys.has(regularClient.key)) {
        clientesNoVisitados.push({
          type: 'no-visitado',
          id: `novisit-${regularClient.key}`,
          number: regularClient.key,
          name: regularClient.name,
          lat: regularClient.lat,
          lng: regularClient.lng,
          branchName: regularClient.branchName || '',
          vendor: regularClient.vendor,
        });
      }
    });

    const pedidoMarkers = applyOffsetsToMarkers(pedidoMarkersRaw).map((p) => ({
      ...p,
      lat: p.offset?.lat || p.lat,
      lng: p.offset?.lng || p.lng,
    })) as IPedidoMarker[];

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
    masterClients,
    selectedDate,
    selectedVendor,
    matchRadius,
    gpsMode,
  ]);

  // Funciones para controlar el mapa
  const onLoad = useCallback(
    (map: google.maps.Map) => {
      const bounds = new window.google.maps.LatLngBounds();
      const { clientMarkers, pedidoMarkers, clientesNoVisitados } =
        processedMapData;

      clientMarkers.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      pedidoMarkers.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      if (showNoVisitados) {
        clientesNoVisitados.forEach((p) =>
          bounds.extend({ lat: p.lat, lng: p.lng })
        );
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
      }
      setMap(map);
    },
    [processedMapData, showNoVisitados]
  );

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Efecto para centrar el mapa cuando cambian los datos
  useEffect(() => {
    if (map) {
      const bounds = new window.google.maps.LatLngBounds();
      const { clientMarkers, pedidoMarkers, clientesNoVisitados } =
        processedMapData;

      const allPoints = [
        ...clientMarkers,
        ...pedidoMarkers,
        ...(showNoVisitados ? clientesNoVisitados : []),
      ];

      if (allPoints.length > 0) {
        allPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds);
      }
    }
  }, [map, processedMapData, showNoVisitados]);

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

  const downloadPedidosExcel = () => {
    if (!pedidosData || !selectedDate || !selectedVendor || !masterClients) {
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
        font: {
          name: 'Arial',
          sz: 11,
          bold: true,
          color: { rgb: 'FFFFFFFF' },
        },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: {
          wrapText: true,
          vertical: 'center',
          horizontal: 'center',
        },
      },
      vendorHeader: {
        font: {
          name: 'Arial',
          sz: 11,
          bold: true,
          color: { rgb: 'FFFFFFFF' },
        },
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
        font: {
          name: 'Arial',
          sz: 11,
          bold: true,
          color: { rgb: 'FFFFFFFF' },
        },
        fill: { fgColor: { rgb: 'FFC00000' } },
        alignment: { horizontal: 'center' },
      },
      infoLabel: {
        font: { name: 'Arial', sz: 10, bold: true },
        alignment: { horizontal: 'right' },
      },
      infoValue: {
        font: { name: 'Arial', sz: 10 },
        alignment: { horizontal: 'left' },
      },
      subHeader: {
        font: {
          name: 'Arial',
          sz: 12,
          bold: true,
          color: { rgb: 'FFFFFFFF' },
        },
        fill: { fgColor: { rgb: 'FF4F81BD' } },
        alignment: { vertical: 'center', horizontal: 'center' },
      },
      noDataRow: {
        font: {
          name: 'Arial',
          sz: 10,
          italic: true,
          color: { rgb: 'FF555555' },
        },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    const filteredPedidos = pedidosData.filter((p) => {
      if (selectedDate !== '__ALL_DATES__' && p.fechaStr !== selectedDate) {
        return false;
      }
      return isAllVendors ? true : p.vendedor === selectedVendor;
    });

    interface IPedidoExport extends IPedido {
      finalClientName: string;
      finalClientKey: string;
    }

    const clientesConCoincidencia: IPedidoExport[] = [];
    const clientesFueraUbicacion: IPedidoExport[] = [];
    const clientesConPedidos = new Set<string>();

    for (const pedido of filteredPedidos) {
      const gpsAAnalizar =
        gpsMode === 'envio' ? pedido.envioGps : pedido.capturaGps;

      let masterClient = masterClients.find((c) => c.key === pedido.clienteNum);

      if (['3689', '6395'].includes(pedido.clienteNum)) {
        const clientByName = masterClients.find(
          (c) =>
            c.name.trim().toLowerCase() ===
            pedido.clienteName.trim().toLowerCase()
        );
        if (clientByName) {
          masterClient = clientByName;
        }
      }

      const clientGps = masterClient
        ? { lat: masterClient.lat, lng: masterClient.lng }
        : null;

      let displayName = toTitleCase(pedido.clienteName);
      let displayKey = pedido.clienteNum;

      if (masterClient) {
        displayName = toTitleCase(masterClient.name);
        displayKey = masterClient.key;
      } else if (['3689', '6395'].includes(pedido.clienteNum)) {
        displayName = 'Tools de México (Oficina)';
      }

      clientesConPedidos.add(displayKey);

      let isMatch = false;

      if (!gpsAAnalizar) {
        if (pedido.impMXN > 0 || pedido.impUS > 0) {
          isMatch = false;
        } else {
          continue;
        }
      } else {
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

      const pedidoExport: IPedidoExport = {
        ...pedido,
        finalClientName: displayName,
        finalClientKey: displayKey,
      };

      if (isMatch) {
        clientesConCoincidencia.push(pedidoExport);
      } else {
        clientesFueraUbicacion.push(pedidoExport);
      }
    }

    const clientesVendedor = isAllVendors
      ? masterClients
      : masterClients.filter((c) => c.vendor === selectedVendor);

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

    const headersPedidos = [
      '# Pedido',
      'Fecha',
      'Cliente',
      'Sucursal',
      'Imp MXN',
      'Imp USD',
    ];
    const colsPedidos = [
      { wch: 17 },
      { wch: 12 },
      { wch: 43 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
    ];
    const headersSinPedidos = ['Cliente', 'Sucursal'];
    const colsSinPedidos = [{ wch: 40 }, { wch: 25 }];
    const summaryColWidths = [{ wch: 2 }, { wch: 30 }, { wch: 25 }];

    const generatePedidoSheet = (
      sheetTitle: string,
      pedidosList: IPedidoExport[]
    ) => {
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      let currentRow = 0;
      const tableWidth = headersPedidos.length;
      const summaryStartCol = tableWidth + 1;

      data.push([sheetTitle]);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: summaryStartCol + 1 },
      });

      data.push([]);
      currentRow = 2;

      if (isAllVendors && pedidosList.length === 0) {
        data.push([
          'No se encontraron pedidos en esta sección para ningún vendedor',
        ]);
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow, c: tableWidth - 1 },
        });
        currentRow++;
        const totalRow = ['', '', '', 'Total General:', 0, 0];
        data.push(totalRow);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
      } else {
        for (const vendor of vendorsToProcess) {
          const vendorPedidos = pedidosList
            .filter((p) => p.vendedor === vendor)
            .sort((a, b) => a.finalClientName.localeCompare(b.finalClientName));

          if (isAllVendors && vendorPedidos.length === 0) continue;

          let vendorTotalMXN = 0;
          let vendorTotalUSD = 0;

          if (isAllVendors) {
            data.push([`Vendedor: ${vendor}`]);
            merges.push({
              s: { r: currentRow, c: 0 },
              e: { r: currentRow, c: tableWidth - 1 },
            });
            currentRow++;
          }

          data.push([...headersPedidos]);
          currentRow++;

          if (vendorPedidos.length === 0) {
            const noDataRow = [
              'No se encontraron pedidos en esta sección',
              '',
              '',
              '',
              '',
              '',
            ];
            data.push(noDataRow);
            merges.push({
              s: { r: currentRow, c: 0 },
              e: { r: currentRow, c: tableWidth - 1 },
            });
            currentRow++;
          } else {
            vendorPedidos.forEach((p) => {
              const clientName = p.finalClientName;
              const clientKey = p.finalClientKey;
              let branchInfo = '--';
              if (
                p.sucursalNum &&
                p.sucursalNum !== '0' &&
                p.sucursalNum !== ''
              ) {
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
          }

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
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [...colsPedidos, ...summaryColWidths];
      ws['!merges'] = merges;

      ws['A1'].s = styles.title;
      data.forEach((row, rIdx) => {
        if (row.length === 0) return;
        if (
          row[0] === 'No se encontraron pedidos en esta sección' ||
          row[0] ===
            'No se encontraron pedidos en esta sección para ningún vendedor'
        ) {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s = styles.noDataRow;
        } else if (isAllVendors && row[0]?.startsWith('Vendedor:')) {
          for (let cIdx = 0; cIdx < tableWidth; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
            ws[cellRef].s = styles.vendorHeader;
          }
        } else if (row[0] === '# Pedido') {
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (ws[cellRef]) ws[cellRef].s = styles.header;
          }
        } else if (
          row[3] === 'Total Vendedor:' ||
          row[3] === 'Total General:'
        ) {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 3 })].s = styles.totalRow;
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 4 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 5 })].s = {
            ...styles.totalRow,
            numFmt: '"$"#,##0.00',
          };
        } else if (
          rIdx > 0 &&
          !row[0]?.startsWith('Clientes') &&
          !row[0]?.startsWith('Vendedor:')
        ) {
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

      XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    };

    generatePedidoSheet('Clientes en Ubicación', clientesConCoincidencia);
    generatePedidoSheet('Clientes Fuera Ubicación', clientesFueraUbicacion);

    // --- HOJA 3: Clientes Sin Pedidos ---
    {
      const wsName = 'Clientes Sin Pedidos';
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      let currentRow = 0;
      const tableWidth = headersSinPedidos.length;
      const summaryStartCol = tableWidth + 1;
      data.push(['Clientes Sin Pedidos']);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: summaryStartCol + 1 },
      });
      currentRow += 2;

      if (isAllVendors && clientesSinPedidos.length === 0) {
        data.push(['Todos los clientes tienen pedidos (¡Felicidades!)']);
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow, c: tableWidth - 1 },
        });
        currentRow++;
        const totalRow = ['Total Vendedor:', 0];
        data.push(totalRow);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 0 } });
      } else {
        for (const vendor of vendorsToProcess) {
          const vendorClientesSin = clientesSinPedidos
            .filter((c) => c.vendor === vendor)
            .sort((a, b) => a.name.localeCompare(b.name));

          if (isAllVendors && vendorClientesSin.length === 0) continue;

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

          if (vendorClientesSin.length === 0) {
            data.push(['Todos los clientes tienen pedidos']);
            merges.push({
              s: { r: currentRow, c: 0 },
              e: { r: currentRow, c: tableWidth - 1 },
            });
            currentRow++;
          } else {
            vendorClientesSin.forEach((c) => {
              const row = [
                `${c.key} - ${toTitleCase(c.name)}`,
                c.branchName || '--',
              ];
              data.push(row);
              currentRow++;
            });
          }

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
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [...colsSinPedidos, ...summaryColWidths];
      ws['!merges'] = merges;

      ws['A1'].s = styles.title;
      data.forEach((row, rIdx) => {
        if (row.length === 0) return;
        if (
          row[0] === 'Todos los clientes tienen pedidos' ||
          row[0] === 'Todos los clientes tienen pedidos (¡Felicidades!)'
        ) {
          ws[XLSX.utils.encode_cell({ r: rIdx, c: 0 })].s = styles.noDataRow;
        } else if (isAllVendors && row[0]?.startsWith('Vendedor:')) {
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
          merges.push({ s: { r, c: startCol }, e: { r, c: startCol + 1 } });
        } else if (row.length > 1) {
          if (ws[cellRefA]) ws[cellRefA].s = styles.infoLabel;
          if (ws[cellRefB]) ws[cellRefB].s = styles.infoValue;
          if (
            String(row[0]).includes('MXN') ||
            String(row[0]).includes('USD')
          ) {
            ws[cellRefB].s = { ...styles.infoValue, numFmt: '"$"#,##0.00' };
          }
        }
      });
      ws['!merges'] = merges;
      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'][startCol - 1] = { wch: 3 };
      ws['!cols'][startCol] = { wch: 30 };
      ws['!cols'][startCol + 1] = { wch: 25 };
    });

    const vendorName = isAllVendors ? 'TODOS' : selectedVendor;
    const fileName = `Reporte_Pedidos_${vendorName}_${dateRangeStr.replace(/ a /g, '-')}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  const { stats, pedidosPorVendedor } = processedMapData;

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
          '#22c55e',
          '#ef4444',
          '#f59e0b',
          '#6b7280',
          '#3b82f6',
        ],
        borderColor: ['#ffffff'],
        borderWidth: 3,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Estado de Pedidos', font: { size: 16 } },
    },
  };

  const barData = {
    labels: pedidosPorVendedor?.map((v) => v.vendedor) || [],
    datasets: [
      {
        label: 'En Ubicación',
        data: pedidosPorVendedor?.map((v) => v.match) || [],
        backgroundColor: '#22c55e',
      },
      {
        label: 'Fuera de Ubicación',
        data: pedidosPorVendedor?.map((v) => v.noMatch) || [],
        backgroundColor: '#ef4444',
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: 'Rendimiento por Vendedor',
        font: { size: 16 },
      },
    },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  const clustererOptions = useMemo(
    () => ({
      gridSize: 30,
      maxZoom: 14,
      minimumClusterSize: 2,
      averageCenter: true,
    }),
    []
  );

  const totalMarkersCount =
    processedMapData.clientMarkers.length +
    processedMapData.pedidoMarkers.length +
    (showNoVisitados ? processedMapData.clientesNoVisitados.length : 0);

  const shouldCluster = totalMarkersCount > 30;

  const renderMarkers = (clusterer: any = null) => (
    <>
      {/* 1. Marcadores Clientes */}
      {processedMapData.clientMarkers.map((client: any, idx: number) => (
        <Marker
          key={`c-${idx}`}
          position={{ lat: client.lat, lng: client.lng }}
          clusterer={clusterer}
          icon={{
            path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
            fillColor:
              client.number === processedMapData.closestSpecialClientKey
                ? '#002FFF'
                : '#000000',
            fillOpacity: 1,
            strokeWeight: 0,
            strokeColor: '#fff',
            scale: 1.3,
            anchor: new google.maps.Point(12, 24),
          }}
          onClick={() => setSelectedMarker({ ...client, type: 'client' })}
        />
      ))}

      {/* 2. Marcadores Pedidos */}
      {processedMapData.pedidoMarkers.map((pedido: any, idx: number) => (
        <Marker
          key={`p-${idx}`}
          position={{ lat: pedido.lat, lng: pedido.lng }}
          clusterer={clusterer}
          icon={{
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: pedido.isMatch ? '#22c55e' : '#ef4444',
            fillOpacity: 1,
            strokeWeight: 0,
            scale: 1.5,
            anchor: new google.maps.Point(12, 24),
          }}
          onClick={() => setSelectedMarker({ ...pedido, type: 'pedido' })}
        />
      ))}

      {/* 3. Marcadores No Visitados */}
      {showNoVisitados &&
        processedMapData.clientesNoVisitados.map((client: any, idx: number) => (
          <Marker
            key={`nv-${idx}`}
            position={{ lat: client.lat, lng: client.lng }}
            clusterer={clusterer}
            icon={{
              path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
              fillColor: '#636970',
              fillOpacity: 0.8,
              strokeWeight: 1,
              strokeColor: 'white',
              scale: 1.2,
              anchor: new google.maps.Point(12, 24),
            }}
            onClick={() =>
              setSelectedMarker({ ...client, type: 'no-visitado' })
            }
          />
        ))}
    </>
  );

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
            {/* 1. ESTADO DE PEDIDOS (Reemplaza carga de archivo) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Base de Datos de Pedidos
              </label>
              <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-200 flex justify-between items-center">
                {pedidosData && pedidosData.length > 0 ? (
                  <div className="flex items-center gap-2 text-indigo-700">
                    <ShoppingCart className="w-4 h-4" />
                    <span className="text-xs font-semibold">
                      {pedidosData.length} pedidos (SQL)
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-orange-600 flex items-center gap-2">
                    {isLoadingOrders ? 'Cargando BD...' : 'Sin pedidos'}
                  </div>
                )}
                <button
                  onClick={() => refreshOrders()}
                  className="bg-indigo-100 rounded-full p-1 text-indigo-700 hover:text-indigo-900 hover:scale-120 transition-transform"
                  title="Recargar Pedidos"
                  disabled={isLoadingOrders}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            {/* 2. Clientes */}
            {pedidosData && masterClients && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  2. Base de Datos de Clientes
                </label>
                <div className="bg-green-50 p-2 rounded border border-green-200 flex justify-between items-center">
                  {masterClients && masterClients.length > 0 ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <Database className="w-4 h-4" />
                      <span className="text-xs font-semibold">
                        {masterClients.length} clientes (SQL)
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-orange-600 flex items-center gap-2">
                      {isLoadingClients ? 'Cargando...' : 'Sin conexión a BD'}
                    </div>
                  )}
                  <button
                    onClick={() => refreshClients(true)}
                    className="bg-green-100 rounded-full p-1 text-green-700 hover:text-green-900 hover:scale-120 transition-transform"
                    title="Recargar clientes"
                    disabled={isLoadingClients}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingClients ? 'animate-spin' : ''}`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* 3. Filtros */}
            {pedidosData && masterClients && (
              <div className="space-y-4 pt-2 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  3. Filtros
                </h3>
                {/* Seleccion de fecha */}
                <div className="relative">
                  <label className="flex text-sm font-medium text-gray-700 mb-1 items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> Selecciona una Fecha
                  </label>

                  {/* Boton para abrir el selector de la fecha */}
                  <div>
                    <button
                      onClick={() => {
                        setIsDateSelectorOpen(true);
                        setDateSearchTerm('');
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 flex items-center justify-between hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all group shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`p-2 rounded-full ${
                            selectedDate
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col items-start truncate">
                          <span className="text-xs text-gray-500 font-medium">
                            Filtro actual:
                          </span>
                          <span className="text-sm font-bold text-gray-800 truncate">
                            {selectedDate === '__ALL_DATES__'
                              ? 'Todas las Fechas'
                              : selectedDate
                                ? selectedDate
                                : 'Seleccionar Fecha'}
                          </span>
                        </div>
                      </div>
                      <div className="text-gray-400 group-hover:text-blue-500">
                        <Search className="w-4 h-4" />
                      </div>
                    </button>
                  </div>

                  {/* Menú Desplegable */}
                  {isDateSelectorOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsDateSelectorOpen(false)}
                      />

                      <div className="absolute z-40 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 flex flex-col">
                        {/* Barra de Búsqueda Interna */}
                        <div className="p-2 border-b border-gray-100 sticky top-0 bg-white rounded-t-md">
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 w-3 h-3 text-gray-400" />
                            <input
                              type="text"
                              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 focus:outline-none focus:border-blue-500 text-gray-700"
                              placeholder="Buscar (ej. 2023-10...)"
                              value={dateSearchTerm}
                              onChange={(e) =>
                                setDateSearchTerm(e.target.value)
                              }
                              autoFocus
                            />
                          </div>
                        </div>

                        {/* Lista de Opciones */}
                        <ul className="overflow-auto flex-1 py-1">
                          {/* Opción Fija: Todas las fechas */}
                          <li
                            className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-blue-50 transition-colors ${
                              selectedDate === '__ALL_DATES__'
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-700'
                            }`}
                            onClick={() => {
                              setSelectedDate('__ALL_DATES__');
                              setIsDateSelectorOpen(false);
                            }}
                          >
                            <span>Todas las Fechas</span>
                            {/* Solo muestra Check si explícitamente se seleccionó TODAS */}
                            {selectedDate === '__ALL_DATES__' && (
                              <Check className="w-4 h-4" />
                            )}
                          </li>

                          <div className="border-t border-gray-100 my-1 mx-2"></div>

                          {/* Fechas Filtradas */}
                          {availableDates
                            .filter((date) => date !== '__ALL_DATES__')
                            .filter((date) => date.includes(dateSearchTerm))
                            .map((date) => (
                              <li
                                key={date}
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors ${
                                  selectedDate === date
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700'
                                }`}
                                onClick={() => {
                                  setSelectedDate(date);
                                  setIsDateSelectorOpen(false);
                                }}
                              >
                                <span>{date}</span>
                                {selectedDate === date && (
                                  <Check className="w-4 h-4" />
                                )}
                              </li>
                            ))}

                          {/* Mensaje si no hay resultados */}
                          {availableDates.filter(
                            (d) =>
                              d !== '__ALL_DATES__' &&
                              d.includes(dateSearchTerm)
                          ).length === 0 && (
                            <li className="px-3 py-4 text-xs text-center text-gray-400 italic">
                              No se encontraron fechas
                            </li>
                          )}
                        </ul>
                      </div>
                    </>
                  )}
                </div>

                {/* Seleccion de un vendedor */}
                <div>
                  <label className="flex text-sm font-medium text-gray-700 mb-2 items-center gap-2">
                    <UserCheck className="w-4 h-4" /> Selecciona un Vendedor
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
                          <Users className="w-4 h-4" /> TODOS LOS VENDEDORES
                        </button>
                      )}
                      {availableVendors.map((vendor) => (
                        <button
                          key={vendor}
                          onClick={() => setSelectedVendor(vendor)}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all duration-200 ease-in-out ${
                            selectedVendor === vendor
                              ? 'bg-green-500 text-white border-green-500 shadow-lg transform scale-105'
                              : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-green-100 hover:border-green-400'
                          }`}
                        >
                          {vendor}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <label htmlFor="toggle-gps-mode" className="flex flex-col">
                    <span className="flex text-sm font-medium text-gray-700 items-center gap-2">
                      <Crosshair className="w-4 h-4" /> Tipo de GPS
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

                {selectedVendor != '__ALL__' && (
                  <div className="flex items-center justify-between pt-2">
                    <label
                      htmlFor="toggle-no-visitados"
                      className="flex flex-col"
                    >
                      <span className="flex text-sm font-medium text-gray-700 items-center gap-2">
                        <UserX className="w-4 h-4" /> Clientes No Visitados
                      </span>
                      <span className="text-xs text-gray-500">
                        {showNoVisitados ? 'Mostrando en el mapa' : 'Ocultos'}
                      </span>
                    </label>
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

        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-3 py-20 bg-blue-100 text-blue-600 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
              title="Configuración"
            >
              <Users className="w-6 h-6 animate animate-bounce" />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
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
                : 'Base de datos cargada. Selecciona filtros.'}
          </h2>
          {processedMapData.stats && (
            <div className="flex items-center gap-3">
              <button
                onClick={downloadPedidosExcel}
                className="sm:flex items-center text-sm font-medium justify-center px-4 py-2 gap-2 text-white bg-green-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-all"
              >
                <Download className="w-4 h-4" /> Descargar Excel
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
        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p>Procesando datos...</p>
            </div>
          ) : selectedVendor === '__ALL__' &&
            selectedDate === '__ALL_DATES__' ? (
            /* CASO: TODOS LOS VENDEDORES */
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 p-8">
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 max-w-lg text-center">
                <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 px-2">
                  <FontAwesomeIcon
                    icon={faMapLocationDot}
                    className="min-w-14 min-h-14 text-blue-600"
                  />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">
                  Vista de Mapa Deshabilitada
                </h3>
                <p className="text-gray-600 mb-5 leading-relaxed">
                  Se seleccionó <strong>"Todos los Vendedores"</strong> y{' '}
                  <strong>"Todas las Fechas"</strong>. Debido a la gran cantidad
                  de puntos, el mapa se desactivó para evitar problemas de
                  rendimiento.
                </p>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                  <p className="font-medium flex items-center justify-center gap-2">
                    <ChartNoAxesCombined className="w-4 h-4" />
                    Aún se pueden ver las estadísticas y descargar el reporte.
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-6">
                  Para ver el mapa, selecciona un vendedor específico.
                </p>
              </div>
            </div>
          ) : selectedDate &&
            selectedVendor !== undefined &&
            (processedMapData.clientMarkers.length > 0 ||
              processedMapData.pedidoMarkers.length > 0) ? (
            /* CASO: UN VENDEDOR */
            isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={defaultCenter}
                zoom={5}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                  mapTypeControl: false,
                  streetViewControl: true,
                  fullscreenControl: false,
                  gestureHandling: 'greedy',
                }}
              >
                {shouldCluster ? (
                  <MarkerClusterer options={clustererOptions}>
                    {(clusterer) => renderMarkers(clusterer)}
                  </MarkerClusterer>
                ) : (
                  renderMarkers(null)
                )}

                {/* VENTANAS DE INFORMACIÓN */}
                {selectedMarker && (
                  <InfoWindow
                    position={{
                      lat: selectedMarker.lat,
                      lng: selectedMarker.lng,
                    }}
                    onCloseClick={() => setSelectedMarker(null)}
                    options={{
                      pixelOffset: new window.google.maps.Size(0, -25),
                    }}
                  >
                    <div className="font-sans text-sm">
                      {/* CLIENTE */}
                      {selectedMarker.type === 'client' && (
                        <div className="pr-4">
                          <h3 className="text-[15px] font-bold mb-2 flex items-center gap-2 text-black">
                            <FontAwesomeIcon icon={faHouse} /> Cliente
                          </h3>
                          <div className="text-[#059669] mb-2">
                            <p className="font-medium m-0 text-xs">
                              <strong># {selectedMarker.number}</strong>
                            </p>
                            <p className="font-bold m-0 text-xs">
                              {toTitleCase(selectedMarker.name)}
                            </p>
                            {selectedMarker.branchName && (
                              <p className="text-[#2563eb] font-bold text-xs m-0">
                                {selectedMarker.branchName}
                              </p>
                            )}
                          </div>
                          <p className="text-[#374151] font-medium text-xs mt-1">
                            {selectedMarker.lat.toFixed(6)},{' '}
                            {selectedMarker.lng.toFixed(6)}
                          </p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedMarker.lat},${selectedMarker.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1a73e8] font-semibold text-xs hover:underline block mb-2"
                          >
                            View on Google Maps
                          </a>
                          <div className="pt-1 pb-4 border-t border-gray-200 text-xs text-black">
                            <p className="m-0 font-semibold">
                              Vendedor: {selectedMarker.vendor}
                            </p>
                            <p className="m-0 font-semibold">
                              Pedidos: {selectedMarker.totalPedidos}
                            </p>
                            <p className="m-0 font-semibold">
                              MXN:{' '}
                              {selectedMarker.totalMXN.toLocaleString('es-MX', {
                                style: 'currency',
                                currency: 'MXN',
                              })}
                            </p>
                            <p className="m-0 font-semibold">
                              USD:{' '}
                              {selectedMarker.totalUS.toLocaleString('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              })}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* PEDIDO */}
                      {selectedMarker.type === 'pedido' && (
                        <div className="pr-4">
                          <h3 className="text-[15px] font-bold mb-1 flex items-center gap-2 text-black">
                            <FontAwesomeIcon icon={faCartShopping} /> Pedido #
                            {selectedMarker.number}
                          </h3>
                          <div className="mb-2">
                            <strong className="block text-xs font-bold text-black">
                              #{selectedMarker.clienteKey}
                            </strong>
                            <p className="text-[#374151] text-xs font-bold m-0">
                              Cliente: {toTitleCase(selectedMarker.clienteName)}
                            </p>
                            <p className="text-[#374151] text-xs font-medium m-0">
                              Vendedor:{' '}
                              <strong>{selectedMarker.vendedor}</strong>
                            </p>
                          </div>
                          <div className="mb-1">
                            {selectedMarker.isMatch ? (
                              <div className="text-[#059669] font-bold text-xs flex items-center gap-1">
                                <MapPinCheckInside className="w-3 h-3" /> En
                                ubicación
                              </div>
                            ) : (
                              <div className="text-[#FC2121] font-bold text-xs flex items-center gap-1">
                                <MapPinXInside className="w-3 h-3" /> Fuera de
                                ubicación
                              </div>
                            )}
                          </div>
                          <p className="text-[#374151] font-medium text-xs mt-2">
                            {selectedMarker.lat.toFixed(6)},{' '}
                            {selectedMarker.lng.toFixed(6)}
                          </p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedMarker.lat},${selectedMarker.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1a73e8] text-xs font-semibold hover:underline block mb-2"
                          >
                            View on Google Maps
                          </a>
                          <div className="pt-1 pb-4 border-t border-gray-200 text-xs font-semibold text-black">
                            <p className="m-0">
                              MXN:{' '}
                              {selectedMarker.impMXN.toLocaleString('es-MX', {
                                style: 'currency',
                                currency: 'MXN',
                              })}
                            </p>
                            <p className="m-0">
                              USD:{' '}
                              {selectedMarker.impUS.toLocaleString('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              })}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* NO VISITADO */}
                      {selectedMarker.type === 'no-visitado' && (
                        <div className="pr-4">
                          <h3 className="text-[14px] font-bold mb-2 flex items-center gap-2 text-[#212121]">
                            <UserX className="w-4 h-4" /> Cliente No Visitado
                          </h3>
                          <div className="text-[#212121] mb-2">
                            <p className="font-medium m-0 text-xs">
                              <strong># {selectedMarker.number}</strong>
                            </p>
                            <p className="font-bold m-0 text-xs">
                              {toTitleCase(selectedMarker.name)}
                            </p>
                            {selectedMarker.branchName && (
                              <p className="text-[#2563eb] font-semibold text-xs m-0">
                                {selectedMarker.branchName}
                              </p>
                            )}
                          </div>
                          <p className="text-[#374151] font-medium text-xs mt-2">
                            {selectedMarker.lat.toFixed(6)},{' '}
                            {selectedMarker.lng.toFixed(6)}
                          </p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedMarker.lat},${selectedMarker.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1a73e8] text-xs font-semibold hover:underline block mb-2"
                          >
                            View on Google Maps
                          </a>
                          <div className="pt-1 pb-4 border-t border-gray-200 text-xs font-semibold text-black">
                            <p className="m-0">
                              Vendedor: {selectedMarker.vendor}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Cargando mapa...
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {selectedVendor && !isLoading
                    ? 'No se encontraron datos'
                    : 'Selecciona filtros'}
                </p>
                {selectedVendor && !isLoading && (
                  <p className="text-gray-400 text-sm mt-2">
                    No hay pedidos para esta selección en esta fecha.
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
              <div className="bg-blue-50 text-center rounded-lg p-4 border border-blue-200 text-blue-800">
                <div className="justify-center flex items-center gap-2 mb-2">
                  <Package className="w-5 h-5 text-blue-600 animate-pulse" />
                  <h4 className="text-sm font-semibold">Total Pedidos</h4>
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  {processedMapData.stats.totalPedidos}
                </p>
              </div>

              <div className="grid grid-cols-2">
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

              {selectedVendor != '__ALL__' && (
                <div className="grid grid-cols-2">
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

            <div className="mt-8 flex flex-wrap lg:flex-nowrap justify-center gap-8">
              <div className="bg-white p-4 rounded-lg border border-gray-300 w-full max-w-md">
                <Doughnut options={doughnutOptions} data={doughnutData} />
              </div>
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

      {error && (
        <div
          className={`fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md z-50 transition-all duration-500 ease-in-out ${
            isToastVisible
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-10'
          }`}
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
