'use client';
import {useState} from 'react';
import {authClient} from '@/lib/auth/client';
export function SignOut(){const [busy,setBusy]=useState(false);const [error,setError]=useState(false);return <div><button disabled={busy} onClick={async()=>{setBusy(true);setError(false);try{const result=await authClient.signOut();if(result.error)throw Error();window.location.assign('/login');}catch{setError(true);setBusy(false);}}} className="rounded-xl border border-border px-3 py-2 text-xs text-muted hover:text-white disabled:opacity-50">{busy?'Saliendo…':'Cerrar sesión'}</button>{error?<span role="alert" className="ml-2 text-xs text-red-300">No se pudo cerrar sesión.</span>:null}</div>;}
