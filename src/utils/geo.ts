/**
 * GEOLOCATION UTILITIES FOR CENTRAL ALARM
 */

import { Coords } from '../types';

export const LAT_CENTRAL_DEFAULT = -34.903069;
export const LON_CENTRAL_DEFAULT = -58.733804;
export const DISTANCIA_MAX_METROS = 500;

/**
 * Calculates distance in meters between two lat/lon coordinates using Haversine formula
 */
export function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in meters
}

/**
 * Returns a human-friendly bearing direction from Central to operator
 */
export function obtenerOrientacion(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360; // normalize

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(brng / 45) % 8;
  return directions[index];
}

/**
 * Formats coordinates for professional displaying
 */
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
}
