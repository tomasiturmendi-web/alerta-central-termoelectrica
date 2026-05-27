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
  const [localAlarmState, setLocalAlarmState] = useState<EstadoAlarma>('OFF');
  const [localDevices, setLocalDevices] = useState<Record<string, DispositivoActivo>>({});

  // Display warning details in case of unconfigured Firebase Database Rules
  const [showConfigTips, setShowConfigTips] = useState<boolean>(false);

  // If Firebase fails to initialize on startup, force simulation mode
  useEffect(() => {
    if (!initialised) {
      setIsSimulatedMode(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500/30 selection:text-white">
      
      {/* DECORATIVE TOP STRIP */}
      <div className="h-1 w-full bg-gradient-to-r from-rose-600 via-amber-500 to-sky-600"></div>

      {/* TOP INDUSTRIAL HEADER NAVBAR */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-md border border-blue-500 text-white">
              <Siren className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white uppercase">
                  Central Termoeléctrica
                </h1>
                <span 
                  onClick={() => setShowDeveloperTab(prev => !prev)}
                  className="text-[10px] bg-sky-955 text-sky-400 font-bold px-2 py-0.5 border border-sky-900 rounded font-mono select-none cursor-pointer hover:bg-sky-900 active:scale-95 transition-all"
                  title="Configuración de Desarrollo"
                >
                  V.1.0
                </span>
              </div>
              <p className="text-gray-400 text-xs font-mono">
                SISTEMA DE ALERTA Y EVACUACIÓN GEOLOCALIZADA
              </p>
            </div>
          </div>

          {/* Engine Fallback Toggle Switches */}
          <div className="flex items-center gap-3 bg-slate-900 p-1.5 rounded-xl border border-slate-850">
            <button
              onClick={() => setIsSimulatedMode(false)}
              disabled={!initialised}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                !isSimulatedMode 
                  ? 'bg-sky-600 text-white shadow-sm font-semibold' 
                  : 'text-gray-400 hover:text-slate-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
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
                  : 'text-gray-400 hover:text-slate-200'
              }`}
            >
              Simulación Segura
            </button>
            
            <button
              onClick={() => setShowConfigTips(prev => !prev)}
              className="text-gray-500 hover:text-white p-1"
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
          <div className="bg-sky-950/20 border border-sky-900/40 p-5 rounded-2xl flex items-start gap-4 text-sky-200 text-xs">
            <Info className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-bold font-mono uppercase text-sky-400">Configuración de Reglas de Firebase Realtime Database</h4>
              <p className="leading-relaxed">
                Para que la conexión a Firebase Realtime funcione (especialmente desde el botón de la sala y los móviles), asegúrate de haber configurado las siguientes reglas de lectura/escritura pública en la Consola de Firebase del proyecto <span className="text-white font-mono">alertacentral-9ba4f</span> para evitar errores de permisos denegados:
              </p>
              <pre className="p-3 bg-slate-950 font-mono rounded-lg text-[10px] text-sky-300 max-w-lg border border-slate-850">
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
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-850 shadow-inner">
          <button
            onClick={() => setActiveTab('worker')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'worker' 
                ? 'bg-slate-800 text-sky-400 border border-slate-750/70 shadow-md font-extrabold' 
                : 'text-gray-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            <span>Móvil Operario (Receptor)</span>
          </button>

          <button
            onClick={() => setActiveTab('control')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'control' 
                ? 'bg-slate-800 text-rose-400 border border-slate-750/70 shadow-md font-extrabold' 
                : 'text-gray-400 hover:text-slate-200'
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
                  ? 'bg-slate-800 text-amber-500 border border-slate-750/70 shadow-md font-extrabold' 
                  : 'text-gray-400 hover:text-slate-200'
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
                <span className="text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-900 rounded-full px-3 py-1 font-semibold uppercase tracking-widest">
                  Canal de Recepción
                </span>
              </div>
              <ReceiverPhone 
                isSimulatedMode={isSimulatedMode}
                localAlarmState={localAlarmState}
                setLocalAlarmState={setLocalAlarmState}
                localDevices={localDevices}
                setLocalDevices={setLocalDevices}
              />
            </div>
          )}

          {activeTab === 'control' && (
            <ControlRoom
              isSimulatedMode={isSimulatedMode}
              localAlarmState={localAlarmState}
              setLocalAlarmState={setLocalAlarmState}
              localDevices={localDevices}
              setLocalDevices={setLocalDevices}
            />
          )}

          {showDeveloperTab && activeTab === 'android' && (
            <AndroidPanel />
          )}

        </div>
      </main>

      {/* FOOTER METRICS AND SPECS BRAND */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-center mt-auto font-mono text-[10px] text-gray-500">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            Coordenadas de Planta de Referencia: <span className="text-gray-400 font-bold">-34.903069, -58.733804</span>
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
