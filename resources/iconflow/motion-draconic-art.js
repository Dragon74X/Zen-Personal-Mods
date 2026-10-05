/* Authored dragon poses; connected contours use shared anchor trajectories. */
(() => {
  const I=[0,0,0,1,1],themes=[
    {"id":"wyvern","stroke":1.05,"cap":"round","join":"round",icons:{
      back:[
        {"d":"M2 12 L10 5 L8.5 5 L12 2.8 L13 1.6 L15 2 L13.3 3.7 L13.2 5.3 L11.8 7.6 L22 8.5 L20.3 11.1 L20.3 13.1 L22 15.8 L12 15 L14.5 22 Z"},
        {"d":"M2 12 L12 12 C15 10.5 18 9.1 22 8.5 M12 12 C15 11.7 18 12.7 22 15.8 M12 12 L14.5 22 M12 12 L11.8 7.6","w":0.85},
        {"d":"M13.4 2.7 L13.700000000000001 2.95","w":1.3},
      ],
      reload:[
        {"d":"M19.5 7.1 L18.2 5 L15 3.2 L13.4 1.3 L13.5 3 L9 1.7 L11.3 4 C5 2.5 1.8 6.3 2.6 11.6 L4.2 10.1 C4.5 16.8 9 21.5 15 20 C17.4 19.4 19.7 17.3 20 15 L17 15 L23 11.5 L21.3 18 L20.9 15.7 C18 23.1 8.7 24 4.4 18.4 C1 14 .8 5.5 6.9 3.9 C11.6 2.7 13.7 4.4 16.1 4.6 L19 6.2 L20.5 8.7 L19.5 8 L18.8 8.8 L18.2 7.8 Z"},
        {"d":"M3.2 8.4 L1 6.2 L5.6 6.2 M3.2 13.4 L2.1 15.4 L4.2 15.1 M6.6 19.5 L6.1 21.5 L8.6 20.7","w":0.8},
        {"d":"M17.2 5.8 L17.5 6.05","w":1.3},
      ],
      download:[
        {"d":"M10.5 2 L13.5 2 L13.5 10 L17 10 L12 16 L7 10 L10.5 10 Z"},
        {"d":"M3 9 C.5 12 1 15 2.3 18 L3.1 15.7 L5 17 L5 20 L19 20 L19 17 L20.9 15.7 L21.7 18 C23 15 23.5 12 21 9 C21.7 12.5 20.7 13.8 18.5 14.5 L18.5 17.5 L5.5 17.5 L5.5 14.5 C3.3 13.8 2.3 12.5 3 9 Z"},
      ],
      bookmark:[
        {"d":"M6 4 C4.5 5.5 2 7 2 11 C1.6 13 2 15 2.5 16 C3 13 4 11.5 5 13 C5.8 12.8 6.5 13 7 14 L7 5 Z","h":"M6 4 C1 4.7 -3 7 -6 11.5 C-2.2 9.8 -1 11.2 -.7 14 C1.6 12 3.3 12.5 4.3 15 C5 12 6 12 7 13 L7 5 Z","c":"M6 4 C3 5.4 1.5 8 1 9 C1.4 13 2.6 18 5 21 C4.2 17.4 5 14.4 5.5 15 C6.1 12.4 6.5 11 7.6 10 L7.6 5 Z","rate":1},
        {"d":"M6 4 C3.7 7 3 9.3 2.5 16 M6 4 C5 7 4.8 10 5 13 M6 4 C6.5 8 6 11 7 14","h":"M6 4 C1 5.6 -.4 9.4 -.7 14 M6 4 C2 6.8 3.2 11 4.3 15 M6 4 C5.5 7 6 10 7 13","c":"M6 4 C3.7 9 3 14.3 5 21 M6 4 C4.5 9 4.8 12 5.5 15 M6 4 C6.7 6.8 7 8 7.6 10","w":0.85,"rate":1},
        {"d":"M6 4 C4.5 5.5 2 7 2 11 C1.6 13 2 15 2.5 16 C3 13 4 11.5 5 13 C5.8 12.8 6.5 13 7 14 L7 5 Z","h":"M6 4 C1 4.7 -3 7 -6 11.5 C-2.2 9.8 -1 11.2 -.7 14 C1.6 12 3.3 12.5 4.3 15 C5 12 6 12 7 13 L7 5 Z","c":"M6 4 C3 5.4 1.5 8 1 9 C1.4 13 2.6 18 5 21 C4.2 17.4 5 14.4 5.5 15 C6.1 12.4 6.5 11 7.6 10 L7.6 5 Z","t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
        {"d":"M6 4 C3.7 7 3 9.3 2.5 16 M6 4 C5 7 4.8 10 5 13 M6 4 C6.5 8 6 11 7 14","h":"M6 4 C1 5.6 -.4 9.4 -.7 14 M6 4 C2 6.8 3.2 11 4.3 15 M6 4 C5.5 7 6 10 7 13","c":"M6 4 C3.7 9 3 14.3 5 21 M6 4 C4.5 9 4.8 12 5.5 15 M6 4 C6.7 6.8 7 8 7.6 10","w":0.85,"t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
        {"d":"M7 5 L17 5 L17 23 L12 19 L7 23 Z","h":"M7 5 L17 5 L17 23 L12 19 L7 23 Z","c":"M7.6 5 L16.4 5 L16.4 23 L12 19 L7.6 23 Z","rate":1},
        {"d":"M7 5 L6.2 3 L6.2 1 L5.4 3 L5.7 5","h":"M7 5 L6 3 L6.3 1 L5.2 3.5 L5.7 5","c":"M7.6 5 L6.3 3 L6.3 1 L5.2 3.5 L5.7 5","rate":1},
        {"d":"M17 5 L17.8 3 L17.8 1 L18.6 3 L18.3 5","h":"M17 5 L18 3 L17.7 1 L18.8 3.5 L18.3 5","c":"M16.4 5 L17.7 3 L17.7 1 L18.8 3.5 L18.3 5","rate":1},
        {"d":"M12 8 L14 12.5 L12 17 L10 12.5 Z","h":"M12 5.4 L14 10.5 L12 16.5 L10 10.5 Z","c":"M12 7 L14 12 L12 17 L10 12 Z","rate":1},
        {"d":"M12 11.2 L12 14.5","h":"M12 12.2 L12 14.5","c":"M12 11 L12 14.8","w":0.8,"rate":1},
      ],
      history:[
        {"d":"M19.5 7 L18.5 5 L15 3.2 L13.5 1.3 L13.8 3 L9.5 1.8 L11.2 3.8 C5 3.1 2 7 2.1 12 C2.2 18 6.5 22 12 22 C17.5 22 21.6 18.2 22 12 L23 11.1 L20.5 11 L19.6 12 L20.4 12.3 C20 17 16.8 20 12 20 C7.3 20 4 16.6 4 12 C4 7.5 7 5 11.2 5 C13 4.9 14 5.8 15.4 5.6 L17.7 7 L19.1 8.5 L20.5 8.7 L20 7.6 Z"},
        {"d":"M5.5 5.2 L3.5 4.3 L4 6.6 M2.2 10 L.7 10.8 L2.2 12 M3.7 17 L2.9 18.8 L5 18.8 M9 21.5 L10 23 L11 22 M19 19 L21 19 L20.4 17","w":0.8},
        {"d":"M17.6 6.2 L17.900000000000002 6.45","w":1.3},
        {"d":"M12 6 L12 12 L16 15"},
      ],
      library:[
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 C10 5 11 5 12 4.5 C13 5 14 5 15 4 M9 20 C10 21 14 21 15 20","t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M12 7 L13.4 11 L12 15 L10.6 11 Z","w":0.88,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M15 4 C15 8 15 16 15 20","w":0.75,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 C10 5 11 5 12 4.5 C13 5 14 5 15 4 M9 20 C10 21 14 21 15 20"},
        {"d":"M12 7 L13.4 11 L12 15 L10.6 11 Z","w":0.88},
        {"d":"M15 4 C15 8 15 16 15 20","w":0.75},
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 C10 5 11 5 12 4.5 C13 5 14 5 15 4 M9 20 C10 21 14 21 15 20","t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M12 7 L13.4 11 L12 15 L10.6 11 Z","w":0.88,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 4 C9 8 9 16 9 20","w":0.75,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
      ],
    },demo:[
      {"d":"M6 4 C4.5 5.5 2 7 2 11 C1.6 13 2 15 2.5 16 C3 13 4 11.5 5 13 C5.8 12.8 6.5 13 7 14 L7 5 Z","h":"M6 4 C1 4.7 -3 7 -6 11.5 C-2.2 9.8 -1 11.2 -.7 14 C1.6 12 3.3 12.5 4.3 15 C5 12 6 12 7 13 L7 5 Z","c":"M6 4 C3 5.4 1.5 8 1 9 C1.4 13 2.6 18 5 21 C4.2 17.4 5 14.4 5.5 15 C6.1 12.4 6.5 11 7.6 10 L7.6 5 Z","rate":1},
      {"d":"M6 4 C3.7 7 3 9.3 2.5 16 M6 4 C5 7 4.8 10 5 13 M6 4 C6.5 8 6 11 7 14","h":"M6 4 C1 5.6 -.4 9.4 -.7 14 M6 4 C2 6.8 3.2 11 4.3 15 M6 4 C5.5 7 6 10 7 13","c":"M6 4 C3.7 9 3 14.3 5 21 M6 4 C4.5 9 4.8 12 5.5 15 M6 4 C6.7 6.8 7 8 7.6 10","w":0.85,"rate":1},
      {"d":"M6 4 C4.5 5.5 2 7 2 11 C1.6 13 2 15 2.5 16 C3 13 4 11.5 5 13 C5.8 12.8 6.5 13 7 14 L7 5 Z","h":"M6 4 C1 4.7 -3 7 -6 11.5 C-2.2 9.8 -1 11.2 -.7 14 C1.6 12 3.3 12.5 4.3 15 C5 12 6 12 7 13 L7 5 Z","c":"M6 4 C3 5.4 1.5 8 1 9 C1.4 13 2.6 18 5 21 C4.2 17.4 5 14.4 5.5 15 C6.1 12.4 6.5 11 7.6 10 L7.6 5 Z","t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
      {"d":"M6 4 C3.7 7 3 9.3 2.5 16 M6 4 C5 7 4.8 10 5 13 M6 4 C6.5 8 6 11 7 14","h":"M6 4 C1 5.6 -.4 9.4 -.7 14 M6 4 C2 6.8 3.2 11 4.3 15 M6 4 C5.5 7 6 10 7 13","c":"M6 4 C3.7 9 3 14.3 5 21 M6 4 C4.5 9 4.8 12 5.5 15 M6 4 C6.7 6.8 7 8 7.6 10","w":0.85,"t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
      {"d":"M7 5 L17 5 L17 23 L12 19 L7 23 Z","h":"M7 5 L17 5 L17 23 L12 19 L7 23 Z","c":"M7.6 5 L16.4 5 L16.4 23 L12 19 L7.6 23 Z","rate":1},
      {"d":"M7 5 L6.2 3 L6.2 1 L5.4 3 L5.7 5","h":"M7 5 L6 3 L6.3 1 L5.2 3.5 L5.7 5","c":"M7.6 5 L6.3 3 L6.3 1 L5.2 3.5 L5.7 5","rate":1},
      {"d":"M17 5 L17.8 3 L17.8 1 L18.6 3 L18.3 5","h":"M17 5 L18 3 L17.7 1 L18.8 3.5 L18.3 5","c":"M16.4 5 L17.7 3 L17.7 1 L18.8 3.5 L18.3 5","rate":1},
      {"d":"M12 8 L14 12.5 L12 17 L10 12.5 Z","h":"M12 5.4 L14 10.5 L12 16.5 L10 10.5 Z","c":"M12 7 L14 12 L12 17 L10 12 Z","rate":1},
      {"d":"M12 11.2 L12 14.5","h":"M12 12.2 L12 14.5","c":"M12 11 L12 14.8","w":0.8,"rate":1},
    ]},
    {"id":"wyrm","stroke":1.05,"cap":"round","join":"round",icons:{
      back:[
        {"d":"M1.7 12 L8.7 6.4 L9.4 4.3 L11.5 3.7 L14 1.5 L13 4.8 L11.5 6.8 L13 6 L11.9 8.2 L10 9.8 C16 5.8 21 6 23 11 C20 8.8 18 10 17.5 13.8 C19 17.7 23.5 20 23 17 C22.5 15 21 17 22 17.3 C22.5 21 18 21 16.5 17 C13.7 16 11.3 16.2 9.5 17 L10 21 Z"},
        {"d":"M7.8 12.5 C12 14.5 16 9.2 21 9.5 M7.8 12.5 C10.5 14 13 13.4 17.5 13.8 M7.8 12.5 L9.5 17","w":0.8},
      ],
      reload:[
        {"d":"M19.8 6.5 L17.5 4 L14 2.8 L12 1 L12.6 3 L7.5 1.9 L9.5 3.4 C3 3 1 8.4 1.7 13.6 C2.7 20.3 8.6 23 14.4 21.3 C19 20 23 15.2 22.1 11.1 C21.3 8.3 17.8 9 17.8 11.4 C17.8 13.4 20.5 13 20.4 11.6 C22.2 15.1 16.4 20.4 12 20 C6.5 19.7 3.7 16.4 3.7 11.5 C3.7 6.9 7.2 4.8 11 5 C13 5.1 14.1 6.4 16.1 5.8 L18.5 7.4 L18.7 8.4 L20 8 Z"},
        {"d":"M2.2 9 L1 10.5 L2 12 M2.6 16.6 L2.4 19 L4.5 19 M8.1 21.3 L10 22.6 L10.8 21.8","w":0.8},
        {"d":"M17 5.4 L17.3 5.65","w":1.3},
      ],
      download:[
        {"d":"M10.5 2 L13.5 2 L13.5 10 L17 10 L12 16 L7 10 L10.5 10 Z"},
        {"d":"M5 7 C9 11 1 12 4 15 C5 16 7 16 5.5 19.5 M5 7 C6.3 11 -.5 14 3 17 C4 18 5 17 3 18"},
        {"d":"M19 7 C15 11 23 12 20 15 C19 16 17 16 18.5 19.5 M19 7 C17.7 11 24.5 14 21 17 C20 18 19 17 21 18"},
        {"d":"M3 18 L5.5 18 L5.5 19.5 L18.5 19.5 L18.5 18 L21 18 L21 22 L3 22 Z"},
      ],
      bookmark:[
        {"d":"M5 5 L5 7.7 M5 14 L5 23 L12 18 M12 18 L19 23 L19 4 L17 5.2","h":"M5 4 L5 7.7 M5 12 L5 23 L12 18 M12 18 L19 23 L19 4 L17 5.2","c":"M5 4 L5 6.5 M5 17.6 L5 23 L8.2 20.8 M16 20.8 L19 23 L19 4 L18 4.8","rate":1},
        {"d":"M19 7 C23 10 22 13 19 15 M19 9 C21 11 20.5 12 19 13","h":"M19 8 C23 11 22 14 19 16 M19 10 C21 12 20.5 13 19 14","c":"M19 9 C24 13 20.5 15.5 14.4 18 M19 11 C22 13.2 18 15.5 13 16.5","rate":1},
        {"d":"M10 3.2 C5 2.2 2 4.2 3 8 C3.5 10 6 10.8 9 12 C13 14 10 18 5 19.5 L5 21 C12 18.5 15 15 12 11 C10 8.5 4.7 9.2 5 6 C5.2 3.5 8 3 10.5 3.5 C12 4.5 13 5.3 14 5.3 L15 6.5 L16 6 L15 5 L15.3 4 L13.5 2.5 L12.5 2 L12 0 L11.3 1.7 L9 .8 L9.8 2.5 Z","h":"M12 -1 C8 -1 4 2 4 6 C4 9 6.5 10 9.5 12 C13 14.5 11 17.5 9 19 L10.5 20 C15 16.8 16 12.8 12 10 C9.3 8 6.2 7.5 6.4 4.5 C6.8 1.9 10 .3 13 .8 C14.2 1.5 15 2 17 .5 L18 .5 L20 -.3 L19 -1.3 L19.4 -2.3 L17 -2.8 L15.5 -2.5 L13 -4 L13.7 -2.2 L10 -2.6 L11.8 -1 Z","c":"M12 4 C8 2.5 4 4 3.5 8 C2 12 4 15 10 17 C15 19 14 23 10 22.5 L9 21 C13 22 11 19 8 18 C1 16 1 10 5 7 C7 4 10 4 13 5.8 C14.2 6.5 15 7 17 5.5 L18 5.5 L20 4.7 L19 3.7 L19.4 2.7 L17 2.2 L15.5 2.5 L13 1 L13.7 2.8 L10 2.4 L11.8 4 Z","rate":1},
        {"d":"M13.3 3.4 L13.6 3.7","h":"M17 -1.5 L17.3 -1.3","c":"M17 3.5 L17.3 3.7","w":1.2,"rate":1},
      ],
      history:[
        {"d":"M18.8 5.8 L16 3.4 L13.2 2.4 L11.3 .8 L12 3 L8.7 1.8 L9.8 3.3 C4.2 3.1 1.6 7.5 1.6 12.7 C1.6 19 6.2 22.5 12 22.5 C17.8 22.5 21.5 18 21.8 12.6 L23 10.9 L20.5 11.7 L19.5 13 L20.3 12.8 C20 17 16.7 20.6 12 20.6 C7 20.6 3.7 17.3 3.7 12.5 C3.7 8 6.1 5 10.5 5 C13 5 13.5 6.1 15.2 5.9 L17.4 7 L18.3 8.5 L20 8.9 L19.2 7.5 Z"},
        {"d":"M2.3 8.7 C3.4 8.5 4.1 8.2 4.7 7.9 M2.3 16.3 C3.1 15.7 3.6 15.4 4.3 15.3 M6.3 21.4 C6.7 20.6 7.1 20.2 7.6 20 M16.7 21.3 C16.3 20.6 15.9 20.3 15.4 20.1","w":0.85},
        {"d":"M16.9 5.7 L17.2 5.95","w":1.3},
        {"d":"M12 6 L12 12 L16 15"},
      ],
      library:[
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 L11 4 L12 5 L13 4 L15 4 M9 20 C10.5 21 13.5 21 15 20","t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M12.5 7 C8.5 11 15.5 10.5 12.5 16 C17 12 10.2 11.5 12.5 7 Z","w":0.88,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M15 4 C15 8 15 16 15 20","w":0.75,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 L11 4 L12 5 L13 4 L15 4 M9 20 C10.5 21 13.5 21 15 20"},
        {"d":"M12.5 7 C8.5 11 15.5 10.5 12.5 16 C17 12 10.2 11.5 12.5 7 Z","w":0.88},
        {"d":"M15 4 C15 8 15 16 15 20","w":0.75},
        {"d":"M9 2 C9 1 15 1 15 2 L15 22 C15 23 9 23 9 22 Z M9 2 C9 3 15 3 15 2 M9 4 L11 4 L12 5 L13 4 L15 4 M9 20 C10.5 21 13.5 21 15 20","t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M12.5 7 C8.5 11 15.5 10.5 12.5 16 C17 12 10.2 11.5 12.5 7 Z","w":0.88,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 4 C9 8 9 16 9 20","w":0.75,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
      ],
    },demo:[
      {"d":"M5 5 L5 7.7 M5 14 L5 23 L12 18 M12 18 L19 23 L19 4 L17 5.2","h":"M5 4 L5 7.7 M5 12 L5 23 L12 18 M12 18 L19 23 L19 4 L17 5.2","c":"M5 4 L5 6.5 M5 17.6 L5 23 L8.2 20.8 M16 20.8 L19 23 L19 4 L18 4.8","rate":1},
      {"d":"M19 7 C23 10 22 13 19 15 M19 9 C21 11 20.5 12 19 13","h":"M19 8 C23 11 22 14 19 16 M19 10 C21 12 20.5 13 19 14","c":"M19 9 C24 13 20.5 15.5 14.4 18 M19 11 C22 13.2 18 15.5 13 16.5","rate":1},
      {"d":"M10 3.2 C5 2.2 2 4.2 3 8 C3.5 10 6 10.8 9 12 C13 14 10 18 5 19.5 L5 21 C12 18.5 15 15 12 11 C10 8.5 4.7 9.2 5 6 C5.2 3.5 8 3 10.5 3.5 C12 4.5 13 5.3 14 5.3 L15 6.5 L16 6 L15 5 L15.3 4 L13.5 2.5 L12.5 2 L12 0 L11.3 1.7 L9 .8 L9.8 2.5 Z","h":"M12 -1 C8 -1 4 2 4 6 C4 9 6.5 10 9.5 12 C13 14.5 11 17.5 9 19 L10.5 20 C15 16.8 16 12.8 12 10 C9.3 8 6.2 7.5 6.4 4.5 C6.8 1.9 10 .3 13 .8 C14.2 1.5 15 2 17 .5 L18 .5 L20 -.3 L19 -1.3 L19.4 -2.3 L17 -2.8 L15.5 -2.5 L13 -4 L13.7 -2.2 L10 -2.6 L11.8 -1 Z","c":"M12 4 C8 2.5 4 4 3.5 8 C2 12 4 15 10 17 C15 19 14 23 10 22.5 L9 21 C13 22 11 19 8 18 C1 16 1 10 5 7 C7 4 10 4 13 5.8 C14.2 6.5 15 7 17 5.5 L18 5.5 L20 4.7 L19 3.7 L19.4 2.7 L17 2.2 L15.5 2.5 L13 1 L13.7 2.8 L10 2.4 L11.8 4 Z","rate":1},
      {"d":"M13.3 3.4 L13.6 3.7","h":"M17 -1.5 L17.3 -1.3","c":"M17 3.5 L17.3 3.7","w":1.2,"rate":1},
    ]},
    {"id":"dragonforged","stroke":1.05,"cap":"butt","join":"miter",icons:{
      back:[
        {"d":"M2 12 L5.5 9.1 L6.8 9 L9.7 6 L9.2 8 L13.1 3 L12 8.6 L22 8.6 L19 12 L22 15.5 L12 15.5 L13 21 L7.3 15 L5.9 13.4 L4.5 13.4 L3.5 14 Z"},
        {"d":"M10.5 12 L14 8.6 M10.5 12 L14 15.5 M14 12 L17.5 8.6 M14 12 L17.5 15.5 M2 12 L4.3 11.5","w":0.85},
      ],
      reload:[
        {"d":"M19.3 6.6 L18.1 4.1 L14.5 2.2 L12.4 .6 L13 3 L9 1.4 L10.5 4 C6.8 3.3 3.5 5.3 2 8.5 L1 13 L2.4 17.5 L5.7 21 L10 22.5 L15 22 L19.3 19.2 L21.5 15.5 L22 11.8 L20 14.5 C17.8 19.5 12.5 21.5 8 18.7 C4 16.2 3.6 10 7 7.1 C9 5.4 12 5.3 14 6.2 L17 6.8 L18.2 8.3 L19 9.8 L20.2 8.7 L21.8 9 L21.9 7.6 Z"},
        {"d":"M3.4 6.9 L5.7 8 M7.7 3.7 L8.7 5.9 M1.5 11 L4.4 12.5 M2.5 17.6 L5.3 16.6 M6 21.1 L8.1 18.8 M11 22.4 L10.6 20 M17.1 21 L15.9 19 M21 16.5 L18.6 17.1","w":0.85},
        {"d":"M18 5.6 L18.3 5.85","w":1.3},
      ],
      download:[
        {"d":"M10.5 2 L13.5 2 L13.5 10 L17 10 L12 16 L7 10 L10.5 10 Z"},
        {"d":"M4 8 L1.5 11.5 L1 17.3 L4.5 21 L19.5 21 L23 17.3 L22.5 11.5 L20 8 L20.8 12.5 L17.8 17.5 L6.2 17.5 L3.2 12.5 Z M4.5 21 L6.2 17.5 M19.5 21 L17.8 17.5 M1.5 11.5 L4.5 16 M22.5 11.5 L19.5 16"},
      ],
      bookmark:[
        {"d":"M7 6 L6.2 5 L6 11 L6.2 20 L7 21 Z","h":"M7 6 L3 4.6 L.6 10.3 L3.8 18.7 L4 8 Z","c":"M7 8 L6.2 8.5 L6 12 L6.2 17.5 L7 18 Z","rate":1},
        {"d":"M7 6 L6.2 5 L6 11 L6.2 20 L7 21 Z","h":"M7 6 L3 4.6 L.6 10.3 L3.8 18.7 L4 8 Z","c":"M7 8 L6.2 8.5 L6 12 L6.2 17.5 L7 18 Z","t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
        {"d":"M7 5 L17 5 L17 23 L12 18.5 L7 23 Z","h":"M7 4.4 L17 4.4 L17 23 L12 17.5 L7 23 Z","c":"M7 8 L17 8 L17 18 L12 24 L7 18 Z","rate":1},
        {"d":"M8.6 6 L8.6 21.5 M15.4 6 L15.4 21.5","h":"M8.6 5.4 L8.6 21.5 M15.4 5.4 L15.4 21.5","c":"M8.6 9 L8.6 17.5 M15.4 9 L15.4 17.5","w":0.85,"rate":1},
        {"d":"M7 5 L5 3.7 L4.5 2.5 L6.2 -.2 L6 3 L8 4.6","h":"M7 4.4 L4.7 3.1 L4 1.7 L5.8 -.8 L5.7 2.4 L8 4","c":"M7 8 L4.7 5 L4 3.7 L6.2 -.2 L6 4 L9 7","rate":1},
        {"d":"M17 5 L19 3.7 L19.5 2.5 L17.8 -.2 L18 3 L16 4.6","h":"M17 4.4 L19.3 3.1 L20 1.7 L18.2 -.8 L18.3 2.4 L16 4","c":"M17 8 L19.3 5 L20 3.7 L17.8 -.2 L18 4 L15 7","rate":1},
        {"d":"M8.6 9 L12 12 L15.4 9 M8.6 13 L12 16 L15.4 13","h":"M8.6 8 L12 11.5 L15.4 8 M8.6 12.5 L12 16 L15.4 12.5","c":"M8.6 9 L12 5.5 L15.4 9 M8.6 14 L12 17.5 L15.4 14","rate":1},
      ],
      history:[
        {"d":"M19.5 6.6 L17.5 4.2 L14.8 3.2 L12.5 1 L13 3 L9.6 1.7 L10.5 4 L6.7 4.5 L3.1 8.3 L1.5 13 L1.9 17 L5.5 20.5 L11.5 22.5 L17.5 21 L21.5 16.8 L21.5 11.8 L20 10.6 L18.8 12.1 L19.1 15.3 L15.7 18.9 L11.8 20 L7 18.5 L4.5 15.8 L4.3 12.5 L5.7 9.2 L8.5 6.9 L11.5 6.2 L14.5 7 L17.8 7.6 L19 9 L20.2 8.4 L20.3 7.6 Z"},
        {"d":"M3.1 8.3 L5.7 9.2 M6.7 4.5 L8.5 6.9 M1.5 13 L4.3 12.5 M1.9 17 L4.5 15.8 M5.5 20.5 L7 18.5 M11.5 22.5 L11.8 20 M17.5 21 L15.7 18.9 M21.5 16.8 L19.1 15.3 M21.5 11.8 L18.8 12.1","w":0.85},
        {"d":"M17.5 5.7 L17.8 5.95","w":1.3},
        {"d":"M12 6 L12 12 L16 15"},
      ],
      library:[
        {"d":"M9 4 L8.6 3 L9.6 .7 L9.6 3 L14.4 3 L14.4 .7 L15.4 3 L15 4 L15 22 L9 22 Z M9 5 L15 5 M9 20.5 L15 20.5","t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M10.5 9 L12 10.5 L13.5 9 M10.5 12 L12 13.5 L13.5 12","w":0.88,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M15 4 C15 8 15 16 15 20.5","w":0.75,"t":[[-8,0,0,1,1],[-8,0,0,1,1],[-8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 4 L8.6 3 L9.6 .7 L9.6 3 L14.4 3 L14.4 .7 L15.4 3 L15 4 L15 22 L9 22 Z M9 5 L15 5 M9 20.5 L15 20.5"},
        {"d":"M10.5 9 L12 10.5 L13.5 9 M10.5 12 L12 13.5 L13.5 12","w":0.88},
        {"d":"M15 4 C15 8 15 16 15 20.5","w":0.75},
        {"d":"M9 4 L8.6 3 L9.6 .7 L9.6 3 L14.4 3 L14.4 .7 L15.4 3 L15 4 L15 22 L9 22 Z M9 5 L15 5 M9 20.5 L15 20.5","t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M10.5 9 L12 10.5 L13.5 9 M10.5 12 L12 13.5 L13.5 12","w":0.88,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
        {"d":"M9 4 C9 8 9 16 9 20.5","w":0.75,"t":[[8,0,0,1,1],[8,0,0,1,1],[8,0,0,1,1]],"o":[12,22]},
      ],
    },demo:[
      {"d":"M7 6 L6.2 5 L6 11 L6.2 20 L7 21 Z","h":"M7 6 L3 4.6 L.6 10.3 L3.8 18.7 L4 8 Z","c":"M7 8 L6.2 8.5 L6 12 L6.2 17.5 L7 18 Z","rate":1},
      {"d":"M7 6 L6.2 5 L6 11 L6.2 20 L7 21 Z","h":"M7 6 L3 4.6 L.6 10.3 L3.8 18.7 L4 8 Z","c":"M7 8 L6.2 8.5 L6 12 L6.2 17.5 L7 18 Z","t":[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]],"o":[12,12],"rate":1},
      {"d":"M7 5 L17 5 L17 23 L12 18.5 L7 23 Z","h":"M7 4.4 L17 4.4 L17 23 L12 17.5 L7 23 Z","c":"M7 8 L17 8 L17 18 L12 24 L7 18 Z","rate":1},
      {"d":"M8.6 6 L8.6 21.5 M15.4 6 L15.4 21.5","h":"M8.6 5.4 L8.6 21.5 M15.4 5.4 L15.4 21.5","c":"M8.6 9 L8.6 17.5 M15.4 9 L15.4 17.5","w":0.85,"rate":1},
      {"d":"M7 5 L5 3.7 L4.5 2.5 L6.2 -.2 L6 3 L8 4.6","h":"M7 4.4 L4.7 3.1 L4 1.7 L5.8 -.8 L5.7 2.4 L8 4","c":"M7 8 L4.7 5 L4 3.7 L6.2 -.2 L6 4 L9 7","rate":1},
      {"d":"M17 5 L19 3.7 L19.5 2.5 L17.8 -.2 L18 3 L16 4.6","h":"M17 4.4 L19.3 3.1 L20 1.7 L18.2 -.8 L18.3 2.4 L16 4","c":"M17 8 L19.3 5 L20 3.7 L17.8 -.2 L18 4 L15 7","rate":1},
      {"d":"M8.6 9 L12 12 L15.4 9 M8.6 13 L12 16 L15.4 13","h":"M8.6 8 L12 11.5 L15.4 8 M8.6 12.5 L12 16 L15.4 12.5","c":"M8.6 9 L12 5.5 L15.4 9 M8.6 14 L12 17.5 L15.4 14","rate":1},
    ]},
  ];
  const [wyvern,wyrm,forged]=themes;
  // A complete pillar is occluded by the live serpent silhouette, so no pre-cut gaps can drift open.
  for(const parts of [wyrm.icons.bookmark,wyrm.demo]){
    parts[0].d=parts[0].h=parts[0].c='M5 5 L5 23 L12 18 L19 23 L19 4 L17 5.2';
    parts[0].occludedBy=[2];
  }
  const pose=(p,h,c)=>{p.h=h;p.c=c;};
  const section=(p,rest,hover,click)=>{if(!p.d.includes(rest))throw Error('Dragon anatomy segment missing');p.h=(p.h||p.d).replace(rest,hover);p.c=(p.c||p.d).replace(rest,click);};
  for(const theme of themes){
    for(const parts of [...Object.values(theme.icons),theme.demo])for(const p of parts){p.h=p.h||p.d;p.c=p.c||p.d;p.rate=1;}
    for(const p of theme.icons.back){p.t=[I,[-.8,0,0,1,1],[-2.2,0,0,1,1]];p.attach=theme.id+'-back';}
    const hand=theme.icons.history.at(-1);hand.d=hand.h=hand.c='M12 6 L12 12';hand.o=[12,12];hand.turn=-90;hand.hoverTurn=.25;hand.rate=1.05;
    theme.icons.history.push({...hand,d:'M12 12 L16 15',h:'M12 12 L16 15',c:'M12 12 L16 15',turn:-7.5});
    hand.seams=[{part:4,point:2,other:0}];
    const arrow=theme.icons.download[0];arrow.t=[I,[0,1,0,1,1],[0,3,0,1,1]];
    pose(arrow,'M10.2 1.5 L13.8 1.5 L13.8 9.5 L17.7 9.5 L12 16 L6.3 9.5 L10.2 9.5 Z','M11 2.5 L13 2.5 L13 10.3 L15.9 10.3 L12 16 L8.1 10.3 L11 10.3 Z');
    theme.iconViewBoxes={bookmark:theme.id==='wyvern'?'-9 -4 42 32':'-3 -4 30 30',library:'-7 -2 38 28'};
    for(let book=0;book<3;book++){
      const [cover,rune,page]=theme.icons.library.slice(book*3,book*3+3),side=book===2?-1:1,x=(book-1)*8,end=theme.id==='dragonforged'?20.5:20;
      for(const p of [cover,rune,page]){p.o=[12,22];p.t=[[x,0,0,1,1],[x,0,(book-1)*10,1,1],[x,0,(book-1)*20,1,1]];p.rate=1-book*.05;p.attach=theme.id+'-book-'+book;}
      pose(page,`M${12+side*3} 4 C${12+side*6} 7 ${12+side*6} 16 ${12+side*3} ${end}`,`M${12+side*3} 4 C${12+side*9} 7 ${12+side*9} 17 ${12+side*3} ${end}`);
      rune.draw=[1,.65,1];
    }
  }
  // Back: head leans into leftward travel; wing membranes open, then sweep back along the shaft.
  pose(wyvern.icons.back[0],
    'M2 12 L9.5 5 L8 5 L11.4 2.5 L12.4 1.3 L14.4 1.7 L12.7 3.4 L12.6 5 L11 7.3 L23 6 L20.6 10.5 L20.6 14 L22 18 L12 15 L14 23 Z',
    'M2 12 L9 5.8 L7.5 5.8 L10.8 3 L11.7 1.8 L13.7 2.2 L12 3.9 L11.8 5.8 L10.5 8 L22 11 L20.5 12 L20.5 13 L22 14.5 L11.5 15 L13.5 21 Z');
  pose(wyvern.icons.back[1],
    'M2 12 L12 12 C16 10 19 7 23 6 M12 12 C16 12 18 16 22 18 M12 12 L14 23 M12 12 L11 7.3',
    'M2 12 L11.5 12 C15 11.2 19 10.8 22 11 M11.5 12 C15 12.3 19 13.5 22 14.5 M11.5 12 L13.5 21 M11.5 12 L10.5 8');
  pose(wyvern.icons.back[2],'M12.8 2.4 L13.1 2.65','M12.1 2.9 L12.4 3.15');
  pose(wyrm.icons.back[0],
    'M1.7 12 L8.1 6.1 L8.8 4 L10.9 3.4 L13.4 1.2 L12.4 4.5 L10.9 6.5 L12.4 5.7 L11.3 7.9 L9.6 9.5 C16 4 21 4.5 23 8 C20 8 19 10 18 13.8 C20 17 25 19 24 16 C23 14 21.5 16 23 16.5 C25 20 20 21 17 17 C14 16 11 16.2 9.5 17 L10 21 Z',
    'M1.7 12 L7.9 6.9 L8.6 4.8 L10.5 4.2 L12.9 2 L12 5.3 L10.5 7.3 L12 6.5 L10.9 8.7 L9.4 10.3 C16 8 21 8.5 23 12 C20.5 10.8 18 11.5 17.5 14 C19.5 18.2 23.5 21.5 24 18 C24.5 16 22 17 22.5 18 C22.5 22 18.5 22 16.5 17.5 C13.7 16.5 11.3 16.5 9.5 17.5 L10 21 Z');
  pose(wyrm.icons.back[1],'M7.8 12.5 C12 13.5 17 7 22 7.5 M7.8 12.5 C11 14.5 14 13.5 18 13.8 M7.8 12.5 L9.5 17','M7.8 12.5 C12 13 17 10 22 11 M7.8 12.5 C11 13.8 14 14 17.5 14 M7.8 12.5 L9.5 17.5');
  pose(forged.icons.back[0],
    'M2 12 L5.5 9.1 L6.8 9 L9.2 5 L8.9 7.6 L12.3 1.5 L11.5 7 L23 6 L19 12 L23 18 L11.5 17 L12.7 22 L7.3 15 L5.9 13.4 L4.5 13.4 L3.5 14 Z',
    'M2 12 L5.2 9.5 L6.5 9.4 L8.7 6.8 L8.4 8.4 L11.5 3 L10.7 9 L22 10 L19 12 L22 14.5 L10.7 15 L12 20 L7 15 L5.6 13.4 L4.2 13.4 L3.5 14 Z');
  pose(forged.icons.back[1],
    'M10 12 L13.8 6.8 M10 12 L13.8 17.2 M14 12 L17.825 6.45 M14 12 L17.825 17.55 M2 12 L4.3 11.5',
    'M9.5 12 L12.96 9.2 M9.5 12 L12.96 14.9 M13 12 L16.915 9.55 M13 12 L16.915 14.725 M2 12 L4.3 11.5');
  // Download: the receiving wings open with the basin; their connected roots and tray share a rate.
  pose(wyvern.icons.download[1],
    'M1.8 6 C-.2 10.5 .6 14 2.3 18 L3.1 16.7 L5 18 L5 21 L19 21 L19 18 L20.9 16.7 L21.7 18 C23.4 14 24.2 10.5 22.2 6 C22.2 11 21 14 18.5 15.5 L18.5 18.5 L5.5 18.5 L5.5 15.5 C3 14 1.8 11 1.8 6 Z',
    'M1.3 4 C-.3 9 -.2 15 2.3 20 L3.1 18.5 L5 19.5 L5 22.5 L19 22.5 L19 19.5 L20.9 18.5 L21.7 20 C24.2 15 24.3 9 22.7 4 C22.7 10 21 15 18.5 17 L18.5 20 L5.5 20 L5.5 17 C3 15 1.3 10 1.3 4 Z');
  pose(wyrm.icons.download[1],
    'M3.5 4.8 C8 9 .5 11 3.5 16 C4.5 17 7 17 5.5 20 M3.5 4.8 C5 9 -1 13 2.5 17.5 C3.5 18.5 4 18 3 18.5',
    'M3 3 C8 8 0 12 3 17 C4 18 7 18 5.5 21 M3 3 C4.5 8 -1 14 2.2 18.5 C3.5 19.5 4 19 3 19.5');
  const rightCurl=wyrm.icons.download[2],leftCurl=wyrm.icons.download[1];rightCurl.d=leftCurl.d;rightCurl.h=leftCurl.h;rightCurl.c=leftCurl.c;rightCurl.o=[12,12];rightCurl.t=[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]];
  pose(wyrm.icons.download[3],'M3 18.5 L5.5 18.5 L5.5 20 L18.5 20 L18.5 18.5 L21 18.5 L21 22.5 L3 22.5 Z','M3 19.5 L5.5 19.5 L5.5 21 L18.5 21 L18.5 19.5 L21 19.5 L21 24 L3 24 Z');
  pose(forged.icons.download[1],
    'M2.5 5.5 L0 10.5 L.5 18 L3.8 22 L20.2 22 L23.5 18 L24 10.5 L21.5 5.5 L21.5 12.5 L18 18.5 L6 18.5 L2.5 12.5 Z M3.8 22 L6 18.5 M20.2 22 L18 18.5 M0 10.5 L4 16.5 M24 10.5 L20 16.5',
    'M1.5 4 L-.5 9 L0 19 L3.5 24 L20.5 24 L24 19 L24.5 9 L22.5 4 L22 13 L18.5 20.5 L5.5 20.5 L2 13 Z M3.5 24 L5.5 20.5 M20.5 24 L18.5 20.5 M-.5 9 L3 17.5 M24.5 9 L21 17.5');
  // History: clock circles stay fixed; the dragon opens its jaw while the hands rewind at their hub.
  section(wyvern.icons.history[0],'M19.5 7 L18.5 5 L15 3.2 L13.5 1.3 L13.8 3 L9.5 1.8 L11.2 3.8','M20 6.5 L18.5 4 L15 2.5 L13.3 -.1 L13.8 2.2 L9.2 1 L11.2 3.8','M20 8 L18.8 5.5 L15 3.7 L13.5 1.8 L13.8 3.4 L9.5 2.2 L11.2 3.8');
  section(wyvern.icons.history[0],'L17.7 7 L19.1 8.5 L20.5 8.7 L20 7.6 Z','L18 6.5 L19 10 L21 9 L20.5 7.4 Z','L18 7.5 L19.3 11 L21.5 9.5 L20.5 8.5 Z');
  pose(wyvern.icons.history[2],'M17.6 5.5 L17.9 5.75','M18 6.8 L18.3 7.05');
  section(wyrm.icons.history[0],'M18.8 5.8 L16 3.4 L13.2 2.4 L11.3 .8 L12 3 L8.7 1.8 L9.8 3.3','M19.5 5 L16.4 2.5 L13.2 1.5 L11.1 -.3 L12 2.1 L8.2 .8 L9.8 3.3','M19.7 6.8 L16.5 4 L13.2 3 L11.3 1.4 L12 3.4 L8.7 2.3 L9.8 3.3');
  section(wyrm.icons.history[0],'L17.4 7 L18.3 8.5 L20 8.9 L19.2 7.5 Z','L17.7 6.7 L18.5 10.3 L20.6 9.3 L20 7 Z','L17.5 7.4 L18.7 11 L21 9.8 L20.2 8.4 Z');
  pose(wyrm.icons.history[2],'M17.2 4.9 L17.5 5.15','M17.4 6.4 L17.7 6.65');
  section(forged.icons.history[0],'M19.5 6.6 L17.5 4.2 L14.8 3.2 L12.5 1 L13 3 L9.6 1.7 L10.5 4','M20 6.2 L17.8 3.4 L14.8 2.4 L12.2 -.3 L13 2.2 L9.2 .6 L10.5 4','M20.1 7.3 L17.9 4.8 L14.8 3.7 L12.5 1.5 L13 3.4 L9.6 2.3 L10.5 4');
  section(forged.icons.history[0],'L17.8 7.6 L19 9 L20.2 8.4 L20.3 7.6 Z','L18.2 7.3 L18.8 10.5 L21 9 L21 7.5 Z','L18 8 L19 12 L21 10 L20.5 8.5 Z');
  pose(forged.icons.history[2],'M17.7 5.1 L18 5.35','M17.9 6.4 L18.2 6.65');
  for(const theme of themes)theme.icons.history[2].draw=[1,.3,1];
  wyvern.note='Wings spread and fold with attached ribs; arrow wings open then sweep left; jaws open before coherent clockwise turns; receiving wings open before landing; pages bow open as books fan.';
  wyrm.note='The serpent raises its head and winds around the bookmark; arrow tails uncurl; jaws lead coherent turns; receiving curls open the tray; pages turn while separate book spines fan.';
  forged.note='Plates deploy with articulated horns and nested chevrons; arrow vanes open then sweep left; jaws and rune traces activate during coherent turns; receiving armor opens before landing; pages turn as books fan.';

  // Recover fixed material points from the approved folded contour, then rotate that plane
  // around its vertical shoulder. Perspective changes both far-edge height and projected width.
  const projectPlane=(d,[hx,hy],angle,restCos=.4)=>{
    const restSin=Math.sqrt(1-restCos*restCos),r=angle*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r),camera=60;
    const values=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number),out=[];
    for(let i=0;i<values.length;i+=2){const sx=values[i]-hx,dx=sx/(restCos+sx*restSin/camera),dy=(values[i+1]-hy)*(1-dx*restSin/camera),scale=1/(1-dx*sn/camera);out.push(hx+dx*cs*scale,hy+dy*scale);}
    let i=0;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>String(Math.round(out[i++]*1e6)/1e6));
  };
  for(const parts of [wyvern.icons.bookmark,wyvern.demo]){
    for(const i of [0,1,2,3]){
      const p=parts[i],near=i<2;p.h=projectPlane(p.d,[7,5],near?15:30);p.c=projectPlane(p.d,[7,5],near?112:102);
      p.o=[12,12];p.t=near?[I,I,I]:[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]];p.occludedBy=[4];
    }
    for(const p of parts.slice(4)){p.h=p.c=p.d;}
    for(const [i,x,side]of [[5,7,-1],[6,17,1]]){parts[i].o=[x,5];parts[i].t=[I,[0,0,side*8,1,1],[0,0,-side*10,1,1]];}
    parts[4].d=parts[4].h=parts[4].c='M7 5 L17 5 L17 14 L17 23 L12 19 L7 23 L7 14 Z';
    parts[0].seams=[{part:4,point:26,other:0},{part:4,point:24,other:12}];parts[2].seams=[{part:4,point:26,other:2},{part:4,point:24,other:4}];
    parts[5].seams=[{part:4,point:0,other:0}];parts[6].seams=[{part:4,point:0,other:2}];
    for(const [rib,wing]of [[1,0],[3,2]])parts[rib].seams=[{part:wing,point:6,other:12},{part:wing,point:14,other:18},{part:wing,point:22,other:24}];
  }
  for(const parts of [forged.icons.bookmark,forged.demo]){
    for(const i of [0,1]){const p=parts[i];p.h=projectPlane(p.d,[7,13],i===0?18:35,.25);p.c=projectPlane(p.d,[7,13],i===0?108:100,.25);p.o=[12,12];p.t=i===0?[I,I,I]:[[0,0,0,-1,1],[0,0,0,-1,1],[0,0,0,-1,1]];p.occludedBy=[2];}
    for(const p of parts.slice(2)){p.h=p.c=p.d;}
    for(const [i,x,side]of [[4,7,-1],[5,17,1]]){parts[i].o=[x,5];parts[i].t=[I,[0,0,side*8,1,1],[0,0,-side*6,1,1]];}
    parts[2].d=parts[2].h=parts[2].c='M7 5 L17 5 L17 6 L17 21 L17 23 L12 18.5 L7 23 L7 21 L7 6 Z';
    parts[0].seams=[{part:2,point:0,other:16},{part:2,point:8,other:14}];parts[1].seams=[{part:2,point:0,other:4},{part:2,point:8,other:6}];
    parts[4].seams=[{part:2,point:0,other:0}];parts[5].seams=[{part:2,point:0,other:2}];
  }
  wyvern.icons.download[0].t=[I,[0,1,0,1,1],[0,2.4,0,1,1]];
  wyrm.icons.download[1].seams=[{part:3,point:12,other:4},{part:3,point:26,other:0}];
  wyrm.icons.download[2].seams=[{part:3,point:12,other:6},{part:3,point:26,other:10}];
  const pageAnchors={wyvern:[[36,44],[24,38]],wyrm:[[32,40],[24,34]],dragonforged:[[14,26],[0,24]]};
  for(const theme of themes)for(let book=0;book<3;book++){
    const [top,bottom]=pageAnchors[theme.id][book===2?1:0];
    theme.icons.library[book*3+2].seams=[{part:book*3,point:0,other:top},{part:book*3,point:6,other:bottom}];
  }
  // A single phase carries the serpent through a projected helix. Rear contours pass behind
  // the solid pillar silhouette; foreground contours cut only the pillar's visible outline.
  const neck=[10,6.3-Math.sqrt(81-4)/3],tangent=[2*Math.PI*Math.sqrt(77),-8*Math.PI/9-17],length=Math.hypot(...tangent),normal=[-tangent[1]/length,tangent[0]/length],half=.85;
  const upper=[neck[0]-normal[0]*half,neck[1]-normal[1]*half],lower=[neck[0]+normal[0]*half,neck[1]+normal[1]*half];
  const wyrmHead=`M${upper[0]} ${upper[1]} L9.8 2.5 L9 .8 L11.3 1.7 L12 0 L12.5 2 L13.5 2.5 L15.3 4 L15 5 L16 6 L15 6.5 L14 5.3 C13 5.3 12 4.5 ${lower[0]} ${lower[1]} Z`;
  const helix={track:{ellipse:[12,3,9,2,0],pitch:17},start:.975,anchor:neck,heading:Math.atan2(tangent[1],tangent[0])*180/Math.PI,span:[1.05,1.05,1.05],scaleByDepth:0};
  const wrapPart=(d,mode,layer,extra={})=>({d,h:d,c:d,rate:1,turn:360,hoverTurn:.18,flow:{...helix,mode,layer,...(mode==='trail'?{width:1.7,taper:.1}:{})},...extra});
  const wrapped=[
    wrapPart('M0 0 L0 0 L0 0 Z','trail','back',{occludedBy:[7]}),
    wrapPart(wyrmHead,'head','back',{occludedBy:[7]}),
    wrapPart('M13.3 3.4 L13.6 3.7','head','back',{w:1.2,occludedBy:[7]}),
    {d:'M5 5 L5 23 L12 18 L19 23 L19 4 L17 5.2',occludedBy:[4,5]},
    wrapPart('M0 0 L0 0 L0 0 Z','trail','front'),
    wrapPart(wyrmHead,'head','front'),
    wrapPart('M13.3 3.4 L13.6 3.7','head','front',{w:1.2}),
    {d:'M5 5 L5 23 L12 18 L19 23 L19 4 L17 5.2 Z',maskOnly:true}
  ];
  for(const i of [1,5])pose(wrapped[i],wyrmHead.replace('L15 6.5 L14 5.3','L15 7.1 L14 5.7'),wyrmHead.replace('L15 6.5 L14 5.3','L15 7.7 L14 6.1'));
  wyrm.icons.bookmark=wrapped;wyrm.demo=wrapped.map(p=>({...p}));wyrm.iconViewBoxes.bookmark='-5 -4 34 34';

  // The tail stays docked while the head winds material around the circular seal.
  // Raised seal lugs cover the rear pass; their ends are clear of the depth handoffs.
  const reloadBeats={hover:[[0,'prepare'],[170,'hover']],click:[[0,'prepare'],[180,'wind'],[430,'click'],[720,'unwind'],[1020,'release']],leave:[[0,'release'],[220,'rest']]};
  const circlePoint=(r,u)=>[12+r*Math.cos(u*2*Math.PI),12+r*Math.sin(u*2*Math.PI)];
  const arc=(r,from,to,n=16)=>Array.from({length:n+1},(_,i)=>circlePoint(r,from+(to-from)*i/n));
  const pathPoints=points=>'M'+points.map(p=>p.join(' ')).join(' L');
  const core='M19.2 12 C19.2 15.976 15.976 19.2 12 19.2 C8.024 19.2 4.8 15.976 4.8 12 C4.8 8.024 8.024 4.8 12 4.8 C15.976 4.8 19.2 8.024 19.2 12 Z';
  const sealLug=pathPoints([...arc(9.8,.65,.85),...arc(7.2,.85,.65)])+' Z';
  // Project the same membrane and its ribs around a fixed shoulder chord.
  const wingPlane=(d,hy,angle)=>{const cs=Math.cos(angle*Math.PI/180),sn=Math.sin(angle*Math.PI/180);let i=0;const v=d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g).map(Number),out=[];for(let j=0;j<v.length;j+=2){const dy=v[j+1]-hy,scale=1/(1-dy*sn/38);out.push(v[j]*scale,hy+dy*cs*scale);}return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>String(+out[i++].toFixed(6)));};
  const reloadData=[
    {theme:wyvern,width:1.9,start:.23,spans:[.34,.61,.79],head:'M0 -.95 L-.8 -2.1 L1.2 -1.35 L1.5 -2.7 L2.4 -1.1 L4.4 -.35 L5.1 .65 L4.7 1.1 L5.4 1.55 L4.4 1.45 L3.9 .7 C2.5 1.25 1.3 .95 0 .95 Z',eye:'M3.35 -.15 L3.7 .05',jaw:['L5.4 1.55 L4.4 1.45','L5.1 2.15 L4.15 1.8','L4.8 2.6 L3.95 2.1']},
    {theme:wyrm,width:1.7,start:.18,spans:[.32,.6,.78],head:'M0 -.85 L-.9 -1.7 L1 -1.25 L1.3 -2.5 L2 -1.05 C3 -.85 4 -.4 4.9 .35 L5.55 1 L5.2 1.6 L4.45 1.45 L4.1 .9 C2.7 1.4 1.2 .85 0 .85 Z',eye:'M3.55 -.05 L3.85 .15',jaw:['L5.2 1.6 L4.45 1.45','L4.95 2.2 L4.15 1.9','L4.6 2.65 L3.85 2.1']},
    {theme:forged,width:2.1,start:.3,spans:[.4,.67,.93],head:'M0 -1.05 L-.6 -2.3 L1.1 -1.3 L1.5 -2.6 L2.5 -.9 L3.8 -.15 L4.45 .65 L3.95 .875 L4.35 1.4 L3.4 1.55 L2.7 .7 L1.6 1.05 L0 1.05 Z',eye:'M2.8 -.1 L3.15 .1',jaw:['L4.35 1.4 L3.4 1.55','L4 2.1 L3.15 1.9','L4.35 1.4 L3.4 1.55']}
  ];
  for(const data of reloadData){
    const {theme,width,start,spans}=data,R=9.2,forgedCollar=theme===forged;
    const shared={track:{ellipse:[12,12,R,R,0]},start,anchor:[0,0],heading:0,span:spans,phase:[0,0,0],wrap:true,scaleByDepth:0};
    const stages={prepare:.25,wind:forgedCollar?.76:.68,unwind:forgedCollar?.7:.5,release:spans[0]};
    const moving=(d,mode,layer,extra={})=>({d,h:d,c:d,rate:1,w:.8,flow:{...shared,mode,layer,...(mode==='trail'?{width,taper:1}:{})},poses:Object.fromEntries(Object.entries(stages).map(([name,span])=>[name,{base:name==='wind'?1:0,span}])),beats:reloadBeats,...extra});
    const parts=[],layers={};
    // Rear and front copies have identical paths and histories; only seal occlusion differs.
    for(const layer of ['back','front']){
      const group=layers[layer]={};group.body=parts.length;parts.push(moving('M0 0 L0 0 L0 0 Z','trail',layer,{role:'body'}));
      group.head=parts.length;const head=moving(data.head,'head',layer,{role:'head'});head.h=data.head.replace(data.jaw[0],data.jaw[1]);head.c=data.head.replace(data.jaw[0],data.jaw[2]);head.poses.wind.base=1;head.poses.prepare.base=1;parts.push(head);
      group.eye=parts.length;parts.push(moving(data.eye,'head',layer,{role:'eye',w:.95}));
      group.details=[];
      if(theme===wyvern){
        for(const near of [false,true]){
          const rr=R+width/2,a=.13,rx=rr*Math.sin(a),ry=R-rr*Math.cos(a),sign=near?-1:-.8;
          const membrane=`M${-rx} ${ry} C-2.7 ${ry+sign*1.8} -4.2 ${ry+sign*4} -4.7 ${ry+sign*5.4} C-2.8 ${ry+sign*4.2} -1.2 ${ry+sign*5.1} .5 ${ry+sign*5.6} C.7 ${ry+sign*3.5} 2.1 ${ry+sign*2.7} 3.7 ${ry+sign*3.1} C2.8 ${ry+sign*1.5} 1.9 ${ry+sign*.6} ${rx} ${ry} Z`;
          const ribs=`M${-rx} ${ry} C-1.8 ${ry+sign*1.9} -3 ${ry+sign*3.1} -4.7 ${ry+sign*5.4} M${-rx} ${ry} C-.8 ${ry+sign*1.8} .1 ${ry+sign*3.7} .5 ${ry+sign*5.6} M${-rx} ${ry} C.3 ${ry+sign*1.2} 2.1 ${ry+sign*2.8} 3.7 ${ry+sign*3.1}`;
          for(const [d,role,w]of [[membrane,'wing',.8],[ribs,'rib',.58]]){
            const p=moving(wingPlane(d,ry,near?62:72),'head',layer,{role,w,flow:{...shared,mode:'head',layer,start:start-.105}});
            p.h=wingPlane(d,ry,near?12:43);p.c=wingPlane(d,ry,near?112:103);
            p.poses.prepare.d=wingPlane(d,ry,82);p.poses.wind.d=wingPlane(d,ry,near?8:35);p.poses.unwind.d=wingPlane(d,ry,near?30:53);group.details.push(parts.length);parts.push(p);
          }
        }
      }else if(theme===wyrm){
        // Four dorsal scales keep their two bases on the outer body rail while bending in depth.
        for(const fraction of [.17,.37,.57,.77]){
          const rr=R+width/2,rx=rr*Math.sin(.055),ry=R-rr*Math.cos(.055),d=`M${-rx} ${ry} Q-.4 ${ry-2.4} ${rx} ${ry}`;
          const p=moving(d,'head',layer,{role:'crest',w:.65,flow:{...shared,mode:'head',layer,span:spans.map(n=>n*fraction)}});
          p.h=`M${-rx} ${ry} Q-.8 ${ry-3} ${rx} ${ry}`;p.c=`M${-rx} ${ry} Q.4 ${ry-.8} ${rx} ${ry}`;
          for(const [name,span]of Object.entries(stages))p.poses[name].span=span*fraction;
          group.details.push(parts.length);parts.push(p);
        }
      }else{
        // Each crossplate follows its own position on the collar, rather than a rigid wheel.
        for(const fraction of [.12,.26,.4,.54,.68,.82]){
          const p=moving(`M0 ${-width/2} L0 ${width/2}`,'head',layer,{role:'armor',w:.66,flow:{...shared,mode:'head',layer,span:spans.map(n=>n*fraction)}});
          for(const [name,span]of Object.entries(stages))p.poses[name].span=span*fraction;
          group.details.push(parts.length);parts.push(p);
        }
      }
      group.tail=parts.length;
      const tail=forgedCollar?'M-.6 -1.55 L.6 -1.55 L.6 1.55 L-.6 1.55 Z':`M0 ${-width/2} C-2.4 -1.8 -4.1 -1.1 -3.3 .4 C-2.7 1.5 -1.8 .9 -2.1 .4 C-1.5 1.4 -.6 1.3 0 ${width/2} Z`;
      parts.push(moving(tail,'head',layer,{role:'tail',flow:{...shared,mode:'head',layer,wrap:false,span:[0,0,0]},poses:{prepare:{base:0},wind:{base:0},unwind:{base:0},release:{base:0}}}));
    }
    const sealIndex=parts.length;
    const rune=theme===wyvern?'M12 7 L14.7 12 L12 17 L9.3 12 Z M12 9.5 L12 14.5':theme===wyrm?'M10 7 L14 7 L14 17 L12 15.4 L10 17 Z M11 9 L13 9 M11 12 L13 12':'M9 7 L15 7 L17 10 L17 14 L15 17 L9 17 L7 14 L7 10 Z M9.5 10 L12 12.5 L14.5 10 M9.5 13 L12 15.5 L14.5 13';
    parts.push({d:rune+' '+sealLug,w:.65,role:'seal',occludedBy:[layers.front.body,layers.front.head,...layers.front.details.filter(i=>parts[i].role==='wing')]});
    const maskIndex=parts.length;parts.push({d:core+' '+sealLug,maskOnly:true});
    for(const layer of ['back','front']){
      const g=layers[layer];for(const i of [g.body,g.head,g.eye,...g.details,g.tail])if(layer==='back')parts[i].occludedBy=[maskIndex];
      parts[g.body].occludedBy=[...(parts[g.body].occludedBy||[]),g.head,g.tail,...g.details.filter(i=>parts[i].role==='wing')];
      if(theme===wyvern)for(const i of g.details.slice(0,2))parts[i].occludedBy=[...(parts[i].occludedBy||[]),g.details[2]];
    }
    theme.icons.reload=parts;theme.iconViewBoxes.reload='-4 -4 32 32';
  }
  // Three closed-book mechanisms preserve the whole spine, its fore-edge and its decoration.
  // Wyvern volumes fan from their own bases; Wyrm selects a volume; forged clasps hinge in depth.
  for(const theme of themes){
    const old=theme.icons.library,parts=[];
    for(let book=0;book<3;book++){
      const side=book-1,x=side*8;
      const motion=theme===wyvern
        ? [[x,0,0,1,1],[x,side ? 0 : -1,side*8,1,1],[x,side ? 0 : -2,side*16,1,1]]
        : theme===wyrm
          ? [[x,0,0,1,1],[x+side*1.5,side ? .5 : -2,0,1,1],[x+side*3,side ? 1 : -4,0,1,1]]
          : [[x,0,0,1,1],[x+side*2,side ? -.4 : .7,0,1,1],[x+side*4,side ? -.8 : 1.4,0,1,1]];
      for(const original of old.slice(book*3,book*3+3)){
        const p={...original,h:original.d,c:original.d,o:[12,22],t:motion,rate:1};delete p.draw;parts.push(p);
      }
      if(theme===forged)pose(parts[book*3+1],'M10.5 9 L12 9.25 L13.5 9 M10.5 12 L12 12.25 L13.5 12','M10.5 9 L12 7.7 L13.5 9 M10.5 12 L12 10.7 L13.5 12');
    }
    theme.icons.library=parts;
    if(theme===wyrm)theme.iconViewBoxes.library='-7 -5 38 31';
  }
  // Finite authored beats provide anticipation, a held action and recovery. Welded parts
  // keep one schedule/rate; circular phase remains independent of these surface poses.
  const actionBeats={hover:[[0,'prepare'],[160,'hover']],click:[[0,'prepare'],[180,'click'],[440,'release']],leave:[[0,'release'],[180,'rest']]};
  const wingBeats={hover:[[0,'prepare'],[180,'hover']],click:[[0,'prepare'],[150,'spread'],[310,'hold'],[430,'click'],[720,'release']],leave:[[0,'release'],[200,'rest']]};
  for(const theme of themes){
    for(const key of ['back','download','history'])for(const p of theme.icons[key]){p.poses={prepare:{base:1},release:{base:0}};p.beats=actionBeats;}
    for(const p of theme.icons.back)p.poses.prepare.t=[-.3,0,0,1,1];
    theme.icons.download[0].poses.prepare={base:0,t:[0,-.7,0,1,1]};
    for(const parts of [theme.icons.bookmark,theme.demo])for(const p of parts){p.poses={prepare:{base:1},spread:{base:1},hold:{base:1},release:{base:0}};p.beats=theme===wyrm?actionBeats:wingBeats;}
  }
  for(const parts of [wyvern.icons.bookmark,wyvern.demo]){
    for(const i of [0,1,2,3])parts[i].poses.prepare={base:0,d:projectPlane(parts[i].d,[7,5],i<2?45:55)};
    for(const [i,side]of [[5,-1],[6,1]])parts[i].poses.prepare={base:0,t:[0,0,side*4,1,1]};
  }
  for(const parts of [forged.icons.bookmark,forged.demo]){
    for(const i of [0,1])parts[i].poses.prepare={base:0,d:projectPlane(parts[i].d,[7,13],i===0?48:58,.25)};
    for(const [i,side]of [[4,-1],[5,1]])parts[i].poses.prepare={base:0,t:[0,0,side*4,1,1]};
  }
  for(const theme of [wyvern,forged])for(const parts of [theme.icons.bookmark,theme.demo])for(const p of parts){
    const transforms=p.t||[I,I,I];p.t=transforms.map((t,i)=>[t[0],t[1]+[0,-.65,1.1][i],t[2],t[3],t[4]]);
    for(const [name,dy]of [['prepare',.8],['spread',-1.5],['hold',-1.5],['release',0]]){const q=p.poses[name],t=q.t||transforms[q.base||0];q.t=[t[0],t[1]+dy,t[2],t[3],t[4]];}
  }
  wyvern.note='Wing membranes and ribs spread together and fold in depth; the dragon winds its body around a circular seal, spreads its wings and folds them during recovery; receiving wings open before landing; intact bound volumes fan from separate bases.';
  wyrm.note='The continuous serpent wraps around the pillar, disappearing behind it and returning in front; head and eye follow its tangent. The reload serpent threads around a raised seal with a docked tail and a leading jaw.';
  forged.note='Side plates fold in depth with articulated horns and chevrons; the segmented reload collar opens around a circular seal and its jaw returns to the tail clasp; receiving armor opens before landing; intact volumes spread while their bolted clasps hinge in depth.';
  motionThemes.push(...themes);
})();
