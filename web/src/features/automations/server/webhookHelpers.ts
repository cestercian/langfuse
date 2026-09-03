import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";
import {
  type ActionCreate,
  type ActionConfig,
  type WebhookActionConfigWithSecrets,
  type WebhookActionCreate,
  isWebhookActionConfig,
} from "@langfuse/shared";
import {
  getActionByIdWithSecrets,
  mergeHeaders,
  createDisplayHeaders,
  encryptSecretHeaders,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { areWebhookUrlsEquivalent } from "../webhookUrl";

interface WebhookConfigOptions {
  actionConfig: ActionCreate;
  actionId?: string;
  projectId: string;
}

export async function processWebhookActionConfig({
  actionConfig,
  actionId,
  projectId,
}: WebhookConfigOptions): Promise<{
  finalActionConfig: ActionConfig;
  newUnencryptedWebhookSecret?: string; // For one-time display
}> {
  if (actionConfig.type !== "WEBHOOK") {
    throw new Error("Action type is not WEBHOOK");
  }

  const existingAction = actionId
    ? ((await getActionByIdWithSecrets({
        projectId: projectId!,
        actionId,
      })) ?? undefined)
    : undefined;

  let existingActionConfig: WebhookActionConfigWithSecrets | undefined;
  if (existingAction) {
    if (!isWebhookActionConfig(existingAction.config)) {
      throw new Error(
        `Existing action ${actionId} does not have valid webhook configuration`,
      );
    }
    existingActionConfig = existingAction.config;
  }

  try {
    await validateWebhookURL(actionConfig.url);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid webhook URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }

  const { secretKey: newSecretKey, displaySecretKey: newDisplaySecretKey } =
    generateWebhookSecret();

  const isUrlChanged =
    existingActionConfig !== undefined &&
    !areWebhookUrlsEquivalent(actionConfig.url, existingActionConfig.url);

  // Process headers and generate final action config
  const finalActionConfig = processWebhookHeaders(
    actionConfig,
    existingActionConfig,
    isUrlChanged,
  );
  return {
    finalActionConfig: {
      ...finalActionConfig,
      secretKey: existingActionConfig?.secretKey ?? encrypt(newSecretKey),
      displaySecretKey:
        existingActionConfig?.displaySecretKey ?? newDisplaySecretKey,
    },
    newUnencryptedWebhookSecret: existingActionConfig?.secretKey
      ? undefined
      : newSecretKey,
  };
}

/**
 * Processes webhook headers by:
 * 1. Merging legacy headers with new requestHeaders
 * 2. Handling header removal (headers not in input are removed)
 * 3. Preserving existing values when empty values are submitted
 * 4. Rejecting reuse of secret headers when the destination URL changes
 * 5. Encrypting secret headers based on secret flag
 * 6. Generating display values for secret headers
 */
function processWebhookHeaders(
  actionConfig: WebhookActionCreate,
  existingConfig: WebhookActionConfigWithSecrets | undefined,
  isUrlChanged: boolean,
): WebhookActionConfigWithSecrets {
  // Get existing headers for comparison
  const existingLegacyHeaders = existingConfig?.headers ?? {}; // legacy headers
  const existingRequestHeaders = existingConfig?.requestHeaders ?? {}; // new headers
  const mergedExistingHeaders = mergeHeaders(
    existingLegacyHeaders,
    existingRequestHeaders,
  );

  // Process new headers from input
  const inputRequestHeaders = actionConfig.requestHeaders || {};

  // Start with empty headers - only include what's in the input
  const finalRequestHeaders: Record<
    string,
    { secret: boolean; value: string }
  > = {};

  const hasExistingSecretHeaders = Object.values(mergedExistingHeaders).some(
    (header) => header.secret,
  );

  // If no headers are provided in input, preserve existing headers.
  // Secret headers cannot be preserved across a URL change.
  if (Object.keys(inputRequestHeaders).length === 0) {
    if (isUrlChanged && hasExistingSecretHeaders) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Secret request headers are required when changing the webhook URL",
      });
    }
    for (const [key, headerObj] of Object.entries(mergedExistingHeaders)) {
      finalRequestHeaders[key] = headerObj;
    }
  } else {
    // Process each header from input
    for (const [key, headerObj] of Object.entries(inputRequestHeaders)) {
      const existingHeader = mergedExistingHeaders[key];

      // Validate secret toggle: can only change secret status when providing a value
      if (
        headerObj.secret &&
        headerObj.value.trim() === "" &&
        !existingHeader
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Header "${key}" cannot be made secret without providing a value`,
        });
      }

      // If changing secret status, ensure a value is provided
      if (
        existingHeader &&
        headerObj.secret !== existingHeader.secret &&
        headerObj.value.trim() === ""
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Header "${key}" secret status can only be changed when providing a value`,
        });
      }

      // If value is empty, preserve existing value if it exists
      if (headerObj.value.trim() === "" && existingHeader) {
        if (isUrlChanged && existingHeader.secret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Secret request headers are required when changing the webhook URL",
          });
        }
        finalRequestHeaders[key] = existingHeader;
      } else if (headerObj.value.trim() !== "") {
        // Only process non-empty values
        finalRequestHeaders[key] = headerObj;
      }
      // If value is empty and no existing header, skip it (effectively removing it)
    }
  }

  return {
    ...actionConfig,
    headers: {}, // remove legacy headers on write
    requestHeaders: encryptSecretHeaders(finalRequestHeaders),
    displayHeaders: createDisplayHeaders(finalRequestHeaders),
    secretKey: "", // will be overwritten by the caller
    displaySecretKey: "", // will be overwritten by the caller
    lastFailingExecutionId: existingConfig?.lastFailingExecutionId,
  };
}
