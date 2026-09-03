export const WEB_CALLOUT_URL_CHANGE_HEADER_REQUIRED_MESSAGE =
  "Secret request headers are required when changing the web callout URL";

export function areWebCalloutUrlsEquivalent(
  firstUrl: string,
  secondUrl: string,
): boolean {
  try {
    return new URL(firstUrl).href === new URL(secondUrl).href;
  } catch {
    return firstUrl === secondUrl;
  }
}
