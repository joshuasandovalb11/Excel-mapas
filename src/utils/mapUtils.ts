// src/utils/mapUtils.ts
import type { VehicleInfo, Client } from './tripUtils';
import type { ProcessedTripV1, RouteSummaryStats } from '../types/route.types';
import { formatDuration, formatName } from './tripUtils';

const formatDateString = (dateStr: string | undefined): string => {
  if (!dateStr) return 'Sin Fecha';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

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
  const month = months[monthNum] || monthStr;

  return `${day}/${month}/${year}`;
};

const getVendorPrefix = (vendorId: string | undefined | null): string => {
  if (!vendorId) return 'VEND';

  if (/^\d+$/.test(vendorId)) {
    return vendorId;
  }

  if (vendorId.length <= 4) return vendorId.toUpperCase();

  return vendorId
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 3)
    .toUpperCase();
};

// FUNCIÓN PARA GENERAR EL HTML DEL MAPA ESTÁTICO
export const generateMapHTML = (
  tripData: ProcessedTripV1 | null,
  vehicleInfo: VehicleInfo | null,
  clientData: Client[] | null,
  _matchedStopsCount: number,
  _selection: string | null,
  minStopDuration: number,
  googleMapsApiKey: string,
  summaryStats: RouteSummaryStats
): string => {
  if (!tripData) return '';

  const filteredFlags = tripData.flags.filter(
    (flag) =>
      flag.type !== 'stop' ||
      (flag.durationMin && flag.durationMin >= minStopDuration)
  );

  const routePath = tripData.path || [];
  const processingMethod = tripData.summary.processingMethod || 'unknown';
  const mapCenter =
    filteredFlags.length > 0
      ? { lat: filteredFlags[0].lat, lng: filteredFlags[0].lng }
      : { lat: 25.0, lng: -100.0 };

  // --- GENERACIÓN DEL TÍTULO DINÁMICO ---
  const vendorPrefix = tripData.vendedor
    ? `[${getVendorPrefix(tripData.vendedor)}]`
    : `[${tripData.idRuta || 'RUTA'}]`;
  const vendorName = tripData.nombreVendedor
    ? formatName(tripData.nombreVendedor)
    : vehicleInfo?.descripcion || 'Vendedor';
  const formattedDate = formatDateString(vehicleInfo?.fecha);
  const documentTitle = `${vendorPrefix} ${vendorName} — ${formattedDate}`;

  // 1. DATOS INYECTADOS
  const injectedData = /*javascript*/ `
    const tripData = ${JSON.stringify(tripData)};
    const vehicleInfo = ${JSON.stringify(vehicleInfo)};
    const clientData = ${JSON.stringify(clientData || [])};
    const minStopDuration = ${minStopDuration};
    const summaryStats = ${JSON.stringify(summaryStats)};
    const routePath = ${JSON.stringify(routePath)};
    const allFlags = ${JSON.stringify(filteredFlags)};
    const processingMethod = '${processingMethod}';
    const mapCenter = ${JSON.stringify(mapCenter)};
  `;

  // 2. ESTILOS
  const styles = /*css*/ `
    *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e5e7eb; }
    html, body { height: 100%; margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background-color: #f9fafb; overflow: hidden; }
    #map { height: 100%; width: 100%; }
    p, h3, h4 { margin: 0; }
    button { cursor: pointer; background: transparent; padding: 0; line-height: inherit; color: inherit; outline: none; border: none; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    #info-container { 
      position: absolute; top: 10px; right: 10px; z-index: 10;
      display: flex; flex-direction: column; gap: 6px;
    }

    .info-card {
      background-color: rgba(255, 255, 255, 0.95);
      border-radius: 0.375rem;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      width: 230px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    }
    
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; }
    .card-title { font-size: 13px; font-weight: 700; color: #00004F; }
    .card-content { padding: 0 0.5rem 0.375rem 0.5rem; transition: all 0.3s; }
    
    .info-grid { display: grid; grid-template-columns: 1.5fr 1.4fr; gap: 0.125rem; font-size: 11px; color: #00004F; }
    .summary-grid { display: grid; grid-template-columns: 1.5fr 0.9fr 0.2fr; gap: 0.125rem; font-size: 11px; color: #00004F; }
    
    .section-label {
      grid-column: span 3; font-size: 12px; font-weight: 700;
      color: #1d4ed8; background-color: #eff6ff;
      padding: 0.125rem 0.25rem; border-radius: 0.25rem; margin: 0.25rem 0;
    }

    @media (min-width: 1536px) {
      .info-card { width: 260px; }
      .card-header { padding: 0.75rem; }
      .card-title { font-size: 14px; }
      .card-content { padding: 0 0.75rem 0.5rem 0.75rem; }
      .info-grid, .summary-grid { gap: 0.25rem; font-size: 12px; }
      .section-label { font-size: 13px; }
    }

    .toggle-btn { color: #00004F; transition: color 0.2s; padding: 2px; }
    .toggle-btn:hover { color: #2563eb; }
    .toggle-btn i { transition: transform 0.3s ease; }
    .toggle-btn.collapsed i { transform: rotate(180deg); }
    .card-content.collapsed { max-height: 0 !important; opacity: 0; padding-top: 0 !important; padding-bottom: 0 !important; }

    .text-left { text-align: left; }
    .col-span-2 { grid-column: span 2; }
    .col-span-3 { grid-column: span 3; }
    .pl-2 { padding-left: 0.5rem; }
    .text-red-600 { color: #dc2626; }

    .controls-container {
      position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
      z-index: 10; background-color: rgba(255, 255, 255, 0.95);
      border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      padding: 0.5rem; display: flex; gap: 0.625rem;
    }
    .control-btn {
      padding: 0.5rem 1rem; background-color: #f3f4f6; border-radius: 0.25rem;
      font-size: 0.75rem; font-weight: 500; color: #374151; transition: background-color 0.2s;
      display: flex; align-items: center; gap: 0.5rem;
    }
    .control-btn:hover:not(:disabled) { background-color: #e5e7eb; color: #111827; }

    .gm-style-iw-d { overflow: hidden !important; }
    .gm-style-iw-c { padding: 10px 5px 10px 10px !important; border-radius: 8px !important; }
    .iw-title { font-size: 15px; font-weight: 500; margin: 0 0 8px 0; display: flex; align-items: center; }
    .iw-title span { margin-right: 8px; font-size: 15px; }
    .iw-text { font-size: 12px; margin-bottom: 4px; }
    
    .coords-hover { margin: 4px 0; font-size: 12px; font-weight: 400; color: #374151; cursor: pointer; transition: color 0.2s; }
    .coords-hover:hover { color: #000000; }
    .gm-link { color: #1a73e8; font-size: 12px; font-weight: 400; text-decoration: none; }
    .gm-link:hover { text-decoration: underline; }
  `;

  // 3. LAYOUT HTML
  const layout = /*html*/ `
    <div id="map"></div>

    <div id="info-container">
      <div id="vehicle-card" class="info-card" style="display: none;">
        <div class="card-header">
          <h4 class="card-title">Información del Vehículo</h4>
          <button class="toggle-btn" onclick="toggleCard('vehicle-content', this)">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        <div id="vehicle-content" class="card-content" style="max-height: 1000px;">
          <div class="info-grid" id="vehicle-grid-data"></div>
        </div>
      </div>

      <div class="info-card">
        <div class="card-header">
          <h4 class="card-title">Resumen del día</h4>
          <button class="toggle-btn" onclick="toggleCard('summary-content', this)">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        <div id="summary-content" class="card-content" style="max-height: 1000px;">
          <div class="summary-grid" id="summary-grid-data"></div>
        </div>
      </div>
    </div>

    <div class="controls-container">
      <button class="control-btn" id="reset-btn" onclick="handleReset()">
        <span>Reiniciar</span>
      </button>
      <button class="control-btn" id="prev-btn" onclick="handlePrevStop()" disabled>
        <span>Anterior Parada</span>
      </button>
      <button class="control-btn" id="next-btn" onclick="handleNextStop()">
        <span>Siguiente Parada</span>
      </button>
    </div>
  `;

  // 4. LÓGICA DE NEGOCIO Y MAPA
  const logic = /*javascript*/ `
    let map, polyline, path, animatedPolyline;
    let markers = [], clientMarkersArr = [], infoWindows = [], openInfoWindows = new Set();
    let currentStopIndex = 0, currentPathIndex = 0, cumulativeDistance = 0;
    let isAnimating = false, animationFrameId;
    let stopInfo = [], segmentDistances = [];
    let visitedClients = new Set();
    const specialNonClientKeys = ['3689', '6395'];

    const formatDuration = ${formatDuration.toString()};
    const formatName = ${formatName.toString()};
    
    function isWorkingHours(time, tripDate) {
      if (!time || !tripDate) return true;
      const dateObj = new Date(tripDate + 'T12:00:00');
      const day = dateObj.getDay();
      if (day === 0 || day === 6) return false;
      const parts = time.split(':');
      const totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      return totalMinutes >= 510 && totalMinutes < 1140; // 8:30 a 19:00
    }

    function copyCoords(element, text) {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(() => {
        const originalHtml = element.innerHTML;
        element.innerHTML = '<span style="font-weight: bold; color: #059669;">¡Copiadas! ✅</span>';
        setTimeout(() => element.innerHTML = originalHtml, 2000);
      });
    }

    function toggleCard(contentId, btn) {
      const content = document.getElementById(contentId);
      content.classList.toggle('collapsed');
      btn.classList.toggle('collapsed');
    }

    function formatDistance(meters) {
      return (meters / 1000).toFixed(2) + ' km';
    }

    function renderUI() {
      if (vehicleInfo) {
        document.getElementById('vehicle-card').style.display = 'block';
        document.getElementById('vehicle-grid-data').innerHTML = \`
          <p><strong>Descripción:</strong></p><p class="text-left">\${vehicleInfo.descripcion}</p>
          <p><strong>Vehículo:</strong></p><p class="text-left">\${vehicleInfo.vehiculo}</p>
          <p><strong>Placa:</strong></p><p class="text-left">\${vehicleInfo.placa}</p>
          <p><strong>Fecha:</strong></p><p class="text-left">\${vehicleInfo.fecha}</p>
          <p><strong>Distancia total:</strong></p><p class="text-left"><strong id="total-dist">\${((summaryStats.distanceWithinHours + summaryStats.distanceAfterHours) / 1000).toFixed(2)} km</strong></p>
        \`;
      }

      document.getElementById('summary-grid-data').innerHTML = \`
        <p class="section-label">Dentro de horario (8:30 - 19:00)</p>
        <p><strong>Inicio de labores:</strong></p><p class="text-left col-span-2"><strong>\${tripData.summary.workStartTime || 'N/A'}</strong></p>
        <p><strong>Clientes Visitados:</strong></p><p class="text-left col-span-2"><span id="visited-count">0</span> / \${summaryStats.uniqueClientsVisited}</p>
        
        <p class="col-span-3"><strong>Tiempo con:</strong></p>
        <p class="pl-2">• Clientes:</p><p class="text-left">\${formatDuration(summaryStats.timeWithClients)}</p><p class="text-left"><strong>\${summaryStats.percentageClients.toFixed(1)}%</strong></p>
        <p class="pl-2 text-red-600">• No Clientes:</p><p class="text-left text-red-600">\${formatDuration(summaryStats.timeWithNonClients)}</p><p class="text-left text-red-600"><strong>\${summaryStats.percentageNonClients.toFixed(1)}%</strong></p>
        <p class="pl-2 text-red-600">• En su casa:</p><p class="text-left text-red-600">\${formatDuration(summaryStats.timeAtHome)}</p><p class="text-left text-red-600"><strong>\${summaryStats.percentageAtHome.toFixed(1)}%</strong></p>
        <p class="pl-2 text-red-600">• Tools de Mexico:</p><p class="text-left text-red-600">\${formatDuration(summaryStats.timeAtTools)}</p><p class="text-left text-red-600"><strong>\${summaryStats.percentageAtTools.toFixed(1)}%</strong></p>
        <p class="pl-2">• En Traslados:</p><p class="text-left">\${formatDuration(summaryStats.travelTime)}</p><p class="text-left"><strong>\${summaryStats.percentageTravel.toFixed(1)}%</strong></p>
        
        <p><strong>Distancia recorrida:</strong></p><p class="text-left col-span-2"><strong id="segment-dist">\${(summaryStats.distanceWithinHours / 1000).toFixed(2)} km</strong></p>
        <p><strong>Fin de labores:</strong></p><p class="text-left col-span-2"><strong>\${tripData.summary.workEndTime || 'N/A'}</strong></p>
        
        <p class="section-label" style="margin-top: 4px;">Fuera de horario</p>
        <p class="col-span-3"><strong>Tiempo con:</strong></p>
        <p class="pl-2">• Clientes:</p><p class="text-left col-span-2">\${formatDuration(summaryStats.timeWithClientsAfterHours)}</p>
        <p class="pl-2 text-red-600">• No Clientes:</p><p class="text-left text-red-600 col-span-2">\${formatDuration(summaryStats.totalTimeWithNonClientsAfterHours)}</p>
        <p class="pl-2">• En Traslados:</p><p class="text-left col-span-2">\${formatDuration(summaryStats.travelTimeAfterHours)}</p>
        <p><strong>Distancia recorrida:</strong></p><p class="text-left col-span-2"><strong>\${(summaryStats.distanceAfterHours / 1000).toFixed(2)} km</strong></p>
      \`;
    }

    function initMap() {
      renderUI();

      map = new google.maps.Map(document.getElementById('map'), {
        center: mapCenter, zoom: 12,
        mapTypeControl: false, streetViewControl: true, gestureHandling: 'greedy'
      });

      const bounds = new google.maps.LatLngBounds();

      polyline = new google.maps.Polyline({
        path: routePath, strokeColor: '#e5e7eb', strokeOpacity: 0.8, strokeWeight: 5, map: map
      });

      animatedPolyline = new google.maps.Polyline({
        path: [], strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 5, map: map
      });
      path = animatedPolyline.getPath();

      let lastPathIndex = 0;
      allFlags.forEach((flag, index) => {
        let closestIndex = lastPathIndex;
        if (flag.type === 'trip_start') closestIndex = 0;
        else if (flag.type === 'trip_end') closestIndex = Math.max(0, routePath.length - 1);
        else {
          let minDistance = Infinity;
          for (let i = lastPathIndex; i < routePath.length; i++) {
            const dist = google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(flag.lat, flag.lng),
              new google.maps.LatLng(routePath[i].lat, routePath[i].lng)
            );
            if (dist < minDistance) { minDistance = dist; closestIndex = i; }
          }
        }
        lastPathIndex = closestIndex;
        stopInfo.push({ markerIndex: index, pathIndex: closestIndex, type: flag.type });
      });

      for (let i = 1; i < stopInfo.length; i++) {
        const seg = routePath.slice(stopInfo[i-1].pathIndex, stopInfo[i].pathIndex + 1)
          .map(p => new google.maps.LatLng(p.lat, p.lng));
        segmentDistances.push(google.maps.geometry.spherical.computeLength(seg));
      }

      allFlags.forEach((flag, i) => createFlagMarker(flag, i, bounds));
      clientData.forEach((client) => createClientMarker(client, bounds));

      if (allFlags.length > 0 || clientData.length > 0) {
        map.fitBounds(bounds);
      }

      // --- MOSTRAR EL PRIMER INFOWINDOW AL INICIAR ---
      if (markers.length > 0) {
        const firstMarker = markers[0];
        firstMarker.iw.open(map, firstMarker.marker);
        openInfoWindows.add(firstMarker.iw);
      }
    }

    function createFlagMarker(flag, index, bounds) {
      const inHours = flag.type === 'stop' ? isWorkingHours(flag.time, vehicleInfo?.fecha) : true;
      const mColor = flag.type === 'trip_start' ? '#22c55e' : flag.type === 'trip_end' ? '#ef4444' : '#4F4E4E';
      let zIndex = flag.type === 'trip_start' ? 100 : flag.type === 'trip_end' ? 101 : 10;
      
      const svgPath = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
      let anchorX = flag.type === 'trip_start' ? 22 : flag.type === 'trip_end' ? 14 : 18;

      const marker = new google.maps.Marker({
        position: { lat: flag.lat, lng: flag.lng }, map: map, zIndex,
        icon: { path: svgPath, fillColor: mColor, fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 24) }
      });
      bounds.extend(marker.getPosition());

      const textColor = inHours ? '#000' : '#FF0000';
      const titleColor = inHours ? '#000' : '#C40000';
      const sqColor = inHours ? '#4F4E4E' : '#C40000';
      
      let clientHtml = '';
      if (flag.type === 'stop') {
        if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
          const isTools = specialNonClientKeys.includes(String(flag.clientKey));
          const cColor = flag.isVendorHome ? '#5D00FF' : isTools ? '#005EFF' : inHours ? '#059669' : '#10b981';
          const bColor = inHours ? '#2563eb' : '#60a5fa';
          const bName = formatName(flag.clientBranchName);
          const branchInfo = flag.clientBranchNumber && String(flag.clientBranchNumber) !== '0' ? (bName ? 'Suc. ' + bName : 'Suc. ' + flag.clientBranchNumber) : null;
          clientHtml = \`<div style="color:\${cColor}; font-weight:600; margin-bottom:4px;"><p class="iw-text"><strong>#\${flag.clientKey}</strong></p><p class="iw-text">\${formatName(flag.clientName)}</p>\${branchInfo ? \`<p class="iw-text" style="color:\${bColor}">\${branchInfo}</p>\` : ''}</div>\`;
        } else {
          clientHtml = \`<p class="iw-text" style="color:\${inHours ? '#FC2121' : '#C40000'}; font-weight:500;"><strong>Cliente:</strong> Sin coincidencia</p>\`;
        }
      }

      const coords = flag.lat.toFixed(6) + ', ' + flag.lng.toFixed(6);
      const iconHtml = flag.type === 'trip_start' ? \`<span style="color:#22c55e;"><i class="fa-solid fa-road"></i></span>\` : 
                       flag.type === 'trip_end' ? \`<span style="color:#ef4444;"><i class="fa-solid fa-road"></i></span>\` : 
                       \`<span style="color:\${sqColor};"><i class="fa-solid \${inHours ? 'fa-flag' : 'fa-triangle-exclamation'}"></i></span>\`;
      const titleText = flag.type === 'trip_start' ? 'Inicio de Viaje' : flag.type === 'trip_end' ? 'Fin de Viaje' : 'Parada ' + (flag.stopNumber || index);

      const content = \`
        <div style="color:\${textColor}; min-width: 150px; max-width: 200px;">
          <h3 class="iw-title" style="color:\${titleColor}">\${iconHtml} \${titleText}</h3>
          \${flag.type === 'stop' ? \`<p class="iw-text"><strong>Duración:</strong> \${formatDuration(flag.durationMin || 0)}</p>\` : ''}
          <p class="iw-text"><strong>Hora:</strong> \${flag.time}</p>
          \${clientHtml}
          <div class="coords-hover" onclick="copyCoords(this, '\${coords}')">\${coords}</div>
          <a href="https://maps.google.com/?q=$\${flag.lat},\${flag.lng}" target="_blank" class="gm-link">Ver en Google Maps</a>
        </div>\`;

      const iw = new google.maps.InfoWindow({ content, pixelOffset: new google.maps.Size(0, -40) });
      marker.addListener('click', () => { closeAllInfoWindows(); iw.open(map, marker); openInfoWindows.add(iw); });
      markers.push({ marker, iw });
    }

    function createClientMarker(client, bounds) {
      const isSpecial = specialNonClientKeys.includes(String(client.key));
      const color = client.isVendorHome ? '#5D00FF' : isSpecial ? '#005EFF' : '#A12323'; 
      const activeColor = client.isVendorHome ? '#5D00FF' : isSpecial ? '#005EFF' : '#059669';

      const marker = new google.maps.Marker({
        position: { lat: client.lat, lng: client.lng }, map: map, zIndex: 50,
        icon: { path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', fillColor: color, fillOpacity: 1, strokeWeight: 0, scale: 1.3, anchor: new google.maps.Point(12, 24) }
      });
      bounds.extend(marker.getPosition());

      const coords = client.lat.toFixed(6) + ', ' + client.lng.toFixed(6);
      const bName = formatName(client.branchName);
      const branchInfo = client.branchNumber && String(client.branchNumber) !== '0' ? (bName ? 'Suc. ' + bName : 'Suc. ' + client.branchNumber) : null;
      
      const content = \`
        <div style="color:\${activeColor}; min-width: 150px; max-width: 200px;">
          <h3 class="iw-title"><span style="color:\${activeColor}"><i class="fa-solid \${client.isVendorHome ? 'fa-user-tie' : 'fa-house'}"></i></span> \${client.isVendorHome ? 'Casa Vendedor' : isSpecial ? 'Tools de Mexico' : 'Cliente'}</h3>
          <p class="iw-text" style="font-weight:600;"><strong>#\${client.key}</strong></p>
          <p class="iw-text" style="font-weight:600;">\${formatName(client.name)}</p>
          \${branchInfo ? \`<p class="iw-text" style="color:#2563eb; font-weight:600;">\${branchInfo}</p>\` : ''}
          <div class="coords-hover" style="color:#374151" onclick="copyCoords(this, '\${coords}')">\${coords}</div>
          <a href="https://maps.google.com/?q=$\${client.lat},\${client.lng}" target="_blank" class="gm-link">Ver en Google Maps</a>
        </div>\`;

      const iw = new google.maps.InfoWindow({ content, pixelOffset: new google.maps.Size(0, -40) });
      marker.addListener('click', () => { closeAllInfoWindows(); iw.open(map, marker); openInfoWindows.add(iw); });
      clientMarkersArr.push({ marker, iw });
    }

    function closeAllInfoWindows() {
      openInfoWindows.forEach(iw => iw.close());
      openInfoWindows.clear();
    }

    // --- ANIMACIONES ---
    function handleReset() {
      if (isAnimating) return;
      closeAllInfoWindows();
      path.clear();
      currentStopIndex = 0; currentPathIndex = 0; cumulativeDistance = 0;
      visitedClients.clear();
      document.getElementById('visited-count').innerText = '0';
      document.getElementById('segment-dist').innerText = '0.00 km';
      document.getElementById('prev-btn').disabled = true;
      document.getElementById('next-btn').disabled = false;
      map.panTo(mapCenter);

      // --- MOSTRAR EL PRIMER INFOWINDOW AL REINICIAR ---
      if (markers.length > 0) {
        const firstMarker = markers[0];
        firstMarker.marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => firstMarker.marker.setAnimation(null), 1400);
        firstMarker.iw.open(map, firstMarker.marker);
        openInfoWindows.add(firstMarker.iw);
      }
    }

    function handleNextStop() {
      if (isAnimating || currentStopIndex >= stopInfo.length - 1) return;
      isAnimating = true;
      document.getElementById('prev-btn').disabled = true; document.getElementById('next-btn').disabled = true;
      
      const targetStop = stopInfo[currentStopIndex + 1];
      const step = processingMethod === 'speed-based' ? 35 : 1;

      function stepAnim() {
        const nextIdx = Math.min(currentPathIndex + step, targetStop.pathIndex);
        for (let i = currentPathIndex + 1; i <= nextIdx; i++) {
          if(routePath[i]) path.push(new google.maps.LatLng(routePath[i].lat, routePath[i].lng));
        }
        currentPathIndex = nextIdx;

        if (currentPathIndex >= targetStop.pathIndex) {
          isAnimating = false;
          currentStopIndex++;
          
          cumulativeDistance += (segmentDistances[currentStopIndex - 1] || 0);
          document.getElementById('segment-dist').innerText = formatDistance(cumulativeDistance);

          const flag = allFlags[targetStop.markerIndex];
          if (flag.type === 'stop' && flag.clientKey && !flag.isVendorHome && !specialNonClientKeys.includes(String(flag.clientKey))) {
            visitedClients.add(flag.clientKey);
            document.getElementById('visited-count').innerText = visitedClients.size;
          }

          closeAllInfoWindows();
          const markerObj = markers[targetStop.markerIndex];
          markerObj.marker.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(() => markerObj.marker.setAnimation(null), 1400);
          markerObj.iw.open(map, markerObj.marker);
          openInfoWindows.add(markerObj.iw);
          map.panTo({ lat: flag.lat, lng: flag.lng });

          document.getElementById('prev-btn').disabled = false;
          document.getElementById('next-btn').disabled = currentStopIndex >= stopInfo.length - 1;
          return;
        }
        requestAnimationFrame(stepAnim);
      }
      requestAnimationFrame(stepAnim);
    }

    function handlePrevStop() {
      if (isAnimating || currentStopIndex <= 0) return;
      
      const prevStop = stopInfo[currentStopIndex - 1];
      path.clear();
      for (let i = 0; i <= prevStop.pathIndex; i++) {
        if(routePath[i]) path.push(new google.maps.LatLng(routePath[i].lat, routePath[i].lng));
      }
      
      cumulativeDistance -= (segmentDistances[currentStopIndex - 1] || 0);
      document.getElementById('segment-dist').innerText = formatDistance(cumulativeDistance);

      currentStopIndex--;
      currentPathIndex = prevStop.pathIndex;

      visitedClients.clear();
      for (let i = 0; i <= currentStopIndex; i++) {
        const f = allFlags[stopInfo[i].markerIndex];
        if (f.type === 'stop' && f.clientKey && !f.isVendorHome && !specialNonClientKeys.includes(String(f.clientKey))) {
          visitedClients.add(f.clientKey);
        }
      }
      document.getElementById('visited-count').innerText = visitedClients.size;

      closeAllInfoWindows();
      const markerObj = markers[prevStop.markerIndex];
      markerObj.marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => markerObj.marker.setAnimation(null), 1400);
      markerObj.iw.open(map, markerObj.marker);
      openInfoWindows.add(markerObj.iw);
      map.panTo({ lat: allFlags[prevStop.markerIndex].lat, lng: allFlags[prevStop.markerIndex].lng });

      document.getElementById('prev-btn').disabled = currentStopIndex <= 0;
      document.getElementById('next-btn').disabled = false;
    }
  `;

  // 5. ENSAMBLAJE FINAL
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${documentTitle}</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      <style>${styles}</style>
    </head>
    <body>
      ${layout}
      <script>
        ${injectedData}
        ${logic}
      </script>
      <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap&libraries=geometry"></script>
    </body>
    </html>
  `.trim();
};
