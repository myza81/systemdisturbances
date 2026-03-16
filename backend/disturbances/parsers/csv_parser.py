"""
CSV Parser
----------
Parses power system waveform data from CSV files into the standard waveform payload schema.

Assumptions / heuristics (applied when user does not provide column mapping):
  1. Time column:
     - Named: 'time', 't', 'timestamp', 'time(s)', 'time_s', 'sec', 'seconds' (case-insensitive)
     - If no named match found: first column that is fully numeric and monotonically increasing
  2. Digital channels:
     - Columns whose values are exclusively 0 and 1 (after numeric coercion)
  3. Analog channels:
     - All remaining numeric columns
  4. Phase detection:
     - Applied to column headers using the same heuristic as COMTRADE parser
  5. Units:
     - If a second header row exists (row 2 = units row), it is used
     - Otherwise extracted from column name e.g. "VR (kV)" → unit = 'kV'
  6. Sample rate:
     - Computed from mean time delta of the time column
  7. Trigger time:
     - If a column named 'trigger' or values pass through 0, trigger at t=0
     - Otherwise defaults to midpoint of the recording

Column mapping can be overridden by passing a `column_map` dict:
{
    'time': 'column_header_name',
    'channels': {
        'channel_display_name': {
            'source_column': 'column_header_name',
            'unit': 'kV',
            'phase': 'R'   # optional override
        }
    }
}
"""

import io
import re
import pandas as pd
import numpy as np
from .comtrade_parser import _detect_phase


# ─── Time column heuristics ───────────────────────────────────────────────────

_TIME_COLUMN_ALIASES = {
    'time', 't', 'timestamp', 'time(s)', 'time_s', 'sec', 'seconds',
    'time (s)', 'time[s]', 'ms', 'time(ms)', 'time_ms', 'time (ms)'
}


def _find_time_column(df: pd.DataFrame) -> str | None:
    """Return the name of the time column using name-based heuristics."""
    for col in df.columns:
        if col.strip().lower() in _TIME_COLUMN_ALIASES:
            return col
    # Fallback: first numeric column that is monotonically non-decreasing
    for col in df.columns:
        series = pd.to_numeric(df[col], errors='coerce')
        if series.notna().all() and series.is_monotonic_increasing:
            return col
    return None


# ─── Unit extraction ──────────────────────────────────────────────────────────

_UNIT_PATTERN = re.compile(r'\(([^)]+)\)|\[([^\]]+)\]')


def _extract_unit_from_name(col_name: str) -> tuple[str, str]:
    """
    Returns (clean_name, unit) by extracting parenthesised or bracketed unit suffix.
    e.g. "VR (kV)" → ("VR", "kV")
         "IR [kA]"  → ("IR", "kA")
         "VR"       → ("VR", "")
    """
    match = _UNIT_PATTERN.search(col_name)
    if match:
        unit = match.group(1) or match.group(2)
        clean = _UNIT_PATTERN.sub('', col_name).strip()
        return clean, unit.strip()
    return col_name.strip(), ''


# ─── Digital channel detection ────────────────────────────────────────────────

def _is_digital(series: pd.Series) -> bool:
    """Return True if all non-null values are 0 or 1."""
    vals = pd.to_numeric(series, errors='coerce').dropna()
    if vals.empty:
        return False
    unique_vals = set(vals.unique())
    return unique_vals.issubset({0, 1, 0.0, 1.0})


# ─── Main parse function ──────────────────────────────────────────────────────

def parse_csv(csv_file, column_map: dict | None = None) -> dict:
    """
    Parses a CSV file into the standard waveform payload dict.

    Args:
        csv_file: file-like object (Django InMemoryUploadedFile or BytesIO)
        column_map: optional user-supplied column mapping dict (see module docstring)

    Returns:
        Standard waveform payload dict.
    """
    content = csv_file.read()
    if isinstance(content, bytes):
        content = content.decode('utf-8', errors='replace')

    header_idx = column_map.get('start_row', 0) if column_map else 0
    raw = pd.read_csv(io.StringIO(content), header=header_idx)
    raw.columns = raw.columns.str.strip()
    
    # Handle potential duplicate columns (e.g. from whitespace stripping)
    if raw.columns.duplicated().any():
        new_cols = []
        counts = {}
        for col in raw.columns:
            if col in counts:
                counts[col] += 1
                new_cols.append(f"{col}.{counts[col]}")
            else:
                counts[col] = 0
                new_cols.append(col)
        raw.columns = new_cols

    # Drop rows that are entirely NaN (common in poorly formatted exports)
    raw.dropna(how='all', inplace=True)

    # Detect if row 2 is a units row (all strings, no numerics)
    units_row: dict[str, str] = {}
    if len(raw) > 0:
        first_data_row = pd.to_numeric(raw.iloc[0], errors='coerce')
        if first_data_row.isna().all():
            # Row 1 (0-indexed) is a units row
            for col in raw.columns:
                units_row[col] = str(raw.iloc[0][col]).strip()
            raw = raw.iloc[1:].reset_index(drop=True)

    # Coerce all columns to numeric where possible
    for col in raw.columns:
        raw[col] = pd.to_numeric(raw[col], errors='coerce')

    # ── Apply user-supplied column mapping ──
    if column_map:
        time_mode = column_map.get('time_mode', 'column')
        sample_rate_hz = column_map.get('sample_rate', 1000)
        
        if time_mode == 'manual':
            # Generate synthetic time axis from sample rate
            time_array = [i / sample_rate_hz for i in range(len(raw))]
        else:
            time_col_target = column_map.get('time', '').strip()
            time_col = next((c for c in raw.columns if c == time_col_target), None)
            
            if not time_col:
                time_col = _find_time_column(raw)
            
            if time_col:
                # First try numeric
                t_series = pd.to_numeric(raw[time_col], errors='coerce')
                if t_series.isna().all():
                    # Try datetime
                    try:
                        t_series = pd.to_datetime(raw[time_col], errors='coerce')
                        if t_series.notna().any():
                            # Convert to relative seconds from first sample
                            start_time = t_series.iloc[0]
                            t_series = (t_series - start_time).dt.total_seconds()
                    except:
                        pass
                time_array = t_series.dropna().tolist()
            else:
                time_array = list(range(len(raw)))

        analog_channels = []
        digital_channels = []
        user_channels = column_map.get('channels', {})

        for display_name, ch_cfg in user_channels.items():
            src_col = ch_cfg.get('source_column', display_name)
            if src_col not in raw.columns:
                continue
            series = raw[src_col]
            unit = ch_cfg.get('unit', units_row.get(src_col, ''))
            phase = ch_cfg.get('phase', _detect_phase(display_name))
            if _is_digital(series):
                digital_channels.append({'name': display_name, 'values': series.fillna(0).astype(int).tolist()})
            else:
                analog_channels.append({'name': display_name, 'unit': unit, 'phase': phase, 'values': series.fillna(0).tolist()})

    else:
        # ── Auto-detect columns via heuristics ──
        time_col = _find_time_column(raw)
        if time_col:
            t_series = pd.to_numeric(raw[time_col], errors='coerce')
            if t_series.isna().all():
                try:
                    t_series = pd.to_datetime(raw[time_col], errors='coerce')
                    if t_series.notna().any():
                        start_time = t_series.iloc[0]
                        t_series = (t_series - start_time).dt.total_seconds()
                except: pass
            time_array = t_series.dropna().tolist()
        else:
            time_array = list(range(len(raw)))

        analog_channels = []
        digital_channels = []

        for col in raw.columns:
            if col == time_col:
                continue
            series = raw[col]
            if series.isna().all():
                continue
            clean_name, unit = _extract_unit_from_name(col)
            if not unit:
                unit = units_row.get(col, '')
            phase = _detect_phase(clean_name)

            if _is_digital(series):
                digital_channels.append({
                    'name': clean_name,
                    'values': series.fillna(0).astype(int).tolist()
                })
            else:
                analog_channels.append({
                    'name': clean_name,
                    'unit': unit,
                    'phase': phase,
                    'values': series.fillna(0).tolist()
                })

    # ── Normalize time units to seconds ──
    # Guarantee: payload['time'] is always seconds for all sources.
    # Heuristics:
    # - If column header indicates milliseconds (ms/time_ms/time(ms)), convert.
    # - Otherwise infer from dt magnitude (if dt suggests ms scale).
    time_mode = column_map.get('time_mode', 'column') if column_map else 'column'
    sample_rate_hz = column_map.get('sample_rate', 1000) if column_map else 0

    def _maybe_convert_ms_to_s(time_vals, time_col_name):
        if not time_vals:
            return time_vals
        col = (time_col_name or '').strip().lower()
        name_says_ms = (
            col in {'ms', 'time_ms', 'time(ms)', 'time (ms)'} or
            'time_ms' in col or
            '(ms' in col or
            '[ms' in col or
            col.endswith('ms')
        )

        # dt-based inference: if interpreted as seconds, dt is unusually large
        # for waveform sampling (e.g. 1.0 -> 1 Hz). Convert to seconds.
        dt = None
        if len(time_vals) > 2:
            deltas = [time_vals[i + 1] - time_vals[i] for i in range(min(200, len(time_vals) - 1))]
            deltas = [d for d in deltas if d > 0]
            if deltas:
                dt = sum(deltas) / len(deltas)

        if name_says_ms:
            return [t / 1000.0 for t in time_vals]

        if dt is not None and dt > 0:
            # If dt is >= 0.5 when treated as seconds, sampling would be <= 2 Hz.
            # If dividing by 1000 yields a plausible waveform sample rate, assume ms.
            sr_s = (1.0 / dt)
            sr_ms = (1000.0 / dt)
            if sr_s < 20 and 50 <= sr_ms <= 500000:
                return [t / 1000.0 for t in time_vals]

        return time_vals

    if time_mode != 'manual':
        time_col_name = None
        if column_map:
            time_col_name = (column_map.get('time') or '').strip() or None
        else:
            time_col_name = time_col
        time_array = _maybe_convert_ms_to_s(time_array, time_col_name)

    # ── Compute sample rate ──
    sample_rate = 0.0
    if len(time_array) > 1:
        deltas = [time_array[i + 1] - time_array[i] for i in range(min(100, len(time_array) - 1))]
        mean_dt = sum(deltas) / len(deltas)
        sample_rate = round(1.0 / mean_dt) if mean_dt > 0 else 0.0

    # ── Compute trigger time ──
    # If time array crosses zero, trigger is at t=0; otherwise use midpoint
    time_np = np.array(time_array)
    if np.any(time_np <= 0) and np.any(time_np >= 0):
        trigger_time = 0.0
    else:
        trigger_time = float(time_np[len(time_np) // 2]) if len(time_np) > 0 else 0.0

    # ── Prepare return ──
    final_sample_rate = sample_rate_hz if time_mode == 'manual' else sample_rate

    return {
        'time': time_array,
        'trigger_time': trigger_time,
        'sample_rate': final_sample_rate,
        'station': '',
        'device': '',
        'frequency': 50.0,
        'analog': analog_channels,
        'digital': digital_channels,
    }
