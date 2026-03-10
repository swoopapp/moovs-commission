import { useState, useEffect } from 'react';
import { PortalData, fetchPortalData } from '../../services/portalService';
import { PortalHeader } from './PortalHeader';
import { PortalKPIs } from './PortalKPIs';
import { PortalReservations } from './PortalReservations';
import { PortalStatements } from './PortalStatements';
import moovsLogo from '../../assets/moovs-logo.png';

interface PortalViewProps {
  token: string;
}

export function PortalView({ token }: PortalViewProps) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchPortalData(token)
      .then((result) => {
        if (!result) {
          setError(true);
        } else {
          setData(result);
        }
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <img src={moovsLogo} alt="Moovs" className="h-10 w-auto mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900">Link Not Found</h1>
          <p className="text-gray-500 text-sm">
            This portal link is invalid or has expired. Please contact your operator for an updated link.
          </p>
        </div>
        <div className="fixed bottom-4 left-0 right-0 text-center">
          <p className="text-xs text-gray-400">Powered by Moovs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <PortalHeader agency={data.agency} view={data.view} currentAgent={data.currentAgent} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <PortalKPIs reservations={data.reservations} attributions={data.attributions} />
        <PortalReservations
          reservations={data.reservations}
          attributions={data.attributions}
          agents={data.agents}
          view={data.view}
        />
        <PortalStatements
          reservations={data.reservations}
          attributions={data.attributions}
          payouts={data.payouts}
          agencyName={data.agency.name}
          paymentTerms={data.agency.payment_terms}
        />
      </main>
    </div>
  );
}
