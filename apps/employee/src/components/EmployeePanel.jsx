import { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2
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
  savePlan
} from '@planner/shared';

const BTN =
  'inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const CARD = 'rounded-2xl border-2 border-slate-300 bg-white shadow-sm p-4';
const CHIP = 'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm';

const sanitizePlan = (plan) => {
  if (!plan) return plan;
  const clone = globalThis.structuredClone
    ? globalThis.structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
  const copy = clone || {};
  delete copy.dirty;
  return copy;
};

const planIdFor = (employeeId, dateKey) => `${employeeId}_${dateKey}`;

function TimeSelect({ value, onChange, placeholder, disabled }) {
  const v = value ?? '';
  const opts = v && !timeOptions15.includes(v) ? [v, ...timeOptions15] : timeOptions15;
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="mt-1 w-full min-w-[120px] rounded-xl border-2 border-slate-300 px-3 pr-8 py-2 tabular-nums font-mono disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
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
      {options.map((o) => (
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
          <span className={`inline-block h-2 w-2 rounded-full ${o.dot}`} /> {o.label}
        </button>
      ))}
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
        <span className={`inline-block h-2 w-2 rounded-full ${selectedOption.dot}`} /> {selectedOption.label}
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

function ModeChooser({ value, onChange }) {
  const options = Object.keys(MODE_META).map((key) => ({
    value: key,
    label: MODE_META[key].label,
    className: `${MODE_META[key].base} ${MODE_META[key].border} ${MODE_META[key].text}`,
    dot: MODE_META[key].dot
  }));
  return <ChipSelect value={value || 'OFFICE'} onChange={onChange} options={options} direction="below" />;
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

function PickerSection({ title, icon: Icon, count, items, selectedId, onSelect }) {
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
          <Icon className="w-4 h-4" /> {title}
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
                className="w-full text-left"
              >
                <div className="font-medium truncate">{item.name}</div>
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

export default function EmployeePanel() {
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
    const managed = employees.filter((e) => e.managerId === selectedManager.id);
    if (!managed.length) {
      setSelectedEmployee(null);
      return;
    }
    if (!selectedEmployee || selectedEmployee.managerId !== selectedManager.id) {
      setSelectedEmployee(managed[0]);
    }
  }, [selectedManager, employees, selectedEmployee]);

  useEffect(() => {
    let active = true;
    if (!selectedEmployee) {
      setPlansByDate({});
      setMonthlyLogs([]);
      return () => {
        active = false;
      };
    }
    (async () => {
      setLoadingPlans(true);
      try {
        const [plansList, logs] = await Promise.all([
          fetchPlansForEmployee(selectedEmployee.id),
          fetchMonthlyLogs(selectedEmployee.id)
        ]);
        if (!active) return;
        const map = plansList.reduce((acc, plan) => {
          acc[plan.date] = plan;
          return acc;
        }, {});
        setPlansByDate(map);
        setMonthlyLogs(logs);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoadingPlans(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedEmployee?.id]);

  const dKey = ymd(selectedDate);

  useEffect(() => {
    let active = true;
    if (!selectedEmployee) return () => undefined;
    (async () => {
      try {
        const plan = await fetchPlanById(planIdFor(selectedEmployee.id, dKey));
        if (!active) return;
        setPlansByDate((prev) => {
          const next = { ...prev };
          if (plan) next[plan.date] = plan;
          else delete next[dKey];
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

  const sentDay = selectedEmployee ? plansByDate[dKey] || null : null;

  const managedList = useMemo(
    () =>
      employees
        .filter((e) => e.managerId === selectedManager?.id)
        .map((e) => ({ id: e.id, name: e.name, subtitle: `${e.role} • ${e.employmentType}` })),
    [employees, selectedManager?.id]
  );

  const createDraft = (plan) =>
    plan
      ? { ...plan, dirty: false }
      : { id: null, shifts: [], note: '', dirty: false };

  const [draftDay, setDraftDay] = useState(createDraft(sentDay));
  useEffect(() => {
    setDraftDay(createDraft(sentDay));
  }, [selectedEmployee?.id, dKey, sentDay]);

  const shifts = draftDay.shifts || [];
  const planned = shifts.reduce((acc, s) => acc + (toMinutes(s.end) - toMinutes(s.start)), 0);
  const spanStart = shifts.map((s) => s.start).filter(Boolean).sort()[0];
  const spanEnd = shifts.map((s) => s.end).filter(Boolean).sort().slice(-1)[0];
  const dayStatus = draftDay.dirty ? 'EDITED' : sentDay ? 'SENT' : shifts.length ? 'SAVED' : 'NONE';
  const wkOf = (task) => computeWorkKindFor(task, selectedDate, shifts);

  const addSegment = () =>
    setDraftDay((prev) => {
      const last = prev.shifts?.[prev.shifts.length - 1];
      const defaultStart = last ? last.end || '08:00' : '';
      const startMinutes = toMinutes(defaultStart || '00:00');
      const defaultEnd = minutesToHHmm(Math.min((defaultStart ? startMinutes + 240 : startMinutes) || 0, 24 * 60));
      const segment = { mode: 'OFFICE', start: defaultStart, end: defaultStart ? defaultEnd : '' };
      const next = [...(prev.shifts || []), segment];
      const sum = next.reduce((acc, seg) => acc + (toMinutes(seg.end) - toMinutes(seg.start)), 0);
      if (sum > 480) return prev;
      return { ...prev, shifts: next, dirty: true };
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

  const summarizePlan = (data) => {
    const parts = (data.shifts || []).map((shift) => {
      const label = MODE_META[shift.mode || 'OFFICE']?.label;
      return shift.start && shift.end ? `${shift.start}–${shift.end} ${label}` : label;
    });
    return parts.length ? parts.join(' · ') : '—';
  };

  const sendPlanToManager = async () => {
    if (!selectedEmployee) return;
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
    const logs = [
      ...(base.logs || []),
      { type: 'EMP_PLAN_MOD', at: now, text: `Pracownik: ${summarizePlan(draftDay)}` }
    ];
    const payload = {
      ...base,
      id: planId,
      employeeId: selectedEmployee.id,
      date: dKey,
      shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
      note: draftDay.note || '',
      sent: true,
      sentAt: now,
      logs
    };
    await savePlan(payload);
    setPlansByDate((prev) => ({ ...prev, [dKey]: payload }));
    setDraftDay({ ...payload, dirty: false });
  };

  const submitted = sentDay?.submission;
  const [subDraft, setSubDraft] = useState(submitted ? { ...submitted } : { status: 'SUBMITTED', dayStatus: 'W trakcie', items: [] });
  useEffect(() => {
    setSubDraft(submitted ? { ...submitted } : { status: 'SUBMITTED', dayStatus: 'W trakcie', items: [] });
  }, [submitted?.submittedAt, selectedEmployee?.id, dKey]);

  const displayDayStatus = submitted
    ? submitted.dayStatus || computeDayStatus(submitted.items, planned)
    : 'W trakcie';

  const addTask = () =>
    setSubDraft((prev) => ({
      ...prev,
      items: [
        ...(prev.items || []),
        {
          id: `t${Date.now()}`,
          type: 'Biuro',
          subject: '',
          client: '',
          project: '',
          start: '',
          end: '',
          workKind: 'Zwykłe',
          status: 'Planowane'
        }
      ]
    }));

  const delTask = (id) =>
    setSubDraft((prev) => ({
      ...prev,
      items: (prev.items || []).filter((item) => item.id !== id)
    }));

  const setTask = (id, patch) =>
    setSubDraft((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item))
    }));

  const exportTaskICS = (task) => {
    const toISOLocal = (date, hhmm) => {
      const [h, m] = String(hhmm || '00:00').split(':').map(Number);
      const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0, 0, 0);
      const offset = dt.getTimezoneOffset();
      return new Date(dt.getTime() - offset * 60000).toISOString().slice(0, 19);
    };
    const start = toISOLocal(selectedDate, task.start || '08:00');
    const end = toISOLocal(selectedDate, task.end || '09:00');
    const summary = `${(task.client || '').trim()}${task.client && task.subject ? ' - ' : ''}${(task.subject || '').trim()}`;
    const desc = `Klient: ${task.client || '-'}
Dotyczy: ${task.project || '-'}
Status: ${task.status || '-'}`;

    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      startdt: start,
      enddt: end,
      subject: summary,
      body: desc
    });

    const urls = [
      `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`,
      `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
    ];

    urls.forEach((url) => {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch {
        /* no-op */
      }
    });
  };

  const sendTasksToManager = async () => {
    if (!selectedEmployee) return;
    const now = new Date().toISOString();
    const items = (subDraft.items || []).map((item) => ({
      ...item,
      workKind: wkOf(item)
    }));
    const reported = computeReported(items);
    const dayState = computeDayStatus(items, planned);
    const planId = sentDay?.id || planIdFor(selectedEmployee.id, dKey);
    const base = sentDay
      ? sanitizePlan(sentDay)
      : {
          id: planId,
          employeeId: selectedEmployee.id,
          date: dKey,
          shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
          note: draftDay.note || '',
          sent: false,
          sentAt: null,
          logs: []
        };
    const submission = {
      ...(base.submission || {}),
      items,
      status: 'SUBMITTED',
      submittedAt: now,
      reportedMinutes: reported,
      dayStatus: dayState
    };
    const logs = [
      ...(base.logs || []),
      { type: 'EMP_SUBMIT', at: now, text: `Pracownik: przesłał ${items.length || 0} zadań` }
    ];
    const payload = {
      ...base,
      id: planId,
      employeeId: selectedEmployee.id,
      date: dKey,
      shifts: (draftDay.shifts || []).map((shift) => ({ ...shift })),
      note: draftDay.note || '',
      sent: base.sent || false,
      sentAt: base.sentAt || null,
      submission,
      logs
    };
    await savePlan(payload);
    setPlansByDate((prev) => ({ ...prev, [dKey]: payload }));
    setDraftDay((prev) => ({ ...(prev || {}), dirty: false }));
    setSubDraft({ ...submission });
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

  const yearMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

  const monthlyLogsSel = useMemo(
    () => monthlyLogs.filter((log) => log.ym === yearMonth),
    [monthlyLogs, yearMonth]
  );

  const logsList = useMemo(() => {
    const combined = [...monthlyLogsSel, ...(sentDay?.logs || [])];
    return combined.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }, [monthlyLogsSel, sentDay?.logs]);

  const selectedPlanReported = (subDraft.items || []).reduce(
    (acc, item) => acc + (toMinutes(item.end) - toMinutes(item.start)),
    0
  );

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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl p-6 space-y-6 text-slate-800">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel pracownika</h1>
          <p className="text-slate-500 flex items-center gap-2">
            <Users className="w-4 h-4" /> Zarządzaj swoim planem i zadaniami
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCalendarOpen((o) => !o)} className={BTN} aria-label="Pokaż/ukryj kalendarz">
            <CalIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {(loadingInitial || loadingPlans) && (
        <div className="rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Ładowanie danych...
        </div>
      )}

      <div className={cls('grid gap-6', calendarOpen ? 'lg:grid-cols-[260px_1fr_360px]' : 'lg:grid-cols-[260px_1fr]')}>
        <aside className={cls(CARD, 'h-fit sticky top-6')}>
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
                    : dayStatus === 'SAVED'
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-violet-50 border-violet-300 text-violet-700'
                )}
              >
                {dayStatus === 'SENT' ? 'Wysłane' : dayStatus === 'SAVED' ? 'Zapisane' : 'Edytowane'}
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
                        disabled={disableTimes}
                      />
                    </label>
                    <label className="text-sm block">
                      Koniec
                      <TimeSelect
                        value={segment.end}
                        onChange={(value) => setSegField(idx, 'end', value)}
                        disabled={disableTimes}
                      />
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
              );
            })}
          </div>

          {planned > 480 && (
            <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
              Przekroczono 8 h – łączny plan dnia to {minutesToHHmm(planned)}.
            </div>
          )}

          <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">Łącznie: {minutesToHHmm(planned)}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={addSegment}
                disabled={planned >= 480}
                className="rounded-full border-2 border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Dodaj zakres"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={sendPlanToManager} className={BTN}>
                <Send className="w-4 h-4 text-emerald-600" /> Wyślij plan
              </button>
            </div>
          </div>

          {logsList.length > 0 && (
            <div className="mt-4 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
              <div className="text-sm font-medium mb-2">Logi</div>
              <ul className="space-y-2 text-sm">
                {logsList.map((log, idx) => {
                  const type = log.type || '';
                  const Icon = type === 'EMP_PLAN_MOD' ? Pencil : type === 'EMP_SUBMIT' ? Send : CalIcon;
                  const who = type.startsWith('EMP_') ? 'Pracownik' : 'Kierownik';
                  const action =
                    type === 'EMP_PLAN_MOD'
                      ? 'Zmiana planu'
                      : type === 'EMP_SUBMIT'
                      ? 'Wysłano zadania'
                      : 'Wysłano plan';
                  return (
                    <li key={`${log.at}-${idx}`} className="flex items-start gap-2">
                      <Icon className="w-4 h-4 text-slate-700 mt-0.5" />
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
                  className={cls(BTN, 'px-2 py-1')}
                  aria-label="Poprzedni miesiąc"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                  className={cls(BTN, 'px-2 py-1')}
                  aria-label="Następny miesiąc"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCalendarOpen(false)}
                  className={cls(BTN, 'px-2 py-1')}
                  aria-label="Zwiń kalendarz"
                >
                  <CalIcon className="w-4 h-4" />
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
          <span className={`${CHIP} ${DAY_STATUS_STYLES[displayDayStatus]}`}>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                displayDayStatus === 'Rozliczone' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {displayDayStatus}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            Plan: {spanStart && spanEnd ? `${spanStart}–${spanEnd}` : '—'} ({minutesToHHmm(planned)} h)
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600">Zgłoszono: {minutesToHHmm(selectedPlanReported)} h</span>
        </div>
        {(!subDraft.items || subDraft.items.length === 0) && (
          <p className="text-sm text-slate-500">Brak zadań. Dodaj pierwsze.</p>
        )}
        {(subDraft.items || []).length > 0 && (
          <div className="overflow-x-auto overflow-y-visible rounded-xl border-2 border-slate-300">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-left">Tryb pracy</th>
                  <th className="p-2 text-left">Temat</th>
                  <th className="p-2 text-left">Klient</th>
                  <th className="p-2 text-left">Dotyczy</th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">Koniec</th>
                  <th className="p-2 text-left">Rodzaj</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {subDraft.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="p-2">
                      <TaskTypeChooser value={item.type} onChange={(value) => setTask(item.id, { type: value })} disabled={item.locked} />
                    </td>
                    <td className="p-2">
                      <input
                        value={item.subject}
                        onChange={(e) => setTask(item.id, { subject: e.target.value })}
                        className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
                        placeholder="np. Raport"
                        disabled={item.locked}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={item.client}
                        onChange={(e) => setTask(item.id, { client: e.target.value })}
                        className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
                        placeholder="np. Klient"
                        disabled={item.locked}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={item.project}
                        onChange={(e) => setTask(item.id, { project: e.target.value })}
                        className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
                        placeholder="np. CR-10001 / zasób"
                        disabled={item.locked}
                      />
                    </td>
                    <td className="p-2">
                      <TimeSelect
                        value={item.start}
                        onChange={(value) => setTask(item.id, { start: value })}
                        disabled={item.locked}
                      />
                    </td>
                    <td className="p-2">
                      <TimeSelect value={item.end} onChange={(value) => setTask(item.id, { end: value })} disabled={item.locked} />
                    </td>
                    <td className="p-2">
                      <span className={`${CHIP} ${WORKKIND_STYLES[wkOf(item)]}`}>{wkOf(item)}</span>
                    </td>
                    <td className="p-2">
                      <StatusChooser
                        value={item.status || 'Planowane'}
                        onChange={(value) => setTask(item.id, { status: value })}
                        disabled={item.locked}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setTask(item.id, { locked: true })}
                          disabled={!!item.locked}
                          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-50"
                          title="Zapisz"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTask(item.id, { locked: false })}
                          disabled={!item.locked}
                          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50 disabled:opacity-50"
                          title="Edytuj"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => exportTaskICS(item)}
                          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50"
                          title="Eksport do Outlook (.ics)"
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => delTask(item.id)}
                          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50"
                          title="Usuń"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={addTask} className={BTN}>
            <Plus className="w-4 h-4" /> Dodaj zadanie
          </button>
          <button onClick={sendTasksToManager} className={BTN}>
            <Send className="w-4 h-4 text-emerald-600" /> Wyślij zadania
          </button>
        </div>
      </section>
    </motion.div>
  );
}
