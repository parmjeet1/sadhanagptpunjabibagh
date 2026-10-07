// Builds thousands of made-up chatbot messages (English, Hinglish, Hindi) with
// the answer each one should give. No real student data. Used by
// tests/assistantParser.test.mjs.
//
// The activities below use the names real students have (e.g. "Hearing(MIN)").
const mk = (id, name, activity_type, category) => ({ activity_id: String(id), name, type: activity_type, category });
export const ACTS = [
  mk(1, "Chanting", "number", "chanting"),
  mk(2, "Reading(MIN)", "duration", "reading"),
  mk(3, "Wake Up Time", "time", "wakeup"),
  mk(4, "Sleep Time", "time", "sleep"),
  mk(6, "Day Rest(MIN)", "duration", "day_rest"),
  mk(7, "Hearing(MIN)", "duration", "hearing"),
  mk(10, "Chanting Completion Time", "time", "chanting_completion_time"),
  mk(11, "Mangal Aarti Attended", "boolean", "mangal_aarti"),
];
let seed = 12345; const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296}; const pick=a=>a[Math.floor(rnd()*a.length)]; const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const p2=n=>String(n).padStart(2,'0');
const hm=(h,m)=>`${p2(h)}:${p2(m)}`;
// each concept -> function(lang) => {text, id, value}
const G={
 chant:(L)=>{const n=ri(1,32);const t={en:[`${n} rounds chanting`,`chanting ${n} rounds`,`chanted ${n} rounds`,`chanting ${n}`,`${n} rounds done`,`completed ${n} rounds`,`${n} rounds`],
   hi:[`${n} round chanting kiya`,`${n} mala hui`,`${n} mala jap kiya`,`chanting ${n} round hui`,`${n} round poore hue`,`${n} mala ho gayi`,`japa ${n}`,`${n} round kiya`],
   dv:[`${n} माला जप किया`,`${n} राउंड चैंटिंग`,`${n} माला हुई`]}[L];return{text:pick(t),id:'1',value:n}},
 wake:(L)=>{const h=ri(3,7),m=pick([0,15,30,45,25,10]);const t={en:[`woke up at ${h}:${p2(m)}`,`woke at ${h}:${p2(m)} am`,`got up at ${h}:${p2(m)}`,`wake up ${h}:${p2(m)}`,...(m===0?[`woke at ${h} am`,`woke at ${h}am`]:[])],
   hi:[`${h}:${p2(m)} baje utha`,`subah ${h}:${p2(m)} baje utha`,`${h}:${p2(m)} pe uth gaya`,`utha ${h}:${p2(m)} baje`,...(m===0?[`${h} baje utha`,`${h} baje uth gaya`]:[])],
   dv:[`${h}:${p2(m)} बजे उठा`,`सुबह ${h}:${p2(m)} बजे उठा`]}[L];return{text:pick(t),id:'3',value:hm(h,m)}},
 sleepT:(L)=>{const h=ri(9,11),m=pick([0,30,15]);const t={en:[`slept at ${h}:${p2(m)} pm`,`went to bed at ${h}:${p2(m)} pm`,...(m?[]:[`slept at ${h} pm`,`sleep ${h} pm`])],
   hi:[`raat ${h}:${p2(m)} baje soya`,`${h}:${p2(m)} baje so gaya`,...(m===0?[`${h} baje soya`]:[])],dv:[`रात ${h}:${p2(m)} बजे सोया`]}[L];
   const ok=L!=='en'||true;const text=pick(t);return{text,id:'4',value:hm(h+12,m)}},
 hear:(L)=>{const mins=pick([10,15,20,30,45,60,90,120]);const hrs=mins%60===0;const t={en:[`${mins} min hearing`,`hearing ${mins} min`,`hearing ${mins} minutes`,`heard lecture ${mins} min`,...(hrs?[`hearing ${mins/60} hour`,`${mins/60} hr hearing`]:[])],
   hi:[`hearing ${mins} min`,`${mins} min hearing kiya`,`pravachan ${mins} min suna`,`lecture ${mins} min suna`,...(hrs?[`${mins/60} ghanta hearing`,`${mins/60} ghante lecture suna`]:[])],dv:[`${mins} मिनट श्रवण किया`,`${mins} मिनट प्रवचन सुना`]}[L];return{text:pick(t),id:'7',value:mins}},
 read:(L)=>{const mins=pick([10,15,20,30,45,60,90]);const hrs=mins%60===0;const t={en:[`${mins} min reading`,`reading ${mins} min`,`read for ${mins} minutes`,`read book ${mins} min`,...(hrs?[`reading ${mins/60} hour`]:[])],
   hi:[`reading ${mins} min`,`${mins} min padha`,`${mins} min padhai ki`,`book ${mins} min padhi`,...(hrs?[`${mins/60} ghanta padha`]:[])],dv:[`${mins} मिनट पढ़ाई की`,`${mins} मिनट पढ़ा`]}[L];return{text:pick(t),id:'2',value:mins}},
 rest:(L)=>{const mins=pick([15,20,30,45,60]);const t={en:[`day rest ${mins} min`,`rested ${mins} min in the afternoon`,`nap ${mins} min`],hi:[`din me ${mins} min soya`,`dopahar me ${mins} min aaram kiya`,`day rest ${mins} min`],dv:[`दोपहर में ${mins} मिनट आराम किया`]}[L];return{text:pick(t),id:'6',value:mins}},
 aarti:(L)=>{const y=rnd()<0.6;const t={en:y?['attended mangal aarti','went to mangal aarti','mangal aarti yes','mangal aarti done']:['missed mangal aarti','did not attend mangal aarti',"didn't attend mangal aarti",'mangal aarti no','skipped mangal aarti'],
   hi:y?['mangal aarti hua','mangal aarti attend ki','mangal aarti me gaya']:['mangal aarti nahi hua','mangal aarti nhi kiya','mangal aarti miss ho gayi','mangal aarti me nahi gaya'],dv:y?['मंगल आरती हुई','मंगल आरती में गया']:['मंगल आरती नहीं हुई']}[L];return{text:pick(t),id:'11',value:y}},
 cdone:(L)=>{const h=ri(6,10),m=pick([0,30]);const t={en:[`chanting completed at ${h}:${p2(m)} am`,`finished chanting at ${h}:${p2(m)} am`],hi:[`${h}:${p2(m)} baje chanting complete hui`,`chanting ${h}:${p2(m)} baje khatam hua`],dv:[`${h}:${p2(m)} बजे जप पूरा हुआ`]}[L];return{text:pick(t),id:'10',value:hm(h,m)}},
 zero:(L)=>{const t={en:['no chanting today',"didn't chant today",'no reading today'],hi:['aaj chanting nahi hui','chanting nahi ki','aaj reading nahi kiya','kal chanting nahi hui'],dv:['आज जप नहीं हुआ']}[L];const x=pick(t);return{text:x,id:/read/.test(x)?'2':'1',value:0}},
};
const DATES=(L)=>{const now=moment().utcOffset('+05:30');const f=n=>now.clone().subtract(n,'days').format('YYYY-MM-DD');
  const en=[['',null],['today ',f(0)],['yesterday ',f(1)],['2 days ago ',f(2)],['3 days ago ',f(3)]];
  const hi=[['',null],['aaj ',f(0)],['kal ',f(1)],['parso ',f(2)],['2 din pehle ',f(2)],['3 din pehle ',f(3)],['kal ki ',f(1)]];
  const dv=[['',null],['आज ',f(0)],['कल ',f(1)],['परसों ',f(2)]];
  return pick({en,hi,dv}[L]===undefined?en:{en,hi,dv}[L])};
const CONN=['', ', ',' and ',' aur ',', ',' . ',' + '];
export function build(n, now){
  const ist=new Date(now.getTime()+5.5*3600*1000); const f=(k)=>new Date(Date.UTC(ist.getUTCFullYear(),ist.getUTCMonth(),ist.getUTCDate()-k)).toISOString().slice(0,10);
  const DATES_FOR={en:[['',null],['today ',f(0)],['yesterday ',f(1)],['2 days ago ',f(2)],['3 days ago ',f(3)]],hi:[['',null],['aaj ',f(0)],['kal ',f(1)],['parso ',f(2)],['2 din pehle ',f(2)],['3 din pehle ',f(3)],['kal ki ',f(1)]],dv:[['',null],['आज ',f(0)],['कल ',f(1)],['परसों ',f(2)]]};
  seed = 12345;
  const out=[];const names=Object.keys(G);
  for(let i=0;i<n;i++){
    const L=pick(['en','en','hi','hi','hi','dv']);
    const k=pick([1,1,1,2,2,3,4]);
    const used=new Set();const parts=[];
    while(parts.length<k){const c=pick(names);if(used.has(c))continue;
      if(c==='zero'&&(used.has('chant')||used.has('read')))continue;
      if((c==='chant'&&used.has('zero'))||(c==='read'&&used.has('zero')))continue;
      used.add(c);parts.push(G[c](L));}
    const [dp,date]=pick(DATES_FOR[L]);
    const sep=pick([', ',' and ',' aur ',', ']);
    const text=(dp+parts.map(p=>p.text).join(L==='hi'?pick([', ',' aur ',', ']):(L==='en'?pick([', ',' and ']):', '))).trim();
    const truth={};parts.forEach(p=>truth[p.id]=p.value);
    out.push({text,truth,date,L,k,kinds:[...used]});
  }
  return out;
}
