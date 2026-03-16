"""
Excel Parser
------------
Parses power system waveform data from Excel (.xlsx, .xls) files.

Applies the same heuristics as the CSV parser. Reads the first sheet by default.
If the file has multiple sheets, tries to find the one with the most data.

Column mapping and schema: identical to csv_parser.py — see that module for full docs.
"""

import io
import pandas as pd
import numpy as np
from .csv_parser import (
    _find_time_column,
    _extract_unit_from_name,
    _is_digital,
)
from .comtrade_parser import _detect_phase


def _best_sheet(xl: pd.ExcelFile) -> str:
    """Return the sheet name with the most rows of numeric data."""
    best_sheet = xl.sheet_names[0]
    best_rows = 0
    for sheet in xl.sheet_names:
        try:
            df = xl.parse(sheet, nrows=5)
            numeric_cols = df.select_dtypes(include='number').shape[1]
            if numeric_cols > best_rows:
                best_rows = numeric_cols
                best_sheet = sheet
        except Exception:
            continue
    return best_sheet


def parse_excel(excel_file, column_map: dict | None = None, sheet_name: str | None = None) -> dict:
    """
    Parses an Excel file into the standard waveform payload dict.

    Args:
        excel_file: file-like object (Django InMemoryUploadedFile or BytesIO)
        column_map: optional user-supplied column mapping dict (same as csv_parser)
        sheet_name: optional sheet to read; if None, auto-selects sheet with most data

    Returns:
        Standard waveform payload dict.
    """
    content = excel_file.read()
    buffer = io.BytesIO(content)

    xl = pd.ExcelFile(buffer)
    target_sheet = sheet_name if sheet_name and sheet_name in xl.sheet_names else _best_sheet(xl)

    header_idx = column_map.get('start_row', 0) if column_map else 0
    raw = xl.parse(target_sheet, header=header_idx)
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
    raw.dropna(how='all', inplace=True)

    # Detect if row 0 is a units row (all non-numeric strings)
    units_row: dict[str, str] = {}
    if len(raw) > 0:
        first_data_row = pd.to_numeric(raw.iloc[0], errors='coerce')
        if first_data_row.isna().all():
            for col in raw.columns:
                units_row[col] = str(raw.iloc[0][col]).strip()
            raw = raw.iloc[1:].reset_index(drop=True)

    # Coerce all to numeric
    for col in raw.columns:
        raw[col] = pd.to_numeric(raw[col], errors='coerce')

    # ── Column mapping ──
    if column_map:
        time_mode = column_map.get('time_mode', 'column')
        sample_rate_hz = column_map.get('sample_rate', 1000)

        if time_mode == 'manual':
            time_array = [i / sample_rate_hz for i in range(len(raw))]
        else:
            time_col_target = column_map.get('time', '').strip()
            time_col = next((c for c in raw.columns if c == time_col_target), None)

            if not time_col:
                time_col = _find_time_column(raw)
            
            if time_col:
                # Try numeric first
                t_series = pd.to_numeric(raw[time_col], errors='coerce')
                if t_series.isna().all():
                    # Try datetime
                    try:
                        t_series = pd.to_datetime(raw[time_col], errors='coerce')
                        if t_series.notna().any():
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
        # ── Auto-detect ──
        time_col = _find_time_column(raw)
        time_array = raw[time_col].dropna().tolist() if time_col else list(range(len(raw)))

        analog_channels = []
        digital_channels = []

        for col in raw.columns:
            if col == time_col:
                continue
            series = raw[col]
            if series.isna().all():
                continue
            clean_name, unit = _extract_unit_from_name(str(col))
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

        dt = None
        if len(time_vals) > 2:
            deltas = [time_vals[i + 1] - time_vals[i] for i in range(min(200, len(time_vals) - 1))]
            deltas = [d for d in deltas if d > 0]
            if deltas:
                dt = sum(deltas) / len(deltas)

        if name_says_ms:
            return [t / 1000.0 for t in time_vals]

        if dt is not None and dt > 0:
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

    # ── Sample rate ──
    sample_rate = 0.0
    if len(time_array) > 1:
        deltas = [time_array[i + 1] - time_array[i] for i in range(min(100, len(time_array) - 1))]
        mean_dt = sum(deltas) / len(deltas)
        sample_rate = round(1.0 / mean_dt) if mean_dt > 0 else 0.0

    # ── Trigger time ──
    time_np = np.array(time_array)
    if np.any(time_np <= 0) and np.any(time_np >= 0):
        trigger_time = 0.0
    else:
        trigger_time = float(time_np[len(time_np) // 2]) if len(time_np) > 0 else 0.0

    # ── Sheet list for frontend column-mapper ──
    available_sheets = xl.sheet_names

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
        '_meta': {
            'sheet_used': target_sheet,
            'available_sheets': available_sheets,
        }
    }
