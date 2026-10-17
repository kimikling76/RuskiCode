'use client';
import {useEffect, useRef} from 'react';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {usePersonal} from '@/store/personal-chat';

const modeLabels: Record<CinemaJob['mode'], string> = {create: 'Imagen', edit: 'Edición de imagen', shot: 'Imagen de un plano', video: 'Video'};

// Kie recommends polling with backoff starting at 2–3 s.
function delayFor(job: CinemaJob, failures: number) {
  const age = Date.now() - job.createdAt;
  const base = age < 30000 ? 3000 : age < 120000 ? 5000 : 10000;
  return Math.min(base * 2 ** failures, 30000);
}

/** Keeps every pending Kie task up to date while the workspace is open, in any studio. */
export function CinemaJobRunner() {
  const hydrate = useCinema(s => s.hydrate);
  const jobs = useCinema(s => s.data.jobs);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const failures = useRef(new Map<string, number>());

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    const pending = jobs.filter(j => isActive(j) && j.taskId);
    for (const job of pending) {
      if (timers.current.has(job.id)) continue;
      const tries = failures.current.get(job.id) || 0;
      timers.current.set(job.id, setTimeout(() => void poll(job), delayFor(job, tries)));
    }
    // Forget timers for jobs that finished or were removed.
    for (const [id, timer] of timers.current) {
      if (!pending.some(j => j.id === id)) { clearTimeout(timer); timers.current.delete(id); }
    }
  }, [jobs]);

  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);

  async function poll(job: CinemaJob) {
    const {updateJob} = useCinema.getState();
    try {
      const r = await fetch('/api/cinema/images?taskId=' + encodeURIComponent(job.taskId!));
      const body = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 404) {
        updateJob(job.id, {state: 'error', error: r.status === 401 ? 'AUTH_REQUIRED' : 'TASK_NOT_FOUND', finishedAt: Date.now()});
      } else if (!r.ok) {
        // Temporary: keep polling, more slowly.
        failures.current.set(job.id, (failures.current.get(job.id) || 0) + 1);
      } else {
        failures.current.delete(job.id);
        if (body.state === 'success') {
          updateJob(job.id, {state: 'success', urls: body.urls, credits: body.credits, finishedAt: Date.now()});
          usePersonal.getState().charge('kie-task:' + job.taskId, body.credits, {studio: 'cinema', label: modeLabels[job.mode]});
        } else if (body.state === 'fail') {
          updateJob(job.id, {state: 'fail', error: 'GENERATION_FAILED', failMessage: body.failMessage, credits: body.credits, finishedAt: Date.now()});
          if (body.credits !== undefined) usePersonal.getState().charge('kie-task:' + job.taskId, body.credits, {studio: 'cinema', label: modeLabels[job.mode]});
        } else if (body.state !== job.state) {
          updateJob(job.id, {state: body.state});
        }
      }
    } catch {
      failures.current.set(job.id, (failures.current.get(job.id) || 0) + 1);
    } finally {
      timers.current.delete(job.id);
      // Re-arm if still pending: the effect only runs on store changes.
      const current = useCinema.getState().data.jobs.find(j => j.id === job.id);
      if (current && isActive(current) && current.taskId && !timers.current.has(current.id)) {
        timers.current.set(current.id, setTimeout(() => void poll(current), delayFor(current, failures.current.get(current.id) || 0)));
      }
    }
  }

  return null;
}
