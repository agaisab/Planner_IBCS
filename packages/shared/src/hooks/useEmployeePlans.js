import { useEffect, useRef, useState } from 'react';
import { deepEqual } from '../utils.js';

export const useEmployeePlans = (employeeId, { fetchPlans, fetchLogs } = {}) => {
  const [data, setData] = useState({ plansByDate: {}, logs: [], loading: false, error: null });
  const abortRef = useRef(null);

  useEffect(() => {
    if (!employeeId || !fetchPlans || !fetchLogs) {
      setData({ plansByDate: {}, logs: [], loading: false, error: null });
      return () => undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setData((prev) => ({ ...prev, loading: true }));

    (async () => {
      try {
        const [plansList, logs] = await Promise.all([
          fetchPlans(employeeId, controller.signal),
          fetchLogs(employeeId, controller.signal)
        ]);
        const plansMap = (plansList || []).reduce((acc, plan) => {
          if (plan?.date) acc[plan.date] = plan;
          return acc;
        }, {});
        setData((prev) => {
          const samePlans = deepEqual(prev.plansByDate, plansMap);
          const sameLogs = deepEqual(prev.logs, logs);
          if (samePlans && sameLogs && !prev.error && !prev.loading) return prev;
          return {
            plansByDate: plansMap,
            logs: logs || [],
            loading: false,
            error: null
          };
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setData({ plansByDate: {}, logs: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [employeeId, fetchPlans, fetchLogs]);

  return data;
};
