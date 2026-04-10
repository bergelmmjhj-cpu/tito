const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(from, to) {
  const lat1 = toRadians(from.latitude);
  const lon1 = toRadians(from.longitude);
  const lat2 = toRadians(to.latitude);
  const lon2 = toRadians(to.longitude);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function isWithinGeofence(location, workplace) {
  if (!location || !workplace) return false;
  if (typeof workplace.geofenceRadiusMeters !== "number") return false;

  const distanceMeters = calculateDistanceMeters(location, workplace);
  return distanceMeters <= workplace.geofenceRadiusMeters;
}
