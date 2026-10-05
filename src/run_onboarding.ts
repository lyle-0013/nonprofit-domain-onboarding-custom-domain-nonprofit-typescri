import { randomUUID } from "node:crypto";
import { createInfraiClient } from "./infrai_client.js";
import { deleteOnboardingResources } from "./onboarding_workflow.js";

const runId = randomUUID();
const domain = `codecheck-${runId}.example.com`;
const onboardingBaseUrl = process.env.ONBOARDING_BASE_URL ?? "http://localhost:3000";
let webhookId: string | undefined;

try {
  const response = await fetch(new URL("/nonprofits/onboard", onboardingBaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonprofitId: `codecheck-${runId}`,
      domain,
      receiptSender: "receipts@example.com",
      volunteerReminderName: "Example volunteer shift",
      campaignReportLabel: "Example campaign",
      webhookUrl: `https://example.com/webhooks/infrai/${runId}`,
    }),
  });
  const result = await response.json() as { webhookId?: string };
  if (!response.ok) throw new Error(`Onboarding failed (${response.status}): ${JSON.stringify(result)}`);
  webhookId = result.webhookId;
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (webhookId) {
    await deleteOnboardingResources(createInfraiClient(), domain, webhookId);
    console.log(JSON.stringify({ cleanedUp: { domain, webhookId } }, null, 2));
  }
}
