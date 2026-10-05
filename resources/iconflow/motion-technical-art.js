(() => {
  const I=[0,0,0,1,1], P=(d,extra={})=>({d,...extra});
  const technical=[
    {id:"facet",stroke:1.05,cap:"butt",join:"miter",icons:{
      back:[
        {"d":"M16 2 L6 12 L16 22 L16 17.5 L10.5 12 L16 6.5 Z "},
        {"d":"M6 12 L10.5 12"}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 Z"},
        {"d":"M2.5 16 L5 16 L5 20 L19 20 L19 16 L21.5 16 L21.5 21 L20 22.5 L4 22.5 L2.5 21 Z M2.5 16 L5 20 M21.5 16 L19 20"}
      ],
      bookmark:[
        {"d":"M5 2 L12 9 L12 17 L5 23 Z M5 2 L12 2 M5 23 L12 12","h":"M4.832 2 L11.412 6.06 L11.412 17 L4.832 23 Z M4.832 2 L11.412 2 M4.832 20.06 L11.412 9.48","c":"M4.6 2 L10.6 2 L10.6 17 L4.6 23 Z M4.6 2 L10.6 2 M4.6 16 L10.6 6"},
        {"d":"M19 2 L12 9 L12 17 L19 23 Z M19 2 L12 2 M19 23 L12 12","h":"M19.168 2 L12.588 6.06 L12.588 17 L19.168 23 Z M19.168 2 L12.588 2 M19.168 20.06 L12.588 9.48","c":"M19.4 2 L13.4 2 L13.4 17 L19.4 23 Z M19.4 2 L13.4 2 M19.4 16 L13.4 6"}
      ],
      history:[
        {"d":"M22 12 C22 17.523 17.523 22 12 22 C6.477 22 2 17.523 2 12 C2 6.477 6.477 2 12 2 C17.523 2 22 6.477 22 12 ZM19.9 12 C19.9 16.36317 16.36317 19.9 12 19.9 C7.63683 19.9 4.1 16.36317 4.1 12 C4.1 7.63683 7.63683 4.1 12 4.1 C16.36317 4.1 19.9 7.63683 19.9 12 Z M12 2 L12 4.1 M22 12 L19.9 12 M12 22 L12 19.9 M2 12 L4.1 12"},
        {"d":"M12 6 L12 12 L15.5 15","role":"hand"}
      ],
      library:[
        {"d":"M3.7 2 L6.8 2 Q7.5 2 7.5 2.7 L7.5 21.3 Q7.5 22 6.8 22 L3.7 22 Q3 22 3 21.3 L3 2.7 Q3 2 3.7 2 Z M3 4.5 L7.5 4.5 M3 19.5 L7.5 19.5","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10.7 2 L13.8 2 Q14.5 2 14.5 2.7 L14.5 21.3 Q14.5 22 13.8 22 L10.7 22 Q10 22 10 21.3 L10 2.7 Q10 2 10.7 2 Z M10 4.5 L14.5 4.5 M10 19.5 L14.5 19.5","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17.7 2 L20.8 2 Q21.5 2 21.5 2.7 L21.5 21.3 Q21.5 22 20.8 22 L17.7 22 Q17 22 17 21.3 L17 2.7 Q17 2 17.7 2 Z M17 4.5 L21.5 4.5 M17 19.5 L21.5 19.5","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }},
    {id:"neon",stroke:1.05,cap:"round",join:"miter",icons:{
      back:[
        {"d":"M15.7 2 Q17 2 17 3.3 L17 4.2 L9 12"},
        {"d":"M9 12 L17 19.8 L17 21 Q17 22.4 15.7 22 L15 21.4 L15 20.7 L6 12 L15 3.3 L15 2.7 Q15 2 15.7 2"}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 ZM12.55 2 C12.55 2.303765 12.303765 2.55 12 2.55 C11.696235 2.55 11.45 2.303765 11.45 2 C11.45 1.696235 11.696235 1.45 12 1.45 C12.303765 1.45 12.55 1.696235 12.55 2 Z"},
        {"d":"M2.5 16 L2.5 19.5 L4 20 L4 21 L6 22 L18 22 L20 21 L20 20 L21.5 19.5 L21.5 16 M5 16 L5 19 L6 19.5 L18 19.5 L19 19 L19 16 M12.7 22 C12.7 22.38661 12.38661 22.7 12 22.7 C11.61339 22.7 11.3 22.38661 11.3 22 C11.3 21.61339 11.61339 21.3 12 21.3 C12.38661 21.3 12.7 21.61339 12.7 22 Z"}
      ],
      bookmark:[
        {"d":"M5 3 L6 2 L18 2 L19 3 L19 23 L12 17 L5 23 Z"},
        {"d":"M19 4 L19 4 L19 23 L19 23 Z","h":"M19 4 L20.7 4 L20.7 23 L19 22.3 Z","c":"M19 4 L23 4 L23 23 L19 21.3 Z"},
        {"d":"M7 2 L7 4 M7 5.6 L7 13 L5 14 L5 14.7 M7.75 4.8 C7.75 5.214225 7.414225 5.55 7 5.55 C6.585775 5.55 6.25 5.214225 6.25 4.8 C6.25 4.385775 6.585775 4.05 7 4.05 C7.414225 4.05 7.75 4.385775 7.75 4.8 Z","h":"M7 2 L7 4 M7 5.6 L7 12.16 L6.68 13.16 L6.68 13.86 M7.75 4.8 C7.75 5.2142 7.4142 5.55 7 5.55 C6.5858 5.55 6.25 5.2142 6.25 4.8 C6.25 4.3858 6.5858 4.05 7 4.05 C7.4142 4.05 7.75 4.3858 7.75 4.8 Z","c":"M7 2 L7 4 M7 5.6 L7 11 L9 12 L9 12.7 M7.75 4.8 C7.75 5.214225 7.414225 5.55 7 5.55 C6.585775 5.55 6.25 5.214225 6.25 4.8 C6.25 4.385775 6.585775 4.05 7 4.05 C7.414225 4.05 7.75 4.385775 7.75 4.8 Z"},
        {"d":"M17 2 L17 4 L16 5 L16 8 L17.5 9.5 L17.5 16 L19 17","h":"M17 2 L17 4 L16 5 L16 9.68 L17.5 11.18 L17.5 15.37 L19 16.37","c":"M17 2 L17 4 L16 5 L16 12 L17.5 13.5 L17.5 14.5 L19 15.5"},
        {"d":"M12 17 L12 15.5 L15.4 12.1 M16.6 11.6 C16.6 11.986609999999999 16.28661 12.299999999999999 15.9 12.299999999999999 C15.513390000000001 12.299999999999999 15.200000000000001 11.986609999999999 15.200000000000001 11.6 C15.200000000000001 11.21339 15.513390000000001 10.9 15.9 10.9 C16.28661 10.9 16.6 11.21339 16.6 11.6 Z","h":"M12 17 L12 15.5 L12.964 12.52 M13.744 12.02 C13.744 12.4066 13.4306 12.72 13.044 12.72 C12.6574 12.72 12.344 12.4066 12.344 12.02 C12.344 11.6334 12.6574 11.32 13.044 11.32 C13.4306 11.32 13.744 11.6334 13.744 12.02 Z","c":"M12 17 L12 15.5 L9.6 13.1 M9.799999999999999 12.6 C9.799999999999999 12.986609999999999 9.486609999999999 13.299999999999999 9.1 13.299999999999999 C8.71339 13.299999999999999 8.4 12.986609999999999 8.4 12.6 C8.4 12.21339 8.71339 11.9 9.1 11.9 C9.486609999999999 11.9 9.799999999999999 12.21339 9.799999999999999 12.6 Z"}
      ],
      history:[
        {"d":"M22 12 C22 17.523 17.523 22 12 22 C6.477 22 2 17.523 2 12 C2 6.477 6.477 2 12 2 C17.523 2 22 6.477 22 12 ZM19.9 12 C19.9 16.36317 16.36317 19.9 12 19.9 C7.63683 19.9 4.1 16.36317 4.1 12 C4.1 7.63683 7.63683 4.1 12 4.1 C16.36317 4.1 19.9 7.63683 19.9 12 Z M1 11 L4 11 M20 12 L23 12"},
        {"d":"M12 6 L12 12 L15.5 15","role":"hand"}
      ],
      library:[
        {"d":"M3.7 2 L6.8 2 Q7.5 2 7.5 2.7 L7.5 21.3 Q7.5 22 6.8 22 L3.7 22 Q3 22 3 21.3 L3 2.7 Q3 2 3.7 2 Z M3 5 L5 5 M5.25 2 L5.25 11 M5.25 13 L5.25 22 M6.25 12 C6.25 12.5523 5.8023 13 5.25 13 C4.6977 13 4.25 12.5523 4.25 12 C4.25 11.4477 4.6977 11 5.25 11 C5.8023 11 6.25 11.4477 6.25 12 Z M5.5 19 L7.5 19","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10.7 2 L13.8 2 Q14.5 2 14.5 2.7 L14.5 21.3 Q14.5 22 13.8 22 L10.7 22 Q10 22 10 21.3 L10 2.7 Q10 2 10.7 2 Z M10 5 L12 5 M12.25 2 L12.25 11 M12.25 13 L12.25 22 M13.25 12 C13.25 12.5523 12.8023 13 12.25 13 C11.6977 13 11.25 12.5523 11.25 12 C11.25 11.4477 11.6977 11 12.25 11 C12.8023 11 13.25 11.4477 13.25 12 Z M12.5 19 L14.5 19","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17.7 2 L20.8 2 Q21.5 2 21.5 2.7 L21.5 21.3 Q21.5 22 20.8 22 L17.7 22 Q17 22 17 21.3 L17 2.7 Q17 2 17.7 2 Z M17 5 L19 5 M19.25 2 L19.25 11 M19.25 13 L19.25 22 M20.25 12 C20.25 12.5523 19.8023 13 19.25 13 C18.6977 13 18.25 12.5523 18.25 12 C18.25 11.4477 18.6977 11 19.25 11 C19.8023 11 20.25 11.4477 20.25 12 Z M19.5 19 L21.5 19","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }},
    {id:"shard",stroke:1.05,cap:"butt",join:"miter",icons:{
      back:[
        {"d":"M16 2 L6 12 L16 22 L16 17.5 L10.5 12 L16 6.5 Z "},
        {"d":"M6 12 L12.7 9.8 "},
        {"d":"M6 12 L12.7 14.2"}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 Z M6.7 11 L12 15.6 L17.3 11"},
        {"d":"M2.5 16 L5 16 L5 20 L19 20 L19 16 L21.5 16 L21.5 21 L20 22.5 L4 22.5 L2.5 21 Z M2.5 16 L6.6 22.5 M21.5 16 L17.4 22.5"}
      ],
      bookmark:[
        {"d":"M5 3 L6 2 L19 2 L5 17 Z"},
        {"d":"M5 20 L19 5 L19 23 L12 17 L5 23 Z"}
      ],
      history:[
        {"d":"M2 11 C2.5 5 7 2 12 2 C17 2 21.5 6 22 12 L19.8 12 C19.8 7.7 16.3 4.2 12 4.2 C8 4.2 4.8 7 4.2 11 Z M22 14 C21 19 17.2 22 12.8 22 L11.6 19.8 C15.8 20 19 17.4 19.8 14 Z M10 22 C5 21 2 17.2 2 13 L4.2 13 C4.5 16.4 7 19 9 19.6 Z"},
        {"d":"M12 6 L12 12 L15.5 15","role":"hand"}
      ],
      library:[
        {"d":"M3 3 L4 2 L7.5 2 L7.5 5 L3 10 ZM3 12 L7.5 7 L7.5 22 L3 22 Z","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10 3 L11 2 L14.5 2 L14.5 5 L10 10 ZM10 12 L14.5 7 L14.5 22 L10 22 Z","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17 3 L18 2 L21.5 2 L21.5 5 L17 10 ZM17 12 L21.5 7 L21.5 22 L17 22 Z","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }},
    {id:"holo",stroke:1.05,cap:"round",join:"round",icons:{
      back:[
        {"d":"M16 3 L8 12 L16 21 "},
        {"d":"M14.6 2.5 C10 3.7 5 7.4 3 11 "},
        {"d":"M3 13 C5 17.2 10 20.3 14.6 21.5 "},
        {"d":"M15.7 2.5 C15.7 2.77615 15.476149999999999 3 15.2 3 C14.92385 3 14.7 2.77615 14.7 2.5 C14.7 2.22385 14.92385 2 15.2 2 C15.476149999999999 2 15.7 2.22385 15.7 2.5 Z"},
        {"d":"M3.65 12 C3.65 12.358995 3.358995 12.65 3 12.65 C2.641005 12.65 2.35 12.358995 2.35 12 C2.35 11.641005 2.641005 11.35 3 11.35 C3.358995 11.35 3.65 11.641005 3.65 12 Z"},
        {"d":"M15.7 21.5 C15.7 21.77615 15.476149999999999 22 15.2 22 C14.92385 22 14.7 21.77615 14.7 21.5 C14.7 21.22385 14.92385 21 15.2 21 C15.476149999999999 21 15.7 21.22385 15.7 21.5 Z"},
        {"d":"M18.2 7.5 C19.7 10.3 19.7 13.7 18.2 16.5"}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 Z"},
        {"d":"M2.5 16 L5 16 L5 20 L19 20 L19 16 L21.5 16 L21.5 21 L20 22.5 L4 22.5 L2.5 21 Z"}
      ],
      bookmark:[
        {"d":"M7 2 L17 2 Q19 2 19 4 L19 23 L12 17 L5 23 L5 4 Q5 2 7 2 Z"}
      ],
      history:[
        {"d":"M2 10 C3 5 7 2 11 2 M13 2 C17.6 2 21 6 22 10 M22 14 C21 18.8 17 22 13 22 M11 22 C6 21.5 3 18.5 2 14 M4.5 10 C5.3 6.6 8.5 4.4 11.3 4.3 M13.2 4.3 C16.7 4.8 19.3 7.1 19.5 10 M19.5 14 C18.6 17.4 16.5 19.4 13.2 19.7 M11.3 19.7 C7.6 19 5.2 17.5 4.5 14 M2.75 12 C2.75 12.414225 2.414225 12.75 2 12.75 C1.585775 12.75 1.25 12.414225 1.25 12 C1.25 11.585775 1.585775 11.25 2 11.25 C2.414225 11.25 2.75 11.585775 2.75 12 ZM22.75 12 C22.75 12.414225 22.414225 12.75 22 12.75 C21.585775 12.75 21.25 12.414225 21.25 12 C21.25 11.585775 21.585775 11.25 22 11.25 C22.414225 11.25 22.75 11.585775 22.75 12 Z"},
        {"d":"M12 6 L12 12 L15.5 15","role":"hand"}
      ],
      library:[
        {"d":"M3.7 2 L6.8 2 Q7.5 2 7.5 2.7 L7.5 21.3 Q7.5 22 6.8 22 L3.7 22 Q3 22 3 21.3 L3 2.7 Q3 2 3.7 2 Z M3 4.5 L7.5 4.5 M3 19.5 L7.5 19.5","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10.7 2 L13.8 2 Q14.5 2 14.5 2.7 L14.5 21.3 Q14.5 22 13.8 22 L10.7 22 Q10 22 10 21.3 L10 2.7 Q10 2 10.7 2 Z M10 4.5 L14.5 4.5 M10 19.5 L14.5 19.5","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17.7 2 L20.8 2 Q21.5 2 21.5 2.7 L21.5 21.3 Q21.5 22 20.8 22 L17.7 22 Q17 22 17 21.3 L17 2.7 Q17 2 17.7 2 Z M17 4.5 L21.5 4.5 M17 19.5 L21.5 19.5","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }},
    {id:"brass",stroke:1.05,cap:"round",join:"round",icons:{
      back:[
        {"d":"M15.4 2.4 Q16.6 1.3 17.5 2.4 L18 4 Q18 4.8 17.4 5.3 L9.2 13.1 L7 10.3 Z "},
        {"d":"M7 10.3 Q6 9.3 5 10.3 L3 12.2 Q2.3 13 3 13.7 L15 22.1 Q17 23.3 17.7 21.6 L17.7 19.5 L7 10.3 Z"},
        {"d":"M16.8 3.7 C16.8 4.14184 16.44184 4.5 16 4.5 C15.55816 4.5 15.2 4.14184 15.2 3.7 C15.2 3.25816 15.55816 2.9000000000000004 16 2.9000000000000004 C16.44184 2.9000000000000004 16.8 3.25816 16.8 3.7 Z"},
        {"d":"M6.8 12.4 C6.8 12.841840000000001 6.44184 13.200000000000001 6 13.200000000000001 C5.55816 13.200000000000001 5.2 12.841840000000001 5.2 12.4 C5.2 11.95816 5.55816 11.6 6 11.6 C6.44184 11.6 6.8 11.95816 6.8 12.4 Z"},
        {"d":"M16.1 20.3 C16.1 20.74184 15.74184 21.1 15.3 21.1 C14.858160000000002 21.1 14.5 20.74184 14.5 20.3 C14.5 19.85816 14.858160000000002 19.5 15.3 19.5 C15.74184 19.5 16.1 19.85816 16.1 20.3 Z"}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 Z"},
        {"d":"M3.2 18 L20.8 18 Q21.8 18 21.8 19 L21.8 23 Q21.8 24 20.8 24 L3.2 24 Q2.2 24 2.2 23 L2.2 19 Q2.2 18 3.2 18 ZM5.3 19.7 C5.3 20.08661 4.98661 20.4 4.6 20.4 C4.2133899999999995 20.4 3.8999999999999995 20.08661 3.8999999999999995 19.7 C3.8999999999999995 19.31339 4.2133899999999995 19 4.6 19 C4.98661 19 5.3 19.31339 5.3 19.7 ZM5.3 22.2 C5.3 22.58661 4.98661 22.9 4.6 22.9 C4.2133899999999995 22.9 3.8999999999999995 22.58661 3.8999999999999995 22.2 C3.8999999999999995 21.81339 4.2133899999999995 21.5 4.6 21.5 C4.98661 21.5 5.3 21.81339 5.3 22.2 ZM20.099999999999998 19.7 C20.099999999999998 20.08661 19.78661 20.4 19.4 20.4 C19.013389999999998 20.4 18.7 20.08661 18.7 19.7 C18.7 19.31339 19.013389999999998 19 19.4 19 C19.78661 19 20.099999999999998 19.31339 20.099999999999998 19.7 ZM20.099999999999998 22.2 C20.099999999999998 22.58661 19.78661 22.9 19.4 22.9 C19.013389999999998 22.9 18.7 22.58661 18.7 22.2 C18.7 21.81339 19.013389999999998 21.5 19.4 21.5 C19.78661 21.5 20.099999999999998 21.81339 20.099999999999998 22.2 Z"}
      ],
      bookmark:[
        {"d":"M7 2 L17 2 Q19 2 19 4 L19 23 L12 17 L5 23 L5 4 Q5 2 7 2 Z"},
        {"d":"M8.1 4.5 C8.1 4.99707 7.69707 5.4 7.2 5.4 C6.70293 5.4 6.3 4.99707 6.3 4.5 C6.3 4.00293 6.70293 3.6 7.2 3.6 C7.69707 3.6 8.1 4.00293 8.1 4.5 ZM17.7 4.5 C17.7 4.99707 17.29707 5.4 16.8 5.4 C16.30293 5.4 15.9 4.99707 15.9 4.5 C15.9 4.00293 16.30293 3.6 16.8 3.6 C17.29707 3.6 17.7 4.00293 17.7 4.5 ZM8 20.5 C8 20.94184 7.64184 21.3 7.2 21.3 C6.75816 21.3 6.4 20.94184 6.4 20.5 C6.4 20.05816 6.75816 19.7 7.2 19.7 C7.64184 19.7 8 20.05816 8 20.5 ZM17.6 20.5 C17.6 20.94184 17.24184 21.3 16.8 21.3 C16.35816 21.3 16 20.94184 16 20.5 C16 20.05816 16.35816 19.7 16.8 19.7 C17.24184 19.7 17.6 20.05816 17.6 20.5 Z","h":"M8.1 4.5 C8.1 4.9971 7.6971 5.4 7.2 5.4 C6.7029 5.4 6.3 4.9971 6.3 4.5 C6.3 4.0029 6.7029 3.6 7.2 3.6 C7.6971 3.6 8.1 4.0029 8.1 4.5 ZM17.7 4.5 C17.7 4.9971 17.2971 5.4 16.8 5.4 C16.3029 5.4 15.9 4.9971 15.9 4.5 C15.9 4.0029 16.3029 3.6 16.8 3.6 C17.2971 3.6 17.7 4.0029 17.7 4.5 ZM8 20.5 C8 20.9418 7.6418 21.3 7.2 21.3 C6.7582 21.3 6.4 20.9418 6.4 20.5 C6.4 20.0582 6.7582 19.7 7.2 19.7 C7.6418 19.7 8 20.0582 8 20.5 ZM17.6 20.5 C17.6 20.9418 17.2418 21.3 16.8 21.3 C16.3582 21.3 16 20.9418 16 20.5 C16 20.0582 16.3582 19.7 16.8 19.7 C17.2418 19.7 17.6 20.0582 17.6 20.5 Z","c":"M8.1 4.5 C8.1 4.99707 7.69707 5.4 7.2 5.4 C6.70293 5.4 6.3 4.99707 6.3 4.5 C6.3 4.00293 6.70293 3.6 7.2 3.6 C7.69707 3.6 8.1 4.00293 8.1 4.5 ZM17.7 4.5 C17.7 4.99707 17.29707 5.4 16.8 5.4 C16.30293 5.4 15.9 4.99707 15.9 4.5 C15.9 4.00293 16.30293 3.6 16.8 3.6 C17.29707 3.6 17.7 4.00293 17.7 4.5 ZM8 20.5 C8 20.94184 7.64184 21.3 7.2 21.3 C6.75816 21.3 6.4 20.94184 6.4 20.5 C6.4 20.05816 6.75816 19.7 7.2 19.7 C7.64184 19.7 8 20.05816 8 20.5 ZM17.6 20.5 C17.6 20.94184 17.24184 21.3 16.8 21.3 C16.35816 21.3 16 20.94184 16 20.5 C16 20.05816 16.35816 19.7 16.8 19.7 C17.24184 19.7 17.6 20.05816 17.6 20.5 Z"},
        {"d":"M11.2 13.4 C11.8 12.8 12.7 12.8 13.2 13.4 L13.2 14.5 C12.6 15.2 11.6 15.2 11 14.5 L11.2 13.4 Z","h":"M13.09 9.62 C14.404 8.138 16.732 9.188 16.14 10.796 L12.276 17.062 C10.962 18.728 8.576 17.426 9.152 15.802 L13.09 9.62 Z","c":"M15.7 4.4 C18 1.7 22.3 4.2 20.2 7.2 L11 20.6 C8.7 23.6 4.4 20.5 6.6 17.6 L15.7 4.4 Z"},
        {"d":"M12.71 14 C12.71 14.364518 12.414518000000001 14.66 12.05 14.66 C11.685482 14.66 11.39 14.364518 11.39 14 C11.39 13.635482 11.685482 13.34 12.05 13.34 C12.414518000000001 13.34 12.71 13.635482 12.71 14 ZM12.71 14 C12.71 14.364518 12.414518000000001 14.66 12.05 14.66 C11.685482 14.66 11.39 14.364518 11.39 14 C11.39 13.635482 11.685482 13.34 12.05 13.34 C12.414518000000001 13.34 12.71 13.635482 12.71 14 Z","h":"M15.3308 10.472 C15.3308 10.9502 14.9432 11.3378 14.465 11.3378 C13.9868 11.3378 13.5992 10.9502 13.5992 10.472 C13.5992 9.9938 13.9868 9.6062 14.465 9.6062 C14.9432 9.6062 15.3308 9.9938 15.3308 10.472 ZM11.5928 16.142 C11.5928 16.6202 11.2052 17.0078 10.727 17.0078 C10.2488 17.0078 9.8612 16.6202 9.8612 16.142 C9.8612 15.6638 10.2488 15.2762 10.727 15.2762 C11.2052 15.2762 11.5928 15.6638 11.5928 16.142 Z","c":"M18.95 5.6 C18.95 6.235144999999999 18.435145000000002 6.75 17.8 6.75 C17.164855 6.75 16.650000000000002 6.235144999999999 16.650000000000002 5.6 C16.650000000000002 4.964855 17.164855 4.449999999999999 17.8 4.449999999999999 C18.435145000000002 4.449999999999999 18.95 4.964855 18.95 5.6 ZM10.05 19.1 C10.05 19.735145000000003 9.535145 20.25 8.9 20.25 C8.264855 20.25 7.75 19.735145000000003 7.75 19.1 C7.75 18.464855 8.264855 17.950000000000003 8.9 17.950000000000003 C9.535145 17.950000000000003 10.05 18.464855 10.05 19.1 Z"}
      ],
      history:[
        {"d":"M22 12 C22 17.523 17.523 22 12 22 C6.477 22 2 17.523 2 12 C2 6.477 6.477 2 12 2 C17.523 2 22 6.477 22 12 ZM19.8 12 C19.8 16.307940000000002 16.307940000000002 19.8 12 19.8 C7.69206 19.8 4.2 16.307940000000002 4.2 12 C4.2 7.69206 7.69206 4.2 12 4.2 C16.307940000000002 4.2 19.8 7.69206 19.8 12 Z M12 2 L12 4.2 M12 19.8 L12 22 M2 12 L4.2 12 M19.8 12 L22 12 M3.65 12 C3.65 12.358995 3.358995 12.65 3 12.65 C2.641005 12.65 2.35 12.358995 2.35 12 C2.35 11.641005 2.641005 11.35 3 11.35 C3.358995 11.35 3.65 11.641005 3.65 12 Z"},
        {"d":"M11.3 6.2 Q12 5.3 12.7 6.2 L12.7 11.6 L15.4 14 Q16.1 14.6 15.4 15.1 Q14.9 15.4 14.4 14.8 L11.3 12.3 Z M12.8 12 C12.8 12.44184 12.44184 12.8 12 12.8 C11.55816 12.8 11.2 12.44184 11.2 12 C11.2 11.55816 11.55816 11.2 12 11.2 C12.44184 11.2 12.8 11.55816 12.8 12 Z","role":"hand"}
      ],
      library:[
        {"d":"M3.7 2 L6.8 2 Q7.5 2 7.5 2.7 L7.5 21.3 Q7.5 22 6.8 22 L3.7 22 Q3 22 3 21.3 L3 2.7 Q3 2 3.7 2 Z M3 4 L7.5 4 M6.25 5 C6.25 5.5523 5.8023 6 5.25 6 C4.6977 6 4.25 5.5523 4.25 5 C4.25 4.4477 4.6977 4 5.25 4 C5.8023 4 6.25 4.4477 6.25 5 ZM6.25 19 C6.25 19.5523 5.8023 20 5.25 20 C4.6977 20 4.25 19.5523 4.25 19 C4.25 18.4477 4.6977 18 5.25 18 C5.8023 18 6.25 18.4477 6.25 19 Z","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10.7 2 L13.8 2 Q14.5 2 14.5 2.7 L14.5 21.3 Q14.5 22 13.8 22 L10.7 22 Q10 22 10 21.3 L10 2.7 Q10 2 10.7 2 Z M10 4 L14.5 4 M13.25 5 C13.25 5.5523 12.8023 6 12.25 6 C11.6977 6 11.25 5.5523 11.25 5 C11.25 4.4477 11.6977 4 12.25 4 C12.8023 4 13.25 4.4477 13.25 5 ZM13.25 19 C13.25 19.5523 12.8023 20 12.25 20 C11.6977 20 11.25 19.5523 11.25 19 C11.25 18.4477 11.6977 18 12.25 18 C12.8023 18 13.25 18.4477 13.25 19 Z","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17.7 2 L20.8 2 Q21.5 2 21.5 2.7 L21.5 21.3 Q21.5 22 20.8 22 L17.7 22 Q17 22 17 21.3 L17 2.7 Q17 2 17.7 2 Z M17 4 L21.5 4 M20.25 5 C20.25 5.5523 19.8023 6 19.25 6 C18.6977 6 18.25 5.5523 18.25 5 C18.25 4.4477 18.6977 4 19.25 4 C19.8023 4 20.25 4.4477 20.25 5 ZM20.25 19 C20.25 19.5523 19.8023 20 19.25 20 C18.6977 20 18.25 19.5523 18.25 19 C18.25 18.4477 18.6977 18 19.25 18 C19.8023 18 20.25 18.4477 20.25 19 Z","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }},
    {id:"blueprint",stroke:1.05,cap:"butt",join:"miter",icons:{
      back:[
        {"d":"M16 2 L6 12 L16 22 L16 17.5 L10.5 12 L16 6.5 Z"},
        {"d":"M18 1 L18 23 ","w":0.55},
        {"d":"M14 3 L20 3 ","w":0.55},
        {"d":"M14 21 L20 21 ","w":0.55},
        {"d":"M2 12 L6 12 ","w":0.55},
        {"d":"M17 12 L19 12","w":0.55}
      ],
      reload:[],
      download:[
        {"d":"M10.2 2 L13.8 2 L13.8 11 L17.3 11 L12 17 L6.7 11 L10.2 11 Z M12 0 L12 5"},
        {"d":"M2.5 16 L5 16 L5 20 L19 20 L19 16 L21.5 16 L21.5 21 L20 22.5 L4 22.5 L2.5 21 Z"},
        {"d":"M4 20 L4 25 M20 20 L20 25 M2 23 L22 23","w":0.55}
      ],
      bookmark:[
        {"d":"M5 2 L19 2 L19 23 L12 17 L5 23 Z","h":"M5.42 1.58 L16.9 2.84 L16.9 23.42 L9.48 18.47 L5.42 22.16 Z","c":"M6 1 L14 4 L14 24 L6 20.5 L6 21 Z"},
        {"d":"M5 2 L5 2 L19 2 L19 2 Z M19 2 L19 23 L19 23 L19 2 Z","h":"M5.42 1.58 L6.68 0.74 L18.58 2 L16.9 2.84 Z M16.9 2.84 L16.9 23.42 L18.58 22.37 L18.58 2 Z","c":"M6 1 L9 -1 L18 2 L14 4 Z M14 4 L14 24 L18 21.5 L18 2 Z"},
        {"d":"M3 0 L3 24 M21 0 L21 24 M1 2 L23 2 M1 23 L23 23 M12 0 L12 8 M12 17 L12 24","w":0.55,"h":"M2.16 1.68 L2.16 22.74 M21 0 L21 23.58 M1.84 0.74 L22.16 3.26 M0.58 20.9 L22.16 24.26 M8.64 -0.42 L15.78 6.74 M8.64 17.84 L15.78 24.42","c":"M1 4 L1 21 M21 0 L21 23 M3 -1 L21 5 M0 18 L21 25.3 M4 -1 L21 5 M4 19 L21 25 "},
        {"d":"M4 -.2 L4 4 M20 -.2 L20 4 M4 21 L4 25 M20 21 L20 25","w":0.55,"h":"M4 -0.116 L5.68 3.16 M18.32 -0.116 L20 3.16 M4 20.58 L5.68 23.74 M18.32 21.42 L20 24.58","c":"M4 0 L8 2 M16 0 L20 2 M4 20 L8 22 M16 22 L20 24 "}
      ],
      history:[
        {"d":"M21.7 12 C21.7 17.35731 17.35731 21.7 12 21.7 C6.64269 21.7 2.3000000000000007 17.35731 2.3000000000000007 12 C2.3000000000000007 6.64269 6.64269 2.3000000000000007 12 2.3000000000000007 C17.35731 2.3000000000000007 21.7 6.64269 21.7 12 ZM19.5 12 C19.5 16.14225 16.14225 19.5 12 19.5 C7.85775 19.5 4.5 16.14225 4.5 12 C4.5 7.85775 7.85775 4.5 12 4.5 C16.14225 4.5 19.5 7.85775 19.5 12 Z"},
        {"d":"M12 0 L12 5 M12 19 L12 24 M0 12 L5 12 M19 12 L24 12","w":0.55},
        {"d":"M12 6 L12 12 L15.5 15","role":"hand"}
      ],
      library:[
        {"d":"M3.7 2 L6.8 2 Q7.5 2 7.5 2.7 L7.5 21.3 Q7.5 22 6.8 22 L3.7 22 Q3 22 3 21.3 L3 2.7 Q3 2 3.7 2 Z M3 4.5 L7.5 4.5 M3 19.5 L7.5 19.5 M5.25 0 L5.25 2 M5.25 22 L5.25 24","o":[5.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M10.7 2 L13.8 2 Q14.5 2 14.5 2.7 L14.5 21.3 Q14.5 22 13.8 22 L10.7 22 Q10 22 10 21.3 L10 2.7 Q10 2 10.7 2 Z M10 4.5 L14.5 4.5 M10 19.5 L14.5 19.5 M12.25 0 L12.25 2 M12.25 22 L12.25 24","o":[12.25,22],"t":[[0,0,0,1,1],[0,0,0,1,1],[0,0,0,1,1]]},
        {"d":"M17.7 2 L20.8 2 Q21.5 2 21.5 2.7 L21.5 21.3 Q21.5 22 20.8 22 L17.7 22 Q17 22 17 21.3 L17 2.7 Q17 2 17.7 2 Z M17 4.5 L21.5 4.5 M17 19.5 L21.5 19.5 M19.25 0 L19.25 2 M19.25 22 L19.25 24","o":[19.25,22],"t":[[0,0,-8,1,1],[0,0,0,1,1],[0,0,0,1,1]]}
      ]
    }}
  ];
  const circle=(x,y,r)=>`M${x+r} ${y} C${x+r} ${y+r*.5523} ${x+r*.5523} ${y+r} ${x} ${y+r} C${x-r*.5523} ${y+r} ${x-r} ${y+r*.5523} ${x-r} ${y} C${x-r} ${y-r*.5523} ${x-r*.5523} ${y-r} ${x} ${y-r} C${x+r*.5523} ${y-r} ${x+r} ${y-r*.5523} ${x+r} ${y} Z`;
  const poly=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' ')+' Z';
  const shown={opacity:[0,1,1]};
  const move=(parts,t,origin,role,attach)=>{for(const p of parts){p.t=t;p.o=origin;p.rate=1;p.role=role;p.attach=attach;}};
  // Orthographic projection of a rigid panel about its specified diagonal hinge.
  function foldAtAxis(d,[ax,ay,bx,by],degrees){
    const vx=bx-ax,vy=by-ay,n=vx*vx+vy*vy,k=Math.cos(degrees*Math.PI/180);
    return d.replace(/([ML])\s*([-+\d.]+)\s+([-+\d.]+)/g,(_,cmd,x,y)=>{
      x=+x;y=+y;const u=((x-ax)*vx+(y-ay)*vy)/n,px=ax+u*vx,py=ay+u*vy;
      return `${cmd}${+(px+(x-px)*k).toFixed(5)} ${+(py+(y-py)*k).toFixed(5)}`;
    });
  }
  function panelPerspective(d,angle){
    const r=angle*Math.PI/180;
    return d.replace(/([ML])\s*([-+\d.]+)\s+([-+\d.]+)/g,(_,cmd,x,y)=>{
      const dx=+x-12,depth=-dx*Math.sin(r),scale=80/(80-depth);
      return `${cmd}${+(12+dx*Math.cos(r)*scale).toFixed(5)} ${+(12+(+y-12)*scale).toFixed(5)}`;
    });
  }
  function anchor(parts,x,y){
    for(let i=0;i<parts.length;i++){
      const n=(parts[i].d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)||[]).map(Number);
      for(let j=0;j<n.length;j+=2)if(Math.abs(n[j]-x)<1e-7&&Math.abs(n[j+1]-y)<1e-7)return{part:i,other:j};
    }
    return null;
  }
  const polar=(r,a)=>[12+r*Math.cos(a*Math.PI/180),12+r*Math.sin(a*Math.PI/180)];
  const rotatePath=(d,angle,origin=[12,12])=>{const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let x;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig,(n,i)=>{if(x===undefined){x=+n;return '#';}const px=x-origin[0],py=+n-origin[1];x=undefined;return `${+(origin[0]+c*px-s*py).toFixed(5)} ${+(origin[1]+s*px+c*py).toFixed(5)}`;}).replace(/#\s*/g,'');};
  function programmedFlow(d,flow,extra={}){return P(d,{flow,o:[0,0],t:[I,I,I],rate:1,...extra});}
  const reloadBeats={hover:[[0,'release'],[160,'hover']],click:[[0,'release'],[180,'advance'],[500,'click'],[830,'seat']],leave:[[0,'release'],[180,'rest']]};
  function reloadMechanism(id){
    const parts=[],track={ellipse:[12,12,8.6,8.6,0]};
    const add=(d,flow,extra={})=>{const p=programmedFlow(d,flow,extra);parts.push(p);return p;};
    if(id==='facet'){
      // Six independently hinged vanes share a circular actuator. Each pin
      // stays fixed; the open aperture changes by pivoting complete plates.
      for(let i=0;i<6;i++){
        const angle=i*60,pivot=polar(8.5,angle-90),d=rotatePath('M12 3.5 L15.8 4.8 L14.8 8.5 L12.8 7.8 Z M12 3.5 L14.8 8.5',angle);
        parts.push(P(d,{w:.68,o:pivot,t:[I,[0,0,-17,1,1],[0,0,16,1,1]],role:'iris-blade',attach:`facet:iris:${i}`,poses:{release:{base:0,t:[0,0,-8,1,1]},advance:{base:0,t:[0,0,-27,1,1]},seat:{base:1}},beats:reloadBeats}));
        parts.push(P(circle(...pivot,.38),{w:.55,role:'iris-pin'}));
        add('M0 0',{track:{ellipse:[12,12,9.5,9.5,0]},mode:'trail',start:i/6-.22,span:[.12,.12,.12],phase:[0,.016,.033],wrap:true},{w:.42,role:'iris-actuator',poses:{release:{base:0,phase:-.012},advance:{base:0,phase:.045},seat:{base:1}},beats:reloadBeats});
      }
    }else if(id==='neon'){
      // Two paired packets scan separate halves of a circular bus. Their
      // bounded connector blocks travel with the ends of the authored traces.
      for(let i=0;i<2;i++){
        const flow={track,wrap:true,start:i*.5-.2,phase:[0,.06,.12],span:[.24,.34,.23]};
        const wire=parts.length,head=wire+1,poses={release:{base:0,span:.1,phase:0},advance:{base:1,phase:.22,span:.26},seat:{base:1,phase:.5}};
        add('M0 0',{...flow,mode:'trail'},{w:.65,role:'circuit-trace',attach:`neon:packet:${i}`,occludedBy:[head],poses,beats:reloadBeats});
        add('M-1 -.9 L1 -.9 L1 .9 L-1 .9 Z',{...flow,mode:'head',anchor:[0,0]},{w:.7,role:'packet',attach:`neon:packet:${i}`,poses,beats:reloadBeats});
        add('M-.45 -.35 L.45 -.35 M-.45 .35 L.45 .35',{...flow,mode:'head',anchor:[0,0]},{w:.36,role:'packet-contact',attach:`neon:packet:${i}`,poses,beats:reloadBeats});
      }
      parts.push(P('M7.5 12 L9.7 12 L9.7 10.4 L11.1 10.4 M16.5 12 L14.3 12 L14.3 13.6 L12.9 13.6',{w:.65,role:'circuit-coupler'}));
      for(const side of [-1,1])parts.push(P(poly([[12+side*.8,10.4],[12+side*1.8,11.2],[12+side*1.8,12.8],[12+side*.8,13.6]]),{w:.6,role:'connector-jaw',o:[12,12],t:[I,[side*1.1,0,0,1,1],[side*.25,0,0,1,1]],poses:{release:{base:0,t:[side*1.5,0,0,1,1]},advance:{base:2},seat:{base:1}},beats:reloadBeats}));
    }else if(id==='shard'){
      // Complete angular shoes disengage radially, index along the circle,
      // and return to four fixed sockets. No shoe stretches or grows.
      for(let i=0;i<4;i++){
        const sign=i%2?1:-1,flow={track,mode:'head',start:i/4-.125,anchor:[0,0],phase:[0,sign*.038,.25]},poses={release:{base:0,t:[0,-1.1,0,1,1]},advance:{base:0,phase:.125+sign*.028,t:[0,-1.1,0,1,1]},seat:{base:2}};
        add('M-2.3 -.7 L1.5 -.7 L2.4 .05 L.9 .95 L-2.3 .95 L-1.65 .05 Z M-1.65 .05 L.9 .95',flow,{w:.66,role:'ring-shoe',attach:`shard:shoe:${i}`,t:[I,[0,-.55,0,1,1],I],poses,beats:reloadBeats});
        const socket=rotatePath('M16.7 6.9 L17.8 8 L16.8 9.1',i*90);
        parts.push(P(socket,{w:.48,role:'shoe-socket'}));
      }
      parts.push(P('M10.3 11 L12 9.6 L13.7 11 L12 14.4 Z',{w:.58,role:'index-key',o:[12,12],t:[I,[0,0,22,1,1],[0,0,90,1,1]],poses:{release:{base:0,t:[0,0,-12,1,1]},advance:{base:0,t:[0,0,48,1,1]},seat:{base:2}},beats:reloadBeats}));
    }else if(id==='holo'){
      // Transverse orbital planes stay fixed while two differently shaped
      // cores meet at their shared right-hand node, then separate again.
      parts.push(P(circle(12,12,2.05),{w:.55,role:'orbital-hub'}));
      for(let i=0;i<2;i++){
        const orbit={ellipse:[12,12,8,3.7,i?-42:42]},meeting=Math.atan(8*Math.tan(42*Math.PI/180)/3.7)/(Math.PI*2),dock=i?meeting:1-meeting;
        for(const layer of ['back','front']){
          add('M0 0',{track:orbit,mode:'trail',start:0,span:[1,1,1],layer},{w:.42,role:'transverse-hoop',...(layer==='back'?{occludedBy:[0]}:{})});
          const flow={track:orbit,mode:'head',start:0,anchor:[0,0],phase:[i?.55:.12,i?.36:.45,dock],layer};
          add(i?'M0 -.85 L.85 0 L0 .85 L-.85 0 Z':circle(0,0,.66),flow,{w:.65,role:'orbital-core',attach:`holo:core:${i}`,...(layer==='back'?{occludedBy:[0]}:{}),poses:{release:{base:0,phase:i?.6:.08},advance:{base:1,phase:i?.26:.65},seat:{base:2}},beats:reloadBeats});
        }
      }
      for(const start of [.08,.58])add('M0 0',{track:{ellipse:[12,12,10,10,0]},mode:'trail',start,wrap:true,span:[.29,.34,.23],phase:[0,0,0]},{w:.48,role:'outer-hoop',poses:{release:{base:0,span:.2},advance:{base:1},seat:{base:2}},beats:reloadBeats});
    }else if(id==='brass'){
      const flow={track:{ellipse:[12,12,8.8,8.8,0]},wrap:true,start:.035,phase:[0,0,0],span:[.34,.52,.72]},poses={release:{base:0,span:.26},advance:{base:1,span:.59},seat:{base:2,span:.65}};
      add('M0 0',{...flow,mode:'trail',width:1.3,taper:1},{w:.55,role:'winding-band',attach:'brass:winding',occludedBy:[1,5],poses,beats:reloadBeats});
      add('M-.65 -.65 L.65 -.65 Q1 -.65 1 0 Q1 .65 .65 .65 L-.65 .65 Z',{...flow,mode:'head',anchor:[0,0]},{w:.65,role:'band-carriage',attach:'brass:winding',poses,beats:reloadBeats});
      for(const offset of [-.075,-.2])add(circle(0,0,.19),{...flow,mode:'head',anchor:[0,0],start:flow.start+offset},{w:.27,role:'band-rivet',attach:'brass:winding',poses,beats:reloadBeats});
      const teeth=[];for(let i=0;i<=12;i++){const a=-20+i*16;teeth.push(polar(i%2?6.8:7.7,a));}for(let i=12;i>=0;i--)teeth.push(polar(5.8,-20+i*16));
      parts.push(P(poly(teeth),{w:.58,role:'ratchet-sector',o:[12,12],t:[I,[0,0,8,1,1],[0,0,16,1,1]],poses:{release:{base:0},advance:{base:0,t:[0,0,25,1,1]},seat:{base:2}},beats:reloadBeats}));
      parts.push(P('M18.4 12.1 L22 12.1 L22 15.8 L18.4 15.8 Z',{w:.65,role:'ratchet-throat'}));
      parts.push(P('M18.8 10.6 L20.9 13.5 L19.8 14.2 L18.2 11.2 Z',{w:.7,role:'escapement',o:[18.6,10.9],t:[I,[0,0,-19,1,1],[0,0,12,1,1]],poses:{release:{base:0,t:[0,0,-31,1,1]},advance:{base:0,t:[0,0,-8,1,1]},seat:{base:2}},beats:reloadBeats}));
      parts.push(P(circle(18.6,10.9,.38)+' '+circle(20.2,14.5,.32),{w:.45,role:'ratchet-pins'}));
    }else{
      // The carriage, ink endpoint and compass arm share the exact same
      // circular phase/span. The opposite end of the rigid arm is the hub.
      const flow={track,wrap:true,start:-.25,phase:[0,0,0],span:[.25,.5,.87]},poses={release:{base:0,span:.12},advance:{base:1,span:.65},seat:{base:2}};
      add('M0 0',{...flow,mode:'trail'},{w:.6,role:'drafted-circle',attach:'blueprint:compass',occludedBy:[2],poses,beats:reloadBeats});
      add('M-.25 0 L.25 0 L.25 7.9 L0 8.6 L-.25 7.9 Z',{...flow,mode:'head',anchor:[0,0]},{w:.47,role:'compass-arm',attach:'blueprint:compass',occludedBy:[3],poses,beats:reloadBeats});
      add('M-.8 -.6 L.8 -.6 L.8 .6 L-.8 .6 Z',{...flow,mode:'head',anchor:[0,0]},{w:.6,role:'compass-carriage',attach:'blueprint:compass',poses,beats:reloadBeats});
      parts.push(P(circle(12,12,.72),{w:.5,role:'compass-hub'}));
      parts.push(P('M.8 12 L4 12 M20 12 L23.2 12 M12 .8 L12 4 M12 20 L12 23.2 M10.4 12 L13.6 12 M12 10.4 L12 13.6',{w:.37,role:'engraved-guides'}));
      parts.push(P('M4.9 3.7 L3.7 4.9 M20.3 19.1 L19.1 20.3 M19.1 3.7 L20.3 4.9 M3.7 19.1 L4.9 20.3',{w:.35,role:'engraved-guides'}));
    }
    return parts;
  }
  const actionBeats={hover:[[0,'prepare'],[120,'hover']],click:[[0,'prepare'],[140,'click'],[520,'release']],leave:[[0,'release'],[180,'rest']]};
  // Reverse only the existing authored shaft extension for the cocking stroke.
  function cockedArrow(p){const h=((p.h||p.d).match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)||[]).map(Number);let i=0;return p.d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig,n=>{const v=+n;return +(v-.65*(h[i++]-v)).toFixed(5);});}
  function flowPart(d,flow,extra={}){
    return P(d,{flow,turn:360,hoverTurn:.18,o:[0,0],t:[I,I,I],rate:1,...extra});
  }
  for(const theme of technical){
    const id=theme.id,icons=theme.icons,backT=[I,[-.4,0,0,1,1],[-.8,0,0,1,1]];
    theme.demo=icons.bookmark.map(p=>({...p}));
    // Back mechanisms retain bounded material. Shared pivots remain welded;
    // segmented Razor plates disengage as separate pieces instead of bending.
    if(id==='facet'||id==='neon'){
      const pivot=id==='facet'?[6,12]:[9,12],tx=id==='facet'?-.65:-.9;
      const paths=id==='facet'?['M16 2 L6 12 L10.5 12 L16 6.5 Z','M6 12 L16 22 L16 17.5 L10.5 12 Z']:['M15.7 2 Q17 2 17 3.3 L17 4.2 L9 12 L6 12 L15 3.3 L15 2.7 Q15 2 15.7 2 Z','M9 12 L17 19.8 L17 21 Q17 22.4 15.7 22 L15 21.4 L15 20.7 L6 12 Z'];
      icons.back=paths.map((d,i)=>P(d,{o:pivot,rate:1,role:'hinged-arrow',attach:`${id}:back:${i}`,t:[I,[tx,0,i?7:-7,1,1],[tx*2,0,i?12:-12,1,1]],poses:{prepare:{base:0,t:[.5,0,i?-3:3,1,1]},release:{base:1}},beats:actionBeats}));
      const joint=anchor([icons.back[0]],...pivot).other,other=anchor([icons.back[1]],...pivot).other;
      icons.back[0].seams=[{part:1,point:joint,other}];
      icons.back.push(P(circle(...pivot,.48),{w:.65,role:'arrow-hinge',o:pivot,t:[I,[tx,0,0,1,1],[tx*2,0,0,1,1]],rate:1,poses:{prepare:{base:0,t:[.5,0,0,1,1]},release:{base:1}},beats:actionBeats}));
    }else if(id==='shard'){
      const paths=['M16 2 L6 12 L12.7 9.8 L16 6.5 Z','M6 12 L12.7 9.8 L10.5 12 L12.7 14.2 Z','M6 12 L16 22 L16 17.5 L12.7 14.2 Z'];
      icons.back=paths.map((d,i)=>P(d,{o:[12,12],rate:1,role:'sliding-arrow-plane',attach:`shard:back:${i}`,t:[I,[i===1?-1.8:-.4,i===0?-.45:i===2?.45:0,0,1,1],[i===1?-3.4:-1.1,i===0?-1.05:i===2?1.05:0,0,1,1]],poses:{prepare:{base:0,t:[.45,0,0,1,1]},release:{base:1}},beats:{hover:[[0,'prepare'],[i===1?190:80,'hover']],click:[[0,'prepare'],[i===1?240:110,'click'],[600,'release']],leave:[[0,'release'],[190,'rest']]}}));
    }else if(id==='brass'){
      const pivot=[7,10.3];
      icons.back.forEach((p,i)=>{delete p.h;delete p.c;delete p.seams;const upper=i===0||i===2,sign=upper?-1:1;p.o=pivot;p.rate=1;p.role=upper?'upper-jaw':'lower-jaw';p.attach=`brass:back:${upper?'upper':'lower'}`;p.t=[I,[-.6,0,sign*4,1,1],[-1.3,0,sign*8,1,1]];p.poses={prepare:{base:0,t:[.45,0,-sign*3,1,1]},release:{base:1}};p.beats=actionBeats;});
      icons.back[0].seams=[{part:1,point:anchor([icons.back[0]],...pivot).other,other:0}];
      icons.back[1].occludedBy=[0];icons.back[3].occludedBy=[0];
      icons.back.push(P(circle(...pivot,.43),{w:.6,role:'jaw-pivot',o:pivot,t:[I,[-.6,0,0,1,1],[-1.3,0,0,1,1]],rate:1,poses:{prepare:{base:0,t:[.45,0,0,1,1]},release:{base:1}},beats:actionBeats}));
    }else if(id==='holo'){
      const old=icons.back,upper=P('M16 3 L8 12'),lower=P('M8 12 L16 21');
      const masks=[P('M15.6 2.6 L16.4 3.4 L8.4 12.4 L7.6 11.6 Z',{maskOnly:true}),P('M7.6 12.4 L8.4 11.6 L16.4 20.6 L15.6 21.4 Z',{maskOnly:true})];
      icons.back=[upper,lower,old[1],old[2],old[6],...masks];
      for(const [i,p]of [[0,upper],[1,lower],[0,masks[0]],[1,masks[1]]]){const sign=i?1:-1;move([p],[I,[-.6,0,sign*5,1,1],[-1.2,0,sign*10,1,1]],[8,12],p.maskOnly?'arrow-mask':'arrow-arm',`holo:arrow:${i}`);p.poses={prepare:{base:0,t:[.4,0,0,1,1]},release:{base:1}};p.beats=actionBeats;}
      upper.seams=[{part:1,point:2,other:0}];
      const orbit={ellipse:[12,12,9,10.167,0]},u=Math.acos(3.2/9)/(Math.PI*2);
      for(const [j,start]of [1-u,.5,u].entries())for(const layer of ['back','front'])icons.back.push(programmedFlow(circle(0,0,j===1?.65:.5),{track:orbit,mode:'head',start,anchor:[0,0],phase:[0,.07,.28],layer},{w:.72,role:'back-orbital-node',attach:`holo:back-node:${j}`,...(layer==='back'?{occludedBy:[5,6]}:{}),poses:{prepare:{base:0,phase:-.015},release:{base:1}},beats:actionBeats}));
    }else{
      move(icons.back,[I,I,I],[12,12],'draft-guide','blueprint:back-guides');
      const arrow=icons.back[0];arrow.role='arrow';arrow.attach='blueprint:back-arrow';arrow.h='M16 2 L4.8 12 L16 22 L16 17.5 L9.8 12 L16 6.5 Z';arrow.c='M16 2 L3.2 12 L16 22 L16 17.5 L8.8 12 L16 6.5 Z';arrow.poses={prepare:{base:0,d:cockedArrow(arrow)},release:{base:1}};arrow.beats=actionBeats;
      for(const side of [-1,1]){
        const y=side<0?2.4:20.4,d=`M17 ${y} L19 ${y} L19 ${y+1.2} L17 ${y+1.2} Z M17.5 ${y+.6} L18.5 ${y+.6}`;
        icons.back.push(P(d,{w:.55,role:'draft-carriage',o:[18,12],t:[I,[0,-side*2.6,0,1,1],[0,-side*5.6,0,1,1]],poses:{prepare:{base:0,t:[0,side*.4,0,1,1]},release:{base:1}},beats:actionBeats}));
      }
    }

    icons.reload=reloadMechanism(id);

    // The original receiver preloads, then yields as the intact arrow enters.
    const trayT=[I,[0,-.35,0,1,1],[0,.7,0,1,1]];
    move(icons.download.slice(1),trayT,[12,12],'tray',`${id}:tray`);
    move([icons.download[0]],[I,[0,.8,0,1,1],[0,4.5,0,1,1]],[12,12],'arrow',`${id}:download`);
    const lip=id==='neon'?'M6 19.5 L18 19.5 L20 20 L20 21 L18 22 L6 22 L4 21 L4 20 Z':icons.download[1].d.split('Z')[0]+'Z';
    const lipIndex=icons.download.length,front=P(lip,{maskOnly:true});
    move([front],trayT,[12,12],'receiver-face',`${id}:tray`);
    icons.download.push(front);icons.download[0].occludedBy=[lipIndex];

    // Fixed-size cleats live behind the receiver face; they withdraw before
    // entry, then close after landing. No plate grows from a point or a line.
    const receiverBeats={hover:[[0,'prepare'],[110,'hover']],click:[[0,'prepare'],[110,'hover'],[280,'click'],[580,'release']],leave:[[0,'release'],[200,'rest']]};
    for(const p of icons.download.slice(1)){
      p.poses={prepare:{base:0,t:[0,-.35,0,1,1]},release:{base:2}};p.beats=receiverBeats;
    }
    icons.download[0].poses={prepare:{base:0,t:[0,-1.2,0,1,1]},release:{base:2}};
    icons.download[0].beats={hover:[[0,'prepare'],[220,'hover']],click:[[0,'prepare'],[280,'click'],[580,'release']],leave:[[0,'release'],[200,'rest']]};
    if(id==='holo'){
      const orbit={ellipse:[12,20.1,8.7,2.8,0]},frontClamps=[];
      for(const layer of ['back','front']){
        icons.download.push(programmedFlow('M0 0',{track:orbit,mode:'trail',span:[1,1,1],layer},{w:.42,role:'receiver-orbit',...(layer==='back'?{occludedBy:[0,lipIndex]}:{})}));
        for(let i=0;i<2;i++){
          const index=icons.download.length;if(layer==='front')frontClamps.push(index);
          icons.download.push(programmedFlow('M-1.1 -.6 L1.1 -.6 Q1.6 -.6 1.6 0 Q1.6 .6 1.1 .6 L-1.1 .6 Q-1.6 .6 -1.6 0 Q-1.6 -.6 -1.1 -.6 Z',{track:orbit,mode:'head',start:i?.9:.6,anchor:[0,0],phase:[0,i?.11:-.11,i?.28:-.28],layer},{w:.68,role:'orbital-receiver-clamp',attach:`holo:receiver:${i}`,...(layer==='back'?{occludedBy:[0,lipIndex]}:{}),poses:{prepare:{base:0},release:{base:2,phase:i?.22:-.22}},beats:receiverBeats}));
        }
      }
      icons.download[0].occludedBy.push(...frontClamps);
    }else for(const side of [-1,1]){
      let d,detail,origin=[12,12],hover,click,prepare=[0,-.35,0,1,1],release=[0,.7,0,1,1];
      if(id==='facet'){
        d=poly([[5,20.4],[8.6,20.4],[8,21.9],[5,21.9]]);if(side>0)d=rotatePath(d,180,[12,21.15]);
        origin=[side<0?5:19,20.4];hover=[0,-.35,side*36,1,1];click=[0,.7,side*67,1,1];
      }else if(id==='brass'){
        d='M4.6 19 L9.6 19 Q10.3 19 10.3 19.7 Q10.3 20.4 9.6 20.4 L4.6 20.4 Z';
        detail=circle(9.45,19.7,.28)+' M5.2 19.7 L8.5 19.7';
        if(side>0){d=rotatePath(d,180,[12,19.7]);detail=rotatePath(detail,180,[12,19.7]);}
        origin=[side<0?4.6:19.4,19.7];hover=[0,-.35,side*55,1,1];click=[0,.7,side*102,1,1];
      }else if(id==='shard'){
        d=poly([[4.5,20.4],[8.8,20.4],[7.5,21.9],[4.5,21.9],[5.2,21.15]]);if(side>0)d=rotatePath(d,180,[12,21.15]);
        hover=[side*2,-1.9,0,1,1];click=[side*3,-2.1,0,1,1];
      }else if(id==='neon'){
        d='M5.8 20.05 L9.6 20.05 L9.6 20.55 L6.9 20.55 L6.9 21.35 L9.6 21.35 L9.6 21.85 L5.8 21.85 Z';if(side>0)d=rotatePath(d,180,[12,20.95]);
        hover=[side*4.7,-.35,0,1,1];click=[side*5.2,.7,0,1,1];
      }else{
        d=poly([[4.5,20.4],[8.7,20.4],[8.7,22],[4.5,22]]);detail='M5.4 20.4 L5.4 22 M6.4 21.2 L8 21.2';if(side>0){d=rotatePath(d,180,[12,21.2]);detail=rotatePath(detail,180,[12,21.2]);}
        hover=[side*3.4,-.35,0,1,1];click=[side*4.1,.7,0,1,1];
      }
      const moving=[P(d,{w:.68,occludedBy:[lipIndex]})];if(detail)moving.push(P(detail,{w:.4,occludedBy:[lipIndex]}));
      move(moving,[I,hover,click],origin,id==='facet'||id==='brass'?'receiver-hinge':'receiver-slide',`${id}:receiver:${side}`);
      for(const p of moving){p.poses={prepare:{base:0,t:prepare},release:{base:2,t:release}};p.beats=receiverBeats;}
      icons.download.push(...moving);
    }

    // A real clock mechanism: minute and hour hands rewind 12:1 from one hub.
    const frame=icons.history[0];
    move([frame],[I,I,I],[12,12],'frame',`${id}:clock`);
    const minute=id==='brass'?'M12 12 L11.3 12.3 L11.3 6.2 Q12 5.3 12.7 6.2 L12.7 11.6 Z':'M12 12 L12 6';
    const hour=id==='brass'?'M12 12 L12.7 11.6 L15.4 14 Q16.1 14.6 15.4 15.1 Q14.9 15.4 14.4 14.8 L11.3 12.3 Z':'M12 12 L15.5 15';
    icons.history=[frame,P(minute,{turn:-360,hoverTurn:.18,rate:1,o:[12,12],t:[I,I,I],role:'hand',seams:[{part:2,point:0,other:0}]}),P(hour,{turn:-30,hoverTurn:.18,rate:1,o:[12,12],t:[I,I,I],role:'hand'})];
    if(id==='brass'){
      icons.history.push(P(circle(12,12,.8),{role:'hub'}));
      icons.history[1].occludedBy=[3];icons.history[2].occludedBy=[3];
    }

    // Each volume keeps its complete outline and markings. These are book
    // selections and shelf fans, not pages peeling away from visible spines.
    const libraryPoses={
      facet:[[[0,0,-4,1,1],[0,0,-8,1,1]],[[0,-.7,0,1,1],[0,-1.5,0,1,1]],[[0,0,0,1,1],[0,0,8,1,1]]],
      neon:[[[0,-.9,0,1,1],[-.55,-1.4,-3,1,1]],[[0,-1.6,0,1,1],[0,-2.6,0,1,1]],[[.2,-.5,-8,1,1],[.6,-.9,-5,1,1]]],
      shard:[[[-.8,.4,-2,1,1],[-1.4,1,-4,1,1]],[[0,-.8,0,1,1],[0,-2.4,0,1,1]],[[.8,-.4,-3,1,1],[1.3,-1.2,3,1,1]]],
      holo:[[[-.3,-1.2,-2,1,1],[-1,-1.8,-5,1,1]],[[0,-.5,1,1,1],[0,-2.2,2,1,1]],[[.6,-1,-6,1,1],[1,-1.3,-3,1,1]]],
      brass:[[[0,0,-3,1,1],[0,0,-6,1,1]],[[0,-.8,2,1,1],[0,-1.5,5,1,1]],[[0,0,1,1,1],[0,0,7,1,1]]],
      blueprint:[[[-1,0,0,1,1],[-1.6,0,0,1,1]],[[0,-.4,0,1,1],[0,-1,0,1,1]],[[1,0,-8,1,1],[1.5,0,-8,1,1]]]
    };
    icons.library.forEach((book,i)=>{
      move([book],[book.t[0],...libraryPoses[id][i]],book.o,'book',`${id}:book:${i}`);
      book.rate=[.96,1.08,1.02][i];
    });

    // Authored bookmark mechanisms: each assembly uses one interpolation rate.
    for(const [name,parts]of [['bookmark',icons.bookmark],['demo',theme.demo]]){
      move(parts,[I,I,I],[12,12],'panel',`${id}:${name}`);
      if(id==='facet'){
        parts.forEach((p,i)=>{p.h=panelPerspective(p.d,i?-35:35);p.c=panelPerspective(p.d,i?-65:65);p.attach=`${id}:${name}:front:${i}`;});
        parts[0].seams=[{part:1,point:2,other:2},{part:1,point:4,other:4}];
        for(let i=0;i<2;i++){const p=parts[i];parts.push(P(p.d.split('Z')[0]+'Z',{h:p.h.split('Z')[0]+'Z',c:p.c.split('Z')[0]+'Z',maskOnly:true,role:'front-panel-mask',attach:p.attach,rate:1}));}
        for(let i=0;i<2;i++){
          const d=i?'M12 9 L17 11 L17 14 L12 17 Z':'M12 9 L7 11 L7 14 L12 17 Z';
          parts.push(P(d,{h:panelPerspective(d,i?12:-12),c:panelPerspective(d,i?30:-30),w:.68,rate:1,role:'inner-leaf',attach:`${id}:${name}:rear:${i}`,occludedBy:[2+i],seams:[{part:i,point:0,other:2},{part:i,point:6,other:4}]}));
        }
      }
      if(id==='neon'){
        const axis=[19,4,19,22],d='M19 4 L16 5 L16 19.5 L19 22 Z';
        Object.assign(parts[1],{d,h:foldAtAxis(d,axis,120),c:foldAtAxis(d,axis,160),occludedBy:[0],role:'circuit-cover',attach:`${id}:${name}:cover`});
        for(const p of parts.slice(2)){delete p.h;delete p.c;}
        const etch='M19 8 L17.2 8 L17.2 15 L19 15';
        parts.push(P(etch,{h:foldAtAxis(etch,axis,120),c:foldAtAxis(etch,axis,160),w:.45,rate:1,occludedBy:[0],role:'cover-circuit',attach:`${id}:${name}:cover`}));
      }
      if(id==='brass'){
        for(const p of parts){delete p.h;delete p.c;}
        move(parts.slice(2),[I,[0,-.6,0,1,1],[0,-1.2,0,1,1]],[12.05,14],'latch',`${id}:${name}:latch`);
        parts[2].t=[I,[0,-.6,-25,1,1],[0,-1.2,-70,1,1]];
        parts[2].attach=`${id}:${name}:release-plate`;
        const cam={ellipse:[12,12,10.1,3,0]},bar='M-5.95 -1.05 L5.95 -1.05 Q7 -1.05 7 0 Q7 1.05 5.95 1.05 L-5.95 1.05 Q-7 1.05 -7 0 Q-7 -1.05 -5.95 -1.05 Z';
        const rivets=circle(-5.4,0,.35)+' '+circle(5.4,0,.35);
        const frontBar=parts.length+2;
        for(const layer of ['back','front']){
          const flow={track:cam,mode:'head',start:.75,anchor:[0,0],heading:0,phase:[0,.18,.5],layer};
          const mask=layer==='back'?{occludedBy:[0]}:{};
          parts.push(programmedFlow(bar,flow,{w:.82,role:'cam-latch',attach:`${id}:${name}:cam`,...mask}));
          parts.push(programmedFlow(rivets,flow,{w:.4,role:'cam-rivets',attach:`${id}:${name}:cam`,...mask}));
        }
        parts[0].occludedBy=[frontBar];parts[1].occludedBy=[frontBar];
        parts[2].occludedBy=[3,frontBar];parts[3].occludedBy=[frontBar];
      }
      if(id==='blueprint'){
        parts[0].h=parts[0].h.replace('L9.48 18.47','L11.16 16.91');
        parts[0].c=parts[0].c.replace('L6 20.5','L10 16.785714');
      }
      if(id==='shard'){
        const axes=[[19,2,5,17],[5,20,19,5]],angles=[[40,72],[35,68]];
        parts.forEach((p,i)=>{p.h=foldAtAxis(p.d,axes[i],angles[i][0]);p.c=foldAtAxis(p.d,axes[i],angles[i][1]);});
        parts.push(P('M19 2 L5 17',{w:.7}),P('M5 20 L19 5',{w:.7}));
        move(parts,[I,I,I],[12,12],'panel',`${id}:${name}`);
        parts[0].seams=[{part:2,point:4,other:0},{part:2,point:6,other:2}];
        parts[1].seams=[{part:3,point:0,other:0},{part:3,point:2,other:2}];
        for(const [i,d]of ['M19 2 L5 17 L6 6 Z','M5 20 L19 5 L17 20 Z'].entries())parts.push(P(d,{h:foldAtAxis(d,axes[i],12),c:foldAtAxis(d,axes[i],36),w:.65,rate:1,role:'inner-leaf',attach:`${id}:${name}:rear:${i}`,occludedBy:[i],seams:[{part:i+2,point:0,other:0},{part:i+2,point:2,other:2}]}));
      }
      if(id==='holo'){
        parts.splice(1);
        for(let j=0;j<2;j++)for(const layer of ['back','front']){
          const orbit={ellipse:[12,12,j?12.4:13.3,j?5.3:4.1,j?22:-17]},hidden=layer==='back'?{occludedBy:[0]}:{};
          parts.push(programmedFlow('M0 0',{track:orbit,mode:'trail',span:[1,1,1],layer},{w:j?.48:.75,role:'orbit',...hidden}));
          parts.push(programmedFlow(j?'M0 -.85 L.85 0 L0 .85 L-.85 0 Z':circle(0,0,.95),{track:orbit,mode:'head',start:j?.66:.14,anchor:[0,0],phase:[0,j?-.12:.18,j?-.44:.55],layer},{w:.75,role:'satellite',attach:`${id}:${name}:satellite:${j}`,...hidden,poses:{prepare:{base:0,phase:j?.025:-.025},release:{base:1}},beats:{hover:[[0,'prepare'],[180,'hover']],click:[[0,'prepare'],[230,'click'],[740,'release']],leave:[[0,'release'],[220,'rest']]}}));
        }
      }
      if(id==='blueprint'){
        parts.slice(2).forEach(p=>{delete p.h;delete p.c;});
        parts.push(P(parts[0].d,{w:.6,role:'backing-plate',rate:1,attach:`${id}:${name}:backing`,o:[12,12],t:[I,[2,0,0,1,1],[3.6,0,0,1,1]],occludedBy:[0,1]}));
      }
      // A finite release → deploy → recover sequence; every shared edge
      // uses the same event times, spring rate, and material endpoints.
      if(id!=='holo')for(const [i,p]of parts.entries()){
        const prepare={base:0};
        if(id==='blueprint'&&i>=2)prepare.draw=.35;
        if(id==='brass'&&(i===2||i===3))prepare.t=[0,.3,i===2?10:0,1,1];
        p.poses={prepare,release:{base:1}};
        p.beats={hover:[[0,'prepare'],[130,'hover']],click:[[0,'prepare'],[170,'click'],[600,'release']],leave:[[0,'release'],[200,'rest']]};
        if(p.role==='inner-leaf')p.beats={hover:[[0,'prepare'],[260,'hover']],click:[[0,'prepare'],[310,'click'],[760,'release']],leave:[[0,'release'],[200,'rest']]};
        if(id==='neon'&&p.attach===`${id}:${name}:cover`){p.poses.prepare.d=foldAtAxis(p.d,[19,4,19,22],85);p.beats={hover:[[0,'prepare'],[180,'hover']],click:[[0,'prepare'],[220,'click'],[680,'release']],leave:[[0,'release'],[220,'rest']]};}
        if(id==='brass'&&p.flow){p.poses={prepare:{base:0,phase:0},release:{base:1},catch:{base:2}};p.beats={hover:[[0,'prepare'],[230,'hover']],click:[[0,'prepare'],[230,'click'],[660,'catch']],leave:[[0,'release'],[230,'rest']]};}
        if(id==='brass'&&(i===2||i===3)){p.poses.catch={base:0};p.beats={hover:[[0,'prepare'],[130,'hover']],click:[[0,'prepare'],[130,'click'],[660,'catch']],leave:[[0,'release'],[420,'rest']]};}
        if(id==='blueprint'&&p.role==='backing-plate')p.beats={hover:[[0,'prepare'],[260,'hover']],click:[[0,'prepare'],[320,'click'],[760,'release']],leave:[[0,'release'],[220,'rest']]};
      }
      if(id==='blueprint')parts.slice(2,4).forEach(p=>p.draw=[1,.7,1]);
      if(id==='blueprint')parts[1].seams=[{part:0,point:0,other:0},{part:0,point:6,other:2},{part:0,point:8,other:2},{part:0,point:10,other:4}];
    }
    if(id==='holo'||id==='brass')theme.iconViewBoxes={bookmark:'-5 -3 34 30'};
    theme.note={
      facet:'Radial iris shutters pivot from fixed pins. Back opens two joined planes; receiver plates hinge clear before entry; layered bookmark leaves unfold from one spine. Books retain their shelf fan; clock hands rewind 12:1.',
      neon:'Paired circuit packets scan and reconnect a broken circular bus. The Back jaws release; fork connectors withdraw before entry; a full circuit cover turns about the bookmark edge. Complete volumes lift; clock hands rewind 12:1.',
      shard:'Angular ring shoes disengage, index, and re-seat in fixed sockets. Three Back plates slide in sequence; receiver shutters clear diagonally; nested bookmark blades fold along their original diagonal hinges. Books retain their shapes.',
      holo:'Two transverse orbital cores meet inside nested hoops. Back nodes orbit the hinged chevron; receiver clamps travel around the docking rim; two satellites pass behind and in front of the bookmark. Complete books lift independently.',
      brass:'A winding band feeds through a fixed ratchet throat as the escapement releases and catches. Riveted Back jaws hinge from their common pin; receiver arms unlock before landing; a rigid bookmark latch travels around the card and catches across its face.',
      blueprint:'A compass arm and nib carriage construct the circle together. Guide carriages measure the extending Back arrow; receiver calipers withdraw before entry; a backing plate slides behind the connected bookmark prism. Complete volumes separate on measured axes.'
    }[id];
  }
  motionThemes.push(...technical);
})();
