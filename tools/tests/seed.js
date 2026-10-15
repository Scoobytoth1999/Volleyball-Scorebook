const SB=require('/home/claude/volleyball-scorebook/retail/src/core.js');
function run(seed0,bias){
  const g=SB.newGame({level:'7th grade'}); let seed=seed0; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let si=0;si<3;si++){const s=SB.newSet(g); s.lineup.A=['4','11','7','15','2','9']; s.lineup.B=['3','12','8','21','5','10']; s.started=true; g.sets.push(s); let n=0;
    const ev=e=>s.events.push(e);
    while(!SB.replay(g,si).done&&n<200){n++;
      if(n===9) ev({t:'to',team:rnd()<0.5?'A':'B'});
      if(n===14) ev({t:'sub',team:'A',out:SB.replay(g,si).T.A.slots[1].current,inn:'18'});
      if(n===20) ev({t:'sub',team:'B',out:SB.replay(g,si).T.B.slots[4].current,inn:'14'});
      if(n===27) ev({t:'to',team:'A'});
      ev({t:'pt',team:rnd()<bias[si]?'A':'B'});}}
  return [0,1,2].map(i=>{const r=SB.replay(g,i).score;return [r.A,r.B];});
}
const bias=[0.53,0.47,0.53];
for(let s=1;s<400;s++){const r=run(s,bias); const ok=r[0][0]===25&&r[0][1]>=19&&r[1][1]===25&&r[1][0]>=20&&r[2][0]===15&&r[2][1]>=10; if(ok){console.log(s,JSON.stringify(r));}}
