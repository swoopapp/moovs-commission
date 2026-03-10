import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Lock, Eye, EyeOff } from 'lucide-react';
import moovsLogo from '../../assets/moovs-logo.png';

const ADMIN_PASSWORD = 'TheMoovsApp3!0';
const ADMIN_AUTH_KEY = 'moovs_admin_session';

export function isAdminAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAdminAuthenticated(): void {
  sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
}

interface AdminLoginPageProps {
  onAuthenticated: () => void;
}

export function AdminLoginPage({ onAuthenticated }: AdminLoginPageProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAdminAuthenticated();
      onAuthenticated();
    } else {
      setError('Invalid admin password');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <img src={moovsLogo} alt="Moovs" className="h-10 w-auto" />
          <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Admin password"
              className={`pl-9 pr-10 h-11 ${error ? 'border-red-500' : ''}`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full h-11" disabled={!password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
