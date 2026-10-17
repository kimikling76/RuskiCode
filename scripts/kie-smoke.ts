// Real check of each Kie adapter with the server key. Costs a few credits; nothing runs without --yes.
//
//   KIE_API_KEY=… npm run kie:smoke                 → only the balance (free)
//   KIE_API_KEY=… npm run kie:smoke -- --yes        → balance + one short text per adapter + one 1K image
//   … -- --yes --models=kie-flash,claude-haiku-4-5  → choose the text models
//   … -- --yes --no-image                           → skip the image
//
// It prints what Kie answered and what it reported as cost. It never prints the key.
// After a model passes, change its status in src/lib/ai/models.ts to 'tested' (and write the date in `checked`).
import {catalog, findModel, imageModels, type TextModel} from '../src/lib/ai/models';
import {textConfig} from '../src/lib/ai/kie-text';
import {createProvider} from '../src/lib/ai/provider';
import {kieCredits} from '../src/lib/ai/kie-credits';
import {createJob, imageJobStatus} from '../src/lib/cinema/kie-jobs';

const args = process.argv.slice(2);
const paid = args.includes('--yes');
const chosen = args.find(a => a.startsWith('--models='))?.slice('--models='.length).split(',').filter(Boolean);
// Default: the cheapest enabled model of each text adapter.
const textIds = chosen || ['kie-flash', 'claude-haiku-4-5'];

type Line = {what: string; ok: boolean; detail: string};
const lines: Line[] = [];
const report = (what: string, ok: boolean, detail: string) => { lines.push({what, ok, detail}); console.log((ok ? 'OK    ' : 'FALLA ') + what + ' — ' + detail); };
const message = (e: unknown) => e instanceof Error ? e.message + ('status' in e ? ' (HTTP ' + String((e as {status: unknown}).status) + ')' : '') : String(e);

async function main() {
  if (!process.env.KIE_API_KEY) {
    console.error('Falta KIE_API_KEY en el entorno. No se hizo ningún pedido.');
    process.exitCode = 1;
    return;
  }

  try { report('Saldo (gratis)', true, (await kieCredits()) + ' créditos'); } catch (e) { report('Saldo (gratis)', false, message(e)); }
  if (!paid) {
    console.log('\nSolo se consultó el saldo. Agregá --yes para las pruebas que cobran (unos pocos créditos).');
    return;
  }

  for (const id of textIds) {
    const m = findModel(id);
    if (!m || m.category !== 'text') { report('Texto ' + id, false, 'no está en el catálogo'); continue; }
    const started = Date.now();
    try {
      const r = await createProvider(textConfig(m as TextModel)).generate({
        system: 'Respondé con una sola palabra.',
        messages: [{role: 'user', content: 'Decí «listo».'}],
        signal: AbortSignal.timeout(60000),
      });
      const cost = r.usage.credits !== undefined ? r.usage.credits + ' créditos informados' : 'Kie no informó el costo';
      report('Texto ' + m.name + ' (' + m.adapter + ')', r.text.trim().length > 0, JSON.stringify(r.text.trim().slice(0, 60)) + ' · ' + cost + ' · ' + (Date.now() - started) + ' ms');
    } catch (e) {
      report('Texto ' + m.name + ' (' + m.adapter + ')', false, message(e));
    }
  }

  if (!args.includes('--no-image')) {
    const nano = imageModels.find(m => m.id === 'nano-banana-2-1')!;
    try {
      const taskId = await createJob(nano, {prompt: 'Una taza blanca sobre una mesa de madera, luz suave.', aspect: '1:1', resolution: '1K', references: []});
      console.log('      Tarea creada: ' + taskId + ' (esperando el resultado, hasta 4 minutos)');
      const until = Date.now() + 240000;
      let done = false;
      while (Date.now() < until && !done) {
        await new Promise(r => setTimeout(r, 6000));
        const s = await imageJobStatus(taskId);
        if (s.state === 'success') { report('Imagen ' + nano.name, s.urls.length > 0, s.urls[0] + ' · ' + (s.credits !== undefined ? s.credits + ' créditos informados' : 'Kie no informó el costo')); done = true; }
        else if (s.state === 'fail') { report('Imagen ' + nano.name, false, s.failMessage || 'Kie la marcó como fallida'); done = true; }
      }
      if (!done) report('Imagen ' + nano.name, false, 'no terminó en 4 minutos; la tarea ' + taskId + ' puede terminar igual (ver https://kie.ai/logs)');
    } catch (e) {
      report('Imagen ' + nano.name, false, message(e));
    }
  }

  try { report('Saldo después (gratis)', true, (await kieCredits()) + ' créditos (no se usa para calcular costos: puede haber otros pedidos al mismo tiempo)'); } catch (e) { report('Saldo después (gratis)', false, message(e)); }

  const failed = lines.filter(l => !l.ok).length;
  console.log('\n' + (lines.length - failed) + '/' + lines.length + ' bien. Modelos en el catálogo: ' + catalog.length + '. Registro de Kie: https://kie.ai/logs');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(message(e)); process.exitCode = 1; });
