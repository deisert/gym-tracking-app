/** What the client knows about how it is being displayed. Passed in rather
 *  than read here, so this module stays free of DOM globals. */
export type DisplayEnvironment = {
  isIOS: boolean;
  isStandalone: boolean;
};

/**
 * True when following a magic link would leave the user logged out.
 *
 * An installed iOS PWA keeps a cookie jar separate from Safari's. The link in
 * the email opens in Safari, so the session is created there and the installed
 * app never sees it — the user taps the link, sees "logged in", returns to the
 * app and is still at the login screen, with nothing on screen explaining why.
 * Other platforms share cookies between the installed app and the browser, so
 * the round trip completes normally there.
 */
export function magicLinkWillStrand(env: DisplayEnvironment): boolean {
  return env.isIOS && env.isStandalone;
}
