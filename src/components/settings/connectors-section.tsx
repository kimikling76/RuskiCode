'use client';
import {useQuery} from '@tanstack/react-query';
import {RefreshCw} from 'lucide-react';
import {imageModel} from '@/lib/cinema/capabilities';
import type {PublicModel} from '@/lib/ai/models';
import {ArrowUpRight} from 'lucide-react';
import {Group, Row, Status, timeFormat, type Health} from './parts';

type Models = {authenticated: boolean; accessConfigured: boolean; models: {id: string; name: string; enabled: boolean}[]; kie?: PublicModel[]};
type Composer = {workerOnline: boolean; configured: boolean; visualQAConfigured: boolean; workerRequiresStart: boolean; executor: 'bullmq' | 'inngest'};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {cache: 'no-store'});
  if (r.status === 401) throw Error('AUTH_REQUIRED');
  if (!r.ok) throw Error('UNAVAILABLE');
  return r.json();
}

const otherProviders = ['openai', 'anthropic', 'google', 'compatible'];

/** Service status from the endpoints the studio already has: /api/models and /api/books. Nothing here calls a paid API. */
export function ConnectorsSection() {
  const models = useQuery({queryKey: ['status-models'], queryFn: () => getJson<Models>('/api/models'), retry: false, staleTime: 0, refetchOnWindowFocus: false});
  const composer = useQuery({queryKey: ['status-composer'], queryFn: () => getJson<Composer>('/api/books'), retry: false, staleTime: 0, refetchOnWindowFocus: false});
  const busy = models.isFetching || composer.isFetching;
  const checked = Math.max(models.dataUpdatedAt, composer.dataUpdatedAt, models.errorUpdatedAt, composer.errorUpdatedAt);

  const m = models.data;
  const kie = m?.models.filter(x => x.id.startsWith('kie-')) || [];
  const kieOn = kie.filter(x => x.enabled);

  function account(): [Health, string, string] {
    if (models.isPending) return ['checking', 'Verificando…', ''];
    if (!m) return ['error', 'No responde', 'El servidor del estudio no contestó.'];
    if (!m.accessConfigured) return ['off', 'Sin configurar', 'Falta la configuración de acceso en el servidor.'];
    if (!m.authenticated) return ['off', 'Sin sesión', 'Iniciá sesión para usar los servicios.'];
    return ['ok', 'Funcionando', 'Tu sesión se verificó contra la base de datos.'];
  }

  function kieText(): [Health, string, string] {
    if (models.isPending) return ['checking', 'Verificando…', ''];
    if (!m) return ['error', 'No responde', ''];
    if (!kieOn.length) return ['off', 'Sin configurar', 'Falta la clave de Kie en el servidor.'];
    return ['ok', 'Configurado', kieOn.map(x => x.name.replace(' · KIE', '')).join(' y ') + '. Chat, ayuda con prompts, planes de planos y asistente editorial.'];
  }

  // Images use the same server key as the Kie text models (KIE_API_KEY).
  function kieImages(): [Health, string, string] {
    if (models.isPending) return ['checking', 'Verificando…', ''];
    if (!m) return ['error', 'No responde', ''];
    if (!kieOn.length) return ['off', 'Sin configurar', 'Falta la clave de Kie en el servidor.'];
    return ['ok', 'Configurado', imageModel.name + ' para Cinema Studio y las imágenes de los libros.'];
  }

  function pdf(): [Health, string, string] {
    if (composer.isPending) return ['checking', 'Verificando…', ''];
    if (composer.error) return composer.error.message === 'AUTH_REQUIRED' ? ['off', 'Sin sesión', 'Iniciá sesión para ver su estado.'] : ['error', 'No responde', 'El servidor del estudio no contestó.'];
    const c = composer.data!;
    const qa = c.visualQAConfigured ? ' La revisión visual de páginas está configurada.' : '';
    if (!c.configured) return ['off', 'Sin configurar', 'Falta la base de datos o la cola de trabajos en el servidor.'];
    if (c.executor === 'inngest') return ['ok', 'Configurado', 'Corre en Inngest; arranca solo con cada pedido.' + qa];
    return c.workerOnline
      ? ['ok', 'En línea', 'El worker de PDF avisó que está encendido.' + qa]
      : ['error', 'Apagado', 'El worker de PDF no avisó que esté encendido. Hay que iniciarlo para componer en el servidor. El editor y «Exportar PDF» funcionan igual.'];
  }

  const rows: {name: string; state: [Health, string, string]}[] = [
    {name: 'Cuenta y base de datos', state: account()},
    {name: 'Kie.ai · texto', state: kieText()},
    {name: 'Kie.ai · imágenes', state: kieImages()},
    {name: 'Compositor de PDF en el servidor', state: pdf()},
    {name: 'Video', state: ['off', 'Sin conectar', 'Todavía no hay un modelo de video elegido.']},
  ];

  const others = m?.models.filter(x => otherProviders.includes(x.id)) || [];

  return (
    <>
      <Group
        title="Servicios"
        description="«Configurado» quiere decir que la clave está guardada en el servidor. Se prueba de verdad la primera vez que la usás."
        action={
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => { void models.refetch(); void composer.refetch(); }}>
            <RefreshCw aria-hidden="true" />{busy ? 'Verificando…' : 'Verificar de nuevo'}
          </button>
        }
      >
        {rows.map(({name, state: [health, word, detail]}) => (
          <Row key={name} label={name} detail={detail || undefined}>
            <Status health={health}>{word}</Status>
          </Row>
        ))}
        {checked && !busy ? <p className="rc-hint rc-set-checked" aria-live="polite">Verificado a las {timeFormat.format(new Date(checked))}</p> : null}
      </Group>

      {m?.kie?.length ? <CatalogTable models={m.kie} /> : null}

      {others.length ? (
        <Group title="Otros proveedores" description="El Chat los ofrece solo si tienen clave y modelo configurados en el servidor.">
          {others.map(x => (
            <Row key={x.id} label={x.name}>
              <Status health={x.enabled ? 'ok' : 'off'}>{x.enabled ? 'Configurado' : 'Sin configurar'}</Status>
            </Row>
          ))}
        </Group>
      ) : null}
    </>
  );
}

const categoryNames = {text: 'Texto', image: 'Imagen', video: 'Video'} as const;
const statusNames = {tested: 'Verificado y en uso', docs: 'Verificado · sin prueba real', unverified: 'No verificado'} as const;

/** The whole Kie catalog with each model's state: what is enabled, what is missing for the rest. */
function CatalogTable({models}: {models: PublicModel[]}) {
  const counts = (['tested', 'docs', 'unverified'] as const).map(s => [s, models.filter(m => m.status === s).length] as const);
  return (
    <Group
      title="Catálogo de modelos de Kie"
      description={'Se mantiene a mano en src/lib/ai/models.ts, porque Kie no documenta un listado general de modelos. ' + counts.map(([s, n]) => n + ' ' + statusNames[s].toLowerCase()).join(' · ') + '.'}
    >
      <table className="rc-set-table rc-catalog-table">
        <thead><tr><th scope="col">Modelo</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Documentación</span></th></tr></thead>
        <tbody>
          {models.map(m => (
            <tr key={m.id}>
              <td>
                <strong>{m.name}</strong> <span className="rc-hint">{m.provider}</span>
                {m.missing ? <span className="rc-catalog-missing">{m.missing}</span> : null}
              </td>
              <td>{categoryNames[m.category]}</td>
              <td><Status health={m.status === 'unverified' ? 'off' : m.available ? 'ok' : 'off'}>{m.status !== 'unverified' && !m.available ? 'Sin clave en el servidor' : statusNames[m.status]}</Status></td>
              <td><a className="rc-catalog-docs" href={m.docs} target="_blank" rel="noreferrer" aria-label={'Documentación de ' + m.name}><ArrowUpRight aria-hidden="true" /></a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Group>
  );
}
