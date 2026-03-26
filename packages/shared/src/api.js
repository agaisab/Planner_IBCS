const getApiBase = () =>
  import.meta.env?.VITE_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4170`
    : 'http://localhost:4170');
const getCrmProxyBase = () =>
  import.meta.env?.VITE_CRM_PROXY_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5050`
    : 'http://localhost:5050');
const getCrmProjectsPath = () =>
  import.meta.env?.VITE_CRM_PROJECT_PATH ||
  'Itarapro_projectSet?$select=Itarapro_projectId,Itarapro_project_number,Itarapro_title_internal,Itarapro_title_customer,OwnerId,obx_pm,itarapro_project_account_id,itarapro_project_opportunity_id,statecode,statuscode&$filter=statecode/Value eq 0&$orderby=Itarapro_project_number desc';
const getCrmOpportunitiesPath = () =>
  import.meta.env?.VITE_CRM_OPPORTUNITY_PATH ||
  'OpportunitySet?$select=Name,OpportunityId,AccountId,OwnerId,StateCode,StatusCode&$filter=StateCode/Value eq 0&$orderby=Name asc';
const getCrmVehiclesPath = () =>
  import.meta.env?.VITE_CRM_VEHICLE_PATH ||
  'EquipmentSet?$select=EquipmentId,Name&$orderby=Name asc';
const getCrmProjectLabelField = () =>
  import.meta.env?.VITE_CRM_PROJECT_LABEL_FIELD || 'Itarapro_title_customer';
const getCrmProjectValueField = () =>
  import.meta.env?.VITE_CRM_PROJECT_VALUE_FIELD || 'Itarapro_projectId';

export const CRM_TRAVEL_STATUS = {
  IN_PROGRESS: 862510000,
  ACCEPTED: 862510002,
  FILLED: 862510006,
  PASSED_TO_FA: 862510007
};

const toTimeMinutes = (hhmm) => {
  if (!hhmm) return NaN;
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
};

const toTimeLabel = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

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
export const fetchManagerByCrmLogin = async (crmLogin) => {
  const login = String(crmLogin || '').trim();
  if (!login) return null;
  const managers = await apiFetch(`/managers?crmLogin=${encodeURIComponent(login)}`);
  return Array.isArray(managers) && managers.length ? managers[0] : null;
};
export const createManager = (payload) => apiFetch('/managers', { method: 'POST', body: JSON.stringify(payload) });
export const updateManager = (id, payload) =>
  apiFetch(`/managers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteManager = (id) => apiFetch(`/managers/${id}`, { method: 'DELETE' });

export const fetchEmployees = (managerId) => {
  const query = managerId ? `?managerId=${encodeURIComponent(managerId)}` : '';
  return apiFetch(`/employees${query}`);
};
export const fetchEmployee = (id) => apiFetch(`/employees/${id}`);
export const fetchEmployeeByCrmLogin = async (crmLogin) => {
  const login = String(crmLogin || '').trim();
  if (!login) return null;
  const employees = await apiFetch(`/employees?crmLogin=${encodeURIComponent(login)}`);
  return Array.isArray(employees) && employees.length ? employees[0] : null;
};
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

const buildCrmSessionPayload = ({ crmAuth = null, crmScope = 'default' } = {}) => {
  const login = String(crmAuth?.login || '').trim();
  const password = typeof crmAuth?.password === 'string' ? crmAuth.password : '';
  const domain = String(crmAuth?.domain || '').trim();

  return {
    scope: crmScope || 'default',
    ...(login ? { login } : {}),
    ...(password ? { password } : {}),
    ...(domain ? { domain } : {})
  };
};

const fetchCrmPage = async (path, crmAuth = null, crmScope = 'default') => {
  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
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

  return {
    results,
    next:
      (typeof dataBlock?.d?.__next === 'string' && dataBlock.d.__next.trim()) ||
      (typeof dataBlock?.['@odata.nextLink'] === 'string' && dataBlock['@odata.nextLink'].trim()) ||
      null
  };
};

const fetchAllCrmPages = async (initialPath, entityLabel, crmAuth = null, crmScope = 'default') => {
  const allResults = [];
  const visited = new Set();
  let nextPath = initialPath;
  let pageCount = 0;

  while (nextPath) {
    if (visited.has(nextPath)) break;
    visited.add(nextPath);
    pageCount += 1;
    if (pageCount > 100) {
      throw new Error(`Pobieranie ${entityLabel} CRM zostało przerwane: zbyt wiele stron wyników.`);
    }

    const page = await fetchCrmPage(nextPath, crmAuth, crmScope);
    allResults.push(...page.results);
    nextPath = page.next;
  }

  return allResults;
};

export const fetchCrmProjects = async (crmAuth = null, crmScope = 'default') => {
  const [allResults, allOpportunities] = await Promise.all([
    fetchAllCrmPages(getCrmProjectsPath(), 'projektów', crmAuth, crmScope),
    fetchAllCrmPages(getCrmOpportunitiesPath(), 'szans sprzedaży', crmAuth, crmScope)
  ]);

  const labelField = getCrmProjectLabelField();
  const valueField = getCrmProjectValueField();

  const mapped = allResults
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
      const ownerReference =
        pickFieldValue(item, 'OwnerId') ??
        pickFieldValue(item, 'ownerid') ??
        pickFieldValue(item, 'owner') ??
        pickFieldValue(item, 'Owner') ??
        pickFieldValue(item, 'obx_pm') ??
        pickFieldValue(item, 'Obx_pm') ??
        null;
      const accountReference =
        pickFieldValue(item, 'itarapro_project_account_id') ??
        pickFieldValue(item, 'Itarapro_project_account_id') ??
        null;
      const opportunityReference =
        pickFieldValue(item, 'itarapro_project_opportunity_id') ??
        pickFieldValue(item, 'Itarapro_project_opportunity_id') ??
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
      const ownerName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? (ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';
      const customerName =
        typeof accountReference === 'object' && accountReference !== null
          ? (accountReference.Name || accountReference.name || '').trim()
          : typeof accountReference === 'string'
          ? accountReference.trim()
          : '';
      const accountId =
        typeof accountReference === 'object' && accountReference !== null
          ? (accountReference.Id || accountReference.id || '').trim()
          : '';
      const opportunityId =
        typeof opportunityReference === 'object' && opportunityReference !== null
          ? (opportunityReference.Id || opportunityReference.id || '').trim()
          : typeof opportunityReference === 'string'
          ? opportunityReference.trim()
          : '';
      const opportunityName =
        typeof opportunityReference === 'object' && opportunityReference !== null
          ? (opportunityReference.Name || opportunityReference.name || '').trim()
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
        customerName,
        accountId,
        number: projectNumber,
        category: 'project',
        categoryLabel: 'PROJEKTY',
        opportunityId,
        opportunityName,
        raw: item
      };
    })
    .filter(Boolean);

  const opportunities = allOpportunities
    .map((item) => {
      const opportunityId =
        pickFieldValue(item, 'OpportunityId') ??
        pickFieldValue(item, 'opportunityid') ??
        pickFieldValue(item, 'Id') ??
        pickFieldValue(item, 'id') ??
        null;
      const opportunityNameRaw =
        pickFieldValue(item, 'Name') ??
        pickFieldValue(item, 'name') ??
        null;
      const accountReference =
        pickFieldValue(item, 'AccountId') ??
        pickFieldValue(item, 'accountid') ??
        null;
      const ownerReference =
        pickFieldValue(item, 'OwnerId') ??
        pickFieldValue(item, 'ownerid') ??
        null;

      const opportunityName =
        typeof opportunityNameRaw === 'string'
          ? opportunityNameRaw.trim()
          : opportunityNameRaw != null
          ? String(opportunityNameRaw)
          : '';
      const customerName =
        typeof accountReference === 'object' && accountReference !== null
          ? (accountReference.Name || accountReference.name || '').trim()
          : typeof accountReference === 'string'
          ? accountReference.trim()
          : '';
      const accountId =
        typeof accountReference === 'object' && accountReference !== null
          ? (accountReference.Id || accountReference.id || '').trim()
          : '';
      const ownerName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? (ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';

      if (!opportunityId || !opportunityName) return null;

      return {
        id: `opportunity:${String(opportunityId).trim()}`,
        label: opportunityName,
        displayTitle: opportunityName,
        titleInternal: opportunityName,
        titleCustomer: '',
        ownerName,
        customerName,
        accountId,
        number: '',
        category: 'opportunity',
        categoryLabel: 'SZANSE SPRZEDAŻY',
        opportunityId: String(opportunityId).trim(),
        opportunityName,
        raw: item
      };
    })
    .filter(Boolean);

  const groupedEntries = [...mapped, ...opportunities];
  const unique = [];
  const seen = new Set();
  groupedEntries.forEach((entry) => {
    const key = `${entry.category || 'project'}:${entry.id || entry.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  });

  return unique;
};

export const fetchCrmVehicles = async (crmAuth = null, crmScope = 'default') => {
  const vehicles = await fetchAllCrmPages(getCrmVehiclesPath(), 'pojazdów', crmAuth, crmScope);

  return vehicles
    .map((item) => {
      const id =
        pickFieldValue(item, 'EquipmentId') ??
        pickFieldValue(item, 'equipmentid') ??
        pickFieldValue(item, 'Id') ??
        pickFieldValue(item, 'id') ??
        null;
      const name =
        pickFieldValue(item, 'Name') ??
        pickFieldValue(item, 'name') ??
        '';

      if (!id || !name) return null;

      return {
        id: String(id).trim(),
        label: String(name).trim(),
        raw: item
      };
    })
    .filter(Boolean);
};

const normalizeComparableText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const splitComparableTokens = (value) =>
  normalizeComparableText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

const matchesComparablePersonName = (left, right) => {
  const leftTokens = splitComparableTokens(left);
  const rightTokens = splitComparableTokens(right);

  if (!leftTokens.length || !rightTokens.length) return true;
  return leftTokens.every((token) => rightTokens.includes(token)) || rightTokens.every((token) => leftTokens.includes(token));
};

const buildOwnerHints = (value) => {
  const rawValues = Array.isArray(value) ? value : [value];
  const hints = [];

  rawValues.forEach((entry) => {
    const normalized = normalizeComparableText(entry);
    if (!normalized) return;
    if (!hints.includes(normalized)) hints.push(normalized);

    const compact = normalized.replace(/\s+/g, '');
    if (compact && compact !== normalized && !hints.includes(compact)) {
      hints.push(compact);
    }

    if (compact && compact.length > 2) {
      const withoutLeadingInitial = compact.slice(1);
      if (withoutLeadingInitial.length > 2 && !hints.includes(withoutLeadingInitial)) {
        hints.push(withoutLeadingInitial);
      }
    }
  });

  return hints;
};

const matchesOwnerHints = (ownerResolvedName, ownerHint) => {
  const normalizedOwner = normalizeComparableText(ownerResolvedName);
  const ownerHints = buildOwnerHints(ownerHint);
  if (!ownerHints.length || !normalizedOwner) return true;

  return ownerHints.some((hint) => {
    if (!hint) return false;
    return (
      normalizedOwner === hint ||
      normalizedOwner.includes(hint) ||
      hint.includes(normalizedOwner) ||
      matchesComparablePersonName(ownerResolvedName, hint)
    );
  });
};

const buildCrmDayRangeUtc = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
};

const crmDateLiteral = (value) => `datetime'${String(value || '').replace(/\.\d{3}Z$/, 'Z')}'`;

const toLocalTimeLabel = (value) => {
  if (!value) return '';
  const rawValue = String(value).trim();
  const odataMatch = rawValue.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/);
  const date = odataMatch ? new Date(Number(odataMatch[1])) : new Date(rawValue);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const toLocalDateLabel = (value) => {
  if (!value) return '';
  const rawValue = String(value).trim();
  const odataMatch = rawValue.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/);
  const date = odataMatch ? new Date(Number(odataMatch[1])) : new Date(rawValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parsePlannerDescription = (description) => {
  const parsed = {};
  String(description || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [keyRaw, ...rest] = line.split(':');
      if (!rest.length) return;
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (!value || value === '-') return;
      if (key === 'klient') parsed.client = value;
      if (key === 'kp') parsed.kp = value;
      if (key === 'status w plannerze') parsed.plannerStatus = value;
      if (key === 'typ') parsed.type = value;
    });
  return parsed;
};

const trimCrmSubjectAfterDash = (subject) => {
  const raw = String(subject || '').trim();
  if (!raw) return '';
  const normalized = normalizeComparableText(raw);
  if (normalized.startsWith('dp ') || normalized.startsWith('dp -')) {
    return raw;
  }
  const dashIndex = raw.lastIndexOf(' - ');
  if (dashIndex === -1) return raw;
  const trimmed = raw.slice(dashIndex + 3).trim();
  return trimmed || raw;
};

const derivePlannerSubjectFromCrm = (subject, regardingName = '') => {
  const raw = String(subject || '').trim();
  if (!raw) return '';

  const normalized = normalizeComparableText(raw);
  if (normalized.startsWith('dp ') || normalized.startsWith('dp -')) {
    return raw;
  }

  const withoutPrefix = raw.replace(/^[A-Z]{2}\s*-\s*/i, '').trim();
  const regardingRaw = String(regardingName || '').trim();

  if (regardingRaw) {
    const regardingVariants = [
      regardingRaw,
      regardingRaw.replace(/\s+/g, ' ').trim()
    ]
      .map((value) => value.trim())
      .filter(Boolean);

    for (const variant of regardingVariants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stripPatterns = [
        new RegExp(`\\s*-\\s*${escaped}$`, 'i'),
        new RegExp(`\\s+${escaped}$`, 'i')
      ];

      for (const pattern of stripPatterns) {
        const stripped = withoutPrefix.replace(pattern, '').trim();
        if (stripped && stripped !== withoutPrefix) {
          return stripped;
        }
      }
    }
  }

  const firstDashIndex = withoutPrefix.indexOf(' - ');
  if (firstDashIndex !== -1) {
    const trimmed = withoutPrefix.slice(0, firstDashIndex).trim();
    if (trimmed) return trimmed;
  }

  return withoutPrefix || raw;
};

const isSystemCrmTask = (subject) => {
  const normalized = normalizeComparableText(subject);
  if (!normalized) return false;
  return (
    (normalized.startsWith('delegacja ') && normalized.includes('oczekuje na akceptacje')) ||
    normalized.includes('praca zdalna')
  );
};

const sanitizeCrmDayEntries = (entries = []) => {
  return (entries || []).filter((item) => {
    const normalizedSubject = normalizeComparableText(item?.subject);
    return normalizedSubject && !normalizedSubject.startsWith('!przejazdy');
  });
};

const CRM_ACTIVITY_KIND_TO_WORK_KIND = {
  862510000: 'Zwykłe',
  862510001: '+ 50%',
  862510002: 'Nocne',
  862510003: '+ 100%'
};

const WORK_KIND_TO_CRM_ACTIVITY_KIND = {
  'Zwykłe': 862510000,
  '+ 50%': 862510001,
  Nocne: 862510002,
  '+ 100%': 862510003
};

const parseCrmOptionSetValue = (value) =>
  typeof value === 'object' && value !== null && 'Value' in value ? Number(value.Value) : Number(value);

const mapCrmActivityKindToWorkKind = (value) => CRM_ACTIVITY_KIND_TO_WORK_KIND[parseCrmOptionSetValue(value)] || 'Zwykłe';

export const fetchCrmAbsencesForEmployee = async ({ ownerName = '', crmAuth = null, crmScope = 'default' } = {}) => {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).toISOString();
  const rangeEnd = new Date(now.getFullYear() + 2, 0, 1, 0, 0, 0, 0).toISOString();
  const path =
    `Itarapro_absence_administrationSet?$select=` +
    [
      'Itarapro_absence_administrationId',
      'Itarapro_name',
      'Itarapro_description',
      'Itarapro_from',
      'Itarapro_until',
      'Itarapro_days',
      'Itarapro_absence_reason',
      'OwnerId',
      'statecode',
      'statuscode',
      'CreatedOn',
      'ModifiedOn'
    ].join(',') +
    `&$filter=(Itarapro_from lt ${crmDateLiteral(rangeEnd)} and Itarapro_until ge ${crmDateLiteral(rangeStart)})` +
    `&$orderby=Itarapro_from desc`;

  const results = await fetchAllCrmPages(path, 'urlopów i nieobecności', crmAuth, crmScope);

  return results
    .map((item) => {
      const id =
        pickFieldValue(item, 'Itarapro_absence_administrationId') ??
        pickFieldValue(item, 'itarapro_absence_administrationid') ??
        null;
      const ownerReference = pickFieldValue(item, 'OwnerId') ?? pickFieldValue(item, 'ownerid') ?? null;
      const ownerResolvedName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? String(ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';
      const name = String(
        pickFieldValue(item, 'Itarapro_name') ?? pickFieldValue(item, 'itarapro_name') ?? ''
      ).trim();
      const description = String(
        pickFieldValue(item, 'Itarapro_description') ?? pickFieldValue(item, 'itarapro_description') ?? ''
      ).trim();
      const fromRaw = pickFieldValue(item, 'Itarapro_from') ?? pickFieldValue(item, 'itarapro_from') ?? null;
      const untilRaw = pickFieldValue(item, 'Itarapro_until') ?? pickFieldValue(item, 'itarapro_until') ?? null;
      const days = Number(
        pickFieldValue(item, 'Itarapro_days') ?? pickFieldValue(item, 'itarapro_days') ?? 0
      );
      const stateCode = parseCrmOptionSetValue(pickFieldValue(item, 'statecode'));
      const statusCode = parseCrmOptionSetValue(pickFieldValue(item, 'statuscode'));
      const reasonCode = parseCrmOptionSetValue(
        pickFieldValue(item, 'Itarapro_absence_reason') ?? pickFieldValue(item, 'itarapro_absence_reason')
      );

      const reasonFromName = name.includes(' - ') ? name.split(' - ')[0].trim() : name;
      const reasonLabel = reasonFromName || description || `Nieobecność ${Number.isFinite(reasonCode) ? reasonCode : ''}`.trim();

      return {
        id: id ? String(id).trim() : '',
        ownerName: ownerResolvedName,
        name,
        description,
        reasonCode: Number.isFinite(reasonCode) ? reasonCode : null,
        reasonLabel,
        from: toLocalDateLabel(fromRaw),
        until: toLocalDateLabel(untilRaw),
        days: Number.isFinite(days) ? days : 0,
        stateCode: Number.isFinite(stateCode) ? stateCode : null,
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
        statusLabel: stateCode === 0 ? 'Planowane' : stateCode === 1 ? 'Zamknięte' : '—',
        matchesOwner: matchesOwnerHints(ownerResolvedName, ownerName)
      };
    })
    .filter((item) => item.id && item.matchesOwner)
    .sort((left, right) => String(right.from || '').localeCompare(String(left.from || '')));
};

export const fetchCrmTasksForDate = async ({ dateKey, ownerName = '', crmAuth = null, crmScope = 'default' } = {}) => {
  const dayRange = buildCrmDayRangeUtc(dateKey);
  if (!dayRange) return [];

  const path =
    `TaskSet?$select=ActivityId,Subject,Description,OwnerId,RegardingObjectId,ActualStart,ActualEnd,ScheduledStart,ScheduledEnd,ActualDurationMinutes,StateCode,StatusCode,obx_calculatetime` +
    `&$filter=((ActualStart ge ${crmDateLiteral(dayRange.start)} and ActualStart lt ${crmDateLiteral(dayRange.end)})` +
    ` or (ScheduledStart ge ${crmDateLiteral(dayRange.start)} and ScheduledStart lt ${crmDateLiteral(dayRange.end)}))` +
    `&$orderby=ActualStart asc,ScheduledStart asc`;
  const travelPath =
    `Itaratrv_travelSet?$select=Itaratrv_travelId,itaratrv_name,Itaratrv_travel_number,Itaratrv_travel_start,Itaratrv_travel_end,Itaratrv_travel_to_city,OwnerId,statecode,statuscode,itaratrv_travel_project_id` +
    `&$filter=((Itaratrv_travel_start lt ${crmDateLiteral(dayRange.end)} and Itaratrv_travel_end ge ${crmDateLiteral(dayRange.start)})` +
    ` or (Itaratrv_travel_start ge ${crmDateLiteral(dayRange.start)} and Itaratrv_travel_start lt ${crmDateLiteral(dayRange.end)}))` +
    `&$orderby=Itaratrv_travel_start asc`;
  const resourceUsagePath =
    `itarapro_resourceusageSet?$select=ActivityId,Subject,ScheduledStart,ScheduledEnd,ActualStart,ActualEnd,OwnerId,RegardingObjectId,StateCode,StatusCode` +
    `&$filter=((ScheduledStart ge ${crmDateLiteral(dayRange.start)} and ScheduledStart lt ${crmDateLiteral(dayRange.end)})` +
    ` or (ActualStart ge ${crmDateLiteral(dayRange.start)} and ActualStart lt ${crmDateLiteral(dayRange.end)}))` +
    `&$orderby=ScheduledStart asc,ActualStart asc`;

  const [allResults, travelResults, resourceUsageResults] = await Promise.all([
    fetchAllCrmPages(path, 'działań', crmAuth, crmScope),
    fetchAllCrmPages(travelPath, 'delegacji pracowniczych', crmAuth, crmScope),
    fetchAllCrmPages(resourceUsagePath, 'użyć zasobów', crmAuth, crmScope)
  ]);
  const resourceUsageEntries = resourceUsageResults
    .map((item) => {
      const activityId = pickFieldValue(item, 'ActivityId') ?? pickFieldValue(item, 'activityid') ?? null;
      const subject = trimCrmSubjectAfterDash(
        String(pickFieldValue(item, 'Subject') ?? pickFieldValue(item, 'subject') ?? '').trim()
      );
      const ownerReference = pickFieldValue(item, 'OwnerId') ?? pickFieldValue(item, 'ownerid') ?? null;
      const regardingReference =
        pickFieldValue(item, 'RegardingObjectId') ?? pickFieldValue(item, 'regardingobjectid') ?? null;
      const scheduledStart =
        pickFieldValue(item, 'ScheduledStart') ?? pickFieldValue(item, 'scheduledstart') ?? null;
      const scheduledEnd = pickFieldValue(item, 'ScheduledEnd') ?? pickFieldValue(item, 'scheduledend') ?? null;
      const actualStart = pickFieldValue(item, 'ActualStart') ?? pickFieldValue(item, 'actualstart') ?? null;
      const actualEnd = pickFieldValue(item, 'ActualEnd') ?? pickFieldValue(item, 'actualend') ?? null;
      const stateCode = pickFieldValue(item, 'StateCode') ?? pickFieldValue(item, 'statecode') ?? null;
      const statusCode = pickFieldValue(item, 'StatusCode') ?? pickFieldValue(item, 'statuscode') ?? null;

      const ownerResolvedName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? String(ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';
      const normalizedItemOwner = normalizeComparableText(ownerResolvedName);
      const regardingId =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.Id || regardingReference.id || '').trim()
          : '';
      const regardingName =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.Name || regardingReference.name || '').trim()
          : typeof regardingReference === 'string'
          ? regardingReference.trim()
          : '';
      const regardingLogicalName =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.LogicalName || regardingReference.logicalName || '').trim()
          : '';
      const normalizedSubject = normalizeComparableText(subject);
      const derivedType = normalizedSubject.startsWith('dp ') || normalizedSubject.startsWith('dp -')
        ? 'Przejazd'
        : normalizedSubject.startsWith('tr ') || normalizedSubject.startsWith('tr -')
        ? 'Delegacja'
        : 'Biuro';

      return {
        activityId: activityId ? String(activityId).trim() : '',
        subject: derivePlannerSubjectFromCrm(subject, regardingName),
        description: '',
        ownerName: ownerResolvedName,
        regarding: regardingId
          ? {
              id: regardingId,
              logicalName: regardingLogicalName,
              name: regardingName
            }
          : null,
        start: toLocalTimeLabel(actualStart || scheduledStart),
        end: toLocalTimeLabel(actualEnd || scheduledEnd),
        stateCode:
          typeof stateCode === 'object' && stateCode !== null && 'Value' in stateCode
            ? Number(stateCode.Value)
            : Number(stateCode),
        statusCode:
          typeof statusCode === 'object' && statusCode !== null && 'Value' in statusCode
            ? Number(statusCode.Value)
            : Number(statusCode),
        plannerDetails: {
          type: derivedType,
          plannerStatus: 'Planowane'
        },
        matchesOwner: matchesOwnerHints(ownerResolvedName, ownerName),
        recordType: 'resourceusage'
      };
    })
    .filter((item) => item.activityId && item.subject)
    .filter((item) => item.matchesOwner);

  if (resourceUsageEntries.length) {
    return sanitizeCrmDayEntries(resourceUsageEntries).sort((left, right) => {
      const leftMinutes = toTimeMinutes(left.start);
      const rightMinutes = toTimeMinutes(right.start);
      if (Number.isFinite(leftMinutes) && Number.isFinite(rightMinutes) && leftMinutes !== rightMinutes) {
        return leftMinutes - rightMinutes;
      }
      return String(left.subject || '').localeCompare(String(right.subject || ''), 'pl');
    });
  }

  const taskEntries = allResults
    .map((item) => {
      const activityId = pickFieldValue(item, 'ActivityId') ?? pickFieldValue(item, 'activityid') ?? null;
      const subject = pickFieldValue(item, 'Subject') ?? pickFieldValue(item, 'subject') ?? '';
      const description = pickFieldValue(item, 'Description') ?? pickFieldValue(item, 'description') ?? '';
      const ownerReference = pickFieldValue(item, 'OwnerId') ?? pickFieldValue(item, 'ownerid') ?? null;
      const regardingReference =
        pickFieldValue(item, 'RegardingObjectId') ?? pickFieldValue(item, 'regardingobjectid') ?? null;
      const actualStart = pickFieldValue(item, 'ActualStart') ?? pickFieldValue(item, 'actualstart') ?? null;
      const actualEnd = pickFieldValue(item, 'ActualEnd') ?? pickFieldValue(item, 'actualend') ?? null;
      const scheduledStart =
        pickFieldValue(item, 'ScheduledStart') ?? pickFieldValue(item, 'scheduledstart') ?? null;
      const scheduledEnd = pickFieldValue(item, 'ScheduledEnd') ?? pickFieldValue(item, 'scheduledend') ?? null;
      const stateCode = pickFieldValue(item, 'StateCode') ?? pickFieldValue(item, 'statecode') ?? null;
      const statusCode = pickFieldValue(item, 'StatusCode') ?? pickFieldValue(item, 'statuscode') ?? null;
      const crmActivityKind =
        pickFieldValue(item, 'obx_calculatetime') ?? pickFieldValue(item, 'Obx_calculatetime') ?? null;
      const ownerResolvedName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? String(ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';
      const regardingId =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.Id || regardingReference.id || '').trim()
          : '';
      const regardingName =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.Name || regardingReference.name || '').trim()
          : typeof regardingReference === 'string'
          ? regardingReference.trim()
          : '';
      const regardingLogicalName =
        typeof regardingReference === 'object' && regardingReference !== null
          ? String(regardingReference.LogicalName || regardingReference.logicalName || '').trim()
          : '';
      const plannerDetails = parsePlannerDescription(description);
      const startSource = actualStart || scheduledStart || null;
      const endSource = actualEnd || scheduledEnd || null;
      const normalizedItemOwner = normalizeComparableText(ownerResolvedName);

      return {
        activityId: activityId ? String(activityId).trim() : '',
        subject: derivePlannerSubjectFromCrm(String(subject || '').trim(), regardingName),
        description: String(description || '').trim(),
        ownerName: ownerResolvedName,
        regarding: regardingId
          ? {
              id: regardingId,
              logicalName: regardingLogicalName,
              name: regardingName
            }
          : null,
        start: toLocalTimeLabel(startSource),
        end: toLocalTimeLabel(endSource),
        stateCode:
          typeof stateCode === 'object' && stateCode !== null && 'Value' in stateCode
            ? Number(stateCode.Value)
            : Number(stateCode),
        statusCode:
          parseCrmOptionSetValue(statusCode),
        plannerDetails,
        crmWorkKind: mapCrmActivityKindToWorkKind(crmActivityKind),
        matchesOwner: matchesOwnerHints(ownerResolvedName, ownerName)
      };
    })
    .filter((item) => item.activityId && item.subject)
    .filter((item) => !isSystemCrmTask(item.subject))
    .filter((item) => item.matchesOwner);

  const travelEntries = travelResults
    .map((item) => {
      const travelId = pickFieldValue(item, 'Itaratrv_travelId') ?? pickFieldValue(item, 'itaratrv_travelid') ?? null;
      const travelNumber = pickFieldValue(item, 'Itaratrv_travel_number') ?? pickFieldValue(item, 'itaratrv_travel_number') ?? '';
      const travelName = pickFieldValue(item, 'itaratrv_name') ?? pickFieldValue(item, 'Itaratrv_name') ?? '';
      const travelCity = pickFieldValue(item, 'Itaratrv_travel_to_city') ?? pickFieldValue(item, 'itaratrv_travel_to_city') ?? '';
      const travelStart =
        pickFieldValue(item, 'Itaratrv_travel_start') ?? pickFieldValue(item, 'itaratrv_travel_start') ?? null;
      const travelEnd =
        pickFieldValue(item, 'Itaratrv_travel_end') ?? pickFieldValue(item, 'itaratrv_travel_end') ?? null;
      const ownerReference = pickFieldValue(item, 'OwnerId') ?? pickFieldValue(item, 'ownerid') ?? null;
      const projectReference =
        pickFieldValue(item, 'itaratrv_travel_project_id') ?? pickFieldValue(item, 'Itaratrv_travel_project_id') ?? null;
      const stateCode = pickFieldValue(item, 'statecode') ?? pickFieldValue(item, 'StateCode') ?? null;
      const statusCode = pickFieldValue(item, 'statuscode') ?? pickFieldValue(item, 'StatusCode') ?? null;

      const ownerResolvedName =
        typeof ownerReference === 'object' && ownerReference !== null
          ? String(ownerReference.Name || ownerReference.name || '').trim()
          : typeof ownerReference === 'string'
          ? ownerReference.trim()
          : '';
      const normalizedItemOwner = normalizeComparableText(ownerResolvedName);
      const projectId =
        typeof projectReference === 'object' && projectReference !== null
          ? String(projectReference.Id || projectReference.id || '').trim()
          : '';
      const projectName =
        typeof projectReference === 'object' && projectReference !== null
          ? String(projectReference.Name || projectReference.name || '').trim()
          : typeof projectReference === 'string'
          ? projectReference.trim()
          : '';

      const numberLabel = String(travelNumber || '').trim();
      const cityLabel = String(travelCity || '').trim();
      const fallbackName = String(travelName || '').trim();
      const locationAndNumber = [cityLabel, numberLabel].filter(Boolean).join(' ');
      const subjectLabel = locationAndNumber ? `DP - ${locationAndNumber}` : numberLabel ? `DP - ${numberLabel}` : 'DP';

      return {
        activityId: travelId ? String(travelId).trim() : '',
        travelId: travelId ? String(travelId).trim() : '',
        travelNumber: numberLabel,
        subject: subjectLabel,
        description: fallbackName,
        ownerName: ownerResolvedName,
        regarding: projectId
          ? {
              id: projectId,
              logicalName: 'itarapro_project',
              name: projectName
            }
          : null,
        start: toLocalTimeLabel(travelStart),
        end: toLocalTimeLabel(travelEnd),
        stateCode:
          typeof stateCode === 'object' && stateCode !== null && 'Value' in stateCode
            ? Number(stateCode.Value)
            : Number(stateCode),
        statusCode:
          typeof statusCode === 'object' && statusCode !== null && 'Value' in statusCode
            ? Number(statusCode.Value)
            : Number(statusCode),
        plannerDetails: {
          type: 'Przejazd',
          client: cityLabel,
          plannerStatus: 'Planowane'
        },
        matchesOwner: matchesOwnerHints(ownerResolvedName, ownerName),
        recordType: 'travel'
      };
    })
    .filter((item) => item.activityId && item.subject)
    .filter((item) => item.matchesOwner);

  const resolvedTravelEntriesNested = await Promise.all(
    travelEntries.map(async (travelEntry) => {
      if (!travelEntry.travelId) return [travelEntry];

      const relatedPointers = await fetchAllCrmPages(
        `Itaratrv_travelSet(guid'${travelEntry.travelId}')/itaratrv_travel_ActivityPointers?$select=ActivityId,Subject,ScheduledStart,ScheduledEnd,ActualStart,ActualEnd,OwnerId`,
        'aktywności delegacji',
        crmAuth,
        crmScope
      ).catch(() => []);

      const mappedPointers = relatedPointers
        .map((item) => {
          const activityId = pickFieldValue(item, 'ActivityId') ?? pickFieldValue(item, 'activityid') ?? null;
          const subjectRaw = String(pickFieldValue(item, 'Subject') ?? pickFieldValue(item, 'subject') ?? '').trim();
          const ownerReference = pickFieldValue(item, 'OwnerId') ?? pickFieldValue(item, 'ownerid') ?? null;
          const scheduledStart =
            pickFieldValue(item, 'ScheduledStart') ?? pickFieldValue(item, 'scheduledstart') ?? null;
          const scheduledEnd = pickFieldValue(item, 'ScheduledEnd') ?? pickFieldValue(item, 'scheduledend') ?? null;
          const actualStart = pickFieldValue(item, 'ActualStart') ?? pickFieldValue(item, 'actualstart') ?? null;
          const actualEnd = pickFieldValue(item, 'ActualEnd') ?? pickFieldValue(item, 'actualend') ?? null;

          const ownerResolvedName =
            typeof ownerReference === 'object' && ownerReference !== null
              ? String(ownerReference.Name || ownerReference.name || '').trim()
              : typeof ownerReference === 'string'
              ? ownerReference.trim()
              : '';

          const normalizedSubject = normalizeComparableText(subjectRaw);
          if (
            !activityId ||
            !subjectRaw ||
            !matchesOwnerHints(ownerResolvedName, ownerName) ||
            normalizedSubject.startsWith('delegacja ') ||
            normalizedSubject.startsWith('twoja delegacja')
          ) {
            return null;
          }

          const composedSubject = `DP - ${subjectRaw}${travelEntry.travelNumber ? ` ${travelEntry.travelNumber}` : ''}`.trim();
          const startLabel = toLocalTimeLabel(scheduledStart || actualStart);
          const endLabel = toLocalTimeLabel(scheduledEnd || actualEnd);
          if (!startLabel || !endLabel) return null;

          return {
            ...travelEntry,
            activityId: String(activityId).trim(),
            subject: composedSubject,
            start: startLabel,
            end: endLabel,
            ownerName: ownerResolvedName || travelEntry.ownerName
          };
        })
        .filter(Boolean)
        .sort((left, right) => toTimeMinutes(left.start) - toTimeMinutes(right.start));

      return mappedPointers.length ? mappedPointers : [travelEntry];
    })
  );

  const resolvedTravelEntries = resolvedTravelEntriesNested.flat();

  return sanitizeCrmDayEntries([...taskEntries, ...resolvedTravelEntries]).sort((left, right) => {
    const leftMinutes = toTimeMinutes(left.start);
    const rightMinutes = toTimeMinutes(right.start);
    if (Number.isFinite(leftMinutes) && Number.isFinite(rightMinutes) && leftMinutes !== rightMinutes) {
      return leftMinutes - rightMinutes;
    }
    return String(left.subject || '').localeCompare(String(right.subject || ''), 'pl');
  });
};

const toCrmIsoDate = (dateKey, hhmm, fallbackMinutes = 0) => {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  let hours = 0;
  let minutes = 0;
  if (hhmm) {
    const [parsedHours, parsedMinutes] = String(hhmm).split(':').map(Number);
    hours = Number.isFinite(parsedHours) ? parsedHours : 0;
    minutes = Number.isFinite(parsedMinutes) ? parsedMinutes : 0;
  } else if (Number.isFinite(fallbackMinutes)) {
    hours = Math.floor(fallbackMinutes / 60);
    minutes = fallbackMinutes % 60;
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildCrmTaskActivityBody = ({
  task,
  dateKey,
  employeeName = '',
  regarding = null
}) => {
  const subject = String(task?.subject || '').trim();
  if (!subject) {
    throw new Error('Nie można wysłać działania do CRM bez tematu.');
  }

  const startIso = toCrmIsoDate(dateKey, task?.start, 8 * 60);
  const endIso =
    toCrmIsoDate(dateKey, task?.end) ||
    (startIso ? new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString() : null);
  const startMinutes = toTimeMinutes(task?.start);
  const endMinutes = toTimeMinutes(task?.end);
  const actualDurationMinutes =
    Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes
      ? endMinutes - startMinutes
      : null;

  const details = [
    employeeName ? `Pracownik: ${employeeName}` : '',
    task?.project ? `Dotyczy: ${task.project}` : '',
    task?.client ? `Klient: ${task.client}` : '',
    task?.kp ? `KP: ${task.kp}` : '',
    task?.status ? `Status w Plannerze: ${task.status}` : '',
    task?.type ? `Typ: ${task.type}` : '',
    task?.workKind ? `Rodzaj: ${task.workKind}` : ''
  ].filter(Boolean);

  const crmActivityKindValue =
    WORK_KIND_TO_CRM_ACTIVITY_KIND[String(task?.workKind || '').trim()] ?? WORK_KIND_TO_CRM_ACTIVITY_KIND['Zwykłe'];

  return {
    __metadata: { type: 'Microsoft.Crm.Sdk.Data.Services.Task' },
    Subject: subject,
    ...(startIso ? { ScheduledStart: startIso } : {}),
    ...(endIso ? { ScheduledEnd: endIso } : {}),
    ...(startIso ? { ActualStart: startIso } : {}),
    ...(endIso ? { ActualEnd: endIso } : {}),
    ...(actualDurationMinutes != null ? { ActualDurationMinutes: actualDurationMinutes } : {}),
    obx_calculatetime: {
      Value: crmActivityKindValue
    },
    ...(details.length ? { Description: details.join('\n') } : {}),
    ...(regarding
      ? {
          RegardingObjectId: {
            Id: regarding.id,
            LogicalName: regarding.logicalName,
            Name: regarding.name
          }
        }
      : {})
  };
};

const buildCrmAppointmentActivityBody = ({
  trip,
  dateKey,
  regarding = null
}) => {
  const from = String(trip?.from || '').trim() || String(trip?.subject || '').trim();
  const to = String(trip?.to || '').trim() || String(trip?.location || '').trim();
  if (!from) {
    throw new Error('Nie można wysłać przejazdu do CRM bez miejsca wyjazdu.');
  }

  const startIso = toCrmIsoDate(dateKey, trip?.start, 8 * 60);
  const endIso =
    toCrmIsoDate(dateKey, trip?.end) ||
    (startIso ? new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString() : null);
  const startMinutes = toTimeMinutes(trip?.start);
  const endMinutes = toTimeMinutes(trip?.end);
  const actualDurationMinutes =
    Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes
      ? endMinutes - startMinutes
      : null;

  return {
    __metadata: { type: 'Microsoft.Crm.Sdk.Data.Services.Appointment' },
    Subject: from,
    ...(to ? { Location: to } : {}),
    ...(startIso ? { ScheduledStart: startIso } : {}),
    ...(endIso ? { ScheduledEnd: endIso } : {}),
    ...(startIso ? { ActualStart: startIso } : {}),
    ...(endIso ? { ActualEnd: endIso } : {}),
    ...(actualDurationMinutes != null ? { ActualDurationMinutes: actualDurationMinutes } : {}),
    ...(regarding
      ? {
          RegardingObjectId: {
            Id: regarding.id,
            LogicalName: regarding.logicalName,
            Name: regarding.name
          }
        }
      : {})
  };
};

const buildCrmEntityReference = (reference, fallbackLogicalName = '') => {
  if (!reference?.id) return null;
  const id = String(reference.id || '').trim();
  const logicalName = String(reference.logicalName || fallbackLogicalName || '').trim();
  if (!id || !logicalName) return null;
  return {
    Id: id,
    LogicalName: logicalName,
    ...(reference.name ? { Name: String(reference.name).trim() } : {})
  };
};

const parseCrmDecimal = (rawValue) => {
  if (rawValue == null) return null;
  const normalized = String(rawValue)
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!normalized) return null;
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const buildCrmTravelBody = ({ travel }) => {
  const startDate = String(travel?.startDate || '').trim();
  const endDate = String(travel?.endDate || '').trim() || startDate;
  const startTime = String(travel?.startTime || '').trim();
  const endTime = String(travel?.endTime || '').trim();
  const purpose = String(travel?.purpose || '').trim();
  const destinationCity = String(travel?.destinationCity || '').trim();
  const destinationAddress = String(travel?.destinationAddress || '').trim();

  if (!startDate) throw new Error('Uzupełnij datę początkową delegacji.');
  if (!endDate) throw new Error('Uzupełnij datę końcową delegacji.');
  if (!purpose) throw new Error('Uzupełnij cel delegacji.');

  const startIso = toCrmIsoDate(startDate, startTime, 8 * 60);
  const endIso = toCrmIsoDate(endDate, endTime, 16 * 60);

  if (!startIso || !endIso) {
    throw new Error('Nie udało się zbudować zakresu czasu delegacji.');
  }

  const vehicleReference = buildCrmEntityReference(travel?.vehicle, 'equipment');
  if (!vehicleReference) {
    throw new Error('Wybierz samochód do delegacji.');
  }

  const projectReference =
    travel?.regarding?.logicalName === 'itarapro_project'
      ? buildCrmEntityReference(travel.regarding, 'itarapro_project')
      : null;
  const opportunityReference =
    travel?.regarding?.logicalName === 'opportunity'
      ? buildCrmEntityReference(travel.regarding, 'opportunity')
      : null;
  const accountReference = buildCrmEntityReference(travel?.account, 'account');
  const travelStatusValue = Number(travel?.travelStatusValue);
  const moneyFieldMap = {
    dietCost: 'obx_DietCost',
    fuelCost: 'obx_Fuel',
    parkingCost: 'obx_Parking',
    highwayCost: 'obx_Highway',
    hotelCost: 'obx_Hotel',
    transportCost: 'obx_Transport',
    additionalCost: 'obx_AdditionalCosts',
    foodCost: 'obx_Food',
    advanceCost: 'obx_Advance'
  };

  const moneyFields = Object.entries(moneyFieldMap).reduce((acc, [localKey, crmKey]) => {
    const rawValue = travel?.[localKey];
    if (rawValue == null || rawValue === '') return acc;
    const numericValue = parseCrmDecimal(rawValue);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Pole kosztowe ${crmKey} ma nieprawidłowy format liczby.`);
    }
    return {
      ...acc,
      [crmKey]: {
        __metadata: { type: 'Microsoft.Crm.Sdk.Data.Services.Money' },
        Value: numericValue.toFixed(4)
      }
    };
  }, {});

  return {
    __metadata: { type: 'Microsoft.Crm.Sdk.Data.Services.Itaratrv_travel' },
    ...(String(travel?.crmTravelNumber || travel?.travelNumber || '').trim()
      ? { itaratrv_name: String(travel?.crmTravelNumber || travel?.travelNumber || '').trim() }
      : {}),
    Itaratrv_travel_start: startIso,
    Itaratrv_travel_end: endIso,
    obx_Vehicle: vehicleReference,
    obx_WhatFor: purpose,
    ...(destinationCity ? { Itaratrv_travel_to_city: destinationCity } : {}),
    ...(destinationAddress ? { Itaratrv_travel_to_street1: destinationAddress } : {}),
    ...(typeof travel?.toAccept === 'boolean' ? { obx_ToAccept: travel.toAccept } : {}),
    ...(Number.isFinite(travelStatusValue) ? { obx_TravelStatus: { Value: travelStatusValue } } : {}),
    ...(projectReference ? { itaratrv_travel_project_id: projectReference } : {}),
    ...(opportunityReference ? { obx_Opportunity: opportunityReference } : {}),
    ...(accountReference ? { itaratrv_travel_account_id: accountReference } : {}),
    ...moneyFields
  };
};

const syncCrmTravelName = async ({ travelId, travelNumber, crmAuth = null, crmScope = 'default' }) => {
  const trimmedId = String(travelId || '').trim();
  const trimmedNumber = String(travelNumber || '').trim();
  if (!trimmedId || !trimmedNumber) return;

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: `Itaratrv_travelSet(guid'${trimmedId}')`,
      method: 'POST',
      headers: {
        'X-HTTP-Method': 'MERGE'
      },
      body: {
        __metadata: { type: 'Microsoft.Crm.Sdk.Data.Services.Itaratrv_travel' },
        itaratrv_name: trimmedNumber
      },
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Synchronizacja nazwy delegacji CRM zakończyła się błędem (status ${response.status}).`;
    throw new Error(message);
  }
};

export const createCrmTaskActivity = async ({
  task,
  dateKey,
  employeeName = '',
  regarding = null,
  crmAuth = null,
  crmScope = 'default'
}) => {
  const subject = String(task?.subject || '').trim();
  const body = buildCrmTaskActivityBody({
    task,
    dateKey,
    employeeName,
    regarding
  });

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: 'TaskSet',
      method: 'POST',
      body,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Tworzenie działania CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  const data = payload?.data?.d ?? payload?.data ?? payload;
  return {
    activityId: data?.ActivityId || null,
    subject: data?.Subject || subject,
    raw: data
  };
};

export const createCrmAppointmentActivity = async ({
  trip,
  dateKey,
  regarding = null,
  crmAuth = null,
  crmScope = 'default'
}) => {
  const subject = String(trip?.from || trip?.subject || '').trim();
  const body = buildCrmAppointmentActivityBody({
    trip,
    dateKey,
    regarding
  });

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: 'AppointmentSet',
      method: 'POST',
      body,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Tworzenie terminu CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  const data = payload?.data?.d ?? payload?.data ?? payload;
  return {
    activityId: data?.ActivityId || null,
    subject: data?.Subject || subject,
    raw: data
  };
};

export const updateCrmTaskActivity = async ({
  activityId,
  task,
  dateKey,
  employeeName = '',
  regarding = null,
  crmAuth = null,
  crmScope = 'default'
}) => {
  const trimmedId = String(activityId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora działania CRM do aktualizacji.');
  }

  const subject = String(task?.subject || '').trim();
  const body = buildCrmTaskActivityBody({
    task,
    dateKey,
    employeeName,
    regarding
  });

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: `TaskSet(guid'${trimmedId}')`,
      method: 'POST',
      headers: {
        'X-HTTP-Method': 'MERGE'
      },
      body,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Aktualizacja działania CRM zakończyła się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return {
    activityId: trimmedId,
    subject,
    raw: payload?.data?.d ?? payload?.data ?? payload
  };
};

export const closeCrmTaskActivity = async (activityId, crmAuth = null, crmScope = 'default') => {
  const trimmedId = String(activityId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora działania CRM do zamknięcia.');
  }

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:a="http://schemas.microsoft.com/xrm/2011/Contracts"
               xmlns:b="http://schemas.microsoft.com/crm/2011/Contracts"
               xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
  <soap:Body>
    <Execute xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services">
      <request i:type="b:SetStateRequest">
        <a:Parameters>
          <a:KeyValuePairOfstringanyType>
            <c:key>EntityMoniker</c:key>
            <c:value i:type="a:EntityReference">
              <a:Id>${trimmedId}</a:Id>
              <a:LogicalName>task</a:LogicalName>
              <a:Name i:nil="true" />
            </c:value>
          </a:KeyValuePairOfstringanyType>
          <a:KeyValuePairOfstringanyType>
            <c:key>State</c:key>
            <c:value i:type="a:OptionSetValue">
              <a:Value>1</a:Value>
            </c:value>
          </a:KeyValuePairOfstringanyType>
          <a:KeyValuePairOfstringanyType>
            <c:key>Status</c:key>
            <c:value i:type="a:OptionSetValue">
              <a:Value>5</a:Value>
            </c:value>
          </a:KeyValuePairOfstringanyType>
        </a:Parameters>
        <a:RequestId i:nil="true" />
        <a:RequestName>SetState</a:RequestName>
      </request>
    </Execute>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(`${getCrmProxyBase()}/crm/execute`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body: soapBody,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Zamykanie działania CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return payload?.data ?? payload;
};

export const closeCrmAppointmentActivity = async (activityId, crmAuth = null, crmScope = 'default') => {
  const trimmedId = String(activityId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora terminu CRM do zamknięcia.');
  }

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:a="http://schemas.microsoft.com/xrm/2011/Contracts"
               xmlns:b="http://schemas.microsoft.com/crm/2011/Contracts"
               xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
  <soap:Body>
    <Execute xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services">
      <request i:type="b:SetStateRequest">
        <a:Parameters>
          <a:KeyValuePairOfstringanyType>
            <c:key>EntityMoniker</c:key>
            <c:value i:type="a:EntityReference">
              <a:Id>${trimmedId}</a:Id>
              <a:LogicalName>appointment</a:LogicalName>
              <a:Name i:nil="true" />
            </c:value>
          </a:KeyValuePairOfstringanyType>
          <a:KeyValuePairOfstringanyType>
            <c:key>State</c:key>
            <c:value i:type="a:OptionSetValue">
              <a:Value>1</a:Value>
            </c:value>
          </a:KeyValuePairOfstringanyType>
          <a:KeyValuePairOfstringanyType>
            <c:key>Status</c:key>
            <c:value i:type="a:OptionSetValue">
              <a:Value>3</a:Value>
            </c:value>
          </a:KeyValuePairOfstringanyType>
        </a:Parameters>
        <a:RequestId i:nil="true" />
        <a:RequestName>SetState</a:RequestName>
      </request>
    </Execute>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(`${getCrmProxyBase()}/crm/execute`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body: soapBody,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Zamykanie terminu CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return payload?.data ?? payload;
};

export const deleteCrmTaskActivity = async (activityId, crmAuth = null, crmScope = 'default') => {
  const trimmedId = String(activityId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora działania CRM do usunięcia.');
  }

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: `TaskSet(guid'${trimmedId}')`,
      method: 'POST',
      headers: {
        'X-HTTP-Method': 'DELETE'
      },
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Usuwanie działania CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return true;
};

export const deleteCrmTravel = async (travelId, crmAuth = null, crmScope = 'default') => {
  const trimmedId = String(travelId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora delegacji CRM do usunięcia.');
  }

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: `Itaratrv_travelSet(guid'${trimmedId}')`,
      method: 'POST',
      headers: {
        'X-HTTP-Method': 'DELETE'
      },
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Usuwanie delegacji CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return true;
};

export const createCrmTravel = async ({ travel, crmAuth = null, crmScope = 'default' }) => {
  const body = buildCrmTravelBody({ travel });

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: 'Itaratrv_travelSet',
      method: 'POST',
      body,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Tworzenie delegacji CRM zakończyło się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  const data = payload?.data?.d ?? payload?.data ?? payload;
  const travelId = data?.Itaratrv_travelId || null;
  const travelNumber = data?.Itaratrv_travel_number || '';
  if (travelId && travelNumber) {
    await syncCrmTravelName({ travelId, travelNumber, crmAuth, crmScope }).catch(() => {});
  }
  return {
    travelId,
    travelNumber,
    raw: data
  };
};

export const updateCrmTravel = async ({ travelId, travel, crmAuth = null, crmScope = 'default' }) => {
  const trimmedId = String(travelId || '').trim();
  if (!trimmedId) {
    throw new Error('Brak identyfikatora delegacji CRM do aktualizacji.');
  }

  const body = buildCrmTravelBody({ travel });

  const response = await fetch(`${getCrmProxyBase()}/crm/odata`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: `Itaratrv_travelSet(guid'${trimmedId}')`,
      method: 'POST',
      headers: {
        'X-HTTP-Method': 'MERGE'
      },
      body,
      ...buildCrmSessionPayload({ crmAuth, crmScope })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `Aktualizacja delegacji CRM zakończyła się błędem (status ${response.status}).`;
    throw new Error(message);
  }

  return {
    travelId: trimmedId,
    travelNumber: travel?.travelNumber || '',
    raw: payload?.data?.d ?? payload?.data ?? payload
  };
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
  fetchCrmProjects,
  fetchCrmVehicles,
  fetchCrmTasksForDate,
  createCrmTaskActivity,
  createCrmAppointmentActivity,
  updateCrmTaskActivity,
  closeCrmTaskActivity,
  closeCrmAppointmentActivity,
  deleteCrmTaskActivity,
  deleteCrmTravel,
  createCrmTravel,
  updateCrmTravel
};

export default API;
