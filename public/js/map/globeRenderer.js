/**
 * GlobeRenderer: Manages the interactive 3D Globe (via globe.gl) and an integrated
 * 2D Vector Map projection (with pan & zoom), rendering pure TopoJSON/GeoJSON polygons.
 */

import { CONFIG } from "../config.js";

export class GlobeRenderer {
  /**
   * @param {HTMLElement} containerEl - Container element for the map/globe
   * @param {Object} options
   * @param {Function} [options.onPolygonHover] - Callback when a polygon is hovered
   */
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.onPolygonHoverCallback = options.onPolygonHover || null;

    this.features = [];
    this.hoveredFeature = null;
    this.mode = "3d"; // "3d" (globe.gl) | "2d" (vector canvas pan/zoom)
    this.globe = null;
    this.webglAvailable = this.checkWebGLSupport();

    // 2D Vector Canvas state (used when toggled to 2D or if WebGL is unavailable)
    this.canvas2d = null;
    this.ctx2d = null;
    this.view2d = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
    };

    this.resizeObserver = null;
    this.init();
  }

  /**
   * Checks if WebGL is supported and available in the current browser environment.
   * @returns {boolean}
   */
  checkWebGLSupport() {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
      return Boolean(gl && typeof window.Globe === "function");
    } catch {
      return false;
    }
  }

  /**
   * Initializes the renderer (3D globe.gl primary, plus 2D vector canvas).
   */
  init() {
    this.container.innerHTML = "";

    // Create sub-containers for 3D Globe and 2D Vector Canvas
    this.globeMount = document.createElement("div");
    this.globeMount.className = "globe-mount";
    this.container.appendChild(this.globeMount);

    this.canvas2d = document.createElement("canvas");
    this.canvas2d.className = "vector-canvas-2d hidden";
    this.container.appendChild(this.canvas2d);
    this.ctx2d = this.canvas2d.getContext("2d");

    this.setup2DInteractions();

    if (this.webglAvailable) {
      try {
        this.initGlobeGL();
      } catch (err) {
        console.warn("Fallback auf 2D-Vektorkarte, da globe.gl nicht initialisiert werden konnte:", err);
        this.webglAvailable = false;
        this.setMode("2d");
      }
    } else {
      this.setMode("2d");
    }

    // Keep dimensions responsive
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener("resize", () => this.handleResize());
  }

  /**
   * Initializes the 3D Globe using globe.gl without basemap tiles (pure vector polygons + ocean sphere).
   */
  initGlobeGL() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const globeInstance = window.Globe({ animateIn: false })(this.globeMount)
      .width(width)
      .height(height)
      .backgroundColor("rgba(0,0,0,0)")
      .showGlobe(true)
      .showAtmosphere(true)
      .atmosphereColor(CONFIG.GLOBE.ATMOSPHERE_COLOR)
      .atmosphereAltitude(CONFIG.GLOBE.ATMOSPHERE_ALTITUDE)
      .showGraticules(true)
      .polygonsTransitionDuration(0)
      .polygonCapCurvatureResolution(4)
      .polygonAltitude((feat) => {
        if (feat === this.hoveredFeature) {
          return CONFIG.GLOBE.HOVER_ALTITUDE;
        }
        return feat.properties?._isNamed
          ? CONFIG.GLOBE.BASE_ALTITUDE
          : CONFIG.GLOBE.UNNAMED_ALTITUDE;
      })
      .polygonCapColor((feat) => {
        if (feat === this.hoveredFeature) {
          return feat.properties?._hoverColor || CONFIG.GLOBE.UNNAMED_LAND_HOVER_COLOR;
        }
        return feat.properties?._baseColor || CONFIG.GLOBE.UNNAMED_LAND_COLOR;
      })
      .polygonSideColor(() => "rgba(15, 23, 42, 0.55)")
      .polygonStrokeColor((feat) =>
        feat.properties?._isNamed
          ? CONFIG.GLOBE.BORDER_COLOR
          : CONFIG.GLOBE.UNNAMED_BORDER_COLOR
      )
      .onPolygonHover((hoverFeat) => {
        if (this.hoveredFeature === hoverFeat) return;
        this.hoveredFeature = hoverFeat || null;
        this.globeMount.style.cursor = hoverFeat ? "pointer" : "grab";

        // Refresh altitude and cap color smoothly
        if (this.globe) {
          this.globe
            .polygonAltitude(this.globe.polygonAltitude())
            .polygonCapColor(this.globe.polygonCapColor());
        }

        if (this.onPolygonHoverCallback) {
          this.onPolygonHoverCallback(this.hoveredFeature);
        }
      });

    // Style the ocean sphere material (no raster basemap texture needed)
    try {
      const material = globeInstance.globeMaterial();
      if (material && material.color) {
        material.color.set(CONFIG.GLOBE.OCEAN_COLOR);
        if ("shininess" in material) material.shininess = 12;
      }
    } catch {
      // Ignore material customization issues if Three.js material differs
    }

    // Configure OrbitControls for smooth zooming and panning/rotation
    try {
      const controls = globeInstance.controls();
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.75;
        controls.zoomSpeed = 0.9;
        controls.enablePan = true;
        controls.minDistance = 108;
        controls.maxDistance = 480;
      }
    } catch {
      // Ignore if controls aren't ready yet
    }

    globeInstance.pointOfView(CONFIG.GLOBE.INITIAL_POV, 0);
    this.globe = globeInstance;
  }

  /**
   * Switches between "3d" (globe.gl) and "2d" (flat vector map) modes.
   * @param {"3d"|"2d"} newMode
   */
  setMode(newMode) {
    if (newMode === "3d" && !this.webglAvailable) {
      newMode = "2d";
    }
    this.mode = newMode;

    if (this.mode === "3d") {
      this.globeMount.classList.remove("hidden");
      this.canvas2d.classList.add("hidden");
      this.handleResize();
      if (this.globe) {
        this.globe.polygonsData(this.features);
      }
    } else {
      this.globeMount.classList.add("hidden");
      this.canvas2d.classList.remove("hidden");
      this.handleResize();
      this.render2D();
    }
  }

  /**
   * Toggles between 3D Globe and 2D Vector Map.
   * @returns {"3d"|"2d"} The active mode after toggling
   */
  toggleMode() {
    const next = this.mode === "3d" ? "2d" : "3d";
    this.setMode(next);
    return this.mode;
  }

  /**
   * Sets the GeoJSON features to render on the globe / vector map.
   * @param {Array<Object>} features
   */
  setFeatures(features) {
    this.features = Array.isArray(features) ? features : [];
    this.hoveredFeature = null;

    if (this.globe && this.webglAvailable) {
      this.globe.polygonsData(this.features);
    }

    if (this.mode === "2d") {
      this.render2D();
    }
  }

  /**
   * Resets camera/view to the initial global perspective.
   * @param {number} [durationMs=650]
   */
  resetView(durationMs = 650) {
    if (this.mode === "3d" && this.globe) {
      this.globe.pointOfView(CONFIG.GLOBE.INITIAL_POV, durationMs);
    } else {
      this.view2d.scale = 1;
      this.view2d.offsetX = 0;
      this.view2d.offsetY = 0;
      this.render2D();
    }
  }

  /**
   * Zooms in or out programmatically.
   * @param {number} factor - e.g. 0.75 to zoom in (lower altitude), 1.3 to zoom out
   */
  zoomBy(factor) {
    if (this.mode === "3d" && this.globe) {
      const pov = this.globe.pointOfView();
      const currentAlt = pov && typeof pov.altitude === "number" ? pov.altitude : 2.1;
      const nextAlt = Math.max(0.18, Math.min(3.8, currentAlt * factor));
      this.globe.pointOfView({ ...pov, altitude: nextAlt }, 280);
    } else {
      const zoomMultiplier = factor < 1 ? 1.35 : 0.75;
      this.view2d.scale = Math.max(0.8, Math.min(18, this.view2d.scale * zoomMultiplier));
      this.render2D();
    }
  }

  /**
   * Handles container resize events.
   */
  handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    if (this.globe && this.webglAvailable) {
      this.globe.width(width).height(height);
    }

    if (this.canvas2d) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas2d.width = Math.floor(width * dpr);
      this.canvas2d.height = Math.floor(height * dpr);
      this.canvas2d.style.width = `${width}px`;
      this.canvas2d.style.height = `${height}px`;
      if (this.mode === "2d") {
        this.render2D();
      }
    }
  }

  /**
   * Sets up interactive pan, zoom, and hover handlers for the 2D vector canvas.
   */
  setup2DInteractions() {
    const canvas = this.canvas2d;

    canvas.addEventListener("mousedown", (e) => {
      this.view2d.isDragging = true;
      this.view2d.dragStartX = e.clientX - this.view2d.offsetX;
      this.view2d.dragStartY = e.clientY - this.view2d.offsetY;
      canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (this.mode !== "2d") return;
      if (this.view2d.isDragging) {
        this.view2d.offsetX = e.clientX - this.view2d.dragStartX;
        this.view2d.offsetY = e.clientY - this.view2d.dragStartY;
        this.render2D();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.view2d.isDragging) {
        this.view2d.isDragging = false;
        canvas.style.cursor = "grab";
      }
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        const newScale = Math.max(0.8, Math.min(20, this.view2d.scale * zoomFactor));
        const scaleRatio = newScale / this.view2d.scale;

        this.view2d.offsetX = mouseX - (mouseX - this.view2d.offsetX) * scaleRatio;
        this.view2d.offsetY = mouseY - (mouseY - this.view2d.offsetY) * scaleRatio;
        this.view2d.scale = newScale;

        this.render2D();
      },
      { passive: false }
    );
  }

  /**
   * Renders the GeoJSON features onto the 2D vector canvas (equirectangular projection).
   */
  render2D() {
    if (!this.ctx2d || !this.canvas2d) return;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas2d.width / dpr;
    const height = this.canvas2d.height / dpr;

    const ctx = this.ctx2d;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear ocean background
    ctx.fillStyle = CONFIG.GLOBE.OCEAN_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Compute equirectangular base fit
    const mapAspect = 2; // 360 deg / 180 deg
    let baseW = width * 0.92;
    let baseH = baseW / mapAspect;
    if (baseH > height * 0.85) {
      baseH = height * 0.85;
      baseW = baseH * mapAspect;
    }

    const centerX = width / 2 + this.view2d.offsetX;
    const centerY = height / 2 + this.view2d.offsetY;
    const scaledW = baseW * this.view2d.scale;
    const scaledH = baseH * this.view2d.scale;
    const left = centerX - scaledW / 2;
    const top = centerY - scaledH / 2;

    // Draw subtle graticule grid
    ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, scaledW, scaledH);

    for (let lon = -150; lon <= 150; lon += 30) {
      const x = left + ((lon + 180) / 360) * scaledW;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + scaledH);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = top + ((90 - lat) / 180) * scaledH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + scaledW, y);
      ctx.stroke();
    }

    // Project (lon, lat) -> (x, y)
    const project = (lon, lat) => [
      left + ((lon + 180) / 360) * scaledW,
      top + ((90 - lat) / 180) * scaledH,
    ];

    // Draw unnamed background land first, then named historical territories on top
    const orderedFeatures = [
      ...this.features.filter((f) => !f.properties?._isNamed),
      ...this.features.filter((f) => f.properties?._isNamed),
    ];

    for (const feat of orderedFeatures) {
      const geom = feat.geometry;
      if (!geom) continue;

      const polygons =
        geom.type === "Polygon"
          ? [geom.coordinates]
          : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

      ctx.fillStyle = feat.properties?._baseColor || CONFIG.GLOBE.UNNAMED_LAND_COLOR;
      ctx.strokeStyle = feat.properties?._isNamed
        ? CONFIG.GLOBE.BORDER_COLOR
        : CONFIG.GLOBE.UNNAMED_BORDER_COLOR;
      ctx.lineWidth = feat.properties?._isNamed ? 0.9 : 0.45;

      for (const poly of polygons) {
        ctx.beginPath();
        for (const ring of poly) {
          for (let i = 0; i < ring.length; i++) {
            const [lon, lat] = ring[i];
            const [x, y] = project(lon, lat);
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.closePath();
        }
        ctx.fill("evenodd");
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
