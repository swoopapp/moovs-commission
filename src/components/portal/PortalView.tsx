import { PortalDataHealth } from './PortalDataHealth';
import { CommissionDetail } from '../commissions/CommissionDetail';
import { SettlementRecords } from '../commissions/SettlementRecords';
import type {
  Reservation,
  ReservationAttribution,
} from '../../types/commission';
import {
  getDemoAgencyByPortalToken,
  getDemoAgentByPortalToken,
} from '../../demoData';
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
  const [detail, setDetail] = useState<{
    reservation: Reservation;
    attribution: ReservationAttribution;
  } | null>(null);
  const [questionKey, setQuestionKey] = useState(() => crypto.randomUUID());
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
          <img
            src={typeof moovsLogo === 'string' ? moovsLogo : moovsLogo.src}
            alt="Moovs"
            className="h-10 w-auto mx-auto"
          />
          <h1 className="text-xl font-semibold text-gray-900">
            {notFound ? 'Link Not Found' : 'Portal Unavailable'}
          </h1>
          <p className="text-gray-500 text-sm">
            {notFound
              ? 'This portal link is invalid. Please contact your operator for an updated link.'
              : 'We could not load the portal right now. Please try again.'}
          </p>
          {!notFound && (
            <Button
              variant="outline"
              onClick={() => setRequestNumber((value) => value + 1)}
            >
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
      <PortalHeader
        agency={data.agency}
        view={data.view}
        currentAgent={data.currentAgent}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <PortalDataHealth
          reservations={data.reservations}
          onRefresh={() => setRequestNumber((n) => n + 1)}
          synthetic={Boolean(
            getDemoAgencyByPortalToken(token) ||
              getDemoAgentByPortalToken(token),
          )}
        />
        <PortalKPIs
          reservations={data.reservations}
          attributions={data.attributions}
          priceMode={data.agency.price_mode}
        />
        <PortalReservations
          onInspect={(reservation, attribution) => {
            setDetail({ reservation, attribution });
            setQuestionKey(crypto.randomUUID());
          }}
          commissionStates={data.commissionStates}
          reservations={data.reservations}
          attributions={data.attributions}
          agents={data.agents}
          view={data.view}
          priceMode={data.agency.price_mode}
        />
        <section className="rounded-lg border bg-white p-4 text-sm space-y-2">
          <h2 className="font-semibold">Commission availability</h2>
          <p>
            Calculated earnings are not automatically payable. Approval and
            settlement are separate from the customer’s booking/payment.
          </p>
          {data.workflowAvailable === false ? (
            <p className="text-amber-800">
              Review status is temporarily unavailable. Amounts below are
              estimates, not approved balances.
            </p>
          ) : (
            <div className="flex flex-wrap gap-5">
              {[
                'projected',
                'needs-review',
                'approved',
                'held',
                'rejected',
                'needs-recheck',
                'prepared',
                'paid',
                'unavailable',
              ].map((state) => {
                const attrs = data.attributions.filter((a) => {
                  const r = data.reservations.find(
                    (r) => r.id === a.reservation_id,
                  );
                  return (
                    r &&
                    (data.commissionStates?.[r.moovs_trip_id]?.state ??
                      'projected') === state
                  );
                });
                return (
                  <p key={state}>
                    <span className="text-gray-500">
                      {state.replace(/-/g, ' ')}:
                    </span>{' '}
                    $
                    {attrs
                      .reduce((n, a) => n + Number(a.commission_amount), 0)
                      .toFixed(2)}
                  </p>
                );
              })}
            </div>
          )}
        </section>
        <SettlementRecords payouts={data.payouts} />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your commission questions</h2>
          {!data.questions?.length && (
            <p className="text-sm text-gray-500">
              Open a booking to question its commission. Questions stay in this
              portal; no email is sent.
            </p>
          )}
          {data.questions?.map((q) => (
            <div key={q.id} className="rounded-lg border bg-white p-4 text-sm">
              <p className="font-medium">
                {q.status} · {new Date(q.created_at).toLocaleDateString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{q.message}</p>
              {q.resolution && (
                <p className="mt-2 text-gray-600">
                  Operator response: {q.resolution}
                </p>
              )}
            </div>
          ))}
        </section>
        <PortalStatements
          reservations={data.reservations}
          attributions={data.attributions}
          payouts={data.payouts}
          outstandingBalance={data.outstandingBalance}
          agencyName={data.agency.name}
          paymentTerms={data.agency.payment_terms}
          priceMode={data.agency.price_mode}
        />
        {detail && (
          <CommissionDetail
            {...detail}
            agency={data.agency}
            agents={data.currentAgent ? [data.currentAgent] : data.agents}
            stateOverride={
              data.commissionStates?.[detail.reservation.moovs_trip_id]
                ?.state ?? 'projected'
            }
            expectedDate={
              data.commissionStates?.[detail.reservation.moovs_trip_id]
                ?.expected_payment_date
            }
            readOnly={
              Boolean(
                getDemoAgencyByPortalToken(token) ||
                  getDemoAgentByPortalToken(token),
              ) || data.workflowAvailable === false
            }
            onClose={() => setDetail(null)}
            onQuestion={async (message) => {
              const res = await fetch(
                `/api/partner-question/${encodeURIComponent(token)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message,
                    moovs_trip_id: detail.reservation.moovs_trip_id,
                    request_key: questionKey,
                  }),
                },
              );
              if (!res.ok) {
                const result = await res.json().catch(() => ({}));
                throw new Error(
                  result.error || 'Question could not be submitted',
                );
              }
              setRequestNumber((n) => n + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}
