export const MODE_META = {
  OFFICE: { label: 'Biuro', base: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  REMOTE: { label: 'Zdalnie', base: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-800', dot: 'bg-sky-500' },
  TRAVEL: { label: 'Delegacja', base: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  ONCALL: { label: 'Helpdesk', base: 'bg-lime-50', border: 'border-lime-300', text: 'text-lime-800', dot: 'bg-lime-500' },
  VACATION: { label: 'Urlop', base: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500' },
  SICK: { label: 'L4', base: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800', dot: 'bg-rose-500' },
  ABSENCE: { label: 'Nieobecność', base: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', dot: 'bg-red-500' }
};

export const TASK_TYPE_COLORS = {
  Biuro: { base: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-800' },
  Zdalnie: { base: 'bg-sky-50', dot: 'bg-sky-500', border: 'border-sky-300', text: 'text-sky-800' },
  Delegacja: { base: 'bg-indigo-50', dot: 'bg-indigo-500', border: 'border-indigo-300', text: 'text-indigo-800' },
  Helpdesk: { base: 'bg-lime-50', dot: 'bg-lime-500', border: 'border-lime-300', text: 'text-lime-800' },
  Urlop: { base: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-300', text: 'text-amber-800' },
  L4: { base: 'bg-rose-50', dot: 'bg-rose-500', border: 'border-rose-300', text: 'text-rose-800' },
  Nieobecność: { base: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-300', text: 'text-red-800' }
};

export const STATUS_STYLES = {
  Planowane: 'bg-sky-50 border-sky-300 text-sky-700',
  'Zakończone': 'bg-emerald-50 border-emerald-300 text-emerald-700'
};

export const DAY_STATUS_STYLES = {
  'W trakcie': 'bg-amber-50 border-amber-300 text-amber-800',
  Rozliczone: 'bg-emerald-50 border-emerald-300 text-emerald-700'
};

export const WORKKIND_STYLES = {
  'Zwykłe': 'bg-slate-50 border-slate-300 text-slate-700',
  'H + 50%': 'bg-amber-50 border-amber-300 text-amber-800',
  'H + 100%': 'bg-rose-50 border-rose-300 text-rose-800',
  Nocne: 'bg-indigo-50 border-indigo-300 text-indigo-800'
};
