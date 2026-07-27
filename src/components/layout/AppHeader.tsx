import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Download, Route } from 'lucide-react';

interface AppHeaderProps {
  onExportClick?: () => void;
}

export function AppHeader({ onExportClick }: AppHeaderProps) {
  const operator = useOperator();
  const isDemo = useIsDemo();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto min-h-16 px-4 py-3 flex items-center justify-between gap-3 sm:px-6">
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
          <span className="hidden text-gray-300 sm:inline">|</span>
          <h1 className="hidden text-base font-semibold text-gray-900 sm:block">Commission Tracking</h1>
          {isDemo && <Badge variant="secondary" className="hidden bg-teal-100 text-teal-800 md:inline-flex">Fake demo data</Badge>}
        </a>

        {/* Right: Route Rates + Export + Operator name */}
        <div className="flex items-center gap-1 sm:gap-3">
          <Button variant="ghost" size="sm" className="gap-2" asChild>
            <a href="#/route-rates" aria-label="Route rates">
              <Route className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Route Rates</span>
            </a>
          </Button>
          {onExportClick && (
            <Button variant="outline" size="sm" className="gap-2" onClick={onExportClick} aria-label="Export report">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Export Report</span>
            </Button>
          )}
          <span className="hidden text-sm text-gray-600 font-medium lg:inline">{operator.displayName}</span>
        </div>
      </div>
    </header>
  );
}
