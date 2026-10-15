import {SignOut} from '@/components/sign-out';
import { Sidebar, LanguageSelect, MobileMenu } from '@/components/navigation';
import { Workspace } from '@/components/workspace';
export default function WorkspacePage(){return <div className="flex min-h-screen"><Sidebar/><div className="min-w-0 flex-1 dot-grid"><header className="flex h-20 items-center justify-between border-b border-border px-6"><span className="text-sm text-muted">RuskiCode · A1</span><div className="flex gap-2"><SignOut/><LanguageSelect/><MobileMenu/></div></header><main><Workspace/></main></div></div>;}
