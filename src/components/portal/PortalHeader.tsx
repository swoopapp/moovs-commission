import { Agency, Agent } from '../../types/commission';
import { MoovsLogo, PoweredByMoovs } from '../layout/PoweredByMoovs';

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <MoovsLogo className="h-6 w-auto" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Moovs Commissions</h1>
            <span className="hidden sm:inline text-gray-300" aria-hidden="true">|</span>
            <span className="basis-full text-base text-gray-600 sm:basis-auto sm:text-lg">Agency Portal</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <span>{agency.name}</span>
            <span className="text-gray-300" aria-hidden="true">|</span>
            <span>{agency.type}</span>
            <span className="text-gray-300" aria-hidden="true">|</span>
            <span className="basis-full sm:basis-auto">Logged in as: {roleDescription}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">This link is shareable with your team</p>
        </div>
      </header>
      <PoweredByMoovs />
    </>
  );
}
