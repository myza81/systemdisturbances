#!/usr/bin/env python3
"""
COMTRADE File Parser Script

Standalone utility to parse a COMTRADE file pair (.cfg + .dat) and
print a summary of channels and sample data to stdout.

Usage:
    python parse_comtrade.py <path/to/file.cfg> [path/to/file.dat]

If .dat path is omitted, it is inferred from the .cfg path.

Requirements:
    pip install comtrade numpy
"""

import sys
import os
import json
from pathlib import Path


def parse_comtrade(cfg_path: str, dat_path: str = None) -> dict:
    """
    Parse a COMTRADE file pair and return structured data.

    Returns:
        dict with 'metadata' and 'channels' keys conforming to the
        django-react-power-disturbance parser interface.
    """
    try:
        import comtrade
    except ImportError:
        print("ERROR: 'comtrade' package not installed. Run: pip install comtrade")
        sys.exit(1)
    import numpy as np

    cfg_path = Path(cfg_path)
    if dat_path is None:
        dat_path = cfg_path.with_suffix('.dat')
        if not dat_path.exists():
            dat_path = cfg_path.with_suffix('.DAT')

    if not cfg_path.exists():
        raise FileNotFoundError(f"CFG file not found: {cfg_path}")
    if not dat_path.exists():
        raise FileNotFoundError(f"DAT file not found: {dat_path}")

    rec = comtrade.Comtrade()
    rec.load(str(cfg_path), str(dat_path))

    metadata = {
        'source_type': 'COMTRADE',
        'station_name': rec.station_name or '',
        'recording_device_id': rec.rec_dev_id or '',
        'start_time': str(rec.start_timestamp) if rec.start_timestamp else None,
        'trigger_time': str(rec.trigger_timestamp) if rec.trigger_timestamp else None,
        'frequency': float(rec.frequency) if rec.frequency else 50.0,
        'total_samples': rec.total_samples,
        'num_analogue_channels': len(rec.cfg.analog_channels),
        'num_digital_channels': len(rec.cfg.status_channels),
        'sample_rates': rec.cfg.sample_rates,
    }

    channels = []

    # Analogue channels
    for i, ch in enumerate(rec.cfg.analog_channels):
        scale = float(ch.a) if ch.a and abs(float(ch.a)) > 0.001 else 1.0
        raw = np.array(rec.analog[i], dtype=float)
        scaled = raw * scale
        samples = [
            (int(rec.time[t] * 1_000_000), float(scaled[t]))
            for t in range(rec.total_samples)
        ]
        channels.append({
            'name': ch.name.strip(),
            'unit': ch.uu.strip() if ch.uu else '',
            'type': 'ANALOGUE',
            'phase': _infer_phase(ch.name),
            'multiplier': scale,
            'min_value': float(np.min(scaled)),
            'max_value': float(np.max(scaled)),
            'rms': float(np.sqrt(np.mean(scaled ** 2))),
            'samples': samples[:10],  # Summary: first 10 samples only
            'total_samples': len(samples),
        })

    # Digital (status) channels
    for i, ch in enumerate(rec.cfg.status_channels):
        samples = [
            (int(rec.time[t] * 1_000_000), int(rec.status[i][t]))
            for t in range(rec.total_samples)
        ]
        # Detect transitions
        values = [s[1] for s in samples]
        transitions = sum(1 for j in range(1, len(values)) if values[j] != values[j-1])
        channels.append({
            'name': ch.name.strip(),
            'unit': 'binary',
            'type': 'DIGITAL',
            'phase': 'NA',
            'multiplier': 1.0,
            'transitions': transitions,
            'final_state': values[-1] if values else 0,
            'samples': samples[:10],
            'total_samples': len(samples),
        })

    return {'metadata': metadata, 'channels': channels}


def _infer_phase(channel_name: str) -> str:
    name = channel_name.upper()
    if 'VA' in name or '_A' in name or name.endswith('A'): return 'A'
    if 'VB' in name or '_B' in name or name.endswith('B'): return 'B'
    if 'VC' in name or '_C' in name or name.endswith('C'): return 'C'
    if 'VN' in name or 'IN' in name or 'NEUTRAL' in name:  return 'N'
    return 'NA'


def main():
    if len(sys.argv) < 2:
        print("Usage: parse_comtrade.py <file.cfg> [file.dat]")
        sys.exit(1)

    cfg_path = sys.argv[1]
    dat_path = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Parsing COMTRADE file: {cfg_path}")
    result = parse_comtrade(cfg_path, dat_path)

    print("\n=== METADATA ===")
    for k, v in result['metadata'].items():
        if k != 'sample_rates':
            print(f"  {k}: {v}")

    print(f"\n=== CHANNELS ({len(result['channels'])} total) ===")
    analogue = [c for c in result['channels'] if c['type'] == 'ANALOGUE']
    digital  = [c for c in result['channels'] if c['type'] == 'DIGITAL']

    print(f"\nAnalogue channels ({len(analogue)}):")
    for ch in analogue:
        print(f"  [{ch['phase']}] {ch['name']} ({ch['unit']}) "
              f"| RMS={ch['rms']:.4f} | "
              f"min={ch['min_value']:.4f} max={ch['max_value']:.4f} "
              f"| {ch['total_samples']} samples")

    print(f"\nDigital channels ({len(digital)}):")
    for ch in digital:
        print(f"  {ch['name']} | transitions={ch['transitions']} "
              f"| final_state={ch['final_state']}")

    print("\n=== FIRST 5 SAMPLES (Channel 0) ===")
    if result['channels']:
        for t, v in result['channels'][0]['samples'][:5]:
            print(f"  t={t/1000:.3f}ms  val={v:.6f}")

    # Optionally write full JSON output
    if '--json' in sys.argv:
        out_path = Path(cfg_path).with_suffix('.parsed.json')
        # For JSON export, rebuild with full samples (not truncated)
        print(f"\nWriting full JSON output to: {out_path}")
        with open(out_path, 'w') as f:
            json.dump({'metadata': result['metadata'],
                       'channel_count': len(result['channels'])}, f, indent=2)


if __name__ == '__main__':
    main()
