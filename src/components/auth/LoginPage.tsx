// src/components/auth/LoginPage.tsx
import { Button } from '../ui/button';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useOperator } from '../../contexts/OperatorContext';
import { Link2, ShieldCheck } from 'lucide-react';
import { PoweredByMoovs } from '../layout/PoweredByMoovs';

interface LoginPageProps {
  error?: string | null;
}

export function LoginPage({ error }: LoginPageProps) {
  const operator = useOperator();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 pb-16">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          {operator.logoUrl ? (
            <ImageWithFallback
              src={operator.logoUrl}
              alt={operator.displayName}
              className="h-20 w-auto"
            />
          ) : (
            <h2 className="text-3xl font-bold text-gray-900">{operator.displayName}</h2>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Commission Tracking
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Agent Commission Portal
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600" />
          <div>
            <h2 className="font-medium text-gray-900">Secure link required</h2>
            <p className="mt-1 text-sm text-gray-500">
              Password login is disabled. Use the secure commission portal link sent by Moovs.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="button" variant="outline" className="w-full h-11" disabled>
            <Link2 className="mr-2 h-4 w-4" />
            Waiting for secure link
          </Button>
        </div>
      </div>

      <PoweredByMoovs />
    </div>
  );
}
