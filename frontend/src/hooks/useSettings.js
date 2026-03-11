/**
 * useSettings
 * Manages global app settings (phase colors, theme) from localStorage
 * and syncs to backend /api/v1/settings/ when changed.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

export const DEFAULT_SETTINGS = {
  phaseColors: {
    R: '#ff4444',
    Y: '#ffcc00',
    B: '#4488ff',
    N: '#44ff88',
    default: '#aaaaaa',
  },
  theme: {
    background: '#0d1117',
    gridColor: '#21262d',
    textColor: '#8b949e',
    cursorAColor: '#ff6b6b',
    cursorBColor: '#4ecdc4',
    digitalHighColor: '#39ff14',
    digitalLowColor: '#333333',
  },
  display: {
    showRmsOverlay: false,
    defaultWindowMs: 500,
  },
};

const STORAGE_KEY = 'waveform_app_settings';

function deepMerge(base, overrides) {
  const result = { ...base };
  for (const key of Object.keys(overrides || {})) {
    if (
      typeof overrides[key] === 'object' &&
      overrides[key] !== null &&
      !Array.isArray(overrides[key])
    ) {
      result[key] = deepMerge(base[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? deepMerge(DEFAULT_SETTINGS, JSON.parse(stored)) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Sync to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((path, value) => {
    setSettings(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // deep clone
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  const getPhaseColor = useCallback(
    (phase) => {
      if (!phase) return settings.phaseColors.default;
      return settings.phaseColors[phase] || settings.phaseColors.default;
    },
    [settings.phaseColors]
  );

  // Sync to backend (non-blocking, best effort)
  const syncToBackend = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch {
      // offline - that's ok
    }
  }, [settings]);

  return { settings, updateSettings, getPhaseColor, syncToBackend };
}
