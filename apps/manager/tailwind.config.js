export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}', '../../packages/shared/src/**/*.{js,jsx,ts,tsx}'],
  safelist: [
    'bg-emerald-50',
    'border-emerald-300',
    'text-emerald-800',
    'text-emerald-700',
    'bg-emerald-500',
    'bg-sky-50',
    'border-sky-300',
    'text-sky-800',
    'text-sky-700',
    'bg-sky-500',
    'bg-indigo-50',
    'border-indigo-300',
    'text-indigo-800',
    'bg-indigo-500',
    'bg-lime-50',
    'border-lime-300',
    'text-lime-800',
    'bg-lime-500',
    'bg-amber-50',
    'border-amber-300',
    'text-amber-800',
    'bg-amber-500',
    'bg-rose-50',
    'border-rose-300',
    'text-rose-800',
    'bg-rose-500',
    'bg-red-50',
    'border-red-300',
    'text-red-800',
    'bg-red-500',
    'bg-slate-50',
    'border-slate-300',
    'text-slate-700'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
