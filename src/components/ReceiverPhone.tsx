import React, { useState, useEffect, useRef } from 'react';
import { db, ref, set, onValue } from '../utils/firebase';
import { EstadoAlarma, DispositivoActivo } from '../types';
import { calcularDistancia, formatCoords, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT, DISTANCIA_MAX_METROS } from '../utils/geo';
import { ShieldAlert, Compass, Volume2, VolumeX, MapPin, CheckCircle, Navigation, Radio, Smartphone, HelpCircle } from 'lucide-react';

interface ReceiverPhoneProps {
  isSimulatedMode: boolean;
  localAlarmState: EstadoAlarma;
  setLocalAlarmState: (s: EstadoAlarma) => void;
  localDevices: Record<string, DispositivoActivo>;
  setLocalDevices: React.Dispatch<React.SetStateAction<Record<string, DispositivoActivo>>>;
}

export default function ReceiverPhone({
  isSimulatedMode,
  localAlarmState,
  setLocalAlarmState,
  localDevices,
  setLocalDevices
}: ReceiverPhoneProps) {
  const [alarmState, setAlarmState] = useState<EstadoAlarma>('OFF');
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('Mi Teléfono de Campo');
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  
  // Real GPS or simulated coordinates
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsSource, setGpsSource] = useState<'REAL' | 'MOCK_INSIDE' | 'MOCK_OUTSIDE' | 'NONE'>('NONE');

  // Audio elements & Vibration Loop handlers
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isVibrating, setIsVibrating] = useState<boolean>(false);

  // Web Audio API Synthesizer for High-Penetration Modulated Siren (~80 dB depending on device speaker)
  const [soundType, setSoundType] = useState<'SYNTH_SIREN' | 'OGG_BEEP'>('SYNTH_SIREN');
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);

  const startSynthSiren = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Stop any existing oscillator just in case
      stopSynthSiren();

      // Master Gain Node set to drive phone speaker channel to maximum threshold
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(audioMuted ? 0 : 1.0, ctx.currentTime);
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      // Two detuned waveforms to prevent destructive interference and create a dense grating sound
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      
      // Grating waveforms (sawtooth and square) generate high odd-harmonic frequency spectrum
      // This is scientifically designed to yield maximum physical loudness on tiny mobile speakers.
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.setValueAtTime(885, ctx.currentTime);

      // Low frequency oscillator (LFO) to modulated pitch sweep (the classic distress siren rise/fall)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2.2, ctx.currentTime); // 2.2 sweeps per second

      // Gain of modulator determines scope of pitch excursion (+/- 280 Hz)
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(280, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      // Route audio signals through control chain
      osc1.connect(masterGain);
      osc2.connect(masterGain);

      // Boot synthesizers
      osc1.start();
      osc2.start();
      lfo.start();

      oscillatorsRef.current = [osc1, osc2, lfo];
    } catch (e) {
      console.warn("Speech/WebAudio Synth blocked or unsupported by this browser sandbox:", e);
    }
  };

  const stopSynthSiren = () => {
    if (oscillatorsRef.current.length > 0) {
      oscillatorsRef.current.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (err) {}
      });
      oscillatorsRef.current = [];
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (err) {}
      gainNodeRef.current = null;
    }
  };

  // 1. Generate/load UUID on startup
  useEffect(() => {
    let uuid = localStorage.getItem('alert_device_uuid');
    if (!uuid) {
      uuid = 'dev_' + Math.floor(Math.random() * 1000000);
      localStorage.setItem('alert_device_uuid', uuid);
    }
    setDeviceUuid(uuid);

    const savedName = localStorage.getItem('alert_device_name');
    if (savedName) {
      setDeviceName(savedName);
    }
  }, []);

  // 2. Listen to Alarm state updates from database or parent
  useEffect(() => {
    if (isSimulatedMode || !db) {
      setAlarmState(localAlarmState);
      return;
    }

    const alarmRef = ref(db, 'estadoAlarma');
    const unsubscribe = onValue(alarmRef, (snapshot) => {
      const state = snapshot.val();
      if (state === 'ON' || state === 'OFF') {
        setAlarmState(state);
        setLocalAlarmState(state);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isSimulatedMode, localAlarmState, setLocalAlarmState]);

  // Recalculate distance when coords change
  useEffect(() => {
    if (coords) {
      const dist = calcularDistancia(coords.lat, coords.lon, LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT);
      setDistance(dist);
    } else {
      setDistance(null);
    }
  }, [coords]);

  // 3. CORE ACTION: EMERGENCY ALARM LOOP (Vibration and Loud sirens)
  const isAlarmTriggered = alarmState === 'ON' && distance !== null && distance <= DISTANCIA_MAX_METROS;

  useEffect(() => {
    if (isAlarmTriggered) {
      // Activar sirena según tipología seleccionada
      if (soundType === 'OGG_BEEP') {
        if (audioRef.current) {
          audioRef.current.loop = true;
          audioRef.current.volume = audioMuted ? 0 : 1.0;
          audioRef.current.play().catch(e => {
            console.log("Audio waiting for user gesture interaction...", e);
          });
        }
        stopSynthSiren();
      } else {
        // Detener reproductor tradicional, reproducir sintetizador de 80 decibelios ópticos
        if (audioRef.current) {
          audioRef.current.pause();
        }
        startSynthSiren();
      }

      // Activar vibración recursiva (patrón de sirena industrial dura)
      if ('vibrate' in navigator) {
        setIsVibrating(true);
        navigator.vibrate([600, 300, 600, 300, 1000]);
        
        vibrationIntervalRef.current = setInterval(() => {
          navigator.vibrate([600, 300, 600, 300, 1000]);
        }, 3200);
      }
    } else {
      // Detener sirena
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      stopSynthSiren();

      // Detener vibración
      if (vibrationIntervalRef.current) {
        clearInterval(vibrationIntervalRef.current);
        vibrationIntervalRef.current = null;
      }
      if ('vibrate' in navigator) {
        navigator.vibrate(0);
      }
      setIsVibrating(false);
    }

    return () => {
      if (vibrationIntervalRef.current) {
        clearInterval(vibrationIntervalRef.current);
      }
      stopSynthSiren();
    };
  }, [isAlarmTriggered, audioMuted, soundType]);

  // REGISTER PHONE WITH GEOLOCATION ON DATABASE
  const registerDeviceState = async (coordinates: { lat: number; lon: number }) => {
    if (!deviceUuid) return;

    const payload = {
      id: deviceUuid,
      fecha: Date.now(),
      activo: true,
      lat: coordinates.lat,
      lon: coordinates.lon,
      nombre: deviceName
    };

    if (isSimulatedMode || !db) {
      const updated = { ...localDevices, [deviceUuid]: payload };
      setLocalDevices(updated);
      return;
    }

    try {
      await set(ref(db, `dispositivosActivos/${deviceUuid}`), payload);
    } catch (e) {
      console.error("No se pudo escribir registro de dispositivo en base de datos. Usando memoria local.");
      const updated = { ...localDevices, [deviceUuid]: payload };
      setLocalDevices(updated);
    }
  };

  // RETRIEVE REAL DEVICE HIGH-ACCURACY GPS
  const requestRealGps = () => {
    setChecking(true);
    
    // Unblock browser media players
    if (audioRef.current) {
      audioRef.current.play().then(() => audioRef.current?.pause()).catch(() => {});
    }

    if (!navigator.geolocation) {
      alert("Tu navegador o teléfono móvil no otorga soporte nativo de geolocalización GPS.");
      setChecking(false);
      return;
    }

    // Attempt to read location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const freshCoords = { lat: latitude, lon: longitude };
        
        setCoords(freshCoords);
        setGpsSource('REAL');
        setChecking(false);
        setIsJoined(true);
        registerDeviceState(freshCoords);

        // Prompt notification permissions for background worker fallback
        if ('Notification' in window) {
          Notification.requestPermission();
        }
      },
      (error) => {
        setChecking(false);
        alert(`Ocurrió un error al leer el GPS nativo: ${error.message}. Por favor, activa la localización de Alta Precisión o utiliza un simulador de ubicación.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // MOCK COORDINATE LOADER (ESSENTIAL FOR TESTING SINCE PHYSICAL DEVICE COORDINATES WILL BE OUTSIDE BUENOS AIRES POWER PLANT RAILS)
  const setMockCoords = (preset: 'inside' | 'outside') => {
    setChecking(true);
    
    // Unblock browser audio engines
    if (audioRef.current) {
      audioRef.current.play().then(() => audioRef.current?.pause()).catch(() => {});
    }

    // Inside central: Ezeiza Central coordinates with minor offsets
    const simulatedCoords = preset === 'inside'
      ? { lat: -34.903125, lon: -58.733795 } // ~10 meters distance
      : { lat: -34.603722, lon: -58.381555 }; // ~40km away, downtown Buenos Aires

    setTimeout(() => {
      setCoords(simulatedCoords);
      setGpsSource(preset === 'inside' ? 'MOCK_INSIDE' : 'MOCK_OUTSIDE');
      setChecking(false);
      setIsJoined(true);
      registerDeviceState(simulatedCoords);
    }, 600);
  };

  // MUTING TOGGLE HANDLE
  const toggleMute = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(nextMuted ? 0 : 1.0, audioContextRef.current.currentTime);
    }
  };

  return (
    <div className="font-sans max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
      
      {/* BACKGROUND ALARM OVERLAY (ACTIVES ONCE STATE IN DATABASE IS "ON" AND WORKER LOCATION COORDS ARE INSIDE RADIUS) */}
      {isAlarmTriggered && (
        <div className="absolute inset-0 bg-red-600 animate-parpadeo z-50 flex flex-col justify-between p-6 text-white text-center">
          <div className="space-y-4 pt-10">
            <div className="inline-block bg-white p-3 rounded-full text-red-600 animate-bounce">
              <ShieldAlert className="h-12 w-12" />
            </div>
            <h1 className="text-4xl font-extrabold font-sans tracking-tighter text-white uppercase">
              EMERGENCIA DE PLANTA
            </h1>
            <p className="bg-red-900/60 inline-block px-4 py-1.5 rounded-full font-mono text-xs text-red-200 border border-red-500 animate-pulse">
              DENTRO DE ZONA DE RIESGO
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold leading-tight">
              EVACUAR INMEDIATAMENTE AL PUNTO DE ENCUENTRO
            </h2>
            <p className="text-red-100 text-sm opacity-90">
              Siga las rutas marcadas y deje despejadas las calzadas de ingreso de bomberos. Mantenga la calma.
            </p>
          </div>

          <div className="space-y-4 pb-8">
            <div className="bg-red-950/45 p-3 rounded-xl border border-red-500/20 text-xs font-mono flex items-center justify-between">
              <span>Sirena de Evacuación:</span>
              <button 
                onClick={toggleMute}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all text-white active:scale-95 cursor-pointer"
              >
                {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-emerald-300 animate-pulse" />}
              </button>
            </div>

            <div className="p-3 bg-red-950/60 rounded-xl space-y-1">
              <p className="text-[10px] text-red-300 font-mono">DISTANCIA CALCULADA:</p>
              <p className="text-xl font-bold font-mono">{distance ? `${Math.round(distance)} metros` : '---'} a la Central</p>
            </div>

            <button 
              onClick={() => {
                // Silenciar sirenas y volver temporalmente
                setAudioMuted(true);
                alert("Para apagar definitivamente la sirena un operador en Sala de Control debe desactivar el botón.");
              }}
              className="w-full bg-white text-red-600 hover:bg-red-50 font-bold py-3.5 rounded-xl uppercase tracking-wider text-sm shadow-md transition-transform active:scale-95 cursor-pointer"
            >
              Entendido / Silenciar Sirena
            </button>
          </div>
        </div>
      )}

      {/* AUDIO ELEMENT CONTAINING LOOPS SIRENS */}
      <audio 
        ref={audioRef} 
        src="https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg" 
        loop 
      />

      {/* HEADER DISPLAY DEVICE */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Smartphone className="h-5 w-5 text-sky-400" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-gray-500 tracking-wide uppercase">VISTA TERMINAL MÓVIL</span>
              <span className={`h-1.5 w-1.5 rounded-full ${isJoined ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            </div>
            <input 
              type="text" 
              value={deviceName} 
              onChange={(e) => {
                setDeviceName(e.target.value);
                localStorage.setItem('alert_device_name', e.target.value);
              }}
              placeholder="Nombre del operario" 
              className="bg-transparent font-sans font-bold text-slate-100 text-sm focus:outline-none border-b border-dashed border-slate-700 w-36 py-0.5"
            />
          </div>
        </div>

        <div className="status-badge flex items-center">
          {alarmState === 'ON' ? (
            <span className="bg-rose-950/50 text-rose-400 border border-rose-900/50 rounded px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-widest animate-pulse flex items-center gap-1">
              🔴 ALARMA ACTIVA
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 border border-slate-700/60 rounded px-2.5 py-0.5 font-sans text-[10px]">
              🟢 MODO SEGURO
            </span>
          )}
        </div>
      </div>

      {/* PHONE INNER CARD CONTENT */}
      <div className="p-6 space-y-6">
        
        {/* TITULARES */}
        <div className="text-center space-y-2 py-2">
          <div className="p-3 bg-slate-900 inline-block rounded-2xl border border-slate-800 text-sky-400">
            <Compass className={`h-8 w-8 ${checking ? 'animate-spin' : ''}`} />
          </div>
          <h2 className="text-xl font-bold text-slate-100 leading-snug">Seguridad Industrial</h2>
          <p className="text-gray-400 text-xs leading-relaxed max-w-sm mx-auto">
            Vincule este dispositivo al ingresar a la central térmica. Al recibir señales de alarma, se disparará la sirena acústica únicamente si se encuentra dentro del radio de zona de peligro de 500 metros.
          </p>
        </div>

        {/* CORE INTERACTIVE BOUND BUTTON */}
        <div className="space-y-3">
          <button
            onClick={requestRealGps}
            disabled={checking}
            className={`w-full font-bold py-3.5 px-4 rounded-xl text-center flex items-center justify-center gap-2 tracking-wide uppercase text-sm border transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
              isJoined 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' 
                : 'bg-sky-600 hover:bg-sky-500 text-white border-sky-600 hover:shadow-lg hover:shadow-sky-900/20'
            }`}
          >
            {checking ? (
              <span>VERIFICANDO POSICIÓN GPS...</span>
            ) : isJoined ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>CONECTADO Y VINCULADO ✓</span>
              </>
            ) : (
              <span>CONECTAR Y VALIDAR POSICIÓN</span>
            )}
          </button>
        </div>

        {/* GPS TELEMETRY READINGS PANEL */}
        <div className="bg-slate-900 border border-slate-850 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
            <span className="text-gray-500 font-mono">Lecturas del Dispositivo</span>
            <span className="text-sky-400 font-mono bg-sky-950/40 px-2 py-0.5 rounded text-[9px]">
              GPS: {gpsSource === 'REAL' ? 'Físico Real' : gpsSource.includes('MOCK') ? 'Simulado' : 'Sin Señal'}
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Coordenadas:</span>
              <span className="text-slate-300">
                {coords ? formatCoords(coords.lat, coords.lon) : 'Pendiente vinculación'}
              </span>
            </div>
            
            <div className="flex justify-between border-t border-slate-850 pt-2">
              <span className="text-gray-500">Estructura Central:</span>
              <span className="text-slate-400">{formatCoords(LAT_CENTRAL_DEFAULT, LON_CENTRAL_DEFAULT)}</span>
            </div>

            <div className="flex justify-between border-t border-slate-840 pt-2">
              <span className="text-gray-500">Distancia Estimada:</span>
              <span className={`font-bold ${distance !== null ? (distance <= DISTANCIA_MAX_METROS ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400'}`}>
                {distance !== null ? `${Math.round(distance)} metros` : 'No enlazado'}
              </span>
            </div>

            <div className="flex justify-between border-t border-slate-850 pt-2 items-center">
              <span className="text-gray-500">Zona Peligro (500m):</span>
              {distance !== null ? (
                distance <= DISTANCIA_MAX_METROS ? (
                  <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase animate-pulse">
                    🟢 DENTRO (Expuesto)
                  </span>
                ) : (
                  <span className="text-amber-400 bg-amber-950/40 border border-amber-900/50 px-2 py-0.5 rounded text-[10px] font-sans font-semibold uppercase">
                    🟡 FUERA (Zona Segura)
                  </span>
                )
              ) : (
                <span className="text-slate-600 text-[10px] uppercase font-sans">Espera GPS</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-slate-850 pt-2.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-gray-500">Volumen / Tono de Sirena:</span>
                <span className="text-sky-450 font-bold bg-sky-950 border border-sky-900/50 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                  {soundType === 'SYNTH_SIREN' ? '⚡ Síntesis 80dB+' : '📻 Beep OGG'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSoundType('SYNTH_SIREN');
                    // Briefly play synth on user gesture so the browser unlocks the AudioContext automatically!
                    try {
                      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                      tempCtx.resume();
                    } catch(e){}
                  }}
                  className={`py-1.5 px-2 rounded font-sans text-[10px] tracking-tight border transition-colors cursor-pointer ${
                    soundType === 'SYNTH_SIREN'
                      ? 'bg-sky-950 text-sky-400 border-sky-800 font-bold'
                      : 'bg-slate-950 border-slate-900/80 text-gray-400 hover:text-slate-200'
                  }`}
                >
                  Modulado 80+ dB (Recomendado)
                </button>
                <button
                  type="button"
                  onClick={() => setSoundType('OGG_BEEP')}
                  className={`py-1.5 px-2 rounded font-sans text-[10px] tracking-tight border transition-colors cursor-pointer ${
                    soundType === 'OGG_BEEP'
                      ? 'bg-sky-950 text-sky-400 border-sky-800 font-bold'
                      : 'bg-slate-950 border-slate-900/80 text-gray-400 hover:text-slate-200'
                  }`}
                >
                  Bip de Alarma Estándar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MOCK GPS CONTROLLERS FOR SIMPLE WEB BROWSER TESTING */}
        <div className="space-y-2 border-t border-slate-850 pt-4">
          <p className="text-[11px] text-gray-500 font-mono tracking-wider uppercase text-center flex items-center justify-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-amber-500" />
            Emulador de Ubicación (Herramienta de Prueba)
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => setMockCoords('inside')}
              className={`p-2 rounded-lg font-mono border transition-colors cursor-pointer ${
                gpsSource === 'MOCK_INSIDE' 
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800 font-bold' 
                  : 'bg-slate-900 border-slate-800 text-gray-400 hover:text-slate-200'
              }`}
            >
              Simular DENTRO Central
              <span className="block text-[8px] opacity-75 mt-0.5">Distancia: ~10m</span>
            </button>
            <button
              onClick={() => setMockCoords('outside')}
              className={`p-2 rounded-lg font-mono border transition-colors cursor-pointer ${
                gpsSource === 'MOCK_OUTSIDE' 
                  ? 'bg-amber-950 text-amber-400 border-amber-900 font-bold' 
                  : 'bg-slate-900 border-slate-800 text-gray-400 hover:text-slate-200'
              }`}
            >
              Simular FUERA Central
              <span className="block text-[8px] opacity-75 mt-0.5">Distancia: ~40km</span>
            </button>
          </div>
          <p className="text-[9px] text-gray-500 leading-normal text-center">
            * Al presionar "Simular DENTRO", si el operador de la sala activa la alarma, tu pantalla parpadeará en rojo y rugirá la sirena. Pruébalo abriendo dos pestañas paralelas!
          </p>
        </div>
      </div>
    </div>
  );
}
