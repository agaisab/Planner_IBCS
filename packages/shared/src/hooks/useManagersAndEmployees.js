import { useEffect, useRef, useState } from 'react';
import { deepEqual } from '../utils.js';

const DEFAULT_POLL = 4000;

export const useManagersAndEmployees = (
  { fetchManagers, fetchEmployees },
  { pollInterval = DEFAULT_POLL } = {}
) => {
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);
  const refreshRef = useRef(async () => {});

  useEffect(() => {
    if (!fetchManagers || !fetchEmployees) {
      setManagers([]);
      setEmployees([]);
      setLoading(false);
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        refreshRef.current = async () => {};
      };
    }

    let cancelled = false;

    const load = async (showLoading) => {
      if (showLoading) setLoading(true);
      try {
        const [mgrs, emps] = await Promise.all([fetchManagers(), fetchEmployees()]);
        if (cancelled) return;
        setManagers((prev) => (deepEqual(prev, mgrs) ? prev : mgrs || []));
        setEmployees((prev) => (deepEqual(prev, emps) ? prev : emps || []));
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      } finally {
        if (!cancelled && pollInterval > 0) {
          timeoutRef.current = setTimeout(() => load(false), pollInterval);
        }
      }
    };

    load(true);
    refreshRef.current = async () => load(true);

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      refreshRef.current = async () => {};
    };
  }, [fetchManagers, fetchEmployees, pollInterval]);

  const refresh = async () => refreshRef.current();

  return { managers, employees, loading, error, refresh };
};
