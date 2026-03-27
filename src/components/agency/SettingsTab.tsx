import { useState, useEffect, useMemo } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { Agency, CommissionType, CommissionBase } from '../../types/commission';
import { updateAgency, deleteAgency } from '../../services/agencyService';
import { fetchMoovsCompanies, MoovsCompany } from '../../services/companyLookupService';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { Copy, Trash2, Link, Percent, DollarSign, Info, Building2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsTabProps {
  agency: Agency;
  onUpdated: (agency: Agency) => void;
}

export function SettingsTab({ agency, onUpdated }: SettingsTabProps) {
  const operator = useOperator();
  const [commissionRate, setCommissionRate] = useState(agency.commission_rate.toString());
  const [commissionType, setCommissionType] = useState<CommissionType>(agency.commission_type);
  const [commissionBase, setCommissionBase] = useState<CommissionBase>(agency.commission_base);
  const [paymentTerms, setPaymentTerms] = useState(agency.payment_terms || '');
  const [contractStart, setContractStart] = useState(agency.contract_start || '');
  const [contractEnd, setContractEnd] = useState(agency.contract_end || '');
  const [notes, setNotes] = useState(agency.notes || '');
  const [address, setAddress] = useState(agency.address || '');
  const [city, setCity] = useState(agency.city || '');
  const [agencyState, setAgencyState] = useState(agency.state || '');
  const [zipCode, setZipCode] = useState(agency.zip_code || '');
  const [country, setCountry] = useState(agency.country || 'US');
  const [marketSegment, setMarketSegment] = useState(agency.market_segment || '');
  const [saving, setSaving] = useState(false);

  // Company link
  const [companies, setCompanies] = useState<MoovsCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companySearch, setCompanySearch] = useState('');

  useEffect(() => {
    if (!operator.moovsOperatorId) return;
    let cancelled = false;
    setCompaniesLoading(true);
    fetchMoovsCompanies(operator.moovsOperatorId)
      .then((result) => { if (!cancelled) setCompanies(result); })
      .catch((err) => console.error('Failed to fetch companies:', err))
      .finally(() => { if (!cancelled) setCompaniesLoading(false); });
    return () => { cancelled = true; };
  }, [operator.moovsOperatorId]);

  const linkedCompany = useMemo(() => {
    if (!agency.moovs_company_id) return null;
    return companies.find((c) => c.company_id === agency.moovs_company_id) || null;
  }, [agency.moovs_company_id, companies]);

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q))
    );
  }, [companies, companySearch]);

  async function handleLinkCompany(companyId: string) {
    try {
      const updated = await updateAgency(agency.id, { moovs_company_id: companyId });
      onUpdated(updated);
      setCompanySearch('');
      toast.success('Company linked — trips will now auto-match');
    } catch (err) {
      console.error('Failed to link company:', err);
      toast.error('Failed to link company');
    }
  }

  async function handleUnlinkCompany() {
    try {
      const updated = await updateAgency(agency.id, { moovs_company_id: null });
      onUpdated(updated);
      toast.success('Company unlinked');
    } catch (err) {
      console.error('Failed to unlink company:', err);
      toast.error('Failed to unlink company');
    }
  }
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoGenerateStatements, setAutoGenerateStatements] = useState(false);

  const portalUrl = `${window.location.origin}/portal/${agency.portal_token}`;
  const isActive = agency.status === 'active';

  async function handleSave() {
    try {
      setSaving(true);
      const updated = await updateAgency(agency.id, {
        commission_rate: parseFloat(commissionRate) || 0,
        commission_type: commissionType,
        commission_base: commissionBase,
        payment_terms: paymentTerms || null,
        contract_start: contractStart || null,
        contract_end: contractEnd || null,
        notes: notes || null,
        address: address || null,
        city: city || null,
        state: agencyState || null,
        zip_code: zipCode || null,
        country: country || null,
        market_segment: marketSegment || null,
      });
      onUpdated(updated);
      toast.success('Agency settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle() {
    try {
      const newStatus = isActive ? 'suspended' : 'active';
      const updated = await updateAgency(agency.id, { status: newStatus as Agency['status'] });
      onUpdated(updated);
      toast.success(`Agency ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch (err) {
      console.error('Failed to toggle status:', err);
      toast.error('Failed to update agency status');
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      setDeleting(true);
      await deleteAgency(agency.id);
      toast.success('Agency deleted');
      window.location.hash = '#/';
    } catch (err) {
      console.error('Failed to delete agency:', err);
      toast.error('Failed to delete agency');
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    toast.success('Portal link copied to clipboard');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Commission & Contract */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commission Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type toggle */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  variant={commissionType === 'percent' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCommissionType('percent')}
                >
                  <Percent className="h-3.5 w-3.5" />
                  Percentage
                </Button>
                <Button
                  variant={commissionType === 'flat' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCommissionType('flat')}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Flat Amount
                </Button>
              </div>
            </div>

            {/* Rate input */}
            <div className="space-y-2">
              <Label htmlFor="commission-rate">Rate</Label>
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  {commissionType === 'flat' ? '$' : ''}
                </span>
                <Input
                  id="commission-rate"
                  type="number"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className={commissionType === 'flat' ? 'pl-7' : ''}
                />
                {commissionType === 'percent' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                )}
              </div>
            </div>

            {/* Commission base */}
            {commissionType === 'percent' && (
              <div className="space-y-2">
                <Label>Commission Base</Label>
                <Select value={commissionBase} onValueChange={(v) => setCommissionBase(v as CommissionBase)}>
                  <SelectTrigger className="max-w-[250px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_rate">Base Rate</SelectItem>
                    <SelectItem value="total_amount">Total Amount</SelectItem>
                    <SelectItem value="total_with_gratuity">Total with Gratuity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Commission explanation */}
            <div className="bg-blue-50 text-blue-700 text-sm px-4 py-2.5 rounded-lg flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              {commissionType === 'percent' ? (
                <span>
                  This agency earns {commissionRate || 0}% of each trip's{' '}
                  {commissionBase === 'base_rate' ? 'base rate' : commissionBase === 'total_amount' ? 'total amount' : 'total with gratuity'}{' '}
                  as commission.
                </span>
              ) : (
                <span>This agency earns ${commissionRate || 0} flat per trip as commission.</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Address & Segment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-state">State</Label>
                <Input
                  id="agency-state"
                  value={agencyState}
                  onChange={(e) => setAgencyState(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zip-code">Zip Code</Label>
                <Input
                  id="zip-code"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-segment">Market Segment</Label>
              <Select value={marketSegment || 'none'} onValueChange={(v) => setMarketSegment(v === 'none' ? '' : v)}>
                <SelectTrigger className="max-w-[250px]">
                  <SelectValue placeholder="Select segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="US Domestic">US Domestic</SelectItem>
                  <SelectItem value="Japan">Japan</SelectItem>
                  <SelectItem value="China">China</SelectItem>
                  <SelectItem value="Korea">Korea</SelectItem>
                  <SelectItem value="Military">Military</SelectItem>
                  <SelectItem value="Oceania">Oceania</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms || 'none'} onValueChange={(v) => setPaymentTerms(v === 'none' ? '' : v)}>
                <SelectTrigger className="max-w-[250px]">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Net 15">Net 15</SelectItem>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 45">Net 45</SelectItem>
                  <SelectItem value="Net 60">Net 60</SelectItem>
                  <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract-start">Contract Start</Label>
                <Input
                  id="contract-start"
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-end">Contract End</Label>
                <Input
                  id="contract-end"
                  type="date"
                  value={contractEnd}
                  onChange={(e) => setContractEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 py-1">
              <Switch
                id="auto-statements"
                checked={autoGenerateStatements}
                onCheckedChange={setAutoGenerateStatements}
              />
              <div className="space-y-0.5">
                <Label htmlFor="auto-statements" className="font-medium cursor-pointer">
                  Auto-generate monthly statements
                </Label>
                <p className="text-sm text-gray-500">
                  Automatically email a commission statement at the end of each billing period
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes about this agency (visible only to your team)"
                rows={3}
              />
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Company Link, Portal, Status, Danger Zone */}
      <div className="space-y-6">
        <Card className={agency.moovs_company_id ? 'border-green-200' : 'border-amber-200'}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Moovs Company Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agency.moovs_company_id ? (
              <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {linkedCompany ? linkedCompany.name : 'Linked'}
                  </p>
                  <p className="text-xs text-green-600 font-mono">{agency.moovs_company_id}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleUnlinkCompany} className="text-green-700 hover:text-red-600">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Not linked — trips won't auto-match to this agency until a company is linked.
                </p>
                {companiesLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading companies...
                  </div>
                ) : companies.length > 0 ? (
                  <>
                    <Input
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                    />
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {filteredCompanies.slice(0, 20).map((c) => (
                        <button
                          key={c.company_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                          onClick={() => handleLinkCompany(c.company_id)}
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.email && <span className="text-gray-500 ml-2">{c.email}</span>}
                        </button>
                      ))}
                      {filteredCompanies.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-500">No matching companies</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">No Moovs companies available for this operator.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link className="h-4 w-4" />
              Agency Portal Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Share this link with the agency to give them access to their portal.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={portalUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={handleCopyPortalLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm text-gray-500 space-y-1.5 pt-1">
              <p className="font-semibold text-gray-700">Access levels available:</p>
              <p><span className="font-medium text-gray-700">GM</span> — sees all departments and agents</p>
              <p><span className="font-medium text-gray-700">Manager</span> — sees their department only</p>
              <p><span className="font-medium text-gray-700">Agent</span> — sees their own bookings only</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agency Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {isActive ? 'Active' : 'Suspended'}
                  {contractStart && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      Since {new Date(contractStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  {isActive
                    ? 'Agency is active and can receive commissions'
                    : 'Agency is suspended and will not receive new commissions'}
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={handleStatusToggle} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Permanently delete this agency, all agents, and their attribution history. This action cannot be undone.
            </p>
            <Separator />
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : confirmDelete ? 'Click again to confirm' : 'Delete Agency'}
            </Button>
            {confirmDelete && !deleting && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
