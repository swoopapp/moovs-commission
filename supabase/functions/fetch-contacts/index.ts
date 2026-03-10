import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const METABASE_URL = "https://swoop.metabaseapp.com/api/dataset";
const DATABASE_ID = 2;
const CONTACT_TABLE_ID = 282;

// Field IDs — POSTGRES_SWOOP.Contact table
const FIELD = {
  CONTACT_ID: 4873,
  COMPANY_ID: 4874,
  OPERATOR_ID: 4889,
  FIRST_NAME: 4885,
  LAST_NAME: 4886,
  EMAIL: 4878,
  MOBILE_PHONE: 4881,
  COMPANY_POSITION: 4882,
  HOME_ADDRESS: 4876,
  WORK_ADDRESS: 4872,
  CREATED_AT: 4891,
  UPDATED_AT: 4870,
  REMOVED_AT: 4884,
  _FIVETRAN_DELETED: 4871,
} as const;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { operator_id, company_id } = await req.json();

    if (!operator_id) {
      return new Response(
        JSON.stringify({ success: false, error: "operator_id is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const METABASE_API_KEY = Deno.env.get("METABASE_API_KEY");
    if (!METABASE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "METABASE_API_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Build Metabase native query filters
    const filters: unknown[] = [
      // OPERATOR_ID = operator_id
      ["=", ["field", FIELD.OPERATOR_ID, null], operator_id],
      // Exclude soft-deleted: _FIVETRAN_DELETED = false
      ["=", ["field", FIELD._FIVETRAN_DELETED, null], false],
      // Exclude removed: REMOVED_AT is null
      ["is-null", ["field", FIELD.REMOVED_AT, null]],
    ];

    // Optional company filter
    if (company_id) {
      filters.push(["=", ["field", FIELD.COMPANY_ID, null], company_id]);
    }

    const query = {
      database: DATABASE_ID,
      type: "query",
      query: {
        "source-table": CONTACT_TABLE_ID,
        filter: ["and", ...filters],
        "order-by": [
          ["asc", ["field", FIELD.LAST_NAME, null]],
          ["asc", ["field", FIELD.FIRST_NAME, null]],
        ],
      },
    };

    const metabaseRes = await fetch(METABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": METABASE_API_KEY,
      },
      body: JSON.stringify(query),
    });

    if (!metabaseRes.ok) {
      const errText = await metabaseRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `Metabase error: ${metabaseRes.status}`, details: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const data = await metabaseRes.json();
    const rows = data.data?.rows || [];
    const cols = data.data?.cols || [];

    // Build column index map
    const colIndex: Record<string, number> = {};
    cols.forEach((col: { name: string }, i: number) => {
      colIndex[col.name] = i;
    });

    // Transform rows to clean objects
    const contacts = rows.map((row: unknown[]) => ({
      contact_id: row[colIndex["CONTACT_ID"]] || null,
      company_id: row[colIndex["COMPANY_ID"]] || null,
      first_name: row[colIndex["FIRST_NAME"]] || null,
      last_name: row[colIndex["LAST_NAME"]] || null,
      email: row[colIndex["EMAIL"]] || null,
      mobile_phone: row[colIndex["MOBILE_PHONE"]] || null,
      position: row[colIndex["COMPANY_POSITION"]] || null,
      home_address: row[colIndex["HOME_ADDRESS"]] || null,
      work_address: row[colIndex["WORK_ADDRESS"]] || null,
      created_at: row[colIndex["CREATED_AT"]] || null,
      updated_at: row[colIndex["UPDATED_AT"]] || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        operator_id,
        company_id: company_id || null,
        count: contacts.length,
        contacts,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
