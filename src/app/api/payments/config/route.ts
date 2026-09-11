import { availablePaymentMethods, isTestMode, paymentsConfigured, razorpaySecrets } from "@/lib/payments/config";

export const dynamic = "force-dynamic";

/**
 * What payment options this deploy can actually honour.
 *
 * The checkout page asks this instead of assuming, so an unconfigured deploy
 * renders a Cash on Delivery-only checkout rather than an online payment
 * button that fails when tapped.
 *
 * The key id is served from here rather than inlined as a NEXT_PUBLIC_ build
 * variable for two reasons: rotating the key becomes a restart instead of a
 * rebuild-and-redeploy, and there is no risk of someone later adding the key
 * *secret* next to it under the same public prefix and shipping it to every
 * browser. Only the id is returned — never the secret, never the webhook
 * secret.
 */
export async function GET() {
  const configured = paymentsConfigured();
  return Response.json(
    {
      online: configured,
      // Safe to expose: the gateway's own checkout script requires it, and it
      // cannot authorise anything without the secret that stays on the server.
      keyId: configured ? razorpaySecrets().keyId : "",
      testMode: configured && isTestMode(),
      methods: availablePaymentMethods(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
