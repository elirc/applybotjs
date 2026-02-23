import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import open from 'open';
import type { Command } from 'commander';
import { buildRuntimeContext } from '../shared/runtime.js';
import { getDashboardRows, getStatusCounts } from '../db/jobs.js';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dashboardHtml(summary: Awaited<ReturnType<typeof getStatusCounts>>, rows: Awaited<ReturnType<typeof getDashboardRows>>) {
  const tableRows = rows
    .map(
      (row) => `<tr>
<td>${esc(row.title)}</td>
<td><a href="${esc(row.url)}" target="_blank">${esc(row.url)}</a></td>
<td>${esc(row.source)}</td>
<td>${esc(row.fitScore)}</td>
<td>${esc(row.applyStatus)}</td>
<td>${esc(row.location)}</td>
<td>${esc(row.discoveredAt?.toISOString() ?? '')}</td>
</tr>`
    )
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Applybot Dashboard</title>
<style>
:root { --bg: #f7f5ef; --fg: #151515; --accent: #006d77; --muted: #6f6f6f; --card: #fff; }
body { margin: 0; font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif; background: linear-gradient(120deg, #f7f5ef, #e6f2f3); color: var(--fg); }
header { padding: 24px; }
h1 { margin: 0; letter-spacing: 0.4px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr)); gap: 12px; padding: 0 24px 16px; }
.card { background: var(--card); border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; }
.card .value { font-size: 24px; font-weight: 700; }
.controls { padding: 8px 24px; display: flex; gap: 10px; flex-wrap: wrap; }
input, select { padding: 8px; border-radius: 8px; border: 1px solid #c3c3c3; }
table { width: calc(100% - 48px); margin: 16px 24px 32px; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
th, td { border-bottom: 1px solid #ececec; padding: 10px; text-align: left; font-size: 13px; }
th { cursor: pointer; background: #f2f8f8; position: sticky; top: 0; }
small { color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>Applybot Dashboard</h1>
  <small>Interactive table with search, filtering, and sorting.</small>
</header>
<section class="stats">
  <div class="card"><div class="label">Total</div><div class="value">${summary.totals}</div></div>
  <div class="card"><div class="label">Pending Enrichment</div><div class="value">${summary.pendingEnrichment}</div></div>
  <div class="card"><div class="label">Scored</div><div class="value">${summary.scored}</div></div>
  <div class="card"><div class="label">Ready To Apply</div><div class="value">${summary.readyToApply}</div></div>
  <div class="card"><div class="label">Applied</div><div class="value">${summary.applied}</div></div>
  <div class="card"><div class="label">Apply Failures</div><div class="value">${summary.applyFailures}</div></div>
</section>
<div class="controls">
  <input id="search" placeholder="Search title/url/location" />
  <select id="statusFilter">
    <option value="">All statuses</option>
    <option>APPLIED</option><option>FAILED</option><option>CAPTCHA</option><option>NEEDS_REVIEW</option><option>DRY_RUN</option><option>RUNNING</option>
  </select>
  <select id="sourceFilter">
    <option value="">All sources</option>
    ${summary.perSource.map((item) => `<option>${esc(item.source ?? 'unknown')}</option>`).join('')}
  </select>
</div>
<table id="jobsTable">
  <thead>
    <tr>
      <th data-key="0">Title</th>
      <th data-key="1">URL</th>
      <th data-key="2">Source</th>
      <th data-key="3">Fit</th>
      <th data-key="4">Status</th>
      <th data-key="5">Location</th>
      <th data-key="6">Discovered</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<script>
const search = document.getElementById('search');
const statusFilter = document.getElementById('statusFilter');
const sourceFilter = document.getElementById('sourceFilter');
const tbody = document.querySelector('#jobsTable tbody');
let sortState = { index: 6, dir: 'desc' };

function valueAt(row, idx) {
  return row.children[idx].innerText.trim().toLowerCase();
}

function applyFilters() {
  const term = search.value.trim().toLowerCase();
  const status = statusFilter.value.trim().toLowerCase();
  const source = sourceFilter.value.trim().toLowerCase();
  const rows = [...tbody.querySelectorAll('tr')];

  for (const row of rows) {
    const haystack = [0,1,5].map((i) => valueAt(row, i)).join(' ');
    const rowStatus = valueAt(row, 4);
    const rowSource = valueAt(row, 2);
    const visible = (!term || haystack.includes(term)) && (!status || rowStatus === status) && (!source || rowSource === source);
    row.style.display = visible ? '' : 'none';
  }
}

function sortRows(index) {
  if (sortState.index === index) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState = { index, dir: 'asc' };
  }

  const rows = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const av = valueAt(a, index);
    const bv = valueAt(b, index);
    if (av < bv) return sortState.dir === 'asc' ? -1 : 1;
    if (av > bv) return sortState.dir === 'asc' ? 1 : -1;
    return 0;
  });
  rows.forEach((row) => tbody.appendChild(row));
}

search.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);
sourceFilter.addEventListener('change', applyFilters);
for (const th of document.querySelectorAll('th[data-key]')) {
  th.addEventListener('click', () => sortRows(Number(th.dataset.key)));
}
sortRows(6);
applyFilters();
</script>
</body>
</html>`;
}

export function registerDashboardCommand(program: Command) {
  program
    .command('dashboard')
    .description('Generate static HTML dashboard and open it in the browser')
    .action(async () => {
      const ctx = await buildRuntimeContext('dashboard');
      const summary = await getStatusCounts(ctx.db);
      const rows = await getDashboardRows(ctx.db);

      await mkdir(ctx.paths.dashboardDir, { recursive: true });
      const htmlPath = join(ctx.paths.dashboardDir, 'index.html');
      await writeFile(htmlPath, dashboardHtml(summary, rows), 'utf8');

      await open(htmlPath);
      console.log(`Dashboard generated: ${htmlPath}`);
    });
}
