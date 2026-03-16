"""
API Views for the Disturbances app.

Endpoints:
  GET  /api/v1/disturbances/all/                      – list all records (lightweight)
  GET  /api/v1/disturbances/<id>/                     – full record detail
  POST /api/v1/disturbances/upload/                   – upload & parse a disturbance file
  GET  /api/v1/disturbances/<id>/waveform/            – paginated waveform data
  GET  /api/v1/disturbances/<id>/rms/                 – per-cycle RMS for analog channels
  GET  /api/v1/disturbances/<id>/channels/            – channel metadata only (no raw values)
  PATCH /api/v1/disturbances/<id>/channel-config/     – save user channel settings
  POST /api/v1/disturbances/scan/                     – scan file(s) and return metadata/channels
  GET  /api/v1/settings/                              – read app settings
  POST /api/v1/settings/                              – write/update app settings
"""

import logging
import os
import shutil
import traceback
from pathlib import Path

import numpy as np
from django.shortcuts import render
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from .models import DisturbanceRecord, AppSettings
from .serializers import DisturbanceUploadSerializer
from .parsers import parse_comtrade, parse_csv, parse_excel
from utils.hashing import calculate_file_hash


# ─── In-Memory Cache for Window Responses ──────────────────────────────────────

import threading
import time

class WindowCache:
    """
    Simple thread-safe LRU cache for window responses.
    Key: (record_id, start_ms, end_ms, signals_tuple, mode)
    Value: (response_dict, timestamp)
    """
    def __init__(self, maxsize=64, ttl_seconds=300):
        self._cache = {}
        self._access_order = {}
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._counter = 0

    def _make_key(self, record_id, start_ms, end_ms, signals, mode):
        # Sort signals for consistent key
        sigs = tuple(sorted(signals)) if signals else ()
        return (record_id, round(start_ms, 2), round(end_ms, 2), sigs, mode or 'instantaneous')

    def get(self, record_id, start_ms, end_ms, signals, mode):
        key = self._make_key(record_id, start_ms, end_ms, signals, mode)
        with self._lock:
            if key in self._cache:
                data, ts = self._cache[key]
                if time.time() - ts < self._ttl:
                    self._access_order[key] = self._counter
                    self._counter += 1
                    return data
                else:
                    del self._cache[key]
                    del self._access_order[key]
        return None

    def set(self, record_id, start_ms, end_ms, signals, mode, data):
        key = self._make_key(record_id, start_ms, end_ms, signals, mode)
        with self._lock:
            # Evict oldest if full
            if len(self._cache) >= self._maxsize and key not in self._cache:
                oldest_key = None
                oldest_ts = float('inf')
                for k, (_, ts) in self._cache.items():
                    if ts < oldest_ts:
                        oldest_ts = ts
                        oldest_key = k
                if oldest_key:
                    del self._cache[oldest_key]
                    del self._access_order[oldest_key]
            self._cache[key] = (data, time.time())
            self._access_order[key] = self._counter
            self._counter += 1

    def clear(self, record_id=None):
        """Clear all cache, or just entries for a specific record."""
        with self._lock:
            if record_id is None:
                self._cache.clear()
                self._access_order.clear()
            else:
                keys_to_delete = [k for k in self._cache if k[0] == record_id]
                for k in keys_to_delete:
                    del self._cache[k]
                    del self._access_order[k]

# Singleton instance
_window_cache = WindowCache(maxsize=64, ttl_seconds=300)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _is_uniform_sampling(time_s, tol=5e-3):
    """Return True if time steps are approximately uniform."""
    n = len(time_s)
    if n < 3:
        return True
    m = min(500, n - 1)
    dts = []
    for i in range(m):
        dt = float(time_s[i + 1]) - float(time_s[i])
        if dt > 0:
            dts.append(dt)
    if len(dts) < 2:
        return True
    mean_dt = sum(dts) / len(dts)
    if mean_dt <= 0:
        return False
    max_dev = max(abs(dt - mean_dt) for dt in dts) / mean_dt
    return max_dev <= tol


def _time_to_index(time_s, target_s, sample_rate, uniform):
    """Map target time (seconds) to nearest sample index."""
    n = len(time_s)
    if n == 0:
        return 0

    if uniform and sample_rate and sample_rate > 0:
        t0 = float(time_s[0])
        i = int(round((target_s - t0) * float(sample_rate)))
        return max(0, min(n - 1, i))

    # Non-uniform or unknown sample rate: binary search
    arr = np.asarray(time_s, dtype=np.float64)
    pos = int(np.searchsorted(arr, target_s, side='left'))
    if pos <= 0:
        return 0
    if pos >= n:
        return n - 1
    before = arr[pos - 1]
    after = arr[pos]
    return (pos - 1) if abs(before - target_s) <= abs(after - target_s) else pos

def _normalize_payload(payload: dict) -> dict:
    """Strip the internal _meta key before storing."""
    payload.pop('_meta', None)
    return payload


def _compute_rms(values: list, sample_rate: float, frequency: float) -> list:
    """
    Compute per-cycle running RMS.
    Returns a list of (time_index, rms_value) pairs aligned to the input length.
    The RMS window = samples_per_cycle = round(sample_rate / frequency).
    For each sample i, RMS is computed over the window ending at i.
    """
    arr = np.array(values, dtype=float)
    if sample_rate <= 0 or frequency <= 0:
        window = max(1, len(arr) // 20)
    else:
        window = max(1, round(sample_rate / frequency))

    rms_values = []
    for i in range(len(arr)):
        start = max(0, i - window + 1)
        segment = arr[start:i+1]
        rms_values.append(float(np.sqrt(np.mean(segment ** 2))))
    return rms_values


# ─── Metadata / Window / Sample (Viewport-based) ─────────────────────────────────

from django.conf import settings as django_settings
from .artifacts import load_artifact_meta, load_time_s, load_channel_array, load_pyramid_meta, get_pyramid_level, load_pyramid_channel

def _record_artifact_dir(record):
    meta = record.metadata
    if not isinstance(meta, dict):
        return None
    art = meta.get('artifact')
    if not isinstance(art, dict):
        return None
    d = art.get('dir')
    if not isinstance(d, str) or not d:
        return None
    return Path(d)


def _media_root_path():
    base = getattr(django_settings, 'MEDIA_ROOT', None)
    return Path(str(base)) if base is not None else Path('media')


def _upload_dir_for_hash(file_hash):
    return _media_root_path() / 'uploads' / str(file_hash)


def _artifact_dir_for_hash(file_hash):
    return _media_root_path() / 'waveforms' / str(file_hash)


@api_view(['GET'])
def get_disturbance_metadata(request, pk):
    """Returns waveform metadata and channel lists (no raw arrays)."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    payload = record.data_payload or {}

    artifact_dir = _record_artifact_dir(record)
    artifact_meta = None
    if artifact_dir:
        artifact_meta = load_artifact_meta(artifact_dir)

    require_artifact = bool(getattr(django_settings, 'DISTURBANCES_REQUIRE_ARTIFACT', False))
    if require_artifact and not artifact_meta:
        return Response(
            {'error': 'Legacy DB-JSON waveform records are disabled. Backfill artifacts first.',
             'action': 'python backend/manage.py backfill_waveform_artifacts --commit --purge-legacy-json'},
            status=status.HTTP_410_GONE,
        )

    if artifact_meta:
        total_samples = int(artifact_meta.get('total_samples', 0))
        trigger_time_s = float(record.trigger_time or artifact_meta.get('trigger_time_s') or 0.0)
        duration_ms = float(artifact_meta.get('time_end_s', 0.0) - artifact_meta.get('time_start_s', 0.0)) * 1000.0
        start_ms = float(artifact_meta.get('time_start_s', 0.0) - trigger_time_s) * 1000.0
        end_ms = float(artifact_meta.get('time_end_s', 0.0) - trigger_time_s) * 1000.0
        uniform = bool(artifact_meta.get('is_uniform_sampling', True))
        analog = list(artifact_meta.get('analog', []) or [])
        digital = list(artifact_meta.get('digital', []) or [])
        station = artifact_meta.get('station', '')
        device = artifact_meta.get('device', '')
        sample_rate = float(record.sample_rate or artifact_meta.get('sample_rate') or 0.0)
        nominal_frequency = float(record.nominal_frequency or artifact_meta.get('frequency') or 50.0)
    else:
        time_s = payload.get('time', [])
        total_samples = len(time_s)
        trigger_time_s = float(record.trigger_time or payload.get('trigger_time') or 0.0)
        duration_ms = 0.0
        if total_samples >= 2:
            try:
                duration_ms = float(time_s[-1] - time_s[0]) * 1000.0
            except Exception:
                duration_ms = 0.0
        start_ms = float(time_s[0] - trigger_time_s) * 1000.0 if total_samples else 0.0
        end_ms = float(time_s[-1] - trigger_time_s) * 1000.0 if total_samples else 0.0

        uniform = _is_uniform_sampling(time_s)

        analog = []
        for ch in payload.get('analog', []):
            analog.append({
                'name': ch.get('name'),
                'unit': ch.get('unit', ''),
                'phase': ch.get('phase', ''),
            })

        digital = []
        for ch in payload.get('digital', []):
            digital.append({
                'name': ch.get('name'),
            })

        station = payload.get('station', '')
        device = payload.get('device', '')
        sample_rate = float(record.sample_rate or payload.get('sample_rate') or 0.0)
        nominal_frequency = float(record.nominal_frequency or payload.get('frequency') or 50.0)

    return Response({
        'id': record.id,
        'station': station,
        'device': device,
        'sample_rate': sample_rate,
        'nominal_frequency': nominal_frequency,
        'trigger_time_s': trigger_time_s,
        'duration_ms': duration_ms,
        'start_ms': start_ms,
        'end_ms': end_ms,
        'total_samples': total_samples,
        'is_uniform_sampling': uniform,
        'analog': analog,
        'digital': digital,
    })


@api_view(['GET'])
def get_waveform_window(request, pk):
    """Returns a window slice by time (ms relative to trigger) and selected signals."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    # Try cache first
    start_ms_raw = request.query_params.get('start_ms')
    end_ms_raw = request.query_params.get('end_ms')
    signals_raw = request.query_params.get('signals', '')
    mode = request.query_params.get('mode', 'instantaneous').lower()
    max_points_raw = request.query_params.get('max_points')

    signals = [s.strip() for s in signals_raw.split(',') if s.strip()] if signals_raw else None

    if start_ms_raw and end_ms_raw:
        try:
            start_ms = float(start_ms_raw)
            end_ms = float(end_ms_raw)
            cached = _window_cache.get(pk, start_ms, end_ms, signals, mode)
            if cached:
                return Response(cached)
        except (ValueError, TypeError):
            pass

    # Proceed to compute response
    payload = record.data_payload or {}
    artifact_dir = _record_artifact_dir(record)
    artifact_meta = load_artifact_meta(artifact_dir) if artifact_dir else None

    require_artifact = bool(getattr(django_settings, 'DISTURBANCES_REQUIRE_ARTIFACT', False))
    if require_artifact and not (artifact_meta and artifact_dir):
        return Response(
            {'error': 'Legacy DB-JSON waveform records are disabled. Backfill artifacts first.',
             'action': 'python backend/manage.py backfill_waveform_artifacts --commit --purge-legacy-json'},
            status=status.HTTP_410_GONE,
        )

    if artifact_meta and artifact_dir:
        time_arr = load_time_s(artifact_dir, mmap=True)
        if int(time_arr.size) == 0:
            return Response({'error': 'Empty time array.'}, status=status.HTTP_404_NOT_FOUND)
        time_s0 = float(artifact_meta.get('time_start_s', float(time_arr[0])))
        trigger_time_s = float(record.trigger_time or artifact_meta.get('trigger_time_s') or 0.0)
        sample_rate = float(record.sample_rate or artifact_meta.get('sample_rate') or 0.0)
        uniform = bool(artifact_meta.get('is_uniform_sampling', True))
        # Load pyramid meta for fast envelope responses
        pyramid_meta = load_pyramid_meta(artifact_dir)
    else:
        time_s = payload.get('time', [])
        if not time_s:
            return Response({'error': 'No waveform data available.'}, status=status.HTTP_404_NOT_FOUND)
        time_arr = np.asarray(time_s, dtype=np.float64)
        time_s0 = float(time_arr[0])
        trigger_time_s = float(record.trigger_time or payload.get('trigger_time') or 0.0)
        sample_rate = float(record.sample_rate or payload.get('sample_rate') or 0.0)
        uniform = _is_uniform_sampling(time_s)
        pyramid_meta = {}

    if start_ms_raw is None or end_ms_raw is None:
        start_ms = float(time_arr[0] - trigger_time_s) * 1000.0
        end_ms = float(time_arr[-1] - trigger_time_s) * 1000.0
    else:
        try:
            start_ms = float(start_ms_raw)
            end_ms = float(end_ms_raw)
        except ValueError:
            return Response({'error': 'start_ms and end_ms must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)

    if end_ms < start_ms:
        start_ms, end_ms = end_ms, start_ms

    t0_s = trigger_time_s + (start_ms / 1000.0)
    t1_s = trigger_time_s + (end_ms / 1000.0)

    n = int(time_arr.size)
    if uniform and sample_rate and sample_rate > 0:
        i0 = int(round((t0_s - time_s0) * sample_rate))
        i1 = int(round((t1_s - time_s0) * sample_rate))
        i0 = max(0, min(n - 1, i0))
        i1 = max(0, min(n - 1, i1))
    else:
        i0 = int(np.searchsorted(time_arr, t0_s, side='left'))
        i1 = int(np.searchsorted(time_arr, t1_s, side='left'))
        i0 = max(0, min(n - 1, i0))
        i1 = max(0, min(n - 1, i1))
    if i1 < i0:
        i0, i1 = i1, i0
    i1_excl = min(n, i1 + 1)

    time_slice = time_arr[i0:i1_excl]
    time_ms = [round((float(t) - trigger_time_s) * 1000.0, 6) for t in time_slice.tolist()]

    requested = [s.strip() for s in signals_raw.split(',') if s.strip()] if signals_raw else None
    requested_set = set(requested) if requested else None

    frequency = float(record.nominal_frequency or payload.get('frequency') or 50.0)

    max_points = None
    if max_points_raw is not None:
        try:
            max_points = int(float(max_points_raw))
        except (TypeError, ValueError):
            return Response({'error': 'max_points must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if max_points <= 0:
            max_points = None

    window_len = max(0, i1_excl - i0)
    want_envelope = bool(max_points and window_len > max_points)

    if want_envelope:
        buckets = int(max_points)
        step = max(1, (window_len + buckets - 1) // buckets)

        # Check if pyramids exist and use them for fast envelope
        use_pyramid = pyramid_meta and pyramid_meta.get('channels')
        pyramid_level = get_pyramid_level(window_len, max_points) if use_pyramid else None
        
        if use_pyramid and pyramid_level is not None:
            # Use precomputed pyramid
            ratio = [1, 2, 4, 8, 16, 32, 64, 128, 256][pyramid_level]
            # Time indices in original array
            time_step = max(1, ratio)
            env_time_ms = []
            for s in range(i0, i1_excl, time_step):
                env_time_ms.append(round((float(time_arr[s]) - trigger_time_s) * 1000.0, 6))
            
            def _pyramid_envelope(pyr_arr, start_idx, end_idx, ratio):
                # pyr_arr is interleaved min/max, need to map to our bucket indices
                # Each pyramid level has ratio samples per bucket
                pyr_per_bucket = max(1, ratio // time_step)
                pyr_start = start_idx // ratio
                pyr_end = (end_idx + ratio - 1) // ratio
                pyr_slice = pyr_arr[pyr_start * 2:pyr_end * 2]
                if len(pyr_slice) == 0:
                    return [], []
                mn = pyr_slice[0::2].tolist()
                mx = pyr_slice[1::2].tolist()
                return mn, mx
            
            analog_out = []
            if artifact_meta and artifact_dir:
                a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
                for name, m in a_meta.items():
                    if requested_set is not None and name not in requested_set:
                        continue
                    safe = m.get('safe')
                    if not safe:
                        continue
                    pyr_key = f"analog/{safe}"
                    if pyr_key in pyramid_meta.get('channels', {}):
                        pyr_arr = load_pyramid_channel(artifact_dir, 'analog', safe, pyramid_level)
                        if pyr_arr is not None:
                            mn, mx = _pyramid_envelope(pyr_arr, i0, i1_excl, ratio)
                            analog_out.append({
                                'name': name,
                                'unit': m.get('unit', ''),
                                'phase': m.get('phase', ''),
                                'min': mn,
                                'max': mx,
                            })
                            continue
                    # Fallback to on-the-fly
                    arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
                    raw_values = arr[i0:i1_excl].astype(float).tolist()
                    if mode == 'rms':
                        values = _compute_rms(raw_values, sample_rate, frequency)
                    else:
                        values = raw_values
                    mn, mx = [], []
                    for s in range(0, len(values), step):
                        seg = values[s:s + step]
                        if seg:
                            mn.append(float(min(seg)))
                            mx.append(float(max(seg)))
                    analog_out.append({
                        'name': name,
                        'unit': m.get('unit', ''),
                        'phase': m.get('phase', ''),
                        'min': mn,
                        'max': mx,
                    })
            else:
                # Legacy fallback
                def _envelope_legacy(vals):
                    mn, mx = [], []
                    for s in range(0, len(vals), step):
                        seg = vals[s:s + step]
                        if seg:
                            mn.append(float(min(seg)))
                            mx.append(float(max(seg)))
                    return mn, mx
                for ch in payload.get('analog', []):
                    name = ch.get('name')
                    if requested_set is not None and name not in requested_set:
                        continue
                    raw_values = ch.get('values', [])[i0:i1_excl]
                    values = _compute_rms(raw_values, sample_rate, frequency) if mode == 'rms' else raw_values
                    mn, mx = _envelope_legacy(values)
                    analog_out.append({
                        'name': name,
                        'unit': ch.get('unit', ''),
                        'phase': ch.get('phase', ''),
                        'min': mn,
                        'max': mx,
                    })

            # Digital channels - similar pyramid logic
            digital_out = []
            if artifact_meta and artifact_dir:
                d_meta = {m.get('name'): m for m in (artifact_meta.get('digital', []) or [])}
                for name, m in d_meta.items():
                    if requested_set is not None and name not in requested_set:
                        continue
                    safe = m.get('safe')
                    if not safe:
                        continue
                    pyr_key = f"digital/{safe}"
                    if pyr_key in pyramid_meta.get('channels', {}):
                        pyr_arr = load_pyramid_channel(artifact_dir, 'digital', safe, pyramid_level)
                        if pyr_arr is not None:
                            mn, mx = _pyramid_envelope(pyr_arr, i0, i1_excl, ratio)
                            digital_out.append({'name': name, 'min': mn, 'max': mx})
                            continue
                    # Fallback
                    arr = load_channel_array(artifact_dir, 'digital', safe, mmap=True)
                    raw = arr[i0:i1_excl].astype(int).tolist()
                    mn, mx = [], []
                    for s in range(0, len(raw), step):
                        seg = raw[s:s + step]
                        if seg:
                            mn.append(float(min(seg)))
                            mx.append(float(max(seg)))
                    digital_out.append({'name': name, 'min': mn, 'max': mx})
            else:
                for ch in payload.get('digital', []):
                    name = ch.get('name')
                    if requested_set is not None and name not in requested_set:
                        continue
                    raw = ch.get('values', [])[i0:i1_excl]
                    mn, mx = [], []
                    for s in range(0, len(raw), step):
                        seg = raw[s:s + step]
                        if seg:
                            mn.append(float(min(seg)))
                            mx.append(float(max(seg)))
                    digital_out.append({'name': name, 'min': mn, 'max': mx})

        else:
            # Original on-the-fly envelope logic
            env_time_ms = []
            for s in range(i0, i1_excl, step):
                env_time_ms.append(round((float(time_arr[s]) - trigger_time_s) * 1000.0, 6))

            def _envelope(vals):
                mn = []
                mx = []
                for s in range(0, len(vals), step):
                    seg = vals[s:s + step]
                    if not seg:
                        continue
                    mn.append(float(min(seg)))
                    mx.append(float(max(seg)))
                return mn, mx

            analog_out = []
            if artifact_meta and artifact_dir:
                a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
                for name, m in a_meta.items():
                    if requested_set is not None and name not in requested_set:
                        continue
                    safe = m.get('safe')
                    if not safe:
                        continue
                    arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
                    raw_values = arr[i0:i1_excl].astype(float).tolist()
                    values = _compute_rms(raw_values, sample_rate, frequency) if mode == 'rms' else raw_values
                    mn, mx = _envelope(values)
                    analog_out.append({
                        'name': name,
                        'unit': m.get('unit', ''),
                        'phase': m.get('phase', ''),
                        'min': mn,
                        'max': mx,
                    })
            else:
                for ch in payload.get('analog', []):
                    name = ch.get('name')
                    if requested_set is not None and name not in requested_set:
                        continue
                    raw_values = ch.get('values', [])[i0:i1_excl]
                    values = _compute_rms(raw_values, sample_rate, frequency) if mode == 'rms' else raw_values
                    mn, mx = _envelope(values)
                    analog_out.append({
                        'name': name,
                        'unit': ch.get('unit', ''),
                        'phase': ch.get('phase', ''),
                        'min': mn,
                        'max': mx,
                    })

            digital_out = []
            if artifact_meta and artifact_dir:
                d_meta = {m.get('name'): m for m in (artifact_meta.get('digital', []) or [])}
                for name, m in d_meta.items():
                    if requested_set is not None and name not in requested_set:
                        continue
                    safe = m.get('safe')
                    if not safe:
                        continue
                    arr = load_channel_array(artifact_dir, 'digital', safe, mmap=True)
                    raw = arr[i0:i1_excl].astype(int).tolist()
                    mn, mx = _envelope(raw)
                    digital_out.append({'name': name, 'min': mn, 'max': mx})
            else:
                for ch in payload.get('digital', []):
                    name = ch.get('name')
                    if requested_set is not None and name not in requested_set:
                        continue
                    raw = ch.get('values', [])[i0:i1_excl]
                    mn, mx = _envelope(raw)
                    digital_out.append({'name': name, 'min': mn, 'max': mx})

        response_data = {
            'id': record.id,
            'start_ms': start_ms,
            'end_ms': end_ms,
            'sample_rate': sample_rate,
            'mode': mode,
            'representation': 'envelope',
            'time_ms': env_time_ms,
            'analog': analog_out,
            'digital': digital_out,
        }
        _window_cache.set(pk, start_ms, end_ms, signals, mode, response_data)
        return Response(response_data)

    # Raw response
    analog_out = []
    if artifact_meta and artifact_dir:
        a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
        for name, m in a_meta.items():
            if requested_set is not None and name not in requested_set:
                continue
            safe = m.get('safe')
            if not safe:
                continue
            arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
            raw_values = arr[i0:i1_excl].astype(float).tolist()
            values = _compute_rms(raw_values, sample_rate, frequency) if mode == 'rms' else raw_values
            analog_out.append({
                'name': name,
                'unit': m.get('unit', ''),
                'phase': m.get('phase', ''),
                'values': values,
            })
    else:
        for ch in payload.get('analog', []):
            name = ch.get('name')
            if requested_set is not None and name not in requested_set:
                continue
            raw_values = ch.get('values', [])[i0:i1_excl]
            values = _compute_rms(raw_values, sample_rate, frequency) if mode == 'rms' else raw_values
            analog_out.append({
                'name': name,
                'unit': ch.get('unit', ''),
                'phase': ch.get('phase', ''),
                'values': values,
            })

    digital_out = []
    if artifact_meta and artifact_dir:
        d_meta = {m.get('name'): m for m in (artifact_meta.get('digital', []) or [])}
        for name, m in d_meta.items():
            if requested_set is not None and name not in requested_set:
                continue
            safe = m.get('safe')
            if not safe:
                continue
            arr = load_channel_array(artifact_dir, 'digital', safe, mmap=True)
            digital_out.append({
                'name': name,
                'values': arr[i0:i1_excl].astype(int).tolist(),
            })
    else:
        for ch in payload.get('digital', []):
            name = ch.get('name')
            if requested_set is not None and name not in requested_set:
                continue
            digital_out.append({
                'name': name,
                'values': ch.get('values', [])[i0:i1_excl],
            })

    response_data = {
        'id': record.id,
        'start_ms': start_ms,
        'end_ms': end_ms,
        'sample_rate': sample_rate,
        'mode': mode,
        'representation': 'raw',
        'time_ms': time_ms,
        'analog': analog_out,
        'digital': digital_out,
    }
    _window_cache.set(pk, start_ms, end_ms, signals, mode, response_data)
    return Response(response_data)


@api_view(['GET'])
def get_waveform_sample(request, pk):
    """Returns exact values at nearest sample to t_ms (ms relative to trigger)."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    payload = record.data_payload or {}
    artifact_dir = _record_artifact_dir(record)
    artifact_meta = load_artifact_meta(artifact_dir) if artifact_dir else None

    require_artifact = bool(getattr(django_settings, 'DISTURBANCES_REQUIRE_ARTIFACT', False))
    if require_artifact and not (artifact_meta and artifact_dir):
        return Response(
            {'error': 'Legacy DB-JSON waveform records are disabled. Backfill artifacts first.',
             'action': 'python backend/manage.py backfill_waveform_artifacts --commit --purge-legacy-json'},
            status=status.HTTP_410_GONE,
        )

    if artifact_meta and artifact_dir:
        time_arr = load_time_s(artifact_dir, mmap=True)
        time_s0 = float(artifact_meta.get('time_start_s', 0.0))
        uniform = bool(artifact_meta.get('is_uniform_sampling', True))
    else:
        time_s = payload.get('time', [])
        if not time_s:
            return Response({'error': 'No waveform data available.'}, status=status.HTTP_404_NOT_FOUND)
        time_arr = np.asarray(time_s, dtype=np.float64)
        time_s0 = float(time_arr[0])
        uniform = _is_uniform_sampling(time_s)

    t_ms_raw = request.query_params.get('t_ms')
    if t_ms_raw is None:
        return Response({'error': 't_ms is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        t_ms = float(t_ms_raw)
    except ValueError:
        return Response({'error': 't_ms must be a number.'}, status=status.HTTP_400_BAD_REQUEST)

    trigger_time_s = float(record.trigger_time or (artifact_meta.get('trigger_time_s') if artifact_meta else payload.get('trigger_time')) or 0.0)
    target_s = trigger_time_s + (t_ms / 1000.0)
    sample_rate = float(record.sample_rate or (artifact_meta.get('sample_rate') if artifact_meta else payload.get('sample_rate')) or 0.0)

    if uniform and sample_rate and sample_rate > 0:
        idx = int(round((target_s - time_s0) * sample_rate))
        n = int(time_arr.size)
        idx = max(0, min(n - 1, idx))
    else:
        idx = int(np.searchsorted(time_arr, target_s, side='left'))
        n = int(time_arr.size)
        idx = max(0, min(n - 1, idx))

    signals_raw = (request.query_params.get('signals') or '').strip()
    requested = [s.strip() for s in signals_raw.split(',') if s.strip()] if signals_raw else None
    requested_set = set(requested) if requested else None

    values = {}
    if artifact_meta and artifact_dir:
        a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
        d_meta = {m.get('name'): m for m in (artifact_meta.get('digital', []) or [])}
        for name, m in a_meta.items():
            if requested_set is not None and name not in requested_set:
                continue
            safe = m.get('safe')
            if not safe:
                continue
            arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
            values[name] = float(arr[idx]) if idx < arr.size else None
        for name, m in d_meta.items():
            if requested_set is not None and name not in requested_set:
                continue
            safe = m.get('safe')
            if not safe:
                continue
            arr = load_channel_array(artifact_dir, 'digital', safe, mmap=True)
            values[name] = int(arr[idx]) if idx < arr.size else None
    else:
        for ch in payload.get('analog', []):
            name = ch.get('name')
            if requested_set is not None and name not in requested_set:
                continue
            arr = ch.get('values', [])
            values[name] = arr[idx] if idx < len(arr) else None
        for ch in payload.get('digital', []):
            name = ch.get('name')
            if requested_set is not None and name not in requested_set:
                continue
            arr = ch.get('values', [])
            values[name] = arr[idx] if idx < len(arr) else None

    return Response({
        'id': record.id,
        't_ms': t_ms,
        'nearest_index': idx,
        'values': values,
    })


# ─── List / Detail ────────────────────────────────────────────────────────────

@api_view(['GET'])
def list_disturbances(request):
    """Returns lightweight list of all disturbance records."""
    records = DisturbanceRecord.objects.all().order_by('-timestamp')
    data = []
    for r in records:
        data.append({
            'id': r.id,
            'name': r.name or r.original_filename,
            'source_type': r.source_type,
            'timestamp': r.timestamp,
            'file_size': r.file_size,
            'sample_rate': r.sample_rate,
            'nominal_frequency': r.nominal_frequency,
            'has_config': r.channel_config is not None and len(r.channel_config) > 0,
        })
    return Response(data)


@api_view(['GET'])
def get_disturbance_detail(request, pk):
    """Returns full record detail including data_payload."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
        return Response(DisturbanceUploadSerializer(record).data)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
def delete_disturbance(request, pk):
    """Deletes a record and its artifact files."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
        
        # Clean up artifact files on disk
        artifact_dir = _record_artifact_dir(record)
        if artifact_dir and artifact_dir.exists():
            shutil.rmtree(artifact_dir, ignore_errors=True)
        
        # Clean up upload files
        file_hash = record.file_hash
        if file_hash:
            upload_dir = _upload_dir_for_hash(file_hash)
            if upload_dir.exists():
                shutil.rmtree(upload_dir, ignore_errors=True)
        
        record.delete()
        return Response({'status': 'deleted'}, status=status.HTTP_204_NO_CONTENT)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)


# ─── Upload ───────────────────────────────────────────────────────────────────

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def upload_disturbance(request):
    """
    Parse and store a disturbance recording.

    Form fields:
      source_type       : COMTRADE | CSV | EXCEL
      primary_file      : main data file (.dat / .csv / .xlsx)
      auxiliary_file    : COMTRADE .cfg companion (COMTRADE only)
      name              : optional display name
      column_map        : JSON string for CSV/Excel column mapping (optional)
    """
    import json

    source_type = request.data.get('source_type', '').upper()
    primary_file = request.FILES.get('primary_file')
    auxiliary_file = request.FILES.get('auxiliary_file')
    column_map_raw = request.data.get('column_map')

    if not primary_file:
        return Response({'error': 'No data file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    column_map = None
    if column_map_raw:
        try:
            column_map = json.loads(column_map_raw)
        except (json.JSONDecodeError, TypeError):
            return Response({'error': 'Invalid column_map JSON.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Parse based on source type ──
    print(f"DEBUG: Processing upload for {source_type}. Primary: {primary_file.name}")
    try:
        if source_type == 'COMTRADE':
            if not auxiliary_file:
                return Response(
                    {'error': 'COMTRADE requires both a .cfg (auxiliary) and .dat (primary) file.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            print("DEBUG: Parsing COMTRADE...")
            data_payload = parse_comtrade(auxiliary_file, primary_file)

        elif source_type == 'CSV':
            print("DEBUG: Parsing CSV...")
            data_payload = parse_csv(primary_file, column_map=column_map)

        elif source_type == 'EXCEL':
            sheet_name = request.data.get('sheet_name')
            print(f"DEBUG: Parsing EXCEL (sheet: {sheet_name})...")
            data_payload = parse_excel(primary_file, column_map=column_map, sheet_name=sheet_name)

        else:
            return Response(
                {'error': f'Unsupported source_type: {source_type}. Must be COMTRADE, CSV, or EXCEL.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        print("DEBUG: Parsing successful.")
    except Exception as e:
        print(f"DEBUG: Parsing FAILED: {str(e)}")
        return Response({'error': f'Parsing failed: {str(e)}'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    # Strip internal meta before storage
    _meta = data_payload.pop('_meta', {})

    # ── Duplicate detection ──
    primary_file.seek(0)
    file_hash = calculate_file_hash(primary_file)
    if DisturbanceRecord.objects.filter(file_hash=file_hash).exists():
        existing = DisturbanceRecord.objects.get(file_hash=file_hash)
        return Response({
            'error': 'Duplicate file detected.',
            'id': existing.id,
            'name': existing.name or existing.original_filename,
        }, status=status.HTTP_409_CONFLICT)

    # ── Save record ──
    name = request.data.get('name') or primary_file.name
    channel_config_raw = request.data.get('channel_config')
    channel_config = None
    if channel_config_raw:
        try:
            channel_config = json.loads(channel_config_raw)
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Create artifact (typed arrays on disk) ─────────────────────────────────────
    upload_dir = str(_upload_dir_for_hash(file_hash))
    primary_filename = os.path.basename(primary_file.name)
    primary_path = os.path.join(upload_dir, primary_filename)
    
    # Save raw upload files
    from .artifacts import save_uploaded_file, write_artifact_from_payload
    
    try:
        primary_file.seek(0)
    except Exception:
        pass
    save_uploaded_file(primary_file, Path(primary_path))
    
    aux_path = None
    if auxiliary_file is not None:
        try:
            auxiliary_file.seek(0)
        except Exception:
            pass
        aux_filename = os.path.basename(auxiliary_file.name)
        aux_path = os.path.join(upload_dir, aux_filename)
        save_uploaded_file(auxiliary_file, Path(aux_path))
    
    # Write waveform artifact
    artifact_dir = str(_artifact_dir_for_hash(file_hash))
    artifact_meta = write_artifact_from_payload(data_payload, Path(artifact_dir))
    
    # Precompute pyramids for fast zoom/pan
    from .artifacts import write_pyramid
    pyramid_meta = write_pyramid(Path(artifact_dir))
    
    # Lightweight payload (no per-sample arrays)
    lightweight_payload = {
        'trigger_time': data_payload.get('trigger_time'),
        'sample_rate': data_payload.get('sample_rate'),
        'station': data_payload.get('station', ''),
        'device': data_payload.get('device', ''),
        'frequency': data_payload.get('frequency', 50.0),
        'analog': [
            {'name': ch.get('name'), 'unit': ch.get('unit', ''), 'phase': ch.get('phase', '')}
            for ch in (data_payload.get('analog') or [])
        ],
        'digital': [
            {'name': ch.get('name')}
            for ch in (data_payload.get('digital') or [])
        ],
    }

    record = DisturbanceRecord.objects.create(
        source_type=source_type,
        name=name,
        original_filename=primary_file.name,
        file_size=primary_file.size,
        file_hash=file_hash,
        data_payload=lightweight_payload,
        trigger_time=data_payload.get('trigger_time'),
        sample_rate=data_payload.get('sample_rate'),
        nominal_frequency=data_payload.get('frequency', 50.0),
        metadata={
            **(_meta if isinstance(_meta, dict) else {}),
            'uploads': {
                'dir': upload_dir,
                'primary_path': primary_path,
                'auxiliary_path': aux_path,
            },
            'artifact': {
                'dir': artifact_dir,
                'format': 'npy',
                'meta': artifact_meta,
            },
        },
        channel_config=channel_config
    )

    return Response({
        'id': record.id,
        'name': record.name,
        'source_type': record.source_type,
        'sample_rate': record.sample_rate,
        'trigger_time': record.trigger_time,
        'analog_count': len(data_payload.get('analog', [])),
        'digital_count': len(data_payload.get('digital', [])),
        'sample_count': int(artifact_meta.get('total_samples', 0)),
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def scan_disturbance(request):
    """
    Parses a disturbance file and returns channel metadata WITHOUT saving a record.
    Used for the 'assisted' mapping flow.
    """
    import json
    source_type = request.data.get('source_type', '').upper()
    primary_file = request.FILES.get('primary_file')
    auxiliary_file = request.FILES.get('auxiliary_file')
    column_map_raw = request.data.get('column_map')

    if not primary_file:
        return Response({'error': 'No data file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    column_map = None
    if column_map_raw:
        try:
            column_map = json.loads(column_map_raw)
        except: pass

    try:
        if source_type == 'COMTRADE':
            if not auxiliary_file:
                return Response({'error': 'COMTRADE requires .cfg and .dat'}, status=400)
            data_payload = parse_comtrade(auxiliary_file, primary_file)
        elif source_type == 'CSV':
            data_payload = parse_csv(primary_file, column_map=column_map)
        elif source_type == 'EXCEL':
            sheet_name = request.data.get('sheet_name')
            data_payload = parse_excel(primary_file, column_map=column_map, sheet_name=sheet_name)
        else:
            return Response({'error': f'Unsupported: {source_type}'}, status=400)
    except Exception as e:
        return Response({'error': str(e)}, status=422)

    # Prepare metadata response
    analog = []
    for ch in data_payload.get('analog', []):
        analog.append({
            'name': ch['name'],
            'unit': ch.get('unit', ''),
            'phase': ch.get('phase', ''),
        })

    digital = []
    for ch in data_payload.get('digital', []):
        digital.append({
            'name': ch['name'],
        })

    return Response({
        'source_type': source_type,
        'station': data_payload.get('station', ''),
        'device': data_payload.get('device', ''),
        'sample_rate': data_payload.get('sample_rate'),
        'nominal_frequency': data_payload.get('frequency', 50.0),
        'analog': analog,
        'digital': digital,
    })


# ─── Waveform (paginated) ─────────────────────────────────────────────────────

@api_view(['GET'])
def get_waveform(request, pk):
    """
    Returns a paginated slice of the waveform data.

    Query params:
      page       : 1-based page number (default: 1)
      window_ms  : window duration in milliseconds per page (default: 500)
      mode       : 'instantaneous' | 'rms' (default: 'instantaneous')
    """
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    payload = record.data_payload or {}
    artifact_dir = _record_artifact_dir(record)
    artifact_meta = load_artifact_meta(artifact_dir) if artifact_dir else None

    require_artifact = bool(getattr(django_settings, 'DISTURBANCES_REQUIRE_ARTIFACT', False))
    if require_artifact and not (artifact_meta and artifact_dir):
        return Response(
            {'error': 'Legacy DB-JSON waveform records are disabled. Backfill artifacts first.',
             'action': 'python backend/manage.py backfill_waveform_artifacts --commit --purge-legacy-json'},
            status=status.HTTP_410_GONE,
        )

    trigger_time = record.trigger_time or 0.0
    frequency = record.nominal_frequency or 50.0
    mode = request.query_params.get('mode', 'instantaneous').lower()

    if artifact_meta and artifact_dir:
        time_arr = load_time_s(artifact_dir, mmap=True)
        total_samples = int(time_arr.size)
        if total_samples == 0:
            return Response({'error': 'Empty time array.'}, status=status.HTTP_404_NOT_FOUND)

        sample_rate = float(record.sample_rate or artifact_meta.get('sample_rate') or 1000.0)
        trigger_time_s = float(artifact_meta.get('trigger_time_s', 0.0))

        window_ms = float(request.query_params.get('window_ms', 500))
        window_samples = max(1, int(round(sample_rate * window_ms / 1000.0)))
        total_pages = max(1, -(-total_samples // window_samples))
        page = max(1, min(int(request.query_params.get('page', 1)), total_pages))

        start_idx = (page - 1) * window_samples
        end_idx = min(start_idx + window_samples, total_samples)

        time_slice = time_arr[start_idx:end_idx]
        time_ms = [round((float(t) - trigger_time_s) * 1000.0, 6) for t in time_slice.tolist()]

        analog_out = []
        a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
        for ch_name in a_meta.keys():
            safe = a_meta[ch_name].get('safe', '')
            if safe:
                arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
                raw_values = arr[start_idx:end_idx].tolist()
                if mode == 'rms':
                    values = _compute_rms(raw_values, sample_rate, frequency)
                else:
                    values = raw_values
                analog_out.append({
                    'name': ch_name,
                    'unit': a_meta[ch_name].get('unit', ''),
                    'phase': a_meta[ch_name].get('phase', ''),
                    'values': values,
                })

        digital_out = []
        d_meta = {m.get('name'): m for m in (artifact_meta.get('digital', []) or [])}
        for ch_name in d_meta.keys():
            safe = d_meta[ch_name].get('safe', '')
            if safe:
                arr = load_channel_array(artifact_dir, 'digital', safe, mmap=True)
                digital_out.append({
                    'name': ch_name,
                    'values': arr[start_idx:end_idx].tolist(),
                })

        return Response({
            'id': record.id,
            'page': page,
            'total_pages': total_pages,
            'window_ms': window_ms,
            'start_sample': start_idx,
            'end_sample': end_idx,
            'total_samples': total_samples,
            'sample_rate': sample_rate,
            'trigger_time_ms': 0.0,
            'mode': mode,
            'time_ms': time_ms,
            'analog': analog_out,
            'digital': digital_out,
            'station': artifact_meta.get('station', ''),
            'device': artifact_meta.get('device', ''),
        })

    # Fallback: legacy payload-based data
    time_array = payload.get('time', [])
    total_samples = len(time_array)

    if total_samples == 0:
        return Response({'error': 'No waveform data available.'}, status=status.HTTP_404_NOT_FOUND)

    sample_rate = record.sample_rate or 1000.0
    window_ms = float(request.query_params.get('window_ms', 500))
    window_samples = max(1, int(round(sample_rate * window_ms / 1000.0)))

    total_pages = max(1, -(-total_samples // window_samples))
    page = max(1, min(int(request.query_params.get('page', 1)), total_pages))

    start_idx = (page - 1) * window_samples
    end_idx = min(start_idx + window_samples, total_samples)

    # Slice time into ms relative to trigger
    time_slice_raw = time_array[start_idx:end_idx]
    time_ms = [round((t - trigger_time) * 1000, 6) for t in time_slice_raw]

    # Analog channels
    analog_out = []
    for ch in payload.get('analog', []):
        raw_values = ch['values'][start_idx:end_idx]
        if mode == 'rms':
            values = _compute_rms(raw_values, sample_rate, frequency)
        else:
            values = raw_values
        analog_out.append({
            'name': ch['name'],
            'unit': ch.get('unit', ''),
            'phase': ch.get('phase', ''),
            'values': values,
        })

    # Digital channels
    digital_out = []
    for ch in payload.get('digital', []):
        digital_out.append({
            'name': ch['name'],
            'values': ch['values'][start_idx:end_idx],
        })

    return Response({
        'id': record.id,
        'page': page,
        'total_pages': total_pages,
        'window_ms': window_ms,
        'start_sample': start_idx,
        'end_sample': end_idx,
        'total_samples': total_samples,
        'sample_rate': sample_rate,
        'trigger_time_ms': 0.0,
        'mode': mode,
        'time_ms': time_ms,
        'analog': analog_out,
        'digital': digital_out,
        'station': payload.get('station', ''),
        'device': payload.get('device', ''),
    })

    # Digital channels
    digital_out = []
    for ch in payload.get('digital', []):
        digital_out.append({
            'name': ch['name'],
            'values': ch['values'][start_idx:end_idx],
        })

    return Response({
        'id': record.id,
        'page': page,
        'total_pages': total_pages,
        'window_ms': window_ms,
        'start_sample': start_idx,
        'end_sample': end_idx,
        'total_samples': total_samples,
        'sample_rate': sample_rate,
        'trigger_time_ms': 0.0,   # always relative to trigger
        'mode': mode,
        'time_ms': time_ms,
        'analog': analog_out,
        'digital': digital_out,
        'station': payload.get('station', ''),
        'device': payload.get('device', ''),
    })


# ─── RMS ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_rms(request, pk):
    """
    Returns per-cycle running RMS for all analog channels (full record, unpaginated).
    Useful for pre-computing the RMS overlay.

    Query params:
      channel  : specific channel name to compute (optional; all channels if omitted)
    """
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    payload = record.data_payload or {}
    artifact_dir = _record_artifact_dir(record)
    artifact_meta = load_artifact_meta(artifact_dir) if artifact_dir else None

    sample_rate = float(record.sample_rate or 1000.0)
    frequency = float(record.nominal_frequency or 50.0)
    channel_filter = request.query_params.get('channel')

    if artifact_meta and artifact_dir:
        time_arr = load_time_s(artifact_dir, mmap=True)
        trigger_time_s = float(artifact_meta.get('trigger_time_s', 0.0))
        time_ms = [round((float(t) - trigger_time_s) * 1000.0, 6) for t in time_arr.tolist()]

        rms_channels = []
        a_meta = {m.get('name'): m for m in (artifact_meta.get('analog', []) or [])}
        for ch_name, ch_info in a_meta.items():
            if channel_filter and ch_name != channel_filter:
                continue
            safe = ch_info.get('safe', '')
            if safe:
                arr = load_channel_array(artifact_dir, 'analog', safe, mmap=True)
                raw_values = arr[:].tolist()
                rms_vals = _compute_rms(raw_values, sample_rate, frequency)
                rms_channels.append({
                    'name': ch_name,
                    'unit': ch_info.get('unit', ''),
                    'phase': ch_info.get('phase', ''),
                    'values': rms_vals,
                })

        return Response({
            'id': record.id,
            'time_ms': time_ms,
            'sample_rate': sample_rate,
            'frequency': frequency,
            'channels': rms_channels,
        })

    # Legacy payload-based
    payload = record.data_payload
    if not payload:
        return Response({'error': 'No waveform data.'}, status=status.HTTP_404_NOT_FOUND)

    trigger_time = record.trigger_time or 0.0
    time_array = payload.get('time', [])
    time_ms = [round((t - trigger_time) * 1000, 6) for t in time_array]

    rms_channels = []
    for ch in payload.get('analog', []):
        if channel_filter and ch['name'] != channel_filter:
            continue
        rms_vals = _compute_rms(ch['values'], sample_rate, frequency)
        rms_channels.append({
            'name': ch['name'],
            'unit': ch.get('unit', ''),
            'phase': ch.get('phase', ''),
            'values': rms_vals,
        })

    return Response({
        'id': record.id,
        'time_ms': time_ms,
        'sample_rate': sample_rate,
        'frequency': frequency,
        'channels': rms_channels,
    })


# ─── Channel Metadata ─────────────────────────────────────────────────────────

@api_view(['GET'])
def get_channels(request, pk):
    """
    Returns channel metadata only (no raw values).
    Used by the column-mapping UI and settings panel.
    """
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    payload = record.data_payload or {}
    artifact_dir = _record_artifact_dir(record)
    artifact_meta = load_artifact_meta(artifact_dir) if artifact_dir else None
    channel_config = record.channel_config or {}

    analog = []
    digital = []

    if artifact_meta:
        for ch in (artifact_meta.get('analog', []) or []):
            cfg = channel_config.get(ch.get('name'), {})
            analog.append({
                'name': ch.get('name'),
                'unit': ch.get('unit', ''),
                'phase': ch.get('phase', ''),
                'title': cfg.get('title', ch.get('name')),
                'color': cfg.get('color', ''),
                'scale': cfg.get('scale', 1.0),
                'visible': cfg.get('visible', True),
            })

        for ch in (artifact_meta.get('digital', []) or []):
            cfg = channel_config.get(ch.get('name'), {})
            digital.append({
                'name': ch.get('name'),
                'title': cfg.get('title', ch.get('name')),
                'color': cfg.get('color', ''),
                'visible': cfg.get('visible', True),
            })

        return Response({
            'id': record.id,
            'station': artifact_meta.get('station', ''),
            'device': artifact_meta.get('device', ''),
            'sample_rate': record.sample_rate,
            'trigger_time': record.trigger_time,
            'total_samples': int(artifact_meta.get('total_samples', 0)),
            'nominal_frequency': record.nominal_frequency,
            'has_config': record.channel_config is not None and len(record.channel_config) > 0,
            'analog': analog,
            'digital': digital,
        })

    # Legacy payload-based
    for ch in payload.get('analog', []):
        cfg = channel_config.get(ch['name'], {})
        analog.append({
            'name': ch['name'],
            'unit': ch.get('unit', ''),
            'phase': ch.get('phase', ''),
            'title': cfg.get('title', ch['name']),
            'color': cfg.get('color', ''),
            'scale': cfg.get('scale', 1.0),
            'visible': cfg.get('visible', True),
        })

    for ch in payload.get('digital', []):
        cfg = channel_config.get(ch['name'], {})
        digital.append({
            'name': ch['name'],
            'title': cfg.get('title', ch['name']),
            'color': cfg.get('color', ''),
            'visible': cfg.get('visible', True),
        })

    return Response({
        'id': record.id,
        'station': payload.get('station', ''),
        'device': payload.get('device', ''),
        'sample_rate': record.sample_rate,
        'trigger_time': record.trigger_time,
        'total_samples': len(payload.get('time', [])),
        'nominal_frequency': record.nominal_frequency,
        'has_config': record.channel_config is not None and len(record.channel_config) > 0,
        'analog': analog,
        'digital': digital,
    })


@api_view(['PATCH'])
def update_channel_config(request, pk):
    """
    Save per-channel user settings for a record.
    Body: { "channel_name": { "label", "color", "scale", "unit", "visible" }, ... }
    """
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
    except DisturbanceRecord.DoesNotExist:
        return Response({'error': 'Record not found'}, status=status.HTTP_404_NOT_FOUND)

    existing = record.channel_config or {}
    updates = request.data
    if not isinstance(updates, dict):
        return Response({'error': 'Body must be a JSON object.'}, status=status.HTTP_400_BAD_REQUEST)

    existing.update(updates)
    record.channel_config = existing
    record.save(update_fields=['channel_config'])
    return Response({'status': 'ok', 'channel_config': record.channel_config})


# ─── App Settings ─────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
def app_settings(request):
    """
    GET  – returns all settings as {key: value} dict
    POST – upserts one or more settings {key: value, ...}
    """
    if request.method == 'GET':
        settings_qs = AppSettings.objects.all()
        data = {s.key: s.value for s in settings_qs}
        return Response(data)

    elif request.method == 'POST':
        updates = request.data
        if not isinstance(updates, dict):
            return Response({'error': 'Body must be a JSON object.'}, status=status.HTTP_400_BAD_REQUEST)

        for key, value in updates.items():
            AppSettings.objects.update_or_create(key=key, defaults={'value': value})

        all_settings = {s.key: s.value for s in AppSettings.objects.all()}
        return Response(all_settings, status=status.HTTP_200_OK)
