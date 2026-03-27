interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultOperatorId: string;
  lambdaApiUrl: string;
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
  lambdaApiUrl: getEnvVar('VITE_LAMBDA_API_URL', 'https://wvx7dgl297.execute-api.us-east-1.amazonaws.com'),
};

export const EDGE_FUNCTION_URLS = {
  fetchReservations: `${config.lambdaApiUrl}/fetch-reservations`,
  fetchOperators: `${config.lambdaApiUrl}/fetch-operators`,
  fetchCompanies: `${config.lambdaApiUrl}/fetch-companies`,
  fetchContacts: `${config.lambdaApiUrl}/fetch-contacts`,
} as const;
