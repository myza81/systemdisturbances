/**
 * RulerManager - Singleton service for managing the layering ruler
 * Handles the offset and visibility of the auxiliary X-axis
 */

class RulerManager {
  constructor() {
    if (RulerManager.instance) {
      return RulerManager.instance;
    }

    // Default configuration
    this.config = {
      enabled: false,
      offsetMs: 0,
      color: '#006064',
      handlePos: 0, // Current pixel position on the chart
    };

    this.listeners = new Set();
    
    // Load from sessionStorage if available
    this.load();

    RulerManager.instance = this;
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.config);
      } catch (err) {
        console.error('Error in ruler manager listener:', err);
      }
    });
    this.save();
  }

  updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates
    };
    this.notifyListeners();
  }

  getConfig() {
    return { ...this.config };
  }

  save() {
    try {
      // Don't persist handlePos as it depends on container size
      const toSave = { ...this.config };
      delete toSave.handlePos;
      sessionStorage.setItem('layering_ruler_config', JSON.stringify(toSave));
    } catch (e) {
      // Ignore
    }
  }

  load() {
    try {
      const stored = sessionStorage.getItem('layering_ruler_config');
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (e) {
      // Ignore
    }
  }

  reset() {
    this.config = {
      enabled: false,
      offsetMs: 0,
      color: '#006064',
      handlePos: 0,
    };
    this.notifyListeners();
  }
}

const rulerManager = new RulerManager();

export default rulerManager;
