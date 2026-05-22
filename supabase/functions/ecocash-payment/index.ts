// EcoCash payment edge function — mock-mode fallback when credentials missing.
// Validates input, calls EcoCash C2B (deposit) or B2C (withdraw), returns a
// normalised result the frontend can persist via wallet_deposit/wallet_withdraw.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Accept 263XXXXXXXXX, 0XXXXXXXXX, or 7XXXXXXXX
  if (digits.startsWith("263") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "263" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("7")) return "263" + digits;
  return null;
}

function uuid() {
  return crypto.randomUUID();
}

interface Payload {
  action: "deposit" | "withdraw";
  amount: number;
  phone: string;
  reference?: string;
}

async function callEcoCashReal(
  action: "deposit" | "withdraw",
  phone: string,
  amount: number,
  reference: string,
) {
  const apiUrl = Deno.env.get("ECOCASH_API_URL") ?? "https://api.ecocash.co.zw/v1";
  const username = Deno.env.get("ECOCASH_API_USERNAME")!;
  const password = Deno.env.get("ECOCASH_API_PASSWORD")!;
  const merchantCode = Deno.env.get("ECOCASH_MERCHANT_CODE")!;
  const merchantPin = Deno.env.get("ECOCASH_MERCHANT_PIN")!;
  const merchantNumber = Deno.env.get("ECOCASH_MERCHANT_NUMBER")!;
  const notifyUrl = Deno.env.get("ECOCASH_NOTIFY_URL") ?? "https://example.com/callback";
  const tranType = action === "deposit" ? "C2B" : "B2C";
  const txStatus = action === "deposit" ? "Charged" : "Disbursed";
  const remarks = action === "deposit" ? "ZimScore Wallet Deposit" : "ZimScore Wallet Withdrawal";

  const body = {
    clientCorrelator: uuid(),
    notifyUrl,
    referenceCode: reference,
    tranType,
    endUserId: phone,
    remarks,
    transactionOperationStatus: txStatus,
    paymentAmount: {
      charginginformation: {
        amount,
        currency: "USD",
        description: remarks,
      },
      chargeMetaData: {
        channel: "WEB",
        purchaseCategoryCode: "General",
        onBeHalfOf: "ZimScore",
      },
    },
    merchantCode,
    merchantPin,
    merchantNumber,
  };

  const auth = "Basic " + btoa(`${username}:${password}`);
  const res = await fetch(`${apiUrl}/transactions/amount`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) {
    throw new Error(`EcoCash ${res.status}: ${text.slice(0, 200)}`);
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "unauthenticated" }, 401);

    const payload = (await req.json()) as Payload;
    if (!payload || (payload.action !== "deposit" && payload.action !== "withdraw")) {
      return json({ error: "invalid_action" }, 400);
    }
    if (!Number.isFinite(payload.amount) || payload.amount <= 0 || payload.amount > 10000) {
      return json({ error: "invalid_amount" }, 400);
    }
    const phone = normalisePhone(payload.phone || "");
    if (!phone) return json({ error: "invalid_phone" }, 400);

    const reference = payload.reference ||
      `${payload.action === "deposit" ? "DEP" : "WTH"}-${uuid().slice(0, 8).toUpperCase()}`;

    const hasCreds = !!(
      Deno.env.get("ECOCASH_API_USERNAME") &&
      Deno.env.get("ECOCASH_API_PASSWORD") &&
      Deno.env.get("ECOCASH_MERCHANT_CODE")
    );

    if (!hasCreds) {
      // MOCK mode
      return json({
        mock: true,
        status: "Success",
        transactionId: uuid(),
        reference,
        message: payload.action === "deposit"
          ? `MOCK: USSD push sent to ${phone} for $${payload.amount.toFixed(2)}. Approve on your phone to complete.`
          : `MOCK: Disbursement of $${payload.amount.toFixed(2)} to ${phone} initiated.`,
      });
    }

    const result = await callEcoCashReal(payload.action, phone, payload.amount, reference);
    return json({ mock: false, status: "Success", reference, providerResponse: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ecocash-payment error", msg);
    return json({ error: msg }, 500);
  }
});
