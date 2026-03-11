#!/usr/bin/env python3
"""
PSS/E RAW File Parser Script

Standalone utility to parse a PSS/E RAW network file (.raw) and
print a summary of bus, load, and generator data.

Supports PSS/E RAW versions 29-35 (fixed-section ASCII format).

Usage:
    python parse_psse.py <path/to/network.raw>
    python parse_psse.py <path/to/network.raw> --json

Requirements:
    pip install pandas  (optional, for tabular output)
"""

import sys
import json
from pathlib import Path


SECTION_LABELS = {
    0: 'Case ID',
    1: 'Bus',
    2: 'Load',
    3: 'Fixed Shunt',
    4: 'Generator',
    5: 'Branch',
    6: 'Transformer',
    7: 'Area Interchange',
    8: 'DC Line',
    9: 'VSC DC Line',
    10: 'Switched Shunt',
    11: 'Impedance Correction',
    12: 'Multi-Terminal DC',
    13: 'Multi-Section Line',
    14: 'Zone',
    15: 'Inter-area Transfer',
    16: 'Owner',
    17: 'FACTS Device',
}

BUS_TYPES = {1: 'PQ (Load)', 2: 'PV (Gen)', 3: 'Swing', 4: 'Isolated'}


def parse_psse(file_path: str) -> dict:
    """
    Parse PSS/E RAW file and return structured network data.

    Returns:
        dict with 'metadata', 'buses', 'loads', 'generators', 'branches'
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    buses, loads, generators, branches = [], [], [], []
    case_meta = {
        'source_type': 'PSSE',
        'filename': file_path.name,
        'sbase_mva': 100.0,
        'frequency': 50.0,
        'psse_version': None,
        'case_description': '',
    }

    section = -1  # -1 = before first data
    line_count = 0

    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for raw_line in f:
            line_count += 1
            line = raw_line.strip()

            # Skip empty lines
            if not line:
                continue

            # Section terminator
            if line.startswith('@') or line.upper().startswith('Q'):
                section += 1
                continue

            # Skip comment lines
            if line.startswith('/') or line.startswith('!'):
                continue

            if section == -1:
                # First data line: Case identification
                parts = [p.strip() for p in line.split(',')]
                try:
                    case_meta['sbase_mva'] = float(parts[1]) if len(parts) > 1 else 100.0
                    case_meta['frequency'] = float(parts[2]) if len(parts) > 2 else 50.0
                    # Version hint from field 8 or 9
                    if len(parts) > 8:
                        try:
                            case_meta['psse_version'] = int(float(parts[8]))
                        except ValueError:
                            pass
                except (IndexError, ValueError):
                    pass
                section = 0

            elif section == 0:
                # Additional case ID / title lines
                if not line[0].isdigit() and not line.startswith('-'):
                    case_meta['case_description'] += line + ' '

            elif section == 1:
                # Bus data
                bus = _parse_bus(line)
                if bus:
                    buses.append(bus)

            elif section == 2:
                # Load data
                load = _parse_load(line)
                if load:
                    loads.append(load)

            elif section == 4:
                # Generator data
                gen = _parse_generator(line)
                if gen:
                    generators.append(gen)

            elif section == 5:
                # Branch data
                branch = _parse_branch(line)
                if branch:
                    branches.append(branch)

    # Compute summary statistics
    active_buses = [b for b in buses if b['type'] != 4]
    isolated_buses = [b for b in buses if b['type'] == 4]
    swing_buses = [b for b in buses if b['type'] == 3]
    total_load_mw = sum(l['pl'] for l in loads)
    total_load_mvar = sum(l['ql'] for l in loads)
    total_gen_mw = sum(g['pg'] for g in generators)

    return {
        'metadata': {
            **case_meta,
            'total_buses': len(buses),
            'active_buses': len(active_buses),
            'isolated_buses': len(isolated_buses),
            'swing_buses': len(swing_buses),
            'total_loads': len(loads),
            'total_generators': len(generators),
            'total_branches': len(branches),
            'total_load_mw': round(total_load_mw, 2),
            'total_load_mvar': round(total_load_mvar, 2),
            'total_gen_mw': round(total_gen_mw, 2),
        },
        'buses': buses,
        'loads': loads,
        'generators': generators,
        'branches': branches,
    }


def _parse_bus(line: str) -> dict | None:
    try:
        parts = [p.strip().strip("'") for p in line.split(',')]
        if len(parts) < 9:
            return None
        bus_type = int(parts[3])
        return {
            'number': int(parts[0]),
            'name': parts[1],
            'baskv': float(parts[2]),
            'type': bus_type,
            'type_label': BUS_TYPES.get(bus_type, 'Unknown'),
            'area': int(parts[4]) if len(parts) > 4 else 1,
            'zone': int(parts[5]) if len(parts) > 5 else 1,
            'vm': float(parts[7]),    # Voltage magnitude (pu)
            'va': float(parts[8]),    # Voltage angle (degrees)
        }
    except (IndexError, ValueError):
        return None


def _parse_load(line: str) -> dict | None:
    try:
        parts = [p.strip().strip("'") for p in line.split(',')]
        if len(parts) < 7:
            return None
        return {
            'bus': int(parts[0]),
            'id': parts[1],
            'status': int(parts[3]) if len(parts) > 3 else 1,
            'pl': float(parts[5]),     # Active load (MW)
            'ql': float(parts[6]),     # Reactive load (MVAr)
        }
    except (IndexError, ValueError):
        return None


def _parse_generator(line: str) -> dict | None:
    try:
        parts = [p.strip().strip("'") for p in line.split(',')]
        if len(parts) < 4:
            return None
        return {
            'bus': int(parts[0]),
            'id': parts[1],
            'pg': float(parts[2]),     # Active generation (MW)
            'qg': float(parts[3]),     # Reactive generation (MVAr)
            'status': int(parts[14]) if len(parts) > 14 else 1,
        }
    except (IndexError, ValueError):
        return None


def _parse_branch(line: str) -> dict | None:
    try:
        parts = [p.strip().strip("'") for p in line.split(',')]
        if len(parts) < 4:
            return None
        return {
            'from_bus': int(parts[0]),
            'to_bus': int(parts[1]),
            'id': parts[2],
            'r': float(parts[3]),     # Resistance (pu)
            'x': float(parts[4]) if len(parts) > 4 else 0.0,  # Reactance (pu)
            'status': int(parts[13]) if len(parts) > 13 else 1,
        }
    except (IndexError, ValueError):
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: parse_psse.py <file.raw> [--json]")
        sys.exit(1)

    file_path = sys.argv[1]
    print(f"Parsing PSS/E RAW file: {file_path}")

    result = parse_psse(file_path)
    meta = result['metadata']

    print("\n=== CASE METADATA ===")
    print(f"  Version:      PSS/E {meta.get('psse_version', 'unknown')}")
    print(f"  Base MVA:     {meta['sbase_mva']} MVA")
    print(f"  Frequency:    {meta['frequency']} Hz")
    print(f"  Description:  {meta['case_description'].strip()}")

    print("\n=== NETWORK SUMMARY ===")
    print(f"  Total buses:      {meta['total_buses']} ({meta['isolated_buses']} isolated)")
    print(f"  Swing buses:      {meta['swing_buses']}")
    print(f"  Total loads:      {meta['total_loads']}")
    print(f"  Total generators: {meta['total_generators']}")
    print(f"  Total branches:   {meta['total_branches']}")
    print(f"  Total load:       {meta['total_load_mw']} MW / {meta['total_load_mvar']} MVAr")
    print(f"  Total gen:        {meta['total_gen_mw']} MW")

    print("\n=== BUS VOLTAGE SUMMARY (first 10 active buses) ===")
    active = [b for b in result['buses'] if b['type'] != 4][:10]
    for b in active:
        print(f"  Bus {b['number']:5d} [{b['type_label']:12s}] "
              f"{b['name']:20s} Vm={b['vm']:.4f}pu Va={b['va']:8.3f}deg "
              f"BaseKV={b['baskv']}kV")

    print("\n=== GENERATOR SUMMARY (first 10) ===")
    for g in result['generators'][:10]:
        print(f"  Bus {g['bus']:5d} ID={g['id']}  "
              f"PG={g['pg']:8.2f}MW  QG={g['qg']:8.2f}MVAr  Status={g['status']}")

    if '--json' in sys.argv:
        out_path = Path(file_path).with_suffix('.parsed.json')
        print(f"\nWriting JSON summary to: {out_path}")
        # Write metadata only (channel data is large)
        with open(out_path, 'w') as f:
            json.dump({
                'metadata': result['metadata'],
                'buses': result['buses'],
                'loads': result['loads'],
                'generators': result['generators'],
            }, f, indent=2)
        print(f"Done. ({out_path})")


if __name__ == '__main__':
    main()
