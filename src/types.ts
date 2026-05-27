/**
 * TYPES FOR THE INDUSTRIAL ALARM SYSTEM
 */

export interface Coords {
  lat: number;
  lon: number;
}

export interface DispositivoActivo {
  id: string; // token or generated UUID
  fecha: number;
  activo: boolean;
  lat: number;
  lon: number;
  nombre?: string; // friendly name
  distancia?: number; // calculated distance on UI
}

export type EstadoAlarma = 'ON' | 'OFF';

export interface BitacoraEvento {
  id: string;
  timestamp: number;
  tipo: 'CONEXIÓN' | 'ALARMA_ACTIVA' | 'ALARMA_DESACTIVA' | 'ERROR_GPS';
  mensaje: string;
  coordenadas?: Coords;
}
