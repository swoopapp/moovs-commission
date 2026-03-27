import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgencies, updateAgency } from '../../services/agencyService';
import { fetchMoovsCompanies, MoovsCompany } from '../../services/companyLookupService';
import { Agency } from '../../types/commission';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Building2, ArrowLeft, Link2, Check, Search, X } from 'lucide-react';
import { toast } from 'sonner';

export function AgencyMatchingView() {
  const operator = useOperator();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [companies, setCompanies] = useState<MoovsCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencySearch, setAgencySearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [showMatched, setShowMatched] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [agencyList, companyList] = await Promise.all([
        fetchAgencies(operator.operatorId),
        operator.moovsOperatorId
          ? fetchMoovsCompanies(operator.moovsOperatorId)
          : Promise.resolve([]),
      ]);
      setAgencies(agencyList);
      setCompanies(companyList);
    } catch (err) {
      console.error('Failed to load matching data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [operator.operatorId, operator.moovsOperatorId]);

  useEffect(() => { loadData(); }, [loadData]);

  const unmatchedAgencies = useMemo(() => {
    let list = agencies.filter((a) => !a.moovs_company_id);
    if (agencySearch.trim()) {
      const q = agencySearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.contact_email && a.contact_email.toLowerCase().includes(q)) ||
          (a.city && a.city.toLowerCase().includes(q))
      );
    }
    return list;
  }, [agencies, agencySearch]);

  const matchedAgencies = useMemo(() => {
    return agencies.filter((a) => a.moovs_company_id);
  }, [agencies]);

  const filteredCompanies = useMemo(() => {
    // Exclude companies already linked to an agency
    const linkedIds = new Set(agencies.filter((a) => a.moovs_company_id).map((a) => a.moovs_company_id));
    let list = companies.filter((c) => !linkedIds.has(c.company_id));
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }
    return list;
  }, [companies, agencies, companySearch]);

  async function handleMatch(agencyId: string, companyId: string) {
    try {
      const updated = await updateAgency(agencyId, { moovs_company_id: companyId });
      setAgencies((prev) => prev.map((a) => (a.id === agencyId ? updated : a)));
      setSelectedAgencyId(null);
      setCompanySearch('');
      const company = companies.find((c) => c.company_id === companyId);
      toast.success(`Linked to ${company?.name || 'company'}`);
    } catch (err) {
      console.error('Failed to match:', err);
      toast.error('Failed to link company');
    }
  }

  async function handleUnmatch(agencyId: string) {
    try {
      const updated = await updateAgency(agencyId, { moovs_company_id: null });
      setAgencies((prev) => prev.map((a) => (a.id === agencyId ? updated : a)));
      toast.success('Company unlinked');
    } catch (err) {
      console.error('Failed to unmatch:', err);
      toast.error('Failed to unlink');
    }
  }

  const selectedAgency = selectedAgencyId
    ? agencies.find((a) => a.id === selectedAgencyId) || null
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { window.location.hash = '#/'; }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Agency Matching</h2>
            <p className="text-sm text-gray-500">
              Link agencies to Moovs companies so trips auto-match
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
            {unmatchedAgencies.length} unmatched
          </span>
          <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-medium">
            {matchedAgencies.length} matched
          </span>
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
            {companies.length} companies
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Agencies */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Agencies</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={showMatched ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => setShowMatched(false)}
                >
                  Unmatched ({unmatchedAgencies.length})
                </Button>
                <Button
                  variant={showMatched ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowMatched(true)}
                >
                  Matched ({matchedAgencies.length})
                </Button>
              </div>
            </div>
            {!showMatched && (
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search agencies..."
                  value={agencySearch}
                  onChange={(e) => setAgencySearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto divide-y">
              {showMatched ? (
                matchedAgencies.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-500">No matched agencies yet</p>
                ) : (
                  matchedAgencies.map((a) => {
                    const company = companies.find((c) => c.company_id === a.moovs_company_id);
                    return (
                      <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{a.name}</p>
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            {company ? company.name : a.moovs_company_id}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleUnmatch(a.id)} className="text-gray-400 hover:text-red-600">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )
              ) : (
                unmatchedAgencies.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-500">
                    {agencySearch ? 'No agencies match your search' : 'All agencies are matched!'}
                  </p>
                ) : (
                  unmatchedAgencies.map((a) => (
                    <button
                      key={a.id}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selectedAgencyId === a.id
                          ? 'bg-blue-50 border-l-2 border-blue-500'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setSelectedAgencyId(selectedAgencyId === a.id ? null : a.id);
                        setCompanySearch('');
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-500">
                        {[a.city, a.state, a.market_segment].filter(Boolean).join(' · ') || 'No location info'}
                      </p>
                      {a.contact_email && (
                        <p className="text-xs text-gray-400">{a.contact_email}</p>
                      )}
                    </button>
                  ))
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Companies to match */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Moovs Companies
            </CardTitle>
            {selectedAgency ? (
              <div className="mt-2 space-y-2">
                <div className="bg-blue-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-blue-800">
                    Matching: <strong>{selectedAgency.name}</strong>
                  </p>
                  <p className="text-xs text-blue-600">Select a company below to link</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search companies..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-1">
                Select an unmatched agency on the left, then pick a company here to link them.
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto divide-y">
              {!selectedAgency ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  Select an agency to see available companies
                </p>
              ) : filteredCompanies.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  {companySearch ? 'No matching companies' : 'No available companies'}
                </p>
              ) : (
                filteredCompanies.map((c) => (
                  <button
                    key={c.company_id}
                    className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors group"
                    onClick={() => handleMatch(selectedAgencyId!, c.company_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">
                          {[c.email, c.phone_number].filter(Boolean).join(' · ') || 'No contact info'}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
