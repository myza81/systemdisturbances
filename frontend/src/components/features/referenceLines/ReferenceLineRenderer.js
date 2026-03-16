/**
 * ReferenceLineRenderer - Handles rendering of reference lines on ECharts
 * Draws horizontal and vertical lines as graphic elements in ECharts
 */
import { REFERENCE_LINE_DEFAULTS } from './constants.js';

class ReferenceLineRenderer {
  /**
   * Render reference lines on an ECharts instance
   * @param {Object} echartsInstance - Initialized ECharts instance
   * @param {ReferenceLine[]} lines - Array of reference lines to render
   * @param {Object} options - Additional options (callbacks for interaction)
   */
  static render(echartsInstance, lines, options = {}) {
    if (!echartsInstance || echartsInstance.isDisposed()) {
      return;
    }

    // Don't render if no lines
    if (!lines || lines.length === 0) {
      return;
    }

    const graphicElements = [];

    lines.forEach(line => {
      if (!line.visible) return;

      let graphicElement = null;

      if (line.type === 'horizontal') {
        graphicElement = this._createHorizontalLine(line, echartsInstance);
      } else if (line.type === 'vertical') {
        graphicElement = this._createVerticalLine(line, echartsInstance);
      }

      if (graphicElement) {
        // Add data for interaction handling
        graphicElement.lineId = line.id;
        graphicElement.lineType = line.type;
        graphicElements.push(graphicElement);
      }
    });

    // Add all graphics to the chart
    echartsInstance.setOption({
      graphic: graphicElements
    }, { notMerge: true, silent: true });

    // Set up event listeners for interaction if callbacks provided
    if (options.onLineDragStart || options.onLineDrag || options.onLineDragEnd) {
      this._setupInteractionListeners(echartsInstance, lines, options);
    }
  }

  /**
   * Create a horizontal line graphic element
   * @private
   */
  static _createHorizontalLine(line, echartsInstance) {
    const option = echartsInstance.getOption();
    if (!option || !option.grid || !Array.isArray(option.grid) || option.grid.length === 0) {
      return null;
    }
    
    // Detect which grid to use. For now, we use the first grid.
    // In layering view, there are multiple grids (one per group).
    const gridIdx = 0;
    const grid = option.grid[gridIdx];
    
    // Get Y-pixel using coordinate system
    // Using {gridIndex: 0} is standard for cartesian
    const point = echartsInstance.convertToPixel({ gridIndex: gridIdx }, [0, line.value]);
    
    if (!point || !Number.isFinite(point[1])) {
      return null;
    }

    const yPx = point[1];
    const width = echartsInstance.getWidth();
    
    // Calculate horizontal pixel range
    // If grid.left/right are numbers (pixels), use them.
    // Otherwise fallback to something sensible or try to convert.
    let x1 = 0;
    let x2 = width;

    if (typeof grid.left === 'number') {
      x1 = grid.left;
    } else {
      // Fallback: try to convert data extremes
      const pStart = echartsInstance.convertToPixel({ gridIndex: gridIdx }, [option.xAxis[gridIdx]?.min || 0, 0]);
      if (pStart) x1 = pStart[0];
    }

    if (typeof grid.right === 'number') {
      x2 = width - grid.right;
    } else if (typeof grid.width === 'number') {
      x2 = x1 + grid.width;
    } else {
      const pEnd = echartsInstance.convertToPixel({ gridIndex: gridIdx }, [option.xAxis[gridIdx]?.max || 1000000, 0]);
      if (pEnd) x2 = pEnd[0];
    }

    return {
      id: `reference-line-${line.id}`,
      type: 'line',
      silent: false,
      shape: {
        x1: x1,
        y1: yPx,
        x2: x2,
        y2: yPx
      },
      style: {
        stroke: line.color,
        lineWidth: REFERENCE_LINE_DEFAULTS.HORIZONTAL.width,
        lineDash: REFERENCE_LINE_DEFAULTS.HORIZONTAL.type === 'dashed' ? [4, 4] : [],
        opacity: 0.8
      },
      z: 100
    };
  }

  /**
   * Create a vertical line graphic element
   * @private
   */
  static _createVerticalLine(line, echartsInstance) {
    const option = echartsInstance.getOption();
    if (!option || !option.grid || !Array.isArray(option.grid) || option.grid.length === 0) {
      return null;
    }
    
    const gridIdx = 0;
    const grid = option.grid[gridIdx];
    
    // Get X-pixel using coordinate system
    const point = echartsInstance.convertToPixel({ gridIndex: gridIdx }, [line.value, 0]);
    
    if (!point || !Number.isFinite(point[0])) {
      return null;
    }

    const xPx = point[0];
    const height = echartsInstance.getHeight();
    
    // Calculate vertical pixel range
    let y1 = 0;
    let y2 = height;

    if (typeof grid.top === 'number') {
      y1 = grid.top;
    }

    if (typeof grid.bottom === 'number') {
      y2 = height - grid.bottom;
    } else if (typeof grid.height === 'number') {
      y2 = y1 + grid.height;
    }

    return {
      id: `reference-line-${line.id}`,
      type: 'line',
      silent: false,
      shape: {
        x1: xPx,
        y1: y1,
        x2: xPx,
        y2: y2
      },
      style: {
        stroke: line.color,
        lineWidth: REFERENCE_LINE_DEFAULTS.VERTICAL.width,
        lineDash: REFERENCE_LINE_DEFAULTS.VERTICAL.type === 'dotted' ? [2, 2] : [],
        opacity: 0.8
      },
      z: 100
    };
  }

  /**
   * Clear all reference line graphics from the chart
   * @param {Object} echartsInstance - Initialized ECharts instance
   */
  static clear(echartsInstance) {
    if (!echartsInstance || echartsInstance.isDisposed()) {
      return;
    }

    // Get current option
    const option = echartsInstance.getOption();
    if (!option) return;

    // Filter out reference line graphics
    const filteredGraphics = option.graphic && Array.isArray(option.graphic) 
      ? option.graphic.filter(item => !(item.id && typeof item.id === 'string' && item.id.startsWith('reference-line-')))
      : [];
    
    // Set option with filtered graphics (removing reference lines)
    echartsInstance.setOption({
      graphic: filteredGraphics
    }, { notMerge: true, silent: true });
  }

  /**
   * Set up interaction listeners for reference lines
   * @private
   */
  static _setupInteractionListeners(echartsInstance, lines, options) {
    const zr = echartsInstance.getZr();
    
    let draggingInfo = null; // { lineId, lineType, originalValue, startPosition }
    
    // Hit testing function
    const findLineAtPosition = (x, y) => {
      const items = zr.storage.getDisplayList();
      for (const item of items) {
        if (item.id && typeof item.id === 'string' && item.id.startsWith('reference-line-') && item.lineId) {
          // Check if point is near the line (within 5 pixels tolerance)
          if (item.shape) {
            const distance = this._calculatePointToLineDistance(x, y, item.shape, item.lineType);
            if (distance <= 5) { // 5 pixel tolerance for hitting the line
              return item;
            }
          }
        }
      }
      return null;
    };
    
    // Calculate distance from point to line segment
    const _calculatePointToLineDistance = (px, py, shape, lineType) => {
      if (lineType === 'horizontal') {
        // Distance from point to horizontal line
        return Math.abs(py - shape.y1);
      } else if (lineType === 'vertical') {
        // Distance from point to vertical line
        return Math.abs(px - shape.x1);
      }
      return Infinity;
    };
    
    // Convert pixel coordinates to data values
    const _pixelToData = (echartsInstance, x, y, lineType) => {
      try {
        const point = echartsInstance.convertFromPixel({ seriesIndex: 0 }, [x, y]);
        if (lineType === 'horizontal') {
          return point[1]; // Y value
        } else if (lineType === 'vertical') {
          return point[0]; // X value
        }
      } catch (e) {
        console.error('Error converting pixel to data:', e);
      }
      return null;
    };
    
    // Mouse down handler
    zr.on('mousedown', (event) => {
      const { offsetX, offsetY } = event;
      const item = findLineAtPosition(offsetX, offsetY);
      
      if (item) {
        // Get the line from our manager
        const line = lines.find(l => l.id === item.lineId);
        if (line) {
          draggingInfo = {
            lineId: line.id,
            lineType: line.type,
            originalValue: line.value,
            startPosition: { x: offsetX, y: offsetY }
          };
          
          // Notify drag start
          if (options.onLineDragStart) {
            options.onLineDragStart(line);
          }
          
          // Change cursor to indicate dragging
          zr.setCursorStyle(line.type === 'horizontal' ? 'ns-resize' : 'ew-resize');
        }
      }
    });
    
    // Mouse move handler
    zr.on('mousemove', (event) => {
      if (!draggingInfo) {
        // Check if we're hovering over a line to change cursor
        const { offsetX, offsetY } = event;
        const item = findLineAtPosition(offsetX, offsetY);
        if (item) {
          zr.setCursorStyle(item.lineType === 'horizontal' ? 'ns-resize' : 'ew-resize');
        } else {
          zr.setCursorStyle('default');
        }
        return;
      }
      
      const { offsetX, offsetY } = event;
      const dx = offsetX - draggingInfo.startPosition.x;
      const dy = offsetY - draggingInfo.startPosition.y;
      
      let newValue = draggingInfo.originalValue;
      
      if (draggingInfo.lineType === 'horizontal') {
        // Drag vertically - change Y value
        const yValue = _pixelToData(echartsInstance, offsetX, offsetY + dy, 'horizontal');
        if (yValue !== null) {
          newValue = yValue;
        }
      } else if (draggingInfo.lineType === 'vertical') {
        // Drag horizontally - change X value
        const xValue = _pixelToData(echartsInstance, offsetX + dx, offsetY, 'vertical');
        if (xValue !== null) {
          newValue = xValue;
        }
      }
      
      // Notify drag update
      if (options.onLineDrag && newValue !== draggingInfo.originalValue) {
        options.onLineDrag(draggingInfo.lineId, newValue);
      }
    });
    
    // Mouse up handler
    zr.on('mouseup', (event) => {
      if (draggingInfo) {
        // Notify drag end
        if (options.onLineDragEnd) {
          options.onLineDragEnd(draggingInfo.lineId, referenceLineManager.getLine(draggingInfo.lineId)?.value);
        }
        
        // Reset cursor
        zr.setCursorStyle('default');
        draggingInfo = null;
      }
    });
    
    // Mouse out handler
    zr.on('mouseout', () => {
      if (!draggingInfo) {
        zr.setCursorStyle('default');
      }
    });
  }
}

export default ReferenceLineRenderer;