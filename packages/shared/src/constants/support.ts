/**
 * The Lucky support server.
 *
 * Lives in shared because the URL had already been copied into two places
 * (`Landing.tsx` and `Docs.tsx`), which is exactly how the invite-URL drift
 * started before it reached five divergent copies (#1888, #1894, #1923).
 *
 * The previous value pointed at `discord.gg/lucky`, a community that does
 * not belong to this project, so every visitor who clicked "support" landed
 * in a stranger's server (#2087).
 *
 * The invite is permanent by construction: it was created with
 * "Expire After: Never" and "Max Uses: No limit". A support link on the
 * top.gg listing that silently expires is the failure this constant exists
 * to prevent, so do not replace it with a time-limited invite.
 */
export const SUPPORT_SERVER_INVITE_URL = 'https://discord.gg/f2rxBWvqeR'
