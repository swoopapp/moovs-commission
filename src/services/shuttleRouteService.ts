import { config } from '../config/env';
import { ShuttleRoute } from '../types/commissionOperator';
import { demoShuttleRoutes, isDemoMoovsOperatorId } from '../demoData';

const API = config.apiBaseUrl;

/**
 * List an operator's shuttle routes (Moovs shuttle_route_definition), used to build the
 * operator-level route rate editor. operatorId is the MOOVS operator id (read replica).
 */
export async function fetchShuttleRoutes(moovsOperatorId: string): Promise<ShuttleRoute[]> {
  if (isDemoMoovsOperatorId(moovsOperatorId)) return demoShuttleRoutes;
  const res = await fetch(`${API}/fetch-shuttle-routes?operator_id=${encodeURIComponent(moovsOperatorId)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetchShuttleRoutes: ${res.status} ${res.statusText} - ${body}`);
  }
  const data = (await res.json()) as { routes?: ShuttleRoute[] };
  return data.routes ?? [];
}
