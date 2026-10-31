/**
 * GameState: Manages current screen, active round, user guess, and attempt history.
 */

import { CONFIG } from "../config.js";

export const SCREENS = {
  DASHBOARD: "dashboard",
  GAME: "game",
  SOLUTION: "solution",
};

export class GameState {
  constructor() {
    this.manifest = [];
    this.currentScreen = SCREENS.DASHBOARD;
    this.currentRound = null;
    this.lastRoundId = null;
    this.guessedYear = CONFIG.DEFAULT_YEAR;
    this.attempts = 0;
    this.lastGuessStatus = null; // null | { correct: boolean, guessedYear: number, diff: number }
    this.solvedByGuess = false;
    this.listeners = new Set();
  }

  /**
   * Initializes state with the loaded manifest array.
   * @param {Array<Object>} manifest
   */
  setManifest(manifest) {
    this.manifest = Array.isArray(manifest) ? manifest : [];
  }

  /**
   * Subscribe to state changes.
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(eventType = "change") {
    for (const listener of this.listeners) {
      listener(this, eventType);
    }
  }

  /**
   * Navigates to the Dashboard screen.
   */
  goToDashboard() {
    this.currentScreen = SCREENS.DASHBOARD;
    this.lastGuessStatus = null;
    this.notify("screen");
  }

  /**
   * Picks a random round from manifest.json (avoiding immediate repeat if > 1 available)
   * and resets the round state.
   * @returns {Object} The selected round object
   */
  startNewRound() {
    if (!this.manifest || this.manifest.length === 0) {
      throw new Error("Keine Karten im Manifest verfügbar.");
    }

    let pool = this.manifest;
    if (pool.length > 1 && this.lastRoundId !== null) {
      pool = pool.filter((r) => r.id !== this.lastRoundId);
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedRound = pool[randomIndex];

    this.currentRound = selectedRound;
    this.lastRoundId = selectedRound.id;
    this.currentScreen = SCREENS.GAME;
    this.guessedYear = CONFIG.DEFAULT_YEAR;
    this.attempts = 0;
    this.lastGuessStatus = null;
    this.solvedByGuess = false;

    this.notify("new_round");
    return selectedRound;
  }

  /**
   * Updates the currently selected year (clamped to valid range).
   * @param {number|string} yearValue
   * @returns {number}
   */
  setGuessedYear(yearValue) {
    const parsed = parseInt(yearValue, 10);
    if (Number.isNaN(parsed)) {
      return this.guessedYear;
    }
    const clamped = Math.max(CONFIG.YEAR_MIN, Math.min(CONFIG.YEAR_MAX, parsed));
    this.guessedYear = clamped;
    this.notify("year_change");
    return this.guessedYear;
  }

  /**
   * Evaluates the current guessedYear against the active round's target year in manifest.json.
   * If exact match -> transitions to SOLUTION screen.
   * Otherwise -> records wrong attempt and emits feedback event.
   * @returns {{ correct: boolean, guessedYear: number, targetYear: number, diff: number }}
   */
  submitGuess() {
    if (!this.currentRound) {
      throw new Error("Keine aktive Runde vorhanden.");
    }

    const targetYear = Number(
      this.currentRound.target_year !== undefined
        ? this.currentRound.target_year
        : this.currentRound.year
    );
    const guessedYear = Number(this.guessedYear);
    const diff = guessedYear - targetYear;
    const correct = guessedYear === targetYear;

    this.attempts += 1;
    this.lastGuessStatus = {
      correct,
      guessedYear,
      targetYear,
      diff,
      attemptNumber: this.attempts,
    };

    if (correct) {
      this.solvedByGuess = true;
      this.currentScreen = SCREENS.SOLUTION;
      this.notify("solution");
    } else {
      this.notify("wrong_guess");
    }

    return this.lastGuessStatus;
  }

  /**
   * Skips guessing and opens the solution screen directly ("Auflösen").
   */
  revealSolution() {
    if (!this.currentRound) {
      return;
    }
    this.solvedByGuess = false;
    this.currentScreen = SCREENS.SOLUTION;
    this.notify("solution");
  }
}
