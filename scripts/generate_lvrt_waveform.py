import numpy as np
import pandas as pd
import os

def generate_waveform(filename, target_pu, recovery_duration, total_duration=5.0):
    sampling_rate = 5000
    dt = 1 / sampling_rate

    prefault_time = 0.5
    fault_time = 0.1
    
    V_ll_rms = 132 # Line-to-Line RMS
    V_peak = V_ll_rms * np.sqrt(2/3) # Phase-to-Ground Peak
    
    V_target_peak = target_pu * V_peak
    freq = 50

    prefault_samples = int(prefault_time * sampling_rate)
    fault_samples = int(fault_time * sampling_rate)
    recovery_samples = int(recovery_duration * sampling_rate)
    total_samples = int(total_duration * sampling_rate)

    # Time vector
    t = np.arange(total_samples) * dt

    # Envelope Profile (Peak values)
    env = np.zeros(total_samples)
    env[0:prefault_samples] = V_peak
    env[prefault_samples:prefault_samples + fault_samples] = 0

    start_rec = prefault_samples + fault_samples
    end_rec = start_rec + recovery_samples

    # Recovery Ramp
    for i in range(start_rec, min(end_rec, total_samples)):
        elapsed = (i - start_rec) * dt
        env[i] = (V_target_peak / recovery_duration) * elapsed

    # Post-recovery flat
    if end_rec < total_samples:
        env[end_rec:] = V_target_peak

    # Generate 3-phase Sine Waves
    VA = env * np.sin(2 * np.pi * freq * t)
    VB = env * np.sin(2 * np.pi * freq * t - 2 * np.pi / 3)
    VC = env * np.sin(2 * np.pi * freq * t + 2 * np.pi / 3)

    df = pd.DataFrame({
        "time_s": t,
        "VA_kV": VA,
        "VB_kV": VB,
        "VC_kV": VC
    })

    df.to_csv(filename, index=False)
    print(f"Generated: {filename}")
    print(f"  Target: {target_pu} pu ({V_target_peak/np.sqrt(2):.2f} kV Ph-G RMS)")
    print(f"  Recovery Duration: {recovery_duration}s")
    print(f"  Total Duration: {total_duration}s")

if __name__ == "__main__":
    # Original PPM spec: recovery to 0.9 pu in 1.35s
    generate_waveform("lvrt_voltage_profile.csv", target_pu=0.9, recovery_duration=1.35)
    
    # New CM spec: recovery to 0.7 pu in 0.25s (from 0.6s to 0.85s)
    generate_waveform("LVRT_CM.csv", target_pu=0.7, recovery_duration=0.25)
