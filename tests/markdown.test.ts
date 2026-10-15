import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageMarkdown} from '../src/components/studio/message-markdown';
test('Chat renders Markdown structures and Cyrillic instead of literal formatting',()=>{const html=renderToStaticMarkup(createElement(MessageMarkdown,{content:'## Привет\n\nTexto **importante** y `код`.\n\n- uno\n- dos\n\n> Cita\n\n| A | Б |\n|---|---|\n| 1 | 2 |\n\n```js\nconst привет = "sí";\n```'}));assert.match(html,/<h2>Привет/);assert.match(html,/<strong>importante/);assert.match(html,/<ul>/);assert.match(html,/<blockquote>/);assert.match(html,/<table>/);assert.match(html,/Copiar código/);assert.doesNotMatch(html,/## Привет|\*\*importante\*\*/);});
test('Chat Markdown rejects executable HTML, unsafe links and automatic remote images',()=>{const html=renderToStaticMarkup(createElement(MessageMarkdown,{content:'<script>alert(1)</script>\n\n[mal](javascript:alert%281%29)\n\n![x](https://example.com/tracker.png)\n\n<img src=x onerror=alert(1)>'}));assert.doesNotMatch(html,/<script|<img|onerror=|href="javascript:/);assert.match(html,/Abrir imagen/);assert.match(html,/rel="noopener noreferrer"/);});
