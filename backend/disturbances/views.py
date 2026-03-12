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

import numpy as np
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from .models import DisturbanceRecord, AppSettings
from .serializers import DisturbanceUploadSerializer
from .parsers import parse_comtrade, parse_csv, parse_excel
from utils.hashing import calculate_file_hash


# ─── Helpers ─────────────────────────────────────────────────────────────────

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
    """Deletes a record."""
    try:
        record = DisturbanceRecord.objects.get(pk=pk)
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

    record = DisturbanceRecord.objects.create(
        source_type=source_type,
        name=name,
        original_filename=primary_file.name,
        file_size=primary_file.size,
        file_hash=file_hash,
        data_payload=data_payload,
        trigger_time=data_payload.get('trigger_time'),
        sample_rate=data_payload.get('sample_rate'),
        nominal_frequency=data_payload.get('frequency', 50.0),
        metadata=_meta if _meta else None,
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
        'sample_count': len(data_payload.get('time', [])),
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

    payload = record.data_payload
    if not payload:
        return Response({'error': 'No waveform data available.'}, status=status.HTTP_404_NOT_FOUND)

    time_array = payload.get('time', [])
    total_samples = len(time_array)

    if total_samples == 0:
        return Response({'error': 'Empty time array.'}, status=status.HTTP_404_NOT_FOUND)

    sample_rate = record.sample_rate or 1000.0
    window_ms = float(request.query_params.get('window_ms', 500))
    window_samples = max(1, int(round(sample_rate * window_ms / 1000.0)))

    total_pages = max(1, -(-total_samples // window_samples))  # ceiling div
    page = max(1, min(int(request.query_params.get('page', 1)), total_pages))

    start_idx = (page - 1) * window_samples
    end_idx = min(start_idx + window_samples, total_samples)

    trigger_time = record.trigger_time or 0.0
    frequency = record.nominal_frequency or 50.0
    mode = request.query_params.get('mode', 'instantaneous').lower()

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

    payload = record.data_payload
    if not payload:
        return Response({'error': 'No waveform data.'}, status=status.HTTP_404_NOT_FOUND)

    sample_rate = record.sample_rate or 1000.0
    frequency = record.nominal_frequency or 50.0
    trigger_time = record.trigger_time or 0.0

    channel_filter = request.query_params.get('channel')
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
    channel_config = record.channel_config or {}

    analog = []
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

    digital = []
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
