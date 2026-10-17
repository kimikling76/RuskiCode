'use client';
import {useEffect, useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {usePersonal} from '@/store/personal-chat';
import {useCinema} from '@/store/cinema';
import {useNotes} from '@/store/book-notes';
import {listLocalBooks} from '@/lib/books/library';
import {Group, Row, Status, numberFormat} from './parts';

function count(n: number, one: string, many: string) {
  return numberFormat.format(n) + ' ' + (n === 1 ? one : many);
}

function size(bytes: number) {
  if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-AR') + ' KB';
  return (bytes / 1048576).toLocaleString('es-AR', {maximumFractionDigits: bytes < 10485760 ? 1 : 0}) + ' MB';
}

/** What this browser keeps for the studio. Everything here is local; nothing is synced. */
export function BrowserSection() {
  const personal = usePersonal(s => s.data);
  const cinema = useCinema(s => s.data);
  const hydrateCinema = useCinema(s => s.hydrate);
  const notes = useNotes(s => s.notes);
  const hydrateNotes = useNotes(s => s.hydrate);
  const [books, setBooks] = useState<number | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    hydrateCinema();
    hydrateNotes();
    listLocalBooks().then(list => setBooks(list.length)).catch(() => setBooks(null));
    navigator.storage?.estimate?.().then(e => { if (typeof e.usage === 'number') setUsed(e.usage); }).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, [hydrateCinema, hydrateNotes]);

  async function protect() {
    setAsking(true);
    try { setPersisted(await navigator.storage.persist()); } catch { setPersisted(false); }
    setAsking(false);
  }

  const images = cinema.jobs.filter(j => j.state === 'success').reduce((n, j) => n + (j.urls?.length || 0), 0);

  return (
    <>
      <Group title="Guardado en este navegador" description="Es la copia local de tu trabajo. Cuando abajo a la izquierda dice «Guardado», también está en tu cuenta y vuelve a descargarse si borrás los datos del navegador. Si dice «Solo en este navegador», todavía no.">
        <Row label="Chat" detail={count(personal.projects.length, 'proyecto convertido', 'proyectos convertidos')}>
          <span className="rc-set-value">{count(personal.chats.length, 'chat', 'chats')}</span>
        </Row>
        <Row label="Cinema Studio" detail={count(cinema.boards.length, 'plan de planos', 'planes de planos') + '. Kie borra los archivos de las imágenes a los 14 días; descargá las que quieras conservar.'}>
          <span className="rc-set-value">{count(images, 'imagen', 'imágenes')}</span>
        </Row>
        <Row label="PDF Studio" detail={count(notes.length, 'nota', 'notas') + '. Descargá el editable (.json) de cada libro para tener una copia.'}>
          <span className="rc-set-value">{books === null ? '—' : count(books, 'libro propio', 'libros propios')}</span>
        </Row>
        <Row label="Registro de consumo"><span className="rc-set-value">{count(personal.usage.length, 'pedido', 'pedidos')}</span></Row>
        {used !== null ? <Row label="Espacio que ocupa" detail="Lo informa el navegador; incluye los libros con sus imágenes."><span className="rc-set-value">{size(used)}</span></Row> : null}
      </Group>

      {persisted !== null ? (
        <Group title="Protección">
          <Row
            label="Que el navegador no borre estos datos"
            detail={persisted ? 'El navegador los conserva aunque se quede con poco espacio.' : 'Si el disco se llena, el navegador puede borrar datos de sitios por su cuenta. Podés pedirle que conserve los del estudio; algunos navegadores lo deciden solos.'}
          >
            {persisted ? <Status health="ok">Protegidos</Status> : (
              <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={asking} onClick={protect}><ShieldCheck aria-hidden="true" />Proteger</button>
            )}
          </Row>
        </Group>
      ) : null}
    </>
  );
}
