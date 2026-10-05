import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  acceptVerificationEvent,
  OnboardingStore,
  type Onboarding,
} from "../src/onboarding_workflow.js";

test("a signed verification event activates donation checkout onboarding", () => {
  const secret = "unit-test-webhook-secret";
  const store = new OnboardingStore();
  const pending: Onboarding = {
    nonprofitId: "river-food-bank",
    domain: "give.riverfoodbank.org",
    receiptSender: "receipts@riverfoodbank.org",
    volunteerReminderName: "Saturday packing shift",
    campaignReportLabel: "Autumn pantry drive",
    webhookUrl: "https://backend.riverfoodbank.org/webhooks/infrai",
    zoneId: "zone_test_123",
    status: "awaiting_verification",
  };
  store.save(pending);

  const rawBody = JSON.stringify({
    event: "dns.domain.verified",
    data: { domain: pending.domain },
  });
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

  const result = acceptVerificationEvent(rawBody, `sha256=${signature}`, secret, store);

  assert.equal(result?.status, "active");
  assert.equal(store.get(pending.domain)?.campaignReportLabel, "Autumn pantry drive");
});

test("an invalidly signed event leaves onboarding waiting", () => {
  const store = new OnboardingStore();
  const rawBody = JSON.stringify({
    event: "dns.domain.verified",
    data: { domain: "give.riverfoodbank.org" },
  });

  const result = acceptVerificationEvent(rawBody, "g".repeat(64), "secret", store);

  assert.equal(result, undefined);
});
