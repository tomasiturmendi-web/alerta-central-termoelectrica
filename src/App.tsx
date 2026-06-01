/**
 * CORE APPLICATION CONTAINER
 * ALERTA CENTRAL TERMOELÉCTRICA
 */

import React, { useState, useEffect } from 'react';
import { initialised, db } from './utils/firebase';
import { DispositivoActivo, EstadoAlarma } from './types';
import ControlRoom from './components/ControlRoom';
import ReceiverPhone from './components/ReceiverPhone';
import AndroidPanel from './components/AndroidPanel';
import { ShieldAlert, Laptop, Smartphone, FileCode2, AlertCircle, Info, Siren, Settings } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'worker' | 'control'>('worker');
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(!initialised);
  const [showDeveloperTab, setShowDeveloperTab] = useState<boolean>(false);
  
  // Shared state for single-tab simulator continuity
  const [localAlarmState, setLocalAlarmState] = useState<EstadoAlarma>(() => {
    const saved = localStorage.getItem('sim_alarm_state');
    return (saved === 'ON' || saved === 'OFF') ? saved : 'OFF';
  });
  const [localDevices, setLocalDevices] = useState<Record<string, DispositivoActivo>>(() => {
    try {
      const saved = localStorage.getItem('sim_devices');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Display warning details in case of unconfigured Firebase Database Rules
  const [showConfigTips, setShowConfigTips] = useState<boolean>(false);

  // If Firebase fails to initialize on startup, force simulation mode
  useEffect(() => {
    if (!initialised) {
      setIsSimulatedMode(true);
    }
  }, []);

  // Listen to storage changes to sync tabs in Simulación Segura
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sim_alarm_state' && e.newValue) {
        setLocalAlarmState(e.newValue as EstadoAlarma);
      }
      if (e.key === 'sim_devices' && e.newValue) {
        try {
          setLocalDevices(JSON.parse(e.newValue));
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const updateLocalAlarmState = (nextState: EstadoAlarma) => {
    setLocalAlarmState(nextState);
    localStorage.setItem('sim_alarm_state', nextState);
  };

  const updateLocalDevices = (updater: React.SetStateAction<Record<string, DispositivoActivo>>) => {
    setLocalDevices((prev) => {
      const next = typeof updater === 'function' ? (updater as Function)(prev) : updater;
      localStorage.setItem('sim_devices', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-950">
      
      {/* DECORATIVE TOP STRIP */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-700 via-sky-400 to-emerald-500"></div>

      {/* TOP INDUSTRIAL HEADER NAVBAR */}
      <header className="border-b border-blue-100 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-6 py-4 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-md border border-blue-500 text-white">
              <Siren className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-blue-950 uppercase">
                  Central Termoeléctrica
                </h1>
                <span 
                  onClick={() => setShowDeveloperTab(prev => !prev)}
                  className="text-[10px] bg-sky-50 text-sky-600 font-bold px-2 py-0.5 border border-sky-200 rounded font-mono select-none cursor-pointer hover:bg-sky-100 active:scale-95 transition-all"
                  title="Configuración de Desarrollo"
                >
                  V.1.0
                </span>
              </div>
              <p className="text-blue-900/60 text-xs font-mono font-medium">
                SISTEMA DE ALERTA Y EVACUACIÓN GEOLOCALIZADA
              </p>
            </div>
          </div>

          {/* Engine Fallback Toggle Switches */}
          <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-blue-100 shadow-xs">
            <button
              onClick={() => setIsSimulatedMode(false)}
              disabled={!initialised}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                !isSimulatedMode 
                  ? 'bg-blue-600 text-white shadow-sm font-semibold' 
                  : 'text-slate-500 hover:text-blue-950 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed'
              }`}
              title={!initialised ? "Firebase no inicializado" : "Conectar en línea con Firebase"}
            >
              Uso Firebase Real
            </button>
            <button
              onClick={() => setIsSimulatedMode(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                isSimulatedMode 
                  ? 'bg-amber-600 text-white shadow-sm font-semibold' 
                  : 'text-slate-500 hover:text-blue-950'
              }`}
            >
              Simulación Segura
            </button>
            
            <button
              onClick={() => setShowConfigTips(prev => !prev)}
              className="text-slate-400 hover:text-blue-950 p-1"
              title="Mostrar consejos de base de datos"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* FIREBASE CONFIGURATION GUIDE OR MIMS HELP PANEL (ONLY SHOWS ON CLICK) */}
      {showConfigTips && (
        <div className="max-w-6xl mx-auto w-full px-6 pt-5">
          <div className="bg-sky-50 border border-sky-200 p-5 rounded-2xl flex items-start gap-4 text-blue-900 text-xs shadow-xs">
            <Info className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-bold font-mono uppercase text-blue-950">Configuración de Reglas de Firebase Realtime Database</h4>
              <p className="leading-relaxed text-slate-700">
                Para que la conexión a Firebase Realtime funcione (especialmente desde el botón de la sala y los móviles), asegúrate de haber configurado las siguientes reglas de lectura/escritura pública en la Consola de Firebase del proyecto <span className="text-blue-950 font-mono font-bold">alertacentral-9ba4f</span> para evitar errores de permisos denegados:
              </p>
              <pre className="p-3 bg-slate-100 font-mono rounded-lg text-[10px] text-blue-900 max-w-lg border border-blue-200">
{`{
  "rules": {
    ".read": true,
    ".write": true
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION TABS SELECTOR CONTAINER */}
      <div className="max-w-5xl mx-auto w-full px-6 py-6">
        <div className="flex bg-white p-1 rounded-xl border border-blue-100 shadow-xs">
          <button
            onClick={() => setActiveTab('worker')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'worker' 
                ? 'bg-sky-50 text-blue-700 border border-sky-100 shadow-xs font-extrabold' 
                : 'text-slate-500 hover:text-blue-950'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            <span>Móvil Operario (Receptor)</span>
          </button>

          <button
            onClick={() => setActiveTab('control')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'control' 
                ? 'bg-rose-50 text-rose-700 border border-rose-100 shadow-xs font-extrabold' 
                : 'text-slate-500 hover:text-blue-950'
            }`}
          >
            <Laptop className="h-4 w-4" />
            <span>Sala de Control (Emisor)</span>
          </button>

          {showDeveloperTab && (
            <button
              onClick={() => setActiveTab('android' as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'android' 
                  ? 'bg-amber-50 text-amber-800 border border-amber-100 shadow-xs font-extrabold' 
                  : 'text-slate-500 hover:text-blue-950'
              }`}
            >
              <FileCode2 className="h-4 w-4" />
              <span>Código App Android</span>
            </button>
          )}
        </div>
      </div>

      {/* CORE SCREENS ROUTER VIEW */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pb-12">
        <div className="transition-all duration-300">
          
          {activeTab === 'worker' && (
            <div className="space-y-6">
              <div className="text-center max-w-sm mx-auto">
                <span className="text-[10px] font-mono bg-sky-50 text-sky-600 border border-sky-200 rounded-full px-3 py-1 font-semibold uppercase tracking-widest shadow-xs">
                  Canal de Recepción
                </span>
              </div>
              <ReceiverPhone 
                isSimulatedMode={isSimulatedMode}
                localAlarmState={localAlarmState}
                setLocalAlarmState={updateLocalAlarmState}
                localDevices={localDevices}
                setLocalDevices={updateLocalDevices}
              />
            </div>
          )}

          {activeTab === 'control' && (
            <ControlRoom
              isSimulatedMode={isSimulatedMode}
              localAlarmState={localAlarmState}
              setLocalAlarmState={updateLocalAlarmState}
              localDevices={localDevices}
              setLocalDevices={updateLocalDevices}
            />
          )}

          {showDeveloperTab && activeTab === 'android' && (
            <AndroidPanel />
          )}

        </div>
      </main>

      {/* FOOTER METRICS AND SPECS BRAND */}
      <footer className="border-t border-blue-100 bg-white py-5 text-center mt-auto font-mono text-[10px] text-slate-500 shadow-xs">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            Coordenadas de Planta de Referencia: <span className="text-slate-700 font-bold">-34.903069, -58.733804</span>
          </p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Lanzador de Emergencia de Alta Disponibilidad
          </p>
        </div>
      </footer>


    </div>
  );
}
