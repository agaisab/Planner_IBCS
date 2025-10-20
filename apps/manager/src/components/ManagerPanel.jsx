import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar as CalIcon,
  CalendarDays,
  Users,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  Printer,
  Settings,
  Download,
  Menu
} from 'lucide-react';
import {
  cls,
  ymd,
  plMonth,
  timeOptions15,
  toMinutes,
  minutesToHHmm,
  computeReported,
  computeWorkKindFor,
  getPlanSpanMins,
  MODE_META,
  TASK_TYPE_COLORS,
  STATUS_STYLES,
  WORKKIND_STYLES,
  DAY_STATUS_STYLES,
  fetchManagers,
  createManager,
  updateManager,
  deleteManager,
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchPlansForEmployee,
  fetchPlanById,
  savePlan,
  patchPlan,
  fetchMonthlyLogs,
  createMonthlyLog,
  deleteMonthlyLogsForEmployee,
  deletePlan,
  deepEqual,
  useEmployeePlans,
  summarizePlan,
  buildPlanLogs
} from '@planner/shared';
import Logo from '../assets/ibcs-logo.png';

const BTN =
  'inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const CARD = 'rounded-2xl border-2 border-slate-300 bg-white shadow-sm p-4';
const CHIP = 'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm';

const planIdFor = (employeeId, dateKey) => `${employeeId}_${dateKey}`;

const sanitizePlan = (plan) => {
  if (!plan) return plan;
  const clone = globalThis.structuredClone
    ? globalThis.structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
  const copy = clone || {};
  delete copy.dirty;
  return copy;
};

const MotionDiv = motion.div;

const formatTimeLabel = (value) => {
  if (!value) return '—';
  return value === '24:00' ? '00:00' : value;
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
    const prevShiftNote = (prevShift.note || '').trim();
    const nextShiftNote = (nextShift.note || '').trim();
    if (prevShiftNote !== nextShiftNote) {
      if (!prevShiftNote && nextShiftNote) parts.push(`dodano notatkę "${nextShiftNote}"`);
      else if (prevShiftNote && !nextShiftNote) parts.push(`usunięto notatkę "${prevShiftNote}"`);
      else parts.push(`notatka "${prevShiftNote}" → "${nextShiftNote}"`);
    }

    if (parts.length) messages.push(`Zmieniono ${label}: ${parts.join(', ')}`);
  }

  return messages;
};

const splitTasksByPlanStart = (items, planSpan, date, shifts) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const NIGHT_START = 22 * 60;
  const NIGHT_END = 6 * 60;
  const MINUTES_IN_DAY = 24 * 60;
  const DEFAULT_CORE_START = 8 * 60;
  const DEFAULT_CORE_END = 16 * 60;

  const boundaries = new Set([NIGHT_END, NIGHT_START, DEFAULT_CORE_START, DEFAULT_CORE_END]);
  if (planSpan?.start != null) boundaries.add(planSpan.start);
  if (planSpan?.end != null) boundaries.add(planSpan.end);

  const orderedBoundaries = Array.from(boundaries)
    .filter((value) => Number.isFinite(value) && value > 0 && value < MINUTES_IN_DAY)
    .sort((a, b) => a - b);

  const result = [];

  items.forEach((item) => {
    if (!item?.start || !item?.end) {
      result.push(item);
      return;
    }

    let segments = [{ ...item }];
    orderedBoundaries.forEach((boundary) => {
      segments = segments.flatMap((segment) => {
        const startMinutes = toMinutes(segment.start);
        const endMinutes = toMinutes(segment.end);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes >= endMinutes) {
          return [segment];
        }
        if (startMinutes < boundary && endMinutes > boundary) {
          const boundaryLabel = minutesToHHmm(boundary);
          const baseId = item.id || `task-${boundary}-${startMinutes}`;
          const head = {
            ...segment,
            id: `${baseId}#${boundaryLabel}-a`,
            end: boundaryLabel
          };
          const tail = {
            ...segment,
            id: `${baseId}#${boundaryLabel}-b`,
            start: boundaryLabel
          };
          return [head, tail];
        }
        return [segment];
      });
    });

    segments.forEach((segment, index) => {
      const startMinutes = toMinutes(segment.start);
      const endMinutes = toMinutes(segment.end);
      const baseId = item.id || `task-${index}`;
      const segmentId = segments.length === 1 ? baseId : `${baseId}#${index}`;
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes >= endMinutes) {
        result.push({ ...segment, id: segmentId });
        return;
      }
      result.push({
        ...segment,
        id: segmentId,
        workKind: computeWorkKindFor(segment, date, shifts)
      });
    });
  });

  return result;
};

function TimeSelect({ value, onChange, placeholder, disabled }) {
  const v = value ?? '';
  const opts = v && !timeOptions15.includes(v) ? [v, ...timeOptions15] : timeOptions15;
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="mt-1 w-full max-w-[7rem] rounded-xl border-2 border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
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

function ModeChooser({ value, onChange }) {
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
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={`${CHIP} ${meta.base} ${meta.border} ${meta.text}`}>
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
                  onChange(key);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg border ${
                  active ? `${current.base} ${current.border} ${current.text}` : 'border-transparent hover:bg-slate-50 text-slate-700'
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

function PickerSection({ title, icon: IconComponent, count, items, selectedId, onSelect, onCreate, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const ordered = useMemo(() => {
    const selected = items.find((item) => item.id === selectedId);
    const rest = items.filter((item) => item.id !== selectedId);
    return selected ? [selected, ...rest] : items;
  }, [items, selectedId]);
  const visible = open ? ordered : ordered.slice(0, 1);

  useEffect(() => {
    if (!actionsOpenId) return;
    const handler = (event) => {
      if (event.target.closest('[data-picker-actions]')) return;
      setActionsOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [actionsOpenId]);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <IconComponent className="w-4 h-4" /> {title}
        </div>
        <div className="flex items-center gap-2">
          {typeof count === 'number' && (
            <span className="text-xs text-slate-400">{count}</span>
          )}
          {onCreate && (
            <button onClick={onCreate} className="rounded-full border-2 border-slate-300 p-1.5 hover:bg-slate-50" aria-label="Dodaj">
              <Plus className="w-4 h-4" />
            </button>
          )}
          {items.length > 1 && (
            <button
              onClick={() => {
                setOpen((o) => !o);
                setActionsOpenId(null);
              }}
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
                'rounded-xl border-2 px-3 py-2',
                active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    onSelect(item);
                    setActionsOpenId(null);
                    setOpen(false);
                  }}
                  className="flex-1 text-left"
                >
                  <div className="font-medium truncate">{item.name}</div>
                  {item.subtitle && (
                    <div className={cls('text-xs', active ? 'text-slate-200' : 'text-slate-500')}>{item.subtitle}</div>
                  )}
                </button>
                {(onEdit || onDelete) && (
                  <div className="relative flex items-center" data-picker-actions>
                    <button
                      data-picker-actions
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionsOpenId((prev) => (prev === item.id ? null : item.id));
                      }}
                      className={cls(
                        'rounded-lg border px-2 py-1 transition-colors',
                        active
                          ? 'border-slate-700 text-white hover:bg-slate-800'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      )}
                      aria-label="Akcje"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    {actionsOpenId === item.id && (
                      <div
                        data-picker-actions
                        className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border-2 border-slate-300 bg-white shadow-lg p-1 text-sm"
                      >
                        {onEdit && (
                          <button
                            data-picker-actions
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsOpenId(null);
                              onEdit(item);
                            }}
                            className={cls(
                              'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                              active ? 'text-slate-800 hover:bg-slate-200' : 'text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <Pencil className="w-4 h-4" /> Edytuj
                          </button>
                        )}
                        {onDelete && (
                          <button
                            data-picker-actions
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsOpenId(null);
                              onDelete(item);
                            }}
                            className={cls(
                              'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                              active ? 'text-slate-800 hover:bg-slate-200' : 'text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <Trash2 className="w-4 h-4" /> Usuń
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeCalendar({ monthStart, selectedDate, setSelectedDate, statusByDate, modeByDate }) {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const first = new Date(y, m, 1);
  const start = (first.getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const dimPrev = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = start; i > 0; i--) cells.push({ d: new Date(y, m - 1, dimPrev - i + 1), outside: true });
  for (let i = 1; i <= dim; i++) cells.push({ d: new Date(y, m, i), outside: false });
  let next = 1;
  while (cells.length % 7) cells.push({ d: new Date(y, m + 1, next++), outside: true });
  const todayKey = ymd(new Date());

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 text-xs text-slate-500 mb-1">
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((day) => (
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
          const planned = 'bg-sky-100 border-sky-300 text-slate-900';
          const settled = 'bg-emerald-100 border-emerald-500 text-emerald-900';
          const absence = 'bg-red-100 border-red-500 text-red-900';
          const weekendCls = 'bg-slate-200 border-slate-300 text-slate-700';
          const none = `bg-white border-slate-300 ${outside ? 'text-slate-300' : ''}`;
          let tile = none;
          if (weekend) tile = weekendCls;
          if (!weekend) {
            if (status === 'SETTLED') tile = settled;
            else if (status === 'PLANNED') tile = planned;
          }
          if (
            (mode === 'VACATION' || mode === 'SICK' || mode === 'ABSENCE') &&
            (status === 'PLANNED' || status === 'SETTLED')
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
      <div className="mt-3 text-xs text-slate-500 flex items-center gap-4">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[6px] bg-sky-50 border border-sky-300" /> Zaplanowany
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[6px] bg-emerald-100 border-emerald-500" /> Rozliczony
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-red-500 bg-red-200" /> Nieobecność
        </span>
      </div>
    </div>
  );
}

export default function ManagerPanel() {
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
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
  const [managerPlanCollapsed, setManagerPlanCollapsed] = useState(true);

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empMode, setEmpMode] = useState('create');
  const [empDraft, setEmpDraft] = useState({
    id: '',
    name: '',
    role: 'Technik',
    employmentType: 'Pełen etat',
    managerId: '',
    email: ''
  });
  const [empConfirmOpen, setEmpConfirmOpen] = useState(false);
  const [empConfirmTarget, setEmpConfirmTarget] = useState(null);

  const [manModalOpen, setManModalOpen] = useState(false);
  const [manMode, setManMode] = useState('create');
  const [manDraft, setManDraft] = useState({ id: '', name: '' });
  const [manConfirmOpen, setManConfirmOpen] = useState(false);
  const [manConfirmTarget, setManConfirmTarget] = useState(null);

  const [autoOpen, setAutoOpen] = useState(false);
  const [modalMonth, setModalMonth] = useState(() => `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 2).padStart(2, '0')}`);

const [reportsOpen, setReportsOpen] = useState(false);
const [reportSelectedIds, setReportSelectedIds] = useState([]);
const [reportMonth, setReportMonth] = useState(() => `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`);
const [reportDetailed, setReportDetailed] = useState(false);
const [logsConfirmOpen, setLogsConfirmOpen] = useState(false);
const [logsClearing, setLogsClearing] = useState(false);
const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
const actionsMenuRef = useRef(null);

const selectedEmployeeId = selectedEmployee?.id;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingInitial(true);
      try {
        const [mgrs, emps] = await Promise.all([fetchManagers(), fetchEmployees()]);
        if (!active) return;
        setManagers(mgrs);
        setEmployees(emps);
        const defaultManager = mgrs[0] ?? null;
        setSelectedManager((prev) => prev ?? defaultManager);
        const defaultEmployee =
          emps.find((emp) => emp.managerId === defaultManager?.id) ?? emps[0] ?? null;
        setSelectedEmployee((prev) => prev ?? defaultEmployee);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoadingInitial(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedManager) {
      setSelectedEmployee(null);
      return;
    }
    const managed = employees.filter((emp) => emp.managerId === selectedManager.id);
    if (!managed.length) {
      setSelectedEmployee(null);
      return;
    }
    if (!selectedEmployee || selectedEmployee.managerId !== selectedManager.id) {
      setSelectedEmployee(managed[0]);
    }
  }, [selectedManager, employees, selectedEmployee]);

  const dKey = ymd(selectedDate);

  const {
    plansByDate: hookPlansByDate,
    logs: hookLogs,
    loading: hookLoading,
    error: hookError
  } = useEmployeePlans(selectedEmployee?.id, {
    fetchPlans: fetchPlansForEmployee,
    fetchLogs: fetchMonthlyLogs
  });

  useEffect(() => {
    if (!selectedEmployee?.id) {
      setPlansByDate({});
      setMonthlyLogs([]);
      setLoadingPlans(false);
      return;
    }
    setPlansByDate((prev) => (deepEqual(prev, hookPlansByDate) ? prev : hookPlansByDate));
    setMonthlyLogs((prev) => (deepEqual(prev, hookLogs) ? prev : hookLogs));
    setLoadingPlans(hookLoading);
    if (hookError) setError(hookError);
    setReportSelectedIds((prev) =>
      prev.length === 1 && prev[0] === selectedEmployee.id ? prev : [selectedEmployee.id]
    );
  }, [selectedEmployee?.id, hookPlansByDate, hookLogs, hookLoading, hookError]);

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
    setModalMonth(`${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 2).padStart(2, '0')}`);
    setReportMonth(`${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`);
  }, [monthCursor]);

  const sentDay = selectedEmployee ? plansByDate[dKey] || null : null;
  const createDraft = (plan) =>
    plan
      ? { ...plan, dirty: false }
      : { id: null, shifts: [], note: '', dirty: false };

  const [draftDay, setDraftDay] = useState(createDraft(sentDay));
  useEffect(() => {
    const nextDraft = createDraft(sentDay);
    setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
  }, [selectedEmployee?.id, dKey, sentDay]);
  useEffect(() => {
    setManagerPlanCollapsed(true);
  }, [selectedEmployee?.id, dKey]);

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

  const shifts = draftDay.shifts || [];
  const canSendPlan = shifts.length > 0;
  const submissionShifts = sentDay?.shifts?.length ? sentDay.shifts : shifts;
  const plannedMinutes = shifts.reduce((acc, shift) => acc + (toMinutes(shift.end) - toMinutes(shift.start)), 0);
  const planSpanLabel = useMemo(() => {
    const starts = shifts.map((shift) => shift.start).filter(Boolean).sort();
    const ends = shifts.map((shift) => shift.end).filter(Boolean).sort();
    const start = starts[0];
    const end = ends[ends.length - 1];
    return start && end ? `${formatTimeLabel(start)}–${formatTimeLabel(end)}` : '—';
  }, [shifts]);
  const planSpan = useMemo(() => getPlanSpanMins(shifts), [shifts]);
  const submissionSpan = useMemo(() => getPlanSpanMins(submissionShifts), [submissionShifts]);
  const dayStatus = draftDay.dirty ? 'EDITED' : sentDay ? 'SENT' : 'NONE';

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
      const next = (prev.shifts || []).map((shift, i) => (i === idx ? { ...shift, [field]: value } : shift));
      return { ...prev, shifts: next, dirty: true };
    });

  const sendPlan = async () => {
    if (!selectedEmployee || !selectedEmployeeId || !canSendPlan) return;
    const now = new Date().toISOString();
    const planId = sentDay?.id || planIdFor(selectedEmployeeId, dKey);
    const base = sentDay
      ? sanitizePlan(sentDay)
      : {
          id: planId,
          employeeId: selectedEmployeeId,
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
      employeeId: selectedEmployeeId,
      date: dKey,
      shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
      note: draftDay.note || '',
      sent: true,
      sentAt: now
    };

    const changeMessages = describePlanChanges(base, nextPlanState);
    const logs = buildPlanLogs({
      baseLogs: base.logs,
      changeMessages,
      now,
      actorLabel: 'Kierownik',
      summaryText: summarizePlan(draftDay),
      editType: 'MAN_PLAN_EDIT',
      summaryType: 'SENT',
      includeSummaryWhenChanged: true
    });

    const payload = {
      ...nextPlanState,
      logs
    };
    await savePlan(payload);
    setPlansByDate((prev) => {
      const current = prev[dKey];
      if (current && deepEqual(current, payload)) return prev;
      return { ...prev, [dKey]: payload };
    });
    const nextDraft = { ...payload, dirty: false };
    setDraftDay((prev) => (deepEqual(prev, nextDraft) ? prev : nextDraft));
  };

  const statusByDate = useMemo(() => {
    const map = {};
    Object.values(plansByDate || {}).forEach((plan) => {
      if (!plan?.date) return;
      const shiftsArr = plan.shifts || [];
      const planMinutes = shiftsArr.reduce((acc, shift) => acc + (toMinutes(shift.end) - toMinutes(shift.start)), 0);
      const items = plan.submission?.items || [];
      const reported = plan.submission?.reportedMinutes ?? computeReported(items);
      const closed = items.length > 0 && items.every((task) => String(task.status || '').toLowerCase().includes('zako'));
      const settled = plan.submission && planMinutes > 0 && reported >= planMinutes && closed;
      map[plan.date] = settled ? 'SETTLED' : plan.sent ? 'PLANNED' : 'NONE';
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

  const sentSubmission = sentDay?.submission;
  const submissionItemsForDisplay = useMemo(
    () =>
      splitTasksByPlanStart(
        sentSubmission?.items || [],
        submissionSpan,
        selectedDate,
        submissionShifts
      ),
    [
      sentSubmission?.items,
      submissionSpan?.start,
      submissionSpan?.end,
      selectedDate,
      submissionShifts
    ]
  );
  const reportedMinutesCalc = (sentSubmission?.items || []).filter((item) => item.start && item.end).reduce((acc, item) => acc + (toMinutes(item.end) - toMinutes(item.start)), 0);
  const allDoneCalc = (sentSubmission?.items || []).length > 0 && (sentSubmission?.items || []).every((item) =>
    String(item.status || '').toLowerCase().includes('zako')
  );
  const dayOverallSettled = !!sentSubmission && plannedMinutes > 0 && reportedMinutesCalc >= plannedMinutes && allDoneCalc;

  const managedEmployees = useMemo(
    () => employees.filter((emp) => emp.managerId === selectedManager?.id),
    [employees, selectedManager?.id]
  );

  const yearMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  const monthlyLogsSel = useMemo(
    () => monthlyLogs.filter((log) => log.ym === yearMonth),
    [monthlyLogs, yearMonth]
  );
  const logsList = useMemo(() => {
    const combined = [...monthlyLogsSel, ...(sentDay?.logs || [])];
    return combined.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }, [monthlyLogsSel, sentDay?.logs]);
  const hasLogs = logsList.length > 0;

  const refreshEmployees = async () => {
    const list = await fetchEmployees();
    setEmployees(list);
    return list;
  };

  const refreshManagers = async () => {
    const list = await fetchManagers();
    setManagers(list);
    return list;
  };

  const handleDeleteEmployee = async (employee) => {
    const employeePlans = await fetchPlansForEmployee(employee.id);
    await Promise.all(employeePlans.map((plan) => deletePlan(plan.id)));
    await deleteMonthlyLogsForEmployee(employee.id);
    await deleteEmployee(employee.id);
    const updatedEmployees = await refreshEmployees();
    if (selectedEmployee?.id === employee.id) {
      const next = updatedEmployees.filter((emp) => emp.managerId === selectedManager?.id && emp.id !== employee.id);
      setSelectedEmployee(next[0] ?? null);
    }
    setPlansByDate({});
    setMonthlyLogs([]);
  };

  const clearLogs = async () => {
    if (!selectedEmployee || !hasLogs) {
      setLogsConfirmOpen(false);
      return;
    }
    setLogsClearing(true);
    try {
      const planEntries = Object.values(plansByDate || {}).filter((plan) => (plan.logs || []).length);
      if (planEntries.length) {
        await Promise.all(planEntries.map((plan) => patchPlan(plan.id, { logs: [] })));
      }
      await deleteMonthlyLogsForEmployee(selectedEmployee.id);
      setPlansByDate((prev) => {
        const next = {};
        Object.keys(prev).forEach((key) => {
          next[key] = { ...prev[key], logs: [] };
        });
        return next;
      });
      setMonthlyLogs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogsClearing(false);
      setLogsConfirmOpen(false);
    }
  };

  const planForYearMonth = async (year, monthIndex) => {
    if (!selectedEmployee) return;
    const dim = new Date(year, monthIndex + 1, 0).getDate();
    const nowIso = new Date().toISOString();
    const entries = [];
    const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric'
    });
    const isHalf = (selectedEmployee.employmentType || '') === '1/2 etatu';
    for (let day = 1; day <= dim; day++) {
      const date = new Date(year, monthIndex, day);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) continue;
      const key = ymd(date);
      let shiftsArr = [];
      let logText = '';
      if (!isHalf) {
        shiftsArr = [{ mode: 'OFFICE', start: '08:00', end: '16:00' }];
        logText = `Auto (${monthLabel}): 08:00–16:00 Biuro`;
      } else if (weekday === 2 || weekday === 4) {
        shiftsArr = [{ mode: 'OFFICE', start: '08:00', end: '16:00' }];
        logText = `Auto (${monthLabel}): 08:00–16:00 Biuro`;
      } else if (weekday === 5) {
        shiftsArr = [{ mode: 'OFFICE', start: '08:00', end: '12:00' }];
        logText = `Auto (${monthLabel}): 08:00–12:00 Biuro`;
      } else {
        shiftsArr = [{ mode: 'ABSENCE', start: '', end: '' }];
        logText = `Auto (${monthLabel}): Nieobecność`;
      }
      const existing = plansByDate[key];
      const base = existing
        ? sanitizePlan(existing)
        : {
            id: planIdFor(selectedEmployee.id, key),
            employeeId: selectedEmployee.id,
            date: key,
            note: '',
            logs: []
          };
      const entry = {
        ...base,
        id: planIdFor(selectedEmployee.id, key),
        employeeId: selectedEmployee.id,
        date: key,
        shifts: shiftsArr,
        sent: true,
        sentAt: nowIso,
        logs: [...(base.logs || []), { type: 'SENT', at: nowIso, text: logText }]
      };
      entries.push(entry);
    }
    await Promise.all(entries.map((plan) => savePlan(plan)));
    const ymKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const logEntry = {
      id: `ml${Date.now()}`,
      employeeId: selectedEmployee.id,
      ym: ymKey,
      type: 'AUTO_MONTH',
      at: nowIso,
      text: `Kierownik: Zaplanowano miesiąc ${monthLabel}`
    };
    await createMonthlyLog(logEntry);
    setMonthlyLogs((prev) => [...prev, logEntry]);
    setPlansByDate((prev) => {
      const next = { ...prev };
      entries.forEach((plan) => {
        next[plan.date] = plan;
      });
      return next;
    });
    setSelectedDate(new Date(year, monthIndex, 1));
    setMonthCursor(new Date(year, monthIndex, 1));
  };

  const buildReportDocument = async () => {
    const ids = reportSelectedIds.length ? reportSelectedIds : selectedEmployee ? [selectedEmployee.id] : [];
    if (!ids.length) return null;
    const [yy, mm] = reportMonth.split('-').map(Number);
    if (!yy || !mm) return null;
    const monthIndex = mm - 1;
    const dim = new Date(yy, mm, 0).getDate();
    const monthLabel = new Date(yy, monthIndex, 1).toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric'
    });
    const pageTitle = `Raport – ${monthLabel}`;
    const styleContent = `
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:24px}
      h1{font-size:20px;margin:0 0 12px}
      h2{font-size:16px;margin:16px 0 8px}
      table{width:100%;border-collapse:collapse;margin:8px 0 16px}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;vertical-align:top}
      th{background:#f8fafc;text-align:left}
      .muted{color:#64748b}
      .chip{display:inline-block;border:1px solid #cbd5e1;border-radius:9999px;padding:2px 8px;font-size:11px}
      .weekend td{background:#e2e8f0}
    `;
    const styleTag = `<style>${styleContent}</style>`;
    const bodyChunks = [`<h1>${pageTitle}</h1>`];
    const employeeNames = [];

    for (const empId of ids) {
      const employee = employees.find((emp) => emp.id === empId);
      if (!employee) continue;
      employeeNames.push(employee.name);
      const plansList =
        empId === selectedEmployee?.id ? Object.values(plansByDate || {}) : await fetchPlansForEmployee(empId);
      const planMap = plansList.reduce((acc, plan) => {
        acc[plan.date] = plan;
        return acc;
      }, {});

      bodyChunks.push(`<h2>${employee.name} <span class="muted">• ${employee.role}</span></h2>`);
      bodyChunks.push(
        '<table><thead><tr><th>Data</th><th>Plan</th>' + (reportDetailed ? '<th>Zadania</th>' : '') + '</tr></thead><tbody>'
      );
      let sumPlan = 0;
      let sumReported = 0;

      for (let day = 1; day <= dim; day++) {
        const date = new Date(yy, monthIndex, day);
        const key = ymd(date);
        const plan = planMap[key];
        const shiftsArr = plan?.shifts || [];
        const planText = shiftsArr.length
          ? shiftsArr
              .map((shift) => `${shift.start && shift.end ? `${shift.start}–${shift.end}` : ''} ${MODE_META[shift.mode || 'OFFICE']?.label || ''}`.trim())
              .join(' | ')
          : '—';
        const planMinutes = shiftsArr.reduce((acc, shift) => acc + (toMinutes(shift.end) - toMinutes(shift.start)), 0);
        sumPlan += planMinutes;
        let tasksCell = '';
        if (reportDetailed) {
          const items = plan?.submission?.items || [];
          const lines = items.map(
            (item) =>
              `${item.start || ''}–${item.end || ''} ${item.type || ''} • ${item.subject || ''}${
                item.project ? ` (${item.project})` : ''
              }`
          );
          tasksCell = lines.length ? lines.join('<br/>') : '—';
          const reported = items
            .filter((item) => item.start && item.end)
            .reduce((acc, item) => acc + (toMinutes(item.end) - toMinutes(item.start)), 0);
          sumReported += reported;
        }
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        bodyChunks.push(
          `<tr${isWeekend ? ' class="weekend"' : ''}><td>${date.toLocaleDateString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td>${planText}${
            planMinutes ? ` <span class="chip">${minutesToHHmm(planMinutes)} h</span>` : ''
          }</td>${reportDetailed ? `<td>${tasksCell}</td>` : ''}</tr>`
        );
      }
      bodyChunks.push(
        `<tr><td><b>Razem</b></td><td>${minutesToHHmm(sumPlan)} h</td>${
          reportDetailed ? `<td>${minutesToHHmm(sumReported)} h</td>` : ''
        }</tr>`
      );
      bodyChunks.push('</tbody></table>');
    }

    if (!employeeNames.length) return null;

    bodyChunks.push(`<p class="muted">Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>`);

    const slugify = (value) =>
      value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'raport';
    const monthSlug = `${yy}-${String(mm).padStart(2, '0')}`;
    const employeeSlug = employeeNames.length === 1 ? slugify(employeeNames[0]) : 'wielu-pracownikow';
    const fileBase = `raport-${monthSlug}-${employeeSlug}`;
    const bodyHtml = bodyChunks.join('');
    const html = `<html><head><meta charset="utf-8"/>${styleTag}<title>${pageTitle}</title></head><body>${bodyHtml}</body></html>`;

    return {
      html,
      fileName: `${fileBase}.html`,
      title: pageTitle
    };
  };

  const handlePrintReport = async () => {
    const doc = await buildReportDocument();
    if (!doc) return false;
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.open();
    win.document.write(doc.html);
    win.document.title = doc.title;
    win.document.close();
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* no-op */
      }
    };
    if (typeof win.addEventListener === 'function') {
      win.addEventListener('load', triggerPrint, { once: true });
    }
    setTimeout(triggerPrint, 250);
    return true;
  };

  const handleDownloadReport = async () => {
    const doc = await buildReportDocument();
    if (!doc) return false;
    const blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-700 px-4 py-3">
          Błąd podczas pobierania danych: {error}
        </div>
      </div>
    );
  }

  return (
    <MotionDiv initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl p-6 space-y-6 text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <img src={Logo} alt="IBCS Planner logo" className="w-14 h-14 object-cover" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Panel kierownika</h1>
            <p className="text-slate-500 flex items-center gap-2">
              <Users className="w-4 h-4" /> Zarządzaj planami pracy
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
                    setAutoOpen(true);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                >
                  <CalendarDays className="w-4 h-4" /> Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setReportsOpen(true);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                >
                  <BarChart3 className="w-4 h-4" /> Raporty
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setCalendarOpen((o) => !o)} className={BTN} aria-label="Pokaż/ukryj kalendarz">
            <CalIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {(loadingInitial || loadingPlans) && (
        <div className="rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">Ładowanie danych...</div>
      )}

      <div className={cls('grid gap-6', calendarOpen ? 'lg:grid-cols-[260px_1fr_360px]' : 'lg:grid-cols-[260px_1fr]')}>
        <aside className={cls(CARD, 'h-fit sticky top-6')}>
          <PickerSection
            title="Kierownicy"
            icon={Users}
            count={managers.length}
            items={managers}
            selectedId={selectedManager?.id}
            onSelect={(manager) => setSelectedManager(manager)}
            onCreate={() => {
              setManMode('create');
              setManDraft({ id: '', name: '' });
              setManModalOpen(true);
            }}
            onEdit={(manager) => {
              setManMode('edit');
              setManDraft(manager);
              setManModalOpen(true);
            }}
            onDelete={(manager) => {
              setManConfirmTarget(manager);
              setManConfirmOpen(true);
            }}
          />
          <PickerSection
            title="Pracownicy"
            icon={Users}
            count={managedEmployees.length}
            items={managedEmployees.map((emp) => ({
              id: emp.id,
              name: emp.name,
              subtitle: `${emp.role} • ${emp.employmentType}`
            }))}
            selectedId={selectedEmployee?.id || null}
            onSelect={(item) => {
              const emp = employees.find((employee) => employee.id === item.id);
              setSelectedEmployee(emp || null);
            }}
            onCreate={() => {
              setEmpMode('create');
              setEmpDraft({
                id: '',
                name: '',
                role: 'Technik',
                employmentType: 'Pełen etat',
                managerId: selectedManager?.id || '',
                email: ''
              });
              setEmpModalOpen(true);
            }}
            onEdit={(item) => {
              const emp = employees.find((employee) => employee.id === item.id);
              if (emp) {
                setEmpMode('edit');
                setEmpDraft(emp);
                setEmpModalOpen(true);
              }
            }}
            onDelete={(item) => {
              const emp = employees.find((employee) => employee.id === item.id);
              if (emp) {
                setEmpConfirmTarget(emp);
                setEmpConfirmOpen(true);
              }
            }}
          />
        </aside>

      <section className={CARD}>
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

        {managerPlanCollapsed ? (
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
                  Łącznie: <span className="text-base font-semibold text-slate-700">{minutesToHHmm(plannedMinutes)}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Brak zakresów czasu.</div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {shifts.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Brak zakresów czasu. Dodaj pierwszy segment.
                </div>
              )}
              {shifts.map((segment, idx) => (
                <div key={idx} className="rounded-xl border-2 border-slate-300 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                    <label className="text-sm block">
                      Start
                      <TimeSelect value={segment.start} onChange={(value) => setSegField(idx, 'start', value)} />
                    </label>
                    <label className="text-sm block">
                      Koniec
                      <TimeSelect value={segment.end} onChange={(value) => setSegField(idx, 'end', value)} />
                    </label>
                    <label className="text-sm block">
                      Tryb pracy
                      <ModeChooser value={segment.mode || 'OFFICE'} onChange={(mode) => setSegField(idx, 'mode', mode)} />
                    </label>
                    <div className="flex items-center justify-end">
                      {shifts.length > 1 && (
                        <button
                          onClick={() => delSegment(idx)}
                          className="rounded-lg border-2 border-slate-300 px-2 py-2 hover:bg-slate-50"
                          aria-label="Usuń segment"
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
                    />
                  </label>
                </div>
              ))}
            </div>

            {plannedMinutes > 480 && (
              <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                Przekroczono 8 h – łączny plan dnia to {minutesToHHmm(plannedMinutes)}.
              </div>
            )}

            <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">Łącznie: {minutesToHHmm(plannedMinutes)}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addSegment}
                  disabled={plannedMinutes >= 480}
                  className="rounded-full border-2 border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Dodaj zakres"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={sendPlan} className={BTN} disabled={!canSendPlan}>
                  <Send className="w-4 h-4 text-emerald-600" /> Wyślij
                </button>
              </div>
            </div>

            {(sentDay || monthlyLogsSel.length > 0) && (
              <div className="mt-4 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <div className="text-sm font-medium mb-2 flex items-center justify-between">
                  <span>Logi</span>
                  <button
                    onClick={() => setLogsConfirmOpen(true)}
                    disabled={!hasLogs}
                    className="rounded-lg border px-2 py-1 hover:bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Wyczyść logi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {logsList.length === 0 && <div className="text-sm text-slate-500">Brak wpisów logów.</div>}
                {logsList.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {logsList.map((log, idx) => {
                      const type = log.type || '';
                      const IconComponent =
                        type === 'SENT' || type === 'EMP_SUBMIT'
                          ? Send
                          : type === 'AUTO_MONTH'
                          ? CalIcon
                          : type === 'EMP_TASK_EDIT'
                          ? Settings
                          : Pencil;
                      const who = type.startsWith('EMP_') ? 'Pracownik' : 'Kierownik';
                      const action = (() => {
                        switch (type) {
                          case 'SENT':
                            return 'Wysłano plan';
                          case 'AUTO_MONTH':
                            return 'Planowanie';
                          case 'EMP_PLAN_MOD':
                          case 'EMP_PLAN_EDIT':
                          case 'MAN_PLAN_EDIT':
                            return 'Aktualizacja planu';
                          case 'EMP_TASK_EDIT':
                            return 'Zmiany w zadaniach';
                          case 'EMP_SUBMIT':
                            return 'Wysłano zadania';
                          default:
                            return 'Aktualizacja';
                        }
                      })();
                      const cleaned = (log.text || '').replace(/^Pracownik: /, '').replace(/^Kierownik: /, '');
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
                            {cleaned && <div className="text-slate-600 whitespace-pre-line">{cleaned}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setManagerPlanCollapsed((prev) => !prev)}
            className="rounded-full border-2 border-slate-300 p-1.5 hover:bg-slate-50 transition-colors"
            aria-label={managerPlanCollapsed ? 'Rozwiń plan' : 'Zwiń plan'}
          >
            <ChevronDown className={cls('w-4 h-4 transition-transform', !managerPlanCollapsed && 'rotate-180')} />
          </button>
        </div>
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
          <div className="font-medium">Zadania ( wysłane przez pracownika )</div>
        </div>

        {!sentSubmission && <p className="text-sm text-slate-500">Brak rozliczeń dla wybranego dnia.</p>}
        {sentSubmission && (
          <div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <span
                className={cls(
                  CHIP,
                  dayOverallSettled
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-amber-50 border-amber-300 text-amber-700'
                )}
              >
                {dayOverallSettled ? 'Rozliczone' : 'W trakcie'}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-base font-semibold text-slate-700">
                Plan: {planSpanLabel} ({minutesToHHmm(plannedMinutes)} h)
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-base font-semibold text-slate-700">
                Zgłoszono: {minutesToHHmm(reportedMinutesCalc)} h
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border-2 border-slate-300">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Tryb pracy</th>
                    <th className="p-2 text-left">Temat</th>
                    <th className="p-2 text-left">Klient</th>
                    <th className="p-2 text-left">Dotyczy</th>
                    <th className="p-2 text-left">Start</th>
                    <th className="p-2 text-left">Koniec</th>
                    <th className="p-2 text-left w-24">Rodzaj</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionItemsForDisplay.map((item) => {
                    const colors = TASK_TYPE_COLORS[item.type] || TASK_TYPE_COLORS.Biuro;
                    const workKind = item.workKind || 'Zwykłe';
                    const workStyle =
                      workKind === 'Zwykłe'
                        ? 'bg-slate-50 border-slate-300 text-slate-700'
                        : workKind === 'H + 50%'
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : workKind === 'H + 100%'
                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                        : 'bg-indigo-50 border-indigo-300 text-indigo-800';
                    const statusStyle = STATUS_STYLES[item.status || 'Planowane'];
                    return (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="p-2">
                          <span
                            className={cls(
                              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs',
                              colors.base,
                              colors.border,
                              colors.text
                            )}
                          >
                            <span className={cls('inline-block h-2 w-2 rounded-full', colors.dot)} /> {item.type}
                          </span>
                        </td>
                        <td className="p-2">{item.subject || '—'}</td>
                        <td className="p-2">{item.client || '—'}</td>
                        <td className="p-2">{item.project || '—'}</td>
                        <td className="p-2">{formatTimeLabel(item.start)}</td>
                        <td className="p-2">{formatTimeLabel(item.end)}</td>
                        <td className="p-2 w-24">
                          <span className={cls('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap', workStyle)}>
                            {workKind}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className={cls('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs', statusStyle)}>
                            {item.status || 'Planowane'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <Modal
        open={logsConfirmOpen}
        title="Wyczyścić logi?"
        onClose={() => {
          if (!logsClearing) setLogsConfirmOpen(false);
        }}
        actions={
          <>
            <button onClick={() => setLogsConfirmOpen(false)} className={BTN} disabled={logsClearing}>
              Anuluj
            </button>
            <button
              onClick={clearLogs}
              disabled={logsClearing}
              className="rounded-xl px-3 py-2 text-sm text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
            >
              Usuń logi
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Usunięcie logów wyczyści historię rozliczeń dla wybranego dnia oraz zapisy miesięczne. Tej operacji nie można cofnąć.
        </p>
      </Modal>

      <Modal
        open={autoOpen}
        title="Planowanie"
        onClose={() => setAutoOpen(false)}
        actions={
          <>
            <button onClick={() => setAutoOpen(false)} className={BTN}>
              Anuluj
            </button>
            <button
              onClick={() => {
                const [yy, mm] = modalMonth.split('-').map(Number);
                if (yy && mm) planForYearMonth(yy, mm - 1);
                setAutoOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-sky-600 hover:bg-sky-700"
            >
              OK – zaplanuj
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          Wybrany pracownik: <span className="font-medium">{selectedEmployee?.name ?? '—'}</span>. Wybierz miesiąc (Pn–Pt,
          08:00–16:00, Biuro). Plan zostanie wysłany.
        </p>
        <label className="text-sm block">
          Miesiąc
          <input
            type="month"
            value={modalMonth}
            onChange={(e) => setModalMonth(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
          />
        </label>
      </Modal>

      <Modal
        open={reportsOpen}
        title="Raporty"
        onClose={() => setReportsOpen(false)}
        actions={
          <>
            <button onClick={() => setReportsOpen(false)} className={BTN}>
              Zamknij
            </button>
            <button
              onClick={async () => {
                const success = await handleDownloadReport();
                if (success) setReportsOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-slate-600 hover:bg-slate-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Pobierz</span>
            </button>
            <button
              onClick={async () => {
                const success = await handlePrintReport();
                if (success) setReportsOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Drukuj</span>
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm text-slate-600 mb-1">Pracownicy</div>
            <div className="rounded-xl border-2 border-slate-300 p-2 max-h-56 overflow-auto">
              {managedEmployees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 p-1">
                  <input
                    type="checkbox"
                    checked={reportSelectedIds.includes(emp.id)}
                    onChange={(ev) =>
                      setReportSelectedIds((prev) =>
                        ev.target.checked ? [...prev, emp.id] : prev.filter((id) => id !== emp.id)
                      )
                    }
                  />
                  <span>{emp.name}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm">
              <button onClick={() => setReportSelectedIds(managedEmployees.map((emp) => emp.id))} className="underline text-slate-600">
                Zaznacz wszystkich
              </button>
              <button onClick={() => setReportSelectedIds([])} className="underline text-slate-600">
                Wyczyść
              </button>
            </div>
          </div>
          <label className="text-sm block">
            Miesiąc
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reportDetailed} onChange={(e) => setReportDetailed(e.target.checked)} /> Szczegółowy z zadaniami
          </label>
          <p className="text-xs text-slate-500">Opis zadania to połączenie pól „Temat” i „Dotyczy”.</p>
        </div>
      </Modal>

      <Modal
        open={empConfirmOpen}
        title="Usuń pracownika"
        onClose={() => {
          setEmpConfirmOpen(false);
          setEmpConfirmTarget(null);
        }}
        actions={
          <>
            <button
              onClick={() => {
                setEmpConfirmOpen(false);
                setEmpConfirmTarget(null);
              }}
              className={BTN}
            >
              Anuluj
            </button>
            <button
              onClick={async () => {
                if (!empConfirmTarget) return;
                await handleDeleteEmployee(empConfirmTarget);
                setEmpConfirmTarget(null);
                setEmpConfirmOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-rose-600 hover:bg-rose-700"
            >
              Usuń
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Na pewno usunąć <span className="font-medium">{empConfirmTarget?.name}</span>?
        </p>
      </Modal>

      <Modal
        open={manConfirmOpen}
        title="Usuń kierownika"
        onClose={() => {
          setManConfirmOpen(false);
          setManConfirmTarget(null);
        }}
        actions={
          <>
            <button
              onClick={() => {
                setManConfirmOpen(false);
                setManConfirmTarget(null);
              }}
              className={BTN}
            >
              Anuluj
            </button>
            <button
              onClick={async () => {
                if (!manConfirmTarget || managers.length <= 1) {
                  setManConfirmOpen(false);
                  setManConfirmTarget(null);
                  return;
                }
                const targetId = manConfirmTarget.id;
                const fallback = managers.find((mgr) => mgr.id !== targetId);
                const affectedEmployees = employees.filter((emp) => emp.managerId === targetId);
                await Promise.all(
                  affectedEmployees.map((emp) => updateEmployee(emp.id, { managerId: fallback?.id || emp.managerId }))
                );
                await deleteManager(targetId);
                await refreshManagers();
                await refreshEmployees();
                setSelectedManager(fallback || null);
                setSelectedEmployee(null);
                setManConfirmTarget(null);
                setManConfirmOpen(false);
              }}
              className={cls(
                'rounded-xl px-3 py-2 text-sm text-white',
                managers.length <= 1 ? 'bg-slate-300 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'
              )}
              disabled={managers.length <= 1}
            >
              Usuń
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Na pewno usunąć <span className="font-medium">{manConfirmTarget?.name}</span>?
        </p>
      </Modal>

      <Modal
        open={manModalOpen}
        title={manMode === 'create' ? 'Dodaj kierownika' : 'Edytuj kierownika'}
        onClose={() => setManModalOpen(false)}
        actions={
          <>
            <button onClick={() => setManModalOpen(false)} className={BTN}>
              Anuluj
            </button>
            <button
              onClick={async () => {
                if (!manDraft.name.trim()) return;
                if (manMode === 'create') {
                  const id = `m${Date.now()}`;
                  await createManager({ id, name: manDraft.name });
                  await refreshManagers();
                  const newManager = { id, name: manDraft.name };
                  setSelectedManager(newManager);
                  setSelectedEmployee(null);
                } else {
                  await updateManager(manDraft.id, { name: manDraft.name });
                  await refreshManagers();
                }
                setManModalOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900"
            >
              Zapisz
            </button>
          </>
        }
      >
        <label className="text-sm block">
          Imię i nazwisko
          <input
            value={manDraft.name}
            onChange={(e) => setManDraft({ ...manDraft, name: e.target.value })}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            placeholder="np. Kierownik A"
          />
        </label>
      </Modal>

      <Modal
        open={empModalOpen}
        title={empMode === 'create' ? 'Dodaj pracownika' : 'Edytuj pracownika'}
        onClose={() => setEmpModalOpen(false)}
        actions={
          <>
            <button onClick={() => setEmpModalOpen(false)} className={BTN}>
              Anuluj
            </button>
            <button
              onClick={async () => {
                if (!empDraft.name.trim()) return;
                if (empMode === 'create') {
                  const id = `e${Date.now()}`;
                  const payload = {
                    ...empDraft,
                    id,
                    managerId: selectedManager?.id || empDraft.managerId
                  };
                  await createEmployee(payload);
                  await refreshEmployees();
                  setSelectedEmployee(payload);
                } else {
                  await updateEmployee(empDraft.id, {
                    name: empDraft.name,
                    role: empDraft.role,
                    employmentType: empDraft.employmentType
                  });
                  await refreshEmployees();
                  if (selectedEmployee?.id === empDraft.id) {
                    setSelectedEmployee({
                      ...selectedEmployee,
                      name: empDraft.name,
                      role: empDraft.role,
                      employmentType: empDraft.employmentType
                    });
                  }
                }
                setEmpModalOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900"
            >
              Zapisz
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="text-sm block">
            Imię i nazwisko
            <input
              value={empDraft.name}
              onChange={(e) => setEmpDraft({ ...empDraft, name: e.target.value })}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="np. Jan Kowalski"
            />
          </label>
          <label className="text-sm block">
            Stanowisko
            <input
              value={empDraft.role}
              onChange={(e) => setEmpDraft({ ...empDraft, role: e.target.value })}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="np. Technik"
            />
          </label>
          <label className="text-sm block">
            Rodzaj etatu
            <select
              value={empDraft.employmentType}
              onChange={(e) => setEmpDraft({ ...empDraft, employmentType: e.target.value })}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            >
              <option value="Pełen etat">Pełen etat</option>
              <option value="1/2 etatu">1/2 etatu</option>
            </select>
          </label>
        </div>
      </Modal>
    </MotionDiv>
  );
}
