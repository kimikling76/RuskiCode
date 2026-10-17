'use client';
import {useEffect, useState} from 'react';
import {Switch} from '@/components/ui/switch';
import {useCinemaUi} from '@/store/cinema-ui';
import {usePersonal} from '@/store/personal-chat';
import {useChatDialogs} from '@/components/studio/chat-dialogs';
import {Group, Row} from './parts';

// Same key the Chat composer reads when it opens.
const CHAT_ASK_KEY = 'rc-ask-first';

export function PreferencesSection() {
  const [chatAsk, setChatAsk] = useState(false);
  const cinemaAsk = useCinemaUi(s => s.askFirst);
  const setCinemaAsk = useCinemaUi(s => s.setAskFirst);
  const restoreCinemaAsk = useCinemaUi(s => s.restoreAskFirst);
  const chats = usePersonal(s => s.data.chats.length);
  const dialogs = useChatDialogs();

  useEffect(() => {
    try { setChatAsk(localStorage.getItem(CHAT_ASK_KEY) === '1'); } catch {}
    restoreCinemaAsk();
  }, [restoreCinemaAsk]);

  function changeChatAsk(value: boolean) {
    setChatAsk(value);
    try { localStorage.setItem(CHAT_ASK_KEY, value ? '1' : '0'); } catch {}
  }

  return (
    <>
      <Group title="Confirmar antes de gastar créditos" description="Es el mismo interruptor «Preguntar antes» que ves en cada estudio.">
        <Row label={<label htmlFor="pref-chat-ask">Chat</label>} detail="Antes de enviar cada mensaje, muestra el modelo y pide confirmación.">
          <Switch id="pref-chat-ask" checked={chatAsk} onCheckedChange={changeChatAsk} />
        </Row>
        <Row label={<label htmlFor="pref-cinema-ask">Cinema Studio y las imágenes de PDF Studio</label>} detail="Antes de generar, muestra modelo, cantidad, formato y resolución.">
          <Switch id="pref-cinema-ask" checked={cinemaAsk} onCheckedChange={setCinemaAsk} />
        </Row>
      </Group>
      <Group title="Chats">
        <Row label="Borrar todos los chats" detail={chats ? chats + (chats === 1 ? ' chat guardado en este navegador.' : ' chats guardados en este navegador.') : 'No hay chats guardados.'}>
          <button type="button" className="rc-btn rc-btn--danger rc-btn--sm" disabled={!chats} onClick={dialogs.openClearAll}>Borrar todo…</button>
        </Row>
      </Group>
    </>
  );
}
