import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPTS: Record<string, string> = {
  ecocash: `You are verifying a Zimbabwean EcoCash (Econet) mobile money statement. A genuine one shows EcoCash/Econet branding, account holder & phone (077/078XXXXXXX), per-transaction Date/Time/Reference/Description/Amount/Running Balance, and the running balance must be arithmetically consistent. Reject if branding is missing, fonts/formatting are inconsistent, the running balance does not add up, transaction IDs are malformed, or the document looks edited/screenshotted.`,
  bank_statement: `You are verifying a Zimbabwean bank statement (CBZ, Stanbic, Steward, Nedbank, FBC, ZB, NMB, etc.). A genuine one shows bank logo & full bank name, branch, account number/holder, statement period, opening & closing balance, per-transaction date/description/debit/credit/balance, and the running balance must be arithmetically consistent. Reject if logos/headers/footers look photoshopped, fonts are inconsistent, balances don't add up, or it's clearly a generic spreadsheet.`,
  receipt: `You are verifying a payment/utility receipt (ZESA token, water bill, rent, retail till slip, etc.). A genuine one shows merchant/utility name & branding, receipt or token number, date/time, line items with amounts, total, and a payment method. Reject if branding is missing, fonts/spacing look edited, totals don't match line items, or the document is clearly fabricated.`,
  other: `You are verifying a financial document used for credit assessment. Determine whether it is a genuine, unedited financial document (statement, receipt, payslip, etc.) or a forged/fabricated/edited document. Look for tampering, inconsistent fonts, broken arithmetic, missing branding, and copy-paste artifacts.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, fileType, docType = "other" } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ valid: false, reason: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const docPrompt = PROMPTS[docType] ?? PROMPTS.other;
    const systemPrompt = `${docPrompt}\n\nYour task: analyze the uploaded document, decide if it is genuine, list any fraud indicators, and extract key financial data if genuine. You must call the verify_document function with your analysis.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Document type expected: ${docType}. File mime: ${fileType || "image"}. Verify authenticity, flag fraud, extract data.` },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "verify_document",
            description: "Return verification result and extracted data",
            parameters: {
              type: "object",
              properties: {
                is_genuine: { type: "boolean" },
                confidence: { type: "number", description: "0-100" },
                reason: { type: "string" },
                fraud_indicators: { type: "array", items: { type: "string" } },
                detected_document_type: { type: "string" },
                extracted_data: {
                  type: "object",
                  properties: {
                    account_holder: { type: "string" },
                    phone_number: { type: "string" },
                    statement_period: { type: "string" },
                    total_credits: { type: "number" },
                    total_debits: { type: "number" },
                    transaction_count: { type: "number" },
                    average_balance: { type: "number" },
                    currency: { type: "string" },
                    receipt_total: { type: "number" },
                    merchant: { type: "string" },
                  },
                },
              },
              required: ["is_genuine", "confidence", "reason", "detected_document_type"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "verify_document" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ valid: false, reason: "Verification service is busy. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ valid: false, reason: "Verification service unavailable (credits)." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(JSON.stringify({ valid: false, reason: "Verification temporarily unavailable.", confidence: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ valid: false, reason: "Could not verify the document.", confidence: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({
      valid: result.is_genuine,
      confidence: result.confidence,
      reason: result.reason,
      fraud_indicators: result.fraud_indicators || [],
      detected_type: result.detected_document_type,
      extracted_data: result.extracted_data || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("verify-credit-document error:", e);
    return new Response(JSON.stringify({ valid: false, reason: "Verification unavailable." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
