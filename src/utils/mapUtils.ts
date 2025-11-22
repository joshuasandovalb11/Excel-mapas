import type { VehicleInfo, Client, ProcessedTrip } from './tripUtils';
import { formatDuration, calculateDistance, isWorkingHours } from './tripUtils';

// FUNCIÓN PARA GENERAR EL HTML DEL MAPA
export const generateMapHTML = (
  tripData: ProcessedTrip | null,
  vehicleInfo: VehicleInfo | null,
  clientData: Client[] | null,
  _matchedStopsCount: number,
  selection: string | null,
  minStopDuration: number,
  viewMode: 'current' | 'new',
  googleMapsApiKey: string,
  summaryStats: {
    timeWithClients: number;
    timeWithNonClients: number;
    travelTime: number;
    percentageClients: number;
    percentageNonClients: number;
    percentageTravel: number;
    timeWithClientsAfterHours: number;
    timeWithNonClientsAfterHours: number;
    travelTimeAfterHours: number;
    totalAfterHoursTime: number;
    totalTimeWithNonClientsAfterHours: number;
    distanceWithinHours: number;
    distanceAfterHours: number;
    timeAtHome: number;
    percentageAtHome: number;
    timeAtTools: number;
    percentageAtTools: number;
    uniqueClientsVisited: number;
  }
): string => {
  if (!tripData) return '';
  const filteredFlags = tripData.flags.filter(
    (flag) =>
      flag.type !== 'stop' ||
      (flag.duration && flag.duration >= minStopDuration)
  );
  const { routes, processingMethod } = tripData;
  const mapCenter =
    filteredFlags.length > 0
      ? `{lat: ${filteredFlags[0].lat}, lng: ${filteredFlags[0].lng}}`
      : '{lat: 25.0, lng: -100.0}';

  const isWorkingHoursFunctionString = `
    function(time, tripDate) {
      if (!time || !tripDate) return true;
      
      // Lógica para detectar fin de semana (Sábado o Domingo)
      var dateObj = new Date(tripDate + 'T12:00:00');
      var day = dateObj.getDay();
      
      if (day === 0 || day === 6) {
          return false; // Es fin de semana, por lo tanto, fuera de horario
      }

      var parts = time.split(':');
      var hours = parseInt(parts[0], 10);
      var minutes = parseInt(parts[1], 10);
      var totalMinutes = hours * 60 + minutes;
      
      // 8:30 AM = 510 minutos, 19:00 PM = 1140 minutos
      return totalMinutes >= 510 && totalMinutes < 1140;
    }
  `;

  const infoBoxHTML = vehicleInfo
    ? `
        <div id="info-box" class="info-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1px;">
            <h4 style="margin: 0;">Información del Vehiculo</h4>
            <button class="toggle-btn toggle-info-btn" aria-label="Minimizar/Maximizar">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
          </div>
          <div class="info-content info-grid" style="display: grid; grid-template-columns: 1.5fr 1.6fr; gap: 1px;">
              <p><strong>Descripción:</strong></p>
              <p style="text-align: left;">${vehicleInfo.descripcion}</p>

              <p><strong>Vehículo:</strong></p>
              <p style="text-align: left;">${vehicleInfo.vehiculo}</p>

              <p><strong>Placa:</strong></p>
              <p style="text-align: left;">${vehicleInfo.placa}</p>

              <p><strong>Fecha:</strong></p>
              <p style="text-align: left;">${vehicleInfo.fecha}</p>
          </div>
        </div>
    `
    : '';

  // Filtrar clientes para mostrar solo la sede más cercana de Tools de Mexico
  let clientsToRender: Client[] = [];
  if (selection !== 'chofer' && clientData) {
    const specialClientKeys = ['3689', '6395'];

    const regularClients = clientData.filter(
      (c) => !specialClientKeys.includes(c.key) && !c.isVendorHome
    );
    const specialClients = clientData.filter((c) =>
      specialClientKeys.includes(c.key)
    );
    const vendorHome = clientData.find((c) => c.isVendorHome);

    let closestSpecialClient: Client | null = null;

    if (specialClients.length > 0) {
      if (regularClients.length > 0) {
        const avgLat =
          regularClients.reduce((sum, c) => sum + c.lat, 0) /
          regularClients.length;
        const avgLng =
          regularClients.reduce((sum, c) => sum + c.lng, 0) /
          regularClients.length;
        const centroid = { lat: avgLat, lng: avgLng };

        let closestDist = Infinity;

        specialClients.forEach((client) => {
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
        closestSpecialClient = specialClients[0];
      }
    }

    clientsToRender = [...regularClients];
    if (closestSpecialClient) {
      clientsToRender.push(closestSpecialClient);
    }
    if (vendorHome) {
      clientsToRender.push(vendorHome);
    }
  }

  const summaryCardHTML = `
      <div id="summary-box" class="info-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1px;">
          <h4 style="margin: 0;">Resumen del dia</h4>
          <button class="toggle-btn toggle-summary-btn" aria-label="Minimizar/Maximizar">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        <div class="summary-content summary-grid" style="display: grid; grid-template-columns: 1.5fr 1.2fr 0.2fr; gap: 1px;">
          
          <p style="grid-column: span 3; font-size: 13px; font-weight: bold; color: #002FFF; background-color: #EDF0FF;">
            Dentro de horario (8:30 - 19:00)
          </p>

          <p><strong>Inicio de labores:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><strong>${tripData.workStartTime || 'N/A'}</strong></p>
          
          <p><strong>Clientes Visitados:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><span class="visited-clients-count">0</span> / ${summaryStats.uniqueClientsVisited}</p>
          
          <p style="grid-column: span 3;"><strong>Tiempo con:</strong></p>
          
          <p style="padding-left: 15px;">• Clientes:</p>
          <p style="text-align: left;">${formatDuration(summaryStats.timeWithClients)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageClients.toFixed(1)}%</strong></p>
          
          <p style="padding-left: 15px; color: #FF0000;">• No Clientes:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeWithNonClients)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageNonClients.toFixed(1)}%</strong></p>

          <p style="padding-left: 15px; color: #FF0000;">• En su casa:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeAtHome)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageAtHome.toFixed(1)}%</strong></p>

          <p style="padding-left: 15px; color: #FF0000;">• Tools de Mexico:</p>
          <p style="text-align: left; color: #FF0000;">${formatDuration(summaryStats.timeAtTools)}</p>
          <p style="text-align: left; color: #FF0000;"><strong>${summaryStats.percentageAtTools.toFixed(1)}%</strong></p>
              
          <p style="padding-left: 15px;">• En Traslados:</p>
          <p style="text-align: left;">${formatDuration(summaryStats.travelTime)}</p>
          <p style="text-align: left;"><strong>${summaryStats.percentageTravel.toFixed(1)}%</strong></p>
          
          
          <p><strong>Distancia total:</strong></p>
          <p style="text-align: left; grid-column: span 2;"><strong>${(summaryStats.distanceWithinHours / 1000).toFixed(2)} km</strong></p>
          
          <p><strong>Fin de labores:</strong></p>
          <p style="text-align: left; grid-column: span 2;">
            <strong>
              ${
                viewMode === 'new' && tripData.isTripOngoing
                  ? 'En movimiento...'
                  : tripData.workEndTime || 'N/A'
              }
            </strong>
          </p>

          <p style="grid-column: span 3; font-size: 13px; font-weight: bold; color: #002FFF; background-color: #EDF0FF;">
            Fuera de horario
          </p>

          <p style="grid-column: span 3; color: #00004F;"><strong>Tiempo con:</strong></p>

          <p style="padding-left: 15px; color: #00004F;">• Clientes:</p>
          <p style="text-align: left; color: #00004F; grid-column: span 2;">${formatDuration(summaryStats.timeWithClientsAfterHours)}</p>
          
          <p style="padding-left: 15px; color: #FF0000;">• No Clientes:</p>
          <p style="text-align: left; color: #FF0000; grid-column: span 2;">${formatDuration(summaryStats.totalTimeWithNonClientsAfterHours)}</p>
          
          <p style="padding-left: 15px; color: #00004F;">• En Traslados:</p>
          <p style="text-align: left; color: ##00004F; grid-column: span 2;">${formatDuration(summaryStats.travelTimeAfterHours)}</p>
          
          <p style="color: #00004F;"><strong>Distancia recorrida:</strong></p>
          <p style="text-align: left; color: #00004F; grid-column: span 2;"><strong>${(summaryStats.distanceAfterHours / 1000).toFixed(2)} km</strong></p>
          
        </div>
      </div>
    `;

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
          />

          <style>
            #map { height: 100%; width: 100%; } 
            body, html { height: 100%; margin: 0; padding: 0; }
            .gm-style-iw-d { overflow: hidden !important; }
            .gm-style-iw-c { padding: 12px !important; }
            .gm-style-iw strong, .gm-style-iw b { font-weight: 600 !important; }
            h3 { margin: 0 0 8px 0; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; }
            h3 span { font-size: 20px; margin-right: 8px; }
            p { margin: 4px 0; font-family: sans-serif; font-size: 14px; }

            .view-maps-link {
              color: #1a73e8;
              text-decoration: none;
              font-size: 12px;
              font-weight: 400;
              display: inline-flex;
              align-items: center;
            }
            
            .view-maps-link:hover {
              text-decoration: underline !important;
            }

            .coords-container {
              margin: 4px 0;
              font-size: 12px;
              font-weight: 400;
              color: #374151;
              cursor: pointer;
              display: flex;
              align-items: center;
              padding: 2px 0;
              border-radius: 4px;
              transition: background-color 0.2s;
            }

            .coords-container:hover {
              color: #000000;
            }
            
            #controls {
              position: absolute;
              top: 10px;
              left: 50%;
              transform: translateX(-50%);
              z-index: 10;
              background: white;
              padding: 8px;
              border: none;
              border-radius: 8px;
              display: flex;
              gap: 8px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            }

            #controls button { 
              font-family: sans-serif;
              font-size: 12px;
              padding: 8px 12px;
              cursor: pointer;
              border-radius: 5px;
              border: none;
              background: #F3F4F6;
              display: flex;
              align-items: center;
              gap: 6px;
            } 

            #controls button:disabled { 
              cursor: not-allowed; 
              background-color: #FCFCFC; 
              color: #aaa; 
            }

            #controls button:hover{
              background: #E5E7EB;
            }

            #controls .btn-icon {
              display: none;
              font-size: 14px;
              font-weight: bold;
            }

            #controls .btn-text {
              display: inline;
            }
            
            #info-container { 
              position: absolute; 
              top: 10px; 
              right: 10px; 
              transform: translateY(10%); 
              z-index: 10; 
              display: flex; 
              flex-direction: column; 
              gap: 5px; 
            }
            
            .info-card { 
              background: rgba(255, 255, 255, 0.9); 
              padding: 6px 10px; 
              border-radius: 5px; 
              border: 1px solid #ccc; 
              font-family: sans-serif; 
              font-size: 12px; 
              width: 260px; 
            }
            
            .info-card h4 { 
              font-size: 14px; 
              font-weight: bold; 
              margin: 0; 
              color: #00004F
            }

            .toggle-btn {
              display: none;
              background: transparent;
              border: none;
              cursor: pointer;
              padding: 4px;
              color: #00004F;
              transition: transform 0.3s ease;
            }

            .toggle-btn:hover {
              color: #0275D8;
            }

            .toggle-btn.collapsed i {
              transform: rotate(360deg);
            }

            .info-grid, .summary-grid {
              transition: all 0.3s ease;
              overflow: hidden;
              max-height: 500px;
              opacity: 1;
            }

            .info-grid.collapsed, .summary-grid.collapsed {
              max-height: 0 !important;
              opacity: 0;
              padding-top: 0 !important;
              padding-bottom: 0 !important;
              margin: 0 !important;
              visibility: hidden;
            }
            
            .info-card p { 
              margin: 2.7px 0; 
              font-size: 12px; 
              color: #00004F
            }

            /* Botón de información para móvil */
            #info-toggle-btn {
              display: none;
              position: absolute;
              top: 10px;
              left: 10px;
              z-index: 15;
              background: white;
              border: 2px solid #0275D8;
              border-radius: 50%;
              width: 38px;
              height: 38px;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              align-items: center;
              justify-content: center;
              font-size: 24px;
              color: #0275D8;
              transition: all 0.3s ease;
            }

            #info-toggle-btn:active {
              transform: scale(0.95);
              background: #f0f0f0;
            }

            /* Modal para información en móvil */
            #info-modal {
              display: none;
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.5);
              z-index: 20;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            #info-modal.active {
              display: flex;
            }

            #info-modal-content {
              background: white;
              border-radius: 12px;
              max-height: 85vh;
              width: 100%;
              max-width: 400px;
              box-shadow: 0 4px 16px rgba(0,0,0,0.3);
              padding: 16px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }

            #info-modal-content > div:last-child {
              overflow-y: auto;
              flex: 1;
              margin-top: 10px;
            }

            #info-modal-close {
              float: right;
              font-size: 28px;
              font-weight: bold;
              color: #666;
              cursor: pointer;
              line-height: 20px;
            }

            #info-modal-close:hover {
              color: #000;
            }

            @media (max-width: 768px) {
              body, html {
                height: 100vh;
                overflow: hidden;
              }

              #map {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                height: 100vh !important;
                width: 100vw !important;
              }

              #controls {
                position: fixed;
                bottom: 20px;
                left: 50%;
                top: auto;
                transform: translateX(-50%);
                flex-direction: row;
                gap: 10px;
                padding: 8px;
                background: rgba(255, 255, 255, 0.95);
              }

              #controls button {
                padding: 6px 10px;
                min-width: 30px;
                min-height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              #controls .btn-text {
                display: none;
              }

              #controls .btn-icon {
                display: inline;
                font-size: 18px;
              }

              #info-container {
                display: none !important;
              }

              #info-toggle-btn {
                display: flex !important;
              }

              #info-modal-content {
                max-height: 80vh;
                overflow: hidden;
                padding: 12px;
              }

              .info-card {
                width: 90%;
                margin-bottom: 10px;
                padding: 8px 10px;
                font-size: 10px;
              }

              .info-card h4 {
                font-size: 12px;
                margin: 0 0 4px 0;
                padding-bottom: 3px;
              }

              .info-card p {
                margin: 2px 0;
                font-size: 10px;
                line-height: 1.3;
              }

              #info-modal-content {
                display: flex;
                flex-direction: column;
                max-height: 80vh;
              }

              #info-modal-content > div {
                overflow-y: auto;
                flex: 1;
              }

              .info-card .summary-grid {
                grid-template-columns: 1.7fr 1fr 0.5fr !important;
                font-size: 9px !important;
              }

              .info-card .summary-grid p {
                font-size: 9px !important;
                word-break: break-word;
              }

              .info-card .summary-grid strong {
                font-size: 9px !important;
              }

              .info-card .info-grid {
                grid-template-columns: 1fr 0.9fr !important;
                font-size: 9px !important;
              }

              .info-card .info-grid p {
                font-size: 9px !important;
                word-break: break-word;
              }

              .info-card .info-grid strong {
                font-size: 9px !important;
              }
            }

            @media (min-width: 1025px) {
              .toggle-btn {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
              }

              .info-grid, .summary-grid {
                max-height: 1000px;
              }
            }

            @media (min-width: 768px) and (max-width: 1024px) {
              body, html {
                height: 100vh;
                overflow: hidden;
              }

              #map {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                height: 100vh !important;
                width: 100vw !important;
              }

              #controls {
                position: fixed;
                bottom: 20px;
                left: 50%;
                top: auto;
                transform: translateX(-50%);
                flex-direction: row;
                gap: 12px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.95);
              }

              #controls button {
                padding: 8px 12px;
                min-width: 40px;
                min-height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              #controls .btn-text {
                display: none;
              }

              #controls .btn-icon {
                display: inline;
                font-size: 24px;
              }

              #info-container {
                display: none !important;
              }

              #info-toggle-btn {
                display: flex !important;
              }

              #info-modal-content {
                max-height: 80vh;
                overflow: hidden;
                padding: 14px;
                display: flex;
                flex-direction: column;
              }

              #info-modal-content > div {
                overflow-y: auto;
                flex: 1;
              }

              .info-card {
                width: 90%;
                margin-bottom: 12px;
                padding: 10px 12px;
                font-size: 12px;
              }

              .info-card h4 {
                font-size: 14px;
                margin: 0 0 6px 0;
                padding-bottom: 4px;
              }

              .info-card p {
                margin: 3px 0;
                font-size: 11px;
                line-height: 1.4;
              }

              .info-card .summary-grid {
                grid-template-columns: 1.7fr 1fr 0.5fr !important;
                font-size: 10px !important;
              }

              .info-card .summary-grid p,
              .info-card .summary-grid strong,
              .info-card .info-grid p,
              .info-card .info-grid strong {
                font-size: 10px !important;
                word-break: break-word;
              }

              .info-card .info-grid {
                grid-template-columns: 1fr 0.9fr !important;
              }
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          
          <!-- Botón de información para móvil -->
          <button id="info-toggle-btn" aria-label="Ver información">
            <i class="fa-solid fa-info"></i>
          </button>

          <!-- Modal de información para móvil -->
          <div id="info-modal">
            <div id="info-modal-content">
              <div style="position: sticky; top: 0; background: white; z-index: 1; padding-bottom: 5px;">
                <span id="info-modal-close">&times;</span>
              </div>
              <div>
                ${infoBoxHTML}
                ${summaryCardHTML}
              </div>
            </div>
          </div>

          <!-- Contenedor de información para desktop -->
          <div id="info-container">
            <div>${infoBoxHTML}</div>
            <div>${summaryCardHTML}</div>
          </div>

          <div id="controls">
            <button id="resetBtn">
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 4v6h6M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </span>
              <span class="btn-text">Reiniciar</span>
            </button>
            <button id="prevStopBtn" disabled>
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </span>
              <span class="btn-text">Anterior Parada</span>
            </button>
            <button id="nextStopBtn">
              <span class="btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
              <span class="btn-text">Siguiente Parada</span>
            </button>
          </div>
          
          <script>
            let map, markers = [], infowindows = [], openInfoWindows = new Set(), stopInfo = [];
            let lastNavigationTime = 0;
            const NAVIGATION_COOLDOWN = 100;

            // Funcion cortapapeles
            function copyToClipboard(element, text) {
              if (!navigator.clipboard) {
                return;
              }
              navigator.clipboard.writeText(text).then(() => {
                const originalHtml = element.innerHTML;
                element.innerHTML = '<span style="font-weight: bold; color: #059669;">¡Coordenadas Copiadas! ✅</span>';
                setTimeout(() => {
                  element.innerHTML = originalHtml;
                }, 2000);
              }).catch(err => {
                console.error('Error al copiar: ', err);
              });
            }

            const toggleInfoModal = () => {
              const modal = document.getElementById('info-modal');
              modal.classList.toggle('active');
            };

            const toggleInfoCard = () => {
              const content = document.getElementById('info-content');
              const btn = document.getElementById('toggle-info-btn');
              
              if (content && btn) {
                const icon = btn.querySelector('i');
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                  content.classList.remove('collapsed');
                  btn.classList.remove('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-up';
                } else {
                  content.classList.add('collapsed');
                  btn.classList.add('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-down';
                }
                console.log('Info card toggled, collapsed:', !isCollapsed);
              }
            };

            const toggleSummaryCard = () => {
              const content = document.getElementById('summary-content');
              const btn = document.getElementById('toggle-summary-btn');
              
              if (content && btn) {
                const icon = btn.querySelector('i');
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                  content.classList.remove('collapsed');
                  btn.classList.remove('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-up';
                } else {
                  content.classList.add('collapsed');
                  btn.classList.add('collapsed');
                  if (icon) icon.className = 'fa-solid fa-chevron-down';
                }
                console.log('Summary card toggled, collapsed:', !isCollapsed);
              }
            };

            window.onclick = (event) => {
              const modal = document.getElementById('info-modal');
              if (event.target === modal) {
                modal.classList.remove('active');
              }
            };

            const routePath = ${JSON.stringify(routes[0]?.path || [])};
            const allFlags = ${JSON.stringify(filteredFlags)};
            const allClients = ${JSON.stringify(clientsToRender)};
            const formatDuration = ${formatDuration.toString()};
            const isWorkingHoursFunc = ${isWorkingHoursFunctionString};
            const tripDateForCheck = '${vehicleInfo?.fecha || ''}';
            const processingMethod = '${processingMethod}';
            const specialNonClientKeys = ['3689', '6395'];
            let animatedPolyline, currentPathIndex = 0, animationFrameId, isAnimating = false, currentStopIndex = 0;
            let segmentDistances = [];
            let cumulativeDistance = 0;
            let totalTripDistanceMeters = 0;
            const countedClientKeys = new Set();

            function formatDistance(meters) {
              if (meters < 1000) return meters.toFixed(0) + ' m';
              return (meters / 1000).toFixed(2) + ' km';
            }

            function updateDistanceCard(segmentMeters, totalMeters) {
              console.log('Actualizando distancias - Segmento:', segmentMeters, 'Total:', totalMeters);
              
              const segmentElements = document.querySelectorAll('#segment-distance');
              const totalElements = document.querySelectorAll('#total-distance');
              
              segmentElements.forEach(el => {
                if (el) el.textContent = formatDistance(segmentMeters);
              });
              
              totalElements.forEach(el => {
                if (el) el.textContent = formatDistance(totalMeters);
              });
            }

            function closeAllInfoWindows() {
              openInfoWindows.forEach(infoWindow => {
                infoWindow.close();
              });
              openInfoWindows.clear();
            }

            function closeAllInfoWindowsExcept(exceptInfoWindow = null) {
              openInfoWindows.forEach(infoWindow => {
                if (infoWindow !== exceptInfoWindow) {
                  infoWindow.close();
                  openInfoWindows.delete(infoWindow);
                }
              });
            }

            function openInfoWindow(marker, infowindow) {
              infowindow.open(map, marker);
              openInfoWindows.add(infowindow);
            }

            function closeInfoWindow(infowindow) {
              infowindow.close();
              openInfoWindows.delete(infowindow);
            }

            function toggleInfoWindow(marker, infowindow) {
              if (openInfoWindows.has(infowindow)) {
                closeInfoWindow(infowindow);
              } else {
                openInfoWindow(marker, infowindow);
              }
            }

            function createClientMarker(client) {
              const specialBlueIds  = [ '3689', '6395' ];
              const isSpecial = specialBlueIds.includes(String(client.key));

              let markerColor = '#A12323';

              if (client.isVendorHome) {
                markerColor = '#5D00FF';
              } else if (isSpecial) {
                markerColor = '#005EFF';
              }

              const icon = {
                path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
                fillColor: markerColor,
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.3,
                anchor: new google.maps.Point(12, 24)
              };
              
              return new google.maps.Marker({
                position: { lat: client.lat, lng: client.lng },
                map,
                icon,
                title: client.displayName
              });
            }

            function createClientInfoWindow(client) {
              const branchInfo = client.branchNumber ? 
                (client.branchName ? 
                  \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${client.branchName}</p>\` : 
                  \`<p style="margin: 2px 0; font-weight: 600; color: #2563eb; font-size: 12px;">Suc. \${client.branchNumber}</p>\`) 
                : '';
              const googleMapsLink = \`https://www.google.com/maps/search/?api=1&query=\${client.lat},\${client.lng}\`;
              const coordinatesText = \`\${client.lat.toFixed(6)}, \${client.lng.toFixed(6)}\`;

              const isHome = client.isVendorHome;
              const titleText = isHome ? 'Casa Vendedor' : 'Cliente';
              const titleIcon = isHome ? 'fa-solid fa-user-tie' : 'fa-solid fa-house';
              const nameColor = isHome ? '#5D00FF' : '#059669';

              const content = \`
                <div>
                  <h3 style="display:flex; align-items:center; font-size: 15px;">
                    <span style="margin-right: 8px; font-size:15px; color: \${nameColor};">
                      <i class="\${titleIcon}"></i>
                    </span>
                    \${titleText}
                  </h3>
                  <strong><p style="margin: 2px 0 0 0; color: \${nameColor}; font-size: 12px;"><strong>#</strong> <strong> \${client.key} </strong></p></strong>
                  <strong><p style="margin: 2px 0 0 0; color: \${nameColor}; font-size: 12px;"><strong> \${client.displayName} </strong></p></strong>
                  <strong>\${branchInfo}</strong>

                  <div class="coords-container" onclick="copyToClipboard(this, '\${coordinatesText}')" title="Haz clic para copiar coordenadas">
                    <span>\${coordinatesText}</span>
                  </div>

                  <a href="\${googleMapsLink}" target="_blank" class="view-maps-link">
                    View on Google Maps
                  </a>
                </div>\`;
              return new google.maps.InfoWindow({ content });
            }

            function initMap() {
              map = new google.maps.Map(document.getElementById('map'), { 
                center: ${mapCenter}, 
                zoom: 12, 
                mapTypeControl: false, 
                streetViewControl: true,
                gestureHandling: 'greedy'
              });
              const bounds = new google.maps.LatLngBounds();

              allFlags.forEach((flag, index) => {
                if (!flag) return;
                const marker = createMarker(flag);
                const infowindow = createInfoWindow(flag);
                markers.push(marker);
                infowindows.push(infowindow);
                
                marker.addListener('click', () => {
                  toggleInfoWindow(marker, infowindow);
                });
                
                if (flag.type === 'start' || flag.type === 'stop' || flag.type === 'end') {
                  const flagLatLng = new google.maps.LatLng(flag.lat, flag.lng);
                  let closestPathIndex = -1;
                  let minDistance = Infinity;
                  routePath.forEach((pathPoint, i) => {
                    const pathLatLng = new google.maps.LatLng(pathPoint.lat, pathPoint.lng);
                    const distance = google.maps.geometry.spherical.computeDistanceBetween(flagLatLng, pathLatLng);
                    if (distance < minDistance) {
                      minDistance = distance;
                      closestPathIndex = i;
                    }
                  });
                  stopInfo.push({ markerIndex: index, pathIndex: closestPathIndex, type: flag.type });
                }
                bounds.extend(marker.getPosition());
              });

              allClients.forEach(client => {
                const clientMarker = createClientMarker(client);
                const clientInfoWindow = createClientInfoWindow(client);
                clientMarker.addListener('click', () => {
                  toggleInfoWindow(clientMarker, clientInfoWindow);
                });
                bounds.extend(clientMarker.getPosition());
              });

              let lastPathIndex = 0;
              for (let i = 1; i < stopInfo.length; i++) {
                const stop = stopInfo[i];
                const segmentPath = routePath.slice(lastPathIndex, stop.pathIndex + 1);
                const segmentLength = google.maps.geometry.spherical.computeLength(segmentPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
                segmentDistances.push(segmentLength);
                lastPathIndex = stop.pathIndex;
              }
              
              totalTripDistanceMeters = google.maps.geometry.spherical.computeLength(routePath.map(p => new google.maps.LatLng(p.lat, p.lng)));
              updateDistanceCard(0, cumulativeDistance);

              map.fitBounds(bounds);
              animatedPolyline = new google.maps.Polyline({ path: [], strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 5, map: map });
              
              document.getElementById('resetBtn').addEventListener('click', resetRoute);
              document.getElementById('prevStopBtn').addEventListener('click', animateToPreviousStop);
              document.getElementById('nextStopBtn').addEventListener('click', animateToNextStop);
              document.getElementById('info-toggle-btn').addEventListener('click', toggleInfoModal);
              document.getElementById('info-modal-close').addEventListener('click', toggleInfoModal);

              // Asigna eventos SOLAMENTE a los botones que están dentro de #info-container (escritorio)
              document.querySelectorAll('#info-container .toggle-info-btn, #info-container .toggle-summary-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const card = btn.closest('.info-card');
                  if (!card) return;

                  // La lógica interna para encontrar el contenido y el ícono sigue siendo la misma
                  const content = card.querySelector('.info-content, .summary-content');
                  const icon = btn.querySelector('i');

                  if (content && icon) {
                    const isCollapsed = content.classList.contains('collapsed');

                    content.classList.toggle('collapsed');
                    btn.classList.toggle('collapsed');

                    // Cambia el ícono de la flecha
                    icon.className = isCollapsed ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
                  }
                });
              });
            }

            function createMarker(flag) { 
              const colors = { start: '#22c55e', stop: '#4F4E4E', end: '#ef4444' };
              const icon = { path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', fillColor: colors[flag.type], fillOpacity: 1, strokeWeight: 0, scale: 1.5, anchor: new google.maps.Point(12, 24) };
              return new google.maps.Marker({ position: { lat: flag.lat, lng: flag.lng }, map, icon, title: flag.description });
            }

            function createInfoWindow(flag) {
              const isWorkingHoursFlag = ${isWorkingHours.toString()};
              const tripDate = '${vehicleInfo?.fecha || ''}';
              const inWorkingHours = flag.type === 'stop' ? isWorkingHoursFlag(flag.time, tripDate) : true;
              
              const containerStyle = inWorkingHours 
                ? 'background: white; color: black;' 
                : 'background: white; color: #FF0000;';
              const titleColor = inWorkingHours ? '#000' : '#C40000';
              const squareColor = inWorkingHours ? '#4F4E4E' : '#C40000';
              const labelColor = inWorkingHours ? '#374151' : '#CFF0000';
              const clientMatchColor = inWorkingHours ? '#059669' : '#10b981';
              const clientNoMatchColor = inWorkingHours ? '#FC2121' : '#C40000';
              const branchColor = inWorkingHours ? '#2563eb' : '#60a5fa';
              
              const googleMapsLink = \`https://www.google.com/maps/search/?api=1&query=\${flag.lat},\${flag.lng}\`;
              const coordinatesText = \`\${flag.lat.toFixed(6)}, \${flag.lng.toFixed(6)}\`;
              
              let content = '';
              
              switch (flag.type) {
                case 'start': 
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: #22c55e;">
                          <i class="fa-solid fa-road-circle-check"></i>
                        </span> 
                        \${flag.description}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;">
                        <strong>Hora:</strong> \${flag.time}
                      </p>

                      <div class="coords-container" onclick="copyToClipboard(this, '\${coordinatesText}')" title="Haz clic para copiar coordenadas">
                        <span>\${coordinatesText}</span>
                      </div>

                      <a href="\${googleMapsLink}" target="_blank" class="view-maps-link">
                        View on Google Maps
                      </a>
                    </div>\`; 
                  break;
                  
                case 'end': 
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: #ef4444;">
                          <i class="fa-solid fa-road-circle-xmark"></i>
                        </span>
                        \${flag.description}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Hora:</strong> \${flag.time}</p>
                      
                      <div class="coords-container" onclick="copyToClipboard(this, '\${coordinatesText}')" title="Haz clic para copiar coordenadas">
                        <span>\${coordinatesText}</span>
                      </div>

                      <a href="\${googleMapsLink}" target="_blank" class="view-maps-link">
                        View on Google Maps
                      </a>
                    </div>\`; 
                  break;
                  
                case 'stop':
                  let clientInfo = '';
                  if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
                    const clientKey = flag.clientKey || 'N/A';
                    const clientBaseName = flag.clientName;
                    const branchInfo = flag.clientBranchNumber ? 
                      (flag.clientBranchName ? 
                        \`Suc. \${flag.clientBranchName}\` : 
                        \`Suc. \${flag.clientBranchNumber}\`) 
                      : null;
                    
                    clientInfo = \`
                      <div style="color:\${clientMatchColor};">
                        <p style="margin: 2px 0; font-weight: 500; font-size: 12px;">
                          <strong>#</strong> <strong>\${clientKey}</strong>
                        </p>
                        <strong><p style="margin: 2px 0; font-weight: 600; font-size: 12px;">\${clientBaseName}</p></strong>
                        <strong>\${branchInfo ? \`<p style="margin: 2px 0; font-weight: 600; font-size: 12px; color: \${branchColor};">\${branchInfo}</p>\` : ''}</strong>
                      </div>\`;
                  } else {
                    clientInfo = \`<p style="color:\${clientNoMatchColor}; font-weight: 500; font-size: 12px;"><strong>Cliente:</strong> Sin coincidencia</p>\`;
                  } 
                  
                  const stopIcon = !inWorkingHours
                    ? \`<i class="fa-solid fa-triangle-exclamation"></i>\`
                    : \`<i class="fa-solid fa-flag"></i>\`;
                  
                  content = \`
                    <div style="\${containerStyle} padding: 4px;">
                      <h3 style="color: \${titleColor}; font-size: 15px;">
                        <span style="color: \${squareColor}; font-size: 15px;">
                          \${stopIcon}
                        </span> 
                        Parada \${flag.stopNumber}
                      </h3>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Duración:</strong> \${formatDuration(flag.duration || 0)}</p>
                      <p style="color: \${labelColor}; font-size: 12px;"><strong>Hora:</strong> \${flag.time}</p>
                      \${clientInfo}

                      <div class="coords-container" onclick="copyToClipboard(this, '\${coordinatesText}')" title="Haz clic para copiar coordenadas">
                        <span>\${coordinatesText}</span>
                      </div>

                      <a href="\${googleMapsLink}" target="_blank" class="view-maps-link">
                        View on Google Maps
                      </a>
                    </div>\`;
                  break;
              }
              
              return new google.maps.InfoWindow({ content });
            }

            function resetRoute() {
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();
              
              closeAllInfoWindows();
              
              animatedPolyline.setPath([]);
              currentPathIndex = 0;
              currentStopIndex = 0;
              cumulativeDistance = 0;
              isAnimating = false;
              
              countedClientKeys.clear();
              document.querySelectorAll('.visited-clients-count').forEach(el => el.textContent = '0');
              
              updateDistanceCard(0, 0);
              
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              
              document.getElementById('resetBtn').disabled = false;
              document.getElementById('nextStopBtn').disabled = false;
              document.getElementById('prevStopBtn').disabled = true;
              
              const startMarker = markers[0];
              const startInfowindow = infowindows[0];
              if (startMarker && startInfowindow) {
                startMarker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => startMarker.setAnimation(null), 1400);
                openInfoWindow(startMarker, startInfowindow);
              }
              
              if (allFlags.length > 0) {
                map.setCenter({ lat: allFlags[0].lat, lng: allFlags[0].lng });
                map.setZoom(14);
              }
            }

            function animateToNextStop() {
              if (currentStopIndex >= stopInfo.length - 1) return;
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();
              
              const nextStop = stopInfo[currentStopIndex + 1];
              isAnimating = true;
              
              closeAllInfoWindows();
              
              document.getElementById('resetBtn').disabled = true;
              document.getElementById('nextStopBtn').disabled = true;
              document.getElementById('prevStopBtn').disabled = true;
              
              const onSegmentComplete = () => {
                isAnimating = false;
                const marker = markers[nextStop.markerIndex];
                const infowindow = infowindows[nextStop.markerIndex];
                marker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => marker.setAnimation(null), 1400);
                
                openInfoWindow(marker, infowindow);

                const segmentMeters = segmentDistances[currentStopIndex] || 0;
                cumulativeDistance += segmentMeters;

                let currentSegmentMeters = segmentMeters;
                updateDistanceCard(currentSegmentMeters, cumulativeDistance);

                const currentFlag = allFlags[nextStop.markerIndex];
                if (
                  currentFlag &&
                  currentFlag.type === 'stop' &&
                  currentFlag.clientKey &&
                  !countedClientKeys.has(currentFlag.clientKey) &&
                  !currentFlag.isVendorHome &&
                  !specialNonClientKeys.includes(currentFlag.clientKey)
                ) {
                  countedClientKeys.add(currentFlag.clientKey);
                  document.querySelectorAll('.visited-clients-count').forEach(
                    (el) => (el.textContent = countedClientKeys.size)
                  );
                }
                currentStopIndex++;
                
                document.getElementById('resetBtn').disabled = false;
                document.getElementById('prevStopBtn').disabled = false;

                if (currentStopIndex >= stopInfo.length - 1) {
                  document.getElementById('nextStopBtn').disabled = true;
                  updateDistanceCard(segmentMeters, totalTripDistanceMeters);
                } else {
                  document.getElementById('nextStopBtn').disabled = false;
                }
              };

              if (processingMethod === 'speed-based') {
                animateVeryFast(nextStop.pathIndex, onSegmentComplete);
              } else {
                animateSmoothly(nextStop.pathIndex, onSegmentComplete);
              }
            }

            function animateToPreviousStop() {
              if (currentStopIndex <= 0) return;
              if (Date.now() - lastNavigationTime < NAVIGATION_COOLDOWN) return;
              lastNavigationTime = Date.now();

              const lastStopFlag = allFlags[stopInfo[currentStopIndex].markerIndex];
              
              currentStopIndex--;
              
              closeAllInfoWindows();
              
              document.getElementById('resetBtn').disabled = true;
              document.getElementById('nextStopBtn').disabled = true;
              document.getElementById('prevStopBtn').disabled = true;

              const previousStop = stopInfo[currentStopIndex];
              const segmentMetersToUndo = segmentDistances[currentStopIndex] || 0;
              cumulativeDistance -= segmentMetersToUndo;

              const newPath = routePath.slice(0, previousStop.pathIndex + 1);
              animatedPolyline.setPath(newPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
              currentPathIndex = newPath.length - 1;

              if (lastStopFlag && lastStopFlag.type === 'stop' && lastStopFlag.clientKey) {
                const clientKeyToRemove = lastStopFlag.clientKey;
                let isStillVisited = false;
                for (let i = 0; i <= currentStopIndex; i++) {
                  const flag = allFlags[stopInfo[i].markerIndex];
                  if (flag.clientKey === clientKeyToRemove) {
                    isStillVisited = true;
                    break;
                  }
                }
                if (!isStillVisited && countedClientKeys.has(clientKeyToRemove)) {
                  countedClientKeys.delete(clientKeyToRemove);
                  document.querySelectorAll('.visited-clients-count').forEach(el => el.textContent = countedClientKeys.size);
                }
              }

              let currentSegmentMeters = 0;
              if (currentStopIndex > 0) {
                currentSegmentMeters = segmentDistances[currentStopIndex - 1] || 0;
              }

              updateDistanceCard(currentSegmentMeters, cumulativeDistance);

              const marker = markers[previousStop.markerIndex];
              const infowindow = infowindows[previousStop.markerIndex];
              marker.setAnimation(google.maps.Animation.BOUNCE);
              setTimeout(() => marker.setAnimation(null), 1400);
              
              openInfoWindow(marker, infowindow);

              document.getElementById('resetBtn').disabled = false;
              document.getElementById('nextStopBtn').disabled = false;
              if (currentStopIndex > 0) {
                document.getElementById('prevStopBtn').disabled = false;
              }
            }

            function runAnimation(targetPathIndex, onComplete, animationStep) {
              function step() {
                if (!isAnimating) {
                  cancelAnimationFrame(animationFrameId);
                  return;
                }
                
                const end = Math.min(currentPathIndex + animationStep, targetPathIndex);
                
                if (end > currentPathIndex) {
                  const newPathSegment = routePath.slice(currentPathIndex, end + 1);
                  if (newPathSegment.length > 0) {
                    const existingPath = animatedPolyline.getPath();
                    newPathSegment.forEach(p => existingPath.push(new google.maps.LatLng(p.lat, p.lng)));
                  }
                }
                
                currentPathIndex = end;

                if (currentPathIndex >= targetPathIndex) {
                  onComplete();
                  return;
                }
                animationFrameId = requestAnimationFrame(step);
              }
              animationFrameId = requestAnimationFrame(step);
            }

            function animateVeryFast(targetPathIndex, onComplete) {
              runAnimation(targetPathIndex, onComplete, 35);
            }

            function animateSmoothly(targetPathIndex, onComplete = () => {}) {
              runAnimation(targetPathIndex, onComplete, 1);
            }
          </script>
          <script async defer src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initMap&libraries=geometry"></script>
        </body>
      </html>
    `;
};
