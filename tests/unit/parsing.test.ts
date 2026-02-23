import { describe, expect, it } from 'vitest';
import { parseAgentOutcome } from '../../src/stages/apply/agents/parsing.js';

describe('parseAgentOutcome', () => {
  it('parses RESULT line case-insensitively', () => {
    const parsed = parseAgentOutcome('some logs\nReSuLt: applied - submitted successfully');
    expect(parsed.status).toBe('APPLIED');
    expect(parsed.submitted).toBe(true);
  });

  it('prefers JSON output when both JSON and RESULT exist', () => {
    const parsed = parseAgentOutcome('{"result":"FAILED","reason":"blocked","submitted":false}\nRESULT: APPLIED - done');
    expect(parsed.status).toBe('FAILED');
    expect(parsed.reason).toContain('blocked');
  });

  it('falls back to NEEDS_REVIEW', () => {
    const parsed = parseAgentOutcome('nonsense output');
    expect(parsed.status).toBe('NEEDS_REVIEW');
    expect(parsed.submitted).toBe(false);
  });
});
