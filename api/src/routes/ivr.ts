/**
 * src/routes/ivr.ts
 *
 * IVR self-service routes for runners with ivrAccess enabled.
 *
 * All routes require:
 *   1. Runner authentication (authenticate preHandler)
 *   2. IVR access check (requireIvrAccess preHandler)
 *   3. Scope check — runner can only see/modify IVRs linked to their allowedDeptIds
 *
 * Routes:
 *   GET  /runner/ivrs                   — list in-scope IVRs
 *   GET  /runner/ivrs/:id               — IVR detail
 *   GET  /runner/ivrs/prompts/:filename — download prompt audio
 *   POST /runner/ivrs/:id/record        — trigger phone-based recording
 *   POST /runner/ivrs/:id/upload        — upload WAV file (base64 JSON)
 *   POST /runner/ivrs/:id/assign-prompt — assign prompt to IVR slot
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runners } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { writeAuditLog } from '../middleware/audit.js';
import { XAPIClient } from '../xapi/client.js';
import {
  parseReceptionistList,
  parseReceptionistDetail,
  parseCustomPrompts,
  buildPromptPatchBody,
  uploadCustomPrompt,
  downloadPromptFile,
} from '../xapi/ivr.js';
import type { XAPIReceptionistSummary, XAPIReceptionistDetail } from '../xapi/ivr.js';
import { ivrRecordSchema, ivrAssignPromptSchema } from '../utils/validate.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface IvrRunner {
  id: string;
  ivrAccess: boolean;
  allowedDeptIds: string[];
  extensionNumber: string;
  tenantId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * PreHandler: loads the runner from DB and checks ivrAccess.
 * Attaches the runner to `(request as any).ivrRunner`.
 */
async function requireIvrAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const session = request.runnerContext!;
  if (!session.runnerId) {
    return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: runners.id,
      ivrAccess: runners.ivrAccess,
      allowedDeptIds: runners.allowedDeptIds,
      extensionNumber: runners.extensionNumber,
      tenantId: runners.tenantId,
    })
    .from(runners)
    .where(
      and(
        eq(runners.id, session.runnerId),
        eq(runners.isActive, true),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
  }

  const runner = rows[0];
  if (!runner.ivrAccess) {
    return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
  }

  (request as any).ivrRunner = runner;
}

/**
 * Returns true if any of the IVR's groups overlap with the runner's allowedDeptIds.
 */
function ivrInScope(
  groups: Array<{ groupId: number; name: string }>,
  allowedDeptIds: string[],
): boolean {
  return groups.some((g) => allowedDeptIds.includes(String(g.groupId)));
}

/**
 * Validates WAV magic bytes: bytes 0-3 = 'RIFF', bytes 8-11 = 'WAVE'.
 */
function isValidWav(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const riff = buffer.subarray(0, 4).toString('ascii');
  const wave = buffer.subarray(8, 12).toString('ascii');
  return riff === 'RIFF' && wave === 'WAVE';
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function ivrRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /runner/ivrs ──────────────────────────────────────────────────────
  fastify.get(
    '/runner/ivrs',
    { preHandler: [authenticate, requireIvrAccess] },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      let allIvrs: XAPIReceptionistSummary[];
      try {
        const raw = await client.getReceptionists();
        allIvrs = parseReceptionistList(raw);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      const filtered = allIvrs.filter((ivr) =>
        ivrInScope(ivr.groups, runner.allowedDeptIds),
      );

      return reply.send({ ivrs: filtered });
    },
  );

  // ── GET /runner/ivrs/:id ──────────────────────────────────────────────────
  fastify.get(
    '/runner/ivrs/:id',
    { preHandler: [authenticate, requireIvrAccess] },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;
      const { id } = request.params as { id: string };

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      let detail: XAPIReceptionistDetail;
      try {
        const raw = await client.getReceptionist(parseInt(id, 10));
        detail = parseReceptionistDetail(raw as Record<string, any>);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      if (!ivrInScope(detail.groups, runner.allowedDeptIds)) {
        return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
      }

      return reply.send(detail);
    },
  );

  // ── GET /runner/ivrs/prompts/:filename ────────────────────────────────────
  fastify.get(
    '/runner/ivrs/prompts/:filename',
    { preHandler: [authenticate, requireIvrAccess] },
    async (request, reply) => {
      const session = request.runnerContext!;
      const { filename } = request.params as { filename: string };

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      let prompts: ReturnType<typeof parseCustomPrompts>;
      try {
        const raw = await client.getPrompts();
        prompts = parseCustomPrompts(raw);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      const prompt = prompts.find((p) => p.filename === filename);
      if (!prompt) {
        return reply.code(404).send({ error: 'PROMPT_NOT_FOUND' });
      }

      try {
        const { buffer, contentType } = await downloadPromptFile(
          session.pbxFqdn!,
          prompt.fileLink,
        );
        return reply.header('Content-Type', contentType).send(buffer);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }
    },
  );

  // ── GET /runner/ivrs/prompts ──────────────────────────────────────────────
  // List all custom prompts (CanBeDeleted: true only)
  fastify.get(
    '/runner/ivrs/prompts',
    { preHandler: [authenticate, requireIvrAccess] },
    async (request, reply) => {
      const session = request.runnerContext!;

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      try {
        const raw = await client.getPrompts();
        const prompts = parseCustomPrompts(raw);
        return reply.send({ prompts });
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }
    },
  );

  // ── DELETE /runner/ivrs/prompts/:filename ────────────────────────────────
  // Delete a custom prompt from the PBX
  fastify.delete(
    '/runner/ivrs/prompts/:filename',
    {
      preHandler: [authenticate, requireIvrAccess],
      config: { rateLimit: { max: 10, timeWindow: 3_600_000 } } as any,
    },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;
      const { filename } = request.params as { filename: string };

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Verify prompt exists and is deletable
      let prompts: ReturnType<typeof parseCustomPrompts>;
      try {
        const raw = await client.getPrompts();
        prompts = parseCustomPrompts(raw);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      const prompt = prompts.find((p) => p.filename === filename);
      if (!prompt) {
        return reply.code(404).send({ error: 'PROMPT_NOT_FOUND' });
      }
      if (!prompt.canBeDeleted) {
        return reply.code(403).send({ error: 'PROMPT_NOT_DELETABLE', message: 'System prompts cannot be deleted' });
      }

      // Delete via xAPI
      try {
        await client.deleteCustomPrompt(filename);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Audit
      writeAuditLog(request, {
        runnerId: runner.id,
        entraEmail: session.email ?? '',
        pbxFqdn: session.pbxFqdn ?? '',
        extensionNumber: runner.extensionNumber,
        fromDeptId: null, fromDeptName: null, toDeptId: null, toDeptName: null,
        status: 'success', errorCode: null, durationMs: 0,
        action: 'ivr_prompt_deleted',
        metadata: { filename },
      });

      return reply.code(204).send();
    },
  );

  // ── POST /runner/ivrs/:id/record ──────────────────────────────────────────
  fastify.post(
    '/runner/ivrs/:id/record',
    {
      preHandler: [authenticate, requireIvrAccess],
      config: { rateLimit: { max: 5, timeWindow: 3_600_000 } },
    },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;
      const { id } = request.params as { id: string };

      // Validate body
      const parsed = ivrRecordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.message,
        });
      }

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Get IVR detail and check scope
      let detail: XAPIReceptionistDetail;
      try {
        const raw = await client.getReceptionist(parseInt(id, 10));
        detail = parseReceptionistDetail(raw as Record<string, any>);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      if (!ivrInScope(detail.groups, runner.allowedDeptIds)) {
        return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
      }

      // Build filename and trigger recording
      const sanitizedFilename = `ivr${detail.number}-${parsed.data.filename}.wav`;

      try {
        await client.makeCallRecordPrompt(runner.extensionNumber, sanitizedFilename);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Audit
      await writeAuditLog(request, {
        runnerId:        runner.id,
        entraEmail:      session.entraEmail ?? session.email ?? '',
        pbxFqdn:         session.pbxFqdn ?? '',
        extensionNumber: runner.extensionNumber,
        fromDeptId:      null,
        fromDeptName:    null,
        toDeptId:        null,
        toDeptName:      null,
        status:          'success',
        errorCode:       null,
        durationMs:      0,
        action:          'ivr_prompt_recorded',
        metadata:        { ivrId: detail.id, ivrName: detail.name, filename: sanitizedFilename },
      });

      return reply.send({ recordingFilename: sanitizedFilename });
    },
  );

  // ── POST /runner/ivrs/:id/upload ──────────────────────────────────────────
  // Accepts JSON: { filename: string, data: string (base64-encoded WAV) }
  fastify.post(
    '/runner/ivrs/:id/upload',
    {
      preHandler: [authenticate, requireIvrAccess],
      config: { rateLimit: { max: 10, timeWindow: 3_600_000 } },
    },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;
      const { id } = request.params as { id: string };

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Get IVR detail and check scope
      let detail: XAPIReceptionistDetail;
      try {
        const raw = await client.getReceptionist(parseInt(id, 10));
        detail = parseReceptionistDetail(raw as Record<string, any>);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      if (!ivrInScope(detail.groups, runner.allowedDeptIds)) {
        return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
      }

      // Parse body — base64 JSON upload
      const body = request.body as { filename?: string; data?: string } | undefined;
      if (!body?.filename || !body?.data) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Body must include filename (string) and data (base64-encoded WAV)',
        });
      }

      // Decode base64
      let buffer: Buffer;
      try {
        buffer = Buffer.from(body.data, 'base64');
      } catch {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid base64 data',
        });
      }

      // Validate size (10 MB max)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) {
        return reply.code(400).send({
          error: 'FILE_TOO_LARGE',
          message: 'File must be 10 MB or smaller',
        });
      }

      // Validate WAV magic bytes
      if (!isValidWav(buffer)) {
        return reply.code(400).send({
          error: 'INVALID_FILE_TYPE',
          message: 'File must be a valid WAV audio file',
        });
      }

      // Sanitize base filename: strip extension, keep only safe chars
      const baseName = body.filename
        .replace(/\.wav$/i, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const uploadFilename = `ivr${detail.number}-${baseName}.wav`;

      try {
        await uploadCustomPrompt(session.pbxFqdn!, uploadFilename, buffer);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Audit
      await writeAuditLog(request, {
        runnerId:        runner.id,
        entraEmail:      session.entraEmail ?? session.email ?? '',
        pbxFqdn:         session.pbxFqdn ?? '',
        extensionNumber: runner.extensionNumber,
        fromDeptId:      null,
        fromDeptName:    null,
        toDeptId:        null,
        toDeptName:      null,
        status:          'success',
        errorCode:       null,
        durationMs:      0,
        action:          'ivr_prompt_uploaded',
        metadata:        { ivrId: detail.id, ivrName: detail.name, filename: uploadFilename, sizeBytes: buffer.length },
      });

      return reply.send({ uploadedFilename: uploadFilename });
    },
  );

  // ── POST /runner/ivrs/:id/assign-prompt ───────────────────────────────────
  fastify.post(
    '/runner/ivrs/:id/assign-prompt',
    {
      preHandler: [authenticate, requireIvrAccess],
      config: { rateLimit: { max: 20, timeWindow: 3_600_000 } },
    },
    async (request, reply) => {
      const session = request.runnerContext!;
      const runner = (request as any).ivrRunner as IvrRunner;
      const { id } = request.params as { id: string };

      // Validate body
      const parsed = ivrAssignPromptSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.message,
        });
      }
      const { promptType, filename } = parsed.data;

      let client: XAPIClient;
      try {
        client = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Get IVR detail and check scope
      let detail: XAPIReceptionistDetail;
      try {
        const raw = await client.getReceptionist(parseInt(id, 10));
        detail = parseReceptionistDetail(raw as Record<string, any>);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      if (!ivrInScope(detail.groups, runner.allowedDeptIds)) {
        return reply.code(403).send({ error: 'IVR_ACCESS_DENIED' });
      }

      // Verify prompt file exists on the PBX
      let prompts: ReturnType<typeof parseCustomPrompts>;
      try {
        const raw = await client.getPrompts();
        prompts = parseCustomPrompts(raw);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      const promptExists = prompts.some((p) => p.filename === filename);
      if (!promptExists) {
        return reply.code(400).send({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt file '${filename}' does not exist on the PBX`,
        });
      }

      // Capture previous filename from current IVR state
      let previousFilename: string | null = null;
      switch (promptType) {
        case 'main':
          previousFilename = detail.promptFilename;
          break;
        case 'offHours':
          previousFilename = detail.outOfOfficeRoute.prompt || null;
          break;
        case 'holidays':
          previousFilename = detail.holidaysRoute.prompt || null;
          break;
        case 'break':
          previousFilename = detail.breakRoute.prompt || null;
          break;
      }

      // Patch the IVR
      try {
        await client.patchReceptionist(detail.id, buildPromptPatchBody(promptType, filename));
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // Audit
      await writeAuditLog(request, {
        runnerId:        runner.id,
        entraEmail:      session.entraEmail ?? session.email ?? '',
        pbxFqdn:         session.pbxFqdn ?? '',
        extensionNumber: runner.extensionNumber,
        fromDeptId:      null,
        fromDeptName:    null,
        toDeptId:        null,
        toDeptName:      null,
        status:          'success',
        errorCode:       null,
        durationMs:      0,
        action:          'ivr_prompt_assigned',
        metadata:        {
          ivrId: detail.id,
          ivrName: detail.name,
          promptType,
          newFilename: filename,
          previousFilename,
        },
      });

      return reply.send({
        success: true,
        newFilename: filename,
        previousFilename,
      });
    },
  );
}
