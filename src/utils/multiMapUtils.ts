import { type MultiVehicleData } from '../pages/MultipleVehicleTracker';

export const generateMultiMapHTML = (
  vehicles: MultiVehicleData[],
  minStopDuration: number,
  googleMapsApiKey: string
): string => {
  if (!vehicles || vehicles.length === 0) return '';

  const injectedData = /*javascript*/ `
    const rawVehicles = ${JSON.stringify(vehicles)};
    const MIN_STOP_DURATION = ${minStopDuration};
  `;

  const styles = /*css*/ `
    *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e5e7eb; }
    body, html { height: 100%; margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; overflow: hidden; background-color: #f9fafb; }
    #map { height: 100%; width: 100%; }
    p, h4 { margin: 0; }
    button { cursor: pointer; background: transparent; padding: 0; line-height: inherit; color: inherit; outline: none; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    svg { display: block; vertical-align: middle; }

    /* ESTILOS PARA EL RELOJ DE SIMULACION */
    #clock-container {
      position: absolute; top: 1rem; right: 10px; width: 130px; z-index: 10;
      background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(4px);
      padding: 0.5rem 1rem; border-radius: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      border: 1px solid #e5e7eb; text-align: center;
    }
    @media (min-width: 1350px) { #clock-container { width: 160px; } }
    .clock-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #00004F; letter-spacing: 0.05em; margin-bottom: 2px; }
    .clock-time { font-size: 1.25rem; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 700; color: #15803d; line-height: 1.75rem; }

    /* ESTILOS PARA TARJETA DE VEHICULOS */
    #legend-container {
      position: absolute; top: 100px; right: 10px; width: 130px; z-index: 10;
      background-color: rgba(255, 255, 255, 0.95); border-radius: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    }
    @media (min-width: 1350px) { #legend-container { top: 90px; width: 160px; } }
    .legend-header { display: flex; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid #d1d5db; position: relative; }
    .legend-header h4 { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #00004F; letter-spacing: 0.05em; }
    .legend-toggle-btn { position: absolute; right: 10px; color: #00004F; transition: color 0.2s; }
    .legend-toggle-btn:hover { color: #2563eb; }
    #legend-content { transition: all 0.3s; max-height: 300px; opacity: 1; overflow-y: auto; }
    #legend-content.collapsed { max-height: 0; opacity: 0; }
    .legend-list { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .vehicle-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #374151; position: relative; }
    .vehicle-item.hidden-v { opacity: 0.4; }
    
    .vehicle-info { display: flex; align-items: center; gap: 0.5rem; width: 100%; }
    .color-dot { 
      display: block; 
      width: 14px; 
      height: 14px; 
      border-radius: 50%; 
      box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); 
      flex-shrink: 0; 
    }

    .vehicle-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
    .eye-btn { position: absolute; right: 0; color: #1d4ed8; }

    /* ESTILOS PARA EL BOTON DE OCULTAR/MOSTRAR NOTIFICACIONES */
    #notification-toggle-container { position: absolute; right: 10px; bottom: 205px; z-index: 10; }
    #notification-btn {
      width: 40px; height: 40px; background-color: white; color: #16a34a; border: 1px solid #16a34a;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      box-shadow: rgba(0, 0, 0, 0.3) 1px 3px 5px -1px; transition: background-color 0.2s, color 0.2s;
    }
    #notification-btn:hover { background-color: #16a34a; color: white; }

    /* ESTILOS PARA EL BOTON DE OCULTAR/MOSTRAR MARCADORES */
    #marker-toggle-container { position: absolute; right: 10px; bottom: 150px; z-index: 10; }
    #marker-btn {
      width: 40px; height: 40px; background-color: white; color: #2563eb; border: 1px solid #2563eb;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      box-shadow: rgba(0, 0, 0, 0.3) 1px 3px 5px -1px; transition: background-color 0.2s, color 0.2s;
    }
    #marker-btn:hover { background-color: #2563eb; color: white; }

    /* ESTILOS PARA LOS CONTROLES DE ANIMACION */
    #animation-controls {
      position: absolute; bottom: 1.25rem; left: 50%; transform: translateX(-50%);
      z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    }
    @media (min-width: 1350px) { #animation-controls { bottom: auto; top: 0.625rem; } }
    
    .playback-row { display: flex; align-items: center; gap: 0.5rem; }
    .skip-btn {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: 50%; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      border: 1px solid #e5e7eb; background-color: white; color: #1f2937; transition: all 0.2s;
    }
    .skip-btn:hover:not(:disabled) { background-color: #f3f4f6; color: #111827; }
    .skip-btn span { font-size: 9px; font-weight: 700; line-height: 1; margin-top: 2px; }
    
    .pill-bar {
      background-color: rgba(255, 255, 255, 0.95); border-radius: 9999px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      padding: 0.5rem; display: flex; gap: 0.25rem; border: 1px solid #e5e7eb; align-items: center;
    }
    .pill-divider { width: 1px; background-color: #9ca3af; margin: 0.5rem 0.25rem; height: 20px; }
    
    .reset-btn { padding: 0.625rem; background-color: #f3f4f6; border-radius: 50%; color: #374151; transition: background-color 0.2s; }
    .reset-btn:hover { background-color: #e5e7eb; color: #111827; }
    
    #play-pause-btn {
      padding: 0.625rem 1rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700;
      display: flex; align-items: center; gap: 0.5rem; transition: background-color 0.2s; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);
    }
    .play-state { background-color: #16a34a; color: white; }
    .play-state:hover { background-color: #15803d; }
    .pause-state { background-color: #ffedd5; color: #c2410c; }
    .pause-state:hover { background-color: #FFDEAD; }
    .repeat-state { background-color: #dcfce7; color: #15803d; }
    
    .speed-btn {
      padding: 0.625rem 0.75rem; background-color: #f3f4f6; border-radius: 9999px;
      color: #1f2937; font-size: 0.75rem; font-weight: 700; transition: background-color 0.2s;
    }
    .speed-btn:hover { background-color: #e5e7eb; color: #111827; }

    /* ESTILOS PARA LA BARRA DE TIEMPO */
    #scrubber-container {
      position: absolute; top: 1.25rem; left: 50%; transform: translateX(-50%); z-index: 10;
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    }
    @media (min-width: 1350px) { #scrubber-container { top: auto; bottom: 0.625rem; } }
    
    .scrubber-card {
      background-color: rgba(255, 255, 255, 0.95); border: 1px solid #e5e7eb; border-radius: 1rem;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); padding: 0.625rem 1rem 0.75rem 1rem;
      display: flex; flex-direction: column; gap: 0.5rem; width: 340px;
    }
    .jump-header { display: flex; align-items: center; justify-content: space-between; }
    .jump-title { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .jump-options { display: flex; gap: 0.25rem; }
    .jump-opt-btn {
      padding: 0.125rem 0.625rem; border-radius: 9999px; font-size: 11px; font-weight: 700; transition: all 0.2s;
      background-color: #f3f4f6; color: #6b7280;
    }
    .jump-opt-btn:hover { background-color: #e5e7eb; }
    .jump-opt-btn.active { background-color: #16a34a; color: white; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }

    .slider-wrapper { display: flex; flex-direction: column; gap: 0.25rem; }
    input[type=range] {
      width: 100%; height: 6px; border-radius: 9999px; appearance: none; cursor: pointer;
      background: linear-gradient(to right, #10b981 0%, #e5e7eb 0%); outline: none;
    }
    input[type=range]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #10b981; cursor: pointer; }
    .slider-labels { display: flex; justify-content: space-between; font-size: 13px; font-family: monospace; font-weight: 600; color: #6b7280; }
    .slider-current-label { color: #15803d; font-weight: 700; }

    .gm-style-iw-d { overflow: hidden !important; }
    .coords-hover { transition: color 0.2s ease; cursor: pointer; font-size: 12px; margin: 4px 0; color: #374151; }
    .coords-hover:hover { color: #000000 !important; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;

  const layout = /*html*/ `
    <div id="map"></div>
    
    <!-- CONTENEDOR DEL RELOJ -->
    <div id="clock-container">
      <p class="clock-title">Reloj Simulación</p>
      <p class="clock-time" id="clock-display">00:00</p>
    </div>

    <!-- CONTENEDOR DE TARJETA DE VEHICULOS -->
    <div id="legend-container">
      <div class="legend-header">
        <h4>Vehículos</h4>
        <button class="legend-toggle-btn" id="legend-toggle" onclick="toggleLegend()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      <div id="legend-content">
        <div class="legend-list" id="vehicle-list"></div>
      </div>
    </div>

    <!-- CONTENEDOR PARA BOTON DE OCULTAR/MOSTRAR NOTIFICACIONES -->
    <div id="notification-toggle-container">
      <button id="notification-btn" onclick="toggleNotifications()">
        <svg id="icon-bell" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        <svg id="icon-bell-off" width="22" height="22" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
      </button>
    </div>

    <!-- CONTENEDOR PARA BOTON DE OCULTAR/MOSTRAR MARCADORES -->
    <div id="marker-toggle-container">
      <button id="marker-btn" title="Mostrar Marcadores" onclick="toggleMarkers()">
        <svg id="icon-map-pin" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        <svg id="icon-map-pin-off" width="25" height="25" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.43 5.43A8.06 8.06 0 0 0 4 10c0 6 8 12 8 12a29.94 29.94 0 0 0 5-5M19.18 13.52A8.66 8.66 0 0 0 20 10a8 8 0 0 0-8-8 7.88 7.88 0 0 0-3.52.82M2 2l20 20"/></svg>
      </button>
    </div>

    <!-- CONTENEDOR PARA CONTROLES DE ANIMACION -->
    <div id="animation-controls">
      <div class="playback-row">
        <button class="skip-btn" onclick="handleSkip(-1)" id="skip-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
          <span class="skip-val-text">15 min</span>
        </button>
        
        <div class="pill-bar">
          <button class="reset-btn" onclick="handleReset()" title="Reiniciar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <div class="pill-divider"></div>
          <button id="play-pause-btn" class="play-state" onclick="togglePlayPause()">
            <svg id="icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <svg id="icon-pause" width="16" height="16" style="display:none;" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            <svg id="icon-repeat" width="16" height="16" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span id="play-text" class="hidden sm:inline">Iniciar Recorrido</span>
          </button>
          <div class="pill-divider"></div>
          <button class="speed-btn" id="speed-btn" onclick="toggleSpeed()" title="Cambiar velocidad">x1.0</button>
        </div>

        <button class="skip-btn" onclick="handleSkip(1)" id="skip-forward-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          <span class="skip-val-text">15 min</span>
        </button>
      </div>
    </div>

    <!-- CONTENEDOR PARA SLIDER DEL TIEMPO -->
    <div id="scrubber-container">
      <div class="scrubber-card">
        <div class="jump-header">
          <span class="jump-title">Salto</span>
          <div class="jump-options">
            <button class="jump-opt-btn" onclick="setSkipMinutes(5)" id="btn-skip-5">5 min</button>
            <button class="jump-opt-btn active" onclick="setSkipMinutes(15)" id="btn-skip-15">15 min</button>
            <button class="jump-opt-btn" onclick="setSkipMinutes(30)" id="btn-skip-30">30 min</button>
          </div>
        </div>
        <div class="slider-wrapper">
          <input type="range" id="time-slider" min="0" max="100" value="0" oninput="handleScrub(event)">
          <div class="slider-labels">
            <span id="label-start">00:00</span>
            <span id="label-current" class="slider-current-label">00:00</span>
            <span id="label-end">23:59</span>
          </div>
        </div>
      </div>
    </div>

    <!-- CONTENEDOR PARA LAS NOTIFICACIONES -->
    <div id="notifications-container" style="position:absolute; top:1rem; left:10px; z-index:20; display:flex; flex-direction:column; gap:0.5rem; pointer-events:none;">
    </div>

    <!-- SPINNER DE CARGA -->
    <div id="reset-spinner" style="display:none; position:absolute; top:0; left:0; right:0; bottom:0; z-index:50; background:rgba(255,255,255,0.1); backdrop-filter:blur(4px); align-items:center; justify-content:center;">
      <svg style="animation: spin 1s linear infinite;" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round">
        <circle cx="12" cy="12" r="10" stroke="#e5e7eb"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#16a34a"/>
      </svg>
    </div>
  `;

  const logic = /*javascript*/ `
    let map;
    let globalStartTime = 86400; 
    let globalEndTime = 0;
    let currentTimeSeconds = 0;
    let prevTimeSeconds = 0;
    let globalStops = [];
    
    let isPlaying = false;
    let isPaused = false;
    let isFinished = false;
    let playbackSpeed = 1;
    let skipMinutes = 15;
    let showMarkers = false;
    let animationInterval;
    let infoWindows = [];
    let notifications = [];
    let showNotifications = true;
    let notifiedStops = new Set();
    let notifiedCoincidences = new Set();

    const vehicleState = {};
    const stopMarkers = [];

    // Funcion para calcular la distancia entre dos puntos
    function calculateDistance(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Funcion para convertir horas a segundos
    function timeToSeconds(timeStr) {
      if (!timeStr) return 0;
      const p = timeStr.split(':');
      return parseInt(p[0])*3600 + parseInt(p[1])*60 + (parseInt(p[2])||0);
    }

    // Funcion para convertir segundos a horas
    function secondsToTime(secs) {
      const h = Math.floor(secs / 3600).toString().padStart(2, '0');
      const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
      return h + ':' + m;
    }

    // Funcion para formatear la duracion
    function formatDuration(mins) {
      const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
      return h > 0 ? h + 'h ' + m + 'min' : m + ' min';
    }

    // Funcion para copiar las coordenadas
    function copyCoords(text) {
      navigator.clipboard.writeText(text).then(() => { alert('¡Coordenadas copiadas!: ' + text); });
    }

    // Funcion para inicializar los datos de la ruta
    function initData() {
      rawVehicles.forEach(v => {
        const events = v.tripData.events || [];
        const eventSeconds = events.map(e => timeToSeconds(e.time));
        if (eventSeconds.length > 0) {
          if (eventSeconds[0] < globalStartTime) globalStartTime = eventSeconds[0];
          if (eventSeconds[eventSeconds.length - 1] > globalEndTime) globalEndTime = eventSeconds[eventSeconds.length - 1];
        }
        vehicleState[v.id] = {
          data: v, fullPath: v.tripData.routes[0]?.path || [],
          eventSeconds, polyline: null, marker: null, isVisible: true
        };

        const flags = (v.tripData.flags || []).filter(f => f.type !== 'stop' || (f.duration && f.duration >= MIN_STOP_DURATION));
        flags.forEach((f, idx) => {
          globalStops.push({
            vehicleId: v.id,
            vehicleName: v.vehicleInfo.descripcion || v.fileName,
            vehicleColor: v.color,
            markerIndex: idx,
            timeSeconds: timeToSeconds(f.time),
            type: f.type,
            duration: f.duration || 0,
          });
        });
      });
      if (globalStartTime === 86400) globalStartTime = 28800;
      if (globalEndTime === 0) globalEndTime = 64800;
      currentTimeSeconds = globalStartTime;

      document.getElementById('time-slider').min = globalStartTime;
      document.getElementById('time-slider').max = globalEndTime;
      document.getElementById('label-start').innerText = secondsToTime(globalStartTime);
      document.getElementById('label-end').innerText = secondsToTime(globalEndTime);
    }

    // Funcion para iniciarlizar el mapa
    function initMap() {
      initData();
      let startLat = 25.0, startLng = -100.0;
      if (rawVehicles.length > 0 && rawVehicles[0].tripData.routes[0]?.path.length > 0) {
        startLat = rawVehicles[0].tripData.routes[0].path[0].lat;
        startLng = rawVehicles[0].tripData.routes[0].path[0].lng;
      }
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: startLat, lng: startLng }, zoom: 12,
        mapTypeControl: false, streetViewControl: true, gestureHandling: 'greedy'
      });
      const bounds = new google.maps.LatLngBounds();

      rawVehicles.forEach(v => {
        const state = vehicleState[v.id];
        
        state.polyline = new google.maps.Polyline({ path: [], strokeColor: v.color, strokeOpacity: 0.9, strokeWeight: 5, map });
        const sPos = state.fullPath.length > 0 ? state.fullPath[0] : { lat: startLat, lng: startLng };
        state.marker = new google.maps.Marker({
          position: sPos, map, title: v.vehicleInfo.descripcion || v.fileName,
          icon: {
            path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
            fillColor: v.color, fillOpacity: 2, strokeColor: 'white', strokeWeight: 0, scale: 1.2, anchor: new google.maps.Point(12, 12)
          }
        });
        state.fullPath.forEach(p => bounds.extend(p));

        const flags = (v.tripData.flags || []).filter(f => f.type !== 'stop' || (f.duration && f.duration >= MIN_STOP_DURATION));
        flags.forEach((f, idx) => {
          const mColor = f.type === 'start' ? '#22c55e' : f.type === 'end' ? '#ef4444' : v.color;
          const marker = new google.maps.Marker({
            position: {lat: f.lat, lng: f.lng}, map: null,
            icon: {
              path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
              fillColor: mColor, fillOpacity: 1, strokeColor: 'white', strokeWeight: 0, scale: 1.3, anchor: new google.maps.Point(12, 24)
            }
          });
          
          const coords = f.lat.toFixed(6) + ', ' + f.lng.toFixed(6);
          
          const clientHTML = (f.clientName && f.clientName !== 'Sin coincidencia') 
            ? '<div style="color:#059669; margin:4px 0; font-weight:600;"><p style="margin:0;font-size:12px;"><strong>#' + f.clientKey + '</strong></p><p style="margin:2px 0 0 0;font-size:12px;">' + f.clientName + '</p></div>'
            : '';

          const contentString = '<div style="max-width:280px; padding:0 10px 6px 0;">' +
            '<div style="background:' + v.color + '; color:white; padding:4px 8px; border-radius:4px; margin-bottom:8px; font-size:11px; font-weight:bold;">' + (v.vehicleInfo.descripcion || v.fileName) + '</div>' +
            '<h3 style="font-size:15px; font-weight:500; margin:0 0 8px 0; color:#000;">' + (f.type === 'start' ? 'Inicio' : f.type === 'end' ? 'Fin' : 'Parada ' + f.stopNumber) + '</h3>' +
            (f.type === 'stop' ? '<p style="margin:0 0 4px 0; font-size:12px;"><strong>Duración:</strong> ' + formatDuration(f.duration) + '</p>' : '') +
            '<p style="margin:0 0 4px 0; font-size:12px;"><strong>Hora:</strong> ' + f.time + '</p>' +
            clientHTML +
            '<div class="coords-hover" onclick="copyCoords(\\'' + coords + '\\')">' + coords + '</div>' +
          '</div>';

          const infoWindow = new google.maps.InfoWindow({
            content: contentString
          });
          marker.addListener('click', () => { infoWindows.forEach(iw => iw.close()); infoWindow.open(map, marker); });
          infoWindows.push(infoWindow);
          stopMarkers.push({ marker, vid: v.id });
        });

        const carInfoWindow = new google.maps.InfoWindow({
          content: '<div style="max-width:200px; padding:0 10px 10px 0;">' +
            '<div style="background:' + v.color + '; color:white; padding:4px 8px; border-radius:4px; margin-bottom:8px; font-size:11px; font-weight:bold;">Vehiculo</div>' + 
            '<p style="margin:0 0 4px 0; font-size:12px;"><strong>Nombre:</strong> ' + v.vehicleInfo.descripcion + '</p>' +
            '<p style="margin:0 0 4px 0; font-size:11px; text-overflow:ellipsis; white-space:nowrap;"><strong>Archivo:</strong> ' + v.fileName + '</p>' +
          '</div>'
        });

        state.marker.addListener('click', () => {
          infoWindows.forEach(iw => iw.close());
          carInfoWindow.open(map, state.marker);
        });

        infoWindows.push(carInfoWindow);

        const item = document.createElement('div');
        item.className = 'vehicle-item';
        item.innerHTML = '<div class="vehicle-info"><span class="color-dot" style="background-color:' + v.color + '"></span><span class="vehicle-name" title="' + v.fileName + '">' + (v.vehicleInfo.descripcion || v.fileName) + '</span></div>' +
          '<button class="eye-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>';
        
        item.querySelector('.eye-btn').onclick = () => {
          state.isVisible = !state.isVisible;
          if (state.isVisible) {
            item.classList.remove('hidden-v');
            state.polyline.setMap(map); state.marker.setMap(map);
          } else {
            item.classList.add('hidden-v');
            state.polyline.setMap(null); state.marker.setMap(null);
          }
          if (showMarkers) toggleMarkers(true);
          updateUI();
        };
        document.getElementById('vehicle-list').appendChild(item);
      });

      if (rawVehicles.length > 0) map.fitBounds(bounds);
      updateUI();
    }

    // Funcion para actualizar la interfaz
    function updateUI() {
      const timeStr = secondsToTime(currentTimeSeconds);
      document.getElementById('clock-display').innerText = timeStr;
      document.getElementById('label-current').innerText = timeStr;
      
      const slider = document.getElementById('time-slider');
      slider.value = currentTimeSeconds;
      const pct = ((currentTimeSeconds - globalStartTime) / (globalEndTime - globalStartTime)) * 100 || 0;
      slider.style.background = 'linear-gradient(to right, #10b981 ' + pct + '%, #e5e7eb ' + pct + '%)';

      Object.values(vehicleState).forEach(s => {
        if (!s.isVisible || s.fullPath.length === 0 || !s.polyline || !s.marker) return;

        const t = s.eventSeconds;
        if (currentTimeSeconds <= t[0]) { 
            s.polyline.setPath([s.fullPath[0]]); 
            s.marker.setPosition(s.fullPath[0]); 
            return; 
        }
        if (currentTimeSeconds >= t[t.length-1]) { 
            s.polyline.setPath(s.fullPath); 
            s.marker.setPosition(s.fullPath[s.fullPath.length-1]); 
            return; 
        }
        
        let lo = 0, hi = t.length - 1, idx = -1;
        while (lo <= hi) { 
            const mid = Math.floor((lo+hi)/2); 
            if (t[mid] <= currentTimeSeconds) { idx = mid; lo = mid + 1; } else { hi = mid - 1; } 
        }
        
        const prog = t.length > 1 ? idx / (t.length - 1) : 1;
        const pathIdx = Math.floor(prog * (s.fullPath.length - 1));
        const seg = s.fullPath.slice(0, pathIdx + 1);
        s.polyline.setPath(seg);
        if (seg.length > 0) s.marker.setPosition(seg[seg.length - 1]);

        const timeDelta = currentTimeSeconds - prevTimeSeconds;
        const isManualJump = timeDelta > 360 || timeDelta < 0;

        if (!isManualJump) {
          globalStops
            .filter(stop => stop.vehicleId === s.data.id &&
              stop.timeSeconds > prevTimeSeconds &&
              stop.timeSeconds <= currentTimeSeconds)
            .forEach(stop => {
              const stopKey = stop.vehicleId + '-' + stop.markerIndex;
              if (!notifiedStops.has(stopKey)) {
                notifiedStops.add(stopKey);
                let message = '';
                if (stop.type === 'start') message = 'Inició recorrido';
                else if (stop.type === 'end') message = 'Finalizó recorrido';
                else message = 'Hizo una parada de ' + formatDuration(stop.duration);
                addNotification({
                  id: 'stop-' + stopKey + '-' + Date.now(),
                  vehicleId: stop.vehicleId,
                  vehicleName: stop.vehicleName,
                  vehicleColor: stop.vehicleColor,
                  message,
                  time: secondsToTime(currentTimeSeconds),
                });
              }
            });
        }
      });

      const activos = Object.values(vehicleState)
        .filter(s => s.isVisible && s.marker)
        .map(s => ({
          id: s.data.id,
          nombre: s.data.vehicleInfo.descripcion || s.data.fileName,
          color: s.data.color,
          pos: s.marker.getPosition()
        }));

      if (activos.length >= 3 && activos.length === Object.values(vehicleState).filter(s => s.isVisible).length) {
        let todosCoinciden = true;

        for (let i = 0; i < activos.length; i++) {
          for (let j = i + 1; j < activos.length; j++) {
            const distancia = calculateDistance(
              activos[i].pos.lat(),
              activos[i].pos.lng(),
              activos[j].pos.lat(),
              activos[j].pos.lng()
            );
            if (distancia >= 100) {
              todosCoinciden = false;
              break;
            }
          }
          if (!todosCoinciden) break;
        }

        if (todosCoinciden) {
          const groupKey = activos.map(a => a.id).sort().join('::');

          if (!notifiedCoincidences.has(groupKey)) {
            notifiedCoincidences.add(groupKey);

            const nombres = activos.map(a => a.nombre).join(', ');

            addNotification({
              id: 'coincidencia-' + groupKey + '-' + Date.now(),
              vehicleId: activos[0].id,
              vehicleName: activos[0].nombre,
              vehicleColor: activos[0].color,
              message: 'Vehículos: ' + nombres,
              time: secondsToTime(currentTimeSeconds),
              type: 'coincidence',
            });
          }
        } else {
          notifiedCoincidences.clear();
        }
      }

      prevTimeSeconds = currentTimeSeconds;
    }

    // Funcion del BOTON de ocultar/mostrar lista de vehiculos
    function toggleLegend() {
      const content = document.getElementById('legend-content');
      const btn = document.getElementById('legend-toggle');
      if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed'); btn.style.transform = 'rotate(0deg)';
      } else {
        content.classList.add('collapsed'); btn.style.transform = 'rotate(180deg)';
      }
    }

    // Funcion del BOTON para ocultar/mostrar marcadores
    function toggleMarkers(forceUpdate = false) {
      if (!forceUpdate) showMarkers = !showMarkers;
      const btn = document.getElementById('marker-btn');
      document.getElementById('icon-map-pin').style.display = showMarkers ? 'none' : 'block';
      document.getElementById('icon-map-pin-off').style.display = showMarkers ? 'block' : 'none';
      btn.style.backgroundColor = showMarkers ? '#2563eb' : 'white';
      btn.style.color = showMarkers ? 'white' : '#2563eb';
      
      stopMarkers.forEach(m => {
        const isVVisible = vehicleState[m.vid].isVisible;
        m.marker.setMap((showMarkers && isVVisible) ? map : null);
      });
      if (!showMarkers) infoWindows.forEach(iw => iw.close());
    }

    // Funcion para ajustar el tiempo en el que adelantara/retrocedera los botones
    function setSkipMinutes(val) {
      skipMinutes = val;
      [5, 15, 30].forEach(v => document.getElementById('btn-skip-' + v).classList.remove('active'));
      document.getElementById('btn-skip-' + val).classList.add('active');
      document.querySelectorAll('.skip-val-text').forEach(el => el.innerText = val + ' min');
    }

    // Funcion de BOTONES para retroceder/adelantar tiempo
    function handleSkip(dir) {
      if (isPlaying) { isPlaying = false; syncPlayBtn(); clearInterval(animationInterval); }
      currentTimeSeconds += dir * skipMinutes * 60;
      if (currentTimeSeconds < globalStartTime) currentTimeSeconds = globalStartTime;
      if (currentTimeSeconds > globalEndTime) currentTimeSeconds = globalEndTime;
      if (isFinished && currentTimeSeconds < globalEndTime) { isFinished = false; isPaused = true; }
      updateUI();
    }

    // Funcion para manejar el control deslizante
    function handleScrub(e) {
      if (isPlaying) { isPlaying = false; syncPlayBtn(); clearInterval(animationInterval); }
      currentTimeSeconds = parseInt(e.target.value);
      if (isFinished && currentTimeSeconds < globalEndTime) { isFinished = false; isPaused = true; }
      updateUI();
    }

    // Funcion para alternar la velocidad de movimiento
    function toggleSpeed() {
      playbackSpeed = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : playbackSpeed === 4 ? 0.5 : 1;
      document.getElementById('speed-btn').innerText = 'x' + playbackSpeed.toFixed(1);
    }

    // Funcion para resetear valores
    function handleReset() {
      showResetSpinner();

      notifiedStops.clear();
      notifiedCoincidences.clear();
      prevTimeSeconds = globalStartTime;
      isPlaying = false; isPaused = false; isFinished = false; clearInterval(animationInterval); syncPlayBtn();
      playbackSpeed = 1; document.getElementById('speed-btn').innerText = 'x1.0';
      setSkipMinutes(15);
      currentTimeSeconds = globalStartTime; updateUI();

      const bounds = new google.maps.LatLngBounds();
      Object.values(vehicleState).forEach(state => {
        state.isVisible = true;
        state.polyline.setMap(map);
        state.marker.setMap(map);
        state.fullPath.forEach(p => bounds.extend(p));
      });

      document.querySelectorAll('.vehicle-item').forEach(item => {
        item.classList.remove('hidden-v');
      });
      map.fitBounds(bounds);

      notifications = [];
      renderNotifications();

      addNotification({
        id: 'reset-' + Date.now(),
        vehicleId: '',
        vehicleName: '',
        vehicleColor: '',
        message: 'Todos los valores se han reiniciado correctamente.',
        time: '',
        type: 'reset',
      });
    }

    // Funcion para mostrar el spinner de carga al resetear
    function showResetSpinner() {
      document.getElementById('reset-spinner').style.display = 'flex';
      setTimeout(() => {
        document.getElementById('reset-spinner').style.display = 'none';
      }, 1000);
    }

    // Funcion para sincronizar el boton de inicio/continuar/pausa
    function syncPlayBtn() {
      const btn = document.getElementById('play-pause-btn');
      const text = document.getElementById('play-text');
      document.getElementById('icon-play').style.display = 'none';
      document.getElementById('icon-pause').style.display = 'none';
      document.getElementById('icon-repeat').style.display = 'none';
      btn.className = '';

      if (isPlaying) {
        btn.classList.add('pause-state'); text.innerText = 'Pausar';
        document.getElementById('icon-pause').style.display = 'block';
      } else if (isFinished) {
        btn.classList.add('repeat-state'); text.innerText = 'Repetir';
        document.getElementById('icon-repeat').style.display = 'block';
      } else {
        btn.classList.add('play-state'); text.innerText = isPaused ? 'Continuar' : 'Iniciar Recorrido';
        document.getElementById('icon-play').style.display = 'block';
      }
      
      document.querySelectorAll('.skip-btn').forEach(b => b.disabled = isPlaying);
    }

    // Funcion para manejar el control de inicio y pausa
    function togglePlayPause() {
      if (isPlaying) {
        isPlaying = false; isPaused = true; clearInterval(animationInterval); syncPlayBtn();
      } else {
        if (isFinished) { handleReset(); setTimeout(() => togglePlayPause(), 100); return; }
        isPlaying = true; isPaused = false; syncPlayBtn();
        
        animationInterval = setInterval(() => {
          currentTimeSeconds += 30 * playbackSpeed;
          if (currentTimeSeconds >= globalEndTime) {
            currentTimeSeconds = globalEndTime; isPlaying = false; isFinished = true;
            clearInterval(animationInterval); syncPlayBtn();
          }
          updateUI();
        }, 100);
      }
    }

    // Funcion para agregar notificaciones
    function addNotification(notif) {
      notifications = [notif, ...notifications].slice(0, 4);
      renderNotifications();
      const duration = notif.type === 'coincidence' ? 10000 : 5000;
      setTimeout(() => {
        notifications = notifications.filter((n) => n.id !== notif.id);
        renderNotifications();
      }, duration);
    }

    // Funcion para leer el array de las notificaciones completas
    function renderNotifications() {
      const container = document.getElementById('notifications-container');
      container.innerHTML = '';
      
      const visible = notifications.filter(n => showNotifications || n.type === 'reset');
      
      visible.forEach(notif => {
        const div = document.createElement('div');
        div.style.pointerEvents = 'auto'; 
        let cardHTML = '';

        if (notif.type === 'coincidence') {
          cardHTML = '<div style="pointer-events:auto; background:linear-gradient(to left, #fffbeb, #fef3c7); border-left:4px solid #F54927; border-radius:0 0.5rem 0.5rem 0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); padding:0.75rem 2rem 0.75rem 0.75rem; position:relative; width:256px;">' +
            '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:11px; font-weight:700; color:#111827;">COINCIDENCIA</span>' +
              '</div>' +
              '<span style="font-size:10px; color:#4b5563; font-weight:600;">' + notif.time + '</span>' +
            '</div>' +
            '<p style="font-size:11px; color:#1f2937; font-weight:500; line-height:1.4;">' + notif.message + '</p>' +
            '<button style="position:absolute; top:8px; right:8px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:#ef4444; border-radius:50%; cursor:pointer;">✕</button>' +
          '</div>';

        } else if (notif.type === 'reset') {
          cardHTML = '<div style="pointer-events:auto; background:rgba(255,255,255,0.95); border-left:4px solid #374151; border-radius:0 0.5rem 0.5rem 0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); padding:0.75rem 2rem 0.75rem 0.75rem; position:relative; width:256px;">' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span style="font-size:11px; color:#1f2937; font-weight:500;">' + notif.message + '</span>' +
            '</div>' +
            '<button style="position:absolute; top:8px; right:8px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:#ef4444; border-radius:50%; cursor:pointer;">✕</button>' +
          '</div>';

        } else {
          cardHTML = '<div style="pointer-events:auto; background:rgba(255,255,255,0.95); border-left:4px solid ' + notif.vehicleColor+ '; border-radius:0 0.5rem 0.5rem 0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); padding:0.75rem 2rem 0.75rem 0.75rem; position:relative; width:256px;">' +
            '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">' +
              '<span style="font-size:12px; font-weight:700; color:#1f2937;">' + notif.vehicleName + '</span>' +
              '<span style="font-size:10px; color:#4b5563; font-weight:600;">' + notif.time + '</span>' +
            '</div>' +
            '<p style="font-size:11px; color:#4b5563; font-weight:500; line-height:1.4;">' + notif.message + '</p>' +
            '<button style="position:absolute; top:8px; right:8px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:#ef4444; border-radius:50%; cursor:pointer;">✕</button>' +
          '</div>';
        }

        div.innerHTML = cardHTML;

        div.querySelector('button').addEventListener('click', () => {
          closeNotification(notif.id);
        });

        const btn = div.querySelector('button');

        btn.addEventListener('mouseenter', () => {
          btn.style.backgroundColor = '#fee2e2';
        });

        btn.addEventListener('mouseleave', () => {
          btn.style.backgroundColor = 'transparent';
        });

        container.appendChild(div);
      });
    }

    // Funcion para cerrar notificaciones
    function closeNotification(id) {
      notifications = notifications.filter((n) => n.id !== id);
      renderNotifications();
    }

    // Funcion del BOTON para ocultar/mostrar marcadores
    function toggleNotifications() {
      showNotifications = !showNotifications;
      const btn = document.getElementById('notification-btn');
      document.getElementById('icon-bell').style.display = showNotifications ? 'block' : 'none';
      document.getElementById('icon-bell-off').style.display = showNotifications ? 'none' : 'block';
      btn.style.backgroundColor = showNotifications ? 'white' : '#16a34a';
      btn.style.color = showNotifications ? '#16a34a' : 'white';
      renderNotifications();
    }
  `;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visualizador Multiple</title>
    <style>
        ${styles}
    </style>
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
