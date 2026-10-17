'use client';
import {useEffect, useState} from 'react';
import {create} from 'zustand';
import {toast} from 'sonner';
import {usePersonal} from '@/store/personal-chat';
import {UNDO_MS} from '@/lib/personal-chat/state';
import {Dialog, ConfirmDialog} from '@/components/ui/dialog';

type DialogState = {
  renameId: string | null;
  deleteId: string | null;
  settings: boolean;
  openRename: (id: string) => void;
  openDelete: (id: string) => void;
  openClearAll: () => void;
  close: () => void;
};

export const useChatDialogs = create<DialogState>(set => ({
  renameId: null,
  deleteId: null,
  settings: false,
  openRename: id => set({renameId: id}),
  openDelete: id => set({deleteId: id}),
  openClearAll: () => set({settings: true}),
  close: () => set({renameId: null, deleteId: null, settings: false}),
}));

/** Chat-level dialogs shared by the sidebar and the chat header. */
export function ChatDialogs({onChat}: {onChat: () => void}) {
  const d = useChatDialogs();
  const data = usePersonal(s => s.data);
  const error = usePersonal(s => s.error);
  const rename = usePersonal(s => s.rename);
  const remove = usePersonal(s => s.remove);
  const undo = usePersonal(s => s.undo);
  const clear = usePersonal(s => s.clear);
  const [title, setTitle] = useState('');
  const [step, setStep] = useState(1);
  const [confirmation, setConfirmation] = useState('');

  // Only reset the field when a different chat is opened, not on every history change.
  useEffect(() => { setTitle(usePersonal.getState().data.chats.find(c => c.id === d.renameId)?.title || ''); }, [d.renameId]);
  useEffect(() => { if (!d.settings) { setStep(1); setConfirmation(''); } }, [d.settings]);

  function confirmDelete() {
    const id = d.deleteId;
    if (!id || !remove(id)) return;
    d.close();
    toast('Chat borrado', {
      duration: UNDO_MS,
      action: {label: 'Deshacer', onClick: () => { undo(id); onChat(); }},
    });
  }

  return (
    <>
      <Dialog open={Boolean(d.renameId)} onClose={d.close} title="Renombrar chat">
        <form onSubmit={e => { e.preventDefault(); if (d.renameId && rename(d.renameId, title)) d.close(); }}>
          <label className="rc-field">
            <span>Nombre</span>
            <input className="rc-input" autoFocus maxLength={100} required value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <div className="rc-dialog-footer rc-dialog-footer--end">
            <button type="button" className="rc-btn rc-btn--ghost" onClick={d.close}>Cancelar</button>
            <button type="submit" className="rc-btn rc-btn--primary" disabled={!title.trim()}>Guardar</button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(d.deleteId)}
        onClose={d.close}
        onConfirm={confirmDelete}
        title="¿Borrar este chat?"
        description="Vas a tener unos segundos para deshacerlo. Los proyectos creados a partir de este chat no se borran."
        confirmLabel="Borrar chat"
        tone="danger"
      />

      <Dialog
        open={d.settings}
        onClose={d.close}
        title="¿Borrar todos los chats?"
        description="Los chats se guardan solo en este navegador. Los proyectos convertidos y el registro de consumo se conservan."
      >
        {step === 1 ? (
          <div className="rc-dialog-body">
            <p className="rc-hint">Se van a borrar todos los chats y sus mensajes de este navegador. Esta acción no se puede deshacer.</p>
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--ghost" onClick={d.close}>Cancelar</button>
              <button type="button" className="rc-btn rc-btn--danger" disabled={!data.chats.length && !data.pending.length} onClick={() => setStep(2)}>Continuar</button>
            </div>
          </div>
        ) : (
          <div className="rc-dialog-body">
            <label className="rc-field">
              <span>Para confirmar, escribí BORRAR</span>
              <input className="rc-input" autoFocus autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
            </label>
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--ghost" onClick={d.close}>Cancelar</button>
              <button type="button" className="rc-btn rc-btn--danger" disabled={confirmation.trim().toUpperCase() !== 'BORRAR'} onClick={() => { if (clear()) d.close(); }}>
                Borrar todos los chats
              </button>
            </div>
          </div>
        )}
        {error ? <p role="alert" className="rc-form-error">{error}</p> : null}
      </Dialog>
    </>
  );
}
