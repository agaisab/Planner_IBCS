import { MODE_META } from './constants.js';

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

export const formatTimeLabel = (value) => {
  if (!value) return '—';
  return value === '24:00' ? '00:00' : value;
};

export const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const holidayCache = new Map();

const computeEasterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // March=3, April=4
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const pushHoliday = (set, date) => set.add(ymd(date));

export const getPolishPublicHolidays = (year) => {
  if (!Number.isFinite(year)) return new Set();
  if (holidayCache.has(year)) return holidayCache.get(year);

  const set = new Set();
  pushHoliday(set, new Date(year, 0, 1)); // Nowy Rok
  pushHoliday(set, new Date(year, 0, 6)); // Trzech Króli
  pushHoliday(set, new Date(year, 4, 1)); // Święto Pracy
  pushHoliday(set, new Date(year, 4, 3)); // Święto Konstytucji 3 Maja
  pushHoliday(set, new Date(year, 7, 15)); // Wniebowzięcie NMP
  pushHoliday(set, new Date(year, 10, 1)); // Wszystkich Świętych
  pushHoliday(set, new Date(year, 10, 11)); // Święto Niepodległości
  pushHoliday(set, new Date(year, 11, 24)); // Wigilia
  pushHoliday(set, new Date(year, 11, 25)); // Boże Narodzenie
  pushHoliday(set, new Date(year, 11, 26)); // Drugi dzień BN

  const easterSunday = computeEasterSunday(year);
  pushHoliday(set, easterSunday); // Niedziela Wielkanocna
  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);
  pushHoliday(set, easterMonday); // Poniedziałek Wielkanocny

  const pentecost = new Date(easterSunday);
  pentecost.setDate(pentecost.getDate() + 49);
  pushHoliday(set, pentecost); // Zesłanie Ducha Świętego

  const corpusChristi = new Date(easterSunday);
  corpusChristi.setDate(corpusChristi.getDate() + 60);
  pushHoliday(set, corpusChristi); // Boże Ciało

  holidayCache.set(year, set);
  return set;
};

export const isPublicHoliday = (date) => {
  if (!(date instanceof Date)) return false;
  return getPolishPublicHolidays(date.getFullYear()).has(ymd(date));
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
    return 'Rozliczone w CRM';
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
  if (isWeekend(date)) return '+ 100%';

  const startMinutes = toMinutes(task.start);
  const endMinutes = toMinutes(task.end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 'Zwykłe';

  const span = getPlanSpanMins(shifts);

  const DEFAULT_CORE_START = 8 * 60;
  const DEFAULT_CORE_END = 16 * 60;

  const spanStart = Number.isFinite(span.start) ? span.start : null;
  const spanEnd = Number.isFinite(span.end) ? span.end : null;

  let coreStart = spanStart != null ? spanStart : DEFAULT_CORE_START;
  let coreEnd = spanEnd != null ? spanEnd : DEFAULT_CORE_END;

  if (!(coreEnd > coreStart)) {
    coreStart = DEFAULT_CORE_START;
    coreEnd = DEFAULT_CORE_END;
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
  return '+ 50%';
};

export const summarizePlan = (data) => {
  const parts = (data?.shifts || []).map((shift) => {
    const label = MODE_META[shift.mode || 'OFFICE']?.label;
    return shift.start && shift.end
      ? `${formatTimeLabel(shift.start)}–${formatTimeLabel(shift.end)} ${label}`
      : label;
  });
  return parts.length ? parts.join(' · ') : '—';
};

const isObjectLike = (value) => value !== null && typeof value === 'object';

export const deepEqual = (a, b) => {
  if (Object.is(a, b)) return true;

  const aIsObj = isObjectLike(a);
  const bIsObj = isObjectLike(b);
  if (!aIsObj || !bIsObj) return false;

  const aIsDate = a instanceof Date;
  if (aIsDate || b instanceof Date) {
    if (!(aIsDate && b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray || Array.isArray(b)) {
    if (!(aIsArray && Array.isArray(b))) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
};
