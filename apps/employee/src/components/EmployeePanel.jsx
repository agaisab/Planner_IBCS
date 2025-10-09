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
  Settings,
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
import Logo from '../assets/ibcs-logo.png';

const BTN =
  'inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const CARD = 'rounded-2xl border-2 border-slate-300 bg-white shadow-sm p-4';
const CHIP = 'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm';
const WEEK_DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

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
        onClick={() => setOpen((prev) => !prev)}
        className={`${CHIP} ${meta.base} ${meta.border} ${meta.text}`}
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

const TaskRow = memo(function TaskRow({
  task,
  menuRect,
  activeTaskId,
  registerAnchor,
  onToggleMenu,
  onFieldChange,
  onLock,
  onUnlock,
  onExport,
  onDelete,
  computeWorkKind
}) {
  const menuOpen = activeTaskId === task.id;
  const workKind = computeWorkKind(task);
  const actionRef = useCallback(
    (node) => registerAnchor(task.id, node),
    [registerAnchor, task.id]
  );

  return (
    <tr className="border-t border-slate-200">
      <td className="p-2">
        <TaskTypeChooser value={task.type} onChange={(value) => onFieldChange(task.id, { type: value })} disabled={task.locked} />
      </td>
      <td className="p-2">
        <input
          value={task.subject}
          onChange={(e) => onFieldChange(task.id, { subject: e.target.value })}
          className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
          placeholder="np. Raport"
          disabled={task.locked}
        />
      </td>
      <td className="p-2">
        <input
          value={task.client}
          onChange={(e) => onFieldChange(task.id, { client: e.target.value })}
          className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
          placeholder="np. Klient"
          disabled={task.locked}
        />
      </td>
      <td className="p-2">
        <input
          value={task.project}
          onChange={(e) => onFieldChange(task.id, { project: e.target.value })}
          className="w-full rounded-lg border-2 border-slate-300 px-2 py-1"
          placeholder="np. CR-10001 / zasób"
          disabled={task.locked}
        />
      </td>
      <td className="p-2">
        <TimeSelect value={task.start} onChange={(value) => onFieldChange(task.id, { start: value })} disabled={task.locked} />
      </td>
      <td className="p-2">
        <TimeSelect value={task.end} onChange={(value) => onFieldChange(task.id, { end: value })} disabled={task.locked} />
      </td>
      <td className="p-2">
        <span className={`${CHIP} ${WORKKIND_STYLES[workKind]}`}>{workKind}</span>
      </td>
      <td className="p-2">
        <StatusChooser value={task.status || 'Planowane'} onChange={(value) => onFieldChange(task.id, { status: value })} disabled={task.locked} />
      </td>
      <td className="relative p-2 text-right">
        <button
          ref={actionRef}
          onClick={() => onToggleMenu(task.id)}
          className="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-50"
          title="Akcje"
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
                onClick={() => onExport(task)}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <CalendarPlus className="w-4 h-4" /> Do Outlooka
              </button>
              <button
                data-task-actions-menu
                onClick={() => onDelete(task.id)}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="w-4 h-4" /> Usuń
              </button>
            </div>,
            document.body
          )}
      </td>
    </tr>
  );
});

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
          const planned = 'bg-sky-50 border-sky-300 text-slate-900';
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
  const [taskActionsMenu, setTaskActionsMenu] = useState({ id: null, rect: null });
  const taskActionRefs = useRef({});
  const [splitPrompt, setSplitPrompt] = useState(null);
  const [splitProcessing, setSplitProcessing] = useState(false);

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
      if (event.target.closest('[data-task-actions-menu]')) return;
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

  const taskItems = subDraft.items || [];
  useEffect(() => {
    if (!taskItems.length) {
      setTaskActionsMenu({ id: null, rect: null });
      setSplitPrompt(null);
    }
  }, [taskItems.length]);

  const addTask = useCallback(
    () =>
      setSubDraft((prev) => {
        const items = prev.items || [];
        const lastTaskWithEnd = [...items].reverse().find((task) => task.end);
        const defaultStart = lastTaskWithEnd?.end || shifts[0]?.start || '';
        const defaultEnd = (() => {
          if (shifts.length === 0) return '';
          const fallback = shifts[shifts.length - 1]?.end || '';
          if (!defaultStart) return fallback;
          const startMinutes = toMinutes(defaultStart);
          const candidate = shifts.find((shift) => toMinutes(shift.end) > startMinutes)?.end;
          return candidate || fallback;
        })();

        return {
          ...prev,
          items: [
            ...items,
            {
              id: `t${Date.now()}`,
              type: 'Biuro',
              subject: '',
              client: '',
              project: '',
              start: defaultStart,
              end: defaultEnd,
              workKind: 'Zwykłe',
              status: 'Planowane'
            }
          ]
        };
      }),
    [shifts]
  );

  const importPlanToTasks = useCallback(() => {
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
        locked: false
      };
    });
    setSubDraft((prev) => ({
      status: prev.status || 'SUBMITTED',
      dayStatus: prev.dayStatus || 'W trakcie',
      items: generated
    }));
  }, [shifts]);

  const delTask = useCallback(
    (id) =>
      setSubDraft((prev) => ({
        ...prev,
        items: (prev.items || []).filter((item) => item.id !== id)
      })),
    []
  );

  const setTask = useCallback(
    (id, patch) =>
      setSubDraft((prev) => ({
        ...prev,
        items: (prev.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item))
      })),
    []
  );

  const exportTaskICS = useCallback((task) => {
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

    const url = `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;

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
  }, [selectedDate]);

  const registerTaskActionAnchor = useCallback((id, node) => {
    if (node) taskActionRefs.current[id] = node;
    else delete taskActionRefs.current[id];
  }, []);

  const closeTaskActions = useCallback(() => setTaskActionsMenu({ id: null, rect: null }), []);

  const toggleTaskActions = useCallback((id) => {
    setTaskActionsMenu((prev) => {
      if (prev.id === id) return { id: null, rect: null };
      const anchor = taskActionRefs.current[id];
      if (!anchor) return prev;
      return { id, rect: anchor.getBoundingClientRect() };
    });
  }, []);

  const handleTaskFieldChange = useCallback(
    (id, patch) => {
      if (!('end' in patch)) {
        setTask(id, patch);
        return;
      }

      const planEnd = shifts
        .map((shift) => shift.end)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];

      const currentItems = subDraft.items || [];
      const targetTask = currentItems.find((item) => item.id === id);

      if (!planEnd || !targetTask) {
        setTask(id, patch);
        return;
      }

      const planEndMinutes = toMinutes(planEnd);
      const newEndMinutes = toMinutes(patch.end);

      if (!Number.isFinite(planEndMinutes) || !Number.isFinite(newEndMinutes) || newEndMinutes >= planEndMinutes) {
        setTask(id, patch);
        return;
      }

      const nextStartMinutes = currentItems
        .filter((item) => item.id !== id && item.start)
        .map((item) => toMinutes(item.start))
        .filter((value) => Number.isFinite(value) && value > newEndMinutes);

      const earliestNext = nextStartMinutes.length ? Math.min(...nextStartMinutes) : Infinity;
      const gapEndMinutes = Math.min(planEndMinutes, earliestNext);

      let shouldAddFollowup = false;
      if (gapEndMinutes > newEndMinutes && typeof window !== 'undefined') {
        const gapEnd = minutesToHHmm(gapEndMinutes);
        const message = `Pozostał wolny czas od ${patch.end} do ${gapEnd}. Czy dodać nowe zadanie?`;
        shouldAddFollowup = window.confirm(message);
      }

      setSubDraft((prev) => {
        const items = prev.items || [];
        const index = items.findIndex((item) => item.id === id);
        if (index === -1) return prev;

        const updatedItems = items.map((item) => (item.id === id ? { ...item, ...patch } : item));

        if (shouldAddFollowup) {
          const gapEnd = minutesToHHmm(gapEndMinutes);
          if (patch.end && gapEnd && patch.end !== gapEnd) {
            const baseTask = updatedItems[index];
            const followup = {
              id: `t${Date.now()}`,
              type: baseTask.type || 'Biuro',
              subject: '',
              client: '',
              project: '',
              start: patch.end,
              end: gapEnd,
              workKind: 'Zwykłe',
              status: 'Planowane',
              locked: false
            };
            updatedItems.splice(index + 1, 0, followup);
          }
        }

        return { ...prev, items: updatedItems };
      });
    },
    [setTask, shifts, subDraft.items, setSubDraft]
  );

  const handleTaskLock = useCallback(
    (id) => {
      setTask(id, { locked: true });
      closeTaskActions();
    },
    [setTask, closeTaskActions]
  );

  const handleTaskUnlock = useCallback(
    (id) => {
      setTask(id, { locked: false });
      closeTaskActions();
    },
    [setTask, closeTaskActions]
  );

  const handleTaskExport = useCallback(
    (task) => {
      exportTaskICS(task);
      closeTaskActions();
    },
    [exportTaskICS, closeTaskActions]
  );

  const handleTaskDelete = useCallback(
    (id) => {
      delTask(id);
      closeTaskActions();
    },
    [delTask, closeTaskActions]
  );

  const sendTasksToManager = async () => {
    if (!selectedEmployee) return;
    const now = new Date().toISOString();
    const items = taskItems.map((item) => ({
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

  const selectedPlanReported = taskItems.reduce((acc, item) => {
    if (!item.start || !item.end) return acc;
    return acc + (toMinutes(item.end) - toMinutes(item.start));
  }, 0);

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
                <Send className="w-4 h-4 text-emerald-600" /> Wyślij
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
          <span className={`${CHIP} ${DAY_STATUS_STYLES[displayDayStatus]}`}>{displayDayStatus}</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            Plan: {spanStart && spanEnd ? `${spanStart}–${spanEnd}` : '—'} ({minutesToHHmm(planned)} h)
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600">Zgłoszono: {minutesToHHmm(selectedPlanReported)} h</span>
        </div>
        {taskItems.length === 0 && (
          <p className="text-sm text-slate-500">Brak zadań. Dodaj pierwsze.</p>
        )}
        {taskItems.length > 0 && (
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
                {taskItems.map((item) => (
                  <TaskRow
                    key={item.id}
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
                    computeWorkKind={wkOf}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            <button onClick={importPlanToTasks} className={BTN}>
              <CalendarDays className="w-4 h-4" /> Importuj plan
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addTask} className={BTN}>
              <Plus className="w-4 h-4" /> Dodaj zadanie
            </button>
            <button onClick={sendTasksToManager} className={BTN}>
              <Send className="w-4 h-4 text-emerald-600" /> Wyślij zadania
            </button>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
