import { updatePbxSchema } from '../../../src/utils/validate.js';

describe('updatePbxSchema', () => {
  it('accepts isActive boolean', () => {
    expect(updatePbxSchema.safeParse({ isActive: true }).success).toBe(true);
  });
  it('accepts isActive false', () => {
    expect(updatePbxSchema.safeParse({ isActive: false }).success).toBe(true);
  });
  it('rejects isActive non-boolean', () => {
    expect(updatePbxSchema.safeParse({ isActive: 'yes' }).success).toBe(false);
  });
});
