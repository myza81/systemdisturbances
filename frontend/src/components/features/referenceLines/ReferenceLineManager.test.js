import ReferenceLineManager from './ReferenceLineManager.js';
import ReferenceLine from './ReferenceLine.js';

describe('ReferenceLineManager', () => {
  let manager;
  
  beforeEach(() => {
    // Create a fresh instance for each test
    manager = new ReferenceLineManager();
  });
  
  test('should initialize with empty lines collection', () => {
    expect(manager.getLineCount()).toBe(0);
  });
  
  test('should add a reference line', () => {
    const line = new ReferenceLine({ 
      id: 'line1', 
      type: 'horizontal', 
      value: 0.7 
    });
    
    const addedLine = manager.addLine(line);
    
    expect(manager.getLineCount()).toBe(1);
    expect(addedLine).toBe(line);
    expect(manager.getLine('line1')).toBe(line);
  });
  
  test('should add line from options object', () => {
    const line = manager.addLine({
      id: 'line2',
      type: 'vertical',
      value: 1.235
    });
    
    expect(manager.getLineCount()).toBe(1);
    expect(line instanceof ReferenceLine).toBe(true);
    expect(line.id).toBe('line2');
    expect(line.type).toBe('vertical');
    expect(line.value).toBe(1.235);
  });
  
  test('should throw error when adding line with duplicate ID', () => {
    manager.addLine({ id: 'line1', type: 'horizontal', value: 0.5 });
    
    expect(() => {
      manager.addLine({ id: 'line1', type: 'vertical', value: 1.0 });
    }).toThrow(/already exists/);
  });
  
  test('should enforce maximum line limit', () => {
    // Add maximum number of lines
    for (let i = 0; i < 20; i++) {
      manager.addLine({ 
        id: `line${i}`, 
        type: 'horizontal', 
        value: i * 0.1 
      });
    }
    
    expect(manager.getLineCount()).toBe(20);
    expect(manager.isAtMaxCapacity()).toBe(true);
    
    // Trying to add one more should throw an error
    expect(() => {
      manager.addLine({ id: 'line21', type: 'horizontal', value: 2.0 });
    }).toThrow(/maximum/);
  });
  
  test('should remove a reference line', () => {
    manager.addLine({ id: 'line1', type: 'horizontal', value: 0.5 });
    manager.addLine({ id: 'line2', type: 'vertical', value: 1.0 });
    
    expect(manager.getLineCount()).toBe(2);
    
    const removed = manager.removeLine('line1');
    
    expect(removed).toBe(true);
    expect(manager.getLineCount()).toBe(1);
    expect(manager.getLine('line1')).toBeNull();
    expect(manager.getLine('line2')).not.toBeNull();
  });
  
  test('should return false when removing non-existent line', () => {
    const removed = manager.removeLine('nonexistent');
    expect(removed).toBe(false);
  });
  
  test('should update an existing reference line', () => {
    manager.addLine({ 
      id: 'line1', 
      type: 'horizontal', 
      value: 0.5,
      visible: true
    });
    
    const updatedLine = manager.updateLine('line1', { 
      value: 0.8,
      visible: false
    });
    
    expect(updatedLine.value).toBe(0.8);
    expect(updatedLine.visible).toBe(false);
    expect(manager.getLine('line1').value).toBe(0.8);
    expect(manager.getLine('line1').visible).toBe(false);
  });
  
  test('should throw error when updating non-existent line', () => {
    expect(() => {
      manager.updateLine('nonexistent', { value: 1.0 });
    }).toThrow(/not found/);
  });
  
  test('should toggle line visibility', () => {
    manager.addLine({ 
      id: 'line1', 
      type: 'horizontal', 
      value: 0.5,
      visible: true
    });
    
    const toggledLine = manager.toggleLineVisibility('line1');
    
    expect(toggledLine.visible).toBe(false);
    expect(manager.getLine('line1').visible).toBe(false);
    
    // Toggle back
    manager.toggleLineVisibility('line1');
    expect(manager.getLine('line1').visible).toBe(true);
  });
  
  test('should get horizontal and vertical lines separately', () => {
    manager.addLine({ id: 'h1', type: 'horizontal', value: 0.5 });
    manager.addLine({ id: 'h2', type: 'horizontal', value: 0.8 });
    manager.addLine({ id: 'v1', type: 'vertical', value: 1.0 });
    manager.addLine({ id: 'v2', type: 'vertical', value: 1.5 });
    
    const horizontalLines = manager.getHorizontalLines();
    const verticalLines = manager.getVerticalLines();
    
    expect(horizontalLines.length).toBe(2);
    expect(verticalLines.length).toBe(2);
    expect(horizontalLines.every(l => l.type === 'horizontal')).toBe(true);
    expect(verticalLines.every(l => l.type === 'vertical')).toBe(true);
  });
  
  test('should clear all lines', () => {
    manager.addLine({ id: 'line1', type: 'horizontal', value: 0.5 });
    manager.addLine({ id: 'line2', type: 'vertical', value: 1.0 });
    
    expect(manager.getLineCount()).toBe(2);
    
    manager.clearAllLines();
    
    expect(manager.getLineCount()).toBe(0);
    expect(manager.getLine('line1')).toBeNull();
    expect(manager.getLine('line2')).toBeNull();
  });
  
  test('should notify listeners when lines change', () => {
    const listener = jest.fn();
    const unsubscribe = manager.addListener(listener);
    
    manager.addLine({ id: 'line1', type: 'horizontal', value: 0.5 });
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);
    
    manager.removeLine('line1');
    
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toHaveLength(0);
    
    // Unsubscribe and verify no more calls
    unsubscribe();
    manager.addLine({ id: 'line2', type: 'vertical', value: 1.0 });
    
    expect(listener).toHaveBeenCalledTimes(2); // No additional calls
  });
  
  test('should get remaining capacity', () => {
    expect(manager.getRemainingCapacity()).toBe(20);
    
    manager.addLine({ id: 'line1', type: 'horizontal', value: 0.5 });
    expect(manager.getRemainingCapacity()).toBe(19);
    
    // Fill up to max
    for (let i = 2; i <= 20; i++) {
      manager.addLine({ id: `line${i}`, type: 'horizontal', value: i * 0.1 });
    }
    
    expect(manager.getRemainingCapacity()).toBe(0);
  });
});