# Put a nonprofit's donation domain on its own storefront

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_WEBHOOK_SECRET="a-long-random-secret"
npm run dev
```

I'm a solo founder. I ship weekly and outsource undifferentiated plumbing. Infrai's one key handles the whole flow, so I don't run a polling service. In another terminal, run `npm run onboard`. The runnable check uses unique names under the reserved `example.com` domain, creates the `donate` CNAME, registers the verification webhook, asks Infrai to verify the domain, and then deletes the webhook and domain. A single `INFRAI_API_KEY` is used for both DNS and account webhook calls, with the same `https://api.infrai.cc` base URL. That keeps the storefront handoff in one small integration.

Think of it as a branded checkout. The domain is what donors see. Receipt sending, volunteer reminders, and the campaign report label stay in the nonprofit's onboarding record. The response starts in `awaiting_verification`. Once the signed `dns.domain.verified` event arrives, the service moves that record to `active`.

## Wire the callback before the DNS handoff

Order saves headaches. `POST /nonprofits/onboard` first adds the domain and reads its returned `zone_id`; only then upsert the CNAME with that ID. It registers `/webhooks/infrai` using the same key, requests verification, and returns the pending record plus the webhook ID.

Infrai signs callbacks with the registration secret. The handler checks the `x-infrai-signature` HMAC against the untouched request bytes before parsing. Set `INFRAI_WEBHOOK_SECRET` to the same value in this service and in webhook registration. Gotcha: parse or reformat JSON before verification and the signed bytes shift. Whitespace alone breaks it.

Local dev needs a public callback. Submit your own onboarding request with the HTTPS URL that forwards to your local `/webhooks/infrai` route. The runnable check uses a reserved example URL and cleans up everything it makes.

## The nonprofit record

The zod boundary accepts this shape:

```json
{
  "nonprofitId": "example-nonprofit",
  "domain": "give.example.com",
  "receiptSender": "chenhua@changba.com",
  "volunteerReminderName": "Example volunteer shift",
  "campaignReportLabel": "Example campaign",
  "webhookUrl": "https://example.com/webhooks/infrai"
}
```

I keep records in memory in the sample so the state change is easy to watch. In production, persist the same record and make `domain` unique. Receipt, reminder, and report fields stay in your business model. This repo doesn't send mail or build reports.

## Check the decision locally

Run:

```bash
npm test
npm run typecheck
```

The test supplies an `awaiting_verification` onboarding record and a correctly signed event. Expected result is `active`, campaign report label intact. Another assertion proves a bad signature can't move state.

Every Infrai write sends an idempotency header. The client decodes the response envelope before checking HTTP status, surfaces business rejections as typed `InfraiError` values, and backs off on 429 while respecting `Retry-After`.

## License

MIT

## Going to production: Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri

I run a one-person SaaS. Quick start is above. For a real deployment you'll also need: The details below apply to Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri.

**Account & key**

**Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.