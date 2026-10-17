'use client';
import {useEffect, useState, type FormEvent} from 'react';
import {Eye, EyeOff} from 'lucide-react';
import {authClient} from '@/lib/auth/client';

function Password({id, label, value, onChange, autoComplete, hint}: {id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="rc-field">
      <label htmlFor={id}>{label}</label>
      <div className="rc-password">
        <input id={id} className="rc-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={12} maxLength={128} value={value} onChange={e => onChange(e.target.value)} aria-describedby={hint ? id + '-hint' : undefined} />
        <button type="button" className="rc-icon-btn rc-password-toggle" aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {hint ? <p id={id + '-hint'} className="rc-hint">{hint}</p> : null}
    </div>
  );
}

export function LoginForm({setup, unavailable, googleEnabled = false, oauthError = false}: {setup: boolean; unavailable: boolean; googleEnabled?: boolean; oauthError?: boolean}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthError ? 'No se pudo entrar con Google. Elegí la cuenta autorizada del equipo.' : '');
  // Until the page is interactive the buttons stay off, so the browser never submits the form by itself
  // (which would put the email in the address bar).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (setup && password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      if (setup) {
        const response = await fetch('/api/studio/setup', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password, code})});
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (result.error === 'SETUP_CLOSED') throw Error('La cuenta ya fue creada. Recargá esta página para entrar.');
          if (result.error === 'RATE_LIMIT') throw Error('Demasiados intentos. Probá más tarde.');
          throw Error('No se pudo activar la cuenta. Revisá los datos y el código del estudio.');
        }
      } else {
        const result = await authClient.signIn.email({email, password, rememberMe: true});
        if (result.error) throw Error(result.error.status === 429 ? 'Demasiados intentos. Esperá un minuto.' : 'No se pudo entrar. Revisá el correo y la contraseña.');
      }
      window.location.assign('/workspace');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar. Probá de nuevo.');
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({provider: 'google', callbackURL: '/workspace', errorCallbackURL: '/login?error=google'});
      if (result.error) throw Error('No se pudo abrir Google. Probá de nuevo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con Google.');
      setBusy(false);
    }
  }

  const fields = (
    <>
      <div className="rc-field">
        <label htmlFor="login-email">Correo</label>
        <input id="login-email" className="rc-input" type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <Password id="login-password" label={setup ? 'Elegí una contraseña' : 'Contraseña'} value={password} onChange={setPassword} autoComplete={setup ? 'new-password' : 'current-password'} hint={setup ? 'Al menos 12 caracteres.' : undefined} />
      {setup ? (
        <>
          <Password id="login-confirm" label="Repetí la contraseña" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <div className="rc-field">
            <label htmlFor="login-code">Código del estudio</label>
            <input id="login-code" className="rc-input" type="password" autoComplete="off" required maxLength={256} value={code} onChange={e => setCode(e.target.value)} aria-describedby="login-code-hint" />
            <p id="login-code-hint" className="rc-hint">Es el STUDIO_ACCESS_CODE guardado en Vercel. Solo se usa para esta primera activación.</p>
          </div>
        </>
      ) : null}
      <button type="submit" disabled={!ready || busy || unavailable} className="rc-btn rc-btn--primary rc-btn--lg rc-login-submit">
        {busy ? 'Un momento…' : setup ? 'Activar la cuenta' : 'Entrar'}
      </button>
    </>
  );

  return (
    <form onSubmit={submit} className="rc-login-form" method="post">
      {unavailable ? <p role="status" className="rc-login-notice">El acceso se está configurando. Probá de nuevo en unos minutos.</p> : null}
      {googleEnabled ? (
        <>
          <button type="button" onClick={googleLogin} disabled={!ready || busy || unavailable} className="rc-btn rc-btn--secondary rc-btn--lg rc-login-submit">Continuar con Google</button>
          <p className="rc-hint rc-login-center">Con la cuenta de Google autorizada para el estudio.</p>
          <details className="rc-login-more">
            <summary>{setup ? 'Activar con correo y contraseña' : 'Entrar con correo y contraseña'}</summary>
            <div className="rc-login-fields">{fields}</div>
          </details>
        </>
      ) : (
        <div className="rc-login-fields">{fields}</div>
      )}
      {error ? <p role="alert" className="rc-form-error">{error}</p> : null}
    </form>
  );
}
