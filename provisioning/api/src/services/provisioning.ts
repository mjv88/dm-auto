import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxExtensions, pbxCredentials, auditLog } from '../db/schema.js';
import { XAPIClient } from '../xapi/client.js';
import { getXAPIToken } from '../xapi/auth.js';
import { encrypt, decrypt } from '../utils/encrypt.js';

export async function provisionExtension(
  extensionId: string,
  adminEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  // Concurrency guard: lock row, check status
  const ext = await db.select().from(pbxExtensions).where(eq(pbxExtensions.id, extensionId)).limit(1);
  if (!ext[0]) return { success: false, error: 'Extension not found' };
  if (ext[0].provisioningStatus === 'provisioning' || ext[0].provisioningStatus === 'fetched') {
    return { success: false, error: 'Already provisioned or in progress' };
  }
  if (!ext[0].pbxUserId) return { success: false, error: 'No PBX user ID' };

  // Set status to provisioning
  await db.update(pbxExtensions).set({ provisioningStatus: 'provisioning', updatedAt: new Date() }).where(eq(pbxExtensions.id, extensionId));

  // Audit log
  await db.insert(auditLog).values({ userEmail: adminEmail, action: 'provision.triggered', targetType: 'extension', targetId: extensionId });

  try {
    // Get PBX info
    const pbx = await db.select().from(pbxCredentials).where(eq(pbxCredentials.id, ext[0].pbxCredentialId)).limit(1);
    if (!pbx[0]) throw new Error('PBX not found');

    const token = await getXAPIToken(pbx[0].pbxFqdn);

    // Step 1: GenerateProvLink
    const genRes = await fetch(
      `https://${pbx[0].pbxFqdn}/xapi/v1/Users(${ext[0].pbxUserId})/Pbx.GenerateProvLink()`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!genRes.ok) throw new Error(`GenerateProvLink failed: HTTP ${genRes.status}`);
    const { value: oneTimePath } = await genRes.json() as { value: string };

    // Step 2: Fetch bootstrap XML
    const xmlRes = await fetch(`https://${pbx[0].pbxFqdn}${oneTimePath}`);
    if (!xmlRes.ok) throw new Error(`XML fetch failed: HTTP ${xmlRes.status}`);
    const xml = await xmlRes.text();

    // Step 3: Parse ProvLinkExternal
    const match = xml.match(/<ProvLinkExternal>(.*?)<\/ProvLinkExternal>/);
    if (!match?.[1]) throw new Error('ProvLinkExternal not found in XML');

    const provLinkExternal = match[1];

    // Store encrypted (both the link and the full XML config)
    await db.update(pbxExtensions).set({
      provLinkExternal: encrypt(provLinkExternal),
      provConfigXml: encrypt(xml),
      provLinkFetchedAt: new Date(),
      provisioningStatus: 'fetched',
      provisioningError: null,
      updatedAt: new Date(),
    }).where(eq(pbxExtensions.id, extensionId));

    await db.insert(auditLog).values({ userEmail: adminEmail, action: 'provision.success', targetType: 'extension', targetId: extensionId });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await db.update(pbxExtensions).set({
      provisioningStatus: 'error',
      provisioningError: message,
      updatedAt: new Date(),
    }).where(eq(pbxExtensions.id, extensionId));

    await db.insert(auditLog).values({ userEmail: adminEmail, action: 'provision.failed', targetType: 'extension', targetId: extensionId, details: JSON.stringify({ error: message }) });
    return { success: false, error: message };
  }
}
