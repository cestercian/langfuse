import { z } from "zod";

import {
  WEB_CALLOUT_BLOCKED_HEADER_NAMES,
  WEB_CALLOUT_HEADER_NAME_PATTERN,
} from "@/src/features/web-callouts/headerRules";
import {
  areWebCalloutUrlsEquivalent,
  WEB_CALLOUT_URL_CHANGE_HEADER_REQUIRED_MESSAGE,
} from "@/src/features/web-callouts/webCalloutUrl";

export const webCalloutFormSchema = z
  .object({
    id: z.string().optional(),
    originalUrl: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    url: z.url(),
    enabled: z.boolean(),
    toastMessage: z.string().trim().min(1).max(200),
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const seenHeaderNames = new Set<string>();
    const originalUrl = data.originalUrl;
    const isUrlChanged =
      typeof originalUrl === "string" &&
      originalUrl.length > 0 &&
      data.url.length > 0 &&
      !areWebCalloutUrlsEquivalent(data.url, originalUrl);

    data.headers.forEach((header, index) => {
      const name = header.name.trim();

      if (!name) {
        return;
      }

      const lowerName = name.toLowerCase();

      if (!WEB_CALLOUT_HEADER_NAME_PATTERN.test(name)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid header name.",
          path: ["headers", index, "name"],
        });
      }

      if (WEB_CALLOUT_BLOCKED_HEADER_NAMES.has(lowerName)) {
        ctx.addIssue({
          code: "custom",
          message: "This header is set by Langfuse and cannot be customized.",
          path: ["headers", index, "name"],
        });
      }

      if (seenHeaderNames.has(lowerName)) {
        ctx.addIssue({
          code: "custom",
          message: "Header names must be unique.",
          path: ["headers", index, "name"],
        });
      }

      seenHeaderNames.add(lowerName);

      if (isUrlChanged && !header.value.trim()) {
        ctx.addIssue({
          code: "custom",
          message: WEB_CALLOUT_URL_CHANGE_HEADER_REQUIRED_MESSAGE,
          path: ["headers", index, "value"],
        });
      }
    });
  });

export type WebCalloutFormValues = z.infer<typeof webCalloutFormSchema>;
