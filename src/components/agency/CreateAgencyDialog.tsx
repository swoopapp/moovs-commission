import { useState, useEffect, useMemo } from 'react';
import { useOperator } from '../../contexts/OperatorContext';
import { createAgency, CreateAgencyInput } from '../../services/agencyService';
import { fetchMoovsCompanies, MoovsCompany } from '../../services/companyLookupService';
import { AgencyType, CommissionType, CommissionBase } from '../../types/commission';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { Percent, DollarSign, ArrowRight, ArrowLeft, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateAgencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const AGENCY_TYPES: AgencyType[] = ['Hotel', 'DMC', 'Travel Agent', 'OTA', 'Concierge', 'Other'];

const TYPE_COLORS: Record<AgencyType, string> = {
  Hotel: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  DMC: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  'Travel Agent': 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
  OTA: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
  Concierge: 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100',
  Other: 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100',
};

const SELECTED_COLORS: Record<AgencyType, string> = {
  Hotel: 'bg-blue-100 border-blue-400 text-blue-900 ring-2 ring-blue-300',
  DMC: 'bg-purple-100 border-purple-400 text-purple-900 ring-2 ring-purple-300',
  'Travel Agent': 'bg-green-100 border-green-400 text-green-900 ring-2 ring-green-300',
  OTA: 'bg-orange-100 border-orange-400 text-orange-900 ring-2 ring-orange-300',
  Concierge: 'bg-teal-100 border-teal-400 text-teal-900 ring-2 ring-teal-300',
  Other: 'bg-gray-100 border-gray-400 text-gray-900 ring-2 ring-gray-300',
};

const BASE_LABELS: Record<CommissionBase, string> = {
  base_rate: 'Base Rate',
  total_amount: 'Total Amount',
  total_with_gratuity: 'Total with Gratuity',
};

export function CreateAgencyDialog({ open, onOpenChange, onCreated }: CreateAgencyDialogProps) {
  const operator = useOperator();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [type, setType] = useState<AgencyType>('Hotel');
  const [moovsCompanyId, setMoovsCompanyId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [agencyState, setAgencyState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('US');
  const [marketSegment, setMarketSegment] = useState('');

  // Company lookup
  const [companies, setCompanies] = useState<MoovsCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesFailed, setCompaniesFailed] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('none');
  const [companySearch, setCompanySearch] = useState('');

  // Fetch companies when dialog opens
  useEffect(() => {
    if (!open) return;
    if (!operator.moovsOperatorId) {
      setCompaniesFailed(true);
      return;
    }
    let cancelled = false;
    setCompaniesLoading(true);
    setCompaniesFailed(false);
    fetchMoovsCompanies(operator.moovsOperatorId)
      .then((result) => {
        if (!cancelled) setCompanies(result);
      })
      .catch((err) => {
        console.error('Failed to fetch Moovs companies:', err);
        if (!cancelled) setCompaniesFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCompaniesLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, operator.moovsOperatorId]);

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [companies, companySearch]);

  function handleCompanySelect(companyId: string) {
    setSelectedCompanyId(companyId);
    if (companyId === 'none') {
      // Clear auto-filled fields for manual entry
      setMoovsCompanyId('');
      setName('');
      setContactEmail('');
      setContactPhone('');
      return;
    }
    const company = companies.find((c) => c.company_id === companyId);
    if (!company) return;
    setMoovsCompanyId(company.company_id);
    setName(company.name);
    setContactEmail(company.email || '');
    setContactPhone(company.phone_number || '');
  }

  // Step 2
  const [commissionRate, setCommissionRate] = useState('10');
  const [commissionType, setCommissionType] = useState<CommissionType>('percent');
  const [commissionBase, setCommissionBase] = useState<CommissionBase>('total_amount');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setStep(1);
    setName('');
    setType('Hotel');
    setMoovsCompanyId('');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setAddress('');
    setCity('');
    setAgencyState('');
    setZipCode('');
    setCountry('US');
    setMarketSegment('');
    setCommissionRate('10');
    setCommissionType('percent');
    setCommissionBase('total_amount');
    setPaymentTerms('Net 30');
    setContractStart('');
    setContractEnd('');
    setNotes('');
    setSelectedCompanyId('none');
    setCompanySearch('');
  }

  async function handleCreate() {
    try {
      setCreating(true);
      const data: CreateAgencyInput = {
        operator_id: operator.operatorId,
        name: name.trim(),
        type,
        moovs_company_id: moovsCompanyId.trim() || null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: agencyState.trim() || null,
        zip_code: zipCode.trim() || null,
        country: country.trim() || null,
        market_segment: marketSegment.trim() || null,
        commission_rate: parseFloat(commissionRate) || 0,
        commission_type: commissionType,
        commission_base: commissionBase,
        payment_terms: paymentTerms || null,
        contract_start: contractStart || null,
        contract_end: contractEnd || null,
        status: 'active',
        notes: notes.trim() || null,
        last_synced_at: null,
      };
      await createAgency(data);
      toast.success(`Agency "${name.trim()}" created`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error('Failed to create agency:', err);
      toast.error('Failed to create agency');
    } finally {
      setCreating(false);
    }
  }

  const canProceed = name.trim().length > 0;

  function formatCommissionSummary(): string {
    const rate = parseFloat(commissionRate) || 0;
    if (commissionType === 'flat') {
      return `$${rate} flat per trip`;
    }
    return `${rate}% of ${BASE_LABELS[commissionBase]}`;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Create Agency — Step {step} of 2</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            {/* Company Lookup */}
            <Card className="bg-blue-50/50 border-blue-200">
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-medium text-blue-800">Link to Moovs Company</Label>
                </div>
                {companiesLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading companies...
                  </div>
                ) : companiesFailed || companies.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    {companiesFailed
                      ? 'Could not load Moovs companies. Enter details manually below.'
                      : 'No Moovs companies found. Enter details manually below.'}
                  </p>
                ) : (
                  <>
                    <Input
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="bg-white"
                    />
                    <Select value={selectedCompanyId} onValueChange={handleCompanySelect}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select a company..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None — manual entry</SelectItem>
                        {filteredCompanies.map((c) => (
                          <SelectItem key={c.company_id} value={c.company_id}>
                            {c.name}{c.email ? ` (${c.email})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCompanyId !== 'none' && (
                      <p className="text-xs text-blue-600">
                        Fields auto-filled from Moovs. You can override any value below.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="agency-name">Agency Name *</Label>
              <Input
                id="agency-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ritz-Carlton Concierge"
              />
            </div>

            <div className="space-y-2">
              <Label>Agency Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {AGENCY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      type === t ? SELECTED_COLORS[t] : TYPE_COLORS[t]
                    }`}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-name-create">Contact Name</Label>
              <Input
                id="contact-name-create"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Primary contact"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact-email-create">Email</Label>
                <Input
                  id="contact-email-create"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone-create">Phone</Label>
                <Input
                  id="contact-phone-create"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!canProceed} className="gap-1.5">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Commission */}
            <div className="space-y-2">
              <Label>Commission Type</Label>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate-input">Rate</Label>
                <div className="relative">
                  {commissionType === 'flat' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  )}
                  <Input
                    id="rate-input"
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

              {commissionType === 'percent' && (
                <div className="space-y-2">
                  <Label>Commission Base</Label>
                  <Select value={commissionBase} onValueChange={(v) => setCommissionBase(v as CommissionBase)}>
                    <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger className="max-w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                <Label htmlFor="start-date">Contract Start</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">Contract End</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={contractEnd}
                  onChange={(e) => setContractEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-notes">Notes</Label>
              <Textarea
                id="create-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this agency"
                rows={2}
              />
            </div>

            {/* Summary card */}
            <Card className="bg-gray-50">
              <CardContent className="pt-4 pb-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Summary</p>
                <p className="text-sm text-gray-600">
                  <strong>{name}</strong> ({type}) — {formatCommissionSummary()}
                  {paymentTerms ? `, ${paymentTerms}` : ''}
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Agency'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
