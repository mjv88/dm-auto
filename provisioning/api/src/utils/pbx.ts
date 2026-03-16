/**
 * src/utils/pbx.ts
 *
 * Shared PBX connectivity validation used by admin routes
 * and the self-service onboarding wizard.
 */

/**
 * Validates connectivity to a PBX by attempting to list its Groups.
 * Throws if the PBX is unreachable or the credentials are invalid.
 */
export async function validatePbxConnectivity(
  fqdn: string,
  authMode: 'xapi' | 'user_credentials',
  credentials: { clientId?: string; secret?: string; username?: string; password?: string },
): Promise<void> {
  if (authMode === 'xapi') {
    // Temporarily fetch a token directly to test credentials
    const tokenResp = await fetch(`https://${fqdn}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId!,
        client_secret: credentials.secret!,
      }),
    });
    if (!tokenResp.ok) {
      throw Object.assign(new Error(`PBX auth failed: HTTP ${tokenResp.status}`), {
        code: 'XAPI_AUTH_FAILED',
        statusCode: 422,
      });
    }
    const { access_token } = (await tokenResp.json()) as { access_token: string };

    // Quick Groups fetch to verify xAPI connectivity
    const groupsResp = await fetch(`https://${fqdn}/xapi/v1/Groups?$top=1`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!groupsResp.ok) {
      throw Object.assign(
        new Error(`PBX connectivity check failed: HTTP ${groupsResp.status}`),
        { code: 'PBX_UNAVAILABLE', statusCode: 422 },
      );
    }
  } else {
    // user_credentials — attempt basic auth login
    const loginResp = await fetch(`https://${fqdn}/webclient/api/Login/GetAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: credentials.username,
        Password: credentials.password,
      }),
    });
    if (!loginResp.ok) {
      throw Object.assign(new Error(`PBX user auth failed: HTTP ${loginResp.status}`), {
        code: 'XAPI_AUTH_FAILED',
        statusCode: 422,
      });
    }
  }
}
