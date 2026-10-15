'use client';
import {Children,isValidElement,memo,useState,type ReactNode} from 'react';
import Markdown,{defaultUrlTransform,type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Check,Copy,ExternalLink} from 'lucide-react';
function nodeText(node:ReactNode):string{return Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<{children?:ReactNode}>(child)?nodeText(child.props.children):'').join('');}
function CodeBlock({children}:{children:ReactNode}){const [copied,setCopied]=useState(false);const [error,setError]=useState(false);async function copy(){try{await navigator.clipboard.writeText(nodeText(children).replace(/\n$/,''));setCopied(true);setError(false);setTimeout(()=>setCopied(false),1600);}catch{setError(true);}}return <div className="chat-code"><div className="chat-code-toolbar"><span>Código</span><button type="button" onClick={copy} aria-label="Copiar código">{copied?<Check size={14}/>:<Copy size={14}/>}<span>{copied?'Copiado':'Copiar'}</span></button></div><pre tabIndex={0} aria-label="Bloque de código">{children}</pre>{error?<span className="chat-copy-error" role="status">Seleccioná el código para copiarlo.</span>:null}</div>;}
const components:Components={
 pre:({children})=><CodeBlock>{children}</CodeBlock>,
 table:({children})=><div className="chat-table" tabIndex={0} role="region" aria-label="Tabla de la respuesta"><table>{children}</table></div>,
 a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
 // The text Chat has no attachment transport. Images remain explicit links, never tracking pixels or invented generated media.
 img:({src,alt})=>typeof src==='string'&&src?<a href={src} target="_blank" rel="noopener noreferrer" className="chat-image-link"><ExternalLink size={14}/>Abrir imagen: {alt||'enlace de la respuesta'}</a>:null,
 h1:({children})=><h2 className="chat-markdown-h1">{children}</h2>,
};
export const MessageMarkdown=memo(function MessageMarkdown({content}:{content:string}){return <div className="chat-markdown"><Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml urlTransform={defaultUrlTransform}>{content}</Markdown></div>;});
