import {googleConfig} from '@/lib/auth/google';
import Link from 'next/link';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {studioSession} from '@/lib/auth/server';
import {database} from '@/lib/pipeline/database';
import {LoginForm} from '@/components/login-form';
import {Wordmark} from '@/components/studio/brand';
export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}){
 const oauthError=Boolean((await searchParams).error);
 if(await studioSession(await headers()))redirect('/workspace');
 let setup=false;let unavailable=!process.env.BETTER_AUTH_SECRET;
 if(!unavailable)try{setup=await database().user.count()===0;}catch{unavailable=true;}
 return <main className="grid min-h-screen place-items-center px-5 py-12 dot-grid"><section className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 shadow-2xl sm:p-9"><Link href="/" aria-label="Russian Code, inicio" className="inline-flex"><Wordmark/></Link><p className="mt-9 text-xs tracking-[.22em] text-accent">ESTUDIO PRIVADO</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{setup?'Su espacio compartido.':'Volvé a crear.'}</h1><p className="mt-3 text-sm leading-6 text-muted">{setup?'Activá la única cuenta del estudio. Tu compañero y vos podrán usarla desde sus computadoras.':'Ingresá con la cuenta del equipo.'}</p><LoginForm oauthError={oauthError} setup={setup} unavailable={unavailable} googleEnabled={Boolean(googleConfig())}/></section></main>;
}
