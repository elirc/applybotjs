import { z } from 'zod';
import type { ParsedOutcome, ParsedOutcomeStatus } from './base.js';

const outcomeSchema = z.object({
  result: z.string(),
  reason: z.string().optional(),
  submitted: z.boolean().optional()
});

const statuses: ParsedOutcomeStatus[] = ['APPLIED', 'FAILED', 'CAPTCHA', 'NEEDS_REVIEW', 'DRY_RUN'];

function normalizeStatus(raw: string): ParsedOutcomeStatus | null {
  const upper = raw.trim().toUpperCase();
  const found = statuses.find((status) => status === upper);
  return found ?? null;
}

function parseJsonOutcome(text: string): ParsedOutcome | null {
  const candidates: string[] = [];
  const fenceMatches = text.match(/```(?:json)?\s*([\s\S]+?)```/gi);
  if (fenceMatches) {
    for (const match of fenceMatches) {
      candidates.push(match.replace(/```(?:json)?/i, '').replace(/```/, '').trim());
    }
  }

  const lineObjects = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'));
  candidates.push(...lineObjects);

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    try {
      const parsed = outcomeSchema.parse(JSON.parse(candidate));
      const status = normalizeStatus(parsed.result);
      if (!status) {
        continue;
      }

      return {
        status,
        reason: parsed.reason?.trim() || 'No reason provided',
        submitted: parsed.submitted ?? status === 'APPLIED'
      };
    } catch {
      continue;
    }
  }

  return null;
}

function parseResultLine(text: string): ParsedOutcome | null {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    const match = line.match(/^result\s*:\s*([a-z_]+)\s*-\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const status = normalizeStatus(match[1]);
    if (!status) {
      continue;
    }

    return {
      status,
      reason: match[2].trim(),
      submitted: status === 'APPLIED'
    };
  }

  return null;
}

export function parseAgentOutcome(text: string): ParsedOutcome {
  const jsonOutcome = parseJsonOutcome(text);
  if (jsonOutcome) {
    return jsonOutcome;
  }

  const resultLine = parseResultLine(text);
  if (resultLine) {
    return resultLine;
  }

  return {
    status: 'NEEDS_REVIEW',
    reason: 'No RESULT line or valid JSON terminal output found',
    submitted: false
  };
}
