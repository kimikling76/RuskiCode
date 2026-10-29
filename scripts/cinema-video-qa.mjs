// Local-only browser QA: the fixture and all mocked routes are created in a temporary copy, never in src/.
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const root = process.cwd();
const temp = await fs.mkdtemp('/tmp/ruskicode-video-qa-');
const output = path.join(root, 'docs/cinema-video-qa');
await fs.mkdir(output, {recursive: true});
for (const name of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.js', 'postcss.config.mjs', 'tailwind.config.ts']) {
  try { await fs.cp(name, path.join(temp, name), {recursive: true}); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
await fs.symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
const configPath = path.join(temp, 'next.config.ts');
await fs.writeFile(configPath, (await fs.readFile(configPath, 'utf8')).replace('{ poweredByHeader: false,', '{ devIndicators: false, poweredByHeader: false,'));
const fixture = path.join(temp, 'src/app/cinema-video-qa');
await fs.mkdir(fixture, {recursive: true});
await fs.writeFile(path.join(fixture, 'page.tsx'), `import Fixture from './fixture';export default function Page(){return <Fixture/>;}`);
await fs.writeFile(path.join(fixture, 'fixture.tsx'), `'use client';import {useEffect} from 'react';import {VideoTab} from '@/components/cinema/video-tab';import {useCinemaUi} from '@/store/cinema-ui';import {useCinema} from '@/store/cinema';export default function Fixture(){useEffect(()=>{useCinema.getState().hydrate();useCinemaUi.getState().patchVideo({model:'kling-4-0-reference-to-video'});},[]);return <main className="rc-app" data-studio="cinema"><section className="rc-cinema"><h1>Cinema Studio</h1><VideoTab/></section></main>;}`);
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3341'], {cwd: temp, stdio: ['ignore', 'pipe', 'pipe']});
let logs = '';
server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
const result = {checks: [], screenshots: [], axe: [], pageErrors: []};
let browser;
try {
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error(logs)), 60000); server.stdout.on('data', b => { if (String(b).includes('Ready')) {clearTimeout(timeout); resolve();} }); server.on('exit', c => {clearTimeout(timeout); reject(Error('QA server exited: ' + c + logs));}); });
  browser = await chromium.launch({executablePath: process.argv[2] || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const clip = await fs.readFile(process.argv[3] || '/tmp/ruskicode-reference.mp4');
  const hash = createHash('sha256').update(clip).digest('hex');
  const axe = await fs.readFile('/tmp/ruskicode-qa/node_modules/axe-core/axe.min.js', 'utf8');
  for (const width of [390, 768, 1280]) {
    const context = await browser.newContext({viewport: {width, height: width === 390 ? 480 : 900}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    page.on('pageerror', e => result.pageErrors.push(String(e)));
    let uploads = 0; const generations = []; let failNext = width === 1280;
    await page.route('**/api/sync/assets*', async route => {
      if (route.request().method() === 'POST') {
        uploads++; assert.equal(route.request().headers()['content-type'], 'video/mp4');
        assert.deepEqual(route.request().postDataBuffer(), clip);
        await route.fulfill({json: {hash}});
      } else await route.fulfill({contentType: 'video/mp4', body: clip});
    });
    await page.route('https://tempfile.aiquickdraw.com/**', r => r.fulfill({contentType: 'video/mp4', body: clip}));
    await page.route('**/api/cinema/images', async r => {generations.push(r.request().postDataJSON());const failed = failNext; failNext = false; await r.fulfill({status: failed ? 422 : 200, json: failed ? {error: 'INVALID_PARAMETERS'} : {tasks: ['qa-task']}});});
    await page.goto('http://127.0.0.1:3341/cinema-video-qa', {waitUntil: 'networkidle'});
    await page.getByRole('button', {name: /^Agregar video/}).click();
    await page.getByRole('dialog').waitFor();
    await page.locator('input[type=file]').setInputFiles({name: 'not-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video')});
    await page.getByRole('alert').filter({hasText: 'Elegí un archivo MP4'}).waitFor(); assert.equal(uploads, 0);
    await page.locator('input[type=file]').setInputFiles({name: 'too-large.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4_000_001)});
    await page.getByRole('alert').filter({hasText: '4 MB'}).waitFor(); assert.equal(uploads, 0);
    await page.locator('input[type=file]').setInputFiles({name: 'reference.mp4', mimeType: 'video/mp4', buffer: clip});
    await page.getByRole('button', {name: 'Usar', exact: true}).click();
    await page.getByLabel('Vista previa de @video1').waitFor();
    assert.equal(uploads, 1); assert.equal(generations.length, 0);
    await page.getByLabel('Prompt del video').fill('Usá el movimiento de @video1. Привет, ñ.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
    const controls = await page.getByRole('button', {name: 'Generar video', exact: true}).boundingBox();
    assert.ok(controls.y + controls.height <= (width === 390 ? 480 : 900) + 1, 'Generate must remain visible');
    await page.screenshot({path: path.join(output, `video-reference-${width}.png`)}); result.screenshots.push(`video-reference-${width}.png`);
    await page.addScriptTag({content: axe});
    const accessibility = await page.evaluate(() => axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}}));
    result.axe.push({width, violations: accessibility.violations.map(v => ({id: v.id, targets: v.nodes.map(n => n.target)}))});
    assert.deepEqual(accessibility.violations, [], 'Axe violations');
    await page.getByRole('button', {name: 'Generar video', exact: true}).click();
    const confirm = page.getByRole('alertdialog'); await confirm.waitFor();
    assert.match(await confirm.innerText(), /Videos de referencia/); assert.equal(generations.length, 0);
    await confirm.getByRole('button', {name: 'Generar video', exact: true}).click();
    if (width === 1280) { await page.getByRole('button', {name: 'Reintentar', exact: true}).click(); result.checks.push('1280px: failed generation retries with the original video reference'); }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('rc-cinema-v1')).jobs.some(j => j.taskId === 'qa-task'));
    assert.deepEqual(generations.at(-1).videoReferences, ['asset:' + hash]); assert.deepEqual(generations[0].references, []);
    await page.reload({waitUntil: 'networkidle'});
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rc-cinema-v1')).jobs[0]);
    assert.deepEqual(stored.videoReferences, ['asset:' + hash]);
    // The gallery is local test data only, seeded in this isolated browser context.
    await page.evaluate(() => {const d=JSON.parse(localStorage.getItem('rc-cinema-v1'));d.jobs=[{...d.jobs[0],id:'gallery-clip',state:'success',urls:['https://tempfile.aiquickdraw.com/qa.mp4']}];localStorage.setItem('rc-cinema-v1',JSON.stringify(d));});
    await page.reload({waitUntil: 'networkidle'});
    await page.getByRole('button', {name: /^Agregar video/}).click();
    await page.getByRole('button', {name: /^Elegir: Usá/}).click();
    await page.getByRole('button', {name: 'Usar', exact: true}).click();
    await page.getByLabel('Vista previa de @video1').waitFor(); assert.equal(uploads, 1);
    await page.getByRole('button', {name: 'Quitar video 1', exact: true}).click();
    assert.equal(await page.getByLabel('Vista previa de @video1').count(), 0);
    // Keyboard opens the picker, Escape closes it. No generation happens here.
    await page.getByRole('button', {name: /^Agregar video/}).focus(); await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state: 'hidden'});
    result.checks.push(`${width}px: invalid/oversize rejected; original MP4 uploaded once; preview/removal; confirmation; payload; saved job survives reload; gallery video; keyboard/Escape; no horizontal overflow; reduced motion; generate visible`);
    await context.close();
  }
  assert.deepEqual(result.pageErrors, []);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  await fs.writeFile('/tmp/ruskicode-video-qa-server.log', logs);
  await browser?.close(); server.kill('SIGTERM');
}
