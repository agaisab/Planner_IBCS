import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Calendar as CalIcon,
  CalendarDays,
  Users,
  Send,
  Pencil,
  Save,
  CalendarPlus,
  Download,
  Settings,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  LogIn,
  Trash2,
  Loader2,
  Check,
  Edit3,
  Briefcase,
  Plug,
  LogOut,
  CarFront,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import {
  cls,
  ymd,
  plMonth,
  timeOptions15,
  computeReported,
  computeDayStatus,
  computeWorkKindFor,
  minutesToHHmm,
  toMinutes,
  stripActor,
  deepEqual,
  summarizePlan,
  buildPlanLogs,
  buildTaskLogs,
  MODE_META,
  TASK_TYPE_COLORS,
  STATUS_STYLES,
  DAY_STATUS_STYLES,
  WORKKIND_STYLES,
  fetchManagers,
  fetchEmployees,
  fetchPlansForEmployee,
  fetchPlanById,
  fetchMonthlyLogs,
  useEmployeePlans,
  useManagersAndEmployees,
  savePlan,
  fetchCrmProjects,
  fetchCrmVehicles,
  fetchCrmAbsencesForEmployee,
  fetchCrmTasksForDate,
  createCrmTaskActivity,
  createCrmAppointmentActivity,
  createCrmTravel,
  CRM_TRAVEL_STATUS,
  updateCrmTaskActivity,
  updateCrmTravel,
  closeCrmAppointmentActivity,
  closeCrmTaskActivity,
  deleteCrmTaskActivity,
  deleteCrmTravel,
  isPublicHoliday
} from '@planner/shared';
import Logo from '../assets/ibcs-logo.png';

const BTN =
  'inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const CARD = 'rounded-2xl border-2 border-slate-300 bg-white shadow-sm p-4';
const CHIP = 'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm';
const WEEK_DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const ABSENCE_TASK_TYPES = ['Urlop', 'L4', 'Nieobecność'];
const CRM_PROXY_URL =
  import.meta.env?.VITE_CRM_PROXY_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5050` : 'http://localhost:5050');
const CRM_FIXED_DOMAIN = import.meta.env?.VITE_CRM_DOMAIN || 'bcspol';
const CRM_SESSION_SCOPE = 'employee-panel';
const EMPLOYEE_PLAN_CACHE_PREFIX = 'planner_employee_plans_cache:';
const FIELD =
  'mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 min-w-0 disabled:bg-slate-100 disabled:text-slate-500';
const getTravelStatusLabel = (travelRequest) => {
  const statusValue = Number(travelRequest?.travelStatusValue);
  if (statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA) return 'Przekazano FA';
  if (statusValue === CRM_TRAVEL_STATUS.FILLED) return 'Wypełniona';
  if (statusValue === CRM_TRAVEL_STATUS.ACCEPTED) return 'Zaakceptowana';
  if (travelRequest?.toAccept) return 'Do akceptacji';
  return 'W trakcie';
};
const getTravelStatusClass = (travelRequest) => {
  const statusValue = Number(travelRequest?.travelStatusValue);
  if (statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA) return 'border-violet-300 bg-violet-50 text-violet-700';
  if (statusValue === CRM_TRAVEL_STATUS.FILLED) return 'border-amber-300 bg-amber-50 text-amber-700';
  if (statusValue === CRM_TRAVEL_STATUS.ACCEPTED) return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (travelRequest?.toAccept) return 'border-sky-300 bg-sky-50 text-sky-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
};

const getTripRouteLabel = (entry) => {
  const from = String(entry?.from || '').trim();
  const to = String(entry?.to || '').trim();
  if (from || to) return [from, to].filter(Boolean).join(' - ');
  return String(entry?.route || '').trim();
};

const normalizeTripEntry = (entry) => {
  const normalized = { ...(entry || {}) };
  const from = String(normalized.from || '').trim();
  const to = String(normalized.to || '').trim();
  if (from || to) return normalized;

  const legacyRoute = String(normalized.route || '').trim();
  if (!legacyRoute) return normalized;

  const parts = legacyRoute.split(' - ').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    normalized.from = parts.shift() || '';
    normalized.to = parts.join(' - ');
  }
  return normalized;
};

const buildTravelTripTask = (entry, travelRequest, existingTask = null) => {
  const route = getTripRouteLabel(entry);
  const subject = route ? `DP - ${route}` : 'DP';
  const crmActivityId = String(entry?.crmActivityId || '').trim();
  const preservedState =
    existingTask?._syncState ||
    existingTask?.prevSyncState ||
    (existingTask?.sent ? 'SENT' : 'DRAFT');

  return {
    id: existingTask?.id || `travel-task-${entry.id}`,
    type: 'Przejazd',
    subject,
    client: '',
    project: String(travelRequest?.regardingLabel || '').trim(),
    projectFullLabel: String(travelRequest?.regardingFullLabel || travelRequest?.regardingLabel || '').trim(),
    start: String(entry?.start || '').trim(),
    end: String(entry?.end || '').trim(),
    workKind: 'Przejazd',
    status: crmActivityId ? 'Zakończone' : 'Planowane',
    locked: true,
    sent: !!existingTask?.sent,
    _syncState: preservedState,
    prevSyncState: preservedState,
    crmActivityId: crmActivityId || existingTask?.crmActivityId || null,
    crmSyncedAt: crmActivityId ? existingTask?.crmSyncedAt || new Date().toISOString() : existingTask?.crmSyncedAt || null,
    crmClosePending: false,
    crmRegarding:
      travelRequest?.regarding?.id && travelRequest?.regarding?.logicalName
        ? {
            id: String(travelRequest.regarding.id).trim(),
            logicalName: String(travelRequest.regarding.logicalName).trim(),
            name: String(travelRequest.regarding.name || '').trim(),
            label: String(travelRequest?.regardingLabel || '').trim()
          }
        : null,
    travelManaged: true,
    travelTripId: entry.id
  };
};

const mergeTravelTripTasks = (items = [], travelRequest = null) => {
  const baseItems = Array.isArray(items) ? items : [];
  const existingTravelTasks = new Map(
    baseItems.filter((item) => item?.travelManaged && item?.travelTripId).map((item) => [item.travelTripId, item])
  );
  const existingCrmActivityIds = new Set(
    baseItems
      .map((item) => String(item?.crmActivityId || '').trim())
      .filter(Boolean)
  );
  const nonTravelItems = baseItems.filter((item) => !item?.travelManaged);
  const tripEntries = Array.isArray(travelRequest?.tripEntries) ? travelRequest.tripEntries : [];
  if (!tripEntries.length) {
    return sortTasksByTime(nonTravelItems.map((item) => ({ ...item })));
  }

  const mirroredTravelTasks = tripEntries
    .filter((entry) => getTripRouteLabel(entry) && String(entry?.start || '').trim() && String(entry?.end || '').trim())
    .filter((entry) => !existingCrmActivityIds.has(String(entry?.crmActivityId || '').trim()))
    .map((entry) => buildTravelTripTask(entry, travelRequest, existingTravelTasks.get(entry.id)));

  return sortTasksByTime([...nonTravelItems.map((item) => ({ ...item })), ...mirroredTravelTasks]);
};

const getPersistedTravelRequest = (travelRequest) => {
  const crmTravelId = String(travelRequest?.crmTravelId || '').trim();
  return crmTravelId ? travelRequest || null : null;
};

const COMMON_CITY_SUGGESTIONS = [
  'Białystok',
  'Bielsko-Biała',
  'Bydgoszcz',
  'Częstochowa',
  'Gdańsk',
  'Gdynia',
  'Gliwice',
  'Katowice',
  'Kielce',
  'Koszalin',
  'Kraków',
  'Kwidzyn',
  'Legnica',
  'Lublin',
  'Łódź',
  'Nowy Sącz',
  'Olsztyn',
  'Opole',
  'Piotrków Trybunalski',
  'Poznań',
  'Radom',
  'Rzeszów',
  'Sosnowiec',
  'Szczecin',
  'Toruń',
  'Warszawa',
  'Wrocław',
  'Zielona Góra'
];

const DEFAULT_TRAVEL_HOME_CITY = 'Nowy Sącz';

const isMissingCrmTravelError = (error) => {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('itaratrv_travel') && message.includes('does not exist');
};

const readPlanCache = (prefix, key) => {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(`${prefix}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writePlanCache = (prefix, key, value) => {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.sessionStorage.setItem(`${prefix}${key}`, JSON.stringify(value || {}));
  } catch {
    /* ignore cache write errors */
  }
};

const TASK_STATE_META = {
  SENT: {
    className: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    Icon: Send,
    label: 'Wysłane'
  },
  DRAFT: {
    className: 'bg-amber-50 border-amber-200 text-amber-700',
    Icon: Save,
    label: 'Zapisane'
  },
  EDITED: {
    className: 'bg-slate-100 border-slate-200 text-slate-600',
    Icon: Edit3,
    label: 'Edytowane'
  }
};

const normalizeTaskStates = (items, defaultState = 'EDITED') =>
  (items || []).map((task) => {
    const sentFlag =
      task.sent ??
      (task._syncState === 'SENT' ||
        task.prevSyncState === 'SENT' ||
        (task.locked && defaultState === 'SENT'));
    const fallback = sentFlag ? 'SENT' : defaultState === 'SENT' ? 'DRAFT' : defaultState;
    const baseState = task._syncState || task.prevSyncState || fallback;
    return {
      ...task,
      sent: !!sentFlag,
      _syncState: baseState,
      prevSyncState: baseState
    };
  });

const isTaskEffectivelyEmpty = (task) => {
  if (!task || task.travelManaged) return false;
  const subject = String(task.subject || '').trim();
  const project = String(task.project || '').trim();
  const client = String(task.client || '').trim();
  const crmActivityId = String(task.crmActivityId || '').trim();
  const hasContent = subject || project || client || crmActivityId;
  return !hasContent;
};

const shouldHideEmptyTaskDraft = (task) => {
  if (!isTaskEffectivelyEmpty(task)) return false;
  const syncState = String(task?._syncState || task?.prevSyncState || '').trim();
  return syncState !== 'EDITED';
};

const pruneEmptyTaskDrafts = (items = []) =>
  (items || []).filter((task) => !isTaskEffectivelyEmpty(task));

const mergeSubmissionItems = (previous = [], incoming = []) => {
  const mergedMap = new Map();
  previous.forEach((item) => {
    const fallback = item.sent ? 'SENT' : 'EDITED';
    const baseState = item._syncState || item.prevSyncState || fallback;
    mergedMap.set(item.id, {
      ...item,
      sent: !!item.sent,
      _syncState: baseState,
      prevSyncState: baseState
    });
  });

  incoming.forEach((incomingItem) => {
    const existing = mergedMap.get(incomingItem.id);
    if (!existing) {
      const fallback = incomingItem.sent ? 'SENT' : 'DRAFT';
      const baseState =
        incomingItem._syncState || incomingItem.prevSyncState || fallback;
      mergedMap.set(incomingItem.id, {
        ...incomingItem,
        sent: !!incomingItem.sent,
        _syncState: baseState,
        prevSyncState: baseState
      });
      return;
    }

    const previousFallback = existing.sent ? 'SENT' : 'EDITED';
    const previousState =
      existing._syncState || existing.prevSyncState || previousFallback;
    mergedMap.set(incomingItem.id, {
      ...existing,
      ...incomingItem,
      locked: incomingItem.locked ?? existing.locked ?? false,
      sent: incomingItem.sent ?? existing.sent ?? false,
      _syncState: previousState,
      prevSyncState: previousState
    });
  });

  return Array.from(mergedMap.values());
};

const sortTasksByTime = (items = []) =>
  [...items].sort((left, right) => {
    const leftStart = left?.start ? toMinutes(left.start) : Number.POSITIVE_INFINITY;
    const rightStart = right?.start ? toMinutes(right.start) : Number.POSITIVE_INFINITY;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    const leftEnd = left?.end ? toMinutes(left.end) : Number.POSITIVE_INFINITY;
    const rightEnd = right?.end ? toMinutes(right.end) : Number.POSITIVE_INFINITY;
    if (leftEnd !== rightEnd) {
      return leftEnd - rightEnd;
    }

    return String(left?.id || '').localeCompare(String(right?.id || ''), 'pl');
  });

function Modal({ open, title, children, actions, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border-2 border-slate-300 bg-white shadow-xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-3">{title}</h3>
        <div>{children}</div>
        <div className="mt-4 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

const formatTimeLabel = (value) => {
  if (!value) return '—';
  return value === '24:00' ? '00:00' : value;
};

const sanitizePlan = (plan) => {
  if (!plan) return plan;
  const clone = globalThis.structuredClone
    ? globalThis.structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
  const copy = clone || {};
  delete copy.dirty;
  return copy;
};

const formatShiftSummary = (shift) => {
  if (!shift) return '—';
  const windowLabel = `${formatTimeLabel(shift.start)}–${formatTimeLabel(shift.end)}`;
  const modeLabel = MODE_META[shift.mode || 'OFFICE']?.label || shift.mode || '—';
  const note = shift.note?.trim() ? ` • notatka: ${shift.note.trim()}` : '';
  return `${windowLabel} ${modeLabel}${note}`;
};

const describePlanChanges = (previous = {}, next = {}) => {
  const messages = [];
  const prevNote = (previous.note || '').trim();
  const nextNote = (next.note || '').trim();
  if (prevNote !== nextNote) {
    if (!prevNote && nextNote) messages.push(`Dodano notatkę: "${nextNote}"`);
    else if (prevNote && !nextNote) messages.push(`Usunięto notatkę: "${prevNote}"`);
    else messages.push(`Zmieniono notatkę: "${prevNote}" → "${nextNote}"`);
  }

  const prevShifts = previous.shifts || [];
  const nextShifts = next.shifts || [];
  const max = Math.max(prevShifts.length, nextShifts.length);

  for (let i = 0; i < max; i += 1) {
    const prevShift = prevShifts[i];
    const nextShift = nextShifts[i];
    const label = `zakres ${i + 1}`;

    if (!prevShift && nextShift) {
      messages.push(`Dodano ${label}: ${formatShiftSummary(nextShift)}`);
      continue;
    }
    if (prevShift && !nextShift) {
      messages.push(`Usunięto ${label}: ${formatShiftSummary(prevShift)}`);
      continue;
    }
    if (!prevShift || !nextShift) continue;

    const parts = [];
    if (prevShift.start !== nextShift.start || prevShift.end !== nextShift.end) {
      parts.push(
        `czas ${formatTimeLabel(prevShift.start)}–${formatTimeLabel(prevShift.end)} → ${formatTimeLabel(nextShift.start)}–${formatTimeLabel(nextShift.end)}`
      );
    }
    if ((prevShift.mode || 'OFFICE') !== (nextShift.mode || 'OFFICE')) {
      const prevMode = MODE_META[prevShift.mode || 'OFFICE']?.label || prevShift.mode || '—';
      const nextMode = MODE_META[nextShift.mode || 'OFFICE']?.label || nextShift.mode || '—';
      parts.push(`tryb ${prevMode} → ${nextMode}`);
    }
    const prevNoteShift = (prevShift.note || '').trim();
    const nextNoteShift = (nextShift.note || '').trim();
    if (prevNoteShift !== nextNoteShift) {
      if (!prevNoteShift && nextNoteShift) parts.push(`dodano notatkę "${nextNoteShift}"`);
      else if (prevNoteShift && !nextNoteShift) parts.push(`usunięto notatkę "${prevNoteShift}"`);
      else parts.push(`notatka "${prevNoteShift}" → "${nextNoteShift}"`);
    }

    if (parts.length) messages.push(`Zmieniono ${label}: ${parts.join(', ')}`);
  }

  return messages;
};

const describeTaskLabel = (task) => {
  if (!task) return '—';
  const windowLabel = `${formatTimeLabel(task.start)}–${formatTimeLabel(task.end)}`;
  const subject = (task.subject || '').trim();
  const project = (task.project || '').trim();
  const client = (task.client || '').trim();
  const base = subject || project || task.type || 'Zadanie';
  const clientPart = client ? ` (Klient: ${client})` : '';
  return `[${windowLabel}] ${base}${clientPart}`;
};

const describeTaskChanges = (previousItems = [], nextItems = []) => {
  const messages = [];
  const prevMap = new Map(previousItems.map((item) => [item.id, item]));
  const nextMap = new Map(nextItems.map((item) => [item.id, item]));

  nextItems.forEach((item) => {
    const prev = prevMap.get(item.id);
    if (!prev) {
      messages.push(`Dodano zadanie ${describeTaskLabel(item)}`);
      return;
    }
    const parts = [];
    if (prev.start !== item.start || prev.end !== item.end) {
      parts.push(
        `czas ${formatTimeLabel(prev.start)}–${formatTimeLabel(prev.end)} → ${formatTimeLabel(item.start)}–${formatTimeLabel(item.end)}`
      );
    }
    if ((prev.type || '') !== (item.type || '')) parts.push(`tryb ${prev.type || '—'} → ${item.type || '—'}`);
    if ((prev.subject || '').trim() !== (item.subject || '').trim()) {
      parts.push(`temat "${prev.subject?.trim() || '—'}" → "${item.subject?.trim() || '—'}"`);
    }
    if ((prev.client || '').trim() !== (item.client || '').trim()) {
      parts.push(`klient ${prev.client?.trim() || '—'} → ${item.client?.trim() || '—'}`);
    }
    if ((prev.project || '').trim() !== (item.project || '').trim()) {
      parts.push(`dotyczy ${prev.project?.trim() || '—'} → ${item.project?.trim() || '—'}`);
    }
    if ((prev.status || '') !== (item.status || '')) parts.push(`status ${prev.status || '—'} → ${item.status || '—'}`);
    if ((prev.workKind || '') !== (item.workKind || '')) parts.push(`rodzaj ${prev.workKind || '—'} → ${item.workKind || '—'}`);
    if (parts.length) messages.push(`Zmieniono zadanie ${describeTaskLabel(item)}: ${parts.join(', ')}`);
  });

  previousItems.forEach((item) => {
    if (!nextMap.has(item.id)) messages.push(`Usunięto zadanie ${describeTaskLabel(item)}`);
  });

  return messages;
};

const planIdFor = (employeeId, dateKey) => `${employeeId}_${dateKey}`;

const formatCompactDuration = (mins) => {
  const value = Math.max(0, Math.round(mins || 0));
  if (value === 0) return '0h';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ');
};

function TimeSelect({ value, onChange, placeholder, disabled, size = 'compact', minValue, maxValue }) {
  const v = value ?? '';
  const minMinutes = minValue ? toMinutes(minValue) : -Infinity;
  const maxMinutes = maxValue ? toMinutes(maxValue) : Infinity;
  const baseOptions = timeOptions15.filter((option) => {
    const optionMinutes = toMinutes(option);
    return optionMinutes >= minMinutes && optionMinutes <= maxMinutes;
  });
  const opts = v && !baseOptions.includes(v) ? [v, ...baseOptions] : baseOptions;
  const widthClass = size === 'plan' ? 'w-[6rem]' : 'w-[5rem]';
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`mt-1 ${widthClass} rounded-xl border-2 border-slate-300 px-1.5 py-2 font-mono tabular-nums text-sm disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
    >
      <option value="">{placeholder || '—'}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ChipSelect({ value, options, onChange, portal = true, direction = 'auto', disabled = false }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const selectedOption = options.find((o) => o.value === value) || options[0];
  const SelectedIcon = selectedOption?.Icon || null;

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  };

  useEffect(() => {
    if (open && portal) {
      updatePos();
      const onScroll = () => setOpen(false);
      const onResize = () => updatePos();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
      };
    }
    return undefined;
  }, [open, portal]);

  useEffect(() => {
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const above = direction === 'above' ? true : direction === 'below' ? false : true;
  const Menu = (
    <div
      ref={menuRef}
      className="rounded-xl border-2 border-slate-300 bg-white shadow-lg p-1 text-[11px]"
      style={
        portal
          ? {
              position: 'fixed',
              top: above ? pos.top : pos.top + pos.height,
              left: pos.left,
              minWidth: Math.max(180, pos.width),
              transform: above ? 'translateY(-100%)' : 'none',
              zIndex: 99999
            }
          : { minWidth: Math.max(180, btnRef.current?.offsetWidth || 180) }
      }
    >
      {options.map((o) => {
        const OptionIcon = o.Icon || null;
        return (
        <button
          key={o.value}
          onClick={() => {
            onChange(o.value);
            setOpen(false);
          }}
          className={`w-full text-left px-2.5 py-1 rounded-lg border ${
            o.value === value ? o.className : 'border-transparent hover:bg-slate-50 text-slate-700'
          } text-[11px]`}
        >
          <span className="inline-flex items-center gap-1.5">
            {OptionIcon ? <OptionIcon className="h-3 w-3" /> : <span className={`inline-block h-2 w-2 rounded-full ${o.dot}`} />}
            {o.label}
          </span>
        </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${selectedOption.className} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {SelectedIcon ? <SelectedIcon className="h-3.5 w-3.5" /> : <span className={`inline-block h-2 w-2 rounded-full ${selectedOption.dot}`} />}
        {selectedOption.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open &&
        (portal && typeof document !== 'undefined' ? (
          createPortal(Menu, document.body)
        ) : (
          <div className={above ? 'absolute z-50 left-0 bottom-full' : 'absolute z-50 left-0 top-full'}>
            {Menu}
          </div>
        ))}
    </div>
  );
}

function ModeChooser({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const meta = MODE_META[value] || MODE_META.OFFICE;

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="mt-1 relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`${CHIP} ${meta.base} ${meta.border} ${meta.text} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={disabled}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} /> {meta.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-xl border-2 border-slate-300 bg-white shadow-lg p-1 text-xs">
          {Object.keys(MODE_META).map((key) => {
            const current = MODE_META[key];
            const active = key === value;
            return (
              <button
                key={key}
                onClick={() => {
                  if (disabled) return;
                  onChange(key);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg border ${
                  active
                    ? `${current.base} ${current.border} ${current.text}`
                    : 'border-transparent hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${current.dot}`} /> {current.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskTypeChooser({ value, onChange, disabled }) {
  const options = Object.keys(TASK_TYPE_COLORS).map((key) => ({
    value: key,
    label: key,
    className: `${TASK_TYPE_COLORS[key].base} ${TASK_TYPE_COLORS[key].border} ${TASK_TYPE_COLORS[key].text}`,
    dot: TASK_TYPE_COLORS[key].dot
  }));
  const opt = options.find((o) => o.value === value) || options[0];
  return <ChipSelect value={opt.value} onChange={onChange} options={options} disabled={disabled} />;
}

function StatusChooser({ value, onChange, disabled }) {
  const options = [
    { value: 'Planowane', label: 'Planowane', className: STATUS_STYLES.Planowane, dot: 'bg-sky-500' },
    { value: 'Zakończone', label: 'Zakończone', className: STATUS_STYLES['Zakończone'], dot: 'bg-emerald-500' }
  ];
  return (
    <ChipSelect
      value={value || 'Planowane'}
      onChange={onChange}
      options={options}
      portal
      direction="above"
      disabled={disabled}
    />
  );
}

function CrmProjectSelect({ value, fullValue, onChange, onSelectOption, options, disabled, loading }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [collapsedGroups, setCollapsedGroups] = useState({ project: true, opportunity: true });
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const [panelRect, setPanelRect] = useState(null);
  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return safeOptions;
    return safeOptions.filter((item) => {
      const haystack = `${item.label || ''} ${item.displayTitle || ''} ${item.titleInternal || ''} ${item.titleCustomer || ''} ${item.customerName || ''} ${item.number || ''} ${item.ownerName || ''} ${item.categoryLabel || ''} ${item.opportunityName || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [safeOptions, search]);

  const groupedFiltered = useMemo(() => {
    const projects = [];
    const opportunities = [];

    filtered.forEach((item) => {
      if (item.category === 'opportunity') {
        opportunities.push(item);
      } else {
        projects.push(item);
      }
    });

    return [
      { key: 'project', label: 'PROJEKTY', items: projects },
      { key: 'opportunity', label: 'SZANSE SPRZEDAŻY', items: opportunities }
    ].filter((group) => group.items.length > 0);
  }, [filtered]);

  const visibleOptions = useMemo(() => {
    if (search.trim()) return filtered;
    return groupedFiltered.flatMap((group) => (collapsedGroups[group.key] ? [] : group.items));
  }, [collapsedGroups, filtered, groupedFiltered, search]);

  const formatPrimaryLine = useCallback((item) => {
    if (item.category === 'opportunity') {
      return item.displayTitle || item.label || '';
    }
    return item.number && item.displayTitle
      ? `${item.number} - ${item.displayTitle}`
      : item.displayTitle || item.label || item.number || '';
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!visibleOptions.length) {
      setHighlightIndex(-1);
      return;
    }
    const currentIndex = visibleOptions.findIndex((item) => item.label === value);
    setHighlightIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [open, value, visibleOptions]);

  useEffect(() => {
    if (!open) return;
    if (!visibleOptions.length) {
      setHighlightIndex(-1);
      return;
    }
    setHighlightIndex((prev) => {
      if (prev < 0 || prev >= visibleOptions.length) return 0;
      return prev;
    });
  }, [open, visibleOptions]);

  const updatePanelPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPanelRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePanelPosition();
    const handleScroll = () => updatePanelPosition();
    const handleResize = () => updatePanelPosition();
    const handleClick = (event) => {
      if (event.target.closest('[data-crm-project-menu]')) return;
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    setSearch(value || '');
  }, [open, value]);

  useEffect(() => {
    if (open) return;
    setHighlightIndex(-1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (search.trim()) {
      setCollapsedGroups({ project: false, opportunity: false });
    }
  }, [open, search]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const handleInputChange = useCallback(
    (event) => {
      const nextValue = event.target.value;
      setSearch(nextValue);
      if (!open) setOpen(true);
    },
    [open]
  );

  const handleSelect = useCallback(
    (option) => {
      if (!option) return;
      const label =
        option.label || formatPrimaryLine(option);
      onChange(label);
      setSearch(label);
      if (onSelectOption) {
        onSelectOption(option, label);
      }
      setOpen(false);
    },
    [formatPrimaryLine, onChange, onSelectOption]
  );

  const handleInputKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlightIndex((prev) => {
          const base = prev < 0 ? -1 : prev;
          const next = Math.min(base + 1, visibleOptions.length - 1);
          return next;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlightIndex((prev) => {
          if (prev <= 0) return 0;
          return prev - 1;
        });
      } else if (event.key === 'Enter') {
        if (!open) return;
        event.preventDefault();
        const option = highlightIndex >= 0 ? visibleOptions[highlightIndex] : visibleOptions[0];
        if (option) handleSelect(option);
      } else if (event.key === 'Escape') {
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
      }
    },
    [handleSelect, highlightIndex, open, visibleOptions]
  );

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  const toggleGroup = useCallback((groupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  const longestLabel = useMemo(() => {
    const longestOptionLine = safeOptions.reduce((acc, item) => {
      const primaryLine = formatPrimaryLine(item);
      const customerLine = `Klient: ${item.customerName || item.titleCustomer || '—'}`;
      const ownerLine = `KP: ${item.ownerName || '—'}`;
      const longestForItem = [primaryLine, customerLine, ownerLine].reduce((max, current) => {
        if (!current) return max;
        return current.length > max.length ? current : max;
      }, '');
      if (longestForItem && longestForItem.length > acc.length) return longestForItem;
      return acc;
    }, '');
    const longestGroupLabel = groupedFiltered.reduce((acc, group) => {
      return group.label.length > acc.length ? group.label : acc;
    }, '');
    return longestGroupLabel.length > longestOptionLine.length ? longestGroupLabel : longestOptionLine;
  }, [formatPrimaryLine, groupedFiltered, safeOptions]);

  const labelPixelWidth = useMemo(() => {
    if (typeof window === 'undefined' || !longestLabel) return 0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const referenceNode = containerRef.current?.querySelector('input');
    const computedFont = referenceNode
      ? window.getComputedStyle(referenceNode).font
      : '14px "Inter", sans-serif';
    context.font = computedFont;
    const metrics = context.measureText(longestLabel);
    return metrics.width;
  }, [longestLabel]);

  const dropdownWidth = useMemo(() => {
    const baseWidth = panelRect ? panelRect.width : 0;
    const measured = Math.ceil(labelPixelWidth) + 96;
    const minimum = 520;
    const maximum = 980;
    return Math.min(Math.max(baseWidth, measured, minimum), maximum);
  }, [panelRect, labelPixelWidth]);
  const dropdownViewportWidth = useMemo(() => {
    if (typeof window === 'undefined') return dropdownWidth;
    return Math.min(dropdownWidth, window.innerWidth - 24, 980);
  }, [dropdownWidth]);
  const dropdownLeft = useMemo(() => {
    if (!panelRect) return 0;
    if (typeof window === 'undefined') return panelRect.left;
    const maxLeft = Math.max(12, window.innerWidth - dropdownViewportWidth - 12);
    return Math.min(panelRect.left, maxLeft);
  }, [dropdownViewportWidth, panelRect]);
  const dropdownMaxHeight = panelRect
    ? Math.max(200, Math.min(360, panelRect.top - 24))
    : 320;

  const inputDisplayValue = open ? search : value || '';

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={inputDisplayValue}
        onChange={handleInputChange}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={handleInputKeyDown}
        title={fullValue || value || ''}
        className={cls(
          'w-full rounded-lg border-2 border-slate-300 px-2 py-1 pr-9',
          disabled && 'bg-slate-100 text-slate-500'
        )}
        placeholder="np. CR-10001 / zasób"
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={handleToggle}
        className={cls(
          'absolute inset-y-0 right-1 flex items-center rounded-md px-2 text-slate-500 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1',
          disabled && 'pointer-events-none text-slate-300'
        )}
        aria-label="Lista projektów CRM"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className={cls('h-4 w-4 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && panelRect &&
        createPortal(
          <div
            data-crm-project-menu
            role="listbox"
            className="z-50 rounded-2xl border border-slate-200 bg-white shadow-2xl text-sm"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: dropdownLeft,
              width: dropdownViewportWidth,
              maxWidth: dropdownViewportWidth,
              transform: 'translateY(calc(-100% - 8px))'
            }}
          >
            <div className="border-b border-slate-200 p-2">
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="Szukaj projektu..."
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: dropdownMaxHeight }}>
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-slate-500">Brak wyników.</div>
              ) : (
                groupedFiltered.map((group) => (
                  <div key={group.key}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggleGroup(group.key)}
                      className="sticky top-0 z-10 flex w-full items-center justify-between border-y border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-slate-600"
                    >
                      <span>{group.label}</span>
                      <ChevronDown className={cls('h-3 w-3 transition-transform', !collapsedGroups[group.key] && 'rotate-180')} />
                    </button>
                    {(!collapsedGroups[group.key] || search.trim()) && group.items.map((item) => {
                      const index = visibleOptions.findIndex((entry) => entry.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelect(item);
                          }}
                          onMouseEnter={() => setHighlightIndex(index)}
                          role="option"
                          aria-selected={item.label === value}
                          className={cls(
                            'w-full text-left px-3 py-2 hover:bg-slate-50',
                            item.label === value && 'bg-sky-50 text-sky-700',
                            index === highlightIndex && 'bg-sky-100 text-slate-900'
                          )}
                        >
                          <div className="font-medium leading-tight whitespace-nowrap">{formatPrimaryLine(item)}</div>
                          <div className="text-xs text-slate-500 whitespace-nowrap leading-tight">
                            Klient: {item.customerName || item.titleCustomer || '—'}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap leading-tight">
                            KP: {item.ownerName || '—'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function SearchableOptionSelect({
  value,
  onChange,
  onSelectOption,
  options,
  disabled,
  loading,
  placeholder = 'Wybierz...'
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const [panelRect, setPanelRect] = useState(null);
  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return safeOptions;
    return safeOptions.filter((item) => String(item.label || '').toLowerCase().includes(term));
  }, [safeOptions, search]);

  const updatePanelPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPanelRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const handleScroll = () => updatePanelPosition();
    const handleResize = () => updatePanelPosition();
    const handleClick = (event) => {
      if (event.target.closest('[data-searchable-option-menu]')) return;
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    setSearch(value || '');
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    if (!filtered.length) {
      setHighlightIndex(-1);
      return;
    }
    const currentIndex = filtered.findIndex((item) => item.label === value);
    setHighlightIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [filtered, open, value]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const handleSelect = useCallback(
    (option) => {
      if (!option) return;
      onChange(option.label || '');
      onSelectOption?.(option);
      setSearch(option.label || '');
      setOpen(false);
    },
    [onChange, onSelectOption]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlightIndex((prev) => Math.min((prev < 0 ? -1 : prev) + 1, filtered.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlightIndex((prev) => (prev <= 0 ? 0 : prev - 1));
      } else if (event.key === 'Enter') {
        if (!open) return;
        event.preventDefault();
        const option = highlightIndex >= 0 ? filtered[highlightIndex] : filtered[0];
        if (option) handleSelect(option);
      } else if (event.key === 'Escape') {
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
      }
    },
    [filtered, handleSelect, highlightIndex, open]
  );

  const dropdownWidth = panelRect?.width || 320;

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={open ? search : value || ''}
        onChange={(event) => {
          setSearch(event.target.value);
          if (!open) setOpen(true);
          onChange(event.target.value);
        }}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={handleKeyDown}
        className={cls('w-full rounded-lg border-2 border-slate-300 px-3 py-2 pr-9', disabled && 'bg-slate-100 text-slate-500')}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cls(
          'absolute inset-y-0 right-1 flex items-center rounded-md px-2 text-slate-500 transition hover:text-slate-700 focus:outline-none',
          disabled && 'pointer-events-none text-slate-300'
        )}
        aria-label="Lista opcji"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className={cls('h-4 w-4 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && panelRect &&
        createPortal(
          <div
            data-searchable-option-menu
            className="z-50 rounded-2xl border border-slate-200 bg-white shadow-2xl text-sm"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: dropdownWidth,
              maxWidth: dropdownWidth,
              transform: 'translateY(calc(-100% - 8px))'
            }}
          >
            <div className="border-b border-slate-200 p-2">
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="Szukaj..."
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-slate-500">Brak wyników.</div>
              ) : (
                filtered.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(item);
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={cls(
                      'w-full px-3 py-2 text-left hover:bg-slate-50',
                      item.label === value && 'bg-sky-50 text-sky-700',
                      index === highlightIndex && 'bg-sky-100 text-slate-900'
                    )}
                  >
                    {item.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function DelegationCard({
  travelRequest,
  onFieldPatch,
  onSelectRegarding,
  onAddTrip,
  onTripFieldChange,
  onRemoveTrip,
  onSync,
  crmProjects,
  crmProjectsLoading,
  crmProjectsError,
  crmVehicles,
  crmVehiclesLoading,
  crmVehiclesError,
  crmConnected,
  syncLoading,
  syncError,
  readOnly,
  onDelete,
  deleteLoading
}) {
  const hasCrmTravel = !!String(travelRequest?.crmTravelId || '').trim();
  const statusLabel = getTravelStatusLabel(travelRequest);
  const statusClass = getTravelStatusClass(travelRequest);
  const statusValue = Number(travelRequest?.travelStatusValue);
  const [costsOpen, setCostsOpen] = useState(false);
  const [tripsOpen, setTripsOpen] = useState(() => Array.isArray(travelRequest?.tripEntries) && travelRequest.tripEntries.length > 0);
  const canEditDetails =
    hasCrmTravel &&
    !readOnly &&
    statusValue !== CRM_TRAVEL_STATUS.PASSED_TO_FA &&
    !travelRequest?.toAccept;
  const hasExpenseValues = ['dietCost', 'fuelCost', 'parkingCost', 'highwayCost', 'hotelCost', 'transportCost', 'additionalCost', 'foodCost', 'advanceCost'].some(
    (key) => Number(travelRequest?.[key] || 0) > 0
  );
  const tripEntries = Array.isArray(travelRequest?.tripEntries) ? travelRequest.tripEntries : [];
  const showTrips = tripsOpen;
  const citySuggestions = useMemo(() => {
    const dynamicCities = tripEntries.flatMap((entry) => [entry?.from, entry?.to]);
    return [...new Set([...COMMON_CITY_SUGGESTIONS, travelRequest?.destinationCity, ...dynamicCities].map((value) => String(value || '').trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, 'pl')
    );
  }, [travelRequest?.destinationCity, tripEntries]);

  useEffect(() => {
    if (hasExpenseValues) {
      setCostsOpen(true);
    }
  }, [hasExpenseValues]);

  return (
    <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-slate-800">
            <CarFront className="h-4 w-4 text-indigo-600" />
            <span className="font-semibold">Delegacja CRM</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Formularz delegacji dla dnia z trybem pracy <span className="font-medium text-indigo-700">Delegacja</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {travelRequest?.crmTravelNumber ? (
            <span className="inline-flex items-center rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700">
              {travelRequest.crmTravelNumber}
            </span>
          ) : null}
          <span className={cls('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', statusClass)}>
            {statusLabel}
          </span>
        </div>
      </div>

      {!crmConnected && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aby wystawić delegację, zaloguj się najpierw do CRM.
        </div>
      )}
      {crmProjectsError && (
        <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{crmProjectsError}</div>
      )}
      {crmVehiclesError && (
        <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{crmVehiclesError}</div>
      )}
      {syncError && (
        <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{syncError}</div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="text-sm text-slate-700">
          Numer delegacji
          <input value={travelRequest?.crmTravelNumber || '—'} className={FIELD} disabled />
        </label>
        <label className="text-sm text-slate-700">
          Klient
          <input
            value={travelRequest?.account?.name || ''}
            className={FIELD}
            placeholder="Klient uzupełni się po wyborze projektu lub szansy"
            disabled
          />
        </label>

        <label className="text-sm text-slate-700">
          Data początkowa
          <input
            type="date"
            value={travelRequest?.startDate || ''}
            onChange={(event) => onFieldPatch({ startDate: event.target.value })}
            className={FIELD}
            disabled={readOnly}
          />
        </label>
        <label className="text-sm text-slate-700">
          Data końcowa
          <input
            type="date"
            value={travelRequest?.endDate || ''}
            onChange={(event) => onFieldPatch({ endDate: event.target.value })}
            className={FIELD}
            disabled={readOnly}
          />
        </label>

        <label className="text-sm text-slate-700">
          Godzina rozpoczęcia
          <div>
            <TimeSelect
              value={travelRequest?.startTime || ''}
              onChange={(value) => onFieldPatch({ startTime: value })}
              disabled={readOnly}
              size="plan"
            />
          </div>
        </label>
        <label className="text-sm text-slate-700">
          Godzina zakończenia
          <div>
            <TimeSelect
              value={travelRequest?.endTime || ''}
              onChange={(value) => onFieldPatch({ endTime: value })}
              disabled={readOnly}
              size="plan"
            />
          </div>
        </label>

        <label className="text-sm text-slate-700 lg:col-span-2">
          Projekt / Szansa
          <CrmProjectSelect
            value={travelRequest?.regardingLabel || ''}
            fullValue={travelRequest?.regardingFullLabel || travelRequest?.regardingLabel || ''}
            onChange={(next) =>
              onFieldPatch({
                regardingLabel: next,
                regardingFullLabel: '',
                regarding: null,
                account: null
              })}
            onSelectOption={onSelectRegarding}
            options={crmProjects}
            disabled={readOnly}
            loading={crmProjectsLoading}
          />
        </label>

        <label className="text-sm text-slate-700">
          Samochód
          <SearchableOptionSelect
            value={travelRequest?.vehicle?.name || ''}
            onChange={(next) => {
              if (!next.trim()) {
                onFieldPatch({ vehicle: null });
              }
            }}
            onSelectOption={(selectedVehicle) =>
              onFieldPatch({
                vehicle: selectedVehicle
                  ? { id: selectedVehicle.id, logicalName: 'equipment', name: selectedVehicle.label }
                  : null
              })
            }
            options={crmVehicles}
            disabled={readOnly}
            loading={crmVehiclesLoading}
            placeholder="Wybierz samochód"
          />
        </label>

        <label className="text-sm text-slate-700">
          Miasto docelowe
          <input
            value={travelRequest?.destinationCity || ''}
            onChange={(event) => onFieldPatch({ destinationCity: event.target.value })}
            className={FIELD}
            placeholder="np. Kraków"
            disabled={readOnly}
          />
        </label>

        <label className="text-sm text-slate-700 lg:col-span-2">
          Adres docelowy
          <input
            value={travelRequest?.destinationAddress || ''}
            onChange={(event) => onFieldPatch({ destinationAddress: event.target.value })}
            className={FIELD}
            placeholder="np. adres klienta / miejsce docelowe"
            disabled={readOnly}
          />
        </label>

        <label className="text-sm text-slate-700 lg:col-span-2">
          Cel delegacji
          <input
            value={travelRequest?.purpose || ''}
            onChange={(event) => onFieldPatch({ purpose: event.target.value })}
            className={FIELD}
            placeholder="np. instalacja, uruchomienie, serwis"
            disabled={readOnly}
          />
        </label>
      </div>

      {(canEditDetails || !readOnly) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canEditDetails && (
            <>
              <button type="button" onClick={() => setTripsOpen((open) => !open)} className={BTN}>
                <CarFront className="h-4 w-4 text-indigo-600" /> {showTrips ? 'Ukryj przejazdy' : 'Dodaj przejazdy'}
              </button>
              <button type="button" onClick={() => setCostsOpen((open) => !open)} className={BTN}>
                <Briefcase className="h-4 w-4 text-indigo-600" /> {costsOpen ? 'Ukryj koszty' : 'Dodaj koszty'}
              </button>
            </>
          )}
        </div>
      )}

      {showTrips && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-medium text-slate-700">Przejazdy</div>
          <datalist id="trip-city-suggestions">
            {citySuggestions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <div className="mt-3 space-y-3">
            {tripEntries.length === 0 ? (
              canEditDetails ? (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={onAddTrip}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    title="Dodaj przejazd"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Brak dodanych przejazdów.</div>
              )
            ) : (
              tripEntries.map((entry, index) => (
                <div key={entry.id || index} className="grid grid-cols-1 gap-3 lg:grid-cols-[2.25rem_minmax(0,1fr)_auto]">
                  <div className="hidden lg:flex items-center justify-center text-indigo-600 lg:row-span-2">
                    {index % 2 === 0 ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-700">
                      Skąd
                      <input
                        list="trip-city-suggestions"
                        value={entry.from || ''}
                        onChange={(event) => onTripFieldChange(index, 'from', event.target.value)}
                        className={FIELD}
                        placeholder="np. Nowy Sącz"
                        disabled={readOnly || !!entry.crmActivityId || statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA}
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      Dokąd
                      <input
                        list="trip-city-suggestions"
                        value={entry.to || ''}
                        onChange={(event) => onTripFieldChange(index, 'to', event.target.value)}
                        className={FIELD}
                        placeholder="np. Kwidzyn"
                        disabled={readOnly || !!entry.crmActivityId || statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA}
                      />
                    </label>
                  </div>
                  <div className="flex items-end lg:row-span-2">
                    <button
                      type="button"
                      onClick={() => onRemoveTrip(index)}
                      className="rounded-lg border-2 border-slate-300 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
                      disabled={readOnly || !!entry.crmActivityId || statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:col-start-2">
                    <label className="text-sm text-slate-700">
                      Start
                      <div>
                        <TimeSelect
                          value={entry.start || ''}
                          onChange={(value) => onTripFieldChange(index, 'start', value)}
                          disabled={readOnly || !!entry.crmActivityId || statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA}
                        />
                      </div>
                    </label>
                    <label className="text-sm text-slate-700">
                      Koniec
                      <div>
                        <TimeSelect
                          value={entry.end || ''}
                          onChange={(value) => onTripFieldChange(index, 'end', value)}
                          disabled={readOnly || !!entry.crmActivityId || statusValue === CRM_TRAVEL_STATUS.PASSED_TO_FA}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ))
            )}
            {canEditDetails && tripEntries.length > 0 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={onAddTrip}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  title="Dodaj kolejny przejazd"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {costsOpen && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-medium text-slate-700">Koszty</div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {[
              ['dietCost', 'Dieta'],
              ['fuelCost', 'Paliwo'],
              ['parkingCost', 'Parking'],
              ['highwayCost', 'Autostrada'],
              ['hotelCost', 'Hotel'],
              ['transportCost', 'Transport'],
              ['additionalCost', 'Inne'],
              ['foodCost', 'Gastronomia'],
              ['advanceCost', 'Zaliczka']
            ].map(([key, label]) => (
              <label key={key} className="text-sm text-slate-700">
                {label}
                <input
                  type="text"
                  inputMode="decimal"
                  value={travelRequest?.[key] ?? ''}
                  onChange={(event) => onFieldPatch({ [key]: event.target.value })}
                  className={FIELD}
                  placeholder="0,00"
                  disabled={!canEditDetails}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={deleteLoading}
          >
            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Usuń delegację
          </button>
        )}
        <button type="button" onClick={onSync} className={BTN} disabled={readOnly || !crmConnected || syncLoading}>
          {syncLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Zapisywanie...
            </>
          ) : (
            <>
              <CarFront className="h-4 w-4 text-indigo-600" />
              {!hasCrmTravel ? 'Wystaw delegację w CRM' : canEditDetails ? 'Zapisz przejazdy i koszty' : 'Aktualizuj delegację w CRM'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const TaskRow = memo(function TaskRow({
  task,
  selected,
  onToggleSelect,
  menuRect,
  activeTaskId,
  registerAnchor,
  onToggleMenu,
  onFieldChange,
  onLock,
  onUnlock,
  onExport,
  onDelete,
  onEditStart,
  computeWorkKind,
  crmProjectsLoading,
  crmProjects,
  previousTask,
  nextTask,
  readOnly = false
}) {
  const stateKey = task._syncState || 'EDITED';
  const stateMeta = TASK_STATE_META[stateKey] || TASK_STATE_META.EDITED;
  const StateIcon = stateMeta.Icon;
  const menuOpen = activeTaskId === task.id;
  const isAbsenceType = ABSENCE_TASK_TYPES.includes(task.type);
  const workKind = isAbsenceType ? 'Zwykłe' : computeWorkKind(task);
  const isNewUnsavedTask =
    !task.locked &&
    !task.crmActivityId &&
    !String(task.subject || '').trim() &&
    !String(task.project || '').trim();
  const previousTaskEnd = isNewUnsavedTask ? '' : previousTask?.end || '';
  const nextTaskStart = nextTask?.start || '';
  const startMaxValue = task.end
    ? minutesToHHmm(Math.max(toMinutes(previousTaskEnd || '00:00'), toMinutes(task.end) - 15))
    : nextTaskStart || '';
  const endMinValue = task.start ? minutesToHHmm(toMinutes(task.start) + 15) : previousTaskEnd || '';
  const actionRef = useCallback(
    (node) => registerAnchor(task.id, node),
    [registerAnchor, task.id]
  );

  return (
    <tr
      className="border-t border-slate-200"
      data-task-row-id={task.id}
      onFocusCapture={() => !readOnly && onEditStart(task.id)}
    >
      <td className="p-2 align-middle text-center">
        <button
          type="button"
          onClick={() => !readOnly && onToggleSelect(task.id)}
          className={cls(
            'inline-flex items-center justify-center h-6 w-6 rounded-full border-2 transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-400 focus:ring-offset-2',
            selected
              ? 'border-sky-500 bg-sky-50 text-sky-600 shadow-md'
              : 'border-slate-300 bg-slate-100 text-slate-400 hover:border-sky-300 hover:bg-slate-50 hover:shadow-md'
          )}
          aria-pressed={selected}
          aria-label={selected ? 'Odznacz zadanie' : 'Zaznacz zadanie'}
          disabled={readOnly}
        >
          {selected ? <Check className="w-3 h-3" /> : <span className="block h-2 w-2 rounded-full bg-slate-400" />}
        </button>
      </td>
      <td className="p-2">
        <TaskTypeChooser value={task.type} onChange={(value) => onFieldChange(task.id, { type: value })} disabled={readOnly || task.locked} />
      </td>
      <td className="p-2 min-w-[305px]">
        <input
          value={task.subject}
          onChange={(e) => onFieldChange(task.id, { subject: e.target.value })}
          className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
          placeholder="np. Raport"
          disabled={readOnly || task.locked || isAbsenceType}
        />
      </td>
      <td className="p-2 min-w-[150px]">
        <CrmProjectSelect
          value={task.project}
          fullValue={task.projectFullLabel || task.crmRegarding?.label || task.project}
          onChange={(next) =>
            onFieldChange(task.id, {
              project: next,
              projectFullLabel: '',
              crmRegarding: null
            })}
          onSelectOption={(option, label) => {
            const customerName = option.customerName || option.titleCustomer || '';
            const kpName = option.ownerName || '';
            onFieldChange(task.id, {
              project: label,
              projectFullLabel: option.label || label,
              client: customerName,
              kp: kpName,
              crmRegarding: {
                id: String(option.category === 'opportunity' ? option.opportunityId || option.id : option.id)
                  .replace(/^opportunity:/, '')
                  .trim(),
                logicalName: option.category === 'opportunity' ? 'opportunity' : 'itarapro_project',
                name:
                  option.category === 'opportunity'
                    ? option.opportunityName || option.label
                    : option.displayTitle || option.label,
                label
              }
            });
          }}
          options={crmProjects}
          disabled={readOnly || task.locked || isAbsenceType}
          loading={crmProjectsLoading}
        />
      </td>
      <td className="p-2">
        <TimeSelect
          value={task.start}
          onChange={(value) => onFieldChange(task.id, { start: value })}
          disabled={readOnly || task.locked || isAbsenceType}
          minValue={previousTaskEnd}
          maxValue={startMaxValue}
        />
      </td>
      <td className="p-2">
        <TimeSelect
          value={task.end}
          onChange={(value) => onFieldChange(task.id, { end: value })}
          disabled={readOnly || task.locked || isAbsenceType}
          minValue={endMinValue}
          maxValue={nextTaskStart}
        />
      </td>
      <td className="p-2">
        {task.type === 'Przejazd' ? (
          <span className={`${CHIP} w-20 justify-center bg-violet-50 border-violet-300 text-violet-800`} title="Przejazd">
            <CarFront className="h-4 w-4" />
          </span>
        ) : (
          <span className={`${CHIP} w-20 justify-center ${WORKKIND_STYLES[workKind]}`}>{workKind}</span>
        )}
      </td>
      <td className="p-2">
        <StatusChooser
          value={task.status || 'Planowane'}
          onChange={(value) => onFieldChange(task.id, { status: value })}
          disabled={readOnly || task.locked || isAbsenceType}
        />
      </td>
      <td className="p-2">
        <span
          className={cls(
            'inline-flex items-center justify-center h-7 w-7 rounded-full border',
            stateMeta.className
          )}
          title={stateMeta.label}
        >
          <StateIcon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </td>
      <td className="relative p-2 text-right">
        <button
          ref={actionRef}
          onClick={() => !readOnly && onToggleMenu(task.id)}
          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50"
          title="Akcje"
          disabled={readOnly}
        >
          <Settings className="w-4 h-4" />
        </button>
        {menuOpen && menuRect &&
          createPortal(
            <div
              data-task-actions-menu
              className="z-50 w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl p-1 text-sm"
              style={{ position: 'fixed', top: menuRect.top - 12, left: menuRect.right, transform: 'translate(-100%, -100%)' }}
            >
              <button
                data-task-actions-menu
                onClick={() => onLock(task.id)}
                disabled={!!task.locked}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <Save className="w-4 h-4" /> Zapisz
              </button>
              <button
                data-task-actions-menu
                onClick={() => onUnlock(task.id)}
                disabled={!task.locked}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <Pencil className="w-4 h-4" /> Edytuj
              </button>
              <button
                data-task-actions-menu
                onClick={(event) => onExport(task, event.currentTarget)}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <CalendarPlus className="w-4 h-4" /> Do Outlooka
              </button>
            </div>,
            document.body
          )}
      </td>
    </tr>
  );
});

function PickerSection({ title, icon: IconComponent, count, items, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const ordered = useMemo(() => {
    const selected = items.find((i) => i.id === selectedId);
    const rest = items.filter((i) => i.id !== selectedId);
    return selected ? [selected, ...rest] : items;
  }, [items, selectedId]);
  const visible = open ? ordered : ordered.slice(0, 1);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <IconComponent className="w-4 h-4" /> {title}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{count}</span>
          {items.length > 1 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-full border-2 border-slate-300 p-1.5 hover:bg-slate-50"
              aria-label={open ? 'Zwiń' : 'Rozwiń'}
            >
              <ChevronDown className={cls('w-4 h-4 transition-transform', open && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>
      <div className={cls(open ? 'space-y-2' : '')}>
        {visible.map((item) => {
          const active = item.id === selectedId;
          return (
            <div
              key={item.id}
              className={cls(
                'rounded-xl border-2 px-3 py-2 transition-colors',
                active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'
              )}
            >
              <button
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="w-full text-left text-base"
              >
                <div className="font-medium">{item.name}</div>
                {item.subtitle && (
                  <div className={cls('text-xs', active ? 'text-slate-200' : 'text-slate-500')}>{item.subtitle}</div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeCalendar({ monthStart, selectedDate, setSelectedDate, statusByDate, modeByDate }) {
  const { cells, todayKey } = useMemo(() => {
    const y = monthStart.getFullYear();
    const m = monthStart.getMonth();
    const first = new Date(y, m, 1);
    const start = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const dimPrev = new Date(y, m, 0).getDate();

    const generated = [];
    for (let i = start; i > 0; i--) generated.push({ d: new Date(y, m - 1, dimPrev - i + 1), outside: true });
    for (let i = 1; i <= dim; i++) generated.push({ d: new Date(y, m, i), outside: false });
    let next = 1;
    while (generated.length % 7) generated.push({ d: new Date(y, m + 1, next++), outside: true });

    return { cells: generated, todayKey: ymd(new Date()) };
  }, [monthStart]);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 text-xs text-slate-500 mb-1">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="px-1 py-1 text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ d, outside }, idx) => {
          const key = ymd(d);
          const selected = ymd(selectedDate) === key;
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const raw = statusByDate[key] || 'NONE';
          const status = raw === 'SENT' ? 'PLANNED' : raw;
          const mode = modeByDate[key];
          const holiday = isPublicHoliday(d);
          const planned = 'bg-sky-100 border-sky-300 text-slate-900';
          const settled = 'bg-emerald-100 border-emerald-500 text-emerald-900';
          const absence = 'bg-red-100 border-red-500 text-red-900';
          const weekendCls = 'bg-slate-200 border-slate-300 text-slate-700';
          const holidayCls = 'bg-orange-100 border-orange-400 text-orange-900';
          const none = `bg-white border-slate-300 ${outside ? 'text-slate-300' : ''}`;
          let tile = none;
          if (holiday) tile = holidayCls;
          else if (weekend) tile = weekendCls;
          else {
            if (status === 'SETTLED') tile = settled;
            else if (status === 'PLANNED') tile = planned;
          }
          if (
            (mode === 'VACATION' || mode === 'SICK' || mode === 'ABSENCE') &&
            (status === 'PLANNED' || status === 'SETTLED') &&
            !holiday
          ) {
            tile = absence;
          }
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(d)}
              className={cls(
                'relative aspect-square grid place-items-center rounded-lg border-2 text-sm transition-all',
                tile,
                selected && 'ring-2 ring-slate-900 ring-offset-2'
              )}
            >
              <span className="font-medium">{d.getDate()}</span>
              {key === todayKey && !selected && (
                <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-emerald-500 ring-offset-2" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[6px] bg-sky-50 border border-sky-300" /> Zaplanowany
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[6px] bg-emerald-100 border-emerald-500" /> Rozliczony
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[6px] bg-orange-100 border border-orange-400" /> Święto
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-red-500 bg-red-200" /> Nieobecność
        </span>
      </div>
    </div>
  );
}

export default function EmployeePanel({ employeeProfile = null, onEmployeeProfileChange = null, onRequireLogin = null }) {
  const {
    managers,
    employees,
    loading: loadingDirectory,
    error: directoryError,
    refresh: refreshDirectory
  } = useManagersAndEmployees({ fetchManagers, fetchEmployees });
  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [plansByDate, setPlansByDate] = useState({});
  const [monthlyLogs, setMonthlyLogs] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState(null);

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [planCollapsed, setPlanCollapsed] = useState(true);
  const [taskActionsMenu, setTaskActionsMenu] = useState({ id: null, rect: null });
  const taskActionRefs = useRef({});
  const [outlookMenu, setOutlookMenu] = useState({ task: null, anchor: null });
  const [splitPrompt, setSplitPrompt] = useState(null);
  const [splitProcessing, setSplitProcessing] = useState(false);
  const [sendingPlan, setSendingPlan] = useState(false);
  const [sendingTasks, setSendingTasks] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef(null);
  const [crmModalOpen, setCrmModalOpen] = useState(false);
  const [crmCredentials, setCrmCredentials] = useState({ login: '', password: '' });
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState('');
  const [crmConnected, setCrmConnected] = useState(false);
  const [crmUser, setCrmUser] = useState(null);
  const [crmProjects, setCrmProjects] = useState([]);
  const [crmProjectsLoading, setCrmProjectsLoading] = useState(false);
  const [crmProjectsError, setCrmProjectsError] = useState('');
  const [crmVehicles, setCrmVehicles] = useState([]);
  const [crmVehiclesLoading, setCrmVehiclesLoading] = useState(false);
  const [crmVehiclesError, setCrmVehiclesError] = useState('');
  const [crmImportingTasks, setCrmImportingTasks] = useState(false);
  const [crmAbsencesOpen, setCrmAbsencesOpen] = useState(false);
  const [crmAbsencesLoading, setCrmAbsencesLoading] = useState(false);
  const [crmAbsencesError, setCrmAbsencesError] = useState('');
  const [crmAbsences, setCrmAbsences] = useState([]);
  const [crmTravelSaving, setCrmTravelSaving] = useState(false);
  const [crmTravelError, setCrmTravelError] = useState('');
  const [crmTravelDeleting, setCrmTravelDeleting] = useState(false);
  const fixedEmployeeProfile = !!employeeProfile?.id;
  const ownEmployeeId = employeeProfile?.id || null;
  const ownSelectionInitializedRef = useRef(false);
  const refreshCrmProjects = useCallback(async () => {
    if (!crmConnected) {
      setCrmProjects([]);
      setCrmProjectsError('');
      setCrmProjectsLoading(false);
      return;
    }
    setCrmProjectsLoading(true);
    setCrmProjectsError('');
    try {
      const items = await fetchCrmProjects(null, CRM_SESSION_SCOPE);
      setCrmProjects(items);
    } catch (err) {
      setCrmProjects([]);
      setCrmProjectsError(err instanceof Error ? err.message : String(err));
    } finally {
      setCrmProjectsLoading(false);
    }
  }, [crmConnected]);

  const handleCrmSubmit = useCallback(
    async (event) => {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (crmLoading) return;
      setCrmError('');
      const trimmedLogin = crmCredentials.login.trim();
      if (!trimmedLogin || !crmCredentials.password) {
        setCrmError('Wypełnij wszystkie pola');
        return;
      }
      setCrmLoading(true);
      try {
        const response = await fetch(`${CRM_PROXY_URL}/crm/login`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            scope: CRM_SESSION_SCOPE,
            login: trimmedLogin,
            password: crmCredentials.password,
            domain: CRM_FIXED_DOMAIN
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            (payload && typeof payload.error === 'string' && payload.error.trim()) ||
            `Połączenie z CRM nie powiodło się (status ${response.status}).`;
          throw new Error(message);
        }
        setCrmConnected(true);
        setCrmUser({
          login: payload?.user || trimmedLogin,
          domain: CRM_FIXED_DOMAIN
        });
        setCrmCredentials((prev) => ({ ...prev, password: '' }));
        setCrmError('');
        setCrmModalOpen(false);
      } catch (err) {
        setCrmConnected(false);
        setCrmUser(null);
        setCrmProjects([]);
        setCrmVehicles([]);
        setCrmAbsences([]);
        if (err instanceof Error) {
          const details = typeof err.message === 'string' ? err.message : '';
          const isNetworkIssue = err.name === 'TypeError' || details.includes('Failed to fetch');
          setCrmError(isNetworkIssue ? 'Brak połączenia z serwerem integracji CRM.' : details || 'Połączenie z CRM nie powiodło się.');
        } else {
          setCrmError('Połączenie z CRM nie powiodło się.');
        }
      } finally {
        setCrmLoading(false);
      }
    },
    [crmCredentials, crmLoading]
  );

  const handleCrmLogout = useCallback(async () => {
    try {
      await fetch(`${CRM_PROXY_URL}/crm/session/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scope: CRM_SESSION_SCOPE
        })
      });
    } catch {
      /* ignore logout transport errors and clear local state */
    } finally {
      setActionsMenuOpen(false);
      setCrmModalOpen(false);
      setCrmAbsencesOpen(false);
      setCrmConnected(false);
      setCrmUser(null);
      setCrmProjects([]);
      setCrmVehicles([]);
      setCrmAbsences([]);
      setCrmAbsencesError('');
      setCrmAbsencesLoading(false);
      setCrmProjectsError('');
      setCrmVehiclesError('');
      setCrmVehiclesLoading(false);
      setCrmLoading(false);
      setCrmError('');
      setCrmTravelSaving(false);
      setCrmTravelError('');
      setCrmCredentials((prev) => ({ ...prev, password: '' }));
      if (typeof onRequireLogin === 'function') {
        onRequireLogin();
      }
    }
  }, [onRequireLogin]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${CRM_PROXY_URL}/crm/session/status?scope=${encodeURIComponent(CRM_SESSION_SCOPE)}`, {
          credentials: 'include'
        });
        const payload = await response.json().catch(() => null);
        if (!active || !response.ok) return;
        if (payload?.connected) {
          setCrmConnected(true);
          setCrmUser({
            login: payload?.user || '',
            domain: payload?.domain || CRM_FIXED_DOMAIN
          });
        } else {
          setCrmConnected(false);
          setCrmUser(null);
        }
      } catch {
        if (!active) return;
        setCrmConnected(false);
        setCrmUser(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLoadingInitial(loadingDirectory);
  }, [loadingDirectory]);

  useEffect(() => {
    if (directoryError) setError(directoryError);
  }, [directoryError]);

  useEffect(() => {
    ownSelectionInitializedRef.current = false;
  }, [employeeProfile?.id]);

  useEffect(() => {
    if (!fixedEmployeeProfile || ownSelectionInitializedRef.current) {
      return;
    }
    const resolvedManager = managers.find((manager) => manager.id === employeeProfile?.managerId) || null;
    const ownEmployee = employees.find((employee) => employee.id === employeeProfile?.id) || employeeProfile || null;
    if (!resolvedManager?.id || !ownEmployee?.id) {
      return;
    }
    ownSelectionInitializedRef.current = true;
    setSelectedManager(resolvedManager);
    setSelectedEmployee(ownEmployee);
  }, [employeeProfile, employees, fixedEmployeeProfile, managers]);

  useEffect(() => {
    if (fixedEmployeeProfile) {
      const resolvedManager = managers.find((manager) => manager.id === employeeProfile?.managerId) || null;
      if (!selectedManager?.id && resolvedManager?.id) {
        setSelectedManager(resolvedManager);
      }
      return;
    }
    if (!selectedManager && managers.length) {
      setSelectedManager(managers[0]);
    }
  }, [employeeProfile?.managerId, fixedEmployeeProfile, managers, selectedManager]);

  useEffect(() => {
    if (fixedEmployeeProfile) {
      const ownEmployee = employees.find((employee) => employee.id === employeeProfile?.id) || employeeProfile || null;
      if (!selectedEmployee?.id && ownEmployee?.id) {
        setSelectedEmployee(ownEmployee);
        return;
      }
      if (
        typeof onEmployeeProfileChange === 'function' &&
        ownEmployee?.id &&
        JSON.stringify(ownEmployee) !== JSON.stringify(employeeProfile)
      ) {
        onEmployeeProfileChange(ownEmployee);
      }
      if (!selectedManager) {
        setSelectedEmployee(null);
        return;
      }
      return;
    }
    if (!selectedManager) {
      setSelectedEmployee(null);
      return;
    }
    const managed = employees.filter((e) => e.managerId === selectedManager.id);
    if (!managed.length) {
      setSelectedEmployee(null);
      return;
    }
    if (!selectedEmployee || selectedEmployee.managerId !== selectedManager.id) {
      setSelectedEmployee(managed[0]);
    }
  }, [employeeProfile, employees, fixedEmployeeProfile, onEmployeeProfileChange, selectedEmployee?.id, selectedManager?.id]);

  const {
    plansByDate: hookPlansByDate,
    logs: hookLogs,
    loading: hookLoading,
    error: hookError,
    refresh: refreshEmployeePlans
  } = useEmployeePlans(
    selectedEmployee?.id,
    {
      fetchPlans: fetchPlansForEmployee,
      fetchLogs: fetchMonthlyLogs
    }
  );

  useEffect(() => {
    if (selectedEmployee?.id) {
      const cachedPlans = readPlanCache(EMPLOYEE_PLAN_CACHE_PREFIX, selectedEmployee.id);
      if (cachedPlans) {
        setPlansByDate(cachedPlans);
      } else {
        setPlansByDate({});
      }
      setMonthlyLogs([]);
      setLoadingPlans(true);
    }
  }, [selectedEmployee?.id]);

  useEffect(() => {
    if (selectedEmployee?.id) {
      setPlansByDate((prev) => (deepEqual(prev, hookPlansByDate) ? prev : hookPlansByDate));
      writePlanCache(EMPLOYEE_PLAN_CACHE_PREFIX, selectedEmployee.id, hookPlansByDate);
      setMonthlyLogs((prev) => (deepEqual(prev, hookLogs) ? prev : hookLogs));
      setLoadingPlans(hookLoading);
      setError(hookError);
    } else {
      setPlansByDate({});
      setMonthlyLogs([]);
      setLoadingPlans(false);
    }
  }, [selectedEmployee?.id, hookPlansByDate, hookLogs, hookLoading, hookError]);

  const dKey = ymd(selectedDate);

  useEffect(() => {
    let active = true;
    if (!selectedEmployee) return () => undefined;
    (async () => {
      try {
        const plan = await fetchPlanById(planIdFor(selectedEmployee.id, dKey));
        if (!active) return;
        setPlansByDate((prev) => {
          if (plan) {
            const current = prev[plan.date];
            if (current && deepEqual(current, plan)) return prev;
            if (!current && !plan) return prev;
            const next = { ...prev, [plan.date]: plan };
            return next;
          }
          if (!prev[dKey]) return prev;
          const next = { ...prev };
          delete next[dKey];
          return next;
        });
      } catch (err) {
        if (!active) return;
        if (!String(err.message || '').includes('404')) setError(err.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedEmployee?.id, dKey]);

  useEffect(() => {
    if (!crmConnected) {
      setCrmProjects([]);
      setCrmVehicles([]);
      setCrmProjectsError('');
      setCrmProjectsLoading(false);
      setCrmVehiclesError('');
      setCrmVehiclesLoading(false);
      setCrmAbsences([]);
      setCrmAbsencesError('');
      setCrmAbsencesLoading(false);
      setCrmTravelError('');
      return;
    }
    refreshCrmProjects();
  }, [crmConnected, refreshCrmProjects]);

  useEffect(() => {
    let active = true;
    if (!crmConnected) return () => undefined;
    setCrmVehiclesLoading(true);
    setCrmVehiclesError('');
    (async () => {
      try {
        const items = await fetchCrmVehicles(null, CRM_SESSION_SCOPE);
        if (!active) return;
        setCrmVehicles(items);
      } catch (err) {
        if (!active) return;
        setCrmVehicles([]);
        setCrmVehiclesError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setCrmVehiclesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [crmConnected]);

  const openCrmAbsences = useCallback(async () => {
    setActionsMenuOpen(false);
    setCrmAbsencesOpen(true);

    if (!crmConnected) {
      setCrmAbsences([]);
      setCrmAbsencesError('Najpierw połącz się z CRM.');
      return;
    }
    if (!selectedEmployee?.name) {
      setCrmAbsences([]);
      setCrmAbsencesError('Nie wybrano pracownika.');
      return;
    }

    setCrmAbsencesLoading(true);
    setCrmAbsencesError('');
    try {
      const items = await fetchCrmAbsencesForEmployee({
        ownerName: selectedEmployee.name,
        crmScope: CRM_SESSION_SCOPE
      });
      setCrmAbsences(items);
    } catch (err) {
      setCrmAbsences([]);
      setCrmAbsencesError(err instanceof Error ? err.message : String(err));
    } finally {
      setCrmAbsencesLoading(false);
    }
  }, [crmConnected, selectedEmployee?.name]);

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const handleClickOutside = (event) => {
      if (actionsMenuRef.current && actionsMenuRef.current.contains(event.target)) return;
      setActionsMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setActionsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!taskActionsMenu.id) return;

    const updatePosition = () => {
      const anchor = taskActionRefs.current[taskActionsMenu.id];
      if (!anchor) {
        setTaskActionsMenu({ id: null, rect: null });
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setTaskActionsMenu((prev) => (prev.id ? { id: prev.id, rect } : prev));
    };

    const handleClick = (event) => {
      if (
        event.target.closest('[data-task-actions-menu]') ||
        event.target.closest('[data-outlook-options-menu]')
      ) {
        return;
      }
      const anchor = taskActionRefs.current[taskActionsMenu.id];
      if (anchor && anchor.contains(event.target)) return;
      setTaskActionsMenu({ id: null, rect: null });
    };

    const handleScroll = () => setTaskActionsMenu({ id: null, rect: null });

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [taskActionsMenu.id]);

  useEffect(() => {
    if (!taskActionsMenu.id) {
      setOutlookMenu({ task: null, anchor: null });
    }
  }, [taskActionsMenu.id]);

  useEffect(() => {
    if (!outlookMenu.task) return;

    const handleClickOutside = (event) => {
      if (event.target.closest('[data-outlook-options-menu]')) return;
      setOutlookMenu({ task: null, anchor: null });
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOutlookMenu({ task: null, anchor: null });
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [outlookMenu.task]);

  const sentDay = selectedEmployee ? plansByDate[dKey] || null : null;

  const managedList = useMemo(
    () =>
      employees
        .filter((e) => e.managerId === selectedManager?.id)
        .map((e) => ({ id: e.id, name: e.name, subtitle: `${e.role} • ${e.employmentType}` })),
    [employees, selectedManager?.id]
  );
  const isViewingOwnProfile = !ownEmployeeId || selectedEmployee?.id === ownEmployeeId;

  const createDraft = (plan) =>
    plan
      ? { ...plan, dirty: false }
      : { id: null, shifts: [], note: '', travelRequest: null, dirty: false };

  const [draftDay, setDraftDay] = useState(createDraft(sentDay));
  useEffect(() => {
    const nextDraft = createDraft(sentDay);
    setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
  }, [selectedEmployee?.id, dKey, sentDay]);
  useEffect(() => {
    setPlanCollapsed(true);
  }, [selectedEmployee?.id, dKey]);

  const shifts = draftDay.shifts || [];
  const travelShifts = useMemo(
    () => shifts.filter((shift) => (shift.mode || '') === 'TRAVEL'),
    [shifts]
  );
  const hasTravelShift = travelShifts.length > 0;
  const travelWindow = useMemo(() => {
    const source = travelShifts.length ? travelShifts : shifts;
    const ordered = source
      .filter((shift) => shift?.start && shift?.end)
      .slice()
      .sort((left, right) => toMinutes(left.start) - toMinutes(right.start));
    return {
      start: ordered[0]?.start || '',
      end: ordered[ordered.length - 1]?.end || ''
    };
  }, [shifts, travelShifts]);
  const planned = shifts.reduce((acc, s) => acc + (toMinutes(s.end) - toMinutes(s.start)), 0);
  const spanStart = shifts.map((s) => s.start).filter(Boolean).sort()[0];
  const spanEnd = shifts.map((s) => s.end).filter(Boolean).sort().slice(-1)[0];
  const dayStatus = draftDay.dirty ? 'EDITED' : sentDay ? 'SENT' : 'NONE';
  const wkOf = (task) => (ABSENCE_TASK_TYPES.includes(task.type) ? 'Zwykłe' : computeWorkKindFor(task, selectedDate, shifts));
  const planSignature = useMemo(
    () =>
      JSON.stringify(
        (shifts || []).map((shift) => ({
          mode: shift?.mode || 'OFFICE',
          start: shift?.start || '',
          end: shift?.end || ''
        }))
      ),
    [shifts]
  );
  const planContextRef = useRef({ signature: null, employeeId: null, dateKey: null });
  const planAdjustmentAlertRef = useRef({ signature: null, shown: false });
  const taskAdjustmentCacheRef = useRef(new Map());
  const adjustmentPreferencesRef = useRef(new Map());
  const viewContextRef = useRef({ employeeId: null, dateKey: null });
  useEffect(() => {
    viewContextRef.current = {
      employeeId: selectedEmployee?.id ?? null,
      dateKey: dKey
    };
  }, [selectedEmployee?.id, dKey]);
  useEffect(() => {
    if (!planSignature) return;
    if (!adjustmentPreferencesRef.current.has(planSignature)) {
      adjustmentPreferencesRef.current.set(planSignature, { split: null, merge: null });
    }
  }, [planSignature]);
  const isStaleContext = useCallback(
    (ctx) => {
      const current = viewContextRef.current;
      return current.employeeId !== ctx.employeeId || current.dateKey !== ctx.dateKey;
    },
    []
  );
  useEffect(() => {
    editingTaskIdRef.current = null;
    setSelectedTaskIds([]);
    setTaskActionsMenu({ id: null, rect: null });
    setOutlookMenu({ task: null, anchor: null });
    setSplitPrompt(null);
    setSplitProcessing(false);
    setCrmTravelError('');
  }, [selectedEmployee?.id, dKey]);

  useEffect(() => {
    if (!hasTravelShift) return;
    setDraftDay((prev) => {
      const currentTravel = prev.travelRequest || {};
      const nextTravel = {
        ...currentTravel,
        startDate: currentTravel.startDate || dKey,
        endDate: currentTravel.endDate || dKey,
        startTime: currentTravel.startTime || '08:00',
        endTime: currentTravel.endTime || '16:00',
        toAccept: typeof currentTravel.toAccept === 'boolean' ? currentTravel.toAccept : true,
        travelStatusValue: currentTravel.travelStatusValue || CRM_TRAVEL_STATUS.IN_PROGRESS,
        tripEntries: Array.isArray(currentTravel.tripEntries) ? currentTravel.tripEntries.map(normalizeTripEntry) : []
      };
      if (deepEqual(currentTravel, nextTravel)) return prev;
      return { ...prev, travelRequest: nextTravel };
    });
  }, [dKey, hasTravelShift]);

  useEffect(() => {
    setSubDraft((prev) => {
      const nextItems = mergeTravelTripTasks(prev.items || [], getPersistedTravelRequest(draftDay.travelRequest));
      if (deepEqual(prev.items || [], nextItems)) return prev;
      return {
        ...prev,
        dayStatus: computeDayStatus(nextItems, planned),
        items: nextItems
      };
    });
  }, [draftDay.travelRequest, planned]);

  const reconcileTasksAfterPlanChange = useCallback(
    (items) => {
      const planStartMinutesSpan = spanStart ? toMinutes(spanStart) : null;
      const planEndMinutesSpan = spanEnd ? toMinutes(spanEnd) : null;
      const NIGHT_BOUNDARY = 22 * 60;
      const NIGHT_EARLY_BOUNDARY = 6 * 60;

      let changed = false;
      const messages = [];
      let sequence = Date.now();

      const computeKind = (task) =>
        ABSENCE_TASK_TYPES.includes(task.type) ? 'Zwykłe' : computeWorkKindFor(task, selectedDate, shifts);
      const formatRange = (start, end) => `${start || '—'}–${end || '—'}`;

      const segmented = [];

      (items || []).forEach((task) => {
        if (!task) return;
        if (task.type === 'Przejazd') {
          const wk = computeKind(task);
          if ((task.workKind || '') !== wk) {
            changed = true;
            segmented.push({ ...task, workKind: wk });
          } else {
            segmented.push(task);
          }
          return;
        }
        if (!task.start || !task.end) {
          const wk = computeKind(task);
          if ((task.workKind || '') !== wk) {
            changed = true;
            segmented.push({ ...task, workKind: wk });
          } else {
            segmented.push(task);
          }
          return;
        }

        const startMinutes = toMinutes(task.start);
        const endMinutes = toMinutes(task.end);
        const hasValidSpan =
          Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && startMinutes < endMinutes;

        if (!hasValidSpan) {
          const wk = computeKind(task);
          if ((task.workKind || '') !== wk) {
            changed = true;
            segmented.push({ ...task, workKind: wk });
          } else {
            segmented.push(task);
          }
          return;
        }

        const boundarySet = new Set();
        if (
          Number.isFinite(planStartMinutesSpan) &&
          startMinutes < planStartMinutesSpan &&
          endMinutes > planStartMinutesSpan
        ) {
          boundarySet.add(planStartMinutesSpan);
        }
        if (
          Number.isFinite(planEndMinutesSpan) &&
          startMinutes < planEndMinutesSpan &&
          endMinutes > planEndMinutesSpan
        ) {
          boundarySet.add(planEndMinutesSpan);
        }
        if (startMinutes < NIGHT_EARLY_BOUNDARY && endMinutes > NIGHT_EARLY_BOUNDARY) {
          boundarySet.add(NIGHT_EARLY_BOUNDARY);
        }
        if (startMinutes < NIGHT_BOUNDARY && endMinutes > NIGHT_BOUNDARY) {
          boundarySet.add(NIGHT_BOUNDARY);
        }

        const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);
        let segmentStart = startMinutes;
        const rawSegments = [];

        sortedBoundaries.forEach((boundary) => {
          if (boundary <= segmentStart || boundary >= endMinutes) return;
          rawSegments.push([segmentStart, boundary]);
          segmentStart = boundary;
        });
        rawSegments.push([segmentStart, endMinutes]);

        let segmentTasks = rawSegments
          .filter(([segStart, segEnd]) => segEnd > segStart)
          .map(([segStart, segEnd], idx) => {
            const startLabel = minutesToHHmm(segStart);
            const endLabel = minutesToHHmm(segEnd);
            const baseTask = {
              ...task,
              id: idx === 0 ? task.id : `t${sequence + idx}`,
              start: startLabel,
              end: endLabel,
              locked: idx === 0 ? task.locked : false
            };
            const wk = computeKind(baseTask);
            return { ...baseTask, workKind: wk };
          });

        if (segmentTasks.length > 1) {
          const baseKind = computeKind(task);
          const requiresSplit = segmentTasks.some((seg) => (seg.workKind || baseKind) !== baseKind);
          const summary = segmentTasks
            .map((seg) => `• ${formatRange(seg.start, seg.end)} (${seg.workKind})`)
            .join('\n');
          const prefs = adjustmentPreferencesRef.current.get(planSignature) || { split: null, merge: null };
          let shouldSplit = prefs.split;
          if (requiresSplit) {
            shouldSplit = true;
          } else if (shouldSplit === null) {
            shouldSplit = typeof window !== 'undefined'
              ? window.confirm(
                  [
                    'Zmieniony plan sugeruje podział zadania na kilka odcinków:',
                    summary,
                    '',
                    'Czy chcesz rozdzielić zadanie zgodnie z nowym planem?'
                  ].join('\n')
                )
              : true;
            adjustmentPreferencesRef.current.set(planSignature, { ...prefs, split: shouldSplit });
          }
          if (shouldSplit) {
            changed = true;
            messages.push(
              `Zadanie ${formatRange(task.start, task.end)} dostosowano do nowego planu:\n${summary}`
            );
          } else {
            const fallbackTask = { ...task };
            const fallbackKind = computeKind(fallbackTask);
            if ((fallbackTask.workKind || '') !== fallbackKind) {
              fallbackTask.workKind = fallbackKind;
              changed = true;
            }
            segmentTasks = [fallbackTask];
          }
        }

        if (segmentTasks.length === 1 && segmentTasks[0]) {
          const seg = segmentTasks[0];
          if (
            seg.start !== task.start ||
            seg.end !== task.end ||
            (task.workKind || '') !== seg.workKind
          ) {
            changed = true;
          }
        }

        sequence += segmentTasks.length;
        segmented.push(...segmentTasks);
      });

      const finalItems = segmented
        .slice()
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        .map((task) => {
          const wk = computeKind(task);
          if ((task.workKind || '') !== wk) {
            changed = true;
            return { ...task, workKind: wk };
          }
          return task;
        });

      return { changed, items: finalItems, messages };
    },
    [selectedDate, shifts, spanStart, spanEnd]
  );

  const persistTaskDraft = useCallback(
    async (items) => {
      const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
      if (!selectedEmployee) return null;
      setError(null);
      const planId = sentDay?.id || planIdFor(selectedEmployee.id, dKey);
      const basePlan = sentDay
        ? sanitizePlan(sentDay)
        : {
            id: planId,
            employeeId: selectedEmployee.id,
            date: dKey,
            shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
            note: draftDay.note || '',
            travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
            sent: false,
            sentAt: null,
            logs: []
          };

      const existingSubmission = basePlan.submission ? { ...basePlan.submission } : {};
      const itemStates = pruneEmptyTaskDrafts(items || []);
      const hasSentTasks = itemStates.some((task) => task._syncState === 'SENT');
      const targetStatus = hasSentTasks ? 'SUBMITTED' : 'DRAFT';
      const now = new Date().toISOString();
      const normalizedItems = normalizeTaskStates(
        itemStates,
        targetStatus === 'SUBMITTED' ? 'SENT' : 'DRAFT'
      );
      const submissionPayload = {
        ...existingSubmission,
        items: normalizedItems,
        status: targetStatus,
        submittedAt:
          targetStatus === 'SUBMITTED'
            ? existingSubmission.submittedAt || now
            : null,
        reportedMinutes: computeReported(itemStates),
        dayStatus: computeDayStatus(itemStates, planned),
        updatedAt: now
      };

      const payload = {
        ...basePlan,
        id: planId,
        employeeId: selectedEmployee.id,
        date: dKey,
        shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
        note: draftDay.note || '',
        travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
        submission: {
          ...submissionPayload,
          items: submissionPayload.items.map(({ _syncState, ...rest }) => rest)
        }
      };

      try {
        const saved = await savePlan(payload);
        setPlansByDate((prev) => {
          const current = prev[dKey];
          if (current && deepEqual(current, saved)) return prev;
          return { ...prev, [dKey]: saved };
        });
        const nextSubmission = saved?.submission || submissionPayload;
        const finalStatus = (() => {
          if (!nextSubmission.items?.length) return 'DRAFT';
          const hasSent = nextSubmission.items.some(
            (task) => task.locked || task._syncState === 'SENT'
          );
          return hasSent ? 'SUBMITTED' : 'DRAFT';
        })();
        const result = {
          ...nextSubmission,
          status: finalStatus,
          items: normalizeTaskStates(
            nextSubmission.items,
            finalStatus === 'SUBMITTED' ? 'SENT' : 'DRAFT'
          )
        };
        if (isStaleContext(requestContext)) return null;
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [selectedEmployee?.id, sentDay, dKey, draftDay.shifts, draftDay.note, draftDay.travelRequest, planned, setPlansByDate, isStaleContext]
  );
  const outlookAnchorRect = outlookMenu.anchor ? outlookMenu.anchor.getBoundingClientRect() : null;

  const addSegment = () =>
    setDraftDay((prev) => {
      const prevShifts = prev.shifts || [];
      const totalMinutes = prevShifts.reduce(
        (acc, seg) => acc + Math.max(0, toMinutes(seg.end) - toMinutes(seg.start)),
        0
      );
      const remaining = 480 - totalMinutes;
      if (remaining <= 0) return prev;

      const last = prevShifts[prevShifts.length - 1];
      const defaultStart = last ? last.end || '08:00' : '';
      let segment = { mode: 'OFFICE', start: defaultStart, end: '' };

      if (defaultStart) {
        const startMinutes = toMinutes(defaultStart);
        const endMinutes = Math.min(startMinutes + Math.min(remaining, 240), 24 * 60);
        segment = {
          ...segment,
          end: minutesToHHmm(endMinutes)
        };
      }

      return { ...prev, shifts: [...prevShifts, segment], dirty: true };
    });

  const delSegment = (idx) =>
    setDraftDay((prev) => ({
      ...prev,
      shifts: (prev.shifts || []).filter((_, i) => i !== idx),
      dirty: true
    }));

  const setSegField = (idx, field, value) =>
    setDraftDay((prev) => {
      const next = (prev.shifts || []).map((shift, i) => {
        if (i !== idx) return shift;
        const updated = { ...shift, [field]: value };
        if (field === 'mode') {
          if (['VACATION', 'SICK', 'ABSENCE'].includes(value)) {
            return { ...updated, start: '', end: '' };
          }
          if (['VACATION', 'SICK', 'ABSENCE'].includes(shift.mode || '')) {
            return { ...updated, start: shift.start || '08:00', end: shift.end || '16:00' };
          }
        }
        return updated;
      });
      return { ...prev, shifts: next, dirty: true };
    });

  const setTravelField = useCallback((patch) => {
    setCrmTravelError('');
    setDraftDay((prev) => ({
      ...prev,
      travelRequest: {
        ...(prev.travelRequest || {}),
        ...patch
      },
      dirty: true
    }));
  }, []);

  const addTravelTrip = useCallback(() => {
    const existingEntries = ((draftDay.travelRequest?.tripEntries || []).map((entry) => ({ ...entry })) || []);
    const destinationCity = String(draftDay.travelRequest?.destinationCity || '').trim();
    const lastEntry = existingEntries[existingEntries.length - 1];
    let nextFrom = '';
    let nextTo = '';

    if (existingEntries.length === 0) {
      nextFrom = DEFAULT_TRAVEL_HOME_CITY;
      nextTo = '';
    } else if (existingEntries.length === 1) {
      nextFrom = String(lastEntry?.to || destinationCity).trim();
      nextTo = DEFAULT_TRAVEL_HOME_CITY;
    } else {
      const lastTo = String(lastEntry?.to || '').trim();
      const shouldGoToDestination = lastTo === DEFAULT_TRAVEL_HOME_CITY;
      nextFrom = lastTo || (shouldGoToDestination ? DEFAULT_TRAVEL_HOME_CITY : destinationCity);
      nextTo = shouldGoToDestination ? destinationCity : DEFAULT_TRAVEL_HOME_CITY;
    }

    setTravelField({
      tripEntries: [
        ...existingEntries,
        {
          id: `trip-${Date.now()}`,
          from: nextFrom,
          to: nextTo,
          route: '',
          start: travelWindow.start || '08:00',
          end: travelWindow.end || '16:00',
          crmActivityId: null
        }
      ]
    });
  }, [draftDay.travelRequest?.destinationCity, draftDay.travelRequest?.tripEntries, setTravelField, travelWindow.end, travelWindow.start]);

  const setTravelTripField = useCallback(
    (index, field, value) => {
      const nextEntries = (draftDay.travelRequest?.tripEntries || []).map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry
      );
      setTravelField({ tripEntries: nextEntries });
    },
    [draftDay.travelRequest?.tripEntries, setTravelField]
  );

  const removeTravelTrip = useCallback(
    (index) => {
      const nextEntries = (draftDay.travelRequest?.tripEntries || []).filter((_, idx) => idx !== index);
      setTravelField({ tripEntries: nextEntries });
    },
    [draftDay.travelRequest?.tripEntries, setTravelField]
  );

  const persistPlanWithTravel = useCallback(
    async (travelRequest) => {
      if (!selectedEmployee) return null;
      const planId = sentDay?.id || planIdFor(selectedEmployee.id, dKey);
      const base = sentDay
        ? sanitizePlan(sentDay)
        : {
          id: planId,
          employeeId: selectedEmployee.id,
          date: dKey,
          shifts: [],
          note: '',
          travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
          sent: false,
          sentAt: null,
          logs: []
        };

      const payload = {
        ...base,
        id: planId,
        employeeId: selectedEmployee.id,
        date: dKey,
        shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
        note: draftDay.note || '',
        travelRequest: getPersistedTravelRequest(travelRequest),
        ...(base.submission ? { submission: { ...base.submission } } : {})
      };

      const saved = await savePlan(payload);
      setPlansByDate((prev) => {
        const current = prev[dKey];
        if (current && deepEqual(current, saved)) return prev;
        return { ...prev, [dKey]: saved };
      });
      return saved;
    },
    [selectedEmployee, sentDay, dKey, draftDay.shifts, draftDay.note]
  );

  const handleTravelRegardingSelect = useCallback(
    (option, label) => {
      setTravelField({
        regardingLabel: label,
        regardingFullLabel: option.label || label,
        regarding: {
          id: String(option.category === 'opportunity' ? option.opportunityId || option.id : option.id)
            .replace(/^opportunity:/, '')
            .trim(),
          logicalName: option.category === 'opportunity' ? 'opportunity' : 'itarapro_project',
          name:
            option.category === 'opportunity'
              ? option.opportunityName || option.label
              : option.displayTitle || option.label
        },
        account:
          option.accountId && option.customerName
            ? {
                id: option.accountId,
                logicalName: 'account',
                name: option.customerName
              }
            : null
      });
    },
    [setTravelField]
  );

  const syncTravelToCrm = useCallback(async () => {
    if (!selectedEmployee) return;
    if (!crmConnected) {
      setCrmTravelError('Najpierw połącz się z CRM.');
      return null;
    }

    const currentTravel = draftDay.travelRequest || {};
    const regarding = currentTravel.regarding;
    if (!regarding?.id || !regarding?.logicalName) {
      setCrmTravelError('Wybierz projekt albo szansę sprzedaży do delegacji.');
      return null;
    }

    setCrmTravelSaving(true);
    setCrmTravelError('');
    try {
      const tripEntries = Array.isArray(currentTravel.tripEntries) ? currentTravel.tripEntries : [];
      const hasCompletedTrips = tripEntries.some(
        (entry) => getTripRouteLabel(entry) && String(entry.start || '').trim() && String(entry.end || '').trim()
      );
      const hasCosts = ['dietCost', 'fuelCost', 'parkingCost', 'highwayCost', 'hotelCost', 'transportCost', 'additionalCost', 'foodCost', 'advanceCost']
        .some((key) => Number(currentTravel[key] || 0) > 0);
      const nextTravelStatusValue = (() => {
        if (!String(currentTravel.crmTravelId || '').trim()) return CRM_TRAVEL_STATUS.IN_PROGRESS;
        if (currentTravel.toAccept) return CRM_TRAVEL_STATUS.IN_PROGRESS;
        if (hasCompletedTrips || hasCosts) return CRM_TRAVEL_STATUS.FILLED;
        return Number(currentTravel.travelStatusValue || CRM_TRAVEL_STATUS.ACCEPTED);
      })();

      const payload = {
        ...currentTravel,
        startTime: currentTravel.startTime || '08:00',
        endTime: currentTravel.endTime || '16:00',
        regarding,
        account: currentTravel.account || null,
        vehicle: currentTravel.vehicle || null,
        toAccept: typeof currentTravel.toAccept === 'boolean' ? currentTravel.toAccept : true,
        travelStatusValue: nextTravelStatusValue
      };

      const existingTravelId = String(currentTravel.crmTravelId || '').trim();
      const synced = existingTravelId
        ? await updateCrmTravel({
            travelId: existingTravelId,
            travel: payload,
            crmScope: CRM_SESSION_SCOPE
          })
        : await createCrmTravel({
            travel: payload,
            crmScope: CRM_SESSION_SCOPE
          });

      const nextTravel = {
        ...payload,
        crmTravelId: synced.travelId || existingTravelId,
        crmTravelNumber: synced.travelNumber || currentTravel.crmTravelNumber || '',
        crmSyncedAt: new Date().toISOString()
      };

      if (nextTravel.crmTravelId) {
        const unsyncedTrips = tripEntries.filter(
          (entry) =>
            !entry.crmActivityId &&
            getTripRouteLabel(entry) &&
            String(entry.start || '').trim() &&
            String(entry.end || '').trim()
        );
        for (const entry of unsyncedTrips) {
          const created = await createCrmAppointmentActivity({
            trip: {
              from: String(entry.from || '').trim(),
              to: String(entry.to || '').trim(),
              start: entry.start,
              end: entry.end
            },
            dateKey: nextTravel.startDate || dKey,
            regarding: {
              id: nextTravel.crmTravelId,
              logicalName: 'itaratrv_travel',
              name: nextTravel.crmTravelNumber || nextTravel.regardingLabel || 'Delegacja'
            },
            crmScope: CRM_SESSION_SCOPE
          });
          nextTravel.tripEntries = (nextTravel.tripEntries || []).map((tripEntry) =>
            tripEntry.id === entry.id
              ? {
                  ...tripEntry,
                  crmActivityId: created.activityId
                }
              : tripEntry
          );
          try {
            await closeCrmAppointmentActivity(created.activityId, null, CRM_SESSION_SCOPE);
          } catch {
            /* keep created entry even if close fails */
          }
        }
      }

      const savedPlan = await persistPlanWithTravel(nextTravel);
      const nextDraft = {
        ...(savedPlan || draftDay),
        travelRequest: nextTravel,
        dirty: false
      };
      setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));

      if (typeof window !== 'undefined') {
        window.alert(
          existingTravelId
            ? 'Delegacja została zaktualizowana w CRM.'
            : `Delegacja została wystawiona w CRM${nextTravel.crmTravelNumber ? ` (${nextTravel.crmTravelNumber})` : ''}.`
        );
      }
      return nextTravel;
    } catch (err) {
      if (isMissingCrmTravelError(err)) {
        try {
          const savedPlan = await persistPlanWithTravel(null);
          const nextDraft = {
            ...(savedPlan || draftDay),
            travelRequest: null,
            dirty: false
          };
          setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
        } catch {
          setDraftDay((prev) => ({ ...prev, travelRequest: null, dirty: false }));
        }
        setCrmTravelError('');
        if (typeof window !== 'undefined') {
          window.alert('Delegacja nie istnieje już w CRM, więc została usunięta z aplikacji.');
        }
      } else {
        setCrmTravelError(err instanceof Error ? err.message : String(err));
      }
      return null;
    } finally {
      setCrmTravelSaving(false);
    }
  }, [crmConnected, draftDay, persistPlanWithTravel, selectedEmployee]);

  const deleteTravelFromCrm = useCallback(async () => {
    if (!selectedEmployee) return;
    const currentTravel = draftDay.travelRequest || null;
    if (!currentTravel) return;

    const hasCrmTravel = !!String(currentTravel.crmTravelId || '').trim();
    const confirmationMessage = hasCrmTravel
      ? 'Czy na pewno usunąć delegację? Spowoduje to również usunięcie delegacji z CRM.'
      : 'Czy na pewno usunąć delegację z aplikacji?';
    if (typeof window !== 'undefined' && !window.confirm(confirmationMessage)) return;

    setCrmTravelDeleting(true);
    setCrmTravelError('');
    try {
      if (hasCrmTravel) {
        await deleteCrmTravel(currentTravel.crmTravelId, null, CRM_SESSION_SCOPE);
      }

      const savedPlan = await persistPlanWithTravel(null);
      const nextDraft = {
        ...(savedPlan || draftDay),
        travelRequest: null,
        dirty: false
      };
      setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
    } catch (err) {
      if (isMissingCrmTravelError(err)) {
        try {
          const savedPlan = await persistPlanWithTravel(null);
          const nextDraft = {
            ...(savedPlan || draftDay),
            travelRequest: null,
            dirty: false
          };
          setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
        } catch {
          setDraftDay((prev) => ({ ...prev, travelRequest: null, dirty: false }));
        }
        setCrmTravelError('');
      } else {
        setCrmTravelError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCrmTravelDeleting(false);
    }
  }, [draftDay, persistPlanWithTravel, selectedEmployee]);

  const sendPlanToManager = async () => {
    if (!selectedEmployee || sendingPlan) return;
    setSendingPlan(true);
    setError(null);
    const now = new Date().toISOString();
    const planId = sentDay?.id || planIdFor(selectedEmployee.id, dKey);
    const base = sentDay
      ? sanitizePlan(sentDay)
      : {
          id: planId,
          employeeId: selectedEmployee.id,
          date: dKey,
          shifts: [],
          note: '',
          sent: false,
          sentAt: null,
          logs: []
        };
    const nextPlanState = {
      ...base,
      id: planId,
      employeeId: selectedEmployee.id,
      date: dKey,
      shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
      note: draftDay.note || '',
      travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
      sent: true,
      sentAt: now
    };

    const changeMessages = describePlanChanges(base, nextPlanState);
    const logs = buildPlanLogs({
      baseLogs: base.logs,
      changeMessages,
      now,
      actorLabel: 'Pracownik',
      summaryText: summarizePlan(draftDay),
      editType: 'EMP_PLAN_EDIT',
      summaryType: 'EMP_PLAN_MOD'
    });

    const payload = {
      ...nextPlanState,
      ...(base.submission ? { submission: { ...base.submission } } : {}),
      logs
    };
    try {
      await savePlan(payload);
      setPlansByDate((prev) => {
        const current = prev[dKey];
        if (current && deepEqual(current, payload)) return prev;
        return { ...prev, [dKey]: payload };
      });
      const nextDraft = { ...payload, dirty: false };
      setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
      await refreshEmployeePlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingPlan(false);
    }
  };

  const submitted = sentDay?.submission;
  const emptyDraft = { status: 'DRAFT', dayStatus: 'W trakcie', items: [] };
  const [subDraft, setSubDraft] = useState(() => {
    if (!submitted) return emptyDraft;
    return {
      ...submitted,
      items: normalizeTaskStates(
        submitted.items,
        submitted.status === 'SUBMITTED' ? 'SENT' : 'DRAFT'
      )
    };
  });
  useEffect(() => {
    if (!submitted) {
      setSubDraft(emptyDraft);
      setSelectedTaskIds([]);
      return;
    }
    const normalizedIncoming = normalizeTaskStates(
      submitted.items,
      submitted.status === 'SUBMITTED' ? 'SENT' : 'DRAFT'
    );
    const status =
      submitted.status ||
      (normalizedIncoming.some((task) => task._syncState === 'SENT') ? 'SUBMITTED' : 'DRAFT');
    const dayStateDerived = submitted.dayStatus || computeDayStatus(normalizedIncoming, planned);
    setSubDraft({
      ...submitted,
      status,
      dayStatus: dayStateDerived,
      submittedAt: submitted.submittedAt || null,
      items: normalizedIncoming
    });
    setSelectedTaskIds([]);
  }, [submitted?.submittedAt, submitted?.status, submitted?.items, selectedEmployee?.id, dKey, planned]);

  const displayDayStatus = submitted
    ? submitted.dayStatus || computeDayStatus(submitted.items, planned)
    : 'W trakcie';

  const taskItems = useMemo(
    () => (subDraft.items || []).filter((item) => !shouldHideEmptyTaskDraft(item)),
    [subDraft.items]
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const editingTaskIdRef = useRef(null);
  useEffect(() => {
    if (!taskItems.length) {
      setSelectedTaskIds([]);
      return;
    }
    setSelectedTaskIds((prev) => prev.filter((id) => taskItems.some((item) => item.id === id)));
  }, [taskItems]);
  const selectableTaskIds = useMemo(
    () => taskItems.map((item) => item.id).filter(Boolean),
    [taskItems]
  );
  const sendableTaskIds = useMemo(
    () => taskItems.filter((item) => item._syncState !== 'SENT').map((item) => item.id),
    [taskItems]
  );
  const selectedSendableIds = useMemo(
    () => selectedTaskIds.filter((id) => sendableTaskIds.includes(id)),
    [selectedTaskIds, sendableTaskIds]
  );
  const toggleTaskSelection = useCallback(
    (id) => {
      const task = taskItems.find((item) => item.id === id);
      if (!task) return;
      setSelectedTaskIds((prev) =>
        prev.includes(id)
          ? prev.filter((existingId) => existingId !== id)
          : [...prev, id]
      );
    },
    [taskItems]
  );
  const allTasksSelected =
    selectableTaskIds.length > 0 && selectableTaskIds.every((id) => selectedTaskIds.includes(id));
  const toggleAllTasks = useCallback(() => {
    setSelectedTaskIds((prev) => {
      if (selectableTaskIds.length === 0) return [];
      const isAllSelected = selectableTaskIds.every((id) => prev.includes(id));
      return isAllSelected ? [] : selectableTaskIds;
    });
  }, [selectableTaskIds]);
  useEffect(() => {
    const prev = planContextRef.current;
    const contextChanged =
      prev.employeeId !== (selectedEmployee?.id ?? null) || prev.dateKey !== dKey;
    const signatureChanged = prev.signature !== planSignature;

    planContextRef.current = {
      signature: planSignature,
      employeeId: selectedEmployee?.id ?? null,
      dateKey: dKey
    };
    if (signatureChanged) {
      planAdjustmentAlertRef.current = { signature: planSignature, shown: false };
    }

    if (!contextChanged && signatureChanged) {
      const cachedItems = taskAdjustmentCacheRef.current.get(planSignature);
      if (cachedItems && !deepEqual(cachedItems, taskItems)) {
        planAdjustmentAlertRef.current = { signature: planSignature, shown: true };
        setSubDraft((prevDraft) => ({
          ...prevDraft,
          items: cachedItems.map((item) => ({ ...item }))
        }));
        return;
      }
    }

    if (!signatureChanged) return;
    if (contextChanged) return;
    if (!taskItems.length) return;

    const result = reconcileTasksAfterPlanChange(taskItems);
    if (result.changed) {
      taskAdjustmentCacheRef.current.set(
        planSignature,
        result.items.map((item) => ({ ...item }))
      );
      setSubDraft((prevDraft) => ({
        ...prevDraft,
        items: result.items
      }));
      if (typeof window !== 'undefined' && result.messages.length) {
        const alertSignature = planAdjustmentAlertRef.current.signature;
        const alreadyShown =
          alertSignature === planSignature && planAdjustmentAlertRef.current.shown;
        if (!alreadyShown) {
          const header = 'Plan dnia został zmieniony. Zadania zostały dostosowane.';
          window.alert([header, ...result.messages].join('\n\n'));
          planAdjustmentAlertRef.current = { signature: planSignature, shown: true };
        }
      }
      (async () => {
        try {
          const saved = await persistTaskDraft(result.items);
          if (saved) {
            setSubDraft((prev) => {
              const mergedItems = mergeSubmissionItems(prev.items || [], saved.items || []);
              const nextStatus =
                saved.status ||
                (mergedItems.every((task) => task._syncState === 'SENT') ? 'SUBMITTED' : 'DRAFT');
              return {
                ...prev,
                ...saved,
                status: nextStatus,
                items: mergedItems
              };
            });
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }, [planSignature, selectedEmployee?.id, dKey, taskItems, reconcileTasksAfterPlanChange, setSubDraft, persistTaskDraft]);
  const canSendTasks = selectedSendableIds.length > 0;
  useEffect(() => {
    if (!taskItems.length) {
      setTaskActionsMenu({ id: null, rect: null });
      setSplitPrompt(null);
    }
  }, [taskItems.length]);
  useEffect(() => {
    if (planAdjustmentAlertRef.current.signature !== planSignature) return;
    if (!planAdjustmentAlertRef.current.shown) return;
    taskAdjustmentCacheRef.current.set(
      planSignature,
      taskItems.map((item) => ({ ...item }))
    );
  }, [planSignature, taskItems]);

  const addTask = useCallback(() => {
    const tasksWithTime = taskItems
      .filter((task) => task.start && task.end)
      .map((task) => ({
        ...task,
        startMinutes: toMinutes(task.start),
        endMinutes: toMinutes(task.end)
      }))
      .filter((task) => Number.isFinite(task.startMinutes) && Number.isFinite(task.endMinutes) && task.endMinutes > task.startMinutes)
      .sort((left, right) => left.startMinutes - right.startMinutes);

    const gapBetweenTasks = tasksWithTime.slice(1).reduce((found, task, index) => {
      if (found) return found;
      const previous = tasksWithTime[index];
      if (!previous || task.startMinutes <= previous.endMinutes) return null;
      return {
        start: previous.end,
        end: task.start
      };
    }, null);

    const shouldFillGap = gapBetweenTasks && typeof window !== 'undefined'
      ? window.confirm(
          `Jest wolny czas między zadaniami od ${gapBetweenTasks.start} do ${gapBetweenTasks.end}. Utworzyć zadanie uzupełniające w tej luce?`
        )
      : false;

    let splitMessages = [];

    setSubDraft((prev) => {
      const items = prev.items || [];
      const marked = items.map((item) => {
        if (item._syncState === 'SENT') return item;
        return {
          ...item,
          _syncState: 'DRAFT',
          prevSyncState: 'DRAFT',
          locked: true,
          sent: true
        };
      });

      const lastTaskWithEnd = [...marked].reverse().find((task) => task.end);
      let defaultStart = lastTaskWithEnd?.end || shifts[0]?.start || '';
      let defaultEnd = (() => {
        if (shifts.length === 0) return '';
        const fallback = shifts[shifts.length - 1]?.end || '';
        if (!defaultStart) return fallback;
        const startMinutes = toMinutes(defaultStart);
        const candidate = shifts.find((shift) => toMinutes(shift.end) > startMinutes)?.end;
        return candidate || fallback;
      })();

      if (gapBetweenTasks && shouldFillGap) {
        if (shouldFillGap) {
          defaultStart = gapBetweenTasks.start;
          defaultEnd = gapBetweenTasks.end;
        }
      }

      const newTask = {
        id: `t${Date.now()}`,
        type: 'Biuro',
        subject: '',
        client: '',
        project: '',
        start: defaultStart,
        end: defaultEnd,
        workKind: 'Zwykłe',
        status: 'Planowane',
        sent: false,
        locked: false,
        _syncState: 'EDITED'
      };

      const sortedItems = sortTasksByTime([...marked, newTask]);
      const reconciled = reconcileTasksAfterPlanChange(sortedItems);
      const nextItems = reconciled.changed ? reconciled.items : sortedItems;
      splitMessages = reconciled.messages || [];

      return {
        ...prev,
        items: nextItems
      };
    });

    if (typeof window !== 'undefined' && splitMessages.length) {
      const header = 'Nowe zadanie zostało dostosowane do planu dnia.';
      window.alert([header, ...splitMessages].join('\n\n'));
    }
  }, [reconcileTasksAfterPlanChange, shifts, taskItems]);

  const importPlanFallbackToTasks = useCallback(async () => {
    const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
    const segments = (shifts || []).filter((segment) => segment.start && segment.end);
    if (!segments.length) return;
    const nowBase = Date.now();
    const generated = segments.map((segment, idx) => {
      const modeKey = segment.mode || 'OFFICE';
      const typeLabel = MODE_META[modeKey]?.label || 'Plan';
      return {
        id: `plan-${nowBase}-${idx}`,
        type: typeLabel,
        subject: segment.note || '',
        client: '',
        project: '',
        start: segment.start,
        end: segment.end,
        workKind: 'Zwykłe',
        status: 'Planowane',
        locked: true,
        sent: false,
        _syncState: 'DRAFT',
        prevSyncState: 'DRAFT'
      };
    });
    if (isStaleContext(requestContext)) return;
    setSubDraft(() => ({
      status: 'DRAFT',
      dayStatus: computeDayStatus(generated, planned),
      items: generated
    }));
    try {
      const savedSubmission = await persistTaskDraft(generated);
      if (savedSubmission && !isStaleContext(requestContext)) {
        setSubDraft((prev) => ({
          ...prev,
          ...savedSubmission,
          status: savedSubmission.status || 'DRAFT',
          items: normalizeTaskStates(savedSubmission.items || generated, 'DRAFT')
        }));
      }
    } catch (err) {
      console.error('[employee] Plan import save failed', err);
    }
  }, [dKey, isStaleContext, persistTaskDraft, planned, selectedEmployee?.id, shifts]);

  const importPlanToTasks = useCallback(async () => {
    const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
    const fallbackImport = async () => importPlanFallbackToTasks();
    if (!selectedEmployee || crmImportingTasks) {
      await fallbackImport();
      return;
    }
    if (!crmConnected) {
      await fallbackImport();
      return;
    }

    setCrmImportingTasks(true);
    try {
      const crmItems = await fetchCrmTasksForDate({
        dateKey: dKey,
        ownerName: [
          selectedEmployee?.name || selectedEmployee?.fullName || '',
          selectedEmployee?.crmLogin || '',
          crmUser?.login || ''
        ],
        crmScope: CRM_SESSION_SCOPE
      });

      if (!crmItems.length) {
        fallbackImport();
        return;
      }

      if (isStaleContext(requestContext)) return;

      const generated = crmItems.map((item, idx) => {
        const regardingReference = item.regarding;
        const normalizedSubject = String(item.subject || '').trim().toLowerCase();
        const derivedCrmType =
          item.plannerDetails?.type ||
          (normalizedSubject.startsWith('dp ') || normalizedSubject.startsWith('dp -')
            ? 'Przejazd'
            : normalizedSubject.startsWith('tr ') || normalizedSubject.startsWith('tr -')
            ? 'Delegacja'
            : 'Biuro');
        const crmMatch = regardingReference
          ? crmProjects.find((crmItem) => {
              const candidateId =
                crmItem.category === 'opportunity'
                  ? String(crmItem.opportunityId || crmItem.id || '').replace(/^opportunity:/, '').trim()
                  : String(crmItem.id || '').trim();
              return candidateId && candidateId === String(regardingReference.id || '').trim();
            }) || null
          : null;
        const projectShortLabel =
          crmMatch?.category === 'project'
            ? String(crmMatch.displayTitle || crmMatch.titleInternal || crmMatch.label || '')
                .split(' - ')[0]
                .trim()
            : '';
        const projectLabel =
          crmMatch?.category === 'project'
            ? [crmMatch.number, projectShortLabel].filter(Boolean).join(' - ')
            : crmMatch?.label || regardingReference?.name || '';
        const projectFullLabel = crmMatch?.label || regardingReference?.name || projectLabel;
        const isClosedInCrm =
          item.recordType === 'travel' ||
          Number(item.stateCode) === 1 ||
          (item.recordType !== 'travel' && Number(item.statusCode) === 5);

        return {
          id: `crm-import-${item.activityId || `${Date.now()}-${idx}`}`,
          type: derivedCrmType,
          subject: item.subject,
          client: item.plannerDetails?.client || '',
          kp: item.plannerDetails?.kp || '',
          project: projectLabel,
          projectFullLabel,
          start: item.start || '',
          end: item.end || '',
          workKind: item.crmWorkKind || 'Zwykłe',
          status: isClosedInCrm ? 'Zakończone' : item.plannerDetails?.plannerStatus || 'Planowane',
          locked: true,
          sent: false,
          _syncState: 'DRAFT',
          prevSyncState: 'DRAFT',
          crmActivityId: item.activityId,
          crmSyncedAt: new Date().toISOString(),
          crmClosePending: false,
          crmRegarding: regardingReference
            ? {
                id: String(regardingReference.id || '').trim(),
                logicalName: String(regardingReference.logicalName || '').trim(),
                name: crmMatch?.displayTitle || regardingReference.name || '',
                label: crmMatch?.label || regardingReference.name || ''
              }
            : null
        };
      });

      if (isStaleContext(requestContext)) return;
      setSubDraft(() => ({
        status: 'DRAFT',
        dayStatus: computeDayStatus(generated, planned),
        items: generated
      }));
      try {
        const savedSubmission = await persistTaskDraft(generated);
        if (savedSubmission && !isStaleContext(requestContext)) {
          setSubDraft((prev) => ({
            ...prev,
            ...savedSubmission,
            status: savedSubmission.status || 'DRAFT',
            items: normalizeTaskStates(savedSubmission.items || generated, 'DRAFT')
          }));
        }
      } catch (saveErr) {
        console.error('[employee] CRM import save failed', saveErr);
      }
    } catch (err) {
      console.error('[employee] CRM import failed, fallback to local plan import', err);
      if (!isStaleContext(requestContext)) {
        await fallbackImport();
      }
    } finally {
      if (!isStaleContext(requestContext)) {
        setCrmImportingTasks(false);
      }
    }
  }, [crmConnected, crmImportingTasks, crmProjects, crmUser?.login, dKey, importPlanFallbackToTasks, isStaleContext, persistTaskDraft, planned, selectedEmployee]);

  const setTask = useCallback(
    (id, patch) =>
      setSubDraft((prev) => ({
        ...prev,
        items: (prev.items || []).map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...patch };
          if (!next.locked) {
            next._syncState = 'EDITED';
            next.prevSyncState = 'EDITED';
            next.sent = false;
          } else if (typeof next.sent === 'undefined') {
            next.sent = item.sent ?? false;
          }
          return next;
        })
      })),
    []
  );

  const saveTaskDraftById = useCallback(
    async (id) => {
      const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
      const previousItems = taskItems.map((item) => ({ ...item }));
      const targetTask = previousItems.find((item) => item.id === id);
      if (!targetTask || targetTask.locked || targetTask._syncState !== 'EDITED') return;

      const nextItems = previousItems.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          locked: true,
          _syncState: 'DRAFT',
          prevSyncState: 'DRAFT',
          sent: false
        };
      });

      setSubDraft((prev) => ({
        ...prev,
        items: nextItems
      }));

      try {
        const savedSubmission = await persistTaskDraft(nextItems);
        if (savedSubmission && !isStaleContext(requestContext)) {
          setSubDraft((prev) => {
            const mergedItems = mergeSubmissionItems(prev.items || [], savedSubmission.items || []);
            const nextStatus =
              savedSubmission.status ||
              (mergedItems.every((task) => task._syncState === 'SENT') ? 'SUBMITTED' : 'DRAFT');
            return {
              ...prev,
              ...savedSubmission,
              status: nextStatus,
              items: mergedItems
            };
          });
        }
      } catch (err) {
        console.error(err);
        if (!isStaleContext(requestContext)) {
          setSubDraft((prev) => ({
            ...prev,
            items: previousItems
          }));
        }
      }
    },
    [dKey, isStaleContext, persistTaskDraft, selectedEmployee?.id, taskItems]
  );

  const handleTaskEditStart = useCallback(
    (id) => {
      const previousEditingId = editingTaskIdRef.current;
      if (previousEditingId && previousEditingId !== id) {
        void saveTaskDraftById(previousEditingId);
      }
      editingTaskIdRef.current = id;
    },
    [saveTaskDraftById]
  );

  const buildCalendarDetails = useCallback(
    (task) => {
      const ensureTime = (value, fallback) => (value && String(value).trim() ? value : fallback);
      const toDatePayload = (hhmm, fallback) => {
        const [h, m] = String(ensureTime(hhmm, fallback)).split(':').map(Number);
        const dt = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          h || 0,
          m || 0,
          0,
          0
        );
        const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19);
        const utcStamp = dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        return { localIso, utcStamp };
      };

      const startPayload = toDatePayload(task.start, '08:00');
      const endPayload = toDatePayload(task.end, '09:00');

      const summaryRaw = `${(task.client || '').trim()}${
        task.client && task.subject ? ' - ' : ''
      }${(task.subject || '').trim()}`;
      const summary = summaryRaw.trim() || 'Zadanie';
      const description = `Klient: ${task.client || '-'}
Dotyczy: ${task.project || '-'}
Status: ${task.status || '-'}`;
      const uid = `${task.id || `task-${Date.now()}`}@planner-ibcs`;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

      return {
        summary,
        description,
        startLocal: startPayload.localIso,
        endLocal: endPayload.localIso,
        startUtc: startPayload.utcStamp,
        endUtc: endPayload.utcStamp,
        uid,
        stamp
      };
    },
    [selectedDate]
  );

  const openOutlookWeb = useCallback(
    (task) => {
      const details = buildCalendarDetails(task);
      const params = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        startdt: details.startLocal,
        enddt: details.endLocal,
        subject: details.summary,
        body: details.description
      });

      const url = `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;

      try {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (win) return;
      } catch {
        /* ignore and fallback */
      }

      try {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          link.remove();
        }, 100);
        return;
      } catch {
        /* no-op */
      }

      window.location.assign(url);
    },
    [buildCalendarDetails]
  );

  const downloadTaskICS = useCallback(
    (task) => {
      const details = buildCalendarDetails(task);
      const escapeICS = (value) =>
        String(value || '')
          .replace(/\\/g, '\\\\')
          .replace(/\n/g, '\\n')
          .replace(/,/g, '\\,')
          .replace(/;/g, '\\;');

      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planner IBCS//PL',
        'BEGIN:VEVENT',
        `UID:${details.uid}`,
        `DTSTAMP:${details.stamp}`,
        `DTSTART:${details.startUtc}`,
        `DTEND:${details.endUtc}`,
        `SUMMARY:${escapeICS(details.summary)}`,
        `DESCRIPTION:${escapeICS(details.description)}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ];

      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      const dateLabel = [
        selectedDate.getFullYear(),
        String(selectedDate.getMonth() + 1).padStart(2, '0'),
        String(selectedDate.getDate()).padStart(2, '0')
      ].join('-');
      const baseName = (
        (task.subject || '').trim() ||
        (task.client || '').trim() ||
        'zadanie'
      )
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_');
      const fileName = `${baseName || 'zadanie'}_${dateLabel}.ics`;

      const blobUrl = URL.createObjectURL(blob);

      const triggerDownload = () => {
        try {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName.toLowerCase();
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            link.remove();
          }, 300);
        } catch {
          /* no-op */
        }
      };

      if (typeof navigator !== 'undefined' && 'msSaveOrOpenBlob' in navigator) {
        try {
          navigator.msSaveOrOpenBlob(blob, fileName.toLowerCase());
          URL.revokeObjectURL(blobUrl);
          return;
        } catch {
          /* ignore and fallback */
        }
      }

      triggerDownload();
    },
    [buildCalendarDetails, selectedDate]
  );

  const closeOutlookMenu = useCallback(() => setOutlookMenu({ task: null, anchor: null }), []);

  const registerTaskActionAnchor = useCallback((id, node) => {
    if (node) taskActionRefs.current[id] = node;
    else delete taskActionRefs.current[id];
  }, []);

  const closeTaskActions = useCallback(() => {
    setTaskActionsMenu({ id: null, rect: null });
    closeOutlookMenu();
  }, [closeOutlookMenu]);

  const handleTaskExport = useCallback(
    (task, anchor) => {
      if (!anchor) {
        openOutlookWeb(task);
        closeTaskActions();
        return;
      }
      setOutlookMenu({ task, anchor });
    },
    [closeTaskActions, openOutlookWeb]
  );

  const toggleTaskActions = useCallback((id) => {
    closeOutlookMenu();
    setTaskActionsMenu((prev) => {
      if (prev.id === id) return { id: null, rect: null };
      const anchor = taskActionRefs.current[id];
      if (!anchor) return prev;
      return { id, rect: anchor.getBoundingClientRect() };
    });
  }, [closeOutlookMenu]);

  const handleTaskFieldChange = useCallback(
    (id, patch) => {
      const currentItems = taskItems;
      const targetTask = currentItems.find((item) => item.id === id);

      if (!targetTask) {
        setTask(id, patch);
        return;
      }

      const nextType = patch.type ?? targetTask.type;
      if (ABSENCE_TASK_TYPES.includes(nextType)) {
        setSubDraft((prev) => {
          const items = prev.items || [];
          const index = items.findIndex((item) => item.id === id);
          if (index === -1) return prev;

          const enforced = {
            ...(items[index] || {}),
            ...patch,
            type: nextType,
            start: '08:00',
            end: '16:00',
            subject: '',
            client: '',
            project: '',
            status: 'Planowane',
            workKind: 'Zwykłe'
          };

          const updated = items.map((item, i) => (i === index ? enforced : item));
          return { ...prev, items: updated };
        });
        return;
      }

      if ('status' in patch && patch.status === 'Zakończone') {
        const preview = { ...targetTask, ...patch };
        if (!preview.start || !preview.end) {
          if (typeof window !== 'undefined') {
            window.alert('Aby oznaczyć zadanie jako zakończone, uzupełnij godziny startu i końca.');
          }
          return;
        }
        const subjectFilled = (preview.subject || '').trim().length > 0;
        const regardingFilled =
          (preview.project || '').trim().length > 0 ||
          (preview.crmRegarding?.id && preview.crmRegarding?.logicalName);
        if (!subjectFilled || !regardingFilled) {
          if (typeof window !== 'undefined') {
            window.alert('Aby oznaczyć zadanie jako zakończone, uzupełnij pola Temat i Dotyczy.');
          }
          return;
        }
      }

      const timeFieldsChanged = 'start' in patch || 'end' in patch;
      if (!timeFieldsChanged) {
        setTask(id, patch);
        return;
      }

      const nextTask = { ...targetTask, ...patch };
      const isTravelTask = (nextTask.type || '') === 'Przejazd';
      const nightBoundaryMinutes = 22 * 60;
      const nightEarlyBoundaryMinutes = 6 * 60;
      const splitByNightBoundaries = (taskToSplit) => {
        const start = toMinutes(taskToSplit.start);
        const end = toMinutes(taskToSplit.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [taskToSplit];
        const boundaries = [];
        if (start < nightEarlyBoundaryMinutes && end > nightEarlyBoundaryMinutes) boundaries.push(nightEarlyBoundaryMinutes);
        if (start < nightBoundaryMinutes && end > nightBoundaryMinutes) boundaries.push(nightBoundaryMinutes);
        if (!boundaries.length) return [taskToSplit];
        const sorted = boundaries.sort((a, b) => a - b);
        const rawSegments = [];
        let cursor = start;
        for (const boundary of sorted) {
          if (boundary <= cursor || boundary >= end) continue;
          rawSegments.push([cursor, boundary]);
          cursor = boundary;
        }
        rawSegments.push([cursor, end]);
        return rawSegments
          .filter(([segStart, segEnd]) => segEnd > segStart)
          .map(([segStart, segEnd]) => ({
            ...taskToSplit,
            start: minutesToHHmm(segStart),
            end: minutesToHHmm(segEnd)
          }));
      };
      const planEndMinutesSpan = spanEnd ? toMinutes(spanEnd) : null;
      const planStartMinutesSpan = spanStart ? toMinutes(spanStart) : null;
      const startMinutes = toMinutes(nextTask.start);
      const endMinutes = toMinutes(nextTask.end);
      const crossesPlanStart =
        Number.isFinite(planStartMinutesSpan) &&
        Number.isFinite(startMinutes) &&
        Number.isFinite(endMinutes) &&
        startMinutes < endMinutes &&
        startMinutes < planStartMinutesSpan;

      if (!isTravelTask && crossesPlanStart) {
        const boundaries = [];
        if (startMinutes < nightEarlyBoundaryMinutes && endMinutes > nightEarlyBoundaryMinutes) {
          boundaries.push(nightEarlyBoundaryMinutes);
        }
        if (startMinutes < planStartMinutesSpan && endMinutes > planStartMinutesSpan) {
          boundaries.push(planStartMinutesSpan);
        }

        if (boundaries.length) {
          const sortedBoundaries = boundaries.sort((a, b) => a - b);
          const baseSegments = sortedBoundaries.reduce(
            (segments, boundary) =>
              segments.flatMap((segment) => {
                const segStart = toMinutes(segment.start);
                const segEnd = toMinutes(segment.end);
                if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || segStart >= segEnd) {
                  return [segment];
                }
                if (segStart < boundary && segEnd > boundary) {
                  const boundaryLabel = minutesToHHmm(boundary);
                  const head = { ...segment, end: boundaryLabel };
                  const tail = { ...segment, start: boundaryLabel };
                  return [head, tail];
                }
                return [segment];
              }),
            [{ ...nextTask }]
          );

          let shouldSplitPlanStart = true;
          if (typeof window !== 'undefined') {
            const previewLines = baseSegments.map((segment) => {
              const startLabel = segment.start || '—';
              const endLabel = segment.end || '—';
              const kind = computeWorkKindFor(segment, selectedDate, shifts);
              return `• ${startLabel}–${endLabel} (${kind})`;
            });
            const message = [
              `Zadanie ${nextTask.start || '—'}–${nextTask.end || '—'} zaczyna się przed planem dnia (${spanStart || '—'}).`,
              'Podzielić je na:',
              ...previewLines
            ].join('\n');
            shouldSplitPlanStart = window.confirm(message);
          }

          if (shouldSplitPlanStart) {
            const timestamp = Date.now();
            setSubDraft((prev) => {
              const items = prev.items || [];
              const index = items.findIndex((item) => item.id === id);
              if (index === -1) return prev;

              const updated = [...items];
              updated.splice(index, 1);

              const segmentsWithIds = baseSegments.map((segment, segIndex) => ({
                ...segment,
                id: segIndex === baseSegments.length - 1 ? id : `t${timestamp + segIndex}`,
                locked: false,
                sent: false,
                _syncState: 'EDITED'
              }));

              updated.splice(index, 0, ...segmentsWithIds);
              return { ...prev, items: updated };
            });
            return;
          }
        }
      }

      const crossesOvertime =
        Number.isFinite(planEndMinutesSpan) &&
        Number.isFinite(startMinutes) &&
        Number.isFinite(endMinutes) &&
        startMinutes < endMinutes &&
        startMinutes < planEndMinutesSpan &&
        endMinutes > planEndMinutesSpan;

      if (!isTravelTask && crossesOvertime) {
        let shouldSplitOvertime = true;
        if (typeof window !== 'undefined') {
          const message = [
            `Zadanie ${nextTask.start || '—'}–${nextTask.end || '—'} przekracza plan dnia (koniec planu ${spanEnd}).`,
            `Czy utworzyć dodatkowe zadanie z nadgodzinami ${spanEnd}–${nextTask.end || '—'}?`
          ].join('\n');
          shouldSplitOvertime = window.confirm(message);
        }

        if (shouldSplitOvertime) {
          const timestamp = Date.now();
          const overtimeId = `t${timestamp}`;
          const overtimeBase = {
            ...nextTask,
            id: overtimeId,
            start: spanEnd,
            locked: false,
            sent: false,
            _syncState: 'EDITED'
          };
          const overtimeSegments = splitByNightBoundaries(overtimeBase);
          setSubDraft((prev) => {
            const items = prev.items || [];
            const index = items.findIndex((item) => item.id === id);
            if (index === -1) return prev;

            const updated = items.map((item, i) =>
              i === index ? { ...item, ...patch, end: spanEnd } : item
            );
            const preparedSegments = overtimeSegments.map((segment, segIdx) => ({
              ...segment,
              id: segIdx === 0 ? overtimeId : `${overtimeId}-${segIdx}`,
              locked: false,
              sent: false,
              _syncState: 'EDITED'
            }));
            updated.splice(index + 1, 0, ...preparedSegments);

            return { ...prev, items: updated };
          });
          return;
        }
      }

      const crossesNight =
        Number.isFinite(startMinutes) &&
        Number.isFinite(endMinutes) &&
        startMinutes < endMinutes &&
        startMinutes < nightBoundaryMinutes &&
        endMinutes > nightBoundaryMinutes;

      if (!isTravelTask && crossesNight) {
        const baseKind = computeWorkKindFor(nextTask, selectedDate, shifts);
        if (baseKind === 'Nocne' || baseKind === '+ 50%') {
          const timestamp = Date.now();
          const segments = splitByNightBoundaries(nextTask);
          setSubDraft((prev) => {
            const items = prev.items || [];
            const index = items.findIndex((item) => item.id === id);
            if (index === -1) return prev;

            const updated = [...items];
            updated.splice(index, 1);

            const prepared = segments.map((segment, segIdx) => ({
              ...segment,
              id: segIdx === 0 ? id : `t${timestamp + segIdx}`,
              locked: segIdx === 0 ? nextTask.locked : false,
              sent: segIdx === 0 ? !!nextTask.sent && !!nextTask.locked : false,
              _syncState: segIdx === 0 && nextTask.locked ? 'SENT' : 'EDITED'
            }));

            updated.splice(index, 0, ...prepared);
            return { ...prev, items: updated };
          });
          return;
        }
      }

      if (!('end' in patch)) {
        setTask(id, patch);
        return;
      }

      const planEnd = shifts
        .map((shift) => shift.end)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];

      if (!planEnd) {
        setTask(id, patch);
        return;
      }

      const planEndMinutes = toMinutes(planEnd);
      const newEndMinutes = toMinutes(patch.end);

      if (!Number.isFinite(planEndMinutes) || !Number.isFinite(newEndMinutes) || newEndMinutes >= planEndMinutes) {
        setTask(id, patch);
        return;
      }

      const otherTasks = currentItems
        .filter((item) => item.id !== id && item.start && item.end)
        .map((item) => ({
          start: toMinutes(item.start),
          end: toMinutes(item.end)
        }))
        .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end > entry.start)
        .sort((a, b) => a.start - b.start);

      let coveredUntil = newEndMinutes;
      for (const task of otherTasks) {
        if (task.end <= coveredUntil) continue;
        if (task.start > coveredUntil) break;
        coveredUntil = Math.max(coveredUntil, task.end);
      }

      const nextStartAfterCoverage = otherTasks
        .map((task) => task.start)
        .find((start) => start > coveredUntil);

      const earliestNext = Number.isFinite(nextStartAfterCoverage)
        ? nextStartAfterCoverage
        : Infinity;
      const gapStartMinutes = coveredUntil;
      const gapEndMinutes = Math.min(planEndMinutes, earliestNext);

      let shouldAddFollowup = false;
      if (gapEndMinutes > gapStartMinutes && typeof window !== 'undefined') {
        const gapStart = minutesToHHmm(gapStartMinutes);
        const gapEnd = minutesToHHmm(gapEndMinutes);
        const message = `Pozostał wolny czas od ${gapStart} do ${gapEnd}. Czy dodać nowe zadanie?`;
        shouldAddFollowup = !isTravelTask && window.confirm(message);
      }

      setSubDraft((prev) => {
        const items = prev.items || [];
        const index = items.findIndex((item) => item.id === id);
        if (index === -1) return prev;

        const updatedItems = items.map((item) => (item.id === id ? { ...item, ...patch } : item));

        if (shouldAddFollowup) {
          const gapEnd = minutesToHHmm(gapEndMinutes);
          const gapStart = minutesToHHmm(gapStartMinutes);
          if (gapStart && gapEnd && gapStart !== gapEnd) {
            const baseTask = updatedItems[index];
            const followup = {
              id: `t${Date.now()}`,
              type: baseTask.type || 'Biuro',
              subject: '',
              client: '',
              project: '',
              start: gapStart,
              end: gapEnd,
              workKind: 'Zwykłe',
              status: 'Planowane',
              locked: false,
              sent: false,
              _syncState: 'EDITED'
            };
            updatedItems.splice(index + 1, 0, followup);
          }
        }

        return { ...prev, items: sortTasksByTime(updatedItems) };
      });
    },
    [setTask, shifts, taskItems, setSubDraft, selectedDate, spanEnd]
  );

  const deleteTasksByIds = useCallback(
    async (ids) => {
      const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
      const existingIds = new Set(taskItems.map((item) => item.id));
      const uniqueIds = [...new Set(ids)].filter((taskId) => existingIds.has(taskId));
      if (!uniqueIds.length) return;
      const tasksToDelete = taskItems.filter((item) => uniqueIds.includes(item.id));
      const crmActivityIds = tasksToDelete
        .map((item) => String(item.crmActivityId || '').trim())
        .filter(Boolean);

      if (crmActivityIds.length) {
        if (!crmConnected) {
          const message = 'Aby usunąć powiązane zadanie z CRM, zaloguj się do CRM w panelu pracownika.';
          setError(message);
          if (typeof window !== 'undefined') {
            window.alert(message);
          }
          return;
        }
        try {
          await Promise.all(crmActivityIds.map((activityId) => deleteCrmTaskActivity(activityId, null, CRM_SESSION_SCOPE)));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          if (typeof window !== 'undefined') {
            window.alert(`Nie udało się usunąć działania z CRM.\n\n${message}`);
          }
          return;
        }
      }

      const removalSet = new Set(uniqueIds);
      const remaining = taskItems
        .filter((item) => !removalSet.has(item.id))
        .map((item) => ({ ...item }));
      if (remaining.length === taskItems.length) return;
      const hasSentAfterDelete = remaining.some((task) => task._syncState === 'SENT');
      const nextDayStatus = remaining.length ? computeDayStatus(remaining, planned) : 'W trakcie';
      const nextStatus = hasSentAfterDelete ? 'SUBMITTED' : 'DRAFT';
      if (!isStaleContext(requestContext)) {
        setSubDraft((prev) => ({
          ...prev,
          status: nextStatus,
          dayStatus: nextDayStatus,
          items: remaining
        }));
        setSelectedTaskIds((prev) => prev.filter((itemId) => !removalSet.has(itemId)));
      }
      try {
        const savedSubmission = await persistTaskDraft(remaining);
        if (savedSubmission && !isStaleContext(requestContext)) {
          setSubDraft((prev) => {
            const mergedItems = mergeSubmissionItems(prev.items || [], savedSubmission.items || []);
            const nextStatus = savedSubmission.status || (mergedItems.every((task) => task._syncState === 'SENT') ? 'SUBMITTED' : 'DRAFT');
            return {
              ...prev,
              ...savedSubmission,
              status: nextStatus,
              items: mergedItems
            };
          });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [crmConnected, dKey, isStaleContext, planned, persistTaskDraft, selectedEmployee?.id, setError, taskItems]
  );

  const handleTaskLock = useCallback(
    async (id) => {
      const requestContext = { employeeId: selectedEmployee?.id ?? null, dateKey: dKey };
      const previousItems = taskItems.map((item) => ({ ...item }));
      const nextItems = previousItems.map((item) => {
        if (item.id !== id) return item;
        const baseState = item._syncState || item.prevSyncState || (item.locked ? 'SENT' : 'EDITED');
        const nextState = baseState === 'SENT' ? 'SENT' : 'DRAFT';
        return {
          ...item,
          locked: true,
          _syncState: nextState,
          prevSyncState: nextState
        };
      });

      setSubDraft((prev) => ({
        ...prev,
        items: nextItems
      }));
      closeTaskActions();

      try {
        const savedSubmission = await persistTaskDraft(nextItems);
        if (savedSubmission && !isStaleContext(requestContext)) {
          setSubDraft((prev) => {
            const mergedItems = mergeSubmissionItems(prev.items || [], savedSubmission.items || []);
            const nextStatus = savedSubmission.status || (mergedItems.every((task) => task._syncState === 'SENT') ? 'SUBMITTED' : 'DRAFT');
            return {
              ...prev,
              ...savedSubmission,
              status: nextStatus,
              items: mergedItems
            };
          });
        }
      } catch (err) {
        console.error(err);
        if (!isStaleContext(requestContext)) {
          setSubDraft((prev) => ({
            ...prev,
            items: previousItems
          }));
        }
      }
    },
    [closeTaskActions, dKey, isStaleContext, persistTaskDraft, selectedEmployee?.id, taskItems]
  );

  const handleTaskUnlock = useCallback(
    (id) => {
      setTask(id, { locked: false, sent: false, _syncState: 'EDITED' });
      closeTaskActions();
    },
    [setTask, closeTaskActions]
  );

  const handleTaskDelete = useCallback(
    async (id) => {
      await deleteTasksByIds([id]);
      closeTaskActions();
    },
    [deleteTasksByIds, closeTaskActions]
  );

  const syncTaskToCrm = useCallback(
    async (task) => {
      if (!task) return;
      if (!crmConnected) {
        throw new Error('Aby wysłać zadania, zaloguj się do CRM w panelu pracownika.');
      }

      const subject = String(task.subject || '').trim();
      if (!subject) {
        throw new Error('Aby wysłać zadanie do CRM, uzupełnij temat zadania.');
      }

      const storedRegarding =
        task.crmRegarding &&
        task.crmRegarding.id &&
        task.crmRegarding.logicalName
          ? {
              id: String(task.crmRegarding.id).trim(),
              logicalName: String(task.crmRegarding.logicalName).trim(),
              name: String(task.crmRegarding.name || task.project || '').trim()
            }
          : null;

      const regardingLabels = new Set(
        [task.project, task.projectFullLabel, storedRegarding?.name, task.crmRegarding?.label]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );

      const crmReference =
        crmProjects.find((item) => {
          const itemLabels = [
            item.label,
            item.displayTitle,
            item.titleInternal,
            item.opportunityName
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
          return itemLabels.some((label) => regardingLabels.has(label));
        }) || null;

      const regarding =
        (crmReference
          ? {
              id: String(crmReference.category === 'opportunity' ? crmReference.opportunityId || crmReference.id : crmReference.id)
                .replace(/^opportunity:/, '')
                .trim(),
              logicalName: crmReference.category === 'opportunity' ? 'opportunity' : 'itarapro_project',
              name:
                crmReference.category === 'opportunity'
                  ? crmReference.opportunityName || crmReference.label
                  : crmReference.displayTitle || crmReference.label
            }
          : null) || storedRegarding;
      const existingActivityId = String(task.crmActivityId || '').trim();
      const isAlreadyClosedCrmActivity =
        !!existingActivityId &&
        task.status === 'Zakończone' &&
        !!task.crmSyncedAt &&
        !task.crmClosePending;

      if (isAlreadyClosedCrmActivity) {
        return {
          activityId: existingActivityId,
          closeWarning: ''
        };
      }

      const synced = existingActivityId
        ? await updateCrmTaskActivity({
            activityId: existingActivityId,
            task,
            dateKey: dKey,
            employeeName: selectedEmployee?.name || selectedEmployee?.fullName || '',
            regarding,
            crmScope: CRM_SESSION_SCOPE
          })
        : await createCrmTaskActivity({
            task,
            dateKey: dKey,
            employeeName: selectedEmployee?.name || selectedEmployee?.fullName || '',
            regarding,
            crmScope: CRM_SESSION_SCOPE
          });

      let closeWarning = '';
      if (task.status === 'Zakończone' && synced.activityId) {
        try {
          await closeCrmTaskActivity(synced.activityId, null, CRM_SESSION_SCOPE);
        } catch (closeErr) {
          closeWarning =
            closeErr instanceof Error
              ? closeErr.message
              : 'Nie udało się automatycznie zamknąć działania w CRM.';
        }
      }

      return {
        activityId: synced.activityId,
        closeWarning
      };
    },
    [crmConnected, crmProjects, dKey, selectedEmployee]
  );

  const sendTasksToManager = async () => {
    if (!selectedEmployee || sendingTasks) return;
    if (selectedTaskIds.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('Zaznacz zadania, aby je wysłać.');
      }
      return;
    }
    const tasksToSendIds = selectedSendableIds;
    if (!tasksToSendIds.length) {
      if (typeof window !== 'undefined') {
        window.alert('Brak zaznaczonych zadań do wysłania.');
      }
      return;
    }
    const requestContext = { employeeId: selectedEmployee.id, dateKey: dKey };
    setSendingTasks(true);
    setError(null);
    const now = new Date().toISOString();
    const selectedSet = new Set(tasksToSendIds);
    let nextItems = taskItems.map((item) => ({ ...item }));
    const closeWarnings = [];
    try {
      const selectedTravelTasks = nextItems.filter((item) => selectedSet.has(item.id) && item.travelManaged);
      if (selectedTravelTasks.some((item) => !String(item.crmActivityId || '').trim())) {
        const syncedTravel = await syncTravelToCrm();
        if (!syncedTravel) {
          throw new Error('Nie udało się zsynchronizować przejazdów delegacji z CRM.');
        }
        nextItems = mergeTravelTripTasks(nextItems, syncedTravel);
      }

      for (const taskId of tasksToSendIds) {
        const itemIndex = nextItems.findIndex((item) => item.id === taskId);
        if (itemIndex === -1) continue;
        const currentTask = {
          ...nextItems[itemIndex],
          workKind: wkOf(nextItems[itemIndex])
        };
        if (currentTask.travelManaged) {
          nextItems[itemIndex] = {
            ...currentTask,
            crmSyncedAt: currentTask.crmSyncedAt || now,
            crmClosePending: false
          };
        } else {
          const synced = await syncTaskToCrm(currentTask);
          nextItems[itemIndex] = {
            ...currentTask,
            crmActivityId: synced.activityId,
            crmSyncedAt: now,
            crmClosePending: currentTask.status === 'Zakończone' && !!synced.closeWarning
          };
          if (synced.closeWarning) {
            closeWarnings.push(`• ${currentTask.subject || currentTask.project || currentTask.id}: ${synced.closeWarning}`);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (typeof window !== 'undefined') {
        window.alert(message);
      }
      setSendingTasks(false);
      return;
    }

    nextItems.forEach((item) => {
      if (!selectedSet.has(item.id)) return;
      item.workKind = wkOf(item);
      item.locked = true;
      item._syncState = 'SENT';
      item.prevSyncState = 'SENT';
      item.sent = true;
    });
    const reported = computeReported(nextItems);
    const dayState = computeDayStatus(nextItems, planned);
    const planId = sentDay?.id || planIdFor(selectedEmployee.id, dKey);
    const base = sentDay
      ? sanitizePlan(sentDay)
        : {
          id: planId,
          employeeId: selectedEmployee.id,
          date: dKey,
          shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
          note: draftDay.note || '',
          travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
          sent: false,
          sentAt: null,
          logs: []
        };
    const submissionStatus = nextItems.some((task) => task._syncState === 'SENT')
      ? 'SUBMITTED'
      : 'DRAFT';
    const submission = {
      ...(base.submission || {}),
      items: nextItems,
      status: submissionStatus,
      submittedAt: now,
      reportedMinutes: reported,
      dayStatus: dayState
    };
    const nextPlanState = {
      ...base,
      id: planId,
      employeeId: selectedEmployee.id,
      date: dKey,
      shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
      note: draftDay.note || '',
      travelRequest: getPersistedTravelRequest(draftDay.travelRequest),
      sent: base.sent || false,
      sentAt: base.sentAt || null,
      submission
    };

    const planMessages = describePlanChanges(base, nextPlanState);
    const taskMessages = describeTaskChanges(base.submission?.items || [], nextItems);

    const logs = buildTaskLogs({
      baseLogs: base.logs,
      planMessages,
      taskMessages,
      now,
      actorLabel: 'Pracownik',
      submitCount: tasksToSendIds.length,
      planEditType: 'EMP_PLAN_EDIT',
      taskEditType: 'EMP_TASK_EDIT',
      submitType: 'EMP_SUBMIT'
    });

    const payload = {
      ...nextPlanState,
      submission: {
        ...submission,
        items: submission.items.map(({ _syncState, prevSyncState, ...rest }) => rest)
      },
      logs
    };
    try {
      await savePlan(payload);
      setPlansByDate((prev) => {
        const current = prev[dKey];
        if (current && deepEqual(current, payload)) return prev;
        return { ...prev, [dKey]: payload };
      });
      const nextDraft = { ...payload, dirty: false };
      if (!isStaleContext(requestContext)) {
        setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
        setSubDraft((prev) => ({
          ...prev,
          status: submissionStatus,
          submittedAt: now,
          dayStatus: dayState,
          items: nextItems
        }));
        setSelectedTaskIds([]);
        closeTaskActions();
      }
      if (typeof window !== 'undefined') {
        const warningSuffix = closeWarnings.length
          ? `\n\nUwaga: część działań zapisano w CRM, ale nie udało się ich automatycznie zamknąć:\n${closeWarnings.join('\n')}`
          : '';
        window.alert(`Zadania wysłane do CRM i do kierownika.${warningSuffix}`);
      }
      await refreshEmployeePlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingTasks(false);
    }
  };

  const statusByDate = useMemo(() => {
    const map = {};
    Object.values(plansByDate || {}).forEach((plan) => {
      if (!plan?.date) return;
      const shiftsArr = plan.shifts || [];
      const planMinutes = shiftsArr.reduce((acc, shift) => acc + (toMinutes(shift.end) - toMinutes(shift.start)), 0);
      const items = plan.submission?.items || [];
      const reported = plan.submission?.reportedMinutes ?? computeReported(items);
      const closed = items.length > 0 && items.every((task) => task.status === 'Zakończone');
      const settled = plan.submission && planMinutes > 0 && reported >= planMinutes && closed;
      const hasPlanContent =
        shiftsArr.length > 0 ||
        String(plan.note || '').trim().length > 0 ||
        items.length > 0;
      map[plan.date] = settled ? 'SETTLED' : hasPlanContent ? 'PLANNED' : 'NONE';
    });
    return map;
  }, [plansByDate]);

  const modeByDate = useMemo(() => {
    const map = {};
    Object.values(plansByDate || {}).forEach((plan) => {
      if (!plan?.date) return;
      const shiftsArr = plan.shifts || [];
      const anyAbsence = shiftsArr.some((shift) =>
        ['VACATION', 'SICK', 'ABSENCE'].includes(shift.mode)
      );
      map[plan.date] = anyAbsence ? 'VACATION' : shiftsArr[0]?.mode;
    });
    return map;
  }, [plansByDate]);

  const yearMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

  const monthlyLogsSel = useMemo(
    () => monthlyLogs.filter((log) => log.ym === yearMonth),
    [monthlyLogs, yearMonth]
  );

  const logsList = useMemo(() => {
    const combined = [...monthlyLogsSel, ...(sentDay?.logs || [])];
    return combined.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }, [monthlyLogsSel, sentDay?.logs]);

  const isAbsenceDay =
    shifts.length > 0 && shifts.every((shift) => ['VACATION', 'SICK', 'ABSENCE'].includes(shift.mode));

  const selectedTravelMinutes = taskItems.reduce((acc, item) => {
    if (item.type !== 'Przejazd' || !item.start || !item.end) return acc;
    return acc + (toMinutes(item.end) - toMinutes(item.start));
  }, 0);
  const selectedWorkMinutesRaw = taskItems.reduce((acc, item) => {
    if (item.type === 'Przejazd' || !item.start || !item.end) return acc;
    return acc + (toMinutes(item.end) - toMinutes(item.start));
  }, 0);
  const selectedPlanReportedRaw = taskItems.reduce((acc, item) => {
    if (!item.start || !item.end) return acc;
    return acc + (toMinutes(item.end) - toMinutes(item.start));
  }, 0);
  const selectedPlanReported = isAbsenceDay ? 0 : selectedWorkMinutesRaw;
  const reportedWithinPlan = Math.min(selectedPlanReported, planned);
  const reportedOvertime = Math.max(selectedPlanReported - reportedWithinPlan, 0);
  const reportedPlanLabel =
    planned > 0
      ? `${formatCompactDuration(reportedWithinPlan)} Planowo`
      : formatCompactDuration(reportedWithinPlan);
  const reportedOvertimeLabel =
    reportedOvertime > 0 ? `${formatCompactDuration(reportedOvertime)} nadgodzin` : null;
  const reportedTravelLabel =
    selectedTravelMinutes > 0 ? `${formatCompactDuration(selectedTravelMinutes)} godzin przejazdowych` : null;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-700 px-4 py-3">
          Błąd podczas pobierania danych: {error}
        </div>
      </div>
    );
  }

  if (loadingDirectory && managers.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" /> Wczytywanie danych...
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl p-6 space-y-6 text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <img src={Logo} alt="IBCS Planner logo" className="w-14 h-14 object-cover" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Panel pracownika</h1>
            <p className="text-slate-500 flex items-center gap-2">
              <Users className="w-4 h-4" /> Zarządzaj swoim planem i zadaniami
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {crmConnected && (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
              <Plug className="w-3 h-3" />
              <span className="flex items-center gap-1">
                Połączenie z CRM
                {crmUser?.login && (
                  <span className="text-[11px] font-normal text-emerald-500 sm:text-xs">
                    {crmUser.login}
                    {crmUser?.domain ? `@${crmUser.domain}` : ''}
                  </span>
                )}
              </span>
            </span>
          )}
          <div className="relative" ref={actionsMenuRef}>
            <button
              type="button"
              onClick={() => setActionsMenuOpen((open) => !open)}
              className={BTN}
              aria-haspopup="true"
              aria-expanded={actionsMenuOpen}
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {actionsMenuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border-2 border-slate-200 bg-white shadow-xl p-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setCrmError('');
                    setCrmModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                >
                  <Plug className="w-4 h-4" /> Integracja z CRM
                </button>
                <button
                  type="button"
                  onClick={openCrmAbsences}
                  disabled={!crmConnected}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <Briefcase className="w-4 h-4" /> Urlopy
                </button>
                <button
                  type="button"
                  onClick={handleCrmLogout}
                  disabled={!crmConnected}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <LogOut className="w-4 h-4" /> Wyloguj
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setCalendarOpen((o) => !o)} className={BTN} aria-label="Pokaż/ukryj kalendarz">
            <CalIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className={cls('grid gap-6', calendarOpen ? 'lg:grid-cols-[260px_1fr_360px]' : 'lg:grid-cols-[260px_1fr]')}>
        <aside className={cls(CARD, 'h-fit sticky top-6')}>
          {fixedEmployeeProfile && (
            <div className="mb-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">TWOJE KONTO</div>
              <div className="mt-2 text-base font-semibold text-slate-800">{employeeProfile?.name || '—'}</div>
              <div className="mt-1 text-sm text-slate-500">
                {[employeeProfile?.role, employeeProfile?.employmentType].filter(Boolean).join(' • ') || '—'}
              </div>
            </div>
          )}
          <PickerSection
            title="Kierownicy"
            icon={Users}
            count={(managers || []).length}
            items={managers}
            selectedId={selectedManager?.id}
            onSelect={(manager) => setSelectedManager(manager)}
          />
          <PickerSection
            title="Pracownicy"
            icon={Users}
            count={(managedList || []).length}
            items={managedList || []}
            selectedId={selectedEmployee?.id || null}
            onSelect={(item) => {
              const emp = employees.find((e) => e.id === item.id);
              setSelectedEmployee(emp || null);
            }}
          />
        </aside>

        <section className={CARD}>
          {crmAbsencesOpen ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">
                  Urlopy i nieobecności – <span className="text-slate-600">{selectedEmployee?.name ?? '—'}</span>
                </div>
                <button onClick={() => setCrmAbsencesOpen(false)} className={BTN}>
                  Zamknij
                </button>
              </div>
              <div className="text-sm text-slate-500 mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Dane pobrane z CRM dla wybranego pracownika
              </div>
              {crmAbsencesError && (
                <div className="mb-3 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{crmAbsencesError}</div>
              )}
              {crmAbsencesLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Pobieram urlopy z CRM...
                </div>
              ) : crmAbsences.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  Brak urlopów lub nieobecności w CRM dla wybranego pracownika.
                </div>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {crmAbsences.map((item) => (
                      <div key={item.id} className="px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800">{item.reasonLabel || 'Nieobecność'}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {item.from || '—'}
                              {item.until && item.until !== item.from ? ` – ${item.until}` : ''}
                            </div>
                          </div>
                          <span
                            className={cls(
                              'inline-flex items-center rounded-full border px-2.5 py-1 text-xs whitespace-nowrap',
                              item.stateCode === 0
                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            )}
                          >
                            {item.statusLabel}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          {item.days ? `${item.days} dni` : '—'}
                          {item.description ? ` • ${item.description}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">
                  Plan dnia – <span className="text-slate-600">{selectedEmployee?.name ?? '—'}</span>
                </div>
              {dayStatus !== 'NONE' && (
                <span
                  className={cls(
                    CHIP,
                    dayStatus === 'SENT'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-violet-50 border-violet-300 text-violet-700'
                  )}
                >
                  {dayStatus === 'SENT' ? 'Wysłane' : 'Edytowane'}
                </span>
              )}
              </div>
              <div className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {selectedDate.toLocaleDateString('pl-PL', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>
              {!isViewingOwnProfile && (
                <div className="mb-3 rounded-xl border-2 border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                  Tryb podglądu. Oglądasz plan innego pracownika, więc edycja i wysyłka są zablokowane.
                </div>
              )}

              {planCollapsed ? (
            <>
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 space-y-3">
                {shifts.length > 0 ? (
                  <>
                    <ul className="space-y-2 text-sm">
                      {shifts.map((segment, idx) => {
                        const meta = MODE_META[segment.mode || 'OFFICE'];
                        const hasTimes = segment.start && segment.end;
                        const timeLabel = hasTimes ? `${segment.start} - ${segment.end}` : '—';
                        const note = segment.note ? ` - ${segment.note}` : '';
                        return (
                          <li key={idx} className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex-1 text-sm text-slate-600">
                              <span className="text-base font-semibold text-slate-700">{timeLabel}</span>
                              {note && <span className="text-sm text-slate-500">{note}</span>}
                            </div>
                            <span
                              className={cls(
                                CHIP,
                                meta?.base,
                                meta?.border,
                                meta?.text
                              )}
                            >
                              <span className={cls('inline-block h-2 w-2 rounded-full', meta?.dot)} /> {meta?.label || '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="text-sm text-slate-500">
                      Łącznie: <span className="text-base font-semibold text-slate-700">{minutesToHHmm(planned)}</span>
                    </div>
                    {draftDay.note && (
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Notatka:</span> {draftDay.note}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Brak zakresów czasu.</div>
                )}
              </div>
              {hasTravelShift && (
                <DelegationCard
                  travelRequest={draftDay.travelRequest || {}}
                  onFieldPatch={setTravelField}
                  onSelectRegarding={handleTravelRegardingSelect}
                  onAddTrip={addTravelTrip}
                  onTripFieldChange={setTravelTripField}
                  onRemoveTrip={removeTravelTrip}
                  onSync={syncTravelToCrm}
                  crmProjects={crmProjects}
                  crmProjectsLoading={crmProjectsLoading}
                  crmProjectsError={crmProjectsError}
                  crmVehicles={crmVehicles}
                  crmVehiclesLoading={crmVehiclesLoading}
                  crmVehiclesError={crmVehiclesError}
                  crmConnected={crmConnected}
                  syncLoading={crmTravelSaving}
                  syncError={crmTravelError}
                  readOnly={!isViewingOwnProfile}
                  onDelete={deleteTravelFromCrm}
                  deleteLoading={crmTravelDeleting}
                />
              )}
            </>
              ) : (
            <>
              <div className="space-y-3">
                {shifts.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Brak zakresów czasu. Dodaj pierwszy segment.
                  </div>
                )}
                {shifts.map((segment, idx) => {
                  const disableTimes = ['VACATION', 'SICK', 'ABSENCE'].includes(segment.mode);
                  return (
                    <div key={idx} className="rounded-xl border-2 border-slate-300 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <label className="text-sm block">
                          Start
                          <TimeSelect
                            value={segment.start}
                            onChange={(value) => setSegField(idx, 'start', value)}
                            disabled={!isViewingOwnProfile || disableTimes}
                            size="plan"
                          />
                        </label>
                        <label className="text-sm block">
                          Koniec
                          <TimeSelect
                            value={segment.end}
                            onChange={(value) => setSegField(idx, 'end', value)}
                            disabled={!isViewingOwnProfile || disableTimes}
                            size="plan"
                          />
                        </label>
                        <label className="text-sm block">
                          Tryb pracy
                          <ModeChooser
                            value={segment.mode || 'OFFICE'}
                            onChange={(mode) => setSegField(idx, 'mode', mode)}
                            disabled={!isViewingOwnProfile}
                          />
                        </label>
                        <div className="flex items-center justify-end">
                          {shifts.length > 1 && (
                            <button
                              onClick={() => delSegment(idx)}
                              className="rounded-lg border-2 border-slate-300 px-2 py-2 hover:bg-slate-50"
                              aria-label="Usuń segment"
                              disabled={!isViewingOwnProfile}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <label className="text-sm block mt-2">
                        Notatka
                        <input
                          value={segment.note || ''}
                          onChange={(e) => setSegField(idx, 'note', e.target.value)}
                          className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2 min-w-0"
                          placeholder="np. notatka"
                          disabled={!isViewingOwnProfile}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              {planned > 480 && (
                <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                  Przekroczono 8 h – łączny plan dnia to {minutesToHHmm(planned)}.
                </div>
              )}

              <div className="relative mt-4 pt-3 border-t flex items-center justify-between gap-2">
                {loadingPlans && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur rounded-xl z-10">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                  </div>
                )}
                <div className="text-xs text-slate-500">Łącznie: {minutesToHHmm(planned)}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addSegment}
                    disabled={!isViewingOwnProfile || planned >= 480}
                    className="rounded-full border-2 border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Dodaj zakres"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={sendPlanToManager} className={BTN} disabled={!isViewingOwnProfile || sendingPlan}>
                    {sendingPlan ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Wysyłanie...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-emerald-600" /> Wyślij
                      </>
                    )}
                  </button>
                </div>
              </div>

              {hasTravelShift && (
                <DelegationCard
                  travelRequest={draftDay.travelRequest || {}}
                  onFieldPatch={setTravelField}
                  onSelectRegarding={handleTravelRegardingSelect}
                  onAddTrip={addTravelTrip}
                  onTripFieldChange={setTravelTripField}
                  onRemoveTrip={removeTravelTrip}
                  onSync={syncTravelToCrm}
                  crmProjects={crmProjects}
                  crmProjectsLoading={crmProjectsLoading}
                  crmProjectsError={crmProjectsError}
                  crmVehicles={crmVehicles}
                  crmVehiclesLoading={crmVehiclesLoading}
                  crmVehiclesError={crmVehiclesError}
                  crmConnected={crmConnected}
                  syncLoading={crmTravelSaving}
                  syncError={crmTravelError}
                  readOnly={!isViewingOwnProfile}
                  onDelete={deleteTravelFromCrm}
                  deleteLoading={crmTravelDeleting}
                />
              )}

              {logsList.length > 0 && (
                <div className="mt-4 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                  <div className="text-sm font-medium mb-2">Logi</div>
                  <ul className="space-y-2 text-sm">
                    {logsList.map((log, idx) => {
                      const type = log.type || '';
                      const IconComponent = (() => {
                        if (type === 'EMP_SUBMIT' || type === 'SENT' || type === 'PLAN_SUMMARY') return Send;
                        if (type === 'EMP_TASK_EDIT' || type === 'TASK_SUBMIT') return Settings;
                        if (type === 'AUTO_MONTH') return CalIcon;
                        return Pencil;
                      })();
                      const who = type.startsWith('EMP_') ? 'Pracownik' : 'Kierownik';
                      const action = (() => {
                        switch (type) {
                          case 'EMP_PLAN_EDIT':
                          case 'MAN_PLAN_EDIT':
                          case 'EMP_PLAN_MOD':
                            return 'Aktualizacja planu';
                          case 'EMP_TASK_EDIT':
                            return 'Zmiany w zadaniach';
                          case 'EMP_SUBMIT':
                            return 'Wysłano zadania';
                          case 'SENT':
                            return 'Wysłano plan';
                          case 'PLAN_SUMMARY':
                            return 'Podsumowanie planu';
                          case 'TASK_SUBMIT':
                            return 'Wysłano zadania';
                          case 'AUTO_MONTH':
                            return 'Planowanie';
                          default:
                            return 'Aktualizacja';
                        }
                      })();
                      return (
                        <li key={`${log.at}-${idx}`} className="flex items-start gap-2">
                          <IconComponent className="w-4 h-4 text-slate-700 mt-0.5" />
                          <div>
                            <div className="text-slate-700">
                              {who}: {action}{' '}
                              <span className="text-slate-400">
                                • {log.at ? new Date(log.at).toLocaleString('pl-PL') : '—'}
                              </span>
                            </div>
                            <div className="text-slate-600 whitespace-pre-line">{stripActor(log.text)}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
              )}

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setPlanCollapsed((prev) => !prev)}
                  className="rounded-full border-2 border-slate-300 p-1.5 hover:bg-slate-50 transition-colors"
                  aria-label={planCollapsed ? 'Rozwiń plan' : 'Zwiń plan'}
                >
                  <ChevronDown className={cls('w-4 h-4 transition-transform', !planCollapsed && 'rotate-180')} />
                </button>
              </div>
            </>
          )}
        </section>

        {calendarOpen && (
          <aside className={cls(CARD, 'h-fit sticky top-6')}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium flex items-center gap-2">
                <CalIcon className="w-4 h-4" /> Kalendarz
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                  className="rounded-full border-2 border-slate-300 p-2 hover:bg-slate-50"
                  aria-label="Poprzedni miesiąc"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                  className="rounded-full border-2 border-slate-300 p-2 hover:bg-slate-50"
                  aria-label="Następny miesiąc"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-3">{plMonth(monthCursor)}</p>
            <EmployeeCalendar
              monthStart={monthCursor}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              statusByDate={selectedEmployee ? statusByDate : {}}
              modeByDate={selectedEmployee ? modeByDate : {}}
            />
          </aside>
        )}
      </div>

      <section className={CARD}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Zadania (wysyłane do kierownika)</div>
        </div>
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className={`${CHIP} ${DAY_STATUS_STYLES[displayDayStatus]}`}>{displayDayStatus}</span>
          <span className="text-slate-400">|</span>
          <span className="text-base font-semibold text-slate-700">
            Plan: {spanStart && spanEnd ? `${spanStart}–${spanEnd}` : '—'} ({minutesToHHmm(planned)} h)
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-base font-semibold text-slate-700">
            Zgłoszono: {reportedPlanLabel}
            {reportedOvertimeLabel ? (
              <>
                {' + '}
                <span className="text-rose-600 font-semibold">{reportedOvertimeLabel}</span>
              </>
            ) : null}
            {reportedTravelLabel ? (
              <>
                {' + '}
                <span className="font-semibold text-violet-600">{reportedTravelLabel}</span>
              </>
            ) : null}
          </span>
        </div>
        {(!crmConnected || crmProjectsLoading || crmProjectsError || crmProjects.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
            {!crmConnected && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Plug className="w-3 h-3" /> Zaloguj się do CRM, aby pobrać projekty, importować działania i wysyłać zadania na swoje konto CRM.
              </span>
            )}
            {crmProjectsLoading && (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie listy projektów z CRM...
              </span>
            )}
            {!crmProjectsLoading && crmProjectsError && (
              <>
                <span className="inline-flex items-center gap-1 text-rose-600">
                  {crmProjectsError}
                </span>
                <button onClick={refreshCrmProjects} className="underline text-slate-600">
                  Spróbuj ponownie
                </button>
              </>
            )}
            {!crmProjectsLoading && !crmProjectsError && crmProjects.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Plug className="w-3 h-3" /> Lista projektów CRM dostępna ({crmProjects.length})
              </span>
            )}
          </div>
        )}
        {taskItems.length === 0 && (
          <p className="text-sm text-slate-500">Brak zadań. Dodaj pierwsze.</p>
        )}
        {taskItems.length > 0 && (
          <div className="overflow-x-auto overflow-y-visible rounded-xl border-2 border-slate-300">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleAllTasks}
                      className={cls(
                        'inline-flex items-center justify-center h-6 w-6 rounded-full border-2 transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-400 focus:ring-offset-2',
                        allTasksSelected
                          ? 'border-sky-500 bg-sky-50 text-sky-600 shadow-md'
                          : 'border-slate-300 bg-slate-100 text-slate-400 hover:border-sky-300 hover:bg-slate-50 hover:shadow-md'
                      )}
                      aria-pressed={allTasksSelected}
                      aria-label={allTasksSelected ? 'Odznacz wszystkie zadania' : 'Zaznacz wszystkie zadania'}
                      disabled={!isViewingOwnProfile}
                    >
                      {allTasksSelected ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="block h-2 w-2 rounded-full bg-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-2 text-left">Tryb pracy</th>
                  <th className="p-2 text-left">Temat</th>
                  <th className="p-2 text-left">Dotyczy</th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">Koniec</th>
                  <th className="p-2 text-left">Rodzaj</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Stan</th>
                  <th className="p-2 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {taskItems.map((item, index) => (
                  <TaskRow
                    key={`${selectedEmployee?.id || 'none'}:${dKey}:${item.id}`}
                    selected={selectedTaskIds.includes(item.id)}
                    onToggleSelect={toggleTaskSelection}
                    task={item}
                    menuRect={taskActionsMenu.rect}
                    activeTaskId={taskActionsMenu.id}
                    registerAnchor={registerTaskActionAnchor}
                    onToggleMenu={toggleTaskActions}
                    onFieldChange={handleTaskFieldChange}
                    onLock={handleTaskLock}
                    onUnlock={handleTaskUnlock}
                    onExport={handleTaskExport}
                    onDelete={handleTaskDelete}
                    onEditStart={handleTaskEditStart}
                    computeWorkKind={wkOf}
                    crmProjectsLoading={crmProjectsLoading}
                    crmProjects={crmProjects}
                    previousTask={index > 0 ? taskItems[index - 1] : null}
                    nextTask={index < taskItems.length - 1 ? taskItems[index + 1] : null}
                    readOnly={!isViewingOwnProfile}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {outlookMenu.task && outlookMenu.anchor && outlookAnchorRect &&
          createPortal(
            <div
              data-outlook-options-menu
              className="z-50 w-60 rounded-2xl border border-slate-200 bg-white shadow-2xl p-1 text-sm"
              style={{
                position: 'fixed',
                top: outlookAnchorRect.bottom + 8,
                left: outlookAnchorRect.left + outlookAnchorRect.width / 2,
                transform: 'translate(-50%, 0)'
              }}
            >
              <button
                data-outlook-options-menu
                type="button"
                onClick={() => {
                  openOutlookWeb(outlookMenu.task);
                  requestAnimationFrame(() => closeTaskActions());
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <LogIn className="w-4 h-4" /> Outlook Web
              </button>
              <button
                data-outlook-options-menu
                type="button"
                onClick={() => {
                  downloadTaskICS(outlookMenu.task);
                  requestAnimationFrame(() => closeTaskActions());
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> Pobierz plik ICS
              </button>
            </div>,
            document.body
          )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!selectedTaskIds.length) return;
                const confirmed = typeof window === 'undefined'
                  ? true
                  : window.confirm(
                      'Czy na pewno usunąć zaznaczone zadania?\n\nUsunięcie spowoduje również usunięcie powiązanego zadania z CRM.'
                    );
                if (!confirmed) return;
                deleteTasksByIds(selectedTaskIds);
              }}
              className={cls(
                BTN,
                'border-rose-300 text-rose-600 hover:bg-rose-50'
              )}
              disabled={!isViewingOwnProfile || !selectedTaskIds.length}
            >
              <Trash2 className="w-4 h-4" /> Usuń
            </button>
            <button onClick={importPlanToTasks} className={BTN} disabled={!isViewingOwnProfile || crmImportingTasks}>
              {crmImportingTasks ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              {crmImportingTasks ? 'Pobieram z CRM' : 'Importuj plan'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addTask} className={BTN} disabled={!isViewingOwnProfile}>
              <Plus className="w-4 h-4" /> Dodaj zadanie
            </button>
            <button
              onClick={sendTasksToManager}
              className={cls(
                BTN,
                (!isViewingOwnProfile || !canSendTasks || sendingTasks) && 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100'
              )}
              disabled={!isViewingOwnProfile || !canSendTasks || sendingTasks}
            >
              {sendingTasks ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Wysyłanie...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-emerald-600" /> Wyślij
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={crmModalOpen}
        title="Integracja z CRM"
        onClose={() => {
          setCrmModalOpen(false);
          setCrmError('');
        }}
        actions={
          <>
            <button
              onClick={() => {
                setCrmModalOpen(false);
                setCrmError('');
              }}
              className={BTN}
            >
              Zamknij
            </button>
            <button
              type="submit"
              form="employee-crm-integration-form"
              className={cls(
                'rounded-xl px-3 py-2 text-sm text-white',
                crmLoading ? 'bg-slate-400 cursor-wait' : 'bg-slate-800 hover:bg-slate-900'
              )}
              disabled={crmLoading}
            >
              {crmLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Łączenie...
                </span>
              ) : (
                'Połącz'
              )}
            </button>
          </>
        }
      >
        <form id="employee-crm-integration-form" onSubmit={handleCrmSubmit} className="grid gap-3">
          {crmConnected && (
            <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Plug className="w-4 h-4" />
              <div>
                <div className="font-medium">Połączenie z CRM ustanowione</div>
                {crmUser?.login && (
                  <div className="text-xs text-emerald-600">
                    Zalogowano jako {crmUser.login}
                    {crmUser?.domain ? `@${crmUser.domain}` : ''}
                  </div>
                )}
              </div>
            </div>
          )}
          {crmError && (
            <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{crmError}</div>
          )}
          <label className="text-sm block">
            Login
            <input
              value={crmCredentials.login}
              onChange={(e) => {
                setCrmCredentials((prev) => ({ ...prev, login: e.target.value }));
                if (crmError) setCrmError('');
              }}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="np. jan.kowalski"
              disabled={crmLoading}
            />
          </label>
          <label className="text-sm block">
            Hasło
            <input
              type="password"
              value={crmCredentials.password}
              onChange={(e) => {
                setCrmCredentials((prev) => ({ ...prev, password: e.target.value }));
                if (crmError) setCrmError('');
              }}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="••••••••"
              disabled={crmLoading}
            />
          </label>
          <div className="text-xs text-slate-500">
            Domena CRM: <span className="font-medium text-slate-700">{CRM_FIXED_DOMAIN}</span>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
