/**
 * useWaveformData
 * Fetches paginated waveform data from the backend.
 * Handles page changes and window size selection.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

export function useWaveformData(disturbanceId, page = 1, windowMs = 500, mode = 'instantaneous') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback(async () => {
    if (!disturbanceId) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/disturbances/${disturbanceId}/waveform/?page=${page}&window_ms=${windowMs}&mode=${mode}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [disturbanceId, page, windowMs, mode]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  return { data, loading, error, refetch: fetchPage };
}

export function useChannelMeta(disturbanceId) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!disturbanceId) return;
    setLoading(true);
    fetch(`${API_BASE}/disturbances/${disturbanceId}/channels/`)
      .then(r => r.json())
      .then(setMeta)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [disturbanceId]);

  return { meta, loading };
}
