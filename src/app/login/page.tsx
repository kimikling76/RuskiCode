import Link from 'next/link';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {googleConfig} from '@/lib/auth/google';
import {studioSession} from '@/lib/auth/server';
import {database} from '@/lib/pipeline/database';
import {LoginForm} from '@/components/site/login-form';
import {BrandMark, Wordmark} from '@/components/studio/brand';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Entrar · Russian Code'};

export default async function LoginPage({searchParams}: {searchParams: Promise<{error?: string}>}) {
  const oauthError = Boolean((await searchParams).error);
  if (await studioSession(await headers())) redirect('/workspace');
  let setup = false;
  let unavailable = !process.env.BETTER_AUTH_SECRET;
  if (!unavailable) {
    try { setup = await database().user.count() === 0; } catch { unavailable = true; }
  }
  return (
    <div className="rc-site rc-login">
      <BrandMark size={560} className="rc-login-glyph" />
      <main className="rc-login-card">
        <Link href="/" aria-label="Russian Code, volver a la portada" className="rc-site-brand"><Wordmark /></Link>
        <h1>{setup ? 'Activá la cuenta del estudio' : 'Entrar al estudio'}</h1>
        <p className="rc-login-lead">
          {setup ? 'Es una sola cuenta compartida. Tu compañero y vos van a entrar con estos mismos datos.' : 'Con la cuenta compartida del equipo.'}
        </p>
        <LoginForm oauthError={oauthError} setup={setup} unavailable={unavailable} googleEnabled={Boolean(googleConfig())} />
      </main>
      <p className="rc-login-foot"><Link href="/">Volver a la portada</Link></p>
    </div>
  );
}
