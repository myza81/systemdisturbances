# File Parsers Reference

## Table of Contents
1. File Type Detection Logic
2. COMTRADE Parser
3. CSV Parser
4. Excel Parser
5. PSS/E RAW Parser
6. Common Parser Interface

---

## 1. File Type Detection Logic

Frontend uploads one file at a time. Detection order:
1. Extension-based (primary): `.cfg`/`.dat` = COMTRADE, `.raw` = PSS/E, `.csv` = CSV, `.xlsx/.xls` = Excel
2. Magic bytes (fallback): read first 512 bytes for format signatures
3. Frontend dropdown: user can override detected type before parsing begins

Special COMTRADE handling: when user uploads `.cfg`, system asks for paired `.dat`; when `.dat` is uploaded first, system asks for `.cfg`. Both are required before parsing.

Frontend FileTypeHint component: shows detected type + allows override:
```jsx
const FILE_TYPE_OPTIONS = [
  { value: 'COMTRADE', label: 'COMTRADE (.cfg + .dat)' },
  { value: 'CSV',      label: 'CSV (.csv)' },
  { value: 'EXCEL',    label: 'Excel (.xlsx)' },
  { value: 'PSSE',     label: 'PSS/E RAW (.raw)' },
];
```

---

## 2. COMTRADE Parser

Install: `pip install comtrade`

```python
# apps/disturbances/parsers/comtrade_parser.py
import comtrade
from datetime import datetime

class ComtradeParser:
    def parse(self, cfg_path: str, options: dict) -> dict:
        """
        cfg_path: path to the .cfg file
        options: { 'dat_path': str }  -- required
        """
        dat_path = options.get('dat_path')
        if not dat_path:
            raise ValueError("COMTRADE requires both .cfg and .dat files")

        rec = comtrade.Comtrade()
        rec.load(cfg_path, dat_path)

        metadata = {
            'source_type': 'COMTRADE',
            'station_name': rec.station_name or '',
            'start_time': rec.start_timestamp,
            'frequency': rec.frequency or 50.0,
            'comtrade_version': rec.rec_dev_id,
            'sample_rates': rec.cfg.sample_rates,
        }

        channels = []

        # Analogue channels
        for i, ch in enumerate(rec.cfg.analog_channels):
            # Apply primary/secondary ratio scaling
            scale = ch.a if ch.a else 1.0
            samples = [
                (int(rec.time[t] * 1_000_000), float(rec.analog[i][t]) * scale)
                for t in range(rec.total_samples)
            ]
            channels.append({
                'name': ch.name,
                'unit': ch.uu,
                'type': 'ANALOGUE',
                'phase': _infer_phase(ch.name),
                'multiplier': scale,
                'samples': samples,
            })

        # Digital (status) channels
        for i, ch in enumerate(rec.cfg.status_channels):
            samples = [
                (int(rec.time[t] * 1_000_000), float(rec.status[i][t]))
                for t in range(rec.total_samples)
            ]
            channels.append({
                'name': ch.name,
                'unit': 'binary',
                'type': 'DIGITAL',
                'phase': 'NA',
                'multiplier': 1.0,
                'samples': samples,
            })

        return {'metadata': metadata, 'channels': channels}


def _infer_phase(channel_name: str) -> str:
    """Heuristic phase detection from channel name."""
    name = channel_name.upper()
    if 'VA' in name or '_A' in name or name.endswith('A'):
        return 'A'
    if 'VB' in name or '_B' in name or name.endswith('B'):
        return 'B'
    if 'VC' in name or '_C' in name or name.endswith('C'):
        return 'C'
    if 'VN' in name or 'IN' in name or 'NEUTRAL' in name:
        return 'N'
    return 'NA'
```

---

## 3. CSV Parser

```python
# apps/disturbances/parsers/csv_parser.py
import pandas as pd
import numpy as np

class CsvParser:
    def parse(self, file_path: str, options: dict) -> dict:
        """
        options: {
            'time_column': str (column name for time, auto-detected if blank),
            'time_unit': 'ms'|'us'|'s' (default: auto-detect),
            'skip_rows': int,
        }
        """
        skip = int(options.get('skip_rows', 0))
        df = pd.read_csv(file_path, skiprows=skip)
        df.columns = df.columns.str.strip()

        time_col = options.get('time_column') or _detect_time_column(df)
        if not time_col:
            raise ValueError("Cannot detect time column in CSV. Specify 'time_column' option.")

        time_unit = options.get('time_unit') or _infer_time_unit(df[time_col])
        time_us = _to_microseconds(df[time_col].values, time_unit)

        channels = []
        for col in df.columns:
            if col == time_col:
                continue
            if df[col].dtype in [np.float64, np.int64, np.float32]:
                values = df[col].fillna(0).values.astype(float)
                samples = list(zip(time_us.tolist(), values.tolist()))
                channels.append({
                    'name': col,
                    'unit': _infer_unit(col),
                    'type': 'ANALOGUE',
                    'phase': _infer_phase_from_name(col),
                    'multiplier': 1.0,
                    'samples': samples,
                })

        return {
            'metadata': {
                'source_type': 'CSV',
                'station_name': '',
                'start_time': None,
                'frequency': 50.0,
            },
            'channels': channels,
        }


def _detect_time_column(df: pd.DataFrame) -> str:
    for col in df.columns:
        if col.lower() in ('time', 't', 'timestamp', 'time_s', 'time_ms', 'time_us'):
            return col
    # Fallback: first numeric column
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            return col
    return ''

def _infer_time_unit(series: pd.Series) -> str:
    max_val = series.max()
    if max_val > 1_000_000:     return 'us'
    if max_val > 1_000:         return 'ms'
    return 's'

def _to_microseconds(arr, unit: str):
    import numpy as np
    if unit == 'us':  return arr.astype(int)
    if unit == 'ms':  return (arr * 1000).astype(int)
    return (arr * 1_000_000).astype(int)  # seconds

def _infer_unit(col_name: str) -> str:
    name = col_name.upper()
    if any(x in name for x in ('VA', 'VB', 'VC', 'VOLT', 'KV')):  return 'V'
    if any(x in name for x in ('IA', 'IB', 'IC', 'AMP', 'CURR')):  return 'A'
    if 'MW' in name or ' P' in name:   return 'MW'
    if 'MVAR' in name or ' Q' in name: return 'MVAr'
    if 'HZ' in name or 'FREQ' in name: return 'Hz'
    return ''

def _infer_phase_from_name(col_name: str) -> str:
    name = col_name.upper()
    if name.endswith('_A') or '_A_' in name: return 'A'
    if name.endswith('_B') or '_B_' in name: return 'B'
    if name.endswith('_C') or '_C_' in name: return 'C'
    return 'NA'
```

---

## 4. Excel Parser

```python
# apps/disturbances/parsers/excel_parser.py
import pandas as pd

class ExcelParser:
    def parse(self, file_path: str, options: dict) -> dict:
        """
        options: {
            'sheet_name': str|int (default: first sheet),
            'time_column': str,
            'skip_rows': int,
        }
        """
        sheet = options.get('sheet_name', 0)
        skip = int(options.get('skip_rows', 0))

        xl = pd.ExcelFile(file_path)
        sheet_names = xl.sheet_names  # Return to frontend for user selection

        df = pd.read_excel(file_path, sheet_name=sheet, skiprows=skip)
        df.columns = df.columns.str.strip().astype(str)

        # Reuse CSV column detection logic
        from .csv_parser import CsvParser, _detect_time_column, _infer_time_unit, \
                                 _to_microseconds, _infer_unit, _infer_phase_from_name
        time_col = options.get('time_column') or _detect_time_column(df)

        time_us = _to_microseconds(df[time_col].values,
                                   _infer_time_unit(df[time_col]))
        channels = []
        import numpy as np
        for col in df.columns:
            if col == time_col:
                continue
            if df[col].dtype in [np.float64, np.int64, np.float32]:
                samples = list(zip(time_us.tolist(),
                                   df[col].fillna(0).values.tolist()))
                channels.append({
                    'name': col,
                    'unit': _infer_unit(col),
                    'type': 'ANALOGUE',
                    'phase': _infer_phase_from_name(col),
                    'multiplier': 1.0,
                    'samples': samples,
                })

        return {
            'metadata': {
                'source_type': 'EXCEL',
                'station_name': '',
                'start_time': None,
                'frequency': 50.0,
                'sheet_names': sheet_names,
            },
            'channels': channels,
        }
```

---

## 5. PSS/E RAW Parser

PSS/E RAW format is a fixed-section ASCII file. This parser handles version 29–35.
No third-party library needed — parse sections directly.

```python
# apps/disturbances/parsers/psse_parser.py
"""
PSS/E RAW format sections (in order):
  0 - Case ID (first line: MVA base, frequency, etc.)
  1 - Bus data
  2 - Load data
  3 - Fixed shunt
  4 - Generator
  5 - Non-transformer branch
  ...
  END - Section terminator (@)
"""

class PsseParser:
    def parse(self, file_path: str, options: dict) -> dict:
        """
        PSS/E RAW files describe a network snapshot, not time-series waveforms.
        Parsed result: bus voltages, load MW/MVAr, gen MW as 'channels' at t=0.
        Channel type = ANALOGUE, time_us = 0 (single snapshot).
        """
        buses, loads, generators, branches = [], [], [], []
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        section = 0
        case_meta = {}

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith('@'):
                if stripped.startswith('@'):
                    section += 1
                continue
            if stripped.startswith('/'):
                continue  # Comment

            if section == 0:
                # Case ID line: SBASE, freq, ...
                parts = stripped.split(',')
                try:
                    case_meta['sbase_mva'] = float(parts[1])
                    case_meta['frequency'] = float(parts[2]) if len(parts) > 2 else 50.0
                except (IndexError, ValueError):
                    pass
                section = 1
            elif section == 1:
                bus = _parse_bus(stripped)
                if bus and bus['type'] != 4:  # Skip isolated buses
                    buses.append(bus)
            elif section == 2:
                load = _parse_load(stripped)
                if load:
                    loads.append(load)
            elif section == 4:
                gen = _parse_gen(stripped)
                if gen:
                    generators.append(gen)

        channels = []
        for bus in buses:
            # Voltage magnitude channel
            channels.append({
                'name': f"Bus{bus['number']}_V",
                'unit': 'pu',
                'type': 'ANALOGUE',
                'phase': 'NA',
                'multiplier': 1.0,
                'samples': [(0, bus['vm'])],
            })
            # Voltage angle channel
            channels.append({
                'name': f"Bus{bus['number']}_VA",
                'unit': 'deg',
                'type': 'ANALOGUE',
                'phase': 'NA',
                'multiplier': 1.0,
                'samples': [(0, bus['va'])],
            })

        for load in loads:
            channels.append({
                'name': f"Load{load['bus']}_P",
                'unit': 'MW',
                'type': 'ANALOGUE',
                'phase': 'NA',
                'multiplier': 1.0,
                'samples': [(0, load['pl'])],
            })
            channels.append({
                'name': f"Load{load['bus']}_Q",
                'unit': 'MVAr',
                'type': 'ANALOGUE',
                'phase': 'NA',
                'multiplier': 1.0,
                'samples': [(0, load['ql'])],
            })

        return {
            'metadata': {
                'source_type': 'PSSE',
                'station_name': '',
                'start_time': None,
                'frequency': case_meta.get('frequency', 50.0),
                'sbase_mva': case_meta.get('sbase_mva', 100.0),
            },
            'channels': channels,
        }


def _parse_bus(line: str) -> dict:
    try:
        p = [x.strip().strip("'") for x in line.split(',')]
        return {
            'number': int(p[0]),
            'name': p[1],
            'baskv': float(p[2]),
            'type': int(p[3]),      # 1=PQ, 2=PV, 3=Swing, 4=Isolated
            'vm': float(p[7]),      # Voltage magnitude (pu)
            'va': float(p[8]),      # Voltage angle (deg)
        }
    except (IndexError, ValueError):
        return None

def _parse_load(line: str) -> dict:
    try:
        p = [x.strip() for x in line.split(',')]
        return {
            'bus': int(p[0]),
            'pl': float(p[5]),  # Active load MW
            'ql': float(p[6]),  # Reactive load MVAr
        }
    except (IndexError, ValueError):
        return None

def _parse_gen(line: str) -> dict:
    try:
        p = [x.strip() for x in line.split(',')]
        return {
            'bus': int(p[0]),
            'pg': float(p[2]),  # Active gen MW
            'qg': float(p[3]),  # Reactive gen MVAr
        }
    except (IndexError, ValueError):
        return None
```

---

## 6. Common Parser Interface

All parsers MUST return this structure:
```python
{
    'metadata': {
        'source_type': str,        # 'COMTRADE'|'CSV'|'EXCEL'|'PSSE'
        'station_name': str,       # Empty string if unknown
        'start_time': datetime|None,
        'frequency': float,        # Nominal system frequency (Hz)
        # Any additional parser-specific keys go here
    },
    'channels': [
        {
            'name': str,
            'unit': str,           # 'V', 'A', 'MW', 'MVAr', 'Hz', 'pu', etc.
            'type': 'ANALOGUE'|'DIGITAL',
            'phase': 'A'|'B'|'C'|'N'|'3PH'|'NA',
            'multiplier': float,   # Scaling factor (1.0 if already scaled)
            'samples': [(time_us: int, value: float), ...],
        }
    ]
}
```
