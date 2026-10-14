import { Navbar } from '@/components/navigation';
import { PhaseHome } from '@/components/phase-home';
export default function Home() { return <><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:p-3 focus:text-black">Saltar al contenido</a><Navbar/><main id="main" className="dot-grid min-h-[calc(100vh-80px)]"><PhaseHome/></main></>; }
