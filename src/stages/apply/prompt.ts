import type { Job } from '../../db/schema.js';
import type { ApplybotProfile } from '../../config/schema.js';

interface BuildPromptOptions {
  job: Job;
  profile: ApplybotProfile;
  dryRun: boolean;
  domainAllowlist: string[];
  minDelaySeconds: number;
  resumePdfPath?: string | null;
  coverPdfPath?: string | null;
}

export function buildApplyPrompt(options: BuildPromptOptions): string {
  const allowlist = options.domainAllowlist.length > 0 ? options.domainAllowlist.join(', ') : '(none)';

  return `You are Applybot's autonomous job application agent.

GOAL
- Complete this single job application workflow accurately and safely.

JOB
- URL: ${options.job.applicationUrl ?? options.job.url}
- Canonical URL: ${options.job.url}
- Title: ${options.job.title}
- Location: ${options.job.location ?? 'unknown'}
- Resume PDF: ${options.resumePdfPath ?? 'not available'}
- Cover PDF: ${options.coverPdfPath ?? 'not available'}

CANDIDATE PROFILE JSON
${JSON.stringify(options.profile, null, 2)}

RULES
- Respect domain allowlist: ${allowlist}
- If navigation leaves allowlist, stop and return NEEDS_REVIEW.
- Wait at least ${options.minDelaySeconds} seconds between significant actions.
- Fill forms truthfully from profile data.
- If blocked by CAPTCHA, return CAPTCHA.
- If missing required information, return NEEDS_REVIEW with reason.
- ${options.dryRun ? 'DRY RUN ACTIVE: never click final submit. Simulate full flow, then return DRY_RUN.' : 'Submit only once when all required fields are complete.'}

OUTPUT CONTRACT
Return exactly one of:
1) RESULT: <APPLIED|FAILED|CAPTCHA|NEEDS_REVIEW|DRY_RUN> - <short_reason>
2) {"result":"APPLIED|FAILED|CAPTCHA|NEEDS_REVIEW|DRY_RUN","reason":"short_reason","submitted":true|false}

The final line MUST be the RESULT line or JSON object.`;
}
