import { Agency, Agent } from '../../types/commission';
import moovsLogo from '../../assets/moovs-logo.png';

interface PortalHeaderProps {
  agency: Agency;
  view: 'gm' | 'agent';
  currentAgent?: Agent;
}

export function PortalHeader({ agency, view, currentAgent }: PortalHeaderProps) {
  const roleDescription = view === 'gm' ? 'General Manager' : (currentAgent?.name ?? 'Unknown');

  return (
    <>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <img src={moovsLogo} alt="Moovs" className="h-6 w-auto" />
            <span className="text-xl font-semibold text-gray-900">Moovs Commissions</span>
            <span className="text-gray-300">|</span>
            <span className="text-lg text-gray-600">Agency Portal</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <span>{agency.name}</span>
            <span className="text-gray-300">|</span>
            <span>{agency.type}</span>
            <span className="text-gray-300">|</span>
            <span>Logged in as: {roleDescription}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">This link is shareable with your team</p>
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
