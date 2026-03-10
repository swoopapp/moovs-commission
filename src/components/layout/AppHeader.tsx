import { useOperator } from '../../contexts/OperatorContext';
import { Button } from '../ui/button';
import { RefreshCw } from 'lucide-react';

interface AppHeaderProps {
  onSyncClick?: () => void;
}

export function AppHeader({ onSyncClick }: AppHeaderProps) {
  const operator = useOperator();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          {operator.logoUrl ? (
            <img
              src={operator.logoUrl}
              alt={operator.displayName}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-gray-900">Moovs</span>
          )}
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-semibold text-gray-900">Commission Tracking</h1>
        </div>

        {/* Right: Sync button + Operator name */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" className="gap-2" onClick={onSyncClick}>
            <RefreshCw className="h-4 w-4" />
            Sync Trips
          </Button>
          <span className="text-sm text-gray-600 font-medium">{operator.displayName}</span>
        </div>
      </div>
    </header>
  );
}
