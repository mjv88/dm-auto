import { XAPIClient } from './client.js';

export interface XAPIUser {
  id: number;
  number: string;
  emailAddress: string;
  currentGroupId: number;
}

export async function getUserByExtension(
  client: XAPIClient,
  extensionNumber: string,
): Promise<XAPIUser> {
  const result = await client.getUserByNumber(extensionNumber);
  return {
    id: result.userId,
    number: extensionNumber,
    emailAddress: result.emailAddress,
    currentGroupId: result.currentGroupId,
  };
}

export async function switchExtensionDepartment(
  client: XAPIClient,
  userId: number,
  targetGroupId: number,
): Promise<void> {
  await client.patchUserGroup(userId, targetGroupId);
}
