/**
 * Constants for Reference Lines feature
 */

/**
 * Default styles for reference lines
 */
export const REFERENCE_LINE_DEFAULTS = {
  // Horizontal line styles
  HORIZONTAL: {
    type: 'dashed',
    color: '#888888',
    width: 1.5
  },
  
  // Vertical line styles
  VERTICAL: {
    type: 'dotted',
    color: '#888888',
    width: 1.5
  },
  
  // Default visibility
  DEFAULT_VISIBLE: true
};

/**
 * Marker styles for intersection points
 */
export const INTERSECTION_MARKER_DEFAULTS = {
  size: 6,
  color: '#ff6b6b', // Red color for high visibility
  borderColor: '#ffffff',
  borderWidth: 1,
  hoverSize: 8
};

/**
 * Tooltip styles
 */
export const TOOLTIP_DEFAULTS = {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderColor: '#e2e8f0',
  textColor: '#0f172a',
  fontSize: 11,
  fontWeight: 'normal',
  padding: '8px 12px'
};

/**
 * Animation and interaction constants
 */
export const INTERACTION_CONSTANTS = {
  // Dragging sensitivity (pixels)
  DRAG_SENSITIVITY: 5,
  
  // Snap increments for dragging (can be adjusted based on value ranges)
  HORIZONTAL_SNAP_INCREMENT: 0.01, // For pu values
  VERTICAL_SNAP_INCREMENT: 0.001,  // For time in seconds
  
  // Debounce timers (ms)
  VALUE_UPDATE_DEBOUNCE: 100,
  RENDER_UPDATE_DEBOUNCE: 50
};

/**
 * Validation constants
 */
export const VALIDATION_CONSTANTS = {
  // Value ranges (can be adjusted based on actual data ranges)
  MIN_HORIZONTAL_VALUE: -10, // pu
  MAX_HORIZONTAL_VALUE: 10,  // pu
  MIN_VERTICAL_VALUE: 0,     // seconds
  MAX_VERTICAL_VALUE: 600    // seconds (10 minutes)
};