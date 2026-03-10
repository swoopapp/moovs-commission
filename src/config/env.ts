interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultOperatorId: string;
}

function getEnvVar(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value && fallback === undefined) {
    console.warn(`Missing environment variable: ${key}`);
    return '';
  }
  return value || fallback || '';
}

export const config: AppConfig = {
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL', 'https://mylhldsyxkmzkksgifgt.supabase.co'),
  supabaseAnonKey: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  defaultOperatorId: getEnvVar('VITE_DEFAULT_OPERATOR_ID'),
};

export const EDGE_FUNCTION_URLS = {
  fetchReservations: `${config.supabaseUrl}/functions/v1/fetch-reservations`,
  fetchOperators: `${config.supabaseUrl}/functions/v1/fetch-operators`,
  fetchCompanies: `${config.supabaseUrl}/functions/v1/fetch-companies`,
  fetchContacts: `${config.supabaseUrl}/functions/v1/fetch-contacts`,
} as const;
