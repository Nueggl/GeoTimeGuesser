/**
 * UIController: Binds DOM elements, synchronizes the year slider with both
 * left and right keyboard input fields, manages screens, and renders feedback.
 */

import { CONFIG } from "../config.js";
import { SCREENS } from "../state/gameState.js";

export class UIController {
  /**
   * @param {Object} deps
   * @param {import("../state/gameState.js").GameState} deps.gameState
   * @param {Function} deps.onStartRound
   * @param {Function} deps.onGoHome
   * @param {Function} deps.onSubmitGuess
   * @param {Function} deps.onRevealSolution
   * @param {Function} deps.onZoomIn
   * @param {Function} deps.onZoomOut
   * @param {Function} deps.onResetView
   * @param {Function} deps.onToggleMapMode
   */
  constructor(deps) {
    this.gameState = deps.gameState;
    this.handlers = deps;

    this.elements = {
      // Screens
      dashboardScreen: document.getElementById("screen-dashboard"),
      gameScreen: document.getElementById("screen-game"),
      solutionScreen: document.getElementById("screen-solution"),

      // Dashboard elements
      btnStartRound: document.getElementById("btn-start-round"),
      manifestBadge: document.getElementById("manifest-status-badge"),
      citationSummary: document.getElementById("citation-summary"),
      citationDetails: document.getElementById("citation-details"),

      // Game screen navigation & map tools
      btnGameHome: document.getElementById("btn-game-home"),
      btnZoomIn: document.getElementById("btn-zoom-in"),
      btnZoomOut: document.getElementById("btn-zoom-out"),
      btnResetView: document.getElementById("btn-reset-view"),
      btnToggleMode: document.getElementById("btn-toggle-mode"),
      loadingIndicator: document.getElementById("map-loading-indicator"),
      polygonTooltip: document.getElementById("polygon-hover-badge"),

      // Game screen synchronized inputs & slider
      yearSlider: document.getElementById("year-slider"),
      yearInputLeft: document.getElementById("year-input-left"),
      yearInputRight: document.getElementById("year-input-right"),
      currentYearReadout: document.getElementById("current-year-readout"),

      // Game screen actions & feedback
      btnGuess: document.getElementById("btn-guess"),
      btnReveal: document.getElementById("btn-reveal"),
      feedbackBox: document.getElementById("guess-feedback"),

      // Solution screen elements
      solutionStatusBadge: document.getElementById("solution-status-badge"),
      solutionCorrectYear: document.getElementById("solution-correct-year"),
      solutionEraLabel: document.getElementById("solution-era-label"),
      solutionMetaSource: document.getElementById("solution-meta-source"),
      solutionMetaFeatures: document.getElementById("solution-meta-features"),
      solutionMetaGuessInfo: document.getElementById("solution-meta-guess-info"),
      btnNextRound: document.getElementById("btn-next-round"),
      btnSolutionHome: document.getElementById("btn-solution-home"),
    };

    this.initStaticContent();
    this.bindEvents();
  }

  /**
   * Populates citations and slider attributes from CONFIG.
   */
  initStaticContent() {
    const { yearSlider, yearInputLeft, yearInputRight, citationSummary, citationDetails } =
      this.elements;

    const minStr = String(CONFIG.YEAR_MIN);
    const maxStr = String(CONFIG.YEAR_MAX);
    const defStr = String(CONFIG.DEFAULT_YEAR);

    if (yearSlider) {
      yearSlider.min = minStr;
      yearSlider.max = maxStr;
      yearSlider.value = defStr;
    }
    if (yearInputLeft) {
      yearInputLeft.min = minStr;
      yearInputLeft.max = maxStr;
      yearInputLeft.value = defStr;
    }
    if (yearInputRight) {
      yearInputRight.min = minStr;
      yearInputRight.max = maxStr;
      yearInputRight.value = defStr;
    }

    if (citationSummary) {
      citationSummary.textContent = CONFIG.CITATIONS.summary;
    }

    if (citationDetails) {
      const { cshapes, historicalBasemaps, cshapesEuropePlanned } = CONFIG.CITATIONS;
      citationDetails.innerHTML = `
        <div class="citation-item">
          <strong>${cshapes.label}:</strong>
          <span>${cshapes.text}</span>
        </div>
        <div class="citation-item">
          <strong>${historicalBasemaps.label}:</strong>
          <a href="${historicalBasemaps.url}" target="_blank" rel="noopener noreferrer">${historicalBasemaps.url}</a>
        </div>
        <div class="citation-item citation-muted">
          <strong>${cshapesEuropePlanned.label}:</strong>
          <span>${cshapesEuropePlanned.text}</span>
        </div>
      `;
    }

    this.updateYearDisplay(CONFIG.DEFAULT_YEAR);
  }

  /**
   * Binds UI events for buttons, slider, and synchronized keyboard inputs.
   */
  bindEvents() {
    const {
      btnStartRound,
      btnGameHome,
      btnSolutionHome,
      btnNextRound,
      btnGuess,
      btnReveal,
      yearSlider,
      yearInputLeft,
      yearInputRight,
      btnZoomIn,
      btnZoomOut,
      btnResetView,
      btnToggleMode,
    } = this.elements;

    btnStartRound?.addEventListener("click", () => this.handlers.onStartRound());
    btnNextRound?.addEventListener("click", () => this.handlers.onStartRound());
    btnGameHome?.addEventListener("click", () => this.handlers.onGoHome());
    btnSolutionHome?.addEventListener("click", () => this.handlers.onGoHome());

    btnGuess?.addEventListener("click", () => this.commitActiveInputAndGuess());
    btnReveal?.addEventListener("click", () => this.handlers.onRevealSolution());

    // Slider input -> synchronize both left & right inputs in real time
    yearSlider?.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!Number.isNaN(val)) {
        this.gameState.setGuessedYear(val);
        this.syncYearControls(this.gameState.guessedYear);
      }
    });

    // Left input -> synchronize slider & right input
    this.bindNumberInput(yearInputLeft, yearInputRight);

    // Right input -> synchronize slider & left input
    this.bindNumberInput(yearInputRight, yearInputLeft);

    // Map toolbar buttons
    btnZoomIn?.addEventListener("click", () => this.handlers.onZoomIn());
    btnZoomOut?.addEventListener("click", () => this.handlers.onZoomOut());
    btnResetView?.addEventListener("click", () => this.handlers.onResetView());
    btnToggleMode?.addEventListener("click", () => {
      const mode = this.handlers.onToggleMapMode();
      if (btnToggleMode) {
        btnToggleMode.textContent = mode === "3d" ? "Ansicht: 3D-Globus" : "Ansicht: 2D-Karte";
      }
    });
  }

  /**
   * Binds a keyboard number input so typing updates the slider and counterpart input immediately,
   * and pressing Enter triggers "Raten".
   * @param {HTMLInputElement} sourceInput
   * @param {HTMLInputElement} counterpartInput
   */
  bindNumberInput(sourceInput, counterpartInput) {
    if (!sourceInput) return;

    sourceInput.addEventListener("input", (e) => {
      const raw = e.target.value.trim();
      // Allow user to type "-" or partial negative numbers without clobbering mid-keystroke
      if (raw === "" || raw === "-") {
        if (counterpartInput) counterpartInput.value = raw;
        return;
      }
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(CONFIG.YEAR_MIN, Math.min(CONFIG.YEAR_MAX, parsed));
        this.gameState.guessedYear = clamped;
        if (this.elements.yearSlider) {
          this.elements.yearSlider.value = String(clamped);
        }
        if (counterpartInput) {
          counterpartInput.value = String(parsed);
        }
        this.updateYearDisplay(clamped);
      }
    });

    sourceInput.addEventListener("change", () => {
      const parsed = parseInt(sourceInput.value, 10);
      const validYear = Number.isNaN(parsed)
        ? this.gameState.guessedYear
        : this.gameState.setGuessedYear(parsed);
      this.syncYearControls(validYear);
    });

    sourceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.commitActiveInputAndGuess();
      }
    });
  }

  /**
   * Ensures any pending value in the number inputs is committed before checking the guess.
   */
  commitActiveInputAndGuess() {
    const { yearInputLeft, yearInputRight } = this.elements;
    const activeEl = document.activeElement;
    if (activeEl === yearInputLeft && yearInputLeft.value.trim() !== "") {
      this.gameState.setGuessedYear(yearInputLeft.value);
    } else if (activeEl === yearInputRight && yearInputRight.value.trim() !== "") {
      this.gameState.setGuessedYear(yearInputRight.value);
    }
    this.syncYearControls(this.gameState.guessedYear);
    this.handlers.onSubmitGuess();
  }

  /**
   * Synchronizes the slider and both left & right inputs to the given year.
   * @param {number} year
   */
  syncYearControls(year) {
    const strVal = String(year);
    const { yearSlider, yearInputLeft, yearInputRight } = this.elements;

    if (yearSlider && yearSlider.value !== strVal) {
      yearSlider.value = strVal;
    }
    if (yearInputLeft && yearInputLeft.value !== strVal) {
      yearInputLeft.value = strVal;
    }
    if (yearInputRight && yearInputRight.value !== strVal) {
      yearInputRight.value = strVal;
    }
    this.updateYearDisplay(year);
  }

  /**
   * Formats and updates the prominent year badge above the slider.
   * @param {number} year
   */
  updateYearDisplay(year) {
    const { currentYearReadout } = this.elements;
    if (!currentYearReadout) return;
    currentYearReadout.textContent = this.formatYearWithEra(year);
  }

  /**
   * Formats a year integer into human-readable form (e.g., "1914" or "-500 (500 v. Chr.)").
   * @param {number} year
   * @returns {string}
   */
  formatYearWithEra(year) {
    if (year < 0) {
      return `${year} (${Math.abs(year)} v. Chr.)`;
    }
    return `${year}`;
  }

  /**
   * Updates the active screen visibility based on current GameState.
   * @param {string} screenName
   */
  showScreen(screenName) {
    const { dashboardScreen, gameScreen, solutionScreen } = this.elements;

    dashboardScreen?.classList.toggle("active", screenName === SCREENS.DASHBOARD);
    gameScreen?.classList.toggle("active", screenName === SCREENS.GAME);
    solutionScreen?.classList.toggle("active", screenName === SCREENS.SOLUTION);
  }

  /**
   * Resets the Game Screen UI for a fresh round.
   */
  resetRoundUI() {
    this.syncYearControls(this.gameState.guessedYear);
    this.clearFeedback();
    this.updatePolygonHoverBadge(null);
  }

  /**
   * Shows red visual feedback ("Falsch") when a guess does not match the target year.
   * @param {{ guessedYear: number, attemptNumber: number }} status
   */
  showWrongGuessFeedback(status) {
    const { feedbackBox } = this.elements;
    if (!feedbackBox) return;

    feedbackBox.classList.remove("hidden", "feedback-shake");
    // Trigger reflow to restart animation on repeated wrong guesses
    void feedbackBox.offsetWidth;
    feedbackBox.classList.add("feedback-shake");

    feedbackBox.innerHTML = `
      <span class="feedback-wrong-title">Falsch</span>
      <span class="feedback-wrong-detail">(${status.guessedYear} ist nicht das gesuchte Jahr – Versuch #${status.attemptNumber})</span>
    `;
  }

  /**
   * Hides the wrong guess feedback message.
   */
  clearFeedback() {
    const { feedbackBox } = this.elements;
    if (!feedbackBox) return;
    feedbackBox.classList.add("hidden");
    feedbackBox.classList.remove("feedback-shake");
    feedbackBox.textContent = "";
  }

  /**
   * Populates and displays the Solution Screen with the round's correct year and metadata.
   */
  renderSolutionScreen() {
    const round = this.gameState.currentRound;
    if (!round) return;

    const targetYear =
      round.target_year !== undefined ? Number(round.target_year) : Number(round.year);

    const {
      solutionStatusBadge,
      solutionCorrectYear,
      solutionEraLabel,
      solutionMetaSource,
      solutionMetaFeatures,
      solutionMetaGuessInfo,
    } = this.elements;

    if (solutionCorrectYear) {
      solutionCorrectYear.textContent = String(targetYear);
    }

    if (solutionEraLabel) {
      solutionEraLabel.textContent =
        targetYear < 0 ? `${Math.abs(targetYear)} v. Chr.` : `Jahr ${targetYear} n. Chr.`;
    }

    if (solutionStatusBadge) {
      if (this.gameState.solvedByGuess) {
        solutionStatusBadge.textContent = "Exakt erraten!";
        solutionStatusBadge.className = "solution-badge badge-success";
      } else {
        solutionStatusBadge.textContent = "Aufgelöst";
        solutionStatusBadge.className = "solution-badge badge-neutral";
      }
    }

    if (solutionMetaSource) {
      const sourceLabel =
        round.source === "CShapes"
          ? "CShapes 2.0 (Stichtag: 1. Juli)"
          : "historical-basemaps (GitHub)";
      solutionMetaSource.textContent = sourceLabel;
    }

    if (solutionMetaFeatures) {
      solutionMetaFeatures.textContent = `${round.feature_count || "–"} Polygone`;
    }

    if (solutionMetaGuessInfo) {
      if (this.gameState.solvedByGuess) {
        solutionMetaGuessInfo.textContent = `Treffer im ${this.gameState.attempts}. Versuch`;
      } else if (this.gameState.lastGuessStatus) {
        const diff = Math.abs(this.gameState.lastGuessStatus.diff);
        solutionMetaGuessInfo.textContent = `Letzter Tipp: ${this.gameState.lastGuessStatus.guessedYear} (Abweichung: ${diff} Jahre)`;
      } else {
        solutionMetaGuessInfo.textContent = "Direkt aufgelöst (ohne Tipp)";
      }
    }

    this.showScreen(SCREENS.SOLUTION);
  }

  /**
   * Updates the loading overlay while a TopoJSON file is being fetched/parsed.
   * @param {boolean} isLoading
   * @param {string} [message]
   */
  setLoading(isLoading, message = "Historische Karte wird geladen...") {
    const { loadingIndicator } = this.elements;
    if (!loadingIndicator) return;
    loadingIndicator.textContent = message;
    loadingIndicator.classList.toggle("hidden", !isLoading);
  }

  /**
   * Updates the manifest badge on the dashboard once manifest.json is loaded.
   * @param {number} count
   */
  setManifestLoadedCount(count) {
    const { manifestBadge } = this.elements;
    if (manifestBadge) {
      manifestBadge.textContent = `${count} historische Weltkarten bereit`;
    }
  }

  /**
   * Updates the floating polygon hover badge.
   * On the Solution Screen, shows the historical state/territory name & capital.
   * On the Game Screen, shows subtle polygon selection feedback.
   * @param {Object|null} feature
   */
  updatePolygonHoverBadge(feature) {
    const { polygonTooltip } = this.elements;
    if (!polygonTooltip) return;

    if (!feature || !feature.properties) {
      polygonTooltip.classList.add("hidden");
      return;
    }

    const { _entityName, _capital, _isNamed } = feature.properties;
    if (!_isNamed || !_entityName) {
      polygonTooltip.classList.add("hidden");
      return;
    }

    if (this.gameState.currentScreen === SCREENS.SOLUTION) {
      const capText = _capital ? ` • Hauptstadt: ${_capital}` : "";
      polygonTooltip.textContent = `${_entityName}${capText}`;
      polygonTooltip.classList.remove("hidden");
    } else {
      polygonTooltip.textContent = `Territorium: ${_entityName}`;
      polygonTooltip.classList.remove("hidden");
    }
  }
}
