import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/period-analysis.js';
const analyze=globalThis.PeriodAnalysis.analyze;
test('empty analysis has no fabricated averages',()=>{
  const result=analyze([],'2026-10-13');assert.equal(result.durationStats,null);assert.equal(result.intervalStats,null);
});
test('durations include both dates and intervals use calendar days',()=>{
  const result=analyze([{start:'2026-09-01',end:'2026-09-05'},{start:'2026-08-01',end:'2026-08-04'},{start:'2026-10-01',end:'2026-10-06'}],'2026-10-13');
  assert.equal(result.durationStats.average,5);assert.equal(result.durationStats.median,5);assert.deepEqual(result.intervals.map(r=>r.days),[31,30]);assert.equal(result.intervalStats.average,30.5);
});
test('incomplete and future records do not enter duration averages',()=>{
  const result=analyze([{start:'2026-10-10',end:''},{start:'2026-11-01',end:'2026-11-05'},{start:'2026-09-01',end:'2026-09-03'},{start:'2026-09-10',end:'2026-11-01'}],'2026-10-13');
  assert.equal(result.durationStats.count,1);assert.equal(result.durationStats.average,3);assert.equal(result.ongoing[0].elapsed,4);assert.ok(result.warnings.some(w=>w.includes('开始日期在未来')));assert.ok(result.warnings.some(w=>w.includes('结束日期尚未到')));
});
test('duplicate starts and overlapping intervals are flagged',()=>{
  const result=analyze([{start:'2026-08-01',end:'2026-08-05'},{start:'2026-08-01',end:'2026-08-06'},{start:'2026-09-01',end:'2026-09-05'},{start:'2026-09-04',end:'2026-09-06'}],'2026-10-13');
  assert.equal(result.durationStats.count,2);assert.equal(result.intervalStats,null);assert.equal(result.warnings.length,2);
});
test('leap days and invalid dates are handled without local timezone rounding',()=>{
  const result=analyze([{start:'2024-02-28',end:'2024-03-01'},{start:'2024-02-30',end:''},{start:'2024-03-05',end:'2024-03-04'}],'2024-03-10');
  assert.equal(result.durationStats.average,3);assert.equal(result.rows.length,1);assert.equal(result.warnings.length,1);
});
