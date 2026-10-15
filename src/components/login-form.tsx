'use client';
import {useState,type FormEvent} from 'react';
import {authClient} from '@/lib/auth/client';
export function LoginForm({setup,unavailable,googleEnabled=false,oauthError=false}:{setup:boolean;unavailable:boolean;googleEnabled?:boolean;oauthError?:boolean}){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState(oauthError?'No se pudo entrar con Google. Elegí la cuenta autorizada del equipo.':'');
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');if(setup&&password!==confirm){setError('Las contraseñas no coinciden.');return;}setBusy(true);
  try{
   if(setup){const response=await fetch('/api/studio/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,code})});const result=await response.json();if(!response.ok){if(result.error==='SETUP_CLOSED')throw Error('La cuenta ya fue creada. Recargá esta página para iniciar sesión.');if(result.error==='RATE_LIMIT')throw Error('Demasiados intentos. Probá más tarde.');throw Error('No se pudo activar la cuenta. Revisá los datos y el código del estudio.');}}
   else{const result=await authClient.signIn.email({email,password,rememberMe:true});if(result.error)throw Error(result.error.status===429?'Demasiados intentos. Esperá un minuto.':'No se pudo ingresar. Revisá tu correo y contraseña.');}
   window.location.assign('/workspace');
  }catch(error){setError(error instanceof Error?error.message:'No se pudo conectar. Intentá nuevamente.');setBusy(false);}
 }
 async function googleLogin(){if(busy)return;setBusy(true);setError('');try{const result=await authClient.signIn.social({provider:'google',callbackURL:'/workspace',errorCallbackURL:'/login?error=google'});if(result.error)throw Error('No se pudo iniciar Google. Intentá nuevamente.');}catch(error){setError(error instanceof Error?error.message:'No se pudo conectar con Google.');setBusy(false);}}
 const field='mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
 return <form onSubmit={submit} className="mt-8 space-y-5">
  {unavailable?<p role="alert" className="rounded-xl border border-border p-4 text-sm text-muted">El acceso se está configurando. Volvé a intentar en unos minutos.</p>:null}
  {googleEnabled?<><button type="button" onClick={googleLogin} disabled={busy||unavailable} className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">Continuar con Google</button><p className="text-center text-xs text-muted">Usen la cuenta de Google compartida autorizada para el estudio.</p></>:null}
  <details open={!googleEnabled}><summary className="cursor-pointer text-sm text-muted">Entrar con correo y contraseña</summary><div className="mt-5 space-y-5">
  <label className="block text-sm">Correo compartido<input className={field} type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label className="block text-sm">{setup?'Elegí una contraseña':'Contraseña'}<input className={field} type="password" name="password" autoComplete={setup?'new-password':'current-password'} required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {setup?<><p className="text-xs leading-5 text-muted">Usen una contraseña de al menos 12 caracteres. Ambos ingresarán con estos mismos datos.</p><label className="block text-sm">Repetí la contraseña<input className={field} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><label className="block text-sm">Código actual del estudio<input className={field} type="password" autoComplete="off" required maxLength={256} value={code} onChange={e=>setCode(e.target.value)}/><span className="mt-2 block text-xs leading-5 text-muted">Es el STUDIO_ACCESS_CODE que guardaste en Vercel. Se usa solo para autorizar esta primera activación.</span></label></>:null}
  <button disabled={busy||unavailable} className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50">{busy?'Un momento…':setup?'Activar cuenta compartida':'Entrar al estudio'}</button>
  </div></details>
  {error?<p role="alert" className="text-sm text-red-300">{error}</p>:null}
  <p className="text-center text-xs leading-5 text-muted">Acceso exclusivo para el equipo de RuskiCode. El registro público está cerrado.</p>
 </form>;
}
