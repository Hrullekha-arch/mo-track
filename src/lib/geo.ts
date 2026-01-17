/**
 * Lightweight geo helpers (no external deps) for MoTrack live tracking.
 */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function isInsideRadius(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusM: number
): boolean {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return false;
  return haversineDistanceMeters(point, center) <= radiusM;
}
