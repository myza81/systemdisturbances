/**
 * Integration test for Reference Lines feature
 * Tests the interaction between ReferenceLineManager, ReferenceLineRenderer, and WaveformViewer
 */
import { act } from 'react-dom/test-utils';
import { render } from '@testing-library/react';
import ReferenceLineManager from './ReferenceLineManager.js';
import ReferenceLine from './ReferenceLine.js';
import ReferenceLineRenderer from './ReferenceLineRenderer.js';
import IntersectionCalculator from './IntersectionCalculator.js';
import IntersectionDisplay from './IntersectionDisplay.js';

// Mock ECharts instance
const createMockEChartsInstance = () => {
  const option = { graphic: [] };
  const zr = {
    storage: {
      getDisplayList: () => []
    },
    add: (elements) => {
      if (Array.isArray(elements)) {
        option.graphic.push(...elements);
      } else {
        option.graphic.push(elements);
      }
    },
    remove: (element) => {
      const index = option.graphic.indexOf(element);
      if (index > -1) {
        option.graphic.splice(index, 1);
      }
    },
    refresh: () => {},
    setCursorStyle: () => {},
    on: () => {},
    off: () => {}
  };
  
  return {
    getOption: () => option,
    setOption: (newOption, opts) => {
      Object.assign(option, newOption);
    },
    getZr: () => zr,
    convertToPixel: ([gridParams, x, y]) => {
      // Simple mock conversion - in reality this would be more complex
      // gridParams = ['grid', left, top, width, height]
      const [, left, top, width, height] = gridParams;
      // Assume simple linear mapping for testing
      return [left + x * 10, top + (100 - y) * 10]; // Invert y for screen coordinates
    },
    convertFromPixel: ([gridParams, x, y]) => {
      // Simple mock conversion
      const [, left, top, width, height] = gridParams;
      return [(x - left) / 10, (top - y) / 10 + 100]; // Invert back
    },
    isDisposed: () => false
  };
};

describe('Reference Lines Feature Integration', () => {
  let echartsInstance;
  let manager;
  
  beforeEach(() => {
    // Create fresh instances for each test
    echartsInstance = createMockEChartsInstance();
    manager = new ReferenceLineManager();
  });
  
  test('should add horizontal line and render it', () => {
    // Add a horizontal line
    const line = manager.addLine({
      id: 'test-line-1',
      type: 'horizontal',
      value: 0.5,
      color: '#ff0000'
    });
    
    // Verify line was added
    expect(manager.getLineCount()).toBe(1);
    expect(manager.getLine('test-line-1')).toBe(line);
    
    // Render the line
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    
    // Verify graphic was added
    const option = echartsInstance.getOption();
    expect(option.graphic).toHaveLength(1);
    expect(option.graphic[0].id).toBe('reference-line-test-line-1');
    expect(option.graphic[0].type).toBe('line');
    expect(option.graphic[0].style.stroke).toBe('#ff0000');
  });
  
  test('should add vertical line and render it', () => {
    // Add a vertical line
    const line = manager.addLine({
      id: 'test-line-2',
      type: 'vertical',
      value: 1.5,
      color: '#00ff00'
    });
    
    // Render the line
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    
    // Verify graphic was added
    const option = echartsInstance.getOption();
    expect(option.graphic).toHaveLength(1);
    expect(option.graphic[0].id).toBe('reference-line-test-line-2');
    expect(option.graphic[0].style.stroke).toBe('#00ff00');
  });
  
  test('should update line position and re-render', () => {
    // Add a line
    manager.addLine({
      id: 'test-line-3',
      type: 'horizontal',
      value: 0.3
    });
    
    // Initial render
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    let option = echartsInstance.getOption();
    expect(option.graphic[0].shape.y1).toBeCloseTo(70); // Approximate based on mock conversion
    
    // Update line
    manager.updateLine('test-line-3', { value: 0.7 });
    
    // Re-render
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    option = echartsInstance.getOption();
    expect(option.graphic[0].shape.y1).toBeCloseTo(30); // Should have moved up
  });
  
  test('should remove line and clear graphic', () => {
    // Add a line
    manager.addLine({
      id: 'test-line-4',
      type: 'horizontal',
      value: 0.5
    });
    
    // Render
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    let option = echartsInstance.getOption();
    expect(option.graphic).toHaveLength(1);
    
    // Remove line
    manager.removeLine('test-line-4');
    
    // Re-render
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    option = echartsInstance.getOption();
    expect(option.graphic).toHaveLength(0);
  });
  
  test('should calculate horizontal intersections', () => {
    // Mock waveform data
    const waveformData = {
      time_ms: [0, 100, 200, 300, 400, 500],
      analog: [
        {
          name: 'VA',
          values: [0.2, 0.4, 0.6, 0.8, 0.6, 0.4] // Crosses 0.5 twice
        }
      ],
      digital: []
    };
    
    // Create horizontal line at 0.5
    const line = new ReferenceLine({
      id: 'h-line',
      type: 'horizontal',
      value: 0.5
    });
    
    // Calculate intersections
    const intersections = IntersectionCalculator.calculateHorizontalIntersections(waveformData, line);
    
    // Should have 2 intersections
    expect(intersections).toHaveLength(2);
    
    // First intersection between points 1 and 2 (0.4 to 0.6)
    expect(intersections[0].time).toBeCloseTo(150); // Interpolated
    expect(intersections[0].value).toBe(0.5);
    expect(intersections[0].signalName).toBe('VA');
    
    // Second intersection between points 3 and 4 (0.8 to 0.6)
    expect(intersections[1].time).toBeCloseTo(350); // Interpolated
    expect(intersections[1].value).toBe(0.5);
    expect(intersections[1].signalName).toBe('VA');
  });
  
  test('should calculate vertical intersections', () => {
    // Mock waveform data
    const waveformData = {
      time_ms: [0, 100, 200, 300, 400],
      analog: [
        {
          name: 'VA',
          values: [0.1, 0.3, 0.5, 0.7, 0.9]
        },
        {
          name: 'VB',
          values: [0.2, 0.4, 0.6, 0.8, 1.0]
        }
      ],
      digital: []
    };
    
    // Create vertical line at time 250ms (between index 2 and 3)
    const line = new ReferenceLine({
      id: 'v-line',
      type: 'vertical',
      value: 250
    });
    
    // Calculate intersections
    const intersections = IntersectionCalculator.calculateVerticalIntersections(waveformData, line);
    
    // Should have 2 intersections (one for each analog signal)
    expect(intersections).toHaveLength(2);
    
    // Both should be at time 250ms
    expect(intersections[0].time).toBe(250);
    expect(intersections[1].time).toBe(250);
    
    // VA value should be interpolated between 0.5 and 0.7 -> 0.6
    expect(intersections[0].value).toBeCloseTo(0.6);
    expect(intersections[0].signalName).toBe('VA');
    
    // VB value should be interpolated between 0.6 and 0.8 -> 0.7
    expect(intersections[1].value).toBeCloseTo(0.7);
    expect(intersections[1].signalName).toBe('VB');
  });
  
  test('should format intersection tooltips correctly', () => {
    const intersection = {
      time: 1.234,
      value: 0.567,
      signalName: 'VA',
      signalIndex: 0,
      signalType: 'analog',
      isExact: false
    };
    
    const line = new ReferenceLine({
      id: 'test-line',
      type: 'horizontal',
      value: 0.567,
      color: '#ff0000'
    });
    
    const tooltip = IntersectionDisplay.formatHorizontalTooltip(intersection, line);
    
    expect(tooltip).toContain('1.234 s');
    expect(tooltip).toContain('Signal: VA');
    expect(tooltip).toContain('0.5670 pu');
    expect(tooltip).toContain('(interpolated)');
  });
  
  test('should handle multiple lines and intersections', () => {
    // Add multiple lines
    manager.addLine({ id: 'h1', type: 'horizontal', value: 0.3 });
    manager.addLine({ id: 'h2', type: 'horizontal', value: 0.7 });
    manager.addLine({ id: 'v1', type: 'vertical', value: 1.5 });
    
    // Mock waveform data with multiple crossings
    const waveformData = {
      time_ms: [0, 100, 200, 300],
      analog: [
        {
          name: 'VA',
          values: [0.2, 0.5, 0.8, 0.5] // Crosses 0.3 and 0.7
        }
      ],
      digital: []
    };
    
    // Render all lines
    ReferenceLineRenderer.render(echartsInstance, manager.getAllLines());
    
    // Should have 3 line graphics
    let option = echartsInstance.getOption();
    expect(option.graphic).toHaveLength(3);
    
    // Calculate and render intersections for each horizontal line
    const horizontalLines = manager.getHorizontalLines();
    horizontalLines.forEach(line => {
      if (line.visible) {
        const intersections = IntersectionCalculator.calculateHorizontalIntersections(waveformData, line);
        IntersectionDisplay.renderIntersections(echartsInstance, intersections, line);
      }
    });
    
    // Should now have line graphics + intersection markers
    option = echartsInstance.getOption();
    // 3 lines + 4 intersection markers (2 per horizontal line)
    expect(option.graphic).toHaveLength(7);
  });
});