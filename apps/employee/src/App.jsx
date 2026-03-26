import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, LockKeyhole, Plug } from 'lucide-react';
import EmployeePanel from './components/EmployeePanel.jsx';
import Logo from './assets/ibcs-logo.png';
import { createEmployee, fetchEmployeeByCrmLogin, fetchManagers } from '@planner/shared';

const CRM_PROXY_URL =
  import.meta.env?.VITE_CRM_PROXY_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5050` : 'http://localhost:5050');
const CRM_FIXED_DOMAIN = import.meta.env?.VITE_CRM_DOMAIN || 'bcspol';
const CRM_SESSION_SCOPE = 'employee-panel';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.18),_transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-800 grid place-items-center p-6">
      <div className="w-full max-w-md rounded-[28px] border-2 border-slate-200 bg-white/95 shadow-xl p-7">
        <div className="mb-7 flex flex-col items-center text-center">
          <img src={Logo} alt="IBCS Planner logo" className="h-[64px] w-[64px] object-contain" />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            <Plug className="h-3.5 w-3.5" /> Logowanie do Plannera
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-xs text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmployeeLoginGate({ onAuthenticated }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ login: '', password: '' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${CRM_PROXY_URL}/crm/session/status?scope=${encodeURIComponent(CRM_SESSION_SCOPE)}`, {
          credentials: 'include'
        });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (response.ok && payload?.connected) {
          onAuthenticated({
            login: payload?.user || '',
            domain: payload?.domain || CRM_FIXED_DOMAIN
          });
          return;
        }
      } catch {
        /* ignore and keep login screen */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onAuthenticated]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (submitting) return;
      const login = credentials.login.trim();
      if (!login || !credentials.password) {
        setError('Wypełnij login i hasło.');
        return;
      }

      setSubmitting(true);
      setError('');
      try {
        const response = await fetch(`${CRM_PROXY_URL}/crm/login`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            scope: CRM_SESSION_SCOPE,
            login,
            password: credentials.password,
            domain: CRM_FIXED_DOMAIN
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (payload && typeof payload.error === 'string' && payload.error.trim()) ||
              `Połączenie z CRM nie powiodło się (status ${response.status}).`
          );
        }
        onAuthenticated({
          login: payload?.user || login,
          domain: payload?.domain || CRM_FIXED_DOMAIN
        });
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err);
        const isNetworkIssue = err instanceof Error && (err.name === 'TypeError' || details.includes('Failed to fetch'));
        setError(isNetworkIssue ? 'Brak połączenia z serwerem integracji CRM.' : details || 'Logowanie nie powiodło się.');
      } finally {
        setSubmitting(false);
      }
    },
    [credentials, onAuthenticated, submitting]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 grid place-items-center p-6">
        <div className="rounded-3xl border-2 border-slate-200 bg-white px-6 py-5 shadow-sm flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Sprawdzam sesję logowania...</span>
        </div>
      </div>
    );
  }

  return (
    <AuthShell title="Panel pracownika" subtitle="Zaloguj się loginem i hasłem z CRM, aby wejść do aplikacji.">
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <label className="text-sm block">
          Login
          <input
            value={credentials.login}
            onChange={(event) => {
              setCredentials((prev) => ({ ...prev, login: event.target.value }));
              if (error) setError('');
            }}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            placeholder="np. jan.kowalski"
            disabled={submitting}
          />
        </label>
        <label className="text-sm block">
          Hasło
          <input
            type="password"
            value={credentials.password}
            onChange={(event) => {
              setCredentials((prev) => ({ ...prev, password: event.target.value }));
              if (error) setError('');
            }}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            placeholder="••••••••"
            disabled={submitting}
          />
        </label>
        <div className="text-xs text-slate-500">
          Domena CRM: <span className="font-medium text-slate-700">{CRM_FIXED_DOMAIN}</span>
        </div>
        <button
          type="submit"
          className="mx-auto mt-3 inline-flex w-auto items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-base font-medium text-white hover:bg-slate-950 disabled:cursor-wait disabled:bg-slate-400"
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          {submitting ? 'Logowanie...' : 'Zaloguj'}
        </button>
      </form>
    </AuthShell>
  );
}

function EmployeeOnboarding({ authUser, onComplete, onRequireLogin }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState({
    name: '',
    role: 'Technik',
    employmentType: 'Pełen etat',
    managerId: ''
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const items = await fetchManagers();
        if (!active) return;
        setManagers(items || []);
        setForm((prev) => ({
          ...prev,
          managerId: prev.managerId || items?.[0]?.id || ''
        }));
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedManager = useMemo(
    () => managers.find((manager) => manager.id === form.managerId) || null,
    [form.managerId, managers]
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (saving) return;
      if (!form.name.trim() || !form.role.trim() || !form.employmentType.trim() || !form.managerId) {
        setError('Uzupełnij wszystkie pola profilu.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const payload = {
          id: `e${Date.now()}`,
          name: form.name.trim(),
          role: form.role.trim(),
          employmentType: form.employmentType.trim(),
          managerId: form.managerId,
          email: '',
          crmLogin: authUser.login
        };
        const created = await createEmployee(payload);
        onComplete(created || payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [authUser.login, form, onComplete, saving]
  );

  return (
    <AuthShell title="Uzupełnij profil" subtitle="Pierwsze logowanie wykryte. Zapisz swoje dane, aby kierownik widział Cię w systemie.">
      {loading ? (
        <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 px-6 py-5 shadow-sm flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Ładuję listę kierowników...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Konto CRM: <span className="font-medium text-slate-700">{authUser.login}</span>
          </div>
          <label className="text-sm block">
            Imię i nazwisko
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="np. Jan Kowalski"
              disabled={saving}
            />
          </label>
          <label className="text-sm block">
            Stanowisko
            <input
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              placeholder="np. Technik"
              disabled={saving}
            />
          </label>
          <label className="text-sm block">
            Rodzaj etatu
            <select
              value={form.employmentType}
              onChange={(event) => setForm((prev) => ({ ...prev, employmentType: event.target.value }))}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              disabled={saving}
            >
              <option value="Pełen etat">Pełen etat</option>
              <option value="1/2 etatu">1/2 etatu</option>
              <option value="3/4 etatu">3/4 etatu</option>
              <option value="B2B">B2B</option>
            </select>
          </label>
          <label className="text-sm block">
            Kierownik
            <select
              value={form.managerId}
              onChange={(event) => setForm((prev) => ({ ...prev, managerId: event.target.value }))}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              disabled={saving || managers.length === 0}
            >
              <option value="">Wybierz kierownika</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </label>
          {selectedManager && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Profil zostanie przypisany do kierownika: <span className="font-medium">{selectedManager.name}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onRequireLogin}
              className="rounded-xl border-2 border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              disabled={saving}
            >
              Wyloguj
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-base font-medium text-white hover:bg-slate-950 disabled:cursor-wait disabled:bg-slate-400"
              disabled={saving || managers.length === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {saving ? 'Zapisuję...' : 'Utwórz konto'}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(undefined);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let active = true;
    if (!authenticatedUser?.login) {
      setEmployeeProfile(undefined);
      setProfileLoading(false);
      setProfileError('');
      return () => {
        active = false;
      };
    }

    setProfileLoading(true);
    setProfileError('');
    (async () => {
      try {
        const profile = await fetchEmployeeByCrmLogin(authenticatedUser.login);
        if (!active) return;
        setEmployeeProfile(profile || null);
      } catch (err) {
        if (!active) return;
        setProfileError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setProfileLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [authenticatedUser]);

  const handleRequireLogin = useCallback(() => {
    setAuthenticatedUser(null);
    setEmployeeProfile(undefined);
    setProfileLoading(false);
    setProfileError('');
  }, []);

  if (!authenticatedUser) {
    return <EmployeeLoginGate onAuthenticated={setAuthenticatedUser} />;
  }

  if (profileLoading || employeeProfile === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 grid place-items-center p-6">
        <div className="rounded-3xl border-2 border-slate-200 bg-white px-6 py-5 shadow-sm flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Sprawdzam profil użytkownika...</span>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <AuthShell title="Błąd profilu" subtitle="Nie udało się odczytać profilu użytkownika z systemu.">
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{profileError}</div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleRequireLogin}
            className="rounded-xl border-2 border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Wyloguj
          </button>
        </div>
      </AuthShell>
    );
  }

  if (!employeeProfile) {
    return (
      <EmployeeOnboarding
        authUser={authenticatedUser}
        onComplete={setEmployeeProfile}
        onRequireLogin={handleRequireLogin}
      />
    );
  }

  return (
    <EmployeePanel
      employeeProfile={employeeProfile}
      onEmployeeProfileChange={setEmployeeProfile}
      onRequireLogin={handleRequireLogin}
    />
  );
}
