// @vitest-environment node

import { describe, expect, it } from "vitest";

import { webCalloutFormSchema } from "./webCalloutFormSchema";
import { WEB_CALLOUT_URL_CHANGE_HEADER_REQUIRED_MESSAGE } from "./webCalloutUrl";

const formValues = (
  overrides: {
    url?: string;
    originalUrl?: string;
    headers?: { name: string; value: string }[];
  } = {},
) => ({
  name: "Default",
  url: overrides.url ?? "https://example.com/callout",
  originalUrl: overrides.originalUrl,
  enabled: true,
  toastMessage: "Callout sent",
  headers: overrides.headers ?? [],
});

describe("webCalloutFormSchema URL and secret header validation", () => {
  it("requires secret header values when the web callout URL changes", () => {
    const result = webCalloutFormSchema.safeParse(
      formValues({
        originalUrl: "https://example.com/callout",
        url: "https://attacker.example/callout",
        headers: [{ name: "Authorization", value: "" }],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: WEB_CALLOUT_URL_CHANGE_HEADER_REQUIRED_MESSAGE,
          path: ["headers", 0, "value"],
        }),
      ]),
    );
  });

  it("allows blank existing header values for an equivalent URL", () => {
    const result = webCalloutFormSchema.safeParse(
      formValues({
        originalUrl: "https://example.com/callout",
        url: "https://example.com:443/callout",
        headers: [{ name: "Authorization", value: "" }],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("allows a URL change when secret headers are removed", () => {
    const result = webCalloutFormSchema.safeParse(
      formValues({
        originalUrl: "https://example.com/callout",
        url: "https://attacker.example/callout",
        headers: [],
      }),
    );

    expect(result.success).toBe(true);
  });
});
