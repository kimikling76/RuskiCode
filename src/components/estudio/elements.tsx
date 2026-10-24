'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {ImagePlus, MapPin, MoreHorizontal, Plus, User, X} from 'lucide-react';
import {useStudioItems, type StudioElement, type StudioItem} from '@/store/cinema-projects';
import {useCinema} from '@/store/cinema';
import {useRefUrl} from '@/components/kb/character-refs';
import {GalleryPicker} from '@/components/cinema/gallery-picker';
import {ConfirmDialog, Dialog} from '@/components/ui/dialog';
import {Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {Segmented} from '@/components/cinema/controls';
import {pictureUrl, useCast, type CastMember} from './data';

function Picture({member}: {member: CastMember}) {
  const url = useRefUrl(member.picture && 'ref' in member.picture ? member.picture.ref : null);
  const src = member.picture && 'url' in member.picture ? member.picture.url : url && url !== 'missing' ? url : null;
  const Icon = member.kind === 'place' ? MapPin : User;
  return <span className="rc-es-el-pic" aria-hidden="true">{src ? <img src={src} alt="" /> : <Icon />}</span>;
}

function ElementForm({open, item, onClose}: {open: boolean; item: StudioItem | null; onClose: () => void}) {
  const create = useStudioItems(s => s.create);
  const update = useStudioItems(s => s.update);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StudioElement['kind']>('character');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [picker, setPicker] = useState(false);
  // Kie deletes its files after 14 days: an element keeps the studio's own copy of the picture when there is one.
  const lasting = (url: string) => {
    const job = useCinema.getState().data.jobs.find(j => j.urls[0] === url);
    return job?.saved?.[0] ? 'asset:' + job.saved[0].hash : url;
  };
  useEffect(() => {
    if (!open) return;
    setName(item?.name || ''); setKind(item?.element?.kind || 'character'); setDescription(item?.element?.description || ''); setImage(item?.element?.image);
  }, [open, item]);
  function save() {
    const element: StudioElement = {kind, description: description.trim(), ...(image ? {image} : {})};
    if (item) update(item.id, {name, element}); else create('element', name, {element});
    onClose();
  }
  return (
    <Dialog open={open} onClose={onClose} title={item ? 'Editar «' + item.name + '»' : 'Nuevo elemento'} description="Un personaje o un lugar que llamás con @ en el prompt. Su descripción se agrega al prompt y su imagen va como referencia.">
      <form className="rc-dialog-body" onSubmit={e => { e.preventDefault(); if (name.trim()) save(); }}>
        <div className="rc-field"><span>Tipo</span>
          <Segmented name="es-el-kind" label="Tipo" value={kind} onChange={setKind} options={[{value: 'character', label: 'Personaje'}, {value: 'place', label: 'Lugar'}]} />
        </div>
        <label className="rc-field"><span>Nombre (el que escribís después de @)</span><input className="rc-input" required autoFocus maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'place' ? 'Nombre del lugar' : 'Nombre del personaje'} /></label>
        <label className="rc-field"><span>Cómo es</span><textarea className="rc-textarea" rows={3} maxLength={600} value={description} onChange={e => setDescription(e.target.value)} placeholder={kind === 'place' ? 'A small train station at dawn, wooden benches, light fog.' : 'A tall man in his forties, gray coat, short dark hair.'} /><small className="rc-hint">Mejor en inglés: así lo recibe el modelo, sin traducir.</small></label>
        <div className="rc-field"><span>Imagen de referencia (opcional)</span>
          <div className="rc-es-el-image">
            {image ? <span className="rc-ref"><img src={pictureUrl(image)} alt="" /><button type="button" className="rc-ref-remove" aria-label="Quitar la imagen" onClick={() => setImage(undefined)}><X /></button></span> : null}
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setPicker(true)}><ImagePlus aria-hidden="true" />{image ? 'Cambiar' : 'Elegir o subir una imagen'}</button>
          </div>
        </div>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rc-btn rc-btn--primary" disabled={!name.trim()}>{item ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
      <GalleryPicker open={picker} onClose={() => setPicker(false)} max={1} initial={[]} title="Imagen de referencia" upload onChoose={urls => { if (urls[0]) setImage(lasting(urls[0])); }} />
    </Dialog>
  );
}

/** «Mis elementos»: the Estudio's own characters and places, and the book's characters (edited in Contexto del libro). */
export function ElementsView() {
  const cast = useCast();
  const items = useStudioItems(s => s.items);
  const remove = useStudioItems(s => s.remove);
  const [editing, setEditing] = useState<StudioItem | null | 'new'>(null);
  const [removing, setRemoving] = useState<StudioItem | null>(null);
  const own = (cast || []).filter(m => m.source === 'own');
  const book = (cast || []).filter(m => m.source === 'book');
  const card = (m: CastMember, actions?: React.ReactNode) => (
    <li key={m.key} className="rc-es-el">
      <Picture member={m} />
      <span className="rc-es-el-text">
        <strong lang="ru">{m.name}</strong>
        <span>{m.source === 'book' ? (m.reference ? 'Con su foto principal' : 'Sin foto principal: va solo su descripción') : m.kind === 'place' ? 'Lugar' : 'Personaje'}</span>
        {m.description ? <small>{m.description}</small> : null}
      </span>
      {actions}
    </li>
  );
  return (
    <div className="rc-es-elements">
      <section aria-labelledby="es-own">
        <div className="rc-es-section-row">
          <h2 id="es-own">Tus personajes y lugares</h2>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setEditing('new')}><Plus aria-hidden="true" />Nuevo elemento</button>
        </div>
        {own.length ? (
          <ul className="rc-es-el-list">
            {own.map(m => {
              const item = items.find(i => 'own:' + i.id === m.key)!;
              return card(m, (
                <Menu>
                  <MenuTrigger asChild><button type="button" className="rc-icon-btn rc-es-el-more" aria-label={'Más opciones de «' + m.name + '»'}><MoreHorizontal /></button></MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => setEditing(item)}>Editar</MenuItem>
                    <MenuSeparator />
                    <MenuItem danger onSelect={() => setRemoving(item)}>Borrar</MenuItem>
                  </MenuContent>
                </Menu>
              ));
            })}
          </ul>
        ) : <p className="rc-es-none">Todavía no hay. Creá un personaje o un lugar y llamalo con @ en el prompt.</p>}
      </section>
      <section aria-labelledby="es-book">
        <div className="rc-es-section-row">
          <h2 id="es-book">Del libro</h2>
          <Link href="/workspace/libro" className="rc-btn rc-btn--ghost rc-btn--sm">Editar en Contexto del libro</Link>
        </div>
        {cast === null ? <div className="rc-history-loading" role="status" aria-label="Cargando"><span className="rc-skeleton" /></div>
          : book.length ? <ul className="rc-es-el-list">{book.map(m => card(m))}</ul>
          : <p className="rc-es-none">No hay personajes del libro en este navegador ni en tu cuenta.</p>}
        <p className="rc-hint">Con @ se envía solo la foto principal aprobada de cada personaje del libro y su descripción confirmada.</p>
      </section>
      <ElementForm open={editing !== null} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} tone="danger" confirmLabel="Borrar" title={'¿Borrar «' + (removing?.name || '') + '»?'} description="Deja de aparecer con @. Lo ya generado no cambia." onConfirm={() => { const r = removing; setRemoving(null); if (r) remove(r.id); }} />
    </div>
  );
}
