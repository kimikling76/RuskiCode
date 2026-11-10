'use client';
import {framesFor, type MediaOptions} from '@/lib/ai/models';
import {frameNames} from '@/lib/cinema/mentions';

// Keyframe models (Kling 4.0 Keyframe): the images sent are the video's frames in order. The first one is where it
// starts, the next ones are frames it passes through and, when the author ticks it, the last one is where it ends. Its
// page ties how many frames it takes to the duration, so the composers say it and do not send more.

/** What each image is in the video, in order («Inicio», «Cuadro 2», «Final»), for a keyframe model. */
export function frameRoles(o: Pick<MediaOptions, 'mention' | 'frames'>, count: number, lastFrame: boolean) {
  const names = frameNames(o, count, lastFrame);
  if (!names) return null;
  return names.map((n, i) => i === 0 ? 'Inicio' : n === o.frames!.lastMention ? 'Final' : 'Cuadro ' + (i + 1));
}

/** Why these frames cannot be sent with this duration, or null when they can. */
export function framesProblem(o: Pick<MediaOptions, 'frames' | 'maxReferences'>, count: number, duration?: string) {
  if (!o.frames || !count) return null;
  const max = framesFor(o, duration);
  return count > max ? 'Con ' + duration + ' s entran hasta ' + max + ' cuadros y elegiste ' + count + ': sacá ' + (count - max === 1 ? 'uno' : count - max) + ' o alargá el video.' : null;
}

/** The rule as the model page states it, for the tooltip of the images button. */
export function framesHint(o: Pick<MediaOptions, 'frames' | 'maxReferences'>, duration?: string) {
  if (!o.frames) return '';
  return 'La primera imagen es el inicio del video, las siguientes son cuadros por los que pasa, en orden, y la última puede ser el final. Con ' + (duration || '5') + ' s entran hasta ' + framesFor(o, duration) + ' cuadros en total (de 9 s en adelante, ' + framesFor(o, '30') + ').';
}

/** «La última es el cuadro final», shown with two images or more. */
export function LastFrameToggle({o, count, value, onChange}: {o: Pick<MediaOptions, 'frames'>; count: number; value: boolean; onChange: (v: boolean) => void}) {
  if (!o.frames || count < 2) return null;
  return (
    <label className="rc-kb-check rc-frames-last">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      La última imagen es el cuadro final del video
    </label>
  );
}
