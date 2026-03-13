/**
 * tests/audit/audit.test.ts
 *
 * Unit tests for writeAuditLog (src/middleware/audit.ts).
 *
 * Coverage:
 *   - Successful switch writes the correct audit row to the DB
 *   - Failed switch writes a failure row with the error code populated
 *   - A DB error inside writeAuditLog does NOT cause the caller to reject
 *   - The Intune device ID is captured from the x-intune-device-id header
 */

import type { FastifyRequest } from 'fastify';

jest.mock('../../src/db/index', () => ({ getDb: jest.fn() }));

import { getDb }         from '../../src/db/index';
import { writeAuditLog } from '../../src/middleware/audit';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(headerOverrides: Record<string, string> = {}): FastifyRequest {
  return {
    ip:      '10.0.0.1',
    headers: { 'user-agent': 'TestRunner/1.0', ...headerOverrides },
  } as unknown as FastifyRequest;
}

function makeDbMock(opts: { rejectWith?: Error } = {}) {
  const valuesFn = opts.rejectWith
    ? jest.fn().mockRejectedValue(opts.rejectWith)
    : jest.fn().mockResolvedValue([]);
  const insertFn = jest.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, db: { insert: insertFn } };
}

/** Flush all pending setImmediate callbacks. */
function flushSetImmediate(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve));
}

const baseParams = {
  runnerId:        'runner-uuid-0001',
  entraEmail:      'runner@company.com',
  pbxFqdn:         'pbx.company.com',
  extensionNumber: '101',
  fromDeptId:      '3',
  fromDeptName:    'Sales',
  toDeptId:        '7',
  toDeptName:      'Support',
  status:          'success' as const,
  errorCode:       null,
  durationMs:      142,
};

beforeEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeAuditLog', () => {

  it('writes correct audit row on a successful switch', async () => {
    const { insertFn, valuesFn, db } = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(db);

    await writeAuditLog(makeRequest(), baseParams);
    await flushSetImmediate();

    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerId:        'runner-uuid-0001',
        entraEmail:      'runner@company.com',
        pbxFqdn:         'pbx.company.com',
        extensionNumber: '101',
        fromDeptId:      '3',
        toDeptId:        '7',
        status:          'success',
        errorMessage:    null,
        durationMs:      142,
      }),
    );
  });

  it('writes failure row with errorCode mapped to errorMessage', async () => {
    const { insertFn, valuesFn, db } = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(db);

    await writeAuditLog(makeRequest(), {
      ...baseParams,
      status:    'failed',
      errorCode: 'PBX_UNAVAILABLE',
      fromDeptId: '3',
      toDeptId:   '7',
    });
    await flushSetImmediate();

    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status:       'failed',
        errorMessage: 'PBX_UNAVAILABLE',
      }),
    );
  });

  it('resolves without throwing even when the DB write fails', async () => {
    const { db } = makeDbMock({ rejectWith: new Error('DB connection lost') });
    (getDb as jest.Mock).mockReturnValue(db);

    // Must resolve (not reject) regardless of DB error
    await expect(writeAuditLog(makeRequest(), baseParams)).resolves.toBeUndefined();

    // Flush the setImmediate — the rejection must be swallowed, not re-thrown
    await flushSetImmediate();
    // No assertion needed beyond "no unhandled rejection was propagated"
  });

  it('captures the Intune device ID from the x-intune-device-id header', async () => {
    const { valuesFn, db } = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(db);

    await writeAuditLog(
      makeRequest({ 'x-intune-device-id': 'intune-device-abc123' }),
      baseParams,
    );
    await flushSetImmediate();

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'intune-device-abc123' }),
    );
  });

  it('writes ipAddress and userAgent from request headers', async () => {
    const { valuesFn, db } = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(db);

    await writeAuditLog(makeRequest(), baseParams);
    await flushSetImmediate();

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '10.0.0.1',
        userAgent: 'TestRunner/1.0',
      }),
    );
  });

  it('writes fromDeptName and toDeptName to the audit row', async () => {
    const { valuesFn, db } = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(db);

    await writeAuditLog(makeRequest(), baseParams);
    await flushSetImmediate();

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDeptName: 'Sales',
        toDeptName:   'Support',
      }),
    );
  });

});
