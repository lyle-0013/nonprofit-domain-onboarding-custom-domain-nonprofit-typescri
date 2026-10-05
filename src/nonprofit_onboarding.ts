import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client.js";
import {
  acceptVerificationEvent,
  beginOnboarding,
  onboardingRequestSchema,
  OnboardingStore,
} from "./onboarding_workflow.js";

const client = createInfraiClient();
const store = new OnboardingStore();
const webhookSecret = process.env.INFRAI_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("Set INFRAI_WEBHOOK_SECRET before starting the service");

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/nonprofits/onboard") {
      const input = onboardingRequestSchema.parse(JSON.parse(await readBody(request)));
      const result = await beginOnboarding(input, client, store, webhookSecret);
      json(response, 202, result);
      return;
    }

    if (request.method === "POST" && request.url === "/webhooks/infrai") {
      const rawBody = await readBody(request);
      const signature = request.headers["x-infrai-signature"];
      if (typeof signature !== "string") {
        json(response, 401, { error: "Missing webhook signature" });
        return;
      }
      const onboarding = acceptVerificationEvent(rawBody, signature, webhookSecret, store);
      if (!onboarding) {
        json(response, 401, { error: "Invalid signature or unknown domain" });
        return;
      }
      json(response, 200, { status: onboarding.status, domain: onboarding.domain });
      return;
    }

    json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        message: error.message,
      });
      return;
    }
    json(response, 500, { error: "Request could not be completed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Nonprofit onboarding listening on http://localhost:${port}`));
