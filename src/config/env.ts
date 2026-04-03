interface AppConfig {
  apiBaseUrl: string;
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
  apiBaseUrl: getEnvVar('VITE_API_BASE_URL', 'https://wvx7dgl297.execute-api.us-east-1.amazonaws.com'),
  defaultOperatorId: getEnvVar('VITE_DEFAULT_OPERATOR_ID'),
};

export const EDGE_FUNCTION_URLS = {
  fetchReservations: `${config.apiBaseUrl}/fetch-reservations`,
  fetchOperators: `${config.apiBaseUrl}/fetch-operators`,
  fetchCompanies: `${config.apiBaseUrl}/fetch-companies`,
  fetchContacts: `${config.apiBaseUrl}/fetch-contacts`,
} as const;
