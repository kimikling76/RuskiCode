'use client';
import {Children, isValidElement, memo, useState, type ReactNode} from 'react';
import Markdown, {defaultUrlTransform, type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Check, Copy, ExternalLink} from 'lucide-react';

function nodeText(node: ReactNode): string {
  return Children.toArray(node).map(child =>
    typeof child === 'string' || typeof child === 'number' ? String(child)
      : isValidElement<{children?: ReactNode}>(child) ? nodeText(child.props.children) : ''
  ).join('');
}

function codeLanguage(node: ReactNode) {
  const child = Children.toArray(node)[0];
  if (!isValidElement<{className?: string}>(child)) return '';
  return /language-([\w+#-]+)/.exec(child.props.className || '')?.[1] || '';
}

function CodeBlock({children}: {children: ReactNode}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const language = codeLanguage(children);
  // Prose and prompts wrap so they read without sliding sideways; real code keeps its lines.
  const wrap = !language || /^(text|txt|plain|plaintext|prompt|markdown|md)$/i.test(language);

  async function copy() {
    try {
      await navigator.clipboard.writeText(nodeText(children).replace(/\n$/, ''));
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className={'rc-code' + (wrap ? ' rc-code--wrap' : '')}>
      <div className="rc-code-bar">
        <span>{language || 'código'}</span>
        <button type="button" className="rc-code-copy" onClick={copy} aria-label={copied ? 'Código copiado' : 'Copiar código'}>
          {copied ? <Check /> : <Copy />}
          <span>{copied ? 'Copiado' : 'Copiar'}</span>
        </button>
      </div>
      <pre tabIndex={0} aria-label={language ? 'Código ' + language : 'Bloque de código'}>{children}</pre>
      {failed ? <p className="rc-code-note" role="status">No se pudo copiar. Seleccioná el código a mano.</p> : null}
    </div>
  );
}

const components: Components = {
  pre: ({children}) => <CodeBlock>{children}</CodeBlock>,
  table: ({children}) => (
    <div className="rc-md-table" tabIndex={0} role="region" aria-label="Tabla">
      <table>{children}</table>
    </div>
  ),
  a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  // The Chat has no attachment transport: images stay explicit links, never tracking pixels.
  img: ({src, alt}) => typeof src === 'string' && src ? (
    <a href={src} target="_blank" rel="noopener noreferrer" className="rc-md-image-link">
      <ExternalLink aria-hidden="true" />
      Abrir imagen: {alt || 'enlace de la respuesta'}
    </a>
  ) : null,
  // The chat title is the page's only h1. Sizes stay small in chat.css: no headlines inside a conversation.
  h1: ({children}) => <h2>{children}</h2>,
};

export const MessageMarkdown = memo(function MessageMarkdown({content}: {content: string}) {
  return (
    <div className="rc-md">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml urlTransform={defaultUrlTransform}>
        {content}
      </Markdown>
    </div>
  );
});
