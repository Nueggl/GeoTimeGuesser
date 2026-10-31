/**
 * DataService: Handles loading manifest.json, fetching TopoJSON maps,
 * converting TopoJSON to GeoJSON features, and assigning deterministic colors.
 */

import { CONFIG } from "../config.js";

export class DataService {
  constructor() {
    this.manifest = null;
    this.manifestBaseUrl = null;
    this.topologyCache = new Map();
  }

  /**
   * Loads manifest.json from the first reachable candidate path.
   * @returns {Promise<Array<Object>>}
   */
  async loadManifest() {
    if (this.manifest) {
      return this.manifest;
    }

    let lastError = null;
    for (const candidatePath of CONFIG.MANIFEST_PATHS) {
      try {
        const response = await fetch(candidatePath);
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          this.manifest = data;
          this.manifestBaseUrl = new URL(".", response.url).href;
          return this.manifest;
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `Manifest konnte nicht geladen werden (${lastError ? lastError.message : "Keine gültige Datei gefunden"}).`
    );
  }

  /**
   * Resolves the URL for a round's TopoJSON file relative to the loaded manifest.json.
   * @param {Object} round
   * @returns {string}
   */
  resolveRoundFileUrl(round) {
    if (this.manifestBaseUrl && round.file) {
      return new URL(round.file, this.manifestBaseUrl).href;
    }
    if (round.path) {
      return round.path;
    }
    return `./data/${round.file}`;
  }

  /**
   * Fetches and converts a round's TopoJSON into enriched GeoJSON features.
   * Filters out null geometries that exist in some historical-basemaps entries.
   * @param {Object} round
   * @returns {Promise<Array<Object>>}
   */
  async loadRoundFeatures(round) {
    const cacheKey = round.file || round.id;
    if (this.topologyCache.has(cacheKey)) {
      return this.topologyCache.get(cacheKey);
    }

    const url = this.resolveRoundFileUrl(round);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Karten-Datei '${round.file}' konnte nicht geladen werden (HTTP ${response.status}).`);
    }

    const topology = await response.json();
    const features = this.parseTopologyToFeatures(topology);

    this.topologyCache.set(cacheKey, features);
    return features;
  }

  /**
   * Converts a TopoJSON Topology object into valid GeoJSON Polygon/MultiPolygon features.
   * @param {Object} topology
   * @returns {Array<Object>}
   */
  parseTopologyToFeatures(topology) {
    if (!topology || topology.type !== "Topology" || !topology.objects) {
      if (topology && topology.type === "FeatureCollection" && Array.isArray(topology.features)) {
        return this.enrichFeatures(topology.features);
      }
      throw new Error("Ungültiges TopoJSON-Format.");
    }

    const topojsonClient = window.topojson;
    if (!topojsonClient || typeof topojsonClient.feature !== "function") {
      throw new Error("topojson-client Bibliothek ist nicht geladen.");
    }

    const objectKey = topology.objects.world
      ? "world"
      : Object.keys(topology.objects)[0];

    if (!objectKey) {
      return [];
    }

    const geojson = topojsonClient.feature(topology, topology.objects[objectKey]);
    const rawFeatures = Array.isArray(geojson.features) ? geojson.features : [];

    return this.enrichFeatures(rawFeatures);
  }

  /**
   * Filters out empty/null geometries and attaches normalized display metadata & colors.
   * @param {Array<Object>} rawFeatures
   * @returns {Array<Object>}
   */
  enrichFeatures(rawFeatures) {
    const validFeatures = [];

    for (let i = 0; i < rawFeatures.length; i++) {
      const feat = rawFeatures[i];
      if (
        !feat ||
        !feat.geometry ||
        !feat.geometry.type ||
        !Array.isArray(feat.geometry.coordinates) ||
        feat.geometry.coordinates.length === 0
      ) {
        continue;
      }

      const props = feat.properties || {};
      const entityName = this.extractEntityName(props);
      const groupName = this.extractGroupName(props, entityName);
      const isNamed = Boolean(entityName);
      const baseColor = isNamed
        ? this.computeColor(groupName, 0.82)
        : CONFIG.GLOBE.UNNAMED_LAND_COLOR;
      const hoverColor = isNamed
        ? this.computeColor(groupName, 0.96, true)
        : CONFIG.GLOBE.UNNAMED_LAND_HOVER_COLOR;

      validFeatures.push({
        ...feat,
        properties: {
          ...props,
          _id: feat.id || `feat_${i}`,
          _entityName: entityName,
          _groupName: groupName,
          _capital: props.capname || null,
          _isNamed: isNamed,
          _baseColor: baseColor,
          _hoverColor: hoverColor,
        },
      });
    }

    return validFeatures;
  }

  /**
   * Extracts the primary historical territory/state name from either CShapes or historical-basemaps.
   * @param {Object} props
   * @returns {string|null}
   */
  extractEntityName(props) {
    const candidates = [
      props.cntry_name,
      props.NAME,
      props.name,
      props.SUBJECTO,
      props.PARTOF,
      props.ABBREVN,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0 && c.trim().toLowerCase() !== "null") {
        return c.trim();
      }
    }
    return null;
  }

  /**
   * Extracts overarching empire/sovereign group name for cohesive color assignment.
   * @param {Object} props
   * @param {string|null} fallbackName
   * @returns {string}
   */
  extractGroupName(props, fallbackName) {
    if (typeof props.cntry_name === "string" && props.cntry_name.trim()) {
      return props.cntry_name.trim();
    }
    if (typeof props.SUBJECTO === "string" && props.SUBJECTO.trim()) {
      return props.SUBJECTO.trim();
    }
    if (typeof props.PARTOF === "string" && props.PARTOF.trim()) {
      return props.PARTOF.trim();
    }
    return fallbackName || "Unclaimed";
  }

  /**
   * Deterministically maps an entity name to a cartographic RGBA color.
   * @param {string} name
   * @param {number} alpha
   * @param {boolean} brighten
   * @returns {string}
   */
  computeColor(name, alpha = 0.82, brighten = false) {
    let hash = 2166136261;
    for (let i = 0; i < name.length; i++) {
      hash ^= name.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const palette = CONFIG.POLYGON_PALETTE;
    const hex = palette[Math.abs(hash) % palette.length];

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (brighten) {
      const br = Math.min(255, Math.round(r + (255 - r) * 0.25));
      const bg = Math.min(255, Math.round(g + (255 - g) * 0.25));
      const bb = Math.min(255, Math.round(b + (255 - b) * 0.25));
      return `rgba(${br}, ${bg}, ${bb}, ${alpha})`;
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
