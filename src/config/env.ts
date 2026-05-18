interface AppConfig {
  apiBaseUrl: string;
  defaultOperatorId: string;
}

function getPublicEnv(key: string): string | undefined {
  if (typeof process !== 'undefined') {
    return process.env[key];
  }
  return undefined;
}

export const config: AppConfig = {
  apiBaseUrl: getPublicEnv('NEXT_PUBLIC_COMMISSION_API_BASE_URL') || '/api/commission-api',
  defaultOperatorId: getPublicEnv('NEXT_PUBLIC_DEFAULT_OPERATOR_ID') || '',
};

export const EDGE_FUNCTION_URLS = {
  fetchReservations: `${config.apiBaseUrl}/fetch-reservations`,
  fetchOperators: `${config.apiBaseUrl}/fetch-operators`,
  fetchCompanies: `${config.apiBaseUrl}/fetch-companies`,
  fetchContacts: `${config.apiBaseUrl}/fetch-contacts`,
} as const;
