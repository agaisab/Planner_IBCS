const getApiBase = () => import.meta.env?.VITE_API_URL || 'http://localhost:4170';
const getCrmProxyBase = () => import.meta.env?.VITE_CRM_PROXY_URL || 'http://localhost:5050';
const getCrmProjectsPath = () =>
  import.meta.env?.VITE_CRM_PROJECT_PATH ||
  'Itarapro_projectSet?$select=Itarapro_projectId,Itarapro_project_number,Itarapro_title_internal,Itarapro_title_customer&$orderby=Itarapro_project_number desc';
const getCrmProjectLabelField = () =>
  import.meta.env?.VITE_CRM_PROJECT_LABEL_FIELD || 'Itarapro_title_customer';
const getCrmProjectValueField = () =>
  import.meta.env?.VITE_CRM_PROJECT_VALUE_FIELD || 'Itarapro_projectId';

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

const pickFieldValue = (item, field) => {
  if (!item || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(item, field) && item[field] != null) return item[field];
  const lower = field.toLowerCase();
  if (lower !== field && Object.prototype.hasOwnProperty.call(item, lower) && item[lower] != null) return item[lower];
  const upper = field.toUpperCase();
  if (upper !== field && Object.prototype.hasOwnProperty.call(item, upper) && item[upper] != null) return item[upper];
  return undefined;
};

export const fetchCrmProjects = async () => {
  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: getCrmProjectsPath()
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Zapytanie CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  const dataBlock = payload?.data ?? payload;
  const results = Array.isArray(dataBlock?.d?.results)
    ? dataBlock.d.results
    : Array.isArray(dataBlock?.value)
    ? dataBlock.value
    : [];

  const labelField = getCrmProjectLabelField();
  const valueField = getCrmProjectValueField();

  const mapped = results
    .map((item) => {
      const internalTitleRaw =
        pickFieldValue(item, labelField) ??
        pickFieldValue(item, 'Itarapro_title_internal') ??
        pickFieldValue(item, 'itarapro_title_internal') ??
        pickFieldValue(item, 'Name') ??
        pickFieldValue(item, 'name') ??
        null;
      const customerTitleRaw =
        pickFieldValue(item, 'Itarapro_title_customer') ??
        pickFieldValue(item, 'itarapro_title_customer') ??
        null;
     const projectNumberRaw =
       pickFieldValue(item, 'Itarapro_project_number') ??
       pickFieldValue(item, 'itarapro_project_number') ??
        pickFieldValue(item, 'ProjectNumber') ??
        null;
      const id =
        pickFieldValue(item, valueField) ??
        pickFieldValue(item, 'Id') ??
        pickFieldValue(item, 'id') ??
        (typeof projectNumberRaw === 'string' ? projectNumberRaw : null) ??
        (typeof internalTitleRaw === 'string' ? internalTitleRaw : null) ??
        (typeof customerTitleRaw === 'string' ? customerTitleRaw : null);

      const customerTitle =
        typeof customerTitleRaw === 'string'
          ? customerTitleRaw.trim()
          : customerTitleRaw != null
          ? String(customerTitleRaw)
          : '';
      const internalTitle =
        typeof internalTitleRaw === 'string'
          ? internalTitleRaw.trim()
          : internalTitleRaw != null
          ? String(internalTitleRaw)
          : '';
      const projectNumber =
        typeof projectNumberRaw === 'string'
          ? projectNumberRaw.trim()
          : projectNumberRaw != null
          ? String(projectNumberRaw)
          : '';
      const ownerReference =
        pickFieldValue(item, 'OwnerId') ??
        pickFieldValue(item, 'ownerid') ??
        pickFieldValue(item, 'Owner') ??
        null;
      const ownerName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? (ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';

      const displayTitle = internalTitle || customerTitle;
      const label = [projectNumber, displayTitle].filter(Boolean).join(' - ');

      if (!label && !projectNumber && !displayTitle) return null;

      return {
        id:
          typeof id === 'string'
            ? id.trim()
            : id != null
            ? String(id)
            : label || displayTitle || projectNumber,
        label: label || displayTitle || projectNumber,
        titleInternal: internalTitle,
        titleCustomer: customerTitle,
        displayTitle,
        ownerName,
        number: projectNumber,
        raw: item
      };
    })
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  mapped.forEach((entry) => {
    const key = entry.id || entry.label;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  });

  return unique;
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
  deleteMonthlyLogsForEmployee,
  fetchCrmProjects
};

export default API;
