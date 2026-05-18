import { signIn } from '@/lib/auth';
import Image from 'next/image';
import moovsLogo from '@/assets/moovs-logo.png';

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl || '/admin';

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <Image src={moovsLogo} alt="Moovs" className="h-10 w-auto" priority />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">Commissions Admin</h1>
            <p className="mt-2 text-sm text-gray-500">Sign in with a Moovs Google account.</p>
          </div>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="w-full h-11 rounded-md bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            Continue with Google
          </button>
        </form>
        <p className="text-center text-xs text-gray-400">
          Access is limited to @moovsapp.com and @swoopapp.com.
        </p>
      </div>
    </main>
  );
}
