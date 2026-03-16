"""
COMTRADE Parser
---------------
Parses IEEE COMTRADE (.cfg + .dat) files into the standard waveform payload schema.

Standard payload schema:
{
    'time': [float, ...],          # seconds from start of record
    'trigger_time': float,         # seconds from record start to trigger event
    'sample_rate': float,          # Hz
    'station': str,
    'device': str,
    'frequency': float,            # nominal system frequency (50/60 Hz)
    'analog': [
        {
            'name': str,
            'unit': str,           # e.g. 'kV', 'kA', 'A', 'V'
            'phase': str,          # 'R', 'Y', 'B', 'N', or '' if unknown
            'values': [float, ...]
        }, ...
    ],
    'digital': [
        {
            'name': str,
            'values': [int, ...]   # 0 or 1
        }, ...
    ]
}
"""

import os
import io
import tempfile
import comtrade


def _detect_phase(channel_name: str) -> str:
    """
    Heuristic to detect the phase of a channel from its name.
    Checks common naming conventions used in power system IEDs globally.
    Returns 'R', 'Y', 'B', 'N', or '' if unknown.
    """
    name_upper = channel_name.upper()

    # Phase N / Neutral / Ground
    # Neutral markers often appear at the end or in common abbreviations
    for token in ['_N', '-N', ' N', 'IN', 'VN', 'NEUT', 'GND', 'GROUND', 'ZERO']:
        if token in name_upper:
            return 'N'

    # Phase R / Phase A / L1
    # Red Phase (Standard for R-Y-B) or Phase A (Standard for A-B-C)
    for token in ['_R', '-R', ' R', 'IR', 'VR', 'VA', 'IA', '_A', '-A', ' A', 'L1', 'PH1', 'PH-1', '_1', '-1']:
        if name_upper.endswith(token) or token + '_' in name_upper or token + ' ' in name_upper:
            return 'R'

    # Phase Y / Phase B / L2
    # Yellow Phase or Phase B
    # CAUTION: 'B' can mean Blue or Phase B depending on standard. 
    # Usually IEDs use A-B-C or R-Y-B. We map Y/B (Phase 2) to 'Y'.
    for token in ['_Y', '-Y', ' Y', 'IY', 'VY', '_B', '-B', ' B', 'IB', 'VB', 'L2', 'PH2', 'PH-2', '_2', '-2']:
        if name_upper.endswith(token) or token + '_' in name_upper or token + ' ' in name_upper:
            return 'Y'

    # Phase B / Phase C / L3
    # Blue Phase or Phase C
    for token in ['_C', '-C', ' C', 'IC', 'VC', 'L3', 'PH3', 'PH-3', '_3', '-3', 'IBLUE', 'VBLUE']:
        if name_upper.endswith(token) or token + '_' in name_upper or token + ' ' in name_upper:
            return 'B'

    return ''


def _parse_int_safe(val, default=0) -> int:
    """Safely converts a value to integer, handling empty strings and malformed data."""
    if val is None:
        return default
    try:
        # Standard cleaning
        v_str = str(val).strip()
        if not v_str:
            return default
        # Handle cases where value might be float string e.g. "1.0"
        return int(float(v_str))
    except (ValueError, TypeError):
        return default


def _sanitize_cfg(cfg_content: str) -> str:
    """
    Sanitizes COMTRADE CFG content to handle library quirks.
    Specifically: ensures analog (A) and status (D) suffixes exist in the header line.
    """
    lines = cfg_content.splitlines()
    if len(lines) < 2:
        return cfg_content

    # Line 2: total_ch, analog_ch, status_ch
    header = lines[1].split(',')
    if len(header) >= 3:
        total = header[0].strip()
        analog = header[1].strip()
        digital = header[2].strip()

        # Add suffixes if missing (the 'comtrade' library is strict about this)
        if analog and not analog.upper().endswith('A') and analog.isdigit():
            header[1] = f"{analog}A"
        if digital and not digital.upper().endswith('D') and digital.isdigit():
            header[2] = f"{digital}D"
        
        lines[1] = ",".join(header)

    return "\n".join(lines) + "\n"


def parse_comtrade(cfg_file, dat_file) -> dict:
    """
    Parses COMTRADE data from file-like objects (BytesIO or Django InMemoryUploadedFile).
    Returns a standard waveform payload dict.
    """
    cfg_content = cfg_file.read()
    if isinstance(cfg_content, bytes):
        cfg_content = cfg_content.decode('utf-8', errors='replace')
    
    # Sanitize CFG for library compatibility
    cfg_content = _sanitize_cfg(cfg_content)
    
    dat_content = dat_file.read()

    # The comtrade library requires physical file paths, so we write to temp files
    with tempfile.NamedTemporaryFile(suffix='.cfg', delete=False, mode='wb') as cfg_tmp:
        cfg_tmp.write(cfg_content.encode('utf-8'))
        cfg_path = cfg_tmp.name

    with tempfile.NamedTemporaryFile(suffix='.dat', delete=False, mode='wb') as dat_tmp:
        dat_tmp.write(dat_content)
        dat_path = dat_tmp.name

    try:
        rec = comtrade.Comtrade()
        rec.load(cfg_path, dat_path)

        time_array = list(rec.time)

        # Extract trigger time.
        # Different COMTRADE sources/libraries may expose this as either:
        # - a sample index (common in CFG: trigger sample number)
        # - an absolute time in seconds
        trigger_time = 0.0
        try:
            trigger_raw = getattr(rec.cfg, 'trigger_time', None)
            if trigger_raw is not None and len(time_array) > 0:
                t = float(trigger_raw)

                # Prefer interpreting integer-like values as sample indices.
                # Handle both 0-based and 1-based sample numbers.
                idx = None
                if abs(t - round(t)) < 1e-9:
                    i = int(round(t))
                    if 0 <= i < len(time_array):
                        idx = i
                    elif 1 <= i <= len(time_array):
                        idx = i - 1

                if idx is not None:
                    trigger_time = float(time_array[idx])
                else:
                    # Otherwise treat it as seconds if it falls within the record.
                    if time_array[0] <= t <= time_array[-1]:
                        trigger_time = t
                    else:
                        trigger_time = float(time_array[len(time_array) // 2])
        except (AttributeError, TypeError, ValueError):
            # Fall back to midpoint if trigger info missing/malformed
            if time_array:
                trigger_time = float(time_array[len(time_array) // 2])

        # Sample rate: use the first rate from cfg, or compute from time array
        sample_rate = 0.0
        try:
            if rec.cfg.sample_rates:
                sample_rate = float(rec.cfg.sample_rates[0][0])
        except (AttributeError, IndexError, TypeError):
            if len(time_array) > 1:
                dt = time_array[1] - time_array[0]
                sample_rate = round(1.0 / dt) if dt > 0 else 0.0

        analog_channels = []
        for i in range(rec.analog_count):
            ch = rec.cfg.analog_channels[i]
            analog_channels.append({
                'name': ch.name,
                'unit': ch.uu or '',
                'phase': _detect_phase(ch.name),
                'values': list(rec.analog[i])
            })

        digital_channels = []
        for i in range(rec.status_count):
            ch = rec.cfg.status_channels[i]
            # Use safe parsing to handle malformed/empty status values
            digital_channels.append({
                'name': ch.name,
                'values': [_parse_int_safe(v) for v in rec.status[i]]
            })

        return {
            'time': time_array,
            'trigger_time': trigger_time,
            'sample_rate': sample_rate,
            'station': rec.station_name,
            'device': rec.rec_dev_id,
            'frequency': rec.frequency,
            'analog': analog_channels,
            'digital': digital_channels,
        }

    finally:
        if os.path.exists(cfg_path):
            os.remove(cfg_path)
        if os.path.exists(dat_path):
            os.remove(dat_path)
