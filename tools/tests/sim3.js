const SB=require('/home/claude/volleyball-scorebook/cranbrook/src/core.js');
const {jsPDF}=require('./lib/node_modules/jspdf/dist/jspdf.node.min.js');
const fs=require('fs');
let rng=7; const r=()=>{rng=(rng*16807)%2147483647;return rng/2147483647;};
function build(style, level){
  let g=SB.newGame({level}); g.settings=SB.applyPreset(null,level); g.info.level=level; g.settings.style=style;
  Object.assign(g.info,{home:'Cranbrook',away:'Brother Rice',site:'MS gym',scorer:'M. Toth',referee:'J. Smith',referee2:'A. Lee',gameNumber:'14',competition:'Fall Classic',city:'Bloomfield Hills, MI',pool:'Gold',matchNo:'7',division:'Women',category:'Junior'});
  let t=Date.now()-3600e3,k=0; const ev=(si,e)=>{e.ts=t+(k++)*25000;g.sets[si].events.push(e);};
  for(let si=0;si<g.settings.setsTotal;si++){
    const s=SB.newSet(g); s.lineup.A=['5','3','12','7','9','21']; s.lineup.B=['2','8','15','4','10','17']; s.captain={A:'12',B:'4'};
    if(g.settings.libero){s.libero.A='1';}
    s.started=true; s.start=t+k*25000; g.sets.push(s); let n=0;
    while(!SB.replay(g,si).done){ n++;
      if(n===8) ev(si,{t:'to',team:'B'});
      if(n===12) ev(si,{t:'sub',team:'A',out:'3',inn:'14'});
      if(n===15&&si===0) ev(si,{t:'rp'});
      if(n===18&&si===0) ev(si,{t:'card',team:'B',color:'yellow',who:'8'});
      if(n===20&&si===1) ev(si,{t:'card',team:'A',color:'red',who:''});
      if(n===22&&si===0) ev(si,{t:'pen',team:'A'});
      if(n===24) ev(si,{t:'to',team:'A'});
      ev(si,{t:'pt',team:r()<0.55?'A':'B'});
    }
    if(SB.matchStatus(g).decided) break;
  }
  return g;
}
for (const [style,level] of [['mhsaa','7th grade'],['aau','Club 14U']]){
  const g=build(style,level); const R=SB.replay(g,0);
  console.log(style, 'set1', R.score, 'marks row I A:', R.T.A.marks[0].map(m=>m.k==='pt'?(m.boxed?'['+m.n+']':m.n)+(m.final?'*':''):m.k).join(' '));
  console.log(' row I B:', R.T.B.marks[0].map(m=>m.k==='pt'?(m.boxed?'['+m.n+']':m.n):m.k).join(' '), 'sanctions', JSON.stringify(R.sanctions));
  fs.writeFileSync(`v3_${style}.pdf`, Buffer.from(SB.makePDF(jsPDF,g).output('arraybuffer')));
  fs.writeFileSync(`v3_blank_${style}.pdf`, Buffer.from(SB.makePDF(jsPDF,SB.blankGame(style)).output('arraybuffer')));
}
