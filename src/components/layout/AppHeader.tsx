import { useOperator } from '../../contexts/OperatorContext';
import { Button } from '../ui/button';
import { Download, Route } from 'lucide-react';

interface AppHeaderProps {
  onExportClick?: () => void;
}

export function AppHeader({ onExportClick }: AppHeaderProps) {
  const operator = useOperator();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <a href="#/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
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
        </a>

        {/* Right: Route Rates + Export + Operator name */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="gap-2" asChild>
            <a href="#/route-rates">
              <Route className="h-4 w-4" />
              Route Rates
            </a>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={onExportClick}>
            <Download className="h-4 w-4" />
            Export Report
          </Button>
          <span className="text-sm text-gray-600 font-medium">{operator.displayName}</span>
        </div>
      </div>
    </header>
  );
}
