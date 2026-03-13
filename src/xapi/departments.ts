import { XAPIClient } from './client.js';

export interface XAPIDepartment {
  id: number;
  name: string;
}

export async function getAllDepartments(
  client: XAPIClient,
): Promise<XAPIDepartment[]> {
  const groups = await client.getGroups();
  return groups.map((g) => ({ id: g.id, name: g.name }));
}

export async function getDepartmentById(
  client: XAPIClient,
  groupId: number,
): Promise<XAPIDepartment | null> {
  const all = await getAllDepartments(client);
  return all.find((d) => d.id === groupId) ?? null;
}
