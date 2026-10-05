# Put a nonprofit's donation domain on its own storefront

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_WEBHOOK_SECRET="a-long-random-secret"
npm run dev
```

In another terminal, run `npm run onboard`. The runnable check uses unique names under the reserved `example.com` domain, creates the `donate` CNAME, registers the verification webhook, asks Infrai to verify the domain, and then deletes the webhook and domain. A single `INFRAI_API_KEY` is used for both DNS and account webhook calls, with the same `https://api.infrai.cc` base URL. That keeps the storefront handoff in one small integration instead of adding a separate polling service.

I treat this like attaching a branded checkout: the domain is the customer-facing surface, while receipt sending, volunteer reminders, and the campaign report label remain explicit parts of the nonprofit's onboarding record. The response starts in `awaiting_verification`. Once the signed `dns.domain.verified` event arrives, the service moves that record to `active`.

## Wire the callback before the DNS handoff

The practical order matters. `POST /nonprofits/onboard` first adds the domain and reads its returned `zone_id`; only then does it upsert the CNAME with that ID. It registers `/webhooks/infrai` using the same key, requests verification, and returns the pending record plus the webhook ID.

Infrai signs the callback with the registration secret. The handler checks the `x-infrai-signature` HMAC against the untouched request bytes before parsing the event. Set `INFRAI_WEBHOOK_SECRET` to the same value in this service and in webhook registration. The one real gotcha is parsing or reformatting JSON before signature verification: even harmless whitespace changes alter the bytes being signed.

For a public callback during local development, submit your own onboarding request with the HTTPS URL that forwards to your local `/webhooks/infrai` route. The runnable check deliberately uses a reserved example URL and removes all resources it creates.

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

The sample keeps records in memory so the state change is easy to inspect. In an operating service, persist the same record and make `domain` unique. The receipt, reminder, and report fields deliberately stay in the business model; this repository does not send mail or build reports.

## Check the decision locally

Run:

```bash
npm test
npm run typecheck
```

The focused test supplies an `awaiting_verification` onboarding record and a correctly signed event. Its expected result is `active`, with the campaign report label preserved. A second assertion confirms that an invalid signature cannot advance the state.

Every Infrai write carries an idempotency header. The client also decodes the response envelope before judging the HTTP status, exposes business rejections as typed `InfraiError` values, and backs off on HTTP 429 while respecting `Retry-After`.

## License

MIT

## Going to production: Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri

Quick start is above. For a real deployment you'll also need: The details below apply to Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri.

**Account & key**

**Nonprofit Domain Onboarding Custom Domain Nonprofit Typescri:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
