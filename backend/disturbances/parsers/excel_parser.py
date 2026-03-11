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

    raw = xl.parse(target_sheet, header=0)
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
        time_col = column_map.get('time')
        if time_col and time_col in raw.columns:
            time_array = raw[time_col].dropna().tolist()
        else:
            time_col = _find_time_column(raw)
            time_array = raw[time_col].dropna().tolist() if time_col else list(range(len(raw)))

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

    # ── Sample rate ──
    sample_rate = 0.0
    if len(time_array) > 1:
        deltas = [time_array[i+1] - time_array[i] for i in range(min(100, len(time_array)-1))]
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

    return {
        'time': time_array,
        'trigger_time': trigger_time,
        'sample_rate': sample_rate,
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
