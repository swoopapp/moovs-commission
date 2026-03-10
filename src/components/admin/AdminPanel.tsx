import { useState, useEffect, useCallback } from 'react';
import { AdminLoginPage, isAdminAuthenticated } from './AdminLoginPage';
import { OperatorBranding } from '../../types/operatorBranding';
import {
  fetchAllBrandings,
  createBranding,
  updateBranding,
  deleteBranding,
} from '../../services/operatorBrandingService';
import { lookupMoovsOperator, MoovsOperatorDetails } from '../../services/moovsOperatorService';
import { uploadLogo } from '../../services/storageService';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Plus, Pencil, Trash2, ExternalLink, X, Search, Loader2,
  CheckCircle2, AlertCircle, Truck, Users, Calendar, Activity,
} from 'lucide-react';
import moovsLogo from '../../assets/moovs-logo.png';

export function AdminPanel() {
  const [authed, setAuthed] = useState(() => isAdminAuthenticated());

  if (!authed) {
    return <AdminLoginPage onAuthenticated={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}

// --- Form for creating/editing an operator ---

interface OperatorFormData {
  operator_id: string;
  slug: string;
  display_name: string;
  auth_password: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  sso_provider: string;
  sso_config: string; // JSON string
}

const emptyForm: OperatorFormData = {
  operator_id: '',
  slug: '',
  display_name: '',
  auth_password: 'demo',
  primary_color: '',
  secondary_color: '',
  logo_url: '',
  sso_provider: '',
  sso_config: '',
};

interface FormErrors {
  operator_id?: string;
  slug?: string;
  auth_password?: string;
}

function validateForm(form: OperatorFormData, editingId: string | null, existing: OperatorBranding[]): FormErrors {
  const errors: FormErrors = {};
  if (!form.operator_id.trim()) {
    errors.operator_id = 'Operator ID is required';
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.operator_id.trim())) {
    errors.operator_id = 'Must be a valid UUID';
  } else if (!editingId && existing.some(op => op.operator_id === form.operator_id.trim())) {
    errors.operator_id = 'This operator already exists';
  }
  if (!form.slug.trim()) {
    errors.slug = 'Slug is required';
  } else if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
    errors.slug = 'Only lowercase letters, numbers, and hyphens';
  } else if (existing.some(op => op.slug === form.slug.trim() && op.id !== editingId)) {
    errors.slug = 'This slug is already taken';
  }
  if (!editingId && !form.auth_password.trim()) {
    errors.auth_password = 'Password is required for new operators';
  }
  return errors;
}

function AdminDashboard() {
  const [operators, setOperators] = useState<OperatorBranding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OperatorFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Moovs lookup state
  const [lookingUp, setLookingUp] = useState(false);
  const [moovsDetails, setMoovsDetails] = useState<MoovsOperatorDetails | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const loadOperators = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAllBrandings();
      setOperators(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOperators(); }, [loadOperators]);

  const handleEdit = (op: OperatorBranding) => {
    setEditingId(op.id);
    setForm({
      operator_id: op.operator_id,
      slug: op.slug,
      display_name: op.display_name || '',
      auth_password: op.auth_password,
      primary_color: op.primary_color || '',
      secondary_color: op.secondary_color || '',
      logo_url: op.logo_url || '',
      sso_provider: op.sso_provider || '',
      sso_config: op.sso_config ? JSON.stringify(op.sso_config, null, 2) : '',
    });
    setLogoFile(null);
    setMoovsDetails(null);
    setLookupError(null);
    setFormErrors({});
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setLogoFile(null);
    setMoovsDetails(null);
    setLookupError(null);
    setFormErrors({});
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setLogoFile(null);
    setMoovsDetails(null);
    setLookupError(null);
    setFormErrors({});
  };

  const handleLookup = async () => {
    const operatorId = form.operator_id.trim();
    if (!operatorId) return;

    setLookingUp(true);
    setLookupError(null);
    setMoovsDetails(null);

    try {
      const details = await lookupMoovsOperator(operatorId);
      if (!details) {
        setLookupError('Operator not found in Moovs. Check the UUID and try again.');
        return;
      }

      setMoovsDetails(details);

      // Auto-fill form fields from Moovs data
      setForm(prev => ({
        ...prev,
        display_name: prev.display_name || details.name,
        slug: prev.slug || details.nameSlug || details.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      }));
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    const errors = validateForm(form, editingId, operators);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      let logoUrl = form.logo_url;
      if (logoFile) {
        logoUrl = await uploadLogo(logoFile);
      }

      let ssoConfig: Record<string, unknown> | null = null;
      if (form.sso_config.trim()) {
        try {
          ssoConfig = JSON.parse(form.sso_config);
        } catch {
          setFormErrors({ ...formErrors });
          setSaving(false);
          return;
        }
      }

      const data = {
        operator_id: form.operator_id.trim(),
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        display_name: form.display_name || null,
        auth_password: form.auth_password,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        logo_url: logoUrl || null,
        sso_provider: form.sso_provider || null,
        sso_config: ssoConfig,
      };

      if (editingId) {
        await updateBranding(editingId, data);
      } else {
        await createBranding(data as Parameters<typeof createBranding>[0]);
      }

      handleCancel();
      await loadOperators();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this operator? This cannot be undone.')) return;
    try {
      await deleteBranding(id);
      await loadOperators();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const updateField = (field: keyof OperatorFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Clear error for this field on change
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <img src={moovsLogo} alt="Moovs" className="h-8 w-auto" />
            <span className="text-lg font-semibold text-gray-900">Commissions Admin</span>
          </div>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Operator
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8 bg-white rounded-lg border border-gray-200 p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Operator' : 'New Operator'}
              </h2>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Operator ID + Lookup */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Moovs Operator ID
              </label>
              <div className="flex gap-2">
                <Input
                  value={form.operator_id}
                  onChange={e => updateField('operator_id', e.target.value)}
                  placeholder="Paste UUID from Moovs"
                  disabled={!!editingId}
                  className={formErrors.operator_id ? 'border-red-300' : ''}
                />
                {!editingId && (
                  <Button
                    variant="outline"
                    onClick={handleLookup}
                    disabled={lookingUp || !form.operator_id.trim()}
                    className="gap-2 shrink-0"
                  >
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Lookup
                  </Button>
                )}
              </div>
              {formErrors.operator_id && (
                <p className="text-red-500 text-xs mt-1">{formErrors.operator_id}</p>
              )}
              {lookupError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {lookupError}
                </div>
              )}
            </div>

            {/* Moovs Details Card (shown after lookup) */}
            {moovsDetails && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Operator found in Moovs</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-blue-600 text-xs font-medium">Company</div>
                    <div className="text-blue-900 font-medium">{moovsDetails.name}</div>
                  </div>
                  <div>
                    <div className="text-blue-600 text-xs font-medium">Status</div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${moovsDetails.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-blue-900">{moovsDetails.status}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-600 text-xs font-medium">Plan</div>
                    <div className="text-blue-900">{moovsDetails.planName || moovsDetails.plan || '\u2014'}</div>
                  </div>
                  <div>
                    <div className="text-blue-600 text-xs font-medium">Slug</div>
                    <div className="text-blue-900 font-mono text-xs">{moovsDetails.nameSlug || '\u2014'}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-900">{moovsDetails.vehiclesTotal} vehicles</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-900">{moovsDetails.driversCount} drivers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-900">{moovsDetails.totalReservations} reservations</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-900">{moovsDetails.engagementStatus || '\u2014'}</span>
                  </div>
                </div>
                {moovsDetails.email && (
                  <div className="mt-2 text-xs text-blue-600">{moovsDetails.email}</div>
                )}
              </div>
            )}

            {/* Main form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL path)</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">/</span>
                  <Input
                    value={form.slug}
                    onChange={e => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. acmetransport"
                    className={formErrors.slug ? 'border-red-300' : ''}
                  />
                </div>
                {formErrors.slug && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.slug}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <Input
                  value={form.display_name}
                  onChange={e => updateField('display_name', e.target.value)}
                  placeholder="e.g. Acme Transport Co."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Password</label>
                <Input
                  value={form.auth_password}
                  onChange={e => updateField('auth_password', e.target.value)}
                  placeholder="Login password"
                  className={formErrors.auth_password ? 'border-red-300' : ''}
                />
                {formErrors.auth_password && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.auth_password}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SSO Provider</label>
                <select
                  value={form.sso_provider}
                  onChange={e => updateField('sso_provider', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">None (password only)</option>
                  <option value="microsoft">Microsoft SSO</option>
                  <option value="google">Google SSO</option>
                  <option value="okta">Okta SSO</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <Input
                    value={form.primary_color}
                    onChange={e => updateField('primary_color', e.target.value)}
                    placeholder="#030213"
                  />
                  {form.primary_color && (
                    <div
                      className="w-10 h-10 rounded border border-gray-200 shrink-0"
                      style={{ backgroundColor: form.primary_color }}
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex gap-2">
                  <Input
                    value={form.secondary_color}
                    onChange={e => updateField('secondary_color', e.target.value)}
                    placeholder="#4A7BF7"
                  />
                  {form.secondary_color && (
                    <div
                      className="w-10 h-10 rounded border border-gray-200 shrink-0"
                      style={{ backgroundColor: form.secondary_color }}
                    />
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                <div className="flex items-center gap-4">
                  {(logoFile || form.logo_url) && (
                    <img
                      src={logoFile ? URL.createObjectURL(logoFile) : form.logo_url}
                      alt="Logo preview"
                      className="h-10 w-auto"
                    />
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                    {logoFile ? logoFile.name : (form.logo_url ? 'Change Logo' : 'Upload Logo')}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setLogoFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              {form.sso_provider && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SSO Configuration (JSON)
                  </label>
                  <textarea
                    value={form.sso_config}
                    onChange={e => updateField('sso_config', e.target.value)}
                    placeholder='{"tenant_id": "...", "client_id": "..."}'
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create Operator'}
              </Button>
            </div>
          </div>
        )}

        {/* Operator List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading operators...</div>
        ) : operators.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No operators configured yet.</p>
            <Button onClick={handleNew} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Add your first operator
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {operators.map(op => (
              <div key={op.id} className="flex items-center justify-between px-4 md:px-6 py-4">
                <div className="flex items-center gap-4 min-w-0">
                  {op.logo_url ? (
                    <img src={op.logo_url} alt="" className="h-8 w-auto shrink-0" />
                  ) : (
                    <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 shrink-0">
                      {op.slug[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {op.display_name || op.slug}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>/{op.slug}</span>
                      <span className="text-gray-300">&middot;</span>
                      <span className="font-mono text-xs">{op.operator_id.slice(0, 8)}...</span>
                      {op.sso_provider && (
                        <>
                          <span className="text-gray-300">&middot;</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{op.sso_provider} SSO</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/${op.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    title="Open operator portal"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => handleEdit(op)}
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(op.id)}
                    className="p-2.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
