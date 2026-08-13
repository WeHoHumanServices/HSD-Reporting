/**
 * Regression tests for the Page 1 / restructured-report helper functions
 * added alongside the quarterly report redesign (reportServiceSummary,
 * reportOutcomeCompleteness, reportOutcomeStatus, reportAttentionItems,
 * reportDemographicCompleteness, reportPriorQuarterValue). These extract
 * the real source from index.html, same as report-logic.test.js, and are
 * scenario-tested against the actual Healthcare in Action Q1-Q3 numbers
 * used to validate the redesign.
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
  'printExpectedFraction', 'printIsQ1', 'serviceYearForReport',
  'reportServiceSummary', 'reportOutcomeDataStatus', 'reportOutcomeCompleteness',
  'reportOutcomeStatus', 'reportPriorQuarterValue', 'reportPriorQuarterLabel',
  'reportDemographicCompleteness', 'reportAttentionItems', 'reportOutstandingItems'
];
const CONST_NAMES = ['PERIODS', 'PRINT_STATUS_META', 'PRINT_OVERALL_META', 'PR_OUTCOME_META'];

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

// ---- Template mirroring HIA's real outcome set (4 outcomes) ----
const T = {
  serviceMetrics: [{ id: 'partner_requests', name: 'City partner requests', goal: 730, unit: 'service requests' }],
  outcomes: [
    { id: 'housing', name: 'Housing Placement Rate', target: .4, required: true },
    { id: 'specialty_care', name: 'Specialty/Ongoing Medical Linkage', target: .5, required: true },
    { id: 'psychiatric_followup', name: 'Psychiatric Follow-up', target: .6, required: true },
    { id: 'psych_med', name: 'Psychiatric Medication Adherence', target: .6, required: true }
  ]
};
function mkReport(id, periodId, overrides) {
  return Object.assign({ id, periodId, programId: 'hia', outcomes: {}, services: {}, access: {} }, overrides);
}

// ==== Scenario: Q3, mirroring the real HIA report ====
// Housing: 30 of 30 this quarter, but Q1/Q2 never reported -> YTD must be
// "insufficient" (partial), NOT a false 100%.
// Specialty care: 38 of 59 this quarter, same Q1/Q2 gap -> also partial.
// Psychiatric follow-up + med adherence: never reported at all -> no_data.
let q1 = mkReport('q1', 'q1-2026', {
  outcomes: {
    housing: { denominator: '', transitional: '', permanent: '' },
    specialty_care: { denominator: '', numerator: '' },
    psychiatric_followup: { denominator: '', numerator: '' },
    psych_med: { denominator: '', numerator: '' }
  },
  services: { partner_requests: { actual: '473' } }
});
let q2 = mkReport('q2', 'q2-2026', {
  outcomes: {
    housing: { denominator: '', transitional: '', permanent: '' },
    specialty_care: { denominator: '', numerator: '' },
    psychiatric_followup: { denominator: '', numerator: '' },
    psych_med: { denominator: '', numerator: '' }
  },
  services: { partner_requests: { actual: '416' } }
});
let q3 = mkReport('q3', 'q3-2026', {
  outcomes: {
    housing: { denominator: '30', transitional: '20', permanent: '10' },
    specialty_care: { denominator: '59', numerator: '38' },
    psychiatric_followup: { denominator: '', numerator: '' },
    psych_med: { denominator: '', numerator: '' }
  },
  services: { partner_requests: { actual: '280' } }
});
state.db.periods = [
  { id: 'q1-2026', label: 'Q1', quarterNumber: 1, serviceYearLabel: 'CY2025-2026', pace: .25 },
  { id: 'q2-2026', label: 'Q2', quarterNumber: 2, serviceYearLabel: 'CY2025-2026', pace: .5 },
  { id: 'q3-2026', label: 'Q3', quarterNumber: 3, serviceYearLabel: 'CY2025-2026', pace: .75 }
];
state.db.reports = [q1, q2, q3];

// Housing quarter result must show 30 of 30, 100% (per spec's expected Q3 example)
let housingQState = printOutcomeQuarterState(q3, T.outcomes[0]);
assertEq(housingQState.state, 'result', 'Q3 housing quarter state is a result');
assertEq(housingQState.num, 30, 'Q3 housing quarter numerator = 30');
assertEq(housingQState.den, 30, 'Q3 housing quarter denominator = 30');

// But YTD must be flagged incomplete, not a false 100%, because Q1/Q2 never reported
let housingYState = printOutcomeYtdState(q3, T.outcomes[0]);
assertEq(housingYState.state, 'insufficient', 'Q3 housing YTD is insufficient (Q1/Q2 missing), not a false 100%');

let specialtyYState = printOutcomeYtdState(q3, T.outcomes[1]);
assertEq(specialtyYState.state, 'insufficient', 'Q3 specialty-care YTD is insufficient (Q1/Q2 missing)');

let comp = reportOutcomeCompleteness(q3, T);
assertEq(comp.total, 4, 'Q3 completeness: 4 required outcomes');
assertEq(comp.reportedThisQuarter, 2, 'Q3 completeness: 2 of 4 reported this quarter (housing, specialty care)');
assertEq(comp.completeYtd, 0, 'Q3 completeness: 0 of 4 have complete YTD data (all four are gapped or unreported)');
assertTrue(comp.unreportedNames.includes('Psychiatric Follow-up'), 'Psychiatric Follow-up correctly listed as never-reported');
assertTrue(comp.unreportedNames.includes('Psychiatric Medication Adherence'), 'Psychiatric Medication Adherence correctly listed as never-reported');
assertTrue(comp.partialYtdNames.includes('Housing Placement Rate'), 'Housing correctly listed as partial-YTD (quarter data exists, prior quarters missing)');
assertTrue(comp.partialYtdNames.includes('Specialty/Ongoing Medical Linkage'), 'Specialty care correctly listed as partial-YTD');

// Outcome status card must NOT claim a positive rating when YTD is incomplete for all 4
let outStatus = reportOutcomeStatus(comp);
assertTrue(['partial', 'insufficient'].includes(outStatus.level), 'Q3 outcome status is Partial/Insufficient Data, never a positive rating, while YTD is incomplete');
assertTrue(!/strong|on.?track/i.test(outStatus.level), 'Outcome status level is never "strong" or "on_track" while required outcomes are missing YTD data');

// Data-status labels for the table
assertEq(reportOutcomeDataStatus('result').label, 'Complete', 'result -> Complete label');
assertEq(reportOutcomeDataStatus('insufficient').label, 'Partial YTD Data', 'insufficient -> Partial YTD Data label');
assertEq(reportOutcomeDataStatus('no_data').label, 'Not Reported', 'no_data -> Not Reported label');
assertEq(reportOutcomeDataStatus('not_yet_due').label, 'Not Yet Measurable', 'not_yet_due -> Not Yet Measurable label');

// ==== Scenario: all outcomes complete + good -> a genuinely positive rating is allowed ====
let g1 = mkReport('g1', 'q1-2026', { outcomes: {
  housing: { denominator: '10', transitional: '3', permanent: '2' },
  specialty_care: { denominator: '10', numerator: '6' },
  psychiatric_followup: { denominator: '10', numerator: '7' },
  psych_med: { denominator: '10', numerator: '7' }
}, services: { partner_requests: { actual: '100' } } });
state.db.reports = [g1];
let goodComp = reportOutcomeCompleteness(g1, T);
assertEq(goodComp.completeYtd, 4, 'All 4 outcomes complete when every denominator/numerator is populated in Q1');
let goodStatus = reportOutcomeStatus(goodComp);
assertTrue(['strong', 'on_track', 'mixed'].includes(goodStatus.level), 'A fully-reported, on-target quarter is allowed a positive/neutral rating');

// ==== reportPriorQuarterValue / reportPriorQuarterLabel ====
state.db.reports = [q1, q2, q3];
assertEq(reportPriorQuarterValue(q3, 'partner_requests'), 416, 'Prior-quarter value for Q3 pulls Q2 actual (416)');
assertEq(reportPriorQuarterLabel(q3), 'Q2', 'Prior-quarter label for Q3 is Q2');
assertEq(reportPriorQuarterValue(q1, 'partner_requests'), null, 'Q1 has no prior quarter -> null, not zero');

// ==== reportDemographicCompleteness ====
assertEq(reportDemographicCompleteness(179, 16).pct, (179 - 16) / 179, 'Demographic completeness = known / total');
assertEq(reportDemographicCompleteness(0, 0), null, 'Zero total -> null (no divide-by-zero)');

// ==== reportAttentionItems surfaces both service and outcome gaps, capped ====
let attn = reportAttentionItems(q3, T, reportServiceSummary(q3, T), comp);
assertTrue(attn.some(x => /Psychiatric Follow-up/.test(x)), 'Attention items include never-reported outcome');
assertTrue(attn.some(x => /Housing Placement Rate/.test(x)), 'Attention items include partial-YTD outcome');
assertTrue(attn.length <= 6, 'Attention items list stays capped/compact');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
