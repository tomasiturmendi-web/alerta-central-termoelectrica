import React, { useState, useEffect } from 'react';
import { db, ref, set, onValue, firebaseConfig } from '../utils/firebase';
import { DispositivoActivo, EstadoAlarma, Coords } from '../types';
import { calcularDistancia, formatCoords, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT, DISTANCIA_MAX_METROS } from '../utils/geo';
import { ShieldAlert, RefreshCw, Power, AlertTriangle, Users, MapPin, Radio, Clock, Trash2, UserPlus } from 'lucide-react';

interface ControlRoomProps {
  isSimulatedMode: boolean;
  localAlarmState: EstadoAlarma;
  setLocalAlarmState: (s: EstadoAlarma) => void;
  localDevices: Record<string, DispositivoActivo>;
  setLocalDevices: React.Dispatch<React.SetStateAction<Record<string, DispositivoActivo>>>;
}

export default function ControlRoom({
  isSimulatedMode,
  localAlarmState,
  setLocalAlarmState,
  localDevices,
  setLocalDevices
}: ControlRoomProps) {
  const [alarmState, setAlarmState] = useState<EstadoAlarma>('OFF');
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [devices, setDevices] = useState<Record<string, DispositivoActivo>>({});
  const [viewMode, setViewMode] = useState<'RADAR' | 'PLANO' | 'MAPA'>('MAPA');
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; msg: string; time: string; type: string }>>([
    { id: '1', msg: 'Sistema de control iniciado y calibrado con GPS Central', time: new Date().toLocaleTimeString(), type: 'system' }
  ]);

  // Leaflet references and states
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);
  const mapRef = React.useRef<any>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const markersRef = React.useRef<Record<string, any>>({});
  const centralMarkerRef = React.useRef<any>(null);
  const circleRef = React.useRef<any>(null);

  // Dynamic Leaflet CDN scripts loader
  useEffect(() => {
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    // Append Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    // Append Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || viewMode !== 'MAPA') return;

    const L = (window as any).L;
    if (!L) return;

    // Create Map instance
    const mapInstance = L.map(mapContainerRef.current, {
      center: [LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT],
      zoom: 16,
      zoomControl: true,
      maxZoom: 19
    });

    // Add Esri Satellite Imagery
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Fuente: Ezeiza Satellite'
    }).addTo(mapInstance);

    mapRef.current = mapInstance;

    // High fidelity marker style for the Control Room central station
    const centralIcon = L.divIcon({
      className: 'custom-central-div-icon',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute h-8 w-8 rounded-full bg-cyan-500/35 animate-ping"></div>
          <div class="h-4.5 w-4.5 rounded-full bg-sky-500 border border-white shadow-lg shadow-sky-500/50"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    // Place Central Sala de Control marker
    const centralMarker = L.marker([LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT], { icon: centralIcon })
      .bindPopup(`
        <div class="text-slate-900 font-sans text-xs p-1">
          <b class="text-sm block border-b border-gray-100 pb-1 mb-1 text-cyan-700">SALA DE CONTROL CENTRAL</b>
          <p class="m-0"><b>Latitud:</b> ${LAT_CENTRAL_DEFAULT}</p>
          <p class="m-0"><b>Longitud:</b> ${LON_CENTRAL_DEFAULT}</p>
        </div>
      `)
      .addTo(mapInstance);

    centralMarkerRef.current = centralMarker;

    // Place 500-meter Safety Perimeter Radius
    const limitCircle = L.circle([LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT], {
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.12,
      radius: DISTANCIA_MAX_METROS,
      weight: 1.5,
      dashArray: '5, 5'
    }).addTo(mapInstance);

    circleRef.current = limitCircle;

    // Invalidate size in case parent dimensions reflow after loading tab
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 250);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = {};
    };
  }, [leafletLoaded, viewMode]);

  // Synchronize Active Connected Devices Pins
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const currentMarkers = markersRef.current;
    const deviceIds = Object.keys(devices);

    // Remove obsolete pins
    Object.keys(currentMarkers).forEach((id) => {
      if (!devices[id]) {
        currentMarkers[id].remove();
        delete currentMarkers[id];
      }
    });

    // Create or update device map markers
    deviceIds.forEach((id) => {
      const dev = devices[id];
      const dist = calcularDistancia(dev.lat, dev.lon, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT);
      const isInside = dist <= DISTANCIA_MAX_METROS;

      const markerBg = isInside ? '#10b981' : '#f59e0b'; // Green when inside risk zone, Orange when safe
      const pingBg = isInside ? 'rgba(16, 185, 129, 0.45)' : 'rgba(245, 158, 11, 0.45)';
      const updatedTimeStr = new Date(dev.fecha || Date.now()).toLocaleTimeString();

      const userIcon = L.divIcon({
        className: `custom-user-marker-ref-${id}`,
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute h-6 w-6 rounded-full animate-ping" style="background-color: ${pingBg};"></div>
            <div class="h-3.5 w-3.5 rounded-full border border-slate-950 shadow" style="background-color: ${markerBg};"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const popupHtml = `
        <div style="font-family: inherit;" class="text-slate-900 text-xs p-1">
          <b class="text-xs border-b border-slate-100 block pb-1 mb-1 uppercase font-mono text-slate-800">${dev.nombre || 'Operador'}</b>
          <p class="margin-0 my-0.5"><b>Distancia:</b> ${Math.round(dist)}m a central</p>
          <p class="margin-0 my-0.5"><b>Estado:</b> ${isInside ? '<span class="text-emerald-600 font-bold">ZONA DE RIESGO</span>' : '<span class="text-amber-600 font-semibold">ZONA SEGURA</span>'}</p>
          <p class="margin-0 my-0.5 text-[9px] text-gray-500">Última señal: ${updatedTimeStr}</p>
        </div>
      `;

      if (currentMarkers[id]) {
        currentMarkers[id].setLatLng([dev.lat, dev.lon]);
        currentMarkers[id].setIcon(userIcon);
        currentMarkers[id].getPopup().setContent(popupHtml);
      } else {
        const marker = L.marker([dev.lat, dev.lon], { icon: userIcon })
          .bindPopup(popupHtml)
          .addTo(mapRef.current);
        currentMarkers[id] = marker;
      }
    });
  }, [devices, leafletLoaded, viewMode]);

  // LISTEN TO FIREBASE REALTIME DB OR SAFETY SIMULATOR OUTLETS
  useEffect(() => {
    if (isSimulatedMode || !db) {
      setAlarmState(localAlarmState);
      setDevices(localDevices);
      setDbConnected(false);
      return;
    }

    setDbConnected(true);

    // 1. Listen to estadoAlarma
    const alarmRef = ref(db, 'estadoAlarma');
    const unsubscribeAlarm = onValue(alarmRef, (snapshot) => {
      const state = snapshot.val();
      if (state === 'ON' || state === 'OFF') {
        setAlarmState(state);
        setLocalAlarmState(state);
      }
    }, (error) => {
      console.warn("Firebase Read Permission Denied (checking fallback):", error);
    });

    // 2. Listen to dispositivosActivos
    const devicesRef = ref(db, 'dispositivosActivos');
    const unsubscribeDevices = onValue(devicesRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setDevices(val);
        setLocalDevices(val);
      } else {
        setDevices({});
        setLocalDevices({});
      }
    }, (error) => {
      console.warn("Devices read restricted or empty:", error);
    });

    return () => {
      unsubscribeAlarm();
      unsubscribeDevices();
    };
  }, [isSimulatedMode, localAlarmState, localDevices, setLocalAlarmState, setLocalDevices]);

  // ACTIVATE EMERGENCY TRIGGER
  const triggerAlarm = async (targetState: EstadoAlarma) => {
    const timeStr = new Date().toLocaleTimeString();
    const actionMsg = targetState === 'ON' 
      ? `🔴 ALARMA DE PLANTA INICIADA por el operador de control` 
      : `🟢 ALARMA DE PLANTA DESACTIVADA y restablecida a modo seguro`;

    // Add to local log
    setActivityLogs(prev => [
      { id: Date.now().toString(), msg: actionMsg, time: timeStr, type: targetState === 'ON' ? 'alert' : 'info' },
      ...prev
    ]);

    if (isSimulatedMode || !db) {
      setAlarmState(targetState);
      setLocalAlarmState(targetState);
      return;
    }

    try {
      await set(ref(db, 'estadoAlarma'), targetState);
    } catch (e) {
      console.error("No se pudo escribir en Firebase. Forzando actualización de visor local:", e);
      setAlarmState(targetState);
      setLocalAlarmState(targetState);
    }
  };

  // ADD SIMULATED TEST OPERATOR (TO TEST VISTA ON MAP AND METERS)
  const addSimulatedDevice = async (preset: 'inside' | 'outside') => {
    // Generate UUID
    const randomId = 'sim_' + Math.floor(Math.random() * 10000);
    const names = ['Ing. Gomez (Turbinas)', 'Operario Diaz (Calderas)', 'Téc. Ramirez (Mantenimiento)', 'Ing. Perez (Seguridad)', 'Supervisor Solis'];
    const selectedName = names[Math.floor(Math.random() * names.length)];

    // Coords inside: very near central
    // Coords outside: farther than 500m
    const offsetLat = preset === 'inside' ? 0.0012 : 0.0065;
    const offsetLon = preset === 'inside' ? -0.0015 : 0.0075;

    const testLat = LAT_CENTRAL_DEFAULT + (Math.random() - 0.5) * offsetLat;
    const testLon = LON_CENTRAL_DEFAULT + (Math.random() - 0.5) * offsetLon;

    const newDevice = {
      id: randomId,
      fecha: Date.now(),
      activo: true,
      lat: testLat,
      lon: testLon,
      nombre: selectedName
    };

    const timeStr = new Date().toLocaleTimeString();
    setActivityLogs(prev => [
      { id: Date.now().toString(), msg: `📡 Dispositivo simulado registrado: ${selectedName}`, time: timeStr, type: 'device' },
      ...prev
    ]);

    if (isSimulatedMode || !db) {
      const updated = { ...devices, [randomId]: newDevice };
      setDevices(updated);
      setLocalDevices(updated);
      return;
    }

    try {
      await set(ref(db, `dispositivosActivos/${randomId}`), newDevice);
    } catch (e) {
      console.error("Error al registrar dispositivo en Firebase:", e);
      const updated = { ...devices, [randomId]: newDevice };
      setDevices(updated);
      setLocalDevices(updated);
    }
  };

  // REMOVE ALL INTERACTIVE TEST DEVICES OR SESSIONS
  const clearDevices = async () => {
    setActivityLogs(prev => [
      { id: Date.now().toString(), msg: '🧹 Listado de dispositivos activos depurado de la sesión', time: new Date().toLocaleTimeString(), type: 'info' },
      ...prev
    ]);

    if (isSimulatedMode || !db) {
      setDevices({});
      setLocalDevices({});
      return;
    }

    try {
      await set(ref(db, 'dispositivosActivos'), null);
    } catch (e) {
      console.error("Error al borrar en Firebase:", e);
      setDevices({});
      setLocalDevices({});
    }
  };

  return (
    <div className="font-sans space-y-6 max-w-6xl mx-auto text-slate-850">
      {/* DB STATUS CONTROL BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-blue-100 rounded-xl p-4 gap-4 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100 shadow-xs">
            <Radio className={`h-5 w-5 ${alarmState === 'ON' ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="font-bold text-blue-950 text-sm">Monitor de Conectividad</h3>
            <p className="text-slate-500 text-xs font-mono">
              {isSimulatedMode 
                ? 'Consola local aislada (Pruebas sin red)' 
                : `Firebase RTDB: ${firebaseConfig.databaseURL}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSimulatedMode ? (
            <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              MODO SIMULADOR ACTIVADO
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-150 px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              FIREBASE RTDB CONECTADO
            </span>
          )}
        </div>
      </div>

      {/* EMERGENCY CORE TRIGGERS CONTAINER */}
      <div className="grid md:grid-cols-12 gap-6">
        
        {/* PANEL DE CONTROL CENTRAL DE SIRENAS (LEFT/8-cols) */}
        <div className="md:col-span-7 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between space-y-6 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-danger font-mono text-xs uppercase tracking-wider text-rose-600 font-bold">
              <ShieldAlert className="h-4 w-4" />
              <span>SALA DE CONTROL GENERAL</span>
            </div>
            <h2 className="text-2xl font-bold text-blue-950">Disparo de Alarma por Radiofonía</h2>
            <p className="text-slate-600 text-sm leading-relaxed">
              Al tocar el botón de emergencia se guardará el estado <span className="font-mono text-rose-700 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded font-bold">estadoAlarma = ON</span> en Firebase. 
              Esto transmitirá instantáneamente de manera masiva un push de rescate a los celulares en el radio de 500m.
            </p>
          </div>

          <div className="py-6 flex flex-col items-center justify-center">
            {alarmState === 'ON' ? (
              <div className="relative">
                {/* Visual waves effect */}
                <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-25"></div>
                <div className="absolute inset-0 bg-rose-500 rounded-full animate-pulse-radial opacity-40"></div>
                
                <button
                  onClick={() => triggerAlarm('OFF')}
                  className="relative h-44 w-44 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-lg flex flex-col items-center justify-center shadow-lg shadow-rose-200/50 transition-transform active:scale-95 cursor-pointer"
                >
                  <Power className="h-10 w-10 mb-2 animate-bounce" />
                  <span className="uppercase text-sm tracking-widest font-mono">ALARMA ON</span>
                  <span className="text-[10px] opacity-70 mt-1 font-mono">PRESIONAR APAGAR</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => triggerAlarm('ON')}
                className="h-44 w-44 rounded-full bg-slate-50 hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-300 font-bold text-lg flex flex-col items-center justify-center shadow-sm transition-all active:scale-95 cursor-pointer hover:shadow-md group"
              >
                <AlertTriangle className="h-10 w-10 mb-2 text-rose-600 group-hover:scale-110 transition-transform" />
                <span className="uppercase text-sm tracking-widest font-mono">ACTIVAR</span>
                <span className="text-[10px] text-slate-550 mt-1 font-mono">PUSH INDUSTRIAL</span>
              </button>
            )}
          </div>

          <div className="border-t border-blue-100/65 pt-5 flex items-center justify-between">
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-slate-500 font-medium">Estado Sirena:</span>
              {alarmState === 'ON' ? (
                <span className="bg-rose-50 text-rose-700 border border-rose-200 rounded px-2.5 py-0.5 font-bold font-mono text-xs tracking-wider animate-pulse flex items-center gap-1">
                  🔴 ACTIVO (ON)
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-655 border border-slate-200 rounded px-2.5 py-0.5 font-mono text-xs font-bold">
                  ⚪ INACTIVO (OFF)
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => triggerAlarm('OFF')}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors active:scale-95 cursor-pointer font-bold"
              >
                Resetear Alarma (OFF)
              </button>
            </div>
          </div>
        </div>

        {/* RADAR VISUAL COMPONENT (RIGHT/5-cols) */}
        <div className="md:col-span-5 bg-white border border-blue-100 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-blue-50 pb-3">
            <h3 className="font-bold text-xs text-blue-950 font-mono tracking-wide uppercase">Plano & Posicionamiento</h3>
            <div className="flex bg-slate-50 p-0.5 rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('MAPA')}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors uppercase cursor-pointer ${
                  viewMode === 'MAPA' 
                    ? 'bg-blue-600 text-white font-bold shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Satelital Real
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PLANO')}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors uppercase cursor-pointer ${
                  viewMode === 'PLANO' 
                    ? 'bg-blue-600 text-white font-bold shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Plano CAD
              </button>
              <button
                type="button"
                onClick={() => setViewMode('RADAR')}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors uppercase cursor-pointer ${
                  viewMode === 'RADAR' 
                    ? 'bg-blue-600 text-white font-bold shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Radar GPS
              </button>
            </div>
          </div>

          {/* Map/Radar/CAD Conditional Canvas */}
          {setViewMode && viewMode === 'MAPA' ? (
            <div 
              ref={mapContainerRef} 
              className="w-full h-[280px] rounded-xl border border-blue-100 bg-slate-50 z-10 overflow-hidden relative shadow-inner"
            >
              {!leafletLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-xs font-mono text-slate-500 space-y-2">
                  <div className="animate-spin h-5 w-5 border-2 border-sky-500 border-t-transparent rounded-full"></div>
                  <span>Invocando Servidores Satelitales...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative aspect-square w-full max-w-[280px] mx-auto bg-slate-50 rounded-full border border-blue-100 overflow-hidden flex items-center justify-center">
              {viewMode === 'RADAR' ? (
                <>
                  {/* Compass axis lines */}
                  <div className="absolute inset-x-0 h-[10px] border-b border-dashed border-slate-200"></div>
                  <div className="absolute inset-y-0 w-[10px] border-r border-dashed border-slate-200"></div>
                  
                  {/* Visual ranges circles */}
                  <div className="absolute h-4/5 w-4/5 rounded-full border border-dashed border-sky-200/50"></div>
                  <div className="absolute h-2/5 w-2/5 rounded-full border border-dashed border-sky-100/40"></div>
                  
                  {/* Critical Perimeter 500m Circle */}
                  <div className="absolute h-3/5 w-3/5 rounded-full border-2 border-emerald-500/30 bg-emerald-500/5 animate-pulse"></div>
                  <span className="absolute top-[21%] right-[21%] text-[8px] font-mono text-emerald-600 font-bold opacity-85">LÍMITE 500m</span>
                </>
              ) : (
                <>
                  {/* HIGH FIDELITY SVG BLUEPRINT OF THERMOELECTRIC POWER PLANT (Trace of CAD Drawing) */}
                  <svg className="absolute inset-0 w-full h-full opacity-90 select-none pointer-events-none" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
                    {/* AutoCAD Grid Pattern Background */}
                    <defs>
                      <pattern id="grid-cad" width="15" height="15" patternUnits="userSpaceOnUse">
                        <path d="M 15 0 L 0 0 0 15" fill="none" stroke="#2563eb" strokeWidth="0.15" opacity="0.25" />
                      </pattern>
                    </defs>
                    
                    {/* Pure White CAD Blueprint Canvas */}
                    <rect width="280" height="280" fill="#ffffff" />
                    <rect width="280" height="280" fill="url(#grid-cad)" />

                    {/* Circle border boundary enclosing the blueprint view */}
                    <circle cx="140" cy="140" r="139" fill="none" stroke="#93c5fd" strokeWidth="1.2" />
                    
                    {/* Evacuation perimeter indicator */}
                    <circle cx="140" cy="140" r="115" fill="none" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
                    <text x="140" y="32" fill="#ef4444" fontSize="5.5" fontFamily="monospace" textAnchor="middle" letterSpacing="0.5" fontWeight="bold">LÍMITE COBERTURA DE EVACUACIÓN (500m)</text>

                    {/* Shifting the entire CAD drawing so that yellow turbine room matches (140,140) */}
                    <g transform="translate(-91, -5)">
                      
                      {/* Left Highway and Boundary lines */}
                      <line x1="45" y1="0" x2="45" y2="370" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="4 2" />
                      
                      {/* Curve access roads */}
                      <path d="M 45 195 L 165 195 L 165 240 M 45 205 L 155 205 L 155 240" fill="none" stroke="#94a3b8" strokeWidth="0.85" />
                      
                      {/* Security Entrance booth office */}
                      <rect x="15" y="295" width="18" height="40" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <line x1="15" y1="315" x2="33" y2="315" stroke="#3b82f6" strokeWidth="0.6" opacity="0.5" />

                      {/* Left exhaust towers stack (The tall block with 11 stack valve circles) */}
                      <rect x="120" y="25" width="16" height="105" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.85" />
                      <line x1="120" y1="45" x2="136" y2="45" stroke="#93c5fd" strokeWidth="0.55" opacity="0.4" />
                      <line x1="120" y1="70" x2="136" y2="70" stroke="#93c5fd" strokeWidth="0.55" opacity="0.4" />
                      <line x1="120" y1="95" x2="136" y2="95" stroke="#93c5fd" strokeWidth="0.55" opacity="0.4" />
                      <line x1="120" y1="120" x2="136" y2="120" stroke="#93c5fd" strokeWidth="0.55" opacity="0.4" />
                      
                      {/* 11 exhaust manifold circles lined up inside */}
                      <circle cx="128" cy="32" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="41" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="50" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="59" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="68" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="77" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="86" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="95" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="104" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="113" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      <circle cx="128" cy="122" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
                      
                      <text x="128" y="14" fill="#1e3a8a" fontSize="5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">CHIMENEA</text>

                      {/* Left Admin / Office blocks */}
                      <rect x="110" y="150" width="45" height="35" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <line x1="110" y1="168" x2="155" y2="168" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5" />
                      
                      <rect x="115" y="215" width="45" height="35" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <circle cx="137.5" cy="232.5" r="5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5" />

                      {/* Upper Boilers Block A (Thermo Boiler Systems) */}
                      <rect x="175" y="32" width="42" height="42" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.85" />
                      <circle cx="196" cy="53" r="10" fill="none" stroke="#3b82f6" strokeWidth="0.6" strokeDasharray="2 1" />
                      <rect x="180" y="37" width="32" height="32" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.4" />
                      <text x="196" y="25" fill="#1e3a8a" fontSize="5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">CALDERA A</text>

                      {/* Upper Boilers Block B */}
                      <rect x="175" y="85" width="42" height="42" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.85" />
                      <circle cx="196" cy="106" r="10" fill="none" stroke="#3b82f6" strokeWidth="0.6" strokeDasharray="2 1" />
                      <rect x="180" y="90" width="32" height="32" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.4" />
                      <text x="196" y="80" fill="#1e3a8a" fontSize="5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">CALDERA B</text>

                      {/* Steam routing system line manifold header */}
                      <path d="M 196 74 L 196 85" stroke="#2563eb" strokeWidth="1" />
                      <path d="M 217 53 L 231 53 L 231 130" fill="none" stroke="#2563eb" strokeWidth="1" />
                      <path d="M 217 106 L 231 106" stroke="#2563eb" strokeWidth="1" />
                      
                      {/* Auxiliary Boiler Systems beneath B */}
                      <rect x="175" y="138" width="42" height="22" fill="#f1f5f9" stroke="#3b82f6" strokeWidth="0.8" />
                      <line x1="175" y1="149" x2="217" y2="149" stroke="#3b82f6" strokeWidth="0.5" />

                      {/* THE CENTRAL STEAM TURBINE & THE GLOWING YELLOW BLUIPRINT HIGHLIGHT */}
                      <rect x="226" y="110" width="18" height="60" fill="#eff6ff" stroke="#3b82f6" strokeWidth="0.9" />
                      <line x1="226" y1="125" x2="244" y2="125" stroke="#3b82f6" strokeWidth="0.5" />
                      <line x1="226" y1="155" x2="244" y2="155" stroke="#3b82f6" strokeWidth="0.5" />
                      
                      {/* SOLID YELLOW SEMI-TRANSPARENT GLOW */}
                      <rect 
                        x="226" 
                        y="132" 
                        width="18" 
                        height="21" 
                        fill="#eab308" 
                        fillOpacity="0.40" 
                        stroke="#facc15" 
                        strokeWidth="1.3" 
                        className="animate-pulse" 
                      />
                      <text x="235" y="104" fill="#b45309" fontSize="5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">SALA MOTOR</text>

                      {/* Electric substation grid (Right side transformer boxes) */}
                      <rect x="254" y="112" width="28" height="56" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <circle cx="268" cy="126" r="4.5" fill="none" stroke="#d97706" strokeWidth="0.5" opacity="0.6" />
                      <circle cx="268" cy="142" r="4.5" fill="none" stroke="#d97706" strokeWidth="0.5" opacity="0.6" />
                      <circle cx="268" cy="154" r="4.5" fill="none" stroke="#d97706" strokeWidth="0.5" opacity="0.6" />
                      
                      {/* Grid wires leaving site rightside */}
                      <path d="M 282 126 L 370 126 M 282 142 L 370 142 M 282 154 L 370 154" stroke="#d97706" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.5" />
                      <text x="295" y="119" fill="#d97706" fontSize="4.5" fontFamily="monospace" opacity="0.6">NODO RETE</text>

                      {/* Middle Plant Process structures */}
                      <rect x="175" y="172" width="107" height="65" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <text x="228" y="208" fill="#1e40af" fontSize="6.5" fontFamily="monospace" textAnchor="middle" opacity="0.4">PROCESO CENTRAL</text>
                      <path d="M 190 172 L 190 237 M 240 172 L 240 237" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.5" />

                      <rect x="175" y="246" width="107" height="52" fill="#f8fafc" stroke="#3b82f6" strokeWidth="0.8" />
                      <line x1="175" y1="272" x2="282" y2="272" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5" />

                      {/* BOTTOM CONDENSER DECK FAN ARRAY (The long structure with 9 circles) */}
                      <rect x="165" y="310" width="120" height="17" fill="#f8fafc" stroke="#3b82f6" strokeWidth="1" />
                      
                      {/* 9 cooling fan circle blades */}
                      <g opacity="0.85" stroke="#3b82f6" strokeWidth="0.5" fill="none">
                        {/* Fan 1 */}
                        <circle cx="171.5" cy="318.5" r="4" />
                        <line x1="169" y1="316" x2="174" y2="321" />
                        <line x1="174" y1="316" x2="169" y2="321" />

                        {/* Fan 2 */}
                        <circle cx="183.5" cy="318.5" r="4" />
                        <line x1="181" y1="316" x2="186" y2="321" />
                        <line x1="186" y1="316" x2="181" y2="321" />

                        {/* Fan 3 */}
                        <circle cx="195.5" cy="318.5" r="4" />
                        <line x1="193" y1="316" x2="198" y2="321" />
                        <line x1="198" y1="316" x2="193" y2="321" />

                        {/* Fan 4 */}
                        <circle cx="207.5" cy="318.5" r="4" />
                        <line x1="205" y1="316" x2="210" y2="321" />
                        <line x1="210" y1="316" x2="205" y2="321" />

                        {/* Fan 5 */}
                        <circle cx="219.5" cy="318.5" r="4" />
                        <line x1="217" y1="316" x2="222" y2="321" />
                        <line x1="222" y1="316" x2="217" y2="321" />

                        {/* Fan 6 */}
                        <circle cx="231.5" cy="318.5" r="4" />
                        <line x1="229" y1="316" x2="234" y2="321" />
                        <line x1="234" y1="316" x2="229" y2="321" />

                        {/* Fan 7 */}
                        <circle cx="243.5" cy="318.5" r="4" />
                        <line x1="241" y1="316" x2="246" y2="321" />
                        <line x1="246" y1="316" x2="241" y2="321" />

                        {/* Fan 8 */}
                        <circle cx="255.5" cy="318.5" r="4" />
                        <line x1="253" y1="316" x2="258" y2="321" />
                        <line x1="258" y1="316" x2="253" y2="321" />

                        {/* Fan 9 */}
                        <circle cx="267.5" cy="318.5" r="4" />
                        <line x1="265" y1="316" x2="270" y2="321" />
                        <line x1="270" y1="316" x2="265" y2="321" />
                      </g>
                      
                      <text x="225" y="337" fill="#1e3a8a" fontSize="5" fontFamily="monospace" textAnchor="middle" opacity="0.6" fontWeight="bold" letterSpacing="0.2">DECK ENFRIADORES CONDENSACIÓN</text>
                    </g>
                  </svg>
                </>
              )}
              
              {/* Central Tower Target dot - ALIGNED PERFECTLY WITH THE CYAN ANCHOR */}
              <div className="absolute h-3.5 w-3.5 bg-blue-600 rounded-full border border-white flex items-center justify-center shadow-lg shadow-blue-500/50 z-20">
                <span className="absolute h-6 w-6 rounded-full bg-blue-400 border border-blue-400/40 animate-ping opacity-60"></span>
              </div>
              
              {/* Interactive device mapped dots */}
              {Object.keys(devices).map((tokenId) => {
                const dev = devices[tokenId];
                const dist = calcularDistancia(dev.lat, dev.lon, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT);
                
                // Scale coordinates to SVG boundaries:
                // Let's assume max scale represents 1000m. Central is center (0,0).
                // dx, dy coordinates relative to central in meters
                const dx = (dev.lon - LON_CENTRAL_DEFAULT) * 111320 * Math.cos(LAT_CENTRAL_DEFAULT * Math.PI / 180);
                const dy = (dev.lat - LAT_CENTRAL_DEFAULT) * 111320;

                // Scale factor: radar radius is 140px. At dx=500m, let's make it 30% of radius (42px).
                // So Scale = 0.084 pixels/meter. Let's clamp positions so they don't render fuera are.
                const scale = 0.09;
                let px = dx * scale;
                let py = -dy * scale; // invert y for SVG compass standard

                // Clamp inside radar circle of radius 130px
                const r = Math.sqrt(px*px + py*py);
                if (r > 125) {
                  px = (px / r) * 125;
                  py = (py / r) * 125;
                }

                const isInside = dist <= DISTANCIA_MAX_METROS;

                return (
                  <div
                    key={tokenId}
                    style={{
                      transform: `translate(${px}px, ${py}px)`
                    }}
                    className="absolute h-3.5 w-3.5 rounded-full border-2 border-white flex items-center justify-center z-10 group shadow-xs cursor-pointer"
                  >
                    <span className={`absolute h-2 w-2 rounded-full ${isInside ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className={`absolute inset-0 rounded-full animate-ping opacity-70 ${isInside ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    
                    {/* Tooltip on Hover */}
                    <div className="hidden group-hover:block absolute bottom-5 bg-blue-950 border border-blue-800 px-2.5 py-1 rounded-lg text-[10px] font-mono text-white whitespace-nowrap z-50 shadow-md">
                      <p className="font-bold">{dev.nombre || 'Operario'}</p>
                      <p>{Math.round(dist)}m de central</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-slate-50 p-2.5 rounded-lg border border-blue-50 text-center">
            <p className="text-[11px] text-slate-600 font-mono font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5"></span>
              En Zona Riesgo (&lt;500m)
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ml-4 mr-1.5"></span>
              En Zona Segura (&gt;500m)
            </p>
          </div>
        </div>
      </div>

      {/* DISPOSITIVOS Y PANEL DE HERRAMIENTAS DE PRUEBA (BOTTOM ROW) */}
      <div className="grid md:grid-cols-12 gap-6">
        
        {/* DISPOSITIVOS TRANSMITIENDO TELEMETRÍA (LEFT/7-cols) */}
        <div className="md:col-span-8 bg-white border border-blue-100 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-blue-50 pb-3">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-slate-500" />
              <h3 className="font-bold text-blue-950 text-base">Terminales Registrados y Georeferenciados</h3>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200/50 font-mono px-2.5 py-0.5 rounded-full font-bold shadow-xs">
              {Object.keys(devices).length} Activos
            </span>
          </div>

          {Object.keys(devices).length === 0 ? (
            <div className="py-10 text-center text-slate-400 space-y-2">
              <MapPin className="h-10 w-10 mx-auto opacity-30 text-sky-500 animate-bounce" />
              <p className="text-sm font-semibold text-slate-500">No hay dispositivos enlazados con geolocalización</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed text-slate-500">
                Los teléfonos subirán sus coordenadas automáticamente al apretar "CONECTAR" en la pestaña para operarios, o puedes agregar operarios virtuales mediante el simulador.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-blue-100 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 font-bold">Operario / ID</th>
                    <th className="py-2.5 font-bold">Ubicación GPS</th>
                    <th className="py-2.5 font-bold text-center">Distancia a Central</th>
                    <th className="py-2.5 font-bold text-right text-rose-600">¿Recibe Sirena?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {Object.keys(devices).map((key) => {
                    const dev = devices[key];
                    const dist = calcularDistancia(dev.lat, dev.lon, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT);
                    const isInside = dist <= DISTANCIA_MAX_METROS;
                    const timeAgo = new Date(dev.fecha).toLocaleTimeString();

                    return (
                      <tr key={key} className="text-slate-700 hover:bg-slate-50/55 transition-colors">
                        <td className="py-3">
                          <p className="font-bold text-blue-950">{dev.nombre || `Operario-${key.slice(0, 5)}`}</p>
                          <span className="text-[10px] text-slate-400">ID: {key.slice(0, 16)}...</span>
                        </td>
                        <td className="py-3">
                          <p className="text-xs font-semibold text-slate-800">{formatCoords(dev.lat, dev.lon)}</p>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Transmitió: {timeAgo}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold border ${isInside ? 'bg-rose-50 text-rose-600 border-rose-150 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {Math.round(dist)} metros
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {isInside ? (
                            <span className="text-rose-600 font-bold animate-pulse">SÍ (SIRENA SONANDO)</span>
                          ) : (
                            <span className="text-slate-400 font-semibold">Fuera del radio</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* SIMULATOR DEVICE CREATOR CONTROL */}
          <div className="bg-slate-50 p-4 rounded-xl border border-blue-100 flex flex-col lg:flex-row items-center justify-between gap-3 pt-4">
            <span className="text-xs text-slate-600 font-mono font-medium flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-emerald-600" />
              Inyección de Operarios Virtuales de Prueba:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => addSimulatedDevice('inside')}
                className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 cursor-pointer shadow-xs"
              >
                + Operario DENTRO (300m)
              </button>
              <button
                onClick={() => addSimulatedDevice('outside')}
                className="bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100/90 text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 cursor-pointer shadow-xs"
              >
                + Operario FUERA (800m)
              </button>
              <button
                onClick={clearDevices}
                className="bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-250 hover:border-rose-200 text-slate-500 text-[11px] font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all active:scale-95 cursor-pointer font-bold shadow-xs"
                title="Limpiar base de datos"
              >
                <Trash2 className="h-3 w-3" />
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* BITÁCORA DE ACTIVIDAD (RIGHT/5-cols) */}
        <div className="md:col-span-4 bg-white border border-blue-100 rounded-xl p-6 flex flex-col space-y-4 shadow-xs">
          <div className="flex items-center space-x-2 border-b border-blue-50 pb-3">
            <Clock className="h-5 w-5 text-slate-500" />
            <h3 className="font-bold text-blue-950">Bitácora de Eventos</h3>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[290px] space-y-3 pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {activityLogs.map((log) => (
              <div key={log.id} className="text-[11px] border-b border-blue-50 pb-2 flex items-start gap-1.5">
                <span className="text-slate-400 font-mono flex-shrink-0">[{log.time}]</span>
                <span className={`font-sans leading-relaxed ${
                  log.type === 'alert' ? 'text-rose-600 font-bold' : 
                  log.type === 'device' ? 'text-sky-600 font-semibold' : 'text-slate-500'
                }`}>
                  {log.msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
