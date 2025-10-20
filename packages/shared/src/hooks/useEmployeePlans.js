import { useEffect, useRef, useState } from 'react';
import { deepEqual } from '../utils.js';

const DEFAULT_POLL = 4000;

export const useEmployeePlans = (employeeId, { fetchPlans, fetchLogs, pollInterval = DEFAULT_POLL } = {}) => {
  const [data, setData] = useState({ plansByDate: {}, logs: [], loading: false, error: null });
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!employeeId || !fetchPlans || !fetchLogs) {
      setData({ plansByDate: {}, logs: [], loading: false, error: null });
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }

    let cancelled = false;

    const fetchData = async (showLoading) => {
      if (showLoading) {
        setData((prev) => ({ ...prev, loading: true }));
      }
      try {
        const [plansList, logs] = await Promise.all([
          fetchPlans(employeeId),
          fetchLogs(employeeId)
        ]);
        if (cancelled) return;
        const plansMap = (plansList || []).reduce((acc, plan) => {
          if (plan?.date) acc[plan.date] = plan;
          return acc;
        }, {});
        setData((prev) => {
          const samePlans = deepEqual(prev.plansByDate, plansMap);
          const sameLogs = deepEqual(prev.logs, logs);
          if (samePlans && sameLogs && !prev.error && !showLoading) {
            return prev.loading === false ? prev : { ...prev, loading: false };
          }
          return {
            plansByDate: plansMap,
            logs: logs || [],
            loading: false,
            error: null
          };
        });
      } catch (err) {
        if (cancelled) return;
        setData({
          plansByDate: {},
          logs: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err)
        });
      } finally {
        if (!cancelled && pollInterval > 0) {
          timeoutRef.current = setTimeout(() => fetchData(false), pollInterval);
        }
      }
    };

    fetchData(true);

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [employeeId, fetchPlans, fetchLogs, pollInterval]);

  return data;
};
