/**
 * Map utilities for Full Metal Planète
 *
 * Provides access to official and procedurally generated maps.
 */

export {
  generateOfficialMap,
  validateOfficialMap,
  getOfficialMapStats,
  OFFICIAL_MAP_DIMENSIONS,
  // Landing zone functions
  TOTAL_LANDING_ZONES,
  calculateLandingZone,
  getZoneDistance,
  isLandingZoneValid,
  getZoneHexes,
  getZoneBoundaryHexes,
} from './official-map';
