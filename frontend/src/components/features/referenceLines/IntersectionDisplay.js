/**
 * IntersectionDisplay - Handles visualization of intersection points between reference lines and waveforms
 * Draws markers at intersection points and manages hover tooltips with coordinate information
 */
import { INTERSECTION_MARKER_DEFAULTS, TOOLTIP_DEFAULTS } from './constants.js';

class IntersectionDisplay {
  /**
   * Render intersection markers on an ECharts instance
   * @param {Object} echartsInstance - Initialized ECharts instance
   * @param {Array} intersections - Array of intersection points from IntersectionCalculator
   * @param {ReferenceLine} referenceLine - The reference line that these intersections belong to
   */
  static renderIntersections(echartsInstance, intersections, referenceLine) {
    if (!echartsInstance || echartsInstance.isDisposed()) {
      return;
    }

    // Clear existing intersection markers
    this.clear(echartsInstance);

    // Don't render if no intersections
    if (!intersections || intersections.length === 0) {
      return;
    }

    const graphicElements = [];

    intersections.forEach((intersection, index) => {
      // Skip if we don't have valid time or value
      if (intersection.time === null || intersection.time === undefined || 
          intersection.value === null || intersection.value === undefined) {
        return;
      }

      let graphicElement = null;

      if (referenceLine.type === 'horizontal') {
        graphicElement = this._createHorizontalIntersectionMarker(
          echartsInstance, 
          intersection, 
          referenceLine,
          index
        );
      } else if (referenceLine.type === 'vertical') {
        // For vertical lines, we create one marker per signal at the intersection time
        // But we'll handle this differently - vertical line intersections are shown as a group
        // The vertical line tooltip will show all signal values at that time
        // So we don't need individual markers for each signal in the vertical case
        return;
      }

      if (graphicElement) {
        graphicElements.push(graphicElement);
      }
    });

    // Add all graphics to the chart
    if (graphicElements.length > 0) {
      echartsInstance.setOption({
        graphic: graphicElements
      }, { notMerge: true, silent: true });
    }
  }

  /**
   * Create a horizontal intersection marker (point where horizontal line crosses signal)
   * @private
   */
  static _createHorizontalIntersectionMarker(echartsInstance, intersection, referenceLine, index) {
    try {
      // Convert time/value to pixel coordinates
      const point = echartsInstance.convertToPixel({ gridIndex: 0 }, [intersection.time, intersection.value]);
      
      if (!point || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        return null;
      }

      const [xPixel, yPixel] = point;

      return {
        id: `intersection-marker-${referenceLine.id}-${index}`,
        type: 'circle',
        silent: false, // Enable interaction for tooltips
        shape: {
          cx: xPixel,
          cy: yPixel,
          r: INTERSECTION_MARKER_DEFAULTS.size
        },
        style: {
          fill: INTERSECTION_MARKER_DEFAULTS.color,
          stroke: INTERSECTION_MARKER_DEFAULTS.borderColor,
          lineWidth: INTERSECTION_MARKER_DEFAULTS.borderWidth,
          opacity: 0.9
        },
        z: 101, // Above reference lines but below highest interactive elements
        // Store data for tooltip and interaction
        intersectionData: intersection,
        referenceLineId: referenceLine.id
      };
    } catch (e) {
      console.error('Error creating intersection marker:', e);
      return null;
    }
  }

  /**
   * Create a vertical line intersection display (grouped tooltip showing all signals at time)
   * For vertical lines, we don't create individual markers for each signal
   * Instead, we enhance the tooltip to show all signal values at that time
   * This method is a placeholder - the actual implementation would modify tooltip behavior
   * @private
   */
  static _createVerticalIntersectionDisplay(echartsInstance, intersections, referenceLine) {
    // For vertical lines, we don't create individual markers
    // The intersection information will be shown in the tooltip when hovering over the line
    // This function exists for API consistency but doesn't create graphics
    return null;
  }

  /**
   * Clear all intersection marker graphics from the chart
   * @param {Object} echartsInstance - Initialized ECharts instance
   */
  static clear(echartsInstance) {
    if (!echartsInstance || echartsInstance.isDisposed()) {
      return;
    }

    // Get current option
    const option = echartsInstance.getOption();
    if (!option) return;

    // Filter out intersection marker graphics
    const filteredGraphics = option.graphic && Array.isArray(option.graphic) 
      ? option.graphic.filter(item => !(item.id && typeof item.id === 'string' && item.id.startsWith('intersection-marker-')))
      : [];
    
    // Set option with filtered graphics (removing intersection markers)
    echartsInstance.setOption({
      graphic: filteredGraphics
    }, { notMerge: true, silent: true });
  }

  /**
   * Format tooltip content for horizontal line intersections
   * @param {Object} intersection - Intersection point data
   * @param {ReferenceLine} referenceLine - The reference line
   * @returns {string} HTML formatted tooltip content
   */
  static formatHorizontalTooltip(intersection, referenceLine) {
    const timeStr = Number(intersection.time).toFixed(3);
    const valueStr = Number(intersection.value).toFixed(4);
    const signalName = intersection.signalName || `Signal ${intersection.signalIndex}`;
    const signalType = intersection.signalType || 'unknown';
    const isExact = intersection.isExact ? '(exact)' : '(interpolated)';
    
    return `
      <div style="font-weight:700;margin-bottom:6px;color:#006064;border-bottom:1px solid #f1f5f9;padding-bottom:4px">
        ${timeStr} s
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:2px;background:${referenceLine.color};display:inline-block"></span>
          <span style="color:#64748b;font-size:10px">Signal: ${signalName} (${signalType}) ${isExact}</span>
        </div>
        <span style="color:#0f172a;font-weight:700;font-family:var(--font-mono)">${valueStr} pu</span>
      </div>
    `;
  }

  /**
   * Format tooltip content for vertical line intersections (showing all signals at time)
   * @param {Object} signalValues - Map of signal names to values at the intersection time
   * @param {ReferenceLine} referenceLine - The reference line
   * @param {number} time - The time of the vertical line
   * @returns {string} HTML formatted tooltip content
   */
  static formatVerticalTooltip(signalValues, referenceLine, time) {
    const timeStr = Number(time).toFixed(3);
    
    let rows = '';
    for (const [signalName, value] of Object.entries(signalValues)) {
      if (value === null || value === undefined) continue;
      
      const valueStr = typeof value === 'number' ? value.toFixed(4) : String(value);
      rows += `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:2px;background:#64748b;display:inline-block"></span>
            <span style="color:#64748b;font-size:10px">${signalName}</span>
          </div>
          <span style="color:#0f172a;font-weight:700;font-family:var(--font-mono)">${valueStr} pu</span>
        </div>
      `;
    }
    
    return `
      <div style="font-weight:700;margin-bottom:6px;color:#006064;border-bottom:1px solid #f1f5f9;padding-bottom:4px">
        Time = ${timeStr} s
      </div>
      ${rows}
    `;
  }

  /**
   * Set up hover listeners for intersection markers
   * @param {Object} echartsInstance - Initialized ECharts instance
   * @param {Function} onIntersectionHover - Callback when hovering over intersection marker
   * @param {Function} onIntersectionHoverEnd - Callback when hover ends
   */
  static setupHoverListeners(echartsInstance, onIntersectionHover, onIntersectionHoverEnd) {
    const zr = echartsInstance.getZr();
    
    let hoverTimeout = null;
    const HOVER_DELAY = 100; // ms delay before showing tooltip to prevent flickering
    
    // Mouse move handler for detecting hover over intersection markers
    zr.on('mousemove', (event) => {
      // Clear any existing timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
      
      // Set timeout to delay hover effect
      hoverTimeout = setTimeout(() => {
        const { offsetX, offsetY } = event;
        
        // Find intersection marker at current position
        const items = zr.storage.getDisplayList();
        let hoveredMarker = null;
        
        for (const item of items) {
          if (item.id && typeof item.id === 'string' && item.id.startsWith('intersection-marker-') && item.intersectionData) {
            // Check if point is near the marker (within marker radius + tolerance)
            const dx = offsetX - item.shape.cx;
            const dy = offsetY - item.shape.cy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= (INTERSECTION_MARKER_DEFAULTS.size + 5)) { // 5px tolerance
              hoveredMarker = item;
              break;
            }
          }
        }
        
        if (hoveredMarker) {
          // Show tooltip for the hovered intersection marker
          if (onIntersectionHover) {
            onIntersectionHover(hoveredMarker.intersectionData, hoveredMarker.referenceLineId);
          }
          
          // Change cursor to pointer to indicate interactivity
          zr.setCursorStyle('pointer');
        } else {
          // Hide tooltip when not hovering over any marker
          if (onIntersectionHoverEnd) {
            onIntersectionHoverEnd();
          }
          
          // Reset cursor
          zr.setCursorStyle('default');
        }
      }, HOVER_DELAY);
    });
    
    // Mouse out handler
    zr.on('mouseout', () => {
      // Clear hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      // Hide tooltip
      if (onIntersectionHoverEnd) {
        onIntersectionHoverEnd();
      }
      
      // Reset cursor
      zr.setCursorStyle('default');
    });
  }
}

export default IntersectionDisplay;