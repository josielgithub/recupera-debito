export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  // Embed return_path as a query param in the redirectUri so the callback can redirect correctly.
  // The SDK's decodeState() does atob(state) to get the redirectUri, which is fine.
  const callbackBase = `${window.location.origin}/api/oauth/callback`;
  const redirectUri = returnPath
    ? `${callbackBase}?return_path=${encodeURIComponent(returnPath)}`
    : callbackBase;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
