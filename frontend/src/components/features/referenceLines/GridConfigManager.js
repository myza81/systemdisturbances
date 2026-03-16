/**
 * GridConfigManager - Singleton service for managing layering grid configurations
 * Handles storage, retrieval, and updates of major and minor grid settings for X and Y axes
 */

class GridConfigManager {
  constructor() {
    if (GridConfigManager.instance) {
      return GridConfigManager.instance;
    }

    // Default configuration
    this.config = {
      x: {
        major: { show: true, interval: null, color: '#f1f5f9', type: 'dashed', opacity: 0.5 },
        minor: { show: false, interval: null, color: '#f1f5f9', type: 'dotted', opacity: 0.2 },
      },
      y: {
        major: { show: true, interval: null, color: '#f1f5f9', type: 'solid', opacity: 0.3 },
        minor: { show: false, interval: null, color: '#f1f5f9', type: 'dotted', opacity: 0.1 },
      }
    };

    this.listeners = new Set();
    
    // Load from sessionStorage if available
    this.load();

    GridConfigManager.instance = this;
  }

  /**
   * Add a listener for config changes
   * @param {Function} callback - Function to call when config changes
   * @returns {Function} Unsubscribe function
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of changes
   * @private
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.config);
      } catch (err) {
        console.error('Error in grid config listener:', err);
      }
    });
    this.save();
  }

  /**
   * Update grid configuration
   * @param {string} axis - 'x' or 'y'
   * @param {string} type - 'major' or 'minor'
   * @param {Object} updates - Properties to update
   */
  updateConfig(axis, type, updates) {
    if (!this.config[axis] || !this.config[axis][type]) return;

    this.config[axis][type] = {
      ...this.config[axis][type],
      ...updates
    };

    this.notifyListeners();
  }

  /**
   * Get the current configuration
   * @returns {Object} Current grid config
   */
  getConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Save configuration to sessionStorage
   * @private
   */
  save() {
    try {
      sessionStorage.setItem('layering_grid_config', JSON.stringify(this.config));
    } catch (e) {
      // Ignore sessionStorage quota errors
    }
  }

  /**
   * Load configuration from sessionStorage
   * @private
   */
  load() {
    try {
      const stored = sessionStorage.getItem('layering_grid_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge to ensure structure integrity
        this.config = {
          x: { ...this.config.x, ...parsed.x },
          y: { ...this.config.y, ...parsed.y },
        };
      }
    } catch (e) {
      // Ignore JSON errors
    }
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this.config = {
      x: {
        major: { show: true, interval: null, color: '#f1f5f9', type: 'dashed', opacity: 0.5 },
        minor: { show: false, interval: null, color: '#f1f5f9', type: 'dotted', opacity: 0.2 },
      },
      y: {
        major: { show: true, interval: null, color: '#f1f5f9', type: 'solid', opacity: 0.3 },
        minor: { show: false, interval: null, color: '#f1f5f9', type: 'dotted', opacity: 0.1 },
      }
    };
    this.notifyListeners();
  }
}

const gridConfigManager = new GridConfigManager();
Object.freeze(gridConfigManager);

export default gridConfigManager;
