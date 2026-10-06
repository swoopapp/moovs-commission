import * as Dialog from '@radix-ui/react-dialog';
import { useIsDemo, useOperator } from '../../contexts/OperatorContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Download, Menu } from 'lucide-react';

interface AppHeaderProps {
  onExportClick?: () => void;
}

export function AppHeader({ onExportClick }: AppHeaderProps) {
  const operator = useOperator();
  const isDemo = useIsDemo();

  return (
    <header className="sticky top-0 z-30 flex h-[73px] items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
        <a href="#/" className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Moovs Commissions overview">
          <img src="/moovs-wordmark-black.svg" alt="Moovs" width={123} height={29} className="h-6 w-auto sm:h-7" />
        </a>
        <span className="hidden border-l border-gray-200 pl-5 text-base font-semibold text-gray-900 sm:block">Commissions</span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {isDemo && <Badge variant="secondary" className="hidden bg-blue-50 text-blue-700 md:inline-flex">Demo workspace</Badge>}
        {onExportClick && (
          <Button variant="outline" size="sm" className="gap-2" onClick={onExportClick} aria-label="Export report">
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Export report</span>
          </Button>
        )}
        <span className="hidden max-w-[240px] truncate border-l border-gray-200 pl-4 text-sm font-medium text-gray-600 xl:inline" title={operator.displayName}>{operator.displayName}</span>
      </div>
    </header>
  );
}
