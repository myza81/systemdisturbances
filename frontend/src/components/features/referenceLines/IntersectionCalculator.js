/**
 * IntersectionCalculator - Calculates intersection points between reference lines and waveform data
 * Handles both horizontal (y=constant) and vertical (x=constant) line intersections
 */
import { VALIDATION_CONSTANTS } from './constants.js';

class IntersectionCalculator {
  /**
   * Calculate intersections for horizontal lines (y = constant)
   * @param {Object} waveformData - Contains time_ms and analog/digital signal data
   * @param {ReferenceLine} line - Horizontal reference line
   * @returns {Array} Array of intersection points { time, value, signalName, signalIndex }
   */
  static calculateHorizontalIntersections(waveformData, line) {
    if (!waveformData || !line || line.type !== 'horizontal') {
      return [];
    }

    const intersections = [];
    const { time_ms, analog = [], digital = [] } = waveformData;
    
    if (!time_ms || time_ms.length === 0) {
      return intersections;
    }

    const threshold = line.value;
    const signalType = line.axis || 'left'; // For horizontal lines, axis indicates which y-axis to use
    
    // Process analog signals
    analog.forEach((signal, signalIndex) => {
      const values = signal.values || [];
      if (values.length !== time_ms.length) return;
      
      for (let i = 0; i < time_ms.length - 1; i++) {
        const v1 = values[i];
        const v2 = values[i + 1];
        const t1 = time_ms[i];
        const t2 = time_ms[i + 1];
        
        // Skip if either value is invalid
        if (v1 === null || v2 === null || v1 === undefined || v2 === undefined) {
          continue;
        }
        
        // Check if signal crosses the threshold
        if ((v1 <= threshold && v2 >= threshold) || (v1 >= threshold && v2 <= threshold)) {
          // Avoid division by zero when signal is flat
          if (v1 === v2) {
            // Signal is exactly at threshold - add both points or just one?
            // We'll add the point at the beginning of the segment
            intersections.push({
              time: t1,
              value: v1,
              signalName: signal.name || `Signal ${signalIndex}`,
              signalIndex: signalIndex,
              signalType: 'analog',
              isExact: true
            });
          } else {
            // Linear interpolation to find exact crossing time
            const tCross = t1 + (threshold - v1) * (t2 - t1) / (v2 - v1);
            const vCross = threshold; // By definition
            
            intersections.push({
              time: tCross,
              value: vCross,
              signalName: signal.name || `Signal ${signalIndex}`,
              signalIndex: signalIndex,
              signalType: 'analog',
              isExact: false
            });
          }
        }
      }
    });
    
    // Process digital signals (simplified - just check for state changes at threshold)
    // For digital signals, we look for transitions that cross the 0.5 threshold (if normalized)
    // But since digital signals are typically 0/1, we'll check if threshold is between 0 and 1
    if (threshold >= 0 && threshold <= 1) {
      digital.forEach((signal, signalIndex) => {
        const values = signal.values || [];
        if (values.length !== time_ms.length) return;
        
        for (let i = 0; i < time_ms.length - 1; i++) {
          const v1 = values[i] || 0;
          const v2 = values[i + 1] || 0;
          const t1 = time_ms[i];
          const t2 = time_ms[i + 1];
          
          // Normalize digital values to 0-1 range if needed
          const normV1 = v1 > 0 ? 1 : 0;
          const normV2 = v2 > 0 ? 1 : 0;
          
          // Check if digital signal crosses the threshold
          if ((normV1 <= threshold && normV2 >= threshold) || (normV1 >= threshold && normV2 <= threshold)) {
            if (normV1 === normV2) {
              // Edge case - shouldn't happen with proper digital signals
              intersections.push({
                time: t1,
                value: normV1,
                signalName: signal.name || `Digital ${signalIndex}`,
                signalIndex: signalIndex,
                signalType: 'digital',
                isExact: true
              });
            } else {
              // Linear interpolation
              const tCross = t1 + (threshold - normV1) * (t2 - t1) / (normV2 - normV1);
              intersections.push({
                time: tCross,
                value: threshold,
                signalName: signal.name || `Digital ${signalIndex}`,
                signalIndex: signalIndex,
                signalType: 'digital',
                isExact: false
              });
            }
          }
        }
      });
    }
    
    // Sort intersections by time
    return intersections.sort((a, b) => a.time - b.time);
  }
  
  /**
   * Calculate intersections for vertical lines (x = constant/time)
   * @param {Object} waveformData - Contains time_ms and analog/digital signal data
   * @param {ReferenceLine} line - Vertical reference line
   * @returns {Array} Array of intersection points { time, value, signalName, signalIndex }
   */
  static calculateVerticalIntersections(waveformData, line) {
    if (!waveformData || !line || line.type !== 'vertical') {
      return [];
    }

    const intersections = [];
    const { time_ms, analog = [], digital = [] } = waveformData;
    
    if (!time_ms || time_ms.length === 0) {
      return intersections;
    }

    const targetTime = line.value;
    
    // Find the closest time index
    let closestIndex = 0;
    let minDiff = Math.abs(time_ms[0] - targetTime);
    
    for (let i = 1; i < time_ms.length; i++) {
      const diff = Math.abs(time_ms[i] - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    // Also check neighboring points for better accuracy if time is between samples
    // We'll use linear interpolation between the two closest points
    let leftIndex = closestIndex;
    let rightIndex = closestIndex;
    
    if (time_ms[closestIndex] > targetTime && closestIndex > 0) {
      leftIndex = closestIndex - 1;
      rightIndex = closestIndex;
    } else if (time_ms[closestIndex] < targetTime && closestIndex < time_ms.length - 1) {
      leftIndex = closestIndex;
      rightIndex = closestIndex + 1;
    }
    
    // If we have a valid range for interpolation
    if (leftIndex !== rightIndex && time_ms[leftIndex] !== time_ms[rightIndex]) {
      const tLeft = time_ms[leftIndex];
      const tRight = time_ms[rightIndex];
      
      // Only interpolate if targetTime is between tLeft and tRight
      if ((targetTime >= tLeft && targetTime <= tRight) || (targetTime <= tLeft && targetTime >= tRight)) {
        const interpolationFactor = (targetTime - tLeft) / (tRight - tLeft);
        
        // Process analog signals
        analog.forEach((signal, signalIndex) => {
          const values = signal.values || [];
          if (values.length <= rightIndex) return;
          
          const vLeft = values[leftIndex] || 0;
          const vRight = values[rightIndex] || 0;
          
          // Skip if values are invalid
          if ((vLeft === null || vLeft === undefined) && (vRight === null || vRight === undefined)) {
            return;
          }
          
          // Handle null/undefined values
          const leftVal = vLeft !== null && vLeft !== undefined ? vLeft : 0;
          const rightVal = vRight !== null && vRight !== undefined ? vRight : 0;
          
          const interpolatedValue = leftVal + interpolationFactor * (rightVal - leftVal);
          
          intersections.push({
            time: targetTime,
            value: interpolatedValue,
            signalName: signal.name || `Signal ${signalIndex}`,
            signalIndex: signalIndex,
            signalType: 'analog',
            isExact: false
          });
        });
        
        // Process digital signals
        digital.forEach((signal, signalIndex) => {
          const values = signal.values || [];
          if (values.length <= rightIndex) return;
          
          const vLeft = values[leftIndex] || 0;
          const vRight = values[rightIndex] || 0;
          
          // Normalize to 0-1
          const normLeft = vLeft > 0 ? 1 : 0;
          const normRight = vRight > 0 ? 1 : 0;
          
          const interpolatedValue = normLeft + interpolationFactor * (normRight - normLeft);
          
          intersections.push({
            time: targetTime,
            value: interpolatedValue,
            signalName: signal.name || `Digital ${signalIndex}`,
            signalIndex: signalIndex,
            signalType: 'digital',
            isExact: false
          });
        });
      }
    } else {
      // Fallback to closest sample
      const closestTime = time_ms[closestIndex];
      
      // Process analog signals at closest time
      analog.forEach((signal, signalIndex) => {
        const values = signal.values || [];
        if (values.length <= closestIndex) return;
        
        const value = values[closestIndex];
        if (value !== null && value !== undefined) {
          intersections.push({
            time: closestTime,
            value: value,
            signalName: signal.name || `Signal ${signalIndex}`,
            signalIndex: signalIndex,
            signalType: 'analog',
            isExact: (closestTime === targetTime)
          });
        }
      });
      
      // Process digital signals at closest time
      digital.forEach((signal, signalIndex) => {
        const values = signal.values || [];
        if (values.length <= closestIndex) return;
        
        const value = values[closestIndex];
        const normalizedValue = value > 0 ? 1 : 0;
        
        intersections.push({
          time: closestTime,
          value: normalizedValue,
          signalName: signal.name || `Digital ${signalIndex}`,
          signalIndex: signalIndex,
          signalType: 'digital',
          isExact: (closestTime === targetTime)
        });
      });
    }
    
    // Sort by signal name for consistent display
    return intersections.sort((a, b) => {
      if (a.signalName < b.signalName) return -1;
      if (a.signalName > b.signalName) return 1;
      return 0;
    });
  }
  
  /**
   * Get value at specific time for all signals (used for vertical line tooltip)
   * @param {Object} waveformData - Contains time_ms and analog/digital signal data
   * @param {number} time - Time value to lookup
   * @returns {Object} Map of signal names to values
   */
  static getValuesAtTime(waveformData, time) {
    const result = {};
    const { time_ms, analog = [], digital = [] } = waveformData;
    
    if (!time_ms || time_ms.length === 0) {
      return result;
    }
    
    // Find closest time index
    let closestIndex = 0;
    let minDiff = Math.abs(time_ms[0] - time);
    
    for (let i = 1; i < time_ms.length; i++) {
      const diff = Math.abs(time_ms[i] - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    // Get analog values
    analog.forEach((signal, signalIndex) => {
      const values = signal.values || [];
      if (values.length > closestIndex) {
        const value = values[closestIndex];
        result[signal.name || `Signal ${signalIndex}`] = 
          value !== null && value !== undefined ? value : null;
      }
    });
    
    // Get digital values
    digital.forEach((signal, signalIndex) => {
      const values = signal.values || [];
      if (values.length > closestIndex) {
        const value = values[closestIndex];
        result[signal.name || `Digital ${signalIndex}`] = 
          value !== null && value !== undefined ? (value > 0 ? 1 : 0) : null;
      }
    });
    
    return result;
  }
}

export default IntersectionCalculator;