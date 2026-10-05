/* Approved contours with authored folds, shared joints, and action-directed part motion. */
(() => {
  const I=[0,0,0,1,1],T=(h,c)=>[I,h,c];
  const P=d=>({d,h:d,c:d,t:T(I,I),rate:1,role:"frame"});
  const A=(d,h,c,more={})=>({...P(d),h,c,...more});
  const xy=(d,fn)=>{const n=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number),v=[];for(let i=0;i<n.length;i+=2)v.push(...fn(n[i],n[i+1]));let j=0;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>String(v[j++]));};
  const polar=(r,a)=>[12+r*Math.cos(a*Math.PI/180),12+r*Math.sin(a*Math.PI/180)];
  const rotate=(d,a)=>xy(d,(x,y)=>{const r=a*Math.PI/180;return[12+(x-12)*Math.cos(r)-(y-12)*Math.sin(r),12+(x-12)*Math.sin(r)+(y-12)*Math.cos(r)];});
  const circle=(x,y,r)=>{const k=r*.55228475;return`M${x+r} ${y} C${x+r} ${y+k} ${x+k} ${y+r} ${x} ${y+r} C${x-k} ${y+r} ${x-r} ${y+k} ${x-r} ${y} C${x-r} ${y-k} ${x-k} ${y-r} ${x} ${y-r} C${x+k} ${y-r} ${x+r} ${y-k} ${x+r} ${y} Z`;};
  const wrap=(d,role,track,start,span,mode,extra={})=>({...P(d),role,flow:{track,start,span,phase:[0,0,0],wrap:true,mode,...extra},poses:{gather:{base:0,span:span[0]},wind:{base:2,span:span[2]},release:{base:1,span:span[1]}},beats:{hover:[[0,'gather'],[130,'hover']],click:[[0,'hover'],[140,'wind'],[710,'release']]}});
  const themes=[
    {id:"cathedral",stroke:0.83,cap:"round",join:"miter",note:"Rosette petals unlatch around fixed spokes; gate doors part and the download receiver opens on real hinges.",icons:{
      back:[
        "M4 12 L12 4 L12 9 L21 9 L21 15 L12 15 L12 20 Z ",
        "M6.5 12 L7 12 ",
        "M18 10.8 L19 10.8"
      ].map(P),
      reload:[
        "M20 7 C16 1 7 2 4 8 C1 14 5 21 12 21 C17 21 20 18 21 13 L18 13 C17 17 14 19 10 18 C5 17 4 12 7 8 C10 4 15 5 17 8 L14 8 L21 9 L21 3 Z ",
        "M12 1 L13 3 L12 4 L11 3 Z ",
        "M5 6 L6 7 ",
        "M18 16 L19 16"
      ].map(P),
      download:[
        "M10 2 L14 2 L14 10 L18 10 L12 18 L6 10 L10 10 Z ",
        "M12 0 L12 2",
        "M2 15 L5 18 L5 20 L19 20 L19 18 L22 15 L22 22 L2 22 Z"
      ].map(P),
      bookmark:[
        {"d":"M5 23 L5 9 C5 5.8 10 3.6 12 1 C14 3.6 19 5.8 19 9 L19 23 L12 18.5 Z","h":"M4.6 23 L4.6 9 C4.6 5.5 10 3.5 12 .8 C14 3.5 19.4 5.5 19.4 9 L19.4 23 L12 18.3 Z","c":"M5.2 23 L5.2 12 C5.2 8.5 10 6.2 12 3.5 C14 6.2 18.8 8.5 18.8 12 L18.8 23 L12 20.4 Z"},
        {"d":"M6.7 21.7 L6.7 11.2 Q8.8 7.8 11.2 12 L11.2 18.8 Z","h":"M6.3 21.7 L6.3 11 Q8.8 7.4 11.2 11.7 L11.2 18.6 Z","c":"M6.8 21.7 L6.8 14.2 Q8.8 11 11.5 15 L11.5 20.4 Z","rate":0.92},
        {"d":"M17.3 21.7 L17.3 11.2 Q15.2 7.8 12.8 12 L12.8 18.8 Z","h":"M17.7 21.7 L17.7 11 Q15.2 7.4 12.8 11.7 L12.8 18.6 Z","c":"M17.2 21.7 L17.2 14.2 Q15.2 11 12.5 15 L12.5 20.4 Z","rate":1.08},
        {"d":"M12 5.5 C10 4.2 8.4 6 9.8 7.4 C7 7 7 10 9.8 9.6 C8.6 12 11.2 13 12 10.6 C12.8 13 15.4 12 14.2 9.6 C17 10 17 7 14.2 7.4 C15.6 6 14 4.2 12 5.5 Z","h":"M12 4.8 C11.7 6 11 7 10 7.8 C8.8 8.5 8 8.7 7.2 9 C8.8 9.3 10.8 10.3 12 12.8 C13.2 10.3 15.2 9.3 16.8 9 C16 8.7 15.2 8.5 14 7.8 C13 7 12.3 6 12 4.8 Z","c":"M12 7.5C9.7 5.94 7.86 8.1 9.47 9.78C6.25 9.3 6.25 12.9 9.47 12.42C8.09 15.3 11.08 16.5 12 13.62C12.92 16.5 15.91 15.3 14.53 12.42C17.75 12.9 17.75 9.3 14.53 9.78C16.14 8.1 14.3 5.94 12 7.5Z","rate":1.02}
      ],
      history:[
        "M12 3 C16.97056275 3 21 7.02943725 21 12 C21 16.97056275 16.97056275 21 12 21 C7.02943725 21 3 16.97056275 3 12 C3 7.02943725 7.02943725 3 12 3 Z ",
        "M12 4.3 C16.252592575 4.3 19.7 7.747407425 19.7 12 C19.7 16.252592575 16.252592575 19.7 12 19.7 C7.747407425 19.7 4.3 16.252592575 4.3 12 C4.3 7.747407425 7.747407425 4.3 12 4.3 Z",
        "M12 1 L13 3 L12 4 L11 3 Z ",
        "M23 12 L21 13 L20 12 L21 11 Z ",
        "M12 23 L11 21 L12 20 L13 21 Z ",
        "M1 12 L3 11 L4 12 L3 13 Z",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 22 L1.7999999999999998 5 L4.5 1 L7.2 5 L7.2 22 Z ",
        "M1.7999999999999998 5 L7.2 5 ",
        "M2.5 7 L6.5 7 ",
        "M4.5 8 L5.6 10 L4.5 12 L3.4 10 Z ",
        "M3.4 19 L3.4 13 Q4.5 10 5.6 13 L5.6 19 Z ",
        "M2.5 20 L6.5 20",
        "M9.3 22 L9.3 5 L12 1 L14.7 5 L14.7 22 Z ",
        "M9.3 5 L14.7 5 ",
        "M10 7 L14 7 ",
        "M12 8 L13.1 10 L12 12 L10.9 10 Z ",
        "M10.9 19 L10.9 13 Q12 10 13.1 13 L13.1 19 Z ",
        "M10 20 L14 20",
        "M16.8 22 L16.8 5 L19.5 1 L22.2 5 L22.2 22 Z ",
        "M16.8 5 L22.2 5 ",
        "M17.5 7 L21.5 7 ",
        "M19.5 8 L20.6 10 L19.5 12 L18.4 10 Z ",
        "M18.4 19 L18.4 13 Q19.5 10 20.6 13 L20.6 19 Z ",
        "M17.5 20 L21.5 20"
      ].map(P)
    }},
    {id:"codex",stroke:0.82,cap:"round",join:"round",note:"A bound scroll winds around its wax seal; two bookmark leaves turn in sequence and the receiver opens before landing.",icons:{
      back:[
        "M4 12 L12 4 L12 9 L21 9 L21 15 L12 15 L12 20 Z ",
        "M7 12 L7.5 12 ",
        "M18.7 10 L20 10"
      ].map(P),
      reload:[
        "M20 7 C16 1 7 2 4 8 C1 14 5 21 12 21 C17 21 20 18 21 13 L18 13 C17 17 14 19 10 18 C5 17 4 12 7 8 C10 4 15 5 17 8 L14 8 L21 9 L21 3 Z ",
        "M6.7 6.5 L7.6 7.5 ",
        "M17.5 16 L18.5 16.5"
      ].map(P),
      download:[
        "M10 2 L14 2 L14 10 L18 10 L12 18 L6 10 L10 10 Z",
        "M2 15 L4 15 L4 20 L20 20 L20 15 L22 15 L22 22 L2 22 Z ",
        "M3 17 L3 19 ",
        "M21 17 L21 19"
      ].map(P),
      bookmark:[
        {"d":"M5 2 L19 2 L19 23 L12 18 L5 23 Z","h":"M5 2 L19 2 L19 23 L12 19 L5 23 Z","c":"M5 2 L19 2 L19 23 L12 18 L5 23 Z"},
        {"d":"M6.5 2 L6.5 20.4 Q9 18 12 16.7 Q15 18 17.5 20.4 L17.5 2","h":"M6.5 22 L6.5 21 Q9.3 15 14.4 14 Q13.4 9.4 18.7 2 L18.7 22","c":"M6.5 6 L6.5 20.4 Q9.3 21.5 12 18.3 Q14.7 21.5 17.5 20.4 L17.5 6","rate":0.91},
        {"d":"M12 13.4 C10.3 11.7 13.53 9.15 12 5.75 C10.47 9.15 13.7 11.7 12 13.4 ","h":"M12 13.4 C10.3 11.7 13.53 9.15 12 5.75 C10.47 9.15 13.7 11.7 12 13.4 ","c":"M12 13.4 C10.3 11.7 13.53 9.15 12 5.75 C10.47 9.15 13.7 11.7 12 13.4 ","o":[12,10],"t":[[0,0,0,1,1],[1.8,2.4,-30,0.12,0.45],[0,3,0,0.85,0.85]],"rate":1.09},
        {"d":"M12 10.85 C7.75 5.75 7.75 10.85 10.3 10 C11.15 10 11.15 11.7 10.3 12.55 ","h":"M12 10.85 C7.75 5.75 7.75 10.85 10.3 10 C11.15 10 11.15 11.7 10.3 12.55 ","c":"M12 10.85 C7.75 5.75 7.75 10.85 10.3 10 C11.15 10 11.15 11.7 10.3 12.55 ","o":[12,10],"t":[[0,0,0,1,1],[1.8,2.4,-30,0.12,0.45],[0,3,0,0.85,0.85]],"rate":1.09},
        {"d":"M12 10.85 C16.25 5.75 16.25 10.85 13.7 10 C12.85 10 12.85 11.7 13.7 12.55 ","h":"M12 10.85 C16.25 5.75 16.25 10.85 13.7 10 C12.85 10 12.85 11.7 13.7 12.55 ","c":"M12 10.85 C16.25 5.75 16.25 10.85 13.7 10 C12.85 10 12.85 11.7 13.7 12.55 ","o":[12,10],"t":[[0,0,0,1,1],[1.8,2.4,-30,0.12,0.45],[0,3,0,0.85,0.85]],"rate":1.09},
        {"d":"M10.725 11.19 L13.275 11.19","h":"M10.725 11.19 L13.275 11.19","c":"M10.725 11.19 L13.275 11.19","o":[12,10],"t":[[0,0,0,1,1],[1.8,2.4,-30,0.12,0.45],[0,3,0,0.85,0.85]],"rate":1.09},
        {"d":"M5.1 2.1 Q12 2.1 18.9 2.1","h":"M5.1 22.6 Q10.3 17.2 18.9 2.1","c":"M5.1 6 Q12 4.5 18.9 6","rate":1}
      ],
      history:[
        "M12 3 C16.97056275 3 21 7.02943725 21 12 C21 16.97056275 16.97056275 21 12 21 C7.02943725 21 3 16.97056275 3 12 C3 7.02943725 7.02943725 3 12 3 Z",
        "M12 1 L13 3 L12 4 L11 3 Z ",
        "M23 12 L21 13 L20 12 L21 11 Z ",
        "M12 23 L11 21 L12 20 L13 21 Z ",
        "M1 12 L3 11 L4 12 L3 13 Z",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 2 Q4.5 1.5 7.2 2 L7.2 22 Q4.5 22.5 1.7999999999999998 22 Z ",
        "M1.7999999999999998 4 L7.2 4 ",
        "M1.7999999999999998 5.5 L7.2 5.5 ",
        "M1.7999999999999998 18.5 L7.2 18.5 ",
        "M1.7999999999999998 20 L7.2 20 ",
        "M4.5 13.56 C3.7199999999999998 12.78 5.202 11.61 4.5 10.05 C3.798 11.61 5.28 12.78 4.5 13.56 ",
        "M4.5 12.39 C2.55 10.05 2.55 12.39 3.7199999999999998 12 C4.11 12 4.11 12.78 3.7199999999999998 13.17 ",
        "M4.5 12.39 C6.45 10.05 6.45 12.39 5.28 12 C4.89 12 4.89 12.78 5.28 13.17 ",
        "M3.915 12.546 L5.085 12.546",
        "M9.3 2 Q12 1.5 14.7 2 L14.7 22 Q12 22.5 9.3 22 Z ",
        "M9.3 4 L14.7 4 ",
        "M9.3 5.5 L14.7 5.5 ",
        "M9.3 18.5 L14.7 18.5 ",
        "M9.3 20 L14.7 20 ",
        "M12 13.56 C11.22 12.78 12.702 11.61 12 10.05 C11.298 11.61 12.78 12.78 12 13.56 ",
        "M12 12.39 C10.05 10.05 10.05 12.39 11.22 12 C11.61 12 11.61 12.78 11.22 13.17 ",
        "M12 12.39 C13.95 10.05 13.95 12.39 12.78 12 C12.39 12 12.39 12.78 12.78 13.17 ",
        "M11.415 12.546 L12.585 12.546",
        "M16.8 2 Q19.5 1.5 22.2 2 L22.2 22 Q19.5 22.5 16.8 22 Z ",
        "M16.8 4 L22.2 4 ",
        "M16.8 5.5 L22.2 5.5 ",
        "M16.8 18.5 L22.2 18.5 ",
        "M16.8 20 L22.2 20 ",
        "M19.5 13.56 C18.72 12.78 20.202 11.61 19.5 10.05 C18.798 11.61 20.28 12.78 19.5 13.56 ",
        "M19.5 12.39 C17.55 10.05 17.55 12.39 18.72 12 C19.11 12 19.11 12.78 18.72 13.17 ",
        "M19.5 12.39 C21.45 10.05 21.45 12.39 20.28 12 C19.89 12 19.89 12.78 20.28 13.17 ",
        "M18.915 12.546 L20.085 12.546"
      ].map(P)
    }},
    {id:"blood",stroke:0.85,cap:"round",join:"miter",note:"Wing membranes wrap the circular crest; connected tendons, folding wings and a split calyx share fixed joints.",icons:{
      back:[
        "M3 12 C7 9 9 7 12 2 C12 8 14 10 22 12 C15 13 13 14 12 22 C9 18 7 15 3 12 Z ",
        "M8.5 12 L11.7 8 L14.5 12 L11.7 16 Z"
      ].map(P),
      reload:[
        "M12 2 C17 2 21 5 21 10 C19 7 17 6 15 7 C18 8 19 12 18 15 C20 14 21 12 21 11 C22 18 17 22 11 21 L14 19 C9 21 5 19 4 15 C2 17 2 18 2 18 C1 10 6 5 12 4 L9 3 L15 3 C13 5 9 7 7 11 C9 6 15 4 18 8 C17 4 14 3 12 2 Z"
      ].map(P),
      download:[
        "M12 1 C13.5 7 15 9 17 10 L12 18 L7 10 C9 9 10.5 7 12 1 Z ",
        "M7 10 L17 10",
        "M1.5 15 C6 16 6 20 12 20 C18 20 18 16 22.5 15 C20 17 20 19 20.5 22 C17 21 14 22 12 24 C10 22 7 21 3.5 22 C4 19 4 17 1.5 15 Z"
      ].map(P),
      bookmark:[
        {"d":"M12 2 C8.5 7 6 8 4 7 C4 12 4 18 4 23 C6 21.7 8 20.3 9.5 19 C10.5 20.3 11.3 21.7 12 23 C12 17 12 11 12 8 C10.5 10 10.5 10 9.5 12 C8.5 10 8.5 10 7 8","h":"M12 5 C8.5 7 8 3 8 3 C3.5 4 -.7 8 -1.5 13 C2 11 3.5 15.8 4 21 C7 16 9.8 17 12 23 C12 19 12 15 12 12 C10.5 10 9.6 8 9.5 7 C7.7 9 4 9 4 21","c":"M12 2 C8.5 6 5 6 4.5 10 C4.5 12.8 4.5 15.5 4.5 18 C5 17.2 5.6 16.5 6.3 16 C8.5 18.6 10.4 21 12 23 C12 17 12 11 12 2 C10.8 7 10.3 8.5 9.7 12 C9.2 14 8.6 16 8.6 18","rate":1},
        {"d":"M12 2C15.5 7 18 8 20 7C20 12 20 18 20 23C18 21.7 16 20.3 14.5 19C13.5 20.3 12.7 21.7 12 23C12 17 12 11 12 8C13.5 10 13.5 10 14.5 12C15.5 10 15.5 10 17 8","h":"M12 5C15.5 7 16 3 16 3C20.5 4 24.7 8 25.5 13C22 11 20.5 15.8 20 21C17 16 14.2 17 12 23C12 19 12 15 12 12C13.5 10 14.4 8 14.5 7C16.3 9 20 9 20 21","c":"M12 2C15.5 6 19 6 19.5 10C19.5 12.8 19.5 15.5 19.5 18C19 17.2 18.4 16.5 17.7 16C15.5 18.6 13.6 21 12 23C12 17 12 11 12 2C13.2 7 13.7 8.5 14.3 12C14.8 14 15.4 16 15.4 18","rate":1},
        {"d":"M12 4.5 L14.5 8.5 L12 12.5 L9.5 8.5 Z","h":"M12 5.1 L13.4 7.3 L12 9.5 L10.6 7.3 Z","c":"M12 6.8 L14.1 10.6 L12 14.399999999999999 L9.9 10.6 Z","rate":1.15},
        {"d":"M5.3 21 L9.5 17.3 L12 20.4 L14.5 17.3 L18.7 21","h":"M4 21 L8 18.5 L12 23 L16 18.5 L20 21","c":"M8.6 18 L10.3 20.5 L12 23 L13.7 20.5 L15.4 18","rate":0.87}
      ],
      history:[
        "M12 3 C16.97056275 3 21 7.02943725 21 12 C21 16.97056275 16.97056275 21 12 21 C7.02943725 21 3 16.97056275 3 12 C3 7.02943725 7.02943725 3 12 3 Z ",
        "M12 4.3 C16.252592575 4.3 19.7 7.747407425 19.7 12 C19.7 16.252592575 16.252592575 19.7 12 19.7 C7.747407425 19.7 4.3 16.252592575 4.3 12 C4.3 7.747407425 7.747407425 4.3 12 4.3 Z",
        "M12 1 L13 3 L12 4 L11 3 Z ",
        "M23 12 L21 13 L20 12 L21 11 Z ",
        "M12 23 L11 21 L12 20 L13 21 Z ",
        "M1 12 L3 11 L4 12 L3 13 Z",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 2 Q4.5 1.5 7.2 2 L7.2 22 Q4.5 22.5 1.7999999999999998 22 Z ",
        "M1.7999999999999998 4 L7.2 4 ",
        "M1.7999999999999998 5.5 L7.2 5.5 ",
        "M1.7999999999999998 18.5 L7.2 18.5 ",
        "M1.7999999999999998 20 L7.2 20 ",
        "M4.5 8.5 L5.95 12 L4.5 15.5 L3.05 12 Z",
        "M9.3 2 Q12 1.5 14.7 2 L14.7 22 Q12 22.5 9.3 22 Z ",
        "M9.3 4 L14.7 4 ",
        "M9.3 5.5 L14.7 5.5 ",
        "M9.3 18.5 L14.7 18.5 ",
        "M9.3 20 L14.7 20 ",
        "M12 8.5 L13.45 12 L12 15.5 L10.55 12 Z",
        "M16.8 2 Q19.5 1.5 22.2 2 L22.2 22 Q19.5 22.5 16.8 22 Z ",
        "M16.8 4 L22.2 4 ",
        "M16.8 5.5 L22.2 5.5 ",
        "M16.8 18.5 L22.2 18.5 ",
        "M16.8 20 L22.2 20 ",
        "M19.5 8.5 L20.95 12 L19.5 15.5 L18.05 12 Z"
      ].map(P)
    }},
    {id:"moon",stroke:0.84,cap:"round",join:"round",note:"Eclipse disks pass in front and behind; paired satellites cross the bookmark frame while the pendant stays fixed.",icons:{
      back:[
        "M3 12 L15 2 C12 7 12 17 15 22 L3 12 Z ",
        "M14.5 10 L22 12 L14.5 14 ",
        "M12.5 9 C14.15685425 9 15.5 10.34314575 15.5 12 C15.5 13.65685425 14.15685425 15 12.5 15 C10.84314575 15 9.5 13.65685425 9.5 12 C9.5 10.34314575 10.84314575 9 12.5 9 Z"
      ].map(P),
      reload:[
        "M14 3 C8 2 3 7 3 12 C3 17 7 21 12 21 C16 21 20 18 21 14 C17 18 11 18 8 14 C5 10 8 4 14 3 Z"
      ].map(P),
      download:[
        "M10 2 L14 2 L14 7 L17 7 L12 15 L7 7 L10 7 Z ",
        "M12 0 L13 2 L11 2 Z",
        "M3 12 C6 22 18 22 21 12 C23 26 1 26 3 12 Z ",
        "M12 16.7 C13.270254925 16.7 14.3 17.729745075 14.3 19 C14.3 20.270254925 13.270254925 21.3 12 21.3 C10.729745075 21.3 9.7 20.270254925 9.7 19 C9.7 17.729745075 10.729745075 16.7 12 16.7 Z"
      ].map(P),
      bookmark:[
        {"d":"M5 2 L19 2 L19 23 L12 18 L5 23 Z","h":"M4.5 2 L19.5 2 L19 23 L12 18.8 L5 23 Z","c":"M5 2 L19 2 L19 23 L12 18 L5 23 Z","rate":0.92},
        {"d":"M12 3.7 C7 3.5 5.4 7.5 6.7 11.5 C8 15.5 13.7 16.2 16.5 12.7 C17.4 11.6 17.5 10.1 17.5 9 C17.5 9 17.5 9 17.5 9 ","h":"M12 2.5 C6.7 2.4 3.7 6.7 5 11.5 C6.3 16.3 13 18.1 17.2 14.5 C19 13 19 9.9 18.3 8.5 C18.3 8.5 18.3 8.5 18.3 8.5 ","c":"M12 4 C8.7 4 6 6.7 6 10 C6 13.3 8.7 16 12 16 C15.3 16 18 13.3 18 10 C18 6.7 15.3 4 12 4 ","rate":1.04},
        {"d":"M17.5 9 C15 12 9.6 11.1 9.3 7.8 C9 6 10 4.5 12 3.7 C12 3.7 12 3.7 12 3.7 C12 3.7 12 3.7 12 3.7","h":"M18.3 8.5 C16 11.9 10.1 10.9 9.5 7.5 C9.1 5.5 10 3.3 12 2.5 C12 2.5 12 2.5 12 2.5 C12 2.5 12 2.5 12 2.5","c":"M15 10 C15 11.7 13.7 13 12 13 C10.3 13 9 11.7 9 10 C9 8.3 10.3 7 12 7 C13.7 7 15 8.3 15 10","rate":1.04},
        {"d":"M12 16.5 L12 19.3 ","h":"M12 16.5 L12 19.3 ","c":"M12 16.5 L12 19.3 ","t":[[0,0,0,1,1],[0,0.25,0,1,1],[0,-0.3,0,1,1]],"rate":1.13},
        {"d":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","h":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","c":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","t":[[0,0,0,1,1],[0,0.25,0,1,1],[0,-0.3,0,1,1]],"rate":1.13},
        {"d":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","h":"M1.6 9 C2.317970175 9 2.9000000000000004 9.582029825000001 2.9000000000000004 10.3 C2.9000000000000004 11.017970175 2.317970175 11.600000000000001 1.6 11.600000000000001 C0.882029825 11.600000000000001 0.30000000000000004 11.017970175 0.30000000000000004 10.3 C0.30000000000000004 9.582029825000001 0.882029825 9 1.6 9 Z","c":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","rate":0.92},
        {"d":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","h":"M22.4 9 C23.117970175 9 23.7 9.582029825000001 23.7 10.3 C23.7 11.017970175 23.117970175 11.600000000000001 22.4 11.600000000000001 C21.682029824999997 11.600000000000001 21.099999999999998 11.017970175 21.099999999999998 10.3 C21.099999999999998 9.582029825000001 21.682029824999997 9 22.4 9 Z","c":"M12 19.3 C12.938884075 19.3 13.7 20.061115925 13.7 21 C13.7 21.938884075 12.938884075 22.7 12 22.7 C11.061115925 22.7 10.3 21.938884075 10.3 21 C10.3 20.061115925 11.061115925 19.3 12 19.3 Z","rate":1.08}
      ],
      history:[
        "M12 3 C16.97056275 3 21 7.02943725 21 12 C21 16.97056275 16.97056275 21 12 21 C7.02943725 21 3 16.97056275 3 12 C3 7.02943725 7.02943725 3 12 3 Z",
        "M12 1.6999999999999997 C12.607513225 1.6999999999999997 13.1 2.192486775 13.1 2.8 C13.1 3.4075132249999998 12.607513225 3.9 12 3.9 C11.392486775 3.9 10.9 3.4075132249999998 10.9 2.8 C10.9 2.192486775 11.392486775 1.6999999999999997 12 1.6999999999999997 Z ",
        "M21.2 10.9 C21.807513225 10.9 22.3 11.392486775 22.3 12 C22.3 12.607513225 21.807513225 13.1 21.2 13.1 C20.592486774999998 13.1 20.099999999999998 12.607513225 20.099999999999998 12 C20.099999999999998 11.392486775 20.592486774999998 10.9 21.2 10.9 Z ",
        "M12 20.099999999999998 C12.607513225 20.099999999999998 13.1 20.592486774999998 13.1 21.2 C13.1 21.807513225 12.607513225 22.3 12 22.3 C11.392486775 22.3 10.9 21.807513225 10.9 21.2 C10.9 20.592486774999998 11.392486775 20.099999999999998 12 20.099999999999998 Z ",
        "M2.8 10.9 C3.4075132249999998 10.9 3.9 11.392486775 3.9 12 C3.9 12.607513225 3.4075132249999998 13.1 2.8 13.1 C2.192486775 13.1 1.6999999999999997 12.607513225 1.6999999999999997 12 C1.6999999999999997 11.392486775 2.192486775 10.9 2.8 10.9 Z",
        "M2 11 C1 18 6 23 12 23",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 2 Q4.5 1.5 7.2 2 L7.2 22 Q4.5 22.5 1.7999999999999998 22 Z ",
        "M1.7999999999999998 4 L7.2 4 ",
        "M1.7999999999999998 5.5 L7.2 5.5 ",
        "M1.7999999999999998 18.5 L7.2 18.5 ",
        "M1.7999999999999998 20 L7.2 20 ",
        "M5.7 9 C2.2 8 2.1 15 5.8 14 C3.7 13 3.8 10 5.7 9 Z",
        "M9.3 2 Q12 1.5 14.7 2 L14.7 22 Q12 22.5 9.3 22 Z ",
        "M9.3 4 L14.7 4 ",
        "M9.3 5.5 L14.7 5.5 ",
        "M9.3 18.5 L14.7 18.5 ",
        "M9.3 20 L14.7 20 ",
        "M13.2 9 C9.7 8 9.6 15 13.3 14 C11.2 13 11.3 10 13.2 9 Z",
        "M16.8 2 Q19.5 1.5 22.2 2 L22.2 22 Q19.5 22.5 16.8 22 Z ",
        "M16.8 4 L22.2 4 ",
        "M16.8 5.5 L22.2 5.5 ",
        "M16.8 18.5 L22.2 18.5 ",
        "M16.8 20 L22.2 20 ",
        "M20.7 9 C17.2 8 17.1 15 20.8 14 C18.7 13 18.8 10 20.7 9 Z"
      ].map(P)
    }},
    {id:"deco",stroke:0.8,cap:"butt",join:"miter",note:"Mirrored sector fans sweep around a fixed hub; paired leaves and stepped receiver gates keep their exact symmetry.",icons:{
      back:[
        "M3 12 L13 2 L13 7 L8 12 L13 17 L13 22 Z ",
        "M8 12 L21 12 ",
        "M11 9 L21 9 L21 15 L11 15"
      ].map(P),
      reload:[
        "M20 7 C16 1 7 2 4 8 C1 14 5 21 12 21 C17 21 20 18 21 13 L18 13 C17 17 14 19 10 18 C5 17 4 12 7 8 C10 4 15 5 17 8 L14 8 L21 9 L21 3 Z ",
        "M12 2 L12 4 ",
        "M5 5 L6.5 6.5 ",
        "M2 12 L4 12 ",
        "M5 19 L6.5 17.5 ",
        "M12 21 L12 18.5 ",
        "M19 18 L17 16.5"
      ].map(P),
      download:[
        "M10 2 L14 2 L14 10 L18 10 L12 18 L6 10 L10 10 Z ",
        "M12 3 L12 4",
        "M2 16 L4 16 L4 19 L6 19 L6 21 L18 21 L18 19 L20 19 L20 16 L22 16 L22 23 L2 23 Z"
      ].map(P),
      bookmark:[
        {"d":"M3 11 L6 10 L12 23 Z","h":"M1.9 11 L5.5 10 L12 23 Z","c":"M2.7 11.3 L5.9 10.2 L12 23 Z","rate":0.9,"o":[12,23],"t":[[0,0,0,1,1],[0,0,-13,1,1],[0,0,14,1,1]]},
        {"d":"M21 11L18 10L12 23Z","h":"M22.1 11L18.5 10L12 23Z","c":"M21.3 11.3L18.1 10.2L12 23Z","rate":1,"o":[12,23],"t":[[0,0,0,1,1],[0,0,12,1,1],[0,0,-14,1,1]]},
        {"d":"M4.6 8 L7.4 7.2 L12 23 Z","h":"M3.4999999999999996 8 L6.9 7.2 L12 23 Z","c":"M4.3 8.3 L7.300000000000001 7.4 L12 23 Z","rate":0.9500000000000001,"o":[12,23],"t":[[0,0,0,1,1],[0,0,-11,1,1],[0,0,14,1,1]]},
        {"d":"M19.4 8L16.6 7.2L12 23Z","h":"M20.5 8L17.1 7.2L12 23Z","c":"M19.7 8.3L16.7 7.4L12 23Z","rate":1.05,"o":[12,23],"t":[[0,0,0,1,1],[0,0,10,1,1],[0,0,-14,1,1]]},
        {"d":"M6.2 5.2 L8.8 4.6 L12 23 Z","h":"M5.1 5.2 L8.3 4.6 L12 23 Z","c":"M5.9 5.5 L8.700000000000001 4.8 L12 23 Z","rate":1,"o":[12,23],"t":[[0,0,0,1,1],[0,0,-9,1,1],[0,0,14,1,1]]},
        {"d":"M17.8 5.2L15.2 4.6L12 23Z","h":"M18.9 5.2L15.7 4.6L12 23Z","c":"M18.1 5.5L15.299999999999999 4.8L12 23Z","rate":1.1,"o":[12,23],"t":[[0,0,0,1,1],[0,0,8,1,1],[0,0,-14,1,1]]},
        {"d":"M7.5 2 L16.5 2 L12 23 Z","h":"M7.2 2 L16.8 2 L12 23 Z","c":"M9.5 5 L14.5 5 L12 23 Z","rate":1.05,"o":[12,23],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M9.2 3.5 L12 3.5 L14.8 3.5 L12 22 L9.2 3.5 Z","h":"M9 3.5 L12 3.5 L15 3.5 L12 22 L9 3.5 Z","c":"M10.2 7 L12 6 L13.8 7 L12 22 L10.2 7 Z","rate":1.15,"o":[12,23],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ],
      history:[
        "M12 2 C17.5228475 2 22 6.4771525 22 12 C22 17.5228475 17.5228475 22 12 22 C6.4771525 22 2 17.5228475 2 12 C2 6.4771525 6.4771525 2 12 2 Z ",
        "M12 4 C16.418278 4 20 7.581722 20 12 C20 16.418278 16.418278 20 12 20 C7.581722 20 4 16.418278 4 12 C4 7.581722 7.581722 4 12 4 Z",
        "M12 2 L12 4 ",
        "M19.1 4.9 L17.7 6.3 ",
        "M22 12 L20 12 ",
        "M19.1 19.1 L17.7 17.7 ",
        "M12 22 L12 20 ",
        "M4.9 19.1 L6.3 17.7 ",
        "M2 12 L4 12 ",
        "M4.9 4.9 L6.3 6.3",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 2 Q4.5 1.5 7.2 2 L7.2 22 Q4.5 22.5 1.7999999999999998 22 Z ",
        "M1.7999999999999998 4 L7.2 4 ",
        "M1.7999999999999998 5.5 L7.2 5.5 ",
        "M1.7999999999999998 18.5 L7.2 18.5 ",
        "M1.7999999999999998 20 L7.2 20 ",
        "M1.7999999999999998 7 L4.5 9.5 L7.2 7 ",
        "M1.7999999999999998 17 L4.5 14.5 L7.2 17 ",
        "M4.5 9.5 L4.5 14.5 ",
        "M3.5 8.5 L3.5 15.5 ",
        "M5.5 8.5 L5.5 15.5",
        "M9.3 2 Q12 1.5 14.7 2 L14.7 22 Q12 22.5 9.3 22 Z ",
        "M9.3 4 L14.7 4 ",
        "M9.3 5.5 L14.7 5.5 ",
        "M9.3 18.5 L14.7 18.5 ",
        "M9.3 20 L14.7 20 ",
        "M9.3 7 L12 9.5 L14.7 7 ",
        "M9.3 17 L12 14.5 L14.7 17 ",
        "M12 9.5 L12 14.5 ",
        "M11 8.5 L11 15.5 ",
        "M13 8.5 L13 15.5",
        "M16.8 2 Q19.5 1.5 22.2 2 L22.2 22 Q19.5 22.5 16.8 22 Z ",
        "M16.8 4 L22.2 4 ",
        "M16.8 5.5 L22.2 5.5 ",
        "M16.8 18.5 L22.2 18.5 ",
        "M16.8 20 L22.2 20 ",
        "M16.8 7 L19.5 9.5 L22.2 7 ",
        "M16.8 17 L19.5 14.5 L22.2 17 ",
        "M19.5 9.5 L19.5 14.5 ",
        "M18.5 8.5 L18.5 15.5 ",
        "M20.5 8.5 L20.5 15.5"
      ].map(P)
    }},
    {id:"pixel",stroke:0.95,cap:"butt",join:"miter",note:"Stepped blocks orbit and dock into an open ring; a piston shaft and sliding receiver gates stay rectilinear.",icons:{
      back:[
        "M3 10 L5 10 L5 8 L7 8 L7 6 L9 6 L9 4 L12 4 L12 8 L21 8 L21 16 L12 16 L12 20 L9 20 L9 18 L7 18 L7 16 L5 16 L5 14 L3 14 Z"
      ].map(P),
      reload:[
        "M9 2 L16 2 L16 4 L19 4 L19 6 L21 6 L21 10 L17 10 L17 8 L15 8 L15 7 L9 7 L9 9 L7 9 L7 15 L9 15 L9 17 L15 17 L15 16 L17 16 L17 14 L21 14 L21 18 L19 18 L19 20 L16 20 L16 22 L9 22 L9 20 L6 20 L6 18 L4 18 L4 6 L6 6 L6 4 L9 4 Z"
      ].map(P),
      download:[
        "M9 2 L15 2 L15 8 L18 8 L18 11 L16 11 L16 13 L14 13 L14 15 L10 15 L10 13 L8 13 L8 11 L6 11 L6 8 L9 8 Z",
        "M2 15 L4 15 L4 20 L20 20 L20 15 L22 15 L22 22 L2 22 Z"
      ].map(P),
      bookmark:[
        {"d":"M6.5 2 L17.5 2 L17.5 3.5 L19 3.5 L19 22 L17 22 L17 20.5 L15.5 20.5 L15.5 19 L13.5 19 L13.5 17 L10.5 17 L10.5 19 L8.5 19 L8.5 20.5 L7 20.5 L7 22 L5 22 L5 3.5 L6.5 3.5 Z","h":"M4.5 1.5 L19.5 1.5 L19.5 3 L21 3 L21 22 L19 22 L19 20.5 L17.5 20.5 L17.5 19 L13.5 19 L13.5 15 L10.5 15 L10.5 19 L6.5 19 L6.5 20.5 L5 20.5 L5 22 L3 22 L3 3 L4.5 3 Z","c":"M8 5 L16 5 L16 6.5 L17.5 6.5 L17.5 22 L15.5 22 L15.5 20.5 L14 20.5 L14 19 L13.5 19 L13.5 18.5 L10.5 18.5 L10.5 19 L10 19 L10 20.5 L8.5 20.5 L8.5 22 L6.5 22 L6.5 6.5 L8 6.5 Z"}
      ],
      history:[
        "M8 2 L16 2 L16 3.5 L19 3.5 L19 5 L21 5 L21 8 L22 8 L22 16 L21 16 L21 19 L19 19 L19 21 L16 21 L16 22 L8 22 L8 21 L5 21 L5 19 L3 19 L3 16 L2 16 L2 8 L3 8 L3 5 L5 5 L5 3.5 L8 3.5 Z",
        "M12 6 L12 12 L16 15"
      ].map(P),
      library:[
        "M1.7999999999999998 2 L7.2 2 L7.2 22 L1.7999999999999998 22 Z ",
        "M1.7999999999999998 5 L7.2 5 ",
        "M1.7999999999999998 7 L7.2 7 ",
        "M1.7999999999999998 18 L7.2 18",
        "M9.3 2 L14.7 2 L14.7 22 L9.3 22 Z ",
        "M9.3 5 L14.7 5 ",
        "M9.3 7 L14.7 7 ",
        "M9.3 18 L14.7 18",
        "M16.8 2 L22.2 2 L22.2 22 L16.8 22 Z ",
        "M16.8 5 L22.2 5 ",
        "M16.8 7 L22.2 7 ",
        "M16.8 18 L22.2 18"
      ].map(P)
    }}
  ];
  const set=(parts,values)=>parts.forEach(p=>Object.assign(p,values));
  const pointIndex=(d,x,y)=>{
    const n=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number);
    for(let i=0;i<n.length;i+=2)if(n[i]===x&&n[i+1]===y)return i;
    throw Error('Missing attachment '+x+','+y);
  };
  const downloadParts={cathedral:2,codex:1,blood:2,moon:2,deco:2,pixel:1};
  for(const theme of themes){
    const {id,icons}=theme;
    const backMotion=T([-1,0,0,1,1],[-2,0,0,1,1]);
    set(icons.back,{role:'arrow',attach:id+'-back',t:backMotion});
    const shaft=(d,hinge,end)=>{
      let i=0;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,n=>String(i++%2||+n<=hinge?+n:hinge+(+n-hinge)*(end-hinge)/(21-hinge)));
    };
    if(['cathedral','codex','pixel'].includes(id)){
      icons.back.forEach(p=>{p.h=shaft(p.d,12,23.5);p.c=shaft(p.d,12,18.5);});
    }else if(id==='deco'){
      icons.back.slice(1).forEach(p=>{p.h=shaft(p.d,11,23.5);p.c=shaft(p.d,11,18.5);});
    }else if(id==='blood'){
      Object.assign(icons.back[1],{role:'sliding-seal',attach:'blood-back-seal',t:T([-1.8,0,0,1,1],[-3.8,0,0,1,1])});
    }else if(id==='moon'){
      icons.back[1].h='M14.5 10 L24 12 L14.5 14';icons.back[1].c='M14.5 10 L19 12 L14.5 14';
      Object.assign(icons.back[2],{role:'sliding-orb',attach:'moon-back-orb',t:T([-1.6,0,0,1,1],[-3.2,0,0,1,1])});
    }

    if(['cathedral','codex'].includes(id)){
      const head='M4 12 L12 4 L12 9 L12 15 L12 20 Z';icons.back[0].d=icons.back[0].h=icons.back[0].c=head;
      const project=(d,degrees)=>xy(d,(x,y)=>{const a=degrees*Math.PI/180,dx=x-12,z=dx*Math.sin(a),scale=1/(1-z/50);return[12+dx*Math.cos(a)*scale,12+(y-12)*scale];});
      const panel='M12 9 L21 9 L21 15 L12 15 Z';
      icons.back.push(A(panel,project(panel,-40),project(panel,-100),{role:'hinged-shaft',t:backMotion,occludedBy:[0],seams:[{part:0,point:0,other:4},{part:0,point:6,other:6}]}));
      icons.back[2].h=project(icons.back[2].d,-40);icons.back[2].c=project(icons.back[2].d,-100);icons.back[2].occludedBy=[0];
    }else if(id==='blood'){
      const link=end=>{const a=[12,2],b=[end,8],dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.hypot(dx,dy),u=(4.4**2-2.5**2+distance**2)/(2*distance),v=Math.sqrt(4.4**2-u*u),elbow=[a[0]+u*dx/distance+v*dy/distance,a[1]+u*dy/distance-v*dx/distance];return`M${a} L${elbow} L${b}`;};
      const states=[link(11.7),link(10.9),link(9.9)];
      for(let side=0;side<2;side++){const paths=states.map(d=>side?xy(d,(x,y)=>[x,24-y]):d);icons.back.push(A(...paths,{role:'tension-linkage',t:backMotion,w:.7,seams:[{part:0,point:0,other:pointIndex(icons.back[0].d,12,side?22:2)},{part:1,point:4,other:side?6:2}]}));}
    }else if(id==='moon'){
      const d='M15.5 12 L19 10 L22 12 L19 14 Z';
      Object.assign(icons.back[1],{d,h:d,c:d,role:'hinged-comet-tail',attach:'moon-comet-tail',o:[15.5,12],t:T([-1.6,0,18,1,1],[-3.2,0,-22,1,1]),occludedBy:[2],seams:[{part:2,point:0,other:pointIndex(icons.back[2].d,15.5,12)}]});
    }else if(id==='deco'){
      icons.back[1].d='M8 12 L11 12 L21 12';icons.back[1].h='M8 12 L11 12 L23.5 12';icons.back[1].c='M8 12 L11 12 L18.5 12';
      for(let side=0;side<2;side++){const sign=side?1:-1,d=side?'M11 12 L11 15 L21 15 Z':'M11 12 L11 9 L21 9 Z';icons.back.push({...P(d),role:'folding-shaft-leaf',o:[11,12],t:T([-1,0,sign*16,1,1],[-2,0,sign*34,1,1]),seams:[{part:1,point:0,other:2}]});}
    }else if(id==='pixel'){
      icons.back.push(A('M17 8 L21 8 L21 16 L17 16 Z','M19.5 8 L23.5 8 L23.5 16 L19.5 16 Z','M14.5 8 L18.5 8 L18.5 16 L14.5 16 Z',{role:'sliding-shaft-cap',t:backMotion,seams:[{part:0,point:2,other:pointIndex(icons.back[0].d,21,8)},{part:0,point:4,other:pointIndex(icons.back[0].d,21,16)}]}));
    }

    // Each family has its own circular mechanism, with no generic arrow glyph.
    if(id==='cathedral'){
      const out=[{...P(circle(12,12,2.3)),role:'rosette-hub'},P('M12 10 L12 14 M10 12 L14 12')];
      for(let i=0;i<6;i++){
        const angle=i*60,root=polar(4,angle-90),inner=polar(2.3,angle-90),link=out.length;
        out.push({...P(`M${inner} L${root}`),role:'tracery-jamb'});
        const leaf=out.length,motion=T([0,0,13,1,1],[0,0,38,1,1]),beats={hover:[[0,'rest'],[70+i*55,'hover']],click:[[0,'rest'],[70+i*65,'click'],[680+i*40,'hover']]};
        out.push({...P(rotate('M12 8 C8.8 7.7 8.7 4.8 12 2.7 C15.3 4.8 15.2 7.7 12 8 Z',angle)),role:'hinged-rosette-petal',o:root,t:motion,attach:'rosette-'+i,beats,seams:[{part:link,point:0,other:2}]});
        out.push({...P(rotate('M12 8 L12 4.4',angle)),role:'tracery-latch',o:root,t:motion,attach:'rosette-'+i,beats,w:.65,seams:[{part:leaf,point:0,other:0}]});
      }
      icons.reload=out;
    }else if(id==='codex'){
      const track={ellipse:[12,12,8.6,8.6,0]},span=[.30,.48,.76],start=.12;
      const body=wrap('M0 0','bound-parchment',track,start,span,'trail',{width:2,taper:1});
      const roll=wrap('M0 -1 C1.8 -1 1.8 1 0 1 C-.7 .9 -.7 -.9 0 -1 Z','scroll-roll',track,start,span,'head',{anchor:[0,0],heading:0});
      body.attach=roll.attach='codex-scroll';body.occludedBy=[1];
      const lip=wrap('M.15 -.55 C.9 -.55 .9 .55 .15 .55','rolled-page-edge',track,start,span,'head',{anchor:[0,0],heading:0});lip.attach='codex-scroll';lip.w=.65;
      const out=[body,roll,lip,{...P(circle(12,12,3.1)),role:'wax-seal'},P('M12 9.7 C10 9 9.5 11 11 11.5 C9 11.7 10.2 13.2 12 12.5 C13.8 13.2 15 11.7 13 11.5 C14.5 11 14 9 12 9.7 L12 14.4')];
      for(const offset of [.07,.17])out.push({...P('M-.5 -.7 L.5 -.7 M-.5 .2 L.3 .2'),role:'bound-scroll-engraving',w:.55,flow:{track,mode:'head',start:start+offset,anchor:[0,0],heading:0}});
      const tail=polar(8.6,start*360),pin=polar(3.1,start*360);out.push({...P(`M${pin} L${tail}`),role:'binding-cord',w:.65});
      icons.reload=out;
    }else if(id==='blood'){
      const out=[{...P(circle(12,12,3.5)),role:'circular-crest'},P('M12 8.5 L14 12 L12 15.5 L10 12 Z')],track={ellipse:[12,12,8.4,8.4,0]},span=[.045,.11,.17];
      for(let side=0;side<2;side++){
        const start=side?0:.5,direction=side?-1:1,anchor=polar(8.4,start*360),pin=polar(3.5,start*360);
        out.push({...P(`M${pin} L${anchor}`),role:'wing-tendon',w:.7});
        const body=wrap('M0 0','wrapping-membrane',track,start,span,'trail',{direction,width:2.4,taper:.4});
        const claw=wrap('M0 -1.2 C1.4 -2.4 3 -1.5 3.2 0 C2 .1 1.5 1.1 1.3 2 C.5 1.1 .1 1.1 0 1.2 Z','wing-fingers',track,start,span,'head',{direction,anchor:[0,0],heading:0});
        const rib=wrap('M0 0 Q1.8 -.7 3.2 0','membrane-rib',track,start,span,'head',{direction,anchor:[0,0],heading:0});rib.w=.65;
        const index=out.length;body.occludedBy=[index+1];body.attach=claw.attach=rib.attach='blood-wrap-'+side;
        out.push(body,claw,rib);
      }
      icons.reload=out;
    }else if(id==='moon'){
      const out=[{...P(circle(12,12,3.6)),role:'lunar-disk'},P('M12 8.4 C9.4 9.5 9.4 14.5 12 15.6')];
      const orbit={ellipse:[12,12,3.8,3.8,0]},disk=circle(0,0,1.9);
      out.push({...P(disk),role:'eclipse-back',turn:360,hoverTurn:.2,flow:{track:orbit,mode:'head',start:0,anchor:[0,0],layer:'back'},occludedBy:[0]});
      out.push({...P(disk),role:'eclipse-front',turn:360,hoverTurn:.2,flow:{track:orbit,mode:'head',start:0,anchor:[0,0],layer:'front'}});
      out[0].occludedBy=out[1].occludedBy=[3];
      out.push({...P('M0 0'),role:'eclipse-corona',turn:360,hoverTurn:.2,flow:{track:{ellipse:[12,12,9.1,9.1,0]},mode:'trail',start:.08,span:[.64,.52,.76],width:.65,taper:1}});
      out.push({...P(circle(0,0,1.1)),role:'outer-moon',turn:360,hoverTurn:.2,flow:{track:{ellipse:[12,12,9.1,9.1,0]},mode:'head',start:.08,anchor:[0,0]}});
      out[4].occludedBy=[5];
      icons.reload=out;
    }else if(id==='deco'){
      const out=[{...P('M12 9 L15 12 L12 15 L9 12 Z'),role:'fan-hub'}];
      for(let i=0;i<3;i++)for(let side=0;side<2;side++){
        const angle=150+i*30,points=[polar(9.3,angle-10),polar(9.3,angle+10)],d=`M12 12 L${points[0]} L${points[1]} Z`,mirror=d=>xy(d,(x,y)=>[24-x,y]),sign=side?-1:1;
        const shape=side?mirror(d):d,tip=polar(8.2,angle),line=`M12 12 L${tip}`,motion=T([0,0,sign*(13+i*8),1,1],[0,0,sign*(48+i*9),1,1]),beats={hover:[[0,'rest'],[70+i*90,'hover']],click:[[0,'hover'],[100+i*110,'click'],[740+(2-i)*70,'hover']]};
        const leaf=out.length;out.push({...P(shape),role:'circular-fan-sector',o:[12,12],t:motion,occludedBy:[0],attach:'deco-sector-'+i+'-'+side,beats});
        out.push({...P(side?mirror(line):line),role:'sector-engraving',o:[12,12],t:motion,occludedBy:[0],attach:'deco-sector-'+i+'-'+side,beats,w:.6,seams:[{part:leaf,point:0,other:0}]});
      }
      icons.reload=out;
    }else if(id==='pixel'){
      const out=[P('M10 10 L14 10 L14 14 L10 14 Z')],track={ellipse:[12,12,8.6,8.6,0]};
      for(let i=0;i<8;i++){
        const phase=(i%2?.006:-.006),start=.035+i*.10,delta=.14-i*.012;
        out.push({...P('M-1.25 -.9 L.65 -.9 L.65 -.45 L1.25 -.45 L1.25 .9 L-.65 .9 L-.65 .45 L-1.25 .45 Z'),role:'assembling-block',flow:{track,mode:'head',start,phase:[0,phase,delta],anchor:[0,0],heading:0},t:[[0,i%2?2.1:0,0,1,1],[0,1.0,0,1,1],[0,0,0,1,1]],poses:{dock:{base:2},release:{base:1}},beats:{hover:[[0,'rest'],[65+i*45,'hover']],click:[[0,'hover'],[70+(7-i)*65,'dock'],[870+i*20,'release']]}});
      }
      icons.reload=out;
    }
    const arrowCount=downloadParts[id];
    set(icons.download.slice(0,arrowCount),{role:'arrow',attach:id+'-download-arrow',t:T([0,.8,0,1,1],[0,['moon','pixel'].includes(id)?5.5:4.2,0,1,1])});
    const receiver={
      cathedral:{base:'M2 20 L5 20 L19 20 L22 20 L22 22 L2 22 Z',gate:'M5 20 L2 15 L5 18 Z',root:[5,20],angle:[-18,-36]},
      codex:{base:'M2 20 L4 20 L20 20 L22 20 L22 22 L2 22 Z',gate:'M4 20 L2 20 L2 15 L4 15 Z',root:[4,20],angle:[-22,-36]},
      blood:{base:'M12 20 L12 24',gate:'M12 24 C10 22 7 21 3.5 22 C4 19 4 17 1.5 15 C6 16 6 20 12 20 Z',root:[12,24],angle:[-14,-24]},
      moon:{base:'M12 21.3 L12 22.5',gate:'M12 22.5 C6.5 22.5 2 19 3 12 C4.5 17 8.25 19.5 12 19.5 Z',root:[12,22.5],angle:[-10,-18]},
      deco:{base:'M2 21 L6 21 L18 21 L22 21 L22 23 L2 23 Z',gate:'M6 21 L6 19 L4 19 L4 16 L2 16 L2 21 Z',root:[6,21],angle:[-16,-28]},
      pixel:{base:'M0 20 L24 20 L24 22 L0 22 Z',gate:'M2 20 L2 15 L4 15 L4 20 Z',root:[2,20],angle:[0,0]}
    }[id];
    const baseIndex=arrowCount,basePart={...P(receiver.base),role:'receiver-base'},receiverParts=[basePart];
    for(let side=0;side<2;side++){
      const mirror=d=>xy(d,(x,y)=>[24-x,y]),root=side?[24-receiver.root[0],receiver.root[1]]:receiver.root,d=side?mirror(receiver.gate):receiver.gate;
      const motion=id==='pixel'?T([side?1:-1,0,0,1,1],[side?2:-2,0,0,1,1]):T([0,0,(side?-1:1)*receiver.angle[0],1,1],[0,0,(side?-1:1)*receiver.angle[1],1,1]);
      receiverParts.push({...P(d),role:id==='pixel'?'sliding-receiver-gate':'hinged-receiver-gate',attach:id+'-receiver-gate-'+side,o:root,t:motion,...(id==='pixel'?{}:{seams:[{part:baseIndex,point:0,other:pointIndex(receiver.base,...root)}]})});
    }
    if(id==='codex')for(let side=0;side<2;side++){const gate=receiverParts[side+1];receiverParts.push({...P(side?'M21 17 L21 19':'M3 17 L3 19'),role:'receiver-engraving',attach:gate.attach,o:gate.o,t:gate.t,w:.65});}
    if(id==='moon')receiverParts.push({...P(circle(12,19,2.3)),role:'fixed-lunar-clasp'});
    icons.download=[...icons.download.slice(0,arrowCount),...receiverParts];
    const hands=icons.history.pop().d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g).map(Number),handIndex=icons.history.length;
    set(icons.history,{role:'frame',attach:id+'-clock-face'});
    icons.history.push(
      {...P(`M12 12 L${hands[0]} ${hands[1]}`),role:'hand',hand:'minute',attach:id+'-minute-hand',o:[12,12],turn:-360,hoverTurn:.18},
      {...P(`M12 12 L${hands[4]} ${hands[5]}`),role:'hand',hand:'hour',attach:id+'-hour-hand',o:[12,12],turn:-30,hoverTurn:.18,seams:[{part:handIndex,point:0,other:0}]}
    );
    const lip=id==='moon'?19.5:id==='deco'?21:20,interior=icons.download.length;
    icons.download.push({...P(`M-4 ${lip} L28 ${lip} L28 32 L-4 32 Z`),role:'container-interior',maskOnly:true});
    icons.download.slice(0,arrowCount).forEach(p=>p.occludedBy=id==='moon'?[interior,arrowCount+3]:[interior]);
    const perBook=icons.library.length/3;
    for(let i=0;i<3;i++){
      const base=i*perBook,group=icons.library.slice(base,base+perBook),sign=i-1;
      const motion={
        cathedral:T([0,i===1?-.6:0,sign*4,1,1],[0,i===1?-1.5:0,sign*8,1,1]),
        blood:T([sign*.5,i===1?-1.2:-.3,sign*2,1,1],[sign*1.2,i===1?-3.2:-.8,sign*5,1,1]),
        moon:T([sign*.4,[-.7,-1.5,-.3][i],sign*1.5,1,1],[sign*.8,[-2.3,-.8,-3][i],sign*3,1,1]),
        deco:T([0,i===1?-.8:0,sign*3,1,1],[0,i===1?-1.8:0,sign*7,1,1]),
        pixel:T([sign*.4,i===1?-1.2:0,0,1,1],[sign*.8,i===1?-3:0,0,1,1]),
        codex:T([i===2?1.6:sign*.7,0,0,1,1],[i===2?3.4:sign*1.2,0,0,1,1])
      }[id];
      set(group,{role:'book',attach:id+'-volume-'+i,o:[4.5+i*7.5,22],t:motion});
    }
    if(id==='codex'){
      // A visible narrow binding and page fore-edge make this a front-facing book.
      const base=perBook,group=icons.library.slice(base,base+perBook),hinge=9.5;
      const coverMotion=T([0,0,0,.5,1],[0,0,0,-.45,1]);
      group.forEach((p,j)=>{
        const front=d=>d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,(()=>{let i=0;return n=>String(i++%2?+n:hinge+(+n-9.3)*5.7/5.4);})());
        p.d=p.h=p.c=front(p.d);
        Object.assign(p,{role:'book-cover',attach:'codex-front-cover',projection:'page',o:[hinge,2],t:coverMotion});
        if(j)p.opacity=[1,1,0];
      });
      const spine=icons.library.length;
      icons.library.push({...P('M8.6 2 L9.5 2 L9.5 22 L8.6 22 Z'),role:'fixed-binding'});
      icons.library[base].seams=[{part:spine,point:0,other:2},{part:spine,point:10,other:4}];
      const leaf=icons.library.length;
      icons.library.push({...P('M9.5 2 L15.2 2 L15.2 22 L9.5 22 Z'),role:'bound-page',projection:'page',o:[hinge,2],t:T([0,0,0,.85,1],[0,0,0,.35,1]),opacity:[0,1,1],w:.7,occludedBy:[base],seams:[{part:spine,point:0,other:2},{part:spine,point:6,other:4}]});
      icons.library.push({...P('M9.5 2 L15.2 2 L16.1 2.9 L16.1 21.1 L15.2 22 L9.5 22 Z'),role:'page-block',w:.8,occludedBy:[base,leaf]});
      icons.library.push({...P('M15.2 2 L15.2 22'),role:'fore-edge',w:.7,occludedBy:[base,leaf]});
    }
    const bookmark=icons.bookmark;
    bookmark.forEach(p=>{p.role='bookmark';p.rate=1;});
    const closedMask=p=>({...p,d:p.d.trim().endsWith('Z')?p.d:p.d+' Z',h:p.h.trim().endsWith('Z')?p.h:p.h+' Z',c:p.c.trim().endsWith('Z')?p.c:p.c+' Z',maskOnly:true,role:'surface-mask'});
    if(id==='cathedral'){
      bookmark[0].h=bookmark[0].c=bookmark[0].d;bookmark[0].role='fixed-arch';
      const distance=70,hingeY=15,ratio=4.5/5.3,skew=4.5/distance,angle=Math.acos(ratio/Math.hypot(1,skew))-Math.atan(skew);
      for(let side=0;side<2;side++){
        const panel=bookmark[side+1],hingeX=side?17.3:6.7,restAngle=side?angle:-angle;
        const initial=(panel.d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number);
        const material=[];
        for(let j=0;j<initial.length;j+=2){const dx=initial[j]-hingeX,mx=dx/(Math.cos(restAngle)+dx*Math.sin(restAngle)/distance);material.push(mx,(initial[j+1]-hingeY)*(1-mx*Math.sin(restAngle)/distance));}
        const point=(x,y,a,thickness=0)=>{const dx=x*Math.cos(a)-thickness*Math.sin(a),z=x*Math.sin(a)+thickness*Math.cos(a),scale=1/(1-z/distance);return[hingeX+dx*scale,hingeY+y*scale];};
        const at=a=>{let j=0;const values=[];for(let k=0;k<material.length;k+=2)values.push(...point(material[k],material[k+1],a));return panel.d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>String(values[j++]));};
        const openAngle=(side?68:-68)*Math.PI/180;
        panel.h=at(openAngle);panel.c=at(0);panel.role='hinged-gate';
        const edge=a=>{const top=point(material[6],material[7],a),bottom=point(material[8],material[9],a),backBottom=point(material[8],material[9],a,.45),backTop=point(material[6],material[7],a,.45);return`M${top} L${bottom} L${backBottom} L${backTop} Z`;};
        bookmark.push(A(edge(restAngle),edge(openAngle),edge(0),{role:'gate-thickness',opacity:[0,1,1],occludedBy:[1,2],w:.75,seams:[{part:side+1,point:0,other:6},{part:side+1,point:2,other:8}]}));
      }
      bookmark[3].h=bookmark[3].c=bookmark[3].d;
      Object.assign(bookmark[3],{role:'gate-latch',t:T([0,-.45,0,1,1],[0,1.4,0,1,1])});
    } else if(id==='codex'){
      const pageMotion=T([0,0,0,.72,1],[0,0,0,-.25,1]);
      bookmark.forEach(p=>{p.h=p.c=p.d;delete p.t;delete p.o;});
      set(bookmark.slice(1,6),{role:'turning-page',projection:'page',attach:'codex-bound-leaf',o:[6.5,2],t:pageMotion});
      bookmark.slice(2,6).forEach(p=>p.opacity=[1,1,0]);
      const mask=bookmark.length;
      bookmark.push(closedMask(bookmark[1]));
      const rear={...P(bookmark[1].d+' Z'),role:'rear-page',o:[6.5,2],t:T([0,0,0,.94,1],[0,0,0,-.7,1]),opacity:[0,1,1],occludedBy:[mask],w:.75};
      bookmark.push(rear);
      bookmark.push(A('M17.5 2 L17.5 20.4 L17.5 20.4 L17.5 2 Z','M14.42 2 L14.42 20.4 L15.22 19.8 L15.22 2.6 Z','M3.75 2 L3.75 20.4 L3.1 19.6 L3.1 2.8 Z',{role:'page-thickness',opacity:[0,1,1],occludedBy:[mask],w:.7,seams:[{part:1,point:0,other:12},{part:1,point:2,other:10}]}));
    } else if(id==='moon'){
      bookmark[0].h=bookmark[0].c=bookmark[0].d;
      for(let side=0;side<2;side++){
        const p=bookmark[side+5],d=p.h;
        Object.assign(p,{d,h:d,c:d,role:'orbiting-body-back',attach:'moon-orbit-body-'+side,turn:360,hoverTurn:.5,opacity:[0,1,1],occludedBy:[0],flow:{track:{ellipse:[12,10.3,10.4,7.6,-15]},mode:'head',layer:'back',start:side*.5,anchor:[side?22.4:1.6,10.3],heading:0,scaleByDepth:.08}});
      }

      for(let side=0;side<2;side++){const front={...bookmark[side+5],role:'orbiting-body-front',flow:{...bookmark[side+5].flow,layer:'front'}};delete front.occludedBy;bookmark.push(front);}
      bookmark.slice(0,5).forEach(p=>p.occludedBy=[7,8]);
      [3,4].forEach(i=>bookmark[i].t=T(I,I));
    } else if(id==='deco'){
      bookmark.forEach(p=>{p.h=p.c=p.d;});
      for(let i=0;i<6;i+=2){const a=bookmark[i],b=bookmark[i+1];for(const key of ['d','h','c']){let j=0;b[key]=a[key].replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,n=>String(j++%2?+n:24-+n));}b.t=a.t.map(t=>[-t[0],t[1],-t[2],t[3],t[4]]);}
      [[2,4,6],[3,5,6],[4,6],[5,6],[6],[6]].forEach((front,i)=>bookmark[i].occludedBy=front);
    }
    if(id==='blood'){
      // One fixed bat membrane per side; perspective changes both width and depth.
      const surfaces=bookmark.slice(0,2).map(p=>p.h),angles=[[-58,-12,-110],[-55,-28,-106]];
      const project=(d,angle)=>{
        const radians=angle*Math.PI/180,co=Math.cos(radians),si=Math.sin(radians);
        const values=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number),points=[];
        for(let i=0;i<values.length;i+=2){const dx=values[i]-12,scale=1/(1-dx*si/60);points.push(12+dx*co*scale,12+(values[i+1]-12)*scale);}
        let i=0;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>String(points[i++]));
      };
      const surface=(d,side,more={})=>A(...angles[side].map(a=>project(d,a)),{role:'wing-surface',projection:'wing',rate:1,...more});
      const left=surface(surfaces[0],0,{occludedBy:[2]}),right=surface(surfaces[1],1,{occludedBy:[5,2]});
      const crest={...P(bookmark[2].d),role:'fixed-crest'};
      const leftRib=surface('M4 21 L8 18.5 L12 23',0,{role:'wing-rib',occludedBy:[2],seams:[{part:0,point:0,other:18},{part:0,point:4,other:24}]});
      const rightRib=surface('M12 23 L16 18.5 L20 21',1,{role:'wing-rib',occludedBy:[5,2],seams:[{part:1,point:0,other:24},{part:1,point:4,other:18}]});
      const nearOutline=surfaces[0].match(/[MLCQ][^MLCQZ]+/g).slice(0,5).join(' ')+' L12 5 Z';
      const nearMask=surface(nearOutline,0,{role:'near-membrane-mask',maskOnly:true});
      right.seams=[0,24,26,28,30].map(point=>({part:0,point,other:point}));
      bookmark.splice(0,bookmark.length,left,right,crest,leftRib,rightRib,nearMask);
    }
    if(id==='pixel'){
      const poses=['d','h','c'].map(k=>bookmark[0][k].match(/[ML][^MLZ]+/g).map(s=>(s.slice(1).match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number)));
      // Split halfway along straight edges so the original miter corners stay intact.
      const ranges=[[0,10],[10,17],[17,20]];
      icons.bookmark=ranges.map(([start,end])=>{
        const shape=points=>{
          const mid=i=>{const a=points[i%20],b=points[(i+1)%20];return [(a[0]+b[0])/2,(a[1]+b[1])/2];};
          const p=[mid(start)];
          for(let j=start+1;j<=end;j++)p.push(points[j%20]);
          p.push(mid(end));
          return p.map((xy,j)=>(j?'L':'M')+xy.join(' ')).join(' ');
        };
        return A(shape(poses[0]),shape(poses[1]),shape(poses[2]),{role:'stepped-panel',attach:'pixel-assembled-frame'});
      });
      icons.bookmark[1].seams=[{part:0,point:0,other:22}];
      icons.bookmark[2].seams=[{part:1,point:0,other:16},{part:0,point:8,other:0}];

    }
    // Finite authored actions retarget the shared spring; attached parts share timing.
    icons.back.forEach(p=>{
      p.poses={preload:{base:p.role==='tension-linkage'?0:2,t:[0,0,0,1,1]},release:{base:1,t:[p.t[1][0]-1,0,0,1,1]}};
      p.beats={hover:[[0,'preload'],[110,'hover']],click:[[0,'preload'],[90,'click'],[330,'release']],leave:[[0,'release'],[120,'rest']]};
    });
    icons.download.forEach((p,i)=>{
      if(p.maskOnly)return;
      p.beats=i<arrowCount?{hover:[[0,'rest'],[140,'hover']],click:[[0,'hover'],[140,'click']]}:
        {hover:[[0,'hover']],click:[[0,'click'],[480,'hover']]};
    });
    icons.library.forEach(p=>{
      const match=p.attach?.match(/-volume-(\d)$/);
      if(match){const middle=+match[1]===1;p.beats={hover:[[0,'rest'],[middle?150:60,'hover']],click:[[0,'hover'],[middle?170:70,'click']]};}
      if(id==='codex'&&p.attach==='codex-front-cover')p.beats={hover:[[0,'rest'],[180,'hover']],click:[[0,'hover'],[200,'click']]};
      if(id==='codex'&&p.role==='bound-page')p.beats={hover:[[0,'rest'],[260,'hover']],click:[[0,'hover'],[360,'click']]};
    });
    const parts=icons.bookmark;
    if(id==='cathedral'){
      [1,2,4,5].forEach(i=>parts[i].beats={hover:[[0,'rest'],[180,'hover']],click:[[0,'click'],[200,'hover']]});
      parts[3].poses={unlatch:{base:1,t:[0,-1.1,0,1,1]},settle:{base:1}};
      parts[3].beats={hover:[[0,'unlatch'],[390,'settle']],click:[[0,'click'],[130,'unlatch'],[430,'settle']]};
    }else if(id==='codex'){
      [1,2,3,4,5,7,9].forEach(i=>parts[i].beats={hover:[[0,'rest'],[100,'hover']],click:[[0,'hover'],[160,'click'],[700,'click']]});
      parts[8].beats={hover:[[0,'rest'],[220,'hover']],click:[[0,'hover'],[380,'click'],[720,'click']]};
    }else if(id==='blood'){
      const near={hover:[[0,'rest'],[100,'hover']],click:[[0,'hover'],[300,'hover'],[430,'click'],[920,'hover']]};
      const far={hover:[[0,'rest'],[150,'hover']],click:[[0,'hover'],[300,'hover'],[490,'click'],[980,'hover']]};
      [0,3,5].forEach(i=>parts[i].beats=near);[1,4].forEach(i=>parts[i].beats=far);
    }else if(id==='moon'){
      [1,2].forEach(i=>parts[i].beats={hover:[[0,'rest'],[100,'hover']],click:[[0,'hover'],[160,'click'],[620,'hover']]});
      [3,4].forEach(i=>parts[i].beats={hover:[[0,'hover']],click:[[0,'click'],[450,'hover']]});
      [5,6,7,8].forEach(i=>parts[i].beats={hover:[[0,'rest'],[160,'hover']],click:[[0,'hover'],[160,'click']]});
    }else if(id==='deco'){
      parts.forEach((p,i)=>{const pair=Math.min(3,Math.floor(i/2)),spread=90+pair*80,close=450+(3-pair)*60;
        p.beats={hover:[[0,'rest'],[spread,'hover']],click:[[0,'click'],[spread,'hover'],[close,'click'],[820+pair*50,'hover']]};
      });
    }else if(id==='pixel'){
      parts.forEach(p=>p.beats={hover:[[0,'click'],[150,'hover']],click:[[0,'hover'],[170,'click'],[560,'hover']]});
    }
    theme.demo=icons.bookmark;
  }
  motionThemes.push(...themes);
})();
