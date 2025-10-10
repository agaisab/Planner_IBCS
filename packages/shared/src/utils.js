export const cls = (...args) => args.filter(Boolean).join(' ');

export const ymd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const plMonth = (date) => date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

export const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesToHHmm = (mins) =>
  `${String(Math.floor((mins || 0) / 60)).padStart(2, '0')}:${String((mins || 0) % 60).padStart(2, '0')}`;

export const stripActor = (text) => {
  const value = String(text || '');
  if (value.startsWith('Pracownik: ')) return value.slice(11);
  if (value.startsWith('Kierownik: ')) return value.slice(11);
  return value;
};

export const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const timeOptions15 = [...Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
}), '24:00'];

export const computeReported = (items) =>
  (items || []).reduce((acc, task) => acc + (toMinutes(task.end) - toMinutes(task.start)), 0);

export const allTasksClosed = (items) =>
  (items || []).length > 0 && (items || []).every((task) => task.status === 'Zakończone');

export const computeDayStatus = (items, plannedMinutes) => {
  if (plannedMinutes > 0 && allTasksClosed(items) && computeReported(items) >= plannedMinutes) {
    return 'Rozliczone';
  }
  return 'W trakcie';
};

export const getPlanSpanMins = (shifts) => {
  const arr = (shifts || []).filter((shift) => shift.start && shift.end);
  if (arr.length === 0) return { start: null, end: null };
  return {
    start: Math.min(...arr.map((shift) => toMinutes(shift.start))),
    end: Math.max(...arr.map((shift) => toMinutes(shift.end)))
  };
};

export const computeWorkKindFor = (task, date, shifts) => {
  if (!task?.start || !task?.end) return 'Zwykłe';
  if (isWeekend(date)) return 'H + 100%';

  const startMinutes = toMinutes(task.start);
  const endMinutes = toMinutes(task.end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 'Zwykłe';

  const span = getPlanSpanMins(shifts);

  const DEFAULT_CORE_START = 8 * 60;
  const DEFAULT_CORE_END = 16 * 60;

  const spanStart = Number.isFinite(span.start) ? span.start : null;
  const spanEnd = Number.isFinite(span.end) ? span.end : null;

  let coreStart = spanStart != null ? Math.max(spanStart, DEFAULT_CORE_START) : DEFAULT_CORE_START;
  let coreEnd = spanEnd != null ? Math.min(spanEnd, DEFAULT_CORE_END) : DEFAULT_CORE_END;

  if (!(coreEnd > coreStart)) {
    if (spanStart != null && spanEnd != null && spanEnd > spanStart) {
      coreStart = spanStart;
      coreEnd = spanEnd;
    } else {
      coreStart = DEFAULT_CORE_START;
      coreEnd = DEFAULT_CORE_END;
    }
  }

  if (startMinutes >= coreStart && endMinutes <= coreEnd) {
    return 'Zwykłe';
  }

  const NIGHT_START = 22 * 60;
  const NIGHT_END = 6 * 60;
  const touchesNight =
    startMinutes >= NIGHT_START ||
    endMinutes > NIGHT_START ||
    startMinutes < NIGHT_END ||
    endMinutes <= NIGHT_END;

  if (touchesNight) return 'Nocne';
  return 'H + 50%';
};
