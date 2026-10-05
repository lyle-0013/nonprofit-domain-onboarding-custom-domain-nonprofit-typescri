import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const onboardingRequestSchema = z.object({
  nonprofitId: z.string().min(1),
  domain: z.string().min(3),
  receiptSender: z.string().min(1),
  volunteerReminderName: z.string().min(1),
  campaignReportLabel: z.string().min(1),
  webhookUrl: z.string().url(),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

export type Onboarding = OnboardingRequest & {
  zoneId: string;
  status: "awaiting_verification" | "active";
};

type DomainAddResult = { zone_id: string };
type RegisterResult = { id: string };
type DeleteResult = { deleted: boolean; id?: string; webhook_id?: string };

export class OnboardingStore {
  private readonly records = new Map<string, Onboarding>();

  save(record: Onboarding): void {
    this.records.set(record.domain, record);
  }

  get(domain: string): Onboarding | undefined {
    return this.records.get(domain);
  }

  activate(domain: string): Onboarding | undefined {
    const current = this.records.get(domain);
    if (!current) return undefined;
    const active = { ...current, status: "active" as const };
    this.records.set(domain, active);
    return active;
  }
}

export async function beginOnboarding(
  input: OnboardingRequest,
  client: InfraiClient,
  store: OnboardingStore,
  webhookSecret: string,
): Promise<{ onboarding: Onboarding; webhookId: string }> {
  const requestId = `nonprofit-${input.nonprofitId}-${input.domain}`;
  const domain = await client.request<DomainAddResult>({
    method: "POST",
    path: "/v1/dns/domain/add",
    body: {
      domain: input.domain,
      metadata: { nonprofit_id: input.nonprofitId },
    },
    idempotencyKey: `${requestId}-domain`,
  });

  let webhookId: string | undefined;
  try {
    await client.request<Record<string, unknown>>({
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: {
        zone_id: domain.zone_id,
        record_type: "CNAME",
        name: "donate",
        content: "donations.example.com",
        proxied: true,
        metadata: { purpose: "donation_checkout" },
      },
      idempotencyKey: `${requestId}-record`,
    });

    const webhook = await client.request<RegisterResult>({
      method: "POST",
      path: "/v1/account/webhooks/register",
      body: {
        url: input.webhookUrl,
        events: ["dns.domain.verified"],
        description: `Domain verification for ${input.nonprofitId}`,
        secret: webhookSecret,
      },
      idempotencyKey: `${requestId}-webhook`,
    });
    webhookId = webhook.id;

    await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/v1/dns/domain/verify",
      body: { domain: input.domain },
      idempotencyKey: `${requestId}-verify`,
    });
  } catch (error) {
    await deleteOnboardingResources(client, input.domain, webhookId);
    throw error;
  }

  const onboarding: Onboarding = {
    ...input,
    zoneId: domain.zone_id,
    status: "awaiting_verification",
  };
  store.save(onboarding);
  return { onboarding, webhookId };
}

export async function deleteOnboardingResources(
  client: InfraiClient,
  domain: string,
  webhookId?: string,
): Promise<void> {
  const deletions: Promise<void>[] = [];
  if (webhookId) {
    deletions.push(client.request<DeleteResult>({
      method: "DELETE",
      path: `/v1/account/webhooks/delete/${encodeURIComponent(webhookId)}`,
    }).then((result) => {
      if (!result.deleted) throw new Error(`Webhook ${webhookId} was not deleted`);
    }));
  }
  deletions.push(client.request<DeleteResult>({
    method: "DELETE",
    path: "/v1/dns/domain/delete",
    query: { domain },
  }).then((result) => {
    if (!result.deleted) throw new Error(`Domain ${domain} was not deleted`);
  }));

  const results = await Promise.allSettled(deletions);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length) throw new AggregateError(failures, "Onboarding cleanup failed");
}

export const verificationEventSchema = z.object({
  event: z.literal("dns.domain.verified"),
  data: z.object({ domain: z.string().min(3) }),
});

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = signature.replace(/^sha256=/, "");
  if (supplied.length !== expected.length || !/^[a-f0-9]+$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function acceptVerificationEvent(
  rawBody: string,
  signature: string,
  secret: string,
  store: OnboardingStore,
): Onboarding | undefined {
  if (!verifyWebhookSignature(rawBody, signature, secret)) return undefined;
  const event = verificationEventSchema.parse(JSON.parse(rawBody));
  return store.activate(event.data.domain);
}
