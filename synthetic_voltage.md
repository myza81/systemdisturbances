# Dummy Voltage Profile Generator

## Low Voltage Ride Through (LVRT) Test Waveform

Reference: Peninsular Malaysia Grid Code – LVRT behavior

This document describes the **implementation details to generate a synthetic voltage waveform dataset** that mimics a **low voltage ride-through event**.

The output will be suitable for:

* COMTRADE waveform testing
* waveform visualization testing
* UI rendering validation
* algorithm testing (voltage sag detection, LVRT compliance)

---

# 1. Input Requirements

| Parameter          | Value    |
| ------------------ | -------- |
| Sampling Rate      | 5000 Hz  |
| Sampling Interval  | 0.0002 s |
| Nominal Voltage    | 132 kV   |
| Pre-fault Duration | 500 ms   |
| Fault Voltage      | 0 V      |
| Fault Duration     | 100 ms   |
| Recovery Target    | 0.9 pu   |
| Recovery Time      | 1.35 s   |

---

# 2. Derived Parameters

### Sampling interval

```id="dt"
dt = 1 / sampling_rate
```

```id="dtvalue"
dt = 1 / 5000
dt = 0.0002 s
```

---

### Pre-fault samples

```id="prefault_samples"
0.5 s × 5000
```

```id="prefault_value"
= 2500 samples
```

---

### Fault samples

```id="fault_samples"
0.1 s × 5000
```

```id="fault_value"
= 500 samples
```

---

### Recovery samples

```id="recovery_samples"
1.35 s × 5000
```

```id="recovery_value"
= 6750 samples
```

---

### Total samples

```id="total_samples"
2500 + 500 + 6750 + 15250
```

```id="total_value"
= 25000 samples
```

Total simulation duration:

```id="total_time"
5.0 seconds
```

---

# 3. Voltage Levels

Nominal Line-to-Line Voltage (RMS)

```id="nominal_voltage"
V_LL_rms = 132 kV
```

Normalized Phase-to-Ground Base (RMS)

```id="base_voltage"
V_base = V_LL_rms / √3 ≈ 76.21 kV
```

Sinusoidal Peak Voltage (for 1.0 pu)

```id="peak_formula"
V_peak = V_base × √2 ≈ 107.78 kV
```

Per-unit conversion

```id="pu_formula"
V_pu = V_actual / V_nom
```

---

Recovery voltage target

```id="recovery_voltage"
0.9 × 132
```

```id="recovery_value_calc"
= 118.8 kV
```

---

# 4. Voltage Profile Definition

The waveform consists of **three regions**.

---

## Region 1 — Pre-Fault

Duration

```id="prefault_duration"
0 – 0.5 s
```

Voltage

```id="prefault_voltage"
V = 132 kV
```

Samples

```id="prefault_range"
0 → 2499
```

---

## Region 2 — Fault

Voltage collapses to zero.

Fault inception

```id="fault_time"
t = 0
```

(occurs immediately after pre-fault period)

Duration

```id="fault_duration"
0.5 s → 0.6 s
```

Voltage

```id="fault_voltage"
V = 0
```

Samples

```id="fault_range"
2500 → 2999
```

---

## Region 3 — Voltage Recovery

Recovery begins

```id="recovery_start"
t = 0.6 s
```

Recovery duration

```id="recovery_duration"
1.35 s
```

Recovery end

```id="recovery_end"
1.95 s
```

Voltage increases **linearly** from

```id="start_recovery_voltage"
0 V
```

to

```id="end_recovery_voltage"
118.8 kV
```

---

# 5. Linear Recovery Equation

For time

```id="recovery_time_var"
t ∈ [0.6 , 1.95]
```

Voltage equation

```id="linear_equation"
V(t) = slope × (t − 0.6)
```

Slope

```id="slope_calc"
118.8 / 1.35
```

```id="slope_value"
= 88 kV/s
```

Final equation

```id="voltage_equation"
V(t) = 88 × (t − 0.6)
```

---

# 6. Sinusoidal Waveform (3-Phase)

For a sinusoidal representation at 50 Hz, the instantaneous voltage is:

```id="sine_equation"
V_inst(t) = V_profile(t) × sin(2π × 50 × t + φ)
```

Where:
- `V_profile(t)` is the envelope defined in the regions above.
- `φ` is the phase angle (0°, -120°, 120° for 3-phase).

---

# 7. Variant: LVRT_CM (70% Recovery)

Special variant with faster recovery to a lower threshold.

| Region | Time | Voltage |
|---|---|---|
| Pre-fault | 0.0 - 0.5s | 132 kV LL RMS |
| Fault | 0.5 - 0.6s | 0 V |
| Recovery | 0.6 - 0.85s | Ramp to 92.4 kV LL RMS (0.7 pu) |
| Stable | 0.85 - 5.0s | Flat 92.4 kV LL RMS |

---

# 8. Python Implementation

import numpy as np
import pandas as pd

def generate_waveform(filename, target_pu, recovery_duration, total_duration=5.0):
    sampling_rate = 5000
    dt = 1 / sampling_rate
    prefault_time = 0.5
    fault_time = 0.1
    V_ll_rms = 132
    V_peak = V_ll_rms * np.sqrt(2/3)
    V_target_peak = target_pu * V_peak
    freq = 50

    total_samples = int(total_duration * sampling_rate)
    t = np.arange(total_samples) * dt
    env = np.zeros(total_samples)
    
    prefault_samples = int(prefault_time * sampling_rate)
    fault_samples = int(fault_time * sampling_rate)
    env[0:prefault_samples] = V_peak
    
    start_rec = prefault_samples + fault_samples
    end_rec = start_rec + int(recovery_duration * sampling_rate)
    
    for i in range(start_rec, min(end_rec, total_samples)):
        elapsed = (i - start_rec) * dt
        env[i] = (V_target_peak / recovery_duration) * elapsed
    if end_rec < total_samples:
        env[end_rec:] = V_target_peak

    VA = env * np.sin(2 * np.pi * freq * t)
    VB = env * np.sin(2 * np.pi * freq * t - 2 * np.pi / 3)
    VC = env * np.sin(2 * np.pi * freq * t + 2 * np.pi / 3)

    df = pd.DataFrame({"time_s": t, "VA_kV": VA, "VB_kV": VB, "VC_kV": VC})
    df.to_csv(filename, index=False)
    print(f"Generated {filename}")

# Generate variants
generate_waveform("lvrt_voltage_profile.csv", 0.9, 1.35)
generate_waveform("LVRT_CM.csv", 0.7, 0.25)
```

---

# 7. Expected Waveform Shape

Voltage profile:

```
132 kV ────────────────┐
                       │
                       │
                       │
0 kV                   ├───────────
                       │           /
                       │          /
                       │         /
118.8 kV              │        /
                       │       /
                       └──────┘
      0.5s     0.6s         1.95s
```

Behavior:

| Stage     | Voltage     |
| --------- | ----------- |
| Pre-fault | 132 kV      |
| Fault     | 0 kV        |
| Recovery  | linear ramp |
| Final     | 118.8 kV    |

---

# 8. Optional Extensions

You may extend the waveform with:

### Noise

```id="noise_example"
±0.5 % measurement noise
```

---

### Three-phase simulation

```id="three_phase"
VA
VB
VC
```

With phase shift

```id="phase_shift"
120°
```

---

### Frequency disturbance

Add slight frequency dip

```id="frequency_example"
50 Hz → 49.7 Hz
```

---

# 9. Usage in Your Waveform Viewer

This dataset is ideal for testing:

* waveform rendering
* LVRT threshold detection
* reference lines (0.7 pu etc.)
* zoom and cursor tools
* axis scaling

---

# 10. Output Dataset

Output file

```
lvrt_voltage_profile.csv
```

Columns

| Column     | Description     |
| ---------- | --------------- |
| time_s     | simulation time |
| voltage_kV | waveform value  |
