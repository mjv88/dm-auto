import type { FastifyInstance } from 'fastify';
import { extensionRoutes } from './extensions.js';
import { statsRoutes } from './stats.js';
import { adminPbxRoutes } from './pbx.js';
import { adminUserRoutes } from './users.js';
import { adminTenantRoutes } from './tenants.js';
import { adminProvisionRoutes } from './provision.js';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(extensionRoutes);
  await fastify.register(statsRoutes);
  await fastify.register(adminPbxRoutes);
  await fastify.register(adminUserRoutes);
  await fastify.register(adminTenantRoutes);
  await fastify.register(adminProvisionRoutes);
}
