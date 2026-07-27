import { useState, useEffect } from 'react';
import { PortalData, fetchPortalData } from '../../services/portalService';
import { PortalHeader } from './PortalHeader';
import { PortalKPIs } from './PortalKPIs';
import { PortalReservations } from './PortalReservations';
import { PortalStatements } from './PortalStatements';
import moovsLogo from '../../assets/moovs-logo.png';
import { PoweredByMoovs } from '../layout/PoweredByMoovs';
import { Button } from '../ui/button';

interface PortalViewProps {
  token: string;
}

export function PortalView({ token }: PortalViewProps) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not-found' | 'load' | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetchPortalData(token, controller.signal)
      .then((result) => {
        if (!result) {
          setError('not-found');
        } else {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('load');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, requestNumber]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3" role="status" aria-live="polite">
          <div
            className="h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    const notFound = error === 'not-found';
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 pb-16">
        <div className="text-center space-y-4 max-w-sm">
          <img src={typeof moovsLogo === 'string' ? moovsLogo : moovsLogo.src} alt="Moovs" className="h-10 w-auto mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900">
            {notFound ? 'Link Not Found' : 'Portal Unavailable'}
          </h1>
          <p className="text-gray-500 text-sm">
            {notFound
              ? 'This portal link is invalid. Please contact your operator for an updated link.'
              : 'We could not load the portal right now. Please try again.'}
          </p>
          {!notFound && (
            <Button variant="outline" onClick={() => setRequestNumber((value) => value + 1)}>
              Try Again
            </Button>
          )}
        </div>
        <PoweredByMoovs />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <PortalHeader agency={data.agency} view={data.view} currentAgent={data.currentAgent} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <PortalKPIs reservations={data.reservations} attributions={data.attributions} priceMode={data.agency.price_mode} />
        <PortalReservations
          reservations={data.reservations}
          attributions={data.attributions}
          agents={data.agents}
          view={data.view}
          priceMode={data.agency.price_mode}
        />
        <PortalStatements
          reservations={data.reservations}
          attributions={data.attributions}
          payouts={data.payouts}
          outstandingBalance={data.outstandingBalance}
          agencyName={data.agency.name}
          paymentTerms={data.agency.payment_terms}
          priceMode={data.agency.price_mode}
        />
      </main>
    </div>
  );
}
