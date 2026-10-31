/**
 * GeoTimeGuesser - Main Application Entrypoint
 * Connects DataService, GameState, GlobeRenderer (globe.gl), and UIController.
 */

import { DataService } from "./services/dataService.js";
import { GameState, SCREENS } from "./state/gameState.js";
import { GlobeRenderer } from "./map/globeRenderer.js";
import { UIController } from "./ui/uiController.js";

class GeoTimeGuesserApp {
  constructor() {
    this.dataService = new DataService();
    this.gameState = new GameState();
    this.globeRenderer = null;
    this.ui = null;
  }

  /**
   * Initializes the application, globe renderer, UI controller, and manifest.
   */
  async init() {
    const mapContainer = document.getElementById("map-viewport");
    if (!mapContainer) {
      throw new Error("Karten-Container (#map-viewport) nicht im DOM gefunden.");
    }

    this.globeRenderer = new GlobeRenderer(mapContainer, {
      onPolygonHover: (feature) => {
        if (this.ui) {
          this.ui.updatePolygonHoverBadge(feature);
        }
      },
    });

    this.ui = new UIController({
      gameState: this.gameState,
      onStartRound: () => this.handleStartNextRound(),
      onGoHome: () => this.handleGoHome(),
      onSubmitGuess: () => this.handleGuess(),
      onRevealSolution: () => this.handleReveal(),
      onZoomIn: () => this.globeRenderer.zoomBy(0.72),
      onZoomOut: () => this.globeRenderer.zoomBy(1.35),
      onResetView: () => this.globeRenderer.resetView(550),
      onToggleMapMode: () => this.globeRenderer.toggleMode(),
    });

    try {
      const manifest = await this.dataService.loadManifest();
      this.gameState.setManifest(manifest);
      this.ui.setManifestLoadedCount(manifest.length);

      // Load an initial background map on the globe for visual atmosphere on the dashboard
      const previewRound = manifest[Math.floor(Math.random() * manifest.length)];
      this.dataService
        .loadRoundFeatures(previewRound)
        .then((features) => {
          if (this.gameState.currentScreen === SCREENS.DASHBOARD) {
            this.globeRenderer.setFeatures(features);
          }
        })
        .catch(() => {
          // Non-critical preview load
        });
    } catch (err) {
      console.error("Fehler beim Laden des Manifests:", err);
      this.ui.setManifestLoadedCount(0);
    }
  }

  /**
   * Starts a new round: picks a random map from manifest.json, resets UI state,
   * switches to the Game Screen, and renders the TopoJSON polygons.
   */
  async handleStartNextRound() {
    try {
      if (!this.gameState.manifest || this.gameState.manifest.length === 0) {
        const manifest = await this.dataService.loadManifest();
        this.gameState.setManifest(manifest);
      }

      const round = this.gameState.startNewRound();
      this.ui.resetRoundUI();
      this.ui.showScreen(SCREENS.GAME);
      this.ui.setLoading(true, "Historische Vektorkarte wird geladen...");

      const features = await this.dataService.loadRoundFeatures(round);
      this.globeRenderer.setFeatures(features);
      this.globeRenderer.resetView(500);
    } catch (err) {
      console.error("Fehler beim Starten der Runde:", err);
      this.ui.setLoading(true, `Fehler: ${err.message}`);
      return;
    } finally {
      this.ui.setLoading(false);
    }
  }

  /**
   * Returns to the Dashboard screen.
   */
  handleGoHome() {
    this.gameState.goToDashboard();
    this.ui.clearFeedback();
    this.ui.updatePolygonHoverBadge(null);
    this.ui.showScreen(SCREENS.DASHBOARD);
  }

  /**
   * Checks the user's guessed year against manifest.json.
   * If exact match -> opens Solution Screen.
   * Otherwise -> displays red "Falsch" feedback.
   */
  handleGuess() {
    if (!this.gameState.currentRound) return;

    const result = this.gameState.submitGuess();
    if (result.correct) {
      this.ui.clearFeedback();
      this.ui.renderSolutionScreen();
    } else {
      this.ui.showWrongGuessFeedback(result);
    }
  }

  /**
   * Skips guessing and directly opens the Solution Screen.
   */
  handleReveal() {
    if (!this.gameState.currentRound) return;

    this.gameState.revealSolution();
    this.ui.clearFeedback();
    this.ui.renderSolutionScreen();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new GeoTimeGuesserApp();
  app.init();
  window.__geoTimeGuesserApp = app;
});
