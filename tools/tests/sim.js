const SB = require('/home/claude/volleyball-scorebook/cranbrook/src/logic.js');
const { jsPDF } = require('/home/claude/volleyball-scorebook/vendor/jspdf.node.min.js');
const fs=require('fs');
let g = SB.newGame(); g.info.home='Cranbrook'; g.info.away='Brother Rice'; g.info.site='Cranbrook MS gym'; g.info.scorer='M. Toth'; g.settings.libero=true;
let t0=Date.now()-3600e3, k=0;
function ev(si,e){e.ts=t0+(k++)*20000; g.sets[si].events.push(e);}
let rng=1; function r(){rng=(rng*16807)%2147483647; return rng/2147483647;}
for(let si=0;si<3;si++){
  const s=SB.newSet(g); if(si===0){s.lineup.A=['5','3','12','7','9','21'];s.lineup.B=['2','8','15','4','10','17'];s.libero.A='1';}
  s.started=true; s.start=t0+k*20000; g.sets.push(s);
  let n=0;
  while(!SB.replay(g,si).done){
    n++;
    if(si===0&&n===14) ev(si,{t:'sub',team:'A',out:'3',inn:'14'});
    if(si===0&&n===20) ev(si,{t:'to',team:'B'});
    if(si===0&&n===22){ // try illegal: 14 into another spot
      console.log('illegal check', SB.checkSub(g,si,'A','12','3',false), SB.checkSub(g,si,'A','9','30',false));
      console.log('injury check', SB.checkSub(g,si,'A','12','3',true));
      ev(si,{t:'sub',team:'A',out:'12',inn:'3',injury:true});
    }
    if(si===1&&n===10) ev(si,{t:'rot',team:'B',dir:1});
    if(si===1&&n===5){ const R=SB.replay(g,si); ev(si,{t:'lib',team:'A',action:'in',slot:R.T.A.court[4]}); }
    ev(si,{t:'pt',team: r()<(si===2?0.45:0.55)?'A':'B'});
  }
  const R=SB.replay(g,si); console.log('set',si+1,R.score,R.winner, 'subsA',R.T.A.subCount, 'turnsA', R.T.A.turns.map(t=>t.slot+':'+t.end+(t.final?'*':'')).join(' '));
  console.log(' turnsB', R.T.B.turns.map(t=>t.slot+':'+t.end+(t.final?'*':'')).join(' '), R.notes);
}
const doc=SB.makePDF(jsPDF,g); fs.writeFileSync('/home/claude/volleyball-scorebook/tools/test.pdf', Buffer.from(doc.output('arraybuffer')));
console.log(SB.pdfName(g));
