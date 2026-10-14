import {Sidebar,LanguageSelect,MobileMenu} from '@/components/navigation';
import {BookEditor} from '@/components/book-editor';
import {Suspense} from 'react';
export default function EditorPage(){return <div className="flex min-h-screen"><Sidebar/><div className="min-w-0 flex-1"><header className="flex h-20 items-center justify-between border-b border-border px-6"><span className="text-sm text-muted">RuskiCode · EDITOR</span><div className="flex gap-2"><LanguageSelect/><MobileMenu/></div></header><Suspense><BookEditor/></Suspense></div></div>;}
