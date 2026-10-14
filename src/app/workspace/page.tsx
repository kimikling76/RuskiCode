import { Sidebar, LanguageSelect, MobileMenu } from '@/components/navigation';
import { PhaseHome } from '@/components/phase-home';
export default function Workspace() { return <div className="flex min-h-screen"><Sidebar/><div className="min-w-0 flex-1 dot-grid"><header className="flex h-20 items-center justify-between border-b border-border px-6"><span className="text-sm text-muted">RuskiCode · A1</span><div className="flex gap-2"><LanguageSelect/><MobileMenu/></div></header><main><PhaseHome workspace/></main></div></div>; }
