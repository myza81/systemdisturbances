/**
 * ReferenceLineManager - Singleton service for managing reference lines
 * Handles storage, retrieval, and manipulation of reference lines
 */
import ReferenceLine from './ReferenceLine.js';
import { REFERENCE_LINE_DEFAULTS } from './constants.js';

class ReferenceLineManager {
  constructor() {
    // Ensure singleton pattern
    if (ReferenceLineManager.instance) {
      return ReferenceLineManager.instance;
    }
    
    this.lines = new Map(); // id -> ReferenceLine
    this.listeners = new Set(); // Set of callback functions
    this.MAX_LINES = 20; // Maximum recommended lines for performance
    
    ReferenceLineManager.instance = this;
  }
  
  /**
   * Add a listener for line collection changes
   * @param {Function} callback - Function to call when lines change
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
    const linesArray = Array.from(this.lines.values());
    this.listeners.forEach(callback => {
      try {
        callback(linesArray);
      } catch (err) {
        console.error('Error in reference line listener:', err);
      }
    });
  }
  
  /**
   * Add a new reference line
   * @param {ReferenceLine|Object} line - ReferenceLine instance or options object
   * @returns {ReferenceLine} The added line
   * @throws {Error} If maximum lines exceeded or invalid line
   */
  addLine(line) {
    // Convert to ReferenceLine instance if needed
    const referenceLine = line instanceof ReferenceLine 
      ? line 
      : new ReferenceLine(line);
    
    // Check maximum lines limit
    if (this.lines.size >= this.MAX_LINES) {
      throw new Error(`Maximum of ${this.MAX_LINES} reference lines exceeded`);
    }
    
    // Check for duplicate ID
    if (this.lines.has(referenceLine.id)) {
      throw new Error(`Reference line with ID '${referenceLine.id}' already exists`);
    }
    
    // Add line and notify listeners
    this.lines.set(referenceLine.id, referenceLine);
    this.notifyListeners();
    
    return referenceLine;
  }
  
  /**
   * Remove a reference line by ID
   * @param {string} id - Line ID to remove
   * @returns {boolean} True if line was removed, false if not found
   */
  removeLine(id) {
    const existed = this.lines.delete(id);
    if (existed) {
      this.notifyListeners();
    }
    return existed;
  }
  
  /**
   * Update an existing reference line
   * @param {string} id - Line ID to update
   * @param {Object} updates - Properties to update
   * @returns {ReferenceLine} The updated line
   * @throws {Error} If line not found
   */
  updateLine(id, updates) {
    const line = this.lines.get(id);
    if (!line) {
      throw new Error(`Reference line with ID '${id}' not found`);
    }
    
    // Create updated line
    const updatedLine = line.clone(updates);
    
    // Replace in map
    this.lines.set(id, updatedLine);
    this.notifyListeners();
    
    return updatedLine;
  }
  
  /**
   * Get a reference line by ID
   * @param {string} id - Line ID to retrieve
   * @returns {ReferenceLine|null} The line or null if not found
   */
  getLine(id) {
    return this.lines.get(id) || null;
  }
  
  /**
   * Get all reference lines
   * @returns {ReferenceLine[]} Array of all lines
   */
  getAllLines() {
    return Array.from(this.lines.values());
  }
  
  /**
   * Get horizontal lines only
   * @returns {ReferenceLine[]} Array of horizontal lines
   */
  getHorizontalLines() {
    return this.getAllLines().filter(line => line.type === 'horizontal');
  }
  
  /**
   * Get vertical lines only
   * @returns {ReferenceLine[]} Array of vertical lines
   */
  getVerticalLines() {
    return this.getAllLines().filter(line => line.type === 'vertical');
  }
  
  /**
   * Toggle visibility of a line
   * @param {string} id - Line ID to toggle
   * @returns {ReferenceLine} The updated line
   * @throws {Error} If line not found
   */
  toggleLineVisibility(id) {
    const line = this.lines.get(id);
    if (!line) {
      throw new Error(`Reference line with ID '${id}' not found`);
    }
    
    return this.updateLine(id, { visible: !line.visible });
  }
  
  /**
   * Clear all reference lines
   */
  clearAllLines() {
    this.lines.clear();
    this.notifyListeners();
  }
  
  /**
   * Get count of reference lines
   * @returns {number} Number of lines
   */
  getLineCount() {
    return this.lines.size;
  }
  
  /**
   * Check if maximum lines have been reached
   * @returns {boolean} True if at maximum capacity
   */
  isAtMaxCapacity() {
    return this.lines.size >= this.MAX_LINES;
  }
  
  /**
   * Get remaining capacity
   * @returns {number} Number of lines that can still be added
   */
  getRemainingCapacity() {
    return Math.max(0, this.MAX_LINES - this.lines.size);
  }
}

// Export singleton instance
const referenceLineManager = new ReferenceLineManager();
Object.freeze(referenceLineManager);

export default referenceLineManager;
export { ReferenceLineManager };