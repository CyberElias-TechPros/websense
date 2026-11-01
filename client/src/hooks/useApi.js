import { useState, useCallback } from 'react';

/**
 * Generic async-data hook with loading/error state.
 * Usage: const { data, loading, error, execute } = useApi(getOverview);
 */
export function useApi(apiFunc, initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFunc(...args);
      setData(res.data);
      return res.data;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunc]);

  return { data, loading, error, execute };
}
