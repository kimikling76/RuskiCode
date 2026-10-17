'use client';
import {useState} from 'react';
import Link from 'next/link';
import {LogOut} from 'lucide-react';
import {authClient} from '@/lib/auth/client';
import {Group, Row} from './parts';

const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'long', year: 'numeric'});

export function AccountSection() {
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw Error();
      window.location.assign('/login');
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  if (session.isPending) {
    return (
      <div className="rc-history-loading" role="status" aria-label="Cargando la cuenta">
        <span className="rc-skeleton" /><span className="rc-skeleton" />
      </div>
    );
  }

  const user = session.data?.user;
  if (!user) {
    return (
      <Group title="Cuenta" description="No hay una sesión iniciada en este navegador.">
        <Row label="Sin sesión" detail="Para usar el Chat, generar imágenes o componer PDFs hay que entrar con la cuenta del equipo.">
          <Link className="rc-btn rc-btn--primary rc-btn--sm" href="/login">Iniciar sesión</Link>
        </Row>
      </Group>
    );
  }

  const expires = session.data?.session.expiresAt ? new Date(session.data.session.expiresAt) : null;
  return (
    <>
      <Group title="Cuenta" description="Es la cuenta compartida del equipo. El registro público está cerrado.">
        <Row label="Correo"><span className="rc-set-value" translate="no">{user.email}</span></Row>
        {user.name ? <Row label="Nombre"><span className="rc-set-value">{user.name}</span></Row> : null}
        {expires && Number.isFinite(expires.getTime()) ? <Row label="Sesión" detail="Se renueva sola mientras la uses."><span className="rc-set-value">Vence el {dateFormat.format(expires)}</span></Row> : null}
      </Group>
      <Group title="Salir">
        <Row label="Cerrar sesión en este navegador" detail="Tus chats, libros e imágenes guardados acá no se borran.">
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy} onClick={signOut}><LogOut aria-hidden="true" />{busy ? 'Saliendo…' : 'Cerrar sesión'}</button>
        </Row>
        {error ? <p className="rc-form-error" role="alert">No se pudo cerrar la sesión. Probá de nuevo.</p> : null}
      </Group>
    </>
  );
}
