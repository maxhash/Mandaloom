// Canonical identity must not be derived from untrusted Host / Origin headers.
export const APP_ORIGIN = 'https://mandaloom.vercel.app';
export const MCP_RESOURCE = `${APP_ORIGIN}/mcp`;
export const MCP_METADATA = `${APP_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
export const AUTH_CHALLENGE = `Bearer resource_metadata="${MCP_METADATA}"`;
export function authorizationServer() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 if (!url) throw Error('Supabase is not configured.');
 return `${url.replace(/\/$/,'')}/auth/v1`;
}
