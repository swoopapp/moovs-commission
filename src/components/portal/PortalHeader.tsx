import { Agency, Agent } from '../../types/commission';
import { Badge } from '../ui/badge';
import moovsLogo from '../../assets/moovs-logo.png';

interface PortalHeaderProps {
  agency: Agency;
  view: 'gm' | 'agent';
  currentAgent?: Agent;
}

export function PortalHeader({ agency, view, currentAgent }: PortalHeaderProps) {
  return (
    <>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{agency.name}</h1>
            <Badge variant="secondary" className="bg-gray-100 text-gray-700">
              {agency.type}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                view === 'gm'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-purple-200 bg-purple-50 text-purple-700'
              }
            >
              {view === 'gm' ? 'GM View' : `Agent: ${currentAgent?.name ?? 'Unknown'}`}
            </Badge>
          </div>
        </div>
      </header>
      <PortalFooter />
    </>
  );
}

function PortalFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-3">
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs text-gray-400">Powered by</span>
        <img src={moovsLogo} alt="Moovs" className="h-4 w-auto" />
      </div>
    </footer>
  );
}
