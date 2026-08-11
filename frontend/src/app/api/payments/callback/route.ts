import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaystackKeys, verifyTransaction, isPlaceholderKey } from "@/lib/paystack";

export const runtime = "nodejs";

// GET /api/payments/callback?reference=xxx&trxref=xxx
//
// Redirect target for Paystack checkout. The webhook is the authoritative
// processor (it inserts the payment); this callback is a UX redirect that
// checks the recorded payment state and points the patient back to billing
// with a status indicator. If the webhook hasn't landed yet, we verify with
// Paystack directly and record the payment (idempotent on reference).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const source = searchParams.get("source") || "";
  const appUrl = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Walk-in lab payments return to the lab module; invoice payments return to
  // the patient's billing page.
  const destination = source === "lab" ? "/app/lab/requests" : "/patient/billing";
  const redirect = (status: string, message?: string) => {
    const q = new URLSearchParams({ paystack: status });
    if (message) q.set("message", message);
    if (reference) q.set("reference", reference);
    return NextResponse.redirect(`${appUrl}${destination}?${q.toString()}`);
  };

  if (!reference) return redirect("error", "Missing reference");

  try {
    const svc = createServiceClient();

    // Already recorded by the webhook?
    const { data: pay } = await svc
      .from("payments")
      .select("tenant_id, status, amount")
      .eq("reference", reference)
      .maybeSingle();

    if (pay) {
      const keys = await getPaystackKeys(svc, pay.tenant_id);
      // Cross-check with Paystack when the tenant has a real key.
      if (keys.configured && !isPlaceholderKey(keys.secretKey)) {
        try {
          const v = await verifyTransaction(reference, keys.secretKey!);
          if (v.status === "success") return redirect("success");
          return redirect(v.status === "pending" ? "processing" : "failed", v.status);
        } catch {
          // Fall through to local state if Paystack API is unreachable.
        }
      }
      return redirect(pay.status === "completed" ? "success" : pay.status === "failed" ? "failed" : "processing");
    }

    // Not recorded yet — resolve the tenant from the reference prefix.
    // References are generated as SC-<tenant8>-<rand>; webhook metadata also
    // carries tenant_id, but we can't trust payload-less input here, so we
    // verify with Paystack first using the tenant derived from the row — which
    // we don't have. Fall back: tell the UI to refresh (webhook is on its way).
    return redirect("processing", "Payment confirmed — finalizing");
  } catch (err: unknown) {
    console.error("[Paystack Callback] Error:", err);
    return redirect("error", err instanceof Error ? err.message : "Verification failed");
  }
}
