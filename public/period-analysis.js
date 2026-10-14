// Descriptive statistics only: no health classification or cycle prediction.
(() => {
  const DAY = 86400000;
  function dateNumber(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year,month,day] = value.split('-').map(Number);
    const date = new Date(value+'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth()+1 !== month || date.getUTCDate() !== day) return null;
    return date.getTime()/DAY;
  }
  function summarize(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b)=>a-b), mid = Math.floor(sorted.length/2);
    return { count:values.length, average:Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10, median:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2, min:sorted[0], max:sorted.at(-1) };
  }
  function analyze(records, today) {
    const now = dateNumber(today);
    if (now === null) throw new Error('统计日期无效。');
    const warnings = [], rows = []; let invalid=0, future=0;
    for (const record of records) {
      const start=dateNumber(record.start), end=record.end?dateNumber(record.end):null;
      if (start===null || (record.end && (end===null || end<start))) { invalid++; continue; }
      if (start>now) { future++; continue; }
      rows.push({ title:record.title || '生理期记录', start:record.start, end:record.end || '', startDay:start, endDay:end, duration:end!==null&&end<=now?end-start+1:null, elapsed:end===null?now-start+1:null, duplicate:false, interval:null, overlap:false });
    }
    rows.sort((a,b)=>a.startDay-b.startDay);
    const frequency = new Map(); rows.forEach(r=>frequency.set(r.start,(frequency.get(r.start)||0)+1));
    rows.forEach(r=>r.duplicate=frequency.get(r.start)>1);
    const unique=rows.filter(r=>!r.duplicate), intervals=[];
    for(let i=1;i<unique.length;i++){
      const previous=unique[i-1], current=unique[i];
      if(previous.endDay!==null&&previous.endDay>=current.startDay){current.overlap=true;continue;}
      current.interval=current.startDay-previous.startDay;
      intervals.push({from:previous.start,to:current.start,days:current.interval});
    }
    const durations=unique.filter(r=>r.duration!==null).map(r=>({start:r.start,days:r.duration}));
    if(invalid)warnings.push(`${invalid} 条日期无效或结束早于开始的记录未参与统计。`);
    if(future)warnings.push(`${future} 条开始日期在未来的记录未参与统计。`);
    const duplicateCount=rows.filter(r=>r.duplicate).length;
    if(duplicateCount)warnings.push(`${duplicateCount} 条记录的开始日期重复，未计入持续天数和间隔；请核对后编辑。`);
    const overlapCount=rows.filter(r=>r.overlap).length;
    if(overlapCount)warnings.push(`${overlapCount} 组记录的日期范围重叠，该组间隔未计入平均值；持续天数仍按各条记录展示。`);
    const futureEnds=rows.filter(r=>r.endDay!==null&&r.endDay>now).length;
    if(futureEnds)warnings.push(`${futureEnds} 条结束日期尚未到，未计入平均持续天数。`);
    const ongoing=unique.filter(r=>r.endDay===null);
    if(ongoing.length>1)warnings.push('有多条记录未填写结束日期，请核对并补全。');
    return { total:records.length, rows, durations, intervals, durationStats:summarize(durations.map(r=>r.days)), intervalStats:summarize(intervals.map(r=>r.days)), ongoing, warnings, latest:unique.at(-1)||null };
  }
  globalThis.PeriodAnalysis = Object.freeze({ analyze });
})();
