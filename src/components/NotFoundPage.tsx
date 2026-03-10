// src/components/NotFoundPage.tsx
import { useState, useEffect } from 'react';
import { fetchAllOperators } from '../services/commissionOperatorService';
import { CommissionOperator } from '../types/commissionOperator';
import moovsLogo from '../assets/moovs-logo.png';

export function NotFoundPage() {
  const [operators, setOperators] = useState<CommissionOperator[]>([]);

  useEffect(() => {
    fetchAllOperators()
      .then(setOperators)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <img
          src={moovsLogo}
          alt="Moovs"
          className="h-12 w-auto mx-auto"
        />
        <h1 className="text-2xl font-semibold text-gray-900">
          Commission Tracking
        </h1>
        <p className="text-gray-500">
          Select your operator to access your commission portal.
        </p>

        {operators.length > 0 && (
          <div className="mt-4 space-y-2">
            {operators.map(op => (
              <a
                key={op.id}
                href={`/${op.slug}`}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all text-left"
              >
                {op.logo_url ? (
                  <img src={op.logo_url} alt="" className="h-8 w-auto shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-sm font-medium text-gray-500 shrink-0">
                    {(op.display_name || op.slug)[0]?.toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-gray-900">
                  {op.display_name || op.slug}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-gray-400">
          Powered by Moovs
        </p>
      </div>
    </div>
  );
}
