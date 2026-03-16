/**
 * useWaveformWindow
 * Viewport-based waveform fetcher (Stage 1).
 *
 * Calls:
 * - GET /api/v1/disturbances/:id/metadata/
 * - GET /api/v1/disturbances/:id/window/?start_ms=&end_ms=&signals=&mode=
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

export function useWaveformMetadata(disturbanceId) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMeta = useCallback(async () => {
    if (!disturbanceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/disturbances/${disturbanceId}/metadata/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMeta(await res.json());
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [disturbanceId]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  return { meta, loading, error, refetch: fetchMeta };
}

export function useWaveformWindow({
  disturbanceId,
  startMs,
  endMs,
  signals,
  mode = 'instantaneous',
  maxPoints,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchWindow = useCallback(async () => {
    if (!disturbanceId) return;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('start_ms', String(startMs));
      qs.set('end_ms', String(endMs));
      if (signals && signals.length) qs.set('signals', signals.join(','));
      if (mode) qs.set('mode', mode);
      if (Number.isFinite(maxPoints) && maxPoints > 0) qs.set('max_points', String(Math.floor(maxPoints)));

      const res = await fetch(`${API_BASE}/disturbances/${disturbanceId}/window/?${qs.toString()}`, {
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [disturbanceId, startMs, endMs, signals, mode, maxPoints]);

  useEffect(() => { fetchWindow(); }, [fetchWindow]);

  return { data, loading, error, refetch: fetchWindow };
}
