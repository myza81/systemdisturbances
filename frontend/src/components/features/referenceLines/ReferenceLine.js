/**
 * ReferenceLine - Data structure for reference lines
 * Represents a horizontal or vertical line used for waveform analysis
 */
export class ReferenceLine {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.id - Unique identifier
   * @param {'horizontal'|'vertical'} options.type - Type of line
   * @param {number} options.value - Value (Y for horizontal, X for vertical/time)
   * @param {'left'|'right'} [options.axis='left'] - Axis reference (for horizontal lines)
   * @param {string} [options.color='#888888'] - Line color
   * @param {boolean} [options.visible=true] - Visibility flag
   */
  constructor({ id, type, value, axis = 'left', color = '#888888', visible = true } = {}) {
    if (!id) throw new Error('ReferenceLine requires an id');
    if (!type || !['horizontal', 'vertical'].includes(type)) {
      throw new Error('ReferenceLine type must be "horizontal" or "vertical"');
    }
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('ReferenceLine value must be a valid number');
    }
    
    this.id = id;
    this.type = type; // 'horizontal' or 'vertical'
    this.value = value; // Y value for horizontal, X/time value for vertical
    this.axis = axis; // 'left' or 'right' (for horizontal lines)
    this.color = color; // CSS color string
    this.visible = visible; // Boolean visibility flag
  }
  
  /**
   * Create a copy of this ReferenceLine with optional overrides
   * @param {Object} overrides - Properties to override
   * @returns {ReferenceLine} New ReferenceLine instance
   */
  clone(overrides = {}) {
    return new ReferenceLine({
      id: this.id,
      type: this.type,
      value: this.value,
      axis: this.axis,
      color: this.color,
      visible: this.visible,
      ...overrides
    });
  }
  
  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      type: this.type,
      value: this.value,
      axis: this.axis,
      color: this.color,
      visible: this.visible
    };
  }
  
  /**
   * Create ReferenceLine from plain object
   * @param {Object} obj - Plain object with line properties
   * @returns {ReferenceLine} New ReferenceLine instance
   */
  static fromObject(obj) {
    return new ReferenceLine(obj);
  }
}

export default ReferenceLine;