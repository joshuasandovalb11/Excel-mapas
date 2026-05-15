import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../../hooks/usePersistentState';
import {
  type Client,
  calculateDistance,
  formatName,
} from '../../../utils/tripUtils';
import type { ProcessedTripV1 } from '../../../types/route.types';

type Selection = { mode: 'vendor' | 'driver'; value: string | null };

type UseVehicleClientsParams = {
  mode: 'database' | 'excel';
  tripData: ProcessedTripV1 | null;
  masterClients: Client[] | null;
  clientRadius: number;
  minStopDuration: number;
};

type UseVehicleClientsResult = {
  availableVendors: string[];
  selection: Selection;
  handleSelection: (selected: string) => void;
  clientData: Client[] | null;
  databaseClientsAsClients: Client[];
  mapClients: Client[];
  enrichedTripData: ProcessedTripV1 | null;
  matchedStopsCount: number;
};

export function useVehicleClients({
  mode,
  tripData,
  masterClients,
  clientRadius,
  minStopDuration,
}: UseVehicleClientsParams): UseVehicleClientsResult {
  const [clientData, setClientData] = useState<Client[] | null>(null);
  const [selection, setSelection] = usePersistentState<Selection>(
    'vt_selection',
    { mode: 'vendor', value: null }
  );

  const availableVendors = useMemo(() => {
    if (!masterClients || masterClients.length === 0) return [];
    return Array.from(new Set(masterClients.map((c) => c.vendor))).sort();
  }, [masterClients]);

  useEffect(() => {
    if (!selection.value || selection.mode !== 'vendor') return;
    if (!availableVendors.includes(selection.value)) {
      setSelection({ mode: 'vendor', value: null });
    }
  }, [availableVendors, selection.mode, selection.value, setSelection]);

  useEffect(() => {
    if (masterClients && masterClients.length > 0 && selection.value) {
      if (selection.mode === 'driver') {
        setClientData(masterClients);
      } else {
        const specialClientKeys = ['3689', '6395'];

        const visitedToolsKeys = new Set(
          (tripData?.clients || [])
            .filter((c) =>
              specialClientKeys.includes(String(c.key || c.clientKey))
            )
            .map(
              (c) =>
                `${c.key || c.clientKey}-${c.branchNumber || c.clientBranchNumber || '0'}`
            )
        );

        const filteredClients = masterClients
          .filter((client) => {
            if (client.vendor === selection.value && !client.isVendorHome)
              return true;
            if (specialClientKeys.includes(String(client.key))) {
              const branchStr = `${client.key}-${client.branchNumber || '0'}`;
              return visitedToolsKeys.has(branchStr);
            }
            return false;
          })
          .map((client) => {
            if (specialClientKeys.includes(String(client.key))) {
              return { ...client, isVendorHome: false };
            }
            return client;
          });

        const homeClientKeys = new Set(
          (tripData?.clients || [])
            .filter((c) => c.isVendorHome)
            .map((c) => String(c.key || c.clientKey))
        );

        const vendorHome = masterClients.find((client) => {
          const isEmpleado =
            client.isVendorHome === true ||
            client.isEmpleadoTME === true ||
            String(client.commercialName || '')
              .toUpperCase()
              .includes('EMPLEADO TME');

          return (
            homeClientKeys.has(String(client.key)) ||
            (isEmpleado &&
              client.name.toLowerCase().trim() ===
                selection.value?.toLowerCase().trim())
          );
        });

        const finalClientList = [...filteredClients];
        if (vendorHome) {
          finalClientList.push({ ...vendorHome, isVendorHome: true });
        }
        setClientData(finalClientList);
      }
    }
  }, [masterClients, selection.value, selection.mode, tripData, setClientData]);

  const handleSelection = (selected: string) => {
    const newMode = availableVendors.includes(selected) ? 'vendor' : 'driver';
    setSelection({ mode: newMode, value: selected });
  };

  const databaseClientsAsClients: Client[] = useMemo(() => {
    if (mode !== 'database' || !tripData || !tripData.clients) return [];

    const homeClientKeys = new Set(
      (tripData.clients || [])
        .filter((c) => c.isVendorHome)
        .map((c) => String(c.key || c.clientKey))
    );

    return tripData.clients
      .map((rc) => {
        const rawName = rc.clientName ?? rc.name ?? '';
        const rawBranchName = rc.clientBranchName ?? rc.branchName ?? '';
        const keyStr = String(rc.clientKey ?? rc.key ?? '');

        const isToolsDeMexico = ['3689', '6395'].includes(keyStr);
        const isHome =
          !isToolsDeMexico &&
          (homeClientKeys.has(keyStr) || rc.isVendorHome === true);

        return {
          key: keyStr,
          name: formatName(rawName),
          lat: Number(rc.latitude ?? rc.lat),
          lng: Number(rc.longitude ?? rc.lng),
          vendor: formatName(
            tripData.nombreVendedor || tripData.vendedor || ''
          ),
          branchNumber: rc.clientBranchNumber ?? rc.branchNumber ?? '',
          branchName: formatName(rawBranchName),
          displayName: rawBranchName
            ? `${formatName(rawName)} (${formatName(rawBranchName)})`
            : formatName(rawName),
          isVendorHome: isHome,
        };
      })
      .filter(
        (c) => !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0
      );
  }, [mode, tripData]);

  const mapClients = useMemo(() => {
    const baseClients =
      mode === 'database'
        ? databaseClientsAsClients
        : selection.mode === 'driver'
          ? []
          : clientData || [];

    return mode === 'database'
      ? baseClients
      : baseClients.map((c) => ({
          ...c,
          name: formatName(c.name),
          vendor: formatName(c.vendor),
          displayName: formatName(c.displayName || c.name),
          branchName: formatName(c.branchName),
        }));
  }, [mode, databaseClientsAsClients, selection.mode, clientData]);

  const enrichedTripData = useMemo(() => {
    if (!tripData) return null;

    const enrichedFlags = (tripData.flags || []).map((flag) => {
      if (flag.type === 'stop') {
        let matchedClient: Client | null = null;
        let minDistance = Infinity;

        if (mapClients.length > 0) {
          for (const client of mapClients) {
            const distance = calculateDistance(
              flag.lat,
              flag.lng,
              client.lat,
              client.lng
            );
            if (distance <= clientRadius && distance < minDistance) {
              minDistance = distance;
              matchedClient = client;
            }
          }
        }

        const isToolsFlag = ['3689', '6395'].includes(
          String(matchedClient?.key ?? flag.clientKey)
        );

        return {
          ...flag,
          clientName: matchedClient
            ? formatName(matchedClient.name)
            : flag.clientName && flag.clientName !== 'Sin coincidencia'
              ? formatName(flag.clientName)
              : 'Sin coincidencia',
          clientKey: matchedClient?.key ?? flag.clientKey ?? null,
          clientBranchNumber:
            matchedClient?.branchNumber ?? flag.clientBranchNumber ?? null,
          clientBranchName: matchedClient?.branchName
            ? formatName(matchedClient.branchName)
            : flag.clientBranchName
              ? formatName(flag.clientBranchName)
              : null,
          isVendorHome:
            !isToolsFlag &&
            (flag.isVendorHome || matchedClient?.isVendorHome || false),
        };
      }
      return flag;
    });

    return {
      ...tripData,
      nombreVendedor: formatName(tripData.nombreVendedor),
      flags: enrichedFlags,
    };
  }, [tripData, mapClients, clientRadius]);

  const matchedStopsCount = useMemo(() => {
    if (!enrichedTripData?.flags) return 0;
    const specialNonClientKeys = ['3689', '6395'];

    const matchedStops = enrichedTripData.flags.filter(
      (flag) =>
        flag.type === 'stop' &&
        (flag.durationMin || 0) >= minStopDuration &&
        flag.clientName &&
        flag.clientName !== 'Sin coincidencia' &&
        !flag.isVendorHome &&
        !specialNonClientKeys.includes(flag.clientKey || '')
    );

    const uniqueClientKeys = new Set(
      matchedStops.map((stop) => stop.clientKey)
    );
    return uniqueClientKeys.size;
  }, [enrichedTripData, minStopDuration]);

  return {
    availableVendors,
    selection,
    handleSelection,
    clientData,
    databaseClientsAsClients,
    mapClients,
    enrichedTripData,
    matchedStopsCount,
  };
}
