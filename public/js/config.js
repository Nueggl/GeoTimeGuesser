/**
 * Application configuration, constants, and cartographic styling presets.
 */

export const CONFIG = {
  APP_TITLE: "GeoTimeGuesser",

  // Default year bounds for the slider and synchronized inputs
  YEAR_MIN: -2000,
  YEAR_MAX: 2024,
  DEFAULT_YEAR: 1900,

  // Candidate paths to locate manifest.json whether served from root or /public
  MANIFEST_PATHS: [
    new URL("../../data/manifest.json", import.meta.url).href,
    "./data/manifest.json",
    "./public/data/manifest.json",
    "/public/data/manifest.json",
    "/data/manifest.json",
  ],

  // Citations read from #todo.txt
  CITATIONS: {
    summary: "Maps by: CShapes 2.0 & historical-basemaps",
    cshapes: {
      label: "Karten 1886–2019 (CShapes 2.0)",
      text: "Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann, and Kristian Skrede Gleditsch. 2022. “Mapping The International System, 1886-2017: The CShapes 2.0 Dataset.” Journal of Conflict Resolution 66(1): 144–61.",
    },
    historicalBasemaps: {
      label: "Ältere Karten (< 1886)",
      text: "aourednik/historical-basemaps",
      url: "https://github.com/aourednik/historical-basemaps",
    },
    cshapesEuropePlanned: {
      label: "Vorgemerkt: Europa-Karten 1816–2019 (CShapes-Europe)",
      text: "Cederman, Lars-Erik, Luc Girardin, Carl Müller-Crepon, and Yannick Pengl. 2025. Nationalism and the Transformation of the State: Border Change and Political Violence in the Modern World. Cambridge University Press.",
    },
  },

  // 3D Globe & 2D Map visual settings
  GLOBE: {
    INITIAL_POV: { lat: 25, lng: 15, altitude: 2.1 },
    OCEAN_COLOR: "#091526",
    ATMOSPHERE_COLOR: "#38bdf8",
    ATMOSPHERE_ALTITUDE: 0.14,
    UNNAMED_LAND_COLOR: "rgba(56, 72, 94, 0.88)",
    UNNAMED_LAND_HOVER_COLOR: "rgba(75, 95, 122, 0.92)",
    BORDER_COLOR: "rgba(15, 23, 42, 0.85)",
    UNNAMED_BORDER_COLOR: "rgba(100, 116, 139, 0.35)",
    BASE_ALTITUDE: 0.007,
    UNNAMED_ALTITUDE: 0.004,
    HOVER_ALTITUDE: 0.018,
  },

  // Distinct cartographic polygon palette (muted historical atlas tones)
  POLYGON_PALETTE: [
    "#d97706", // Amber
    "#2563eb", // Royal Blue
    "#059669", // Emerald
    "#dc2626", // Crimson
    "#7c3aed", // Violet
    "#0d9488", // Teal
    "#db2777", // Rose
    "#ca8a04", // Gold
    "#4f46e5", // Indigo
    "#16a34a", // Forest Green
    "#ea580c", // Burnt Orange
    "#0284c7", // Cerulean
    "#9333ea", // Purple
    "#65a30d", // Olive Lime
    "#e11d48", // Ruby
    "#0891b2", // Cyan
  ],
};
