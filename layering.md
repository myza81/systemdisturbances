# Feature Extension: Custom Reference Lines (X & Y Axis Coordinate Probes)

## Objective

Provide an interactive system that allows users to create **custom horizontal and vertical reference lines** across the waveform canvas.

These lines enable engineers to analyze waveform behavior relative to specific thresholds or time markers.

Example:

```
Horizontal line: 0.7 pu voltage
Vertical line: 1.235 s fault time
```

Where the lines intersect the waveform, the system must display the **exact coordinate values**.

---

# 1. Feature Overview

Users can create **two types of reference lines**.

| Line Type       | Description   |
| --------------- | ------------- |
| Horizontal Line | fixed Y value |
| Vertical Line   | fixed X time  |

These lines must:

* cross the entire canvas
* intersect waveform layers
* show coordinate values

---

# 2. Example Use Case

Voltage sag analysis.

User adds horizontal line:

```
0.7 pu
```

The system shows where waveform crosses this line.

Example result:

```
0.7 pu crossing occurs at:

1.215 s
1.238 s
```

This is extremely useful for:

* sag duration
* relay pickup analysis
* threshold comparison

---

# 3. Line Types

## Horizontal Reference Line

Definition:

```
y = constant
```

Example:

```
y = 0.7 pu
```

Visual result:

```
────────────── 0.7 pu
```

The line crosses the waveform.

System calculates intersection points.

---

## Vertical Reference Line

Definition:

```
x = constant
```

Example:

```
x = 1.235 s
```

Visual result:

```
│
│
│
```

System displays waveform values at that time.

Example:

```
Time = 1.235 s

VA = 0.72 pu
VB = 0.69 pu
IA = 0.83 pu
```

---

# 4. Multiple Reference Lines

Users must be able to create **multiple lines**.

Example:

```
Horizontal:
0.9 pu
0.8 pu
0.7 pu

Vertical:
1.200 s
1.235 s
1.270 s
```

All lines remain visible simultaneously.

---

# 5. Reference Line Object

Each reference line must be stored as an object.

Structure:

```
ReferenceLine
 ├── id
 ├── type
 ├── value
 ├── axis
 ├── color
 └── visible
```

Example:

```
{
 id: "line1",
 type: "horizontal",
 value: 0.7,
 axis: "left",
 color: "#888",
 visible: true
}
```

---

# 6. User Interface

Add a **Reference Line Control Panel**.

Example UI:

```
Reference Lines

Add Horizontal Line
Value: [ 0.7 ] [Add]

Add Vertical Line
Time: [ 1.235 ] [Add]
```

Existing lines list:

```
Horizontal Lines
☑ 0.9 pu
☑ 0.8 pu
☑ 0.7 pu

Vertical Lines
☑ 1.200 s
☑ 1.235 s
```

Users can:

* enable/disable
* delete
* change color

---

# 7. Intersection Calculation

When a horizontal line is added:

The system must calculate intersection points.

Algorithm:

```
for each waveform sample:
    if signal crosses reference value
        calculate intersection
```

Interpolation improves accuracy.

Example:

```
signal[n] < threshold
signal[n+1] > threshold
```

Then calculate:

```
x_cross = linear interpolation
```

---

# 8. Intersection Display

Where waveform crosses the reference line:

Show small markers.

Example:

```
● intersection point
```

Hovering marker shows:

```
Time: 1.235 s
Value: 0.7 pu
Signal: VA
```

---

# 9. Vertical Line Readout

Vertical lines must show values for all signals.

Example:

```
Vertical line at 1.235 s

VA = 0.72 pu
VB = 0.69 pu
IA = 0.83 pu
```

This behaves like a **fixed crosshair**.

---

# 10. Visual Style

Reference lines must be visually distinct.

Recommended styles:

| Line Type  | Style  |
| ---------- | ------ |
| Horizontal | dashed |
| Vertical   | dotted |

Color default:

```
Gray
```

---

# 11. Interaction

Users can interact with reference lines.

Supported actions:

| Action | Description     |
| ------ | --------------- |
| Add    | create new line |
| Drag   | move line       |
| Delete | remove line     |
| Toggle | hide/show       |

Dragging must update values in real time.

---

# 12. Performance Considerations

Reference lines must **not degrade rendering performance**.

Rules:

* lines drawn as lightweight overlays
* intersection points calculated only when needed
* maximum recommended lines:

```
20 total
```

---

# 13. Integration with Waveform Engine

Reference lines operate inside the existing system.

Pipeline:

```
WaveformMemory
      ↓
WaveformLayer
      ↓
Chart Series
      ↓
ReferenceLine Overlay
      ↓
Canvas Rendering
```

Lines must not modify waveform data.

---

# 14. Reporting Integration

Reference lines must appear in **canvas image capture**.

This ensures reports include:

* threshold lines
* fault timing markers
* analysis annotations

Captured image example:

```
Waveform
+ threshold lines
+ vertical markers
```

---

# 15. Development Modules

Add new modules:

```
ReferenceLineManager
HorizontalLineController
VerticalLineController
IntersectionCalculator
ReferenceLineRenderer
```

---

# 16. Engineering Use Cases

This feature supports:

| Analysis Type   | Example          |
| --------------- | ---------------- |
| Voltage sag     | 0.7 pu threshold |
| Relay pickup    | 0.9 pu           |
| Frequency limit | 49.5 Hz          |
| Fault time      | vertical marker  |

This functionality is commonly used in **disturbance record analysis tools**.

---

# Final Result

With this feature your waveform viewer will support:

* dynamic signal layering
* dual-axis scaling
* waveform alignment
* threshold analysis
* coordinate probing
* report-ready visualization

This will make the system behave similarly to **professional disturbance waveform analysis software**.
