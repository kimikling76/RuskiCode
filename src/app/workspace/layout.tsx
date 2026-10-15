import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {studioSession} from '@/lib/auth/server';
export default async function PrivateWorkspace({children}:{children:React.ReactNode}){
 if(!await studioSession(await headers()))redirect('/login');
 return children;
}
