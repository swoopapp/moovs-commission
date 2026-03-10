// src/components/auth/LoginPage.tsx
import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useOperator } from '../../contexts/OperatorContext';
import { authenticateWithPassword } from '../../services/authService';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface LoginPageProps {
  onAuthenticated: () => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const operator = useOperator();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      const success = authenticateWithPassword(operator.slug, password, operator.authPassword);
      if (success) {
        onAuthenticated();
      } else {
        setError('Invalid password');
        setPassword('');
      }
      setIsLoading(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
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

        <div className="space-y-4">
          {/* SSO Button (if configured) */}
          {operator.ssoProvider === 'microsoft' && (
            <>
              <Button variant="outline" className="w-full h-11 gap-3 text-sm font-medium" disabled>
                <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Sign in with Microsoft
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>
            </>
          )}

          {/* Password form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password"
                className={`pl-9 pr-10 h-11 ${error ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full h-11" disabled={!password || isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-gray-400">
          Powered by Moovs
        </p>
      </div>
    </div>
  );
}
