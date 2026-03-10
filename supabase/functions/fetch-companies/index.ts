import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const METABASE_URL = "https://swoop.metabaseapp.com/api/dataset"
const METABASE_API_KEY = Deno.env.get("METABASE_API_KEY") ?? ""
const DATABASE_ID = 2
const COMPANY_TABLE_ID = 264

// Field IDs for POSTGRES_SWOOP.Company table
const FIELDS = {
  COMPANY_ID: 4703,
  NAME: 4714,
  OPERATOR_ID: 4716,
  EMAIL: 4710,
  PHONE_NUMBER: 4702,
  ADDRESS: 4701,
  STATE: 4709,
  POSTAL_CODE: 4707,
  WEBSITE_URL: 4712,
  COMPANY_LOGO_URL: 9461,
  DESCRIPTION: 4706,
  CREATED_AT: 4711,
  UPDATED_AT: 4705,
  REMOVED_AT: 12062,
  _FIVETRAN_DELETED: 4713,
} as const

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { operator_id } = await req.json()

    if (!operator_id) {
      return new Response(JSON.stringify({ error: 'operator_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build Metabase structured query
    // Filter: OPERATOR_ID = operator_id AND _FIVETRAN_DELETED = false AND REMOVED_AT is null
    const query = {
      database: DATABASE_ID,
      type: "query",
      query: {
        "source-table": COMPANY_TABLE_ID,
        filter: [
          "and",
          ["=", ["field", FIELDS.OPERATOR_ID, null], operator_id],
          ["=", ["field", FIELDS._FIVETRAN_DELETED, null], false],
          ["is-null", ["field", FIELDS.REMOVED_AT, null]],
        ],
        fields: [
          ["field", FIELDS.COMPANY_ID, null],
          ["field", FIELDS.NAME, null],
          ["field", FIELDS.EMAIL, null],
          ["field", FIELDS.PHONE_NUMBER, null],
          ["field", FIELDS.ADDRESS, null],
          ["field", FIELDS.STATE, null],
          ["field", FIELDS.POSTAL_CODE, null],
          ["field", FIELDS.WEBSITE_URL, null],
          ["field", FIELDS.COMPANY_LOGO_URL, null],
          ["field", FIELDS.DESCRIPTION, null],
          ["field", FIELDS.CREATED_AT, null],
          ["field", FIELDS.UPDATED_AT, null],
        ],
        "order-by": [["asc", ["field", FIELDS.NAME, null]]],
      },
    }

    const metabaseRes = await fetch(METABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": METABASE_API_KEY,
      },
      body: JSON.stringify(query),
    })

    if (!metabaseRes.ok) {
      const errText = await metabaseRes.text()
      console.error("Metabase error:", metabaseRes.status, errText)
      return new Response(JSON.stringify({ error: `Metabase query failed: ${metabaseRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await metabaseRes.json()

    if (data.status === "failed") {
      console.error("Metabase query failed:", data.error)
      return new Response(JSON.stringify({ error: `Metabase query error: ${data.error}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Transform rows to clean objects
    const cols = data.data.cols.map((c: { name: string }) => c.name)
    const companies = data.data.rows.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {}
      cols.forEach((col: string, i: number) => {
        obj[col] = row[i]
      })

      return {
        company_id: obj["ID"] ?? obj["id"] ?? obj["COMPANY_ID"] ?? obj["company_id"] ?? null,
        name: obj["NAME"] ?? obj["name"] ?? null,
        email: obj["EMAIL"] ?? obj["email"] ?? null,
        phone_number: obj["PHONE_NUMBER"] ?? obj["phone_number"] ?? null,
        address: obj["ADDRESS"] ?? obj["address"] ?? null,
        state: obj["STATE"] ?? obj["state"] ?? null,
        postal_code: obj["POSTAL_CODE"] ?? obj["postal_code"] ?? null,
        website_url: obj["WEBSITE_URL"] ?? obj["website_url"] ?? null,
        logo_url: obj["COMPANY_LOGO_URL"] ?? obj["company_logo_url"] ?? null,
        description: obj["DESCRIPTION"] ?? obj["description"] ?? null,
        created_at: obj["CREATED_AT"] ?? obj["created_at"] ?? null,
        updated_at: obj["UPDATED_AT"] ?? obj["updated_at"] ?? null,
      }
    })

    // Sort by name ascending (should already be sorted by query, but ensure)
    companies.sort((a: { name: string | null }, b: { name: string | null }) => {
      const nameA = (a.name || '').toLowerCase()
      const nameB = (b.name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

    return new Response(JSON.stringify({
      success: true,
      operator_id,
      count: companies.length,
      companies,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('fetch-companies error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
