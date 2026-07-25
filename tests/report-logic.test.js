/**
 * Regression tests for the report/print status logic in index.html.
 *
 * These run against the REAL source (extracted directly from index.html
 * on every run, see extract.js) rather than a hand-copied snapshot, so
 * they catch drift/regressions in the shipped file itself.
 */
const path = require('path');
const { buildHarness } = require('./extract');

const FUNCTION_NAMES = [
  'n', 'fmt', 'pct', 'esc', 'periodById', 'reportsForProgram', 'priorReports',
  'outcomeQuarterNumerator', 'outcomeQuarterState', 'outcomeYtdStatus',
  'outcomeSuggestedStatus', 'finalOutcomeStatus', 'ytdService', 'ytdOutcome',
  'ytdAccess', 'serviceSuggestedStatus', 'finalServiceStatus',
  'printOutcomeQuarterState', 'printOutcomeYtdState', 'printOutcomeCell',
  'printOverallPerformance', 'printOverallBadge', 'printBadge',
  'printSummaryCards', 'printSummaryCardsHtml', 'printServiceUnitLabel',
  'printFilename', 'cyShortLabel', 'longDate', 'cleanDisplayName',
  'cssStringEscape', 'printExpectedFraction', 'printIsQ1', 'serviceYearForReport'
];
const CONST_NAMES = ['PERIODS', 'PRINT_STATUS_META', 'PRINT_OVERALL_META', 'SERVICE_UNIT_LABELS'];

const indexPath = path.join(__dirname, '..', 'index.html');
const harnessSrc = buildHarness(indexPath, FUNCTION_NAMES, CONST_NAMES);

global.state = { db: { reports: [] } };
eval(harnessSrc);

let pass = 0, fail = 0;
function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log('FAIL:', label, '\n  expected:', JSON.stringify(expected), '\n  actual:  ', JSON.stringify(actual)); }
}
function assertTrue(cond, label) {
  if (cond) { pass++; } else { fail++; console.log('FAIL:', label); }
}

// ---- Build synthetic reports across Q1-Q4 for one program ----
state.db.periods = PERIODS;
function mkReport(id, periodId, outcomes) {
  return { id, periodId, programId: 'p1', outcomes, services: {}, access: {} };
}
let o = { id: 'housing', name: 'Housing Placement Rate', target: .4, required: true };

// Q1: denominator left blank entirely -> data not reported
let q1 = mkReport('r1', 'q1-2026', { housing: { denominator: '', transitional: '', permanent: '' } });
state.db.reports = [q1];

let q1QuarterState = outcomeQuarterState(q1, o);
assertEq(q1QuarterState.state, 'no_data', 'Q1 blank denominator -> quarter state no_data');

let q1YtdState = outcomeYtdStatus(q1, o);
assertEq(q1YtdState.state, 'no_data', 'Q1 blank denominator -> YTD state no_data (THE REPORTED BUG: must match quarter state, not fall back to no_eligible)');

assertEq(printOutcomeYtdState(q1, o).text, printOutcomeQuarterState(q1, o).text, 'Card (YTD) and table (quarter) show identical text for Q1');

// ---- Confirmed zero eligible participants case ----
let q1b = mkReport('r1b', 'q1-2026', { housing: { denominator: '0', transitional: '', permanent: '' } });
state.db.reports = [q1b];
assertEq(outcomeQuarterState(q1b, o).state, 'no_eligible', 'Confirmed den=0 -> no_eligible (quarter)');
assertEq(outcomeYtdStatus(q1b, o).state, 'no_eligible', 'Confirmed den=0 -> no_eligible (ytd)');

// ---- Not yet due (den known, numerator blank) ----
let q1c = mkReport('r1c', 'q1-2026', { housing: { denominator: '5', transitional: '', permanent: '' } });
state.db.reports = [q1c];
assertEq(outcomeQuarterState(q1c, o).state, 'not_yet_due', 'Den known, numerator blank -> not_yet_due');

// ---- Normal result ----
let q1d = mkReport('r1d', 'q1-2026', { housing: { denominator: '10', transitional: '3', permanent: '1' } });
state.db.reports = [q1d];
let st = outcomeQuarterState(q1d, o);
assertEq(st.state, 'result', 'Complete data -> result');
assertEq(st.num, 4, 'Housing numerator = transitional+permanent');
assertEq(st.den, 10, 'Housing denominator passthrough');

// ---- YTD aggregation across quarters: Q1 result, Q2 no_data (insufficient) ----
let r1 = mkReport('r1', 'q1-2026', { housing: { denominator: '10', transitional: '3', permanent: '1' } });
let r2 = mkReport('r2', 'q2-2026', { housing: { denominator: '', transitional: '', permanent: '' } });
state.db.reports = [r1, r2];
let ytdQ2 = outcomeYtdStatus(r2, o);
assertEq(ytdQ2.state, 'insufficient', 'Q1 reported + Q2 missing -> insufficient (mixed reported/unreported)');

// ---- YTD aggregation: Q1 result, Q2 result -> proper sum ----
let r2b = mkReport('r2b', 'q2-2026', { housing: { denominator: '8', transitional: '2', permanent: '2' } });
state.db.reports = [r1, r2b];
let ytdQ2b = outcomeYtdStatus(r2b, o);
assertEq(ytdQ2b.state, 'result', 'Two fully reported quarters -> result');
assertEq(ytdQ2b.den, 18, 'YTD den sums both quarters');
assertEq(ytdQ2b.num, 8, 'YTD num sums both quarters (4+4)');

// ---- Overall performance tiering: reported example (9 of 10 on pace, 1 watch) ----
let scored = ['On Track', 'On Track', 'On Track', 'On Track', 'On Track', 'On Track', 'On Track', 'On Track', 'On Track', 'Watch'];
let overall = printOverallPerformance(scored, ['Psychiatric Care Visits']);
assertEq(overall.level, 'on_track', '9 of 10 on-pace-or-better with 1 Watch -> Generally On Track, not Watch');
assertTrue(overall.sub.includes('9 of 10'), 'Overall sub-text mentions 9 of 10');
assertTrue(overall.sub.includes('Psychiatric Care Visits'), 'Overall sub-text names the measure needing attention');

// Below-target scenario
let scoredBelow = ['Off Track', 'Off Track', 'Off Track', 'On Track', 'On Track', 'On Track'];
assertEq(printOverallPerformance(scoredBelow, ['A', 'B', 'C']).level, 'below', '3 of 6 Off Track (50%) -> Below Target');

// Strong scenario
let scoredStrong = ['Exceeds Pace', 'Exceeds Pace', 'Exceeds Pace', 'On Track'];
assertEq(printOverallPerformance(scoredStrong, []).level, 'strong', '3 Exceeds + 1 On Track, none below -> Strong Performance');

// Insufficient scenario
assertEq(printOverallPerformance([], []).level, 'insufficient', 'No scored measures -> Insufficient Data');

// ---- Service unit label shortening ----
assertEq(printServiceUnitLabel({ unit: 'service requests' }), 'Requests', 'Known unit -> short label');
assertEq(printServiceUnitLabel({ unit: 'street outreach contacts' }).length <= 30, true, 'Unknown unit gets truncated, not verbose');

// ---- Date / name formatting ----
assertEq(longDate('2026-04-21'), 'April 21, 2026', 'ISO date -> readable long date, no timezone rollback');
assertEq(cleanDisplayName('Nancy, Nguyen'), 'Nancy Nguyen', 'Stray comma in name is stripped');
assertEq(cyShortLabel({ contractYears: '2025-2026' }), 'CY 2025–26', 'Short contract-year label for footer');

// ---- Filename regression (bug fixed in a prior session; must still hold) ----
let program = { name: 'Healthcare in Action—West Hollywood', contractYears: '2025-2026', contractStartDate: '2025-10-01', contractEndDate: '2028-09-30' };
let period = { label: 'Q1' };
let rpt = { status: 'submitted' };
let fn = printFilename(program, period, rpt, 'pdf');
assertEq(fn, 'Healthcare-in-Action-West-Hollywood_CY2025-2026_Q1_Program-Report.pdf', 'Filename uses 1-year contract-years span, not 3-year contract term');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
