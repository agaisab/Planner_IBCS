const getApiBase = () => import.meta.env?.VITE_API_URL || 'http://localhost:4170';

const apiFetch = async (path, options = {}) => {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`API ${options.method || 'GET'} ${path} failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

export const fetchManagers = () => apiFetch('/managers');
export const createManager = (payload) => apiFetch('/managers', { method: 'POST', body: JSON.stringify(payload) });
export const updateManager = (id, payload) =>
  apiFetch(`/managers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteManager = (id) => apiFetch(`/managers/${id}`, { method: 'DELETE' });

export const fetchEmployees = (managerId) => {
  const query = managerId ? `?managerId=${encodeURIComponent(managerId)}` : '';
  return apiFetch(`/employees${query}`);
};
export const fetchEmployee = (id) => apiFetch(`/employees/${id}`);
export const createEmployee = (payload) => apiFetch('/employees', { method: 'POST', body: JSON.stringify(payload) });
export const updateEmployee = (id, payload) =>
  apiFetch(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteEmployee = (id) => apiFetch(`/employees/${id}`, { method: 'DELETE' });

export const fetchPlansForEmployee = (employeeId) =>
  apiFetch(`/plans?employeeId=${encodeURIComponent(employeeId)}`).then((plans) => plans || []);

export const fetchPlanById = async (planId) => {
  try {
    return await apiFetch(`/plans/${planId}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
};

export const savePlan = async (plan) => {
  const body = JSON.stringify(plan);
  const existing = await fetchPlanById(plan.id);
  if (existing) {
    return apiFetch(`/plans/${plan.id}`, { method: 'PUT', body });
  }
  return apiFetch('/plans', { method: 'POST', body });
};

export const patchPlan = (id, payload) =>
  apiFetch(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deletePlan = (id) => apiFetch(`/plans/${id}`, { method: 'DELETE' });

export const fetchMonthlyLogs = (employeeId, ym) => {
  const params = new URLSearchParams({ employeeId });
  if (ym) params.append('ym', ym);
  return apiFetch(`/monthlyLogs?${params.toString()}`).then((logs) => logs || []);
};

export const createMonthlyLog = (payload) => apiFetch('/monthlyLogs', { method: 'POST', body: JSON.stringify(payload) });

export const deleteMonthlyLog = (id) => apiFetch(`/monthlyLogs/${id}`, { method: 'DELETE' });

export const deleteMonthlyLogsForEmployee = async (employeeId) => {
  const logs = await fetchMonthlyLogs(employeeId);
  await Promise.all(logs.map((log) => deleteMonthlyLog(log.id)));
};

export const API = {
  fetchManagers,
  createManager,
  updateManager,
  deleteManager,
  fetchEmployees,
  fetchEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchPlansForEmployee,
  fetchPlanById,
  savePlan,
  patchPlan,
  deletePlan,
  fetchMonthlyLogs,
  createMonthlyLog,
  deleteMonthlyLog,
  deleteMonthlyLogsForEmployee
};

export default API;
