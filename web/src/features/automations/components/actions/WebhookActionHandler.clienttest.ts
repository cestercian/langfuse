// @vitest-environment node

import { describe, expect, it } from "vitest";

import { TriggerEventSource } from "@langfuse/shared";
import { WebhookActionHandler } from "./WebhookActionHandler";

const handler = new WebhookActionHandler();

const formData = {
  webhook: {
    url: "https://example.com/hook",
    headers: [],
  },
};

const webhookFormData = (
  overrides: {
    url?: string;
    originalUrl?: string;
    headers?: {
      name: string;
      value: string;
      displayValue: string;
      isSecret: boolean;
      wasSecret: boolean;
    }[];
  } = {},
) => ({
  webhook: {
    url: overrides.url ?? "https://example.com/hook",
    originalUrl: overrides.originalUrl,
    headers: overrides.headers ?? [],
  },
});

const apiVersionFor = (eventSource?: TriggerEventSource) => {
  const config = handler.buildActionConfig(formData, eventSource);
  if (config.type !== "WEBHOOK") throw new Error("expected webhook config");
  return config.apiVersion;
};

// apiVersion is not user-editable; it is derived from the trigger's event
// source at submit time so it cannot drift when the source changes.
describe("WebhookActionHandler.buildActionConfig apiVersion", () => {
  it("monitor source: derives { monitor: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.Monitor)).toEqual({
      monitor: "v1",
    });
  });

  it("prompt source: derives { prompt: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.Prompt)).toEqual({ prompt: "v1" });
  });

  it("project-notification source: derives { project-notification: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.ProjectNotification)).toEqual({
      "project-notification": "v1",
    });
  });

  it("no eventSource: falls back to { prompt: v1 }", () => {
    expect(apiVersionFor(undefined)).toEqual({ prompt: "v1" });
  });
});

describe("WebhookActionHandler URL and secret header validation", () => {
  it("requires secret header values when the webhook URL changes", () => {
    const result = handler.validateFormData(
      webhookFormData({
        originalUrl: "https://example.com/hook",
        url: "https://example.com/other-hook",
        headers: [
          {
            name: "x-api-key",
            value: "",
            displayValue: "secr...-123",
            isSecret: true,
            wasSecret: true,
          },
        ],
      }),
    );

    expect(result).toEqual({
      isValid: false,
      errors: [
        "Secret request headers are required when changing the webhook URL",
      ],
    });
  });

  it("allows an update without secret header values for an equivalent URL", () => {
    const result = handler.validateFormData(
      webhookFormData({
        originalUrl: "https://example.com/hook",
        url: "https://example.com/hook",
        headers: [
          {
            name: "x-api-key",
            value: "",
            displayValue: "secr...-123",
            isSecret: true,
            wasSecret: true,
          },
        ],
      }),
    );

    expect(result).toEqual({ isValid: true });
  });
});
