import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { fetchAgenciesPaginated, updateAgency, fetchLinkedCompanyIds } from '../../services/agencyService';
import { fetchMoovsCompanies, MoovsCompany } from '../../services/companyLookupService';
import { Agency } from '../../types/commission';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Building2, ArrowLeft, Check, Search, X, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

export function AgencyMatchingView() {
  const operator = useOperator();
  const [companies, setCompanies] = useState<MoovsCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [showMatched, setShowMatched] = useState(false);

  // Paginated agency state
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyTotal, setAgencyTotal] = useState(0);
  const [agencyPage, setAgencyPage] = useState(0);
  const [agencySearch, setAgencySearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Counts for badges
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  // Set of company IDs already linked to an agency
  const [linkedCompanyIds, setLinkedCompanyIds] = useState<Set<string>>(new Set());

  // Load companies once
  useEffect(() => {
    if (!operator.moovsOperatorId) return;
    fetchMoovsCompanies(operator.moovsOperatorId)
      .then(setCompanies)
      .catch((err) => console.error('Failed to fetch companies:', err));
  }, [operator.moovsOperatorId]);

  // Load counts + linked company IDs
  const loadCounts = useCallback(async () => {
    const [unmatched, matched, linked] = await Promise.all([
      fetchAgenciesPaginated(operator.operatorId, { limit: 1, unmatchedOnly: true }),
      fetchAgenciesPaginated(operator.operatorId, { limit: 1, matchedOnly: true }),
      fetchLinkedCompanyIds(operator.operatorId),
    ]);
    setUnmatchedCount(unmatched.total);
    setMatchedCount(matched.total);
    setLinkedCompanyIds(linked);
  }, [operator.operatorId]);

  // Load agencies page
  const loadAgencies = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchAgenciesPaginated(operator.operatorId, {
        offset: agencyPage * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: agencySearch || undefined,
        unmatchedOnly: !showMatched,
        matchedOnly: showMatched,
      });
      setAgencies(result.agencies);
      setAgencyTotal(result.total);
    } catch (err) {
      console.error('Failed to load agencies:', err);
      toast.error('Failed to load agencies');
    } finally {
      setLoading(false);
    }
  }, [operator.operatorId, agencyPage, agencySearch, showMatched]);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setAgencySearch(searchInput);
      setAgencyPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page when switching tabs
  function handleTabSwitch(matched: boolean) {
    setShowMatched(matched);
    setAgencyPage(0);
    setSelectedAgencyId(null);
    setSearchInput('');
    setAgencySearch('');
  }

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return [];
    const q = companySearch.toLowerCase();
    return companies
      .filter((c) => !linkedCompanyIds.has(c.company_id))
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      });
  }, [companies, companySearch, linkedCompanyIds]);

  const selectedAgency = selectedAgencyId
    ? agencies.find((a) => a.id === selectedAgencyId) || null
    : null;

  async function handleMatch(agencyId: string, companyId: string) {
    try {
      await updateAgency(agencyId, { moovs_company_id: companyId });
      setSelectedAgencyId(null);
      setCompanySearch('');
      const company = companies.find((c) => c.company_id === companyId);
      toast.success(`Linked to ${company?.name || 'company'}`);
      loadAgencies();
      loadCounts();
    } catch (err) {
      console.error('Failed to match:', err);
      toast.error('Failed to link company');
    }
  }

  async function handleUnmatch(agencyId: string) {
    try {
      await updateAgency(agencyId, { moovs_company_id: null });
      toast.success('Company unlinked');
      loadAgencies();
      loadCounts();
    } catch (err) {
      console.error('Failed to unmatch:', err);
      toast.error('Failed to unlink');
    }
  }

  const totalPages = Math.ceil(agencyTotal / PAGE_SIZE);

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
            {unmatchedCount} unmatched
          </span>
          <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-medium">
            {matchedCount} matched
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
                  onClick={() => handleTabSwitch(false)}
                >
                  Unmatched ({unmatchedCount})
                </Button>
                <Button
                  variant={showMatched ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTabSwitch(true)}
                >
                  Matched ({matchedCount})
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agencies..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto divide-y">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
                </div>
              ) : agencies.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  {agencySearch ? 'No agencies match your search' : showMatched ? 'No matched agencies yet' : 'All agencies are matched!'}
                </p>
              ) : showMatched ? (
                agencies.map((a) => {
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
              ) : (
                agencies.map((a) => (
                  <button
                    key={a.id}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedAgencyId === a.id
                        ? 'bg-blue-50 border-l-2 border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      if (selectedAgencyId === a.id) {
                        setSelectedAgencyId(null);
                        setCompanySearch('');
                      } else {
                        setSelectedAgencyId(a.id);
                        // Pre-fill company search with agency name for fuzzy match
                        setCompanySearch(a.name.split(/[\s\-\/]+/)[0] || '');
                      }
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
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={agencyPage === 0}
                  onClick={() => setAgencyPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Page {agencyPage + 1} of {totalPages} ({agencyTotal} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={agencyPage >= totalPages - 1}
                  onClick={() => setAgencyPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
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
            <div className="max-h-[500px] overflow-y-auto divide-y">
              {!selectedAgency ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  Select an agency to see available companies
                </p>
              ) : !companySearch.trim() ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  Type a company name to search
                </p>
              ) : filteredCompanies.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  No matching companies found
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
