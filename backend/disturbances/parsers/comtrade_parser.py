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


def parse_comtrade(cfg_file, dat_file) -> dict:
    """
    Parses COMTRADE data from file-like objects (BytesIO or Django InMemoryUploadedFile).
    Returns a standard waveform payload dict.
    """
    cfg_content = cfg_file.read()
    dat_content = dat_file.read()

    # The comtrade library requires physical file paths, so we write to temp files
    with tempfile.NamedTemporaryFile(suffix='.cfg', delete=False, mode='wb') as cfg_tmp:
        cfg_tmp.write(cfg_content if isinstance(cfg_content, bytes) else cfg_content.encode('utf-8'))
        cfg_path = cfg_tmp.name

    with tempfile.NamedTemporaryFile(suffix='.dat', delete=False, mode='wb') as dat_tmp:
        dat_tmp.write(dat_content)
        dat_path = dat_tmp.name

    try:
        rec = comtrade.Comtrade()
        rec.load(cfg_path, dat_path)

        time_array = list(rec.time)

        # Extract trigger time from COMTRADE trigger sample index
        trigger_time = 0.0
        try:
            # COMTRADE CFG stores the trigger point as a sample number
            trigger_sample = rec.cfg.trigger_time
            if trigger_sample is not None and len(time_array) > 0:
                trigger_time = float(trigger_sample)
        except (AttributeError, TypeError):
            # Fall back to midpoint if trigger info missing
            if time_array:
                trigger_time = time_array[len(time_array) // 2]

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
            digital_channels.append({
                'name': ch.name,
                'values': [int(v) for v in rec.status[i]]
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
