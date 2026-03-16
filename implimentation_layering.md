# Implementation Execution Plan: Custom Reference Lines Enhancement

This document outlines a phase-by-phase implementation plan for enhancing the existing channel layering feature with custom reference lines (X & Y axis coordinate probes) as specified in layering.md.

## Phase 1: Foundation and Data Structures

**Objective**: Establish core data structures and management systems for reference lines.

**Tasks**:
1. Create ReferenceLine class/interface with properties: id, type, value, axis, color, visible
2. Implement ReferenceLineManager singleton/service to:
   - Store and manage collections of reference lines
   - Provide methods for adding, removing, updating lines
   - Handle line visibility toggling
   - Enforce maximum line limit (20 total)
3. Define constants for default styles:
   - Horizontal lines: dashed, gray (#888888)
   - Vertical lines: dotted, gray (#888888)
4. Set up event system for notifying components when line collections change
5. Create unit tests for ReferenceLineManager functionality

**Deliverables**:
- ReferenceLine data structure
- ReferenceLineManager service
- Basic storage and retrieval mechanisms
- Event notification system

---

## Phase 2: User Interface Components

**Objective**: Build the Reference Line Control Panel for user interaction.

**Tasks**:
1. Create ReferenceLineControlPanel component with:
   - Section for adding horizontal lines: Value input + Add button
   - Section for adding vertical lines: Time input + Add button
   - Two lists displaying existing lines:
     * Horizontal Lines list with checkboxes
     * Vertical Lines list with checkboxes
2. Implement line entry components showing:
   - Checkbox for enable/disable
   - Value display (with units: pu for horizontal, s for vertical)
   - Color indicator/swatch
   - Delete button (trash icon)
3. Add input validation:
   - Prevent empty values
   - Validate numeric input
   - Provide user feedback for invalid entries
4. Implement keyboard support (Enter key to add line)
5. Style the panel to match existing UI conventions
6. Connect UI to ReferenceLineManager for state synchronization

**Deliverables**:
- ReferenceLineControlPanel component
- Horizontal line entry UI
- Vertical line entry UI
- Line list components with toggle/delete functionality
- Input validation and user feedback

---

## Phase 3: Core Functionality - Line Rendering

**Objective**: Implement rendering of reference lines on the waveform canvas.

**Tasks**:
1. Create ReferenceLineRenderer class responsible for:
   - Drawing horizontal lines (y=constant) across entire canvas width
   - Drawing vertical lines (x=constant) across entire canvas height
   - Applying appropriate visual styles (dashed/dotted)
   - Respecting line visibility settings
2. Integrate renderer into waveform engine pipeline:
   - Position ReferenceLine Overlay after Chart Series but before Canvas Rendering
   - Ensure lines are drawn as lightweight overlays (SVG or Canvas API)
3. Implement coordinate transformation:
   - Map data values (pu, Hz, etc.) to pixel coordinates
   - Map time values (seconds) to pixel coordinates
4. Handle canvas resizing and zooming/panning:
   - Recalculate line positions when view transforms
   - Maintain line correctness during interactions
5. Optimize rendering performance:
   - Only re-render lines when properties change
   - Use efficient drawing paths

**Deliverables**:
- ReferenceLineRenderer class
- Integration with waveform rendering pipeline
- Coordinate transformation logic
- Performance-optimized rendering implementation

---

## Phase 4: Interaction Handling

**Objective**: Enable users to interact with reference lines (add, drag, delete, toggle).

**Tasks**:
1. Implement drag functionality:
   - Detect mouse down on reference lines
   - Allow dragging horizontal lines vertically (updating Y value)
   - Allow dragging vertical lines horizontally (updating X value)
   - Update line values in real-time during drag
   - Snap to reasonable increments if needed (configurable)
2. Enhance delete functionality:
   - Confirm deletion for accidental clicks (optional)
   - Animate removal if desired
3. Improve toggle functionality:
   - Visual feedback when hiding/showing lines
   - Maintain line properties when hidden
4. Add line properties editor:
   - Double-click to edit value inline
   - Color picker for custom colors
5. Implement undo/redo support for line operations (if framework supports)
6. Ensure all interactions update ReferenceLineManager and trigger re-render

**Deliverables**:
- Drag-and-drop implementation for line positioning
- Real-time value updates during interaction
- Enhanced delete and toggle controls
- Inline editing capabilities
- State synchronization with ReferenceLineManager

---

## Phase 5: Intersection Calculation

**Objective**: Calculate precise intersection points between waveforms and reference lines.

**Tasks**:
1. Implement IntersectionCalculator class with methods for:
   - Finding intersections with horizontal lines (y=constant)
   - Finding intersections with vertical lines (x=constant)
2. Develop intersection detection algorithm:
   - For horizontal lines: Iterate through waveform samples
     * Detect when signal crosses reference value (signal[n] < threshold AND signal[n+1] > threshold OR vice versa)
   - For vertical lines: Find samples closest to specified time
3. Implement linear interpolation for improved accuracy:
   - Horizontal line intersection: 
     * x_cross = x[n] + (threshold - y[n]) * (x[n+1] - x[n]) / (y[n+1] - y[n])
   - Vertical line intersection: Direct time lookup (no interpolation needed for time)
4. Handle edge cases:
   - Flat signals (no crossing)
   - Multiple crossings within one sample interval
   - Signals exactly at threshold value
5. Cache intersection calculations:
   - Only recalculate when waveform data or line positions change
   - Invalidate cache appropriately during interactions
6. Respect performance guidelines:
   - Calculate intersections only when needed (for display)
   - Limit computational complexity

**Deliverables**:
- IntersectionCalculator class
- Horizontal line intersection detection algorithm
- Vertical line intersection detection algorithm
- Linear interpolation implementation
- Caching mechanism for performance
- Edge case handling

---

## Phase 6: Intersection Display

**Objective**: Visualize intersection points and provide detailed coordinate information.

**Tasks**:
1. Create intersection marker renderer:
   - Draw small, visible markers (circles or crosses) at intersection points
   - Use contrasting color that works with various waveform colors
   - Size appropriate for visibility without obscuring waveform
2. Implement hover tooltip functionality:
   - Show detailed information when marker is hovered:
     * For horizontal line intersections: Time value and signal name
     * For vertical line intersections: Values for all signals at that time
   - Format: 
     * Horizontal: "Time: 1.235 s, Signal: VA, Value: 0.72 pu"
     * Vertical: "Time = 1.235 s, VA = 0.72 pu, VB = 0.69 pu, IA = 0.83 pu"
   - Use consistent styling with existing tooltip system
3. Handle multiple intersections:
   - Display marker for each crossing point
   - Manage tooltip overlap (smart positioning)
4. Optimize marker rendering:
   - Only render markers when intersections are requested/showing
   - Efficiently update when lines or waveforms change
5. Ensure markers appear in canvas image capture/reporting
6. Add option to toggle intersection marker visibility

**Deliverables**:
- Intersection marker visualization
- Hover tooltip system with detailed coordinate information
- Multiple intersection handling
- Performance-optimized marker rendering
- Integration with reporting/image capture systems

---

## Phase 7: Integration and Performance Optimization

**Objective**: Fully integrate reference lines with existing systems and optimize performance.

**Tasks**:
1. Verify pipeline integration:
   - Confirm ReferenceLine Overlay sits correctly in rendering pipeline:
     WaveformMemory → WaveformLayer → Chart Series → ReferenceLine Overlay → Canvas Rendering
   - Ensure lines do not modify original waveform data
2. Implement canvas image capture integration:
   - Ensure reference lines are included when exporting/saving waveform images
   - Verify intersection markers appear in captured images
3. Performance optimization:
   - Profile rendering performance with various line counts
   - Implement line drawing as lightweight overlays (minimize DOM elements if SVG, optimize Canvas draw calls)
   - Ensure intersection calculations are only performed when needed
   - Validate maximum recommendation of 20 total lines doesn't degrade performance
4. Memory management:
   - Properly clean up references when lines are removed
   - Avoid memory leaks in interaction handlers
5. Cross-browser compatibility testing:
   - Test rendering consistency across supported browsers
   - Verify interaction behavior (drag, hover) works correctly
6. Accessibility considerations:
   - Ensure keyboard accessibility for controls
   - Provide adequate color contrast for lines and markers
   - Consider screen reader compatibility for coordinate information

**Deliverables**:
- Fully integrated reference line system
- Canvas image capture verification
- Performance benchmarks and optimizations
- Memory leak prevention
- Cross-browser compatibility confirmation
- Accessibility compliance check

---

## Phase 8: Testing, Validation and Refinement

**Objective**: Thoroughly test the implementation and refine based on feedback.

**Tasks**:
1. Functional testing:
   - Voltage sag analysis: Add horizontal line at 0.7 pu, verify intersection points and duration calculation
   - Relay pickup testing: Add horizontal line at 0.9 pu, verify crossing detection
   - Frequency limit verification: Add horizontal line at 49.5 Hz on frequency waveform
   - Fault time marking: Add vertical line at known fault time, verify signal values display
   - Multiple lines: Test with up to 20 lines of mixed types
2. Interaction testing:
   - Verify smooth dragging with real-time value updates
   - Test toggle functionality preserves line properties
   - Confirm deletion works correctly
   - Validate input validation and error handling
3. Edge case testing:
   - Test with flat/noisy signals
   - Verify behavior at waveform boundaries
   - Test extreme values (very high/low)
   - Validate behavior with zoomed/panned views
4. Performance testing:
   - Measure frame rates with various line counts
   - Verify intersection calculation doesn't cause lag during interaction
   - Test with large waveform datasets
5. Reporting validation:
   - Capture images with reference lines and markers
   - Verify all visual elements appear correctly in exports
6. User feedback incorporation:
   - Conduct usability testing with target audience (engineers)
   - Refine interaction based on feedback
   - Adjust visual styles if needed for clarity
7. Documentation update:
   - Update any relevant developer documentation
   - Create user guide/reference material for the new feature

**Deliverables**:
- Comprehensive test results
- Performance benchmark reports
- User feedback summary and incorporated refinements
- Updated documentation
- Final polished implementation ready for release
