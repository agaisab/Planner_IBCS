import { useCallback, useEffect, useState } from 'react';
import { Loader2, LockKeyhole, Plug } from 'lucide-react';
import ManagerPanel from './components/ManagerPanel.jsx';
import Logo from './assets/ibcs-logo.png';
import { createManager, fetchManagerByCrmLogin } from '@planner/shared';

const CRM_PROXY_URL =
  import.meta.env?.VITE_CRM_PROXY_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5050` : 'http://localhost:5050');
const CRM_FIXED_DOMAIN = import.meta.env?.VITE_CRM_DOMAIN || 'bcspol';
const CRM_SESSION_SCOPE = 'manager-panel';

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

function ManagerLoginGate({ onAuthenticated }) {
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
    <AuthShell title="Panel kierownika" subtitle="Zaloguj się loginem i hasłem z CRM, aby wejść do aplikacji.">
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

function ManagerOnboarding({ authUser, onComplete, onRequireLogin }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (saving) return;
      if (!name.trim()) {
        setError('Wpisz imię i nazwisko kierownika.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const payload = {
          id: `m${Date.now()}`,
          name: name.trim(),
          crmLogin: authUser.login
        };
        const created = await createManager(payload);
        onComplete(created || payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [authUser.login, name, onComplete, saving]
  );

  return (
    <AuthShell title="Uzupełnij profil kierownika" subtitle="To pierwsze logowanie tego konta. Zapisz profil, aby wejść do panelu zespołu.">
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Konto CRM: <span className="font-medium text-slate-700">{authUser.login}</span>
        </div>
        <label className="text-sm block">
          Imię i nazwisko
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            placeholder="np. Jan Kowalski"
            disabled={saving}
          />
        </label>
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
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            {saving ? 'Zapisuję...' : 'Utwórz konto'}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

export default function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [managerProfile, setManagerProfile] = useState(undefined);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let active = true;
    if (!authenticatedUser?.login) {
      setManagerProfile(undefined);
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
        const profile = await fetchManagerByCrmLogin(authenticatedUser.login);
        if (!active) return;
        setManagerProfile(profile || null);
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
    setManagerProfile(undefined);
    setProfileLoading(false);
    setProfileError('');
  }, []);

  if (!authenticatedUser) {
    return <ManagerLoginGate onAuthenticated={setAuthenticatedUser} />;
  }

  if (profileLoading || managerProfile === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 grid place-items-center p-6">
        <div className="rounded-3xl border-2 border-slate-200 bg-white px-6 py-5 shadow-sm flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm text-slate-600">Sprawdzam profil kierownika...</span>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <AuthShell title="Błąd profilu" subtitle="Nie udało się odczytać profilu kierownika z systemu.">
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

  if (!managerProfile) {
    return (
      <ManagerOnboarding
        authUser={authenticatedUser}
        onComplete={setManagerProfile}
        onRequireLogin={handleRequireLogin}
      />
    );
  }

  return (
    <ManagerPanel
      managerProfile={managerProfile}
      onManagerProfileChange={setManagerProfile}
      onRequireLogin={handleRequireLogin}
    />
  );
}
