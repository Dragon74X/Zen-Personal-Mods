/* Function-led instruments and constellations; every carrier has a dock or registration target. */
(() => {
  const T=(x=0,y=0,r=0,sx=1,sy=1)=>[x,y,r,sx,sy],still=[T(),T(),T()],n=v=>+v.toFixed(5);
  const circle=(x,y,r)=>`M${x+r} ${y} C${x+r} ${y+r*.55228475} ${x+r*.55228475} ${y+r} ${x} ${y+r} C${x-r*.55228475} ${y+r} ${x-r} ${y+r*.55228475} ${x-r} ${y} C${x-r} ${y-r*.55228475} ${x-r*.55228475} ${y-r} ${x} ${y-r} C${x+r*.55228475} ${y-r} ${x+r} ${y-r*.55228475} ${x+r} ${y} Z`;
  const compass=(s,x=0,y=0)=>`M${x} ${y-s} L${x+s*.27} ${y-s*.27} L${x+s} ${y} L${x+s*.27} ${y+s*.27} L${x} ${y+s} L${x-s*.27} ${y+s*.27} L${x-s} ${y} L${x-s*.27} ${y-s*.27} Z`;
  const star=(s,x=0,y=0)=>Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?s*.43:s;return `${i?'L':'M'}${n(x+Math.cos(a)*r)} ${n(y+Math.sin(a)*r)}`;}).join(' ')+' Z';
  const P=(d,role,extra={})=>({d,h:d,c:d,role,t:still,o:[12,12],rate:1,w:.8,...extra});
  function beat(p,delay=0,poses={}){
    p.poses={prepare:{base:0},lock:{base:2},release:{base:1},...poses};
    p.beats={hover:[[0,'prepare'],[85+delay,'hover']],click:[[0,'prepare'],[110+delay,'click'],[550+delay,'lock']],leave:[[0,'release'],[110+delay,'rest']]};return p;
  }
  const point=(track,u)=>{const [x,y,rx,ry,a]=track.ellipse,r=a*Math.PI/180,t=u*Math.PI*2;return[n(x+rx*Math.cos(t)*Math.cos(r)-ry*Math.sin(t)*Math.sin(r)),n(y+rx*Math.cos(t)*Math.sin(r)+ry*Math.sin(t)*Math.cos(r))];};
  function route(parts,{track,start=0,phase=[0,0,0],span=[.05,.14,.3],width=.65,size=.85,delay=0,layer,masks=[],shape=compass,role='carrier',rate=1,wrap=true,poses={}}){
    const flow={track,start,phase,span,wrap,anchor:[0,0],heading:0,...(layer?{layer,scaleByDepth:.06}:{})},rig={o:[0,0],rate,attach:role,...(masks.length?{occludedBy:masks}:{})};
    const body=parts.length;parts.push(beat(P('M0 0',role+'-band',{...rig,w:.6,flow:{...flow,mode:'trail',width,taper:1}}),delay,poses));
    const head=parts.length;parts.push(beat(P(shape(size),role+'-head',{...rig,w:.7,flow:{...flow,mode:'head'}}),delay,poses));
    parts[body].occludedBy=[...(parts[body].occludedBy||[]),head];return{body,head};
  }
  function dock(parts,track,u,size=.45,role='registration'){
    const [x,y]=point(track,u);parts.push(P(circle(x,y,size),role,{w:.55}));
  }
  function splitStar(parts,cx,cy,size,spread,delay=0){
    // Four constant-area facets meet at one hub; motion is assembly, not pulsing scale.
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),tx=-dy,ty=dx;
      const xy=(r,s)=>`${n(cx+dx*r+tx*s)} ${n(cy+dy*r+ty*s)}`;
      const d=`M${xy(.38,0)} L${xy(1,.62)} L${xy(size,0)} L${xy(1,-.62)} Z`;
      parts.push(beat(P(d,'assembled-star-facet',{t:[T(dx*spread,dy*spread),T(dx*spread*.55,dy*spread*.55),T()],o:[cx,cy],w:.72}),delay+i*25,{prepare:{base:1,t:T(dx*(spread+.3),dy*(spread+.3))}}));
    }
  }
  function astrolabeReload(){
    const p=[P('M12 1.5 L12 3 M22.5 12 L21 12 M12 22.5 L12 21 M1.5 12 L3 12','fixed-registration',{w:.7})];
    for(const [ring,r,dir,span,delay]of[[0,8.6,1,.32,0],[1,5.9,-1,.29,90]]){
      const track={ellipse:[12,12,r,r,0]};
      for(let i=0;i<2;i++){
        const start=-.25+i*.5,phase=[0,dir*.04,dir*.5];
        route(p,{track,start,phase,span:[span,span+.055,span],width:.8,size:.6,delay,role:`rete-${ring}-${i}`,poses:{prepare:{base:0,phase:-dir*.022},lock:{base:2}}});
        dock(p,track,start+span,.36);
      }
    }
    p.push(beat(P('M9.1 12 L14.9 12 M12 10.7 L12 13.3','alignment-rule',{t:[T(0,0,-35),T(0,0,0),T(0,0,180)],w:.7}),170,{prepare:{base:0,t:T(0,0,-45)},lock:{base:2}}));
    p.push(P(circle(12,12,.6),'instrument-hub',{w:.7}));
    p[p.length-2].occludedBy=[p.length-1];return p;
  }
  function starfieldReload(){
    const p=[];splitStar(p,12,12,2.6,1,150);
    const track={ellipse:[12,12,8.8,8.8,0]};
    for(let i=0;i<3;i++){
      const start=-.25+i/3;
      dock(p,track,start,.48,`comet-dock-${i}`);
      route(p,{track,start,phase:[0,.006,1/3],span:[.035,.105,.255],width:.68,size:.9,delay:i*60,shape:star,role:`renewal-comet-${i}`,poses:{prepare:{base:0,phase:0,span:.02},lock:{base:2,phase:1/3,span:.27}}});
    }
    return p;
  }
  function astrolabeBack(){
    const p=[P('M4 6 L4 18 M2.5 9 L4 7.5 L5.5 9 M2.5 15 L4 16.5 L5.5 15','origin-bracket',{w:.75})];
    const a=beat(P('M19 12 L13 8 L7 8','folding-return-link',{h:'M19 12 L12 10 L5.5 10',c:'M19 12 L11.5 12 L4 12',w:1}),0,{prepare:{base:0,d:'M19 12 L14 7 L8 7'}});
    p.push(a);
    const joint=(x,y)=>circle(x,y,.8);
    p.push(beat(P(joint(13,8),'elbow',{h:joint(12,10),c:joint(11.5,12),w:.7}),0,{prepare:{base:0,d:joint(14,7)}}));
    p.push(beat(P(compass(1,7,8),'return-index',{h:compass(1,5.5,10),c:compass(1,4,12),w:.75}),0,{prepare:{base:0,d:compass(1,8,7)}}));
    p.push(P(circle(19,12,1.3),'fixed-hub',{w:.8}));p[1].occludedBy=[2,3,4];
    p.push(beat(P('M8 18 L19 18','distance-rule',{h:'M6 18 L19 18',c:'M4 18 L19 18',w:.6}),80));
    p.push(P('M8 17.5 L8 18.5 M12 17.5 L12 18.5 M16 17.5 L16 18.5 M19 17.5 L19 18.5','fixed-scale',{w:.5}));return p;
  }
  function starfieldBack(){
    const p=[P('M4 8 L1.8 12 L4 16','origin-gate',{w:.85})];
    const paths=[['M4 12 C7 7 13 7 19 4','M4 12 C7 7 11 7.5 14 7','M4 12 C5 10.5 5.5 10 6 9.7'],['M4 12 C9 14 14 11 21 12','M4 12 C7 13 11 12 15 12','M4 12 C5 12.1 6 12.2 7 12.3'],['M4 12 C8 17 14 17 19 20','M4 12 C7 16 11 17 14 17','M4 12 C5 13.4 5.8 14 6.2 14.7']];
    const ends=[[[19,4],[14,7],[6,9.7]],[[21,12],[15,12],[7,12.3]],[[19,20],[14,17],[6.2,14.7]]];
    for(let i=0;i<3;i++){
      const delay=[0,70,140][i],[a,b,c]=ends[i],trail=p.length;
      p.push(beat(P(paths[i][0],'retracing-route',{h:paths[i][1],c:paths[i][2],w:.62}),delay));
      const head=p.length;p.push(beat(P(star(.9,...a),'return-star',{h:star(.9,...b),c:star(.9,...c),w:.68}),delay));p[trail].occludedBy=[head];
    }
    p.push(P(circle(4,12,.55),'origin-node',{w:.7}));return p;
  }
  function astrolabeDownload(){
    const p=[P('M3 18 L5 18 L5 21 L19 21 L19 18 L21 18 L21 22 L3 22 Z','receiver',{w:.9})];
    const carriage=[T(),T(0,2),T(0,11)],weights=[T(),T(0,-2),T(0,-11)];
    for(const side of [-1,1]){
      const x=12+side*7,inner=12+side*3,belt=y=>`M${inner} ${y} L${inner} 3 Q${inner} 2 ${inner+side} 2 L${x-side} 2 Q${x} 2 ${x} 3 L${x} ${22-y}`;
      p.push(P(`M${x} 3 L${x} 18`,'counterweight-guide',{w:.45}));
      const band=p.length;p.push(beat(P(belt(6),'counterweight-belt',{h:belt(8),c:belt(17),w:.55}),0));
      const weight=p.length;p.push(beat(P(`M${x-1} 14.8 L${x+1} 14.8 L${x+1} 17.2 L${x-1} 17.2 Z`,'counterweight',{t:weights,w:.7}),0));
      p[band].occludedBy=[weight,7];
    }
    p.push(beat(P('M9 4 L15 4 L15 8 L9 8 Z','indexed-carriage',{t:carriage,attach:'carriage',w:.75}),0));
    p.push(beat(P(compass(1.05,12,6),'carriage-star',{t:carriage,attach:'carriage',w:.65}),0));
    p.push(P('M7 10 L8 10 M7 13 L8 13 M7 16 L8 16 M16 10 L17 10 M16 13 L17 13 M16 16 L17 16','guide-divisions',{w:.45}));
    for(const side of [-1,1])p.push(beat(P(`M${12+side*7} 19.8 L${12+side*4.5} 19.8`,'carriage-catch',{t:[T(),T(side*.5),T(-side*1.3)],w:.85}),190,{prepare:{base:1}}));
    p[7].occludedBy=[0];p[8].occludedBy=[0];return p;
  }
  function download(instrument){
    if(instrument)return astrolabeDownload();
    const p=[P('M3 15 L5 15 L5 21 L19 21 L19 15 L21 15 L21 22 L3 22 Z','receiver',{w:.9})];
    const specs=instrument?[[12,3,12,8,12,17,1.6,0],[7,5,8,8,10,17,.9,75],[17,5,16,8,14,17,.9,150]]:[[5,3,8,7,9,17,1.25,0],[12,1.5,12,6,12,17,1.55,70],[19,3,16,7,15,17,1.25,140]];
    for(const [x,y,hx,hy,cx,cy,size,delay]of specs){
      const s=instrument?compass:star;
      p.push(beat(P(s(size,x,y),'incoming-star',{h:s(size,hx,hy),c:s(size,cx,cy),w:.75,occludedBy:[0]}),delay,{prepare:{base:0,t:T(0,-.4)},lock:{base:2,t:T(0,2)}}));
    }
    for(const side of [-1,1]){
      const x=12+side*7;const flap=(end,y)=>`M${x} 15 L${end} ${y} L${end} ${y+1.1} L${x} 16.1 Z`;
      p.push(beat(P(flap(12+side*.8,15),'receiver-shutter',{h:flap(x+side*.2,11.8),c:flap(x+side*.2,11.8),w:.7}),0,{prepare:{base:1},lock:{base:0}}));
    }
    p.push(beat(P('M7 19 L17 19','receiver-seat',{h:'M7 20 L17 20',c:'M7 19 L17 19',w:.65}),220,{prepare:{base:1},lock:{base:2}}));
    if(instrument)p.push(P('M8 21 L8 22 M12 21 L12 22 M16 21 L16 22','receiver-index',{w:.5}));return p;
  }
  function astrolabeBookmark(){
    const p=[P('M6 22 L6 3 Q6 2 7 2 L17 2 Q18 2 18 3 L18 22 L12 18 Z','bookmark',{w:.85}),P('M6 8 L7.2 8 M16.8 8 L18 8 M12 2 L12 3.5 M12 14 L12 16','clasp-mount',{w:.65})];
    for(const [i,r,start,dir,delay]of[[0,4.6,.125,1,0],[1,3.1,-.125,-1,85]]){
      const track={ellipse:[12,9,r,r,0]};
      route(p,{track,start,phase:[0,dir*.055,dir*.125],span:[.42,.46,.5],width:.58,size:.6,role:`clasp-rete-${i}`,delay,poses:{prepare:{base:0,phase:-dir*.02},lock:{base:2}}});
      dock(p,track,start+dir*.125+.5,.9,'clasp-registration');
    }
    p.push(beat(P('M10.3 9 L13.7 9','locking-key',{t:[T(0,0,-30),T(0,0,0),T(0,0,90)],o:[12,9],w:.8}),170,{prepare:{base:0},lock:{base:2}}));
    p.push(P(circle(12,9,.55),'clasp-hub',{w:.65}));p[p.length-2].occludedBy=[p.length-1];
    p.push(beat(P('M9 16 L10.5 16 M13.5 16 L15 16','latch-register',{h:'M9.8 16 L11.3 16 M12.7 16 L14.2 16',c:'M10.3 16 L11.8 16 M12.2 16 L13.7 16',w:.6}),230));return p;
  }
  function bookmark(instrument){
    if(instrument)return astrolabeBookmark();
    const card=P('M6 22 L6 3 Q6 2 7 2 L17 2 Q18 2 18 3 L18 22 L12 18 Z','bookmark',{w:.85});
    const track={ellipse:[12,instrument?11:10,10,instrument?4.7:5.8,0]},p=[card],start=Math.acos(-.6)/(Math.PI*2),closed=1+Math.acos(.6)/(Math.PI*2)-start,span=[.055,.28,closed],phase=[0,0,0];
    for(const layer of ['back','front'])route(p,{track,start,phase,span,width:.6,size:.7,layer,masks:layer==='back'?[0]:[],delay:0,role:`binding-${layer}`,shape:instrument?compass:star,poses:{prepare:{base:0,span:.035},lock:{base:2}}});
    p[0].occludedBy=[3,4];
    dock(p,track,start,.55,'binding-root');
    const [x,y]=point(track,start+closed);p.push(beat(P(circle(x,y,.95),'binding-clasp',{opacity:[.3,.5,1],w:.55}),160));
    if(instrument){
      p.push(beat(P('M8.6 9 L15.4 9','register-rule',{t:[T(0,0,-25),T(0,0,-10),T()],o:[12,9],w:.65}),140));
      p.push(P(circle(12,9,.55),'card-hub',{w:.6}));p[p.length-2].occludedBy=[p.length-1];
      p.push(P('M9 5 L9 6 M12 5 L12 6 M15 5 L15 6','card-registration',{w:.55}));
    }else{
      const stars=[[9,7],[15,7],[12,13]];
      for(let i=0;i<3;i++){const[x,y]=stars[i];p.push(beat(P(star(.65,x,y),'locked-constellation',{t:[T(0,i===2?1:-1),T(0,i===2?.4:-.4),T()],w:.6}),90));}
      p.push(beat(P('M9 6 L15 6 L12 14 Z','constellation-links',{h:'M9 6.6 L15 6.6 L12 13.4 Z',c:'M9 7 L15 7 L12 13 Z',w:.5}),90));
      p[p.length-1].occludedBy=[p.length-4,p.length-3,p.length-2];
    }
    return p;
  }
  function history(instrument){
    const p=[P(circle(12,12,8.7),'clock-frame',{w:.85}),P('M12 3.3 L12 4.7 M20.7 12 L19.3 12 M12 20.7 L12 19.3 M3.3 12 L4.7 12','clock-registration',{w:.65})];
    const hand=(d,role,turn)=>beat(P(d,role,{hand:role,turn,hoverTurn:.08,w:.8,rate:1}),0);
    p.push(hand('M12 12 L12 5.8','minute',-360),hand('M12 12 L15.8 12','hour',-30));
    const balance=beat(P('M12 12 L12 15.4','counterweight-arm',{turn:-360,hoverTurn:.08,w:.6,rate:1}),0);
    p.push(balance,beat(P(circle(12,15.4,.65),'counterweight',{turn:-360,hoverTurn:.08,w:.6,rate:1}),0));
    p.push(P(circle(12,12,.7),'clock-hub',{w:.75}));p[2].occludedBy=[6];p[3].occludedBy=[6];p[4].occludedBy=[5,6];
    if(instrument){
      for(let i=0;i<3;i++){
        const a=(i*120-60)*Math.PI/180,x=12+6.6*Math.cos(a),y=12+6.6*Math.sin(a);
        p.push(beat(P(circle(x,y,.45),'rewind-detent',{opacity:[.4,.65,1],w:.5}),i*75));
      }
    }else{
      const track={ellipse:[12,12,6.6,6.6,0]};
      route(p,{track,start:.56,phase:[0,-.03,-.25],span:[.10,.13,.18],width:0,size:.6,shape:star,delay:80,role:'rewind-record',poses:{prepare:{base:0,phase:.01},lock:{base:2}}});
    }return p;
  }
  function library(instrument){
    const p=[],positions=[[3,7,5],[9,13,3],[16,20,5]],motions=instrument?[[T(),T(0,-.6,-2),T(0,-1.3,-4)],[T(),T(0,-1),T(0,-2.1)],[T(),T(0,-.3,2),T(0,-.8,4)]]:[[T(),T(0,-.4),T(0,-1.5)],[T(),T(0,-1.2,-2),T(0,-2.5,-4)],[T(),T(0,-.8,2),T(0,-1.8,4)]];
    positions.forEach(([left,right,top],i)=>{
      const origin=[(left+right)/2,22],extra={t:motions[i],o:origin,attach:`volume-${i}`};
      p.push(beat(P(`M${left} 22 L${left} ${top} Q${left} ${top-1} ${left+1} ${top-1} L${right} ${top-1} L${right} 22 Z`,'book',{...extra,w:.85}),i===1?140:0));
      p.push(beat(P(`M${left} ${top+2} L${right} ${top+2}`,'spine-rule',{...extra,w:.6}),i===1?140:0));
    });
    if(instrument){
      p.push(P('M3 23.8 L21 23.8 M5 23.2 L5 24.3 M11 23.2 L11 24.3 M18 23.2 L18 24.3','selector-guide',{w:.5}));
      p.push(beat(P('M15.5 20.2 L15.5 22.8 L20.5 22.8 L20.5 20.2','selector-fork',{t:[T(),T(-7),T(-7,-2.9)],w:.9}),75,{prepare:{base:1,t:T(-7,0)},lock:{base:2}}));
      p.push(beat(P('M18 22.8 L18 23.8','selector-lift',{h:'M11 22.8 L11 23.8',c:'M11 19.9 L11 23.8',w:.65}),75,{prepare:{base:1},lock:{base:2}}));
      p.push(beat(P(compass(.85,11,12),'selected-spine-index',{t:motions[1],o:[11,22],attach:'volume-1',w:.55}),140));
      return p;
    }
    const shape=instrument?compass:star,landing=instrument?[11,9.9]:[11-10*Math.sin(4*Math.PI/180),22-10*Math.cos(4*Math.PI/180)-2.5],track={ellipse:[landing[0]-4.7*Math.sin(12*Math.PI/180),landing[1]-4.7*Math.cos(12*Math.PI/180),10,4.7,-12]},end=.25,start=end-.70;
    for(const layer of ['back','front'])route(p,{track,start,phase:[0,.28,.70],span:[.035,.09,.035],wrap:false,width:.4,size:.65,shape,delay:0,layer,masks:layer==='back'?[0,2,4]:[],role:`selected-volume-${layer}`,poses:{prepare:{base:0,phase:-.018},lock:{base:2}}});
    for(const i of [0,2,4])p[i].occludedBy=[8,9];
    p.push(beat(P(circle(11,12,1.35),'selection-collar',{t:motions[1],o:[11,22],attach:'volume-1',opacity:[.65,.8,1],w:.55}),140));
    return p;
  }
  for(const instrument of [true,false]){
    const id=instrument?'astrolabe':'starfield',icons={back:instrument?astrolabeBack():starfieldBack(),reload:instrument?astrolabeReload():starfieldReload(),download:download(instrument),bookmark:bookmark(instrument),history:history(instrument),library:library(instrument)};
    motionThemes.push({id,name:instrument?'Astrolabe':'Starfield',note:instrument?'Rete drums register against fixed scales; linked return arms, catching shutters, binding loops, and rewinding hands follow each action.':'Comets wind open renewal bands; routes return to origin, stars enter receivers, loops fasten bookmarks, and a carrier selects a volume.',stroke:.95,cap:'round',join:'round',icons,demo:icons.bookmark});
  }
})();
