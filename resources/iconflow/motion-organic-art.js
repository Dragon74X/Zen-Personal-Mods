/* Approved monochrome contours with authored folds, hinges, and directional motion. */
(() => {
  const T=(x=0,y=0,r=0,sx=1,sy=1)=>[x,y,r,sx,sy];
  const still=[T(),T(),T()];
  const rigid=(d,role,t=still,o=[12,12],attach)=>({d,h:d,c:d,role,t,o,rate:1,...(attach?{attach}:{} )});
  const contours={
  "ribbon":{
    "back":[
      "M11.1 4 C8.8 6.6 5.8 9.3 2.2 12 C5.8 14.8 8.8 17.6 11.1 20 C11.5 17.5 10.4 15.9 8.4 14.2 C14 13.4 18.5 15.1 21.3 18.9 C20.5 11.2 15.5 8.1 8.4 9.8 C10.4 7.8 11.4 6.1 11.1 4 Z"
    ],
    "download":[
      "M12 2 C10.4 2 10 3.6 10 5 L10 9 L7.3 8.2 C6.2 7.8 5.8 9 6.7 9.8 L12 15 L17.3 9.8 C18.2 9 17.8 7.8 16.7 8.2 L14 9 L14 5 C14 3.6 13.6 2 12 2 Z",
      "M2.5 14.6 C2.5 13.2 4.5 13.2 4.5 14.6 L4.5 17 C4.5 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 19.5 18 19.5 17 L19.5 14.6 C19.5 13.2 21.5 13.2 21.5 14.6 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 17.5 17.5 22 12 22 C6.5 22 2 17.5 2 12 C2 6.5 6.5 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6"
    ],
    "library":[
      "M2 22 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  },
  "silk":{
    "back":[
      "M9.7 4.4 C10.9 3.2 12.2 4.1 11.8 5.5 C11.5 7.1 10.5 8.4 9.3 9.8 C15.6 8.3 20.5 11.7 21 18.2 C17.9 14.9 13.7 13.6 9.2 14.6 C10.7 16.4 12.4 18.4 11.5 19.7 C10.9 20.5 10.2 20.5 9.4 19.7 L2.8 13.3 C2 12.5 2 11.6 2.8 10.8 Z"
    ],
    "download":[
      "M12 2 C10.4 2 10 3.6 10 5 L10 9 L7.3 8.2 C6.2 7.8 5.8 9 6.7 9.8 L12 15 L17.3 9.8 C18.2 9 17.8 7.8 16.7 8.2 L14 9 L14 5 C14 3.6 13.6 2 12 2 Z",
      "M2.5 14.6 C2.5 13.2 4.5 13.2 4.5 14.6 L4.5 17 C4.5 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 19.5 18 19.5 17 L19.5 14.6 C19.5 13.2 21.5 13.2 21.5 14.6 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 17.5 17.5 22 12 22 C6.5 22 2 17.5 2 12 C2 6.5 6.5 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6"
    ],
    "library":[
      "M2 22 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  },
  "ivy":{
    "back":[
      "M11.1 4 C8.8 6.6 5.8 9.3 2.2 12 C5.8 14.8 8.8 17.6 11.1 20 C11.5 17.5 10.4 15.9 8.4 14.2 C14 13.4 18.5 15.1 21.3 18.9 C20.5 11.2 15.5 8.1 8.4 9.8 C10.4 7.8 11.4 6.1 11.1 4 Z",
      "M15 13 C12.46 15.66 15.450000000000001 20.29 20 20 C21.1 15.620000000000001 18.55 12.79 15 13 Z M15 13 L18.7 18.18"
    ],
    "download":[
      "M12 2 C9.5 4.4 10 7.2 10 9 L7.3 8.4 C6.6 8.2 6.3 8.8 6.8 9.4 L12 15 L17.2 9.4 C17.7 8.8 17.4 8.2 16.7 8.4 L14 9 C14 7.2 14.5 4.4 12 2 Z",
      "M1 15 C5 16 6 22 12 22 C18 22 19 16 23 15 M1 15 C0.73333 19 3.04444 21.66667 6.39259 22.11111 C8.06667 22.33333 10 22 12 21 C14 22 15.93333 22.33333 17.60741 22.11111 C20.95556 21.66667 23.26667 19 23 15",
      "M6.39259 22.11111 C8.51259 19.53111 5.49259 15.54111 1.39259 16.11111 C0.69259 20.15111 3.19259 22.54111 6.39259 22.11111 Z M6.39259 22.11111 L2.69259 17.67111",
      "M17.60741 22.11111 C20.52741 23.73111 23.90741 20.04111 22.60741 16.11111 C18.50741 16.15111 16.60741 19.04111 17.60741 22.11111 Z M17.60741 22.11111 L21.30741 17.67111"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 16.95 18.355 21.09 13.6165 21.8685 C13.09 21.955 12.55 22 12 22 C6.5 22 2 17.5 2 12 C2 10.16667 2.5 8.44444 3.37037 6.96296 C5.11111 4 8.33333 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6",
      "M3.37037 6.96296 C1.33837 5.43496 -1.59763 7.86296 -1.02963 10.96296 C2.06637 11.36296 3.80237 9.38296 3.37037 6.96296 Z M3.37037 6.96296 L0.11437 9.92296",
      "M13.6165 21.8685 C13.2365 23.9865 16.1905 25.2795 18.3165 23.6685 C17.4385 21.1765 15.2805 20.6195 13.6165 21.8685 Z M13.6165 21.8685 L17.0945 23.2005"
    ],
    "library":[
      "M2 22 L2 10 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 10 C-3 16 11 14 9 22",
      "M20 22 C23.220000000000002 22.91 25.669999999999998 18.535 23.5 15 C19.509999999999998 15.979999999999999 18.32 19.235 20 22 Z M20 22 L22.59 16.82",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  },
  "ink":{
    "back":[
      "M12 2.8 C11.8 6 9.8 8.5 8.3 9.8 C15.2 7.6 19.8 10.9 22 17.2 C17.2 13.2 12.8 12.9 8.3 14.1 C10.4 15.9 11.5 18.1 12 21.2 L1.5 12 Z"
    ],
    "download":[
      "M12 2 C9.5 4.4 10 7.2 10 9 L7.3 8.4 C6.6 8.2 6.3 8.8 6.8 9.4 L12 15 L17.2 9.4 C17.7 8.8 17.4 8.2 16.7 8.4 L14 9 C14 7.2 14.5 4.4 12 2 Z",
      "M2.5 14.6 C2.5 13.2 4.5 13.2 4.5 14.6 L4.5 17 C4.5 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 19.5 18 19.5 17 L19.5 14.6 C19.5 13.2 21.5 13.2 21.5 14.6 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 17.5 17.5 22 12 22 C6.5 22 2 17.5 2 12 C2 6.5 6.5 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6"
    ],
    "library":[
      "M2 22 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  },
  "frost":{
    "back":[
      "M1 12 L11.5 2.2 L11.5 9 L19.6 9 L24.2 15 L11.5 15 L11.5 21.5 Z M1 12 L8 12 L11.5 9 M8 12 L11.5 15"
    ],
    "download":[
      "M12 2 C9.5 4.4 10 7.2 10 9 L7.3 8.4 C6.6 8.2 6.3 8.8 6.8 9.4 L12 15 L17.2 9.4 C17.7 8.8 17.4 8.2 16.7 8.4 L14 9 C14 7.2 14.5 4.4 12 2 Z",
      "M2.5 14.6 C2.5 13.2 4.5 13.2 4.5 14.6 L4.5 17 C4.5 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 19.5 18 19.5 17 L19.5 14.6 C19.5 13.2 21.5 13.2 21.5 14.6 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 17.5 17.5 22 12 22 C6.5 22 2 17.5 2 12 C2 6.5 6.5 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6"
    ],
    "library":[
      "M2 22 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  },
  "ember":{
    "back":[
      "M12 2.8 C11.8 6 9.8 8.5 8.3 9.8 C15.2 7.6 19.8 10.9 22 17.2 C17.2 13.2 12.8 12.9 8.3 14.1 C10.4 15.9 11.5 18.1 12 21.2 L1.5 12 Z"
    ],
    "download":[
      "M12 2 C9.5 4.4 10 7.2 10 9 L7.3 8.4 C6.6 8.2 6.3 8.8 6.8 9.4 L12 15 L17.2 9.4 C17.7 8.8 17.4 8.2 16.7 8.4 L14 9 C14 7.2 14.5 4.4 12 2 Z",
      "M2.5 14.6 C2.5 13.2 4.5 13.2 4.5 14.6 L4.5 17 C4.5 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 19.5 18 19.5 17 L19.5 14.6 C19.5 13.2 21.5 13.2 21.5 14.6 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z"
    ],
    "history":[
      "M12 2 C17.5 2 22 6.5 22 12 C22 17.5 17.5 22 12 22 C6.5 22 2 17.5 2 12 C2 6.5 6.5 2 12 2 Z",
      "M12 4.2 C7.6 4.2 4.2 7.7 4.2 12 C4.2 16.4 7.7 19.8 12 19.8 C15.4 19.8 18 17.7 19.2 14.8",
      "M12 5.5 L12 12 L16.7 13.6"
    ],
    "library":[
      "M2 22 L2 6 L2 4 C2 3 2.7 2.5 3.5 2.5 L6 2.5 C7 2.5 7.5 3 7.5 4 L7.5 22 Z M2 6 L7.5 6",
      "M9 22 L9 5 L9 3 C9 2 9.5 1.6 10.5 1.6 L13 1.6 C14 1.6 14.5 2 14.5 3 L14.5 22 Z M9 5 L14.5 5",
      "M16 4 L20.3 2.8 L24.4 20.7 L20 22 Z M16.3 5.6 L20.7 4.4",
      "M2 6 C3.8333 6 5.6667 6 7.5 6",
      "M9 5 C10.8333 5 12.6667 5 14.5 5",
      "M16.3 5.6 C17.7667 5.2 19.2333 4.8 20.7 4.4"
    ]
  }
};
  const authoredBookmarks={
  "ribbon":[
    {
      "d":"M5 22 L5 6 C5 3.7 7 2 9 2 L16 2 C18 2 19 3.4 19 5",
      "h":"M5 22 L5 6 C5 3.7 7 2 9 2 L16 2 C18 2 19 3.4 19 5",
      "c":"M5 22 L5 6 C5 3.7 7 2 9 2 L16 2 C18 2 19 3.4 19 5"
    },
    {
      "d":"M5 15 C7 10 14 6 19 4 C19 10.8 15 13.2 12 16 L5 22",
      "h":"M5 15 C8 10 14 8 19 4.5 C19 11 15 13.2 12 16 L5 22",
      "c":"M5 15 C7 10 16 7 17.5 2.5 C17.5 8 15 13.5 12 16 L5 22"
    },
    {
      "d":"M12 16 C14.3 18 16.6 20 19 22 C19 20 19 18 19 16",
      "h":"M12 16 C14.3 18 16.6 20 19 22 C19 20 19 18 19 16",
      "c":"M12 16 C18 23 24 25 32 14 C30 11.2 26 18 23 18"
    },
    {
      "d":"M19 5 C19 9 19 12.5 19 16 C19 18 19 20 19 22",
      "h":"M19 5 C19 9 19 12.5 19 16 C19 18 19 20 19 22",
      "c":"M19 5 C19 8 18 18 23 18 C26 18 26 5 32 14"
    },
    {
      "d":"M16 7 C17 8 18.5 9 19 11",
      "h":"M16 7 C17 8.4 18.5 9.4 19 11",
      "c":"M16 7 C20 9 18.5 18 23 18"
    }
  ],
  "silk":[
    {
      "d":"M5 20 C5 16 5 10 5 6 C5 3.6 7 2 9 2 L15 2 C17 2 19 3.6 19 6 C19 10 19 16 19 20 C19 23 17.6 22.5 16 21 C14.5 19.5 13 18.3 12 17.3 L8 21 C6.4 22.5 5 23 5 20 Z",
      "h":"M4 20 C4 16 4 11 4 7 C4 3.4 6 2 9 2 L15 2 C18 2 20 3.4 20 7 C20 11 20 16 20 20 C20 23 18.1 22.5 16 21 C14.5 20 13 18.8 12 18 L8 21 C5.9 22.5 4 23 4 20 Z",
      "c":"M4.5 18 C6 14 4.5 10 4.5 6 C4.5 3.6 6.5 2 9 2 L15 2 C17.5 2 19.5 3.6 19.5 6 C19.5 10 18 14 19.5 18 C21.5 23 19.1 23 16.6 21.2 C13 18.4 12 18.6 9.3 20.1 L7.4 21.2 C4.9 23 2.5 23 4.5 18 Z"
    }
  ],
  "ivy":[
    {
      "d":"M5 22 L5 6 C5 3.7 7 2 9 2 L15 2 C18 2 19 3.5 19 6 C19 12 19 18 19 22 L12 16 L5 22 Z",
      "h":"M5 22 L5 6 C5 3.7 7 2 9 2 L15 2 C18 2 19 3.5 19 6 C19 12 19 18 19 22 L12 16 L5 22 Z",
      "c":"M5 22 L5 6 C5 3.7 7 2 9 2 L15 2 C18 2 19 3.5 19 6 C19 12 19 18 19 22 L12 16 L5 22 Z"
    },
    {
      "d":"M5 21 L11.5 15 C10 10 15 10 16 7 C17 13 15 16 11.5 15",
      "h":"M5 21 L11.5 15 C8.84218 10.60627 12.5513 9.4011 12.36607 6.3069 C14.962 11.7722 14.4054 15.10744 11.5 15",
      "c":"M5 21 L11.5 15 C8.13804 11.20489 10.51258 9.72112 9.39773 6.88022 C13.05215 11.67175 13.69209 14.80941 11.5 15"
    },
    {
      "d":"M5 16 C8 12 2 10 5 6 C5.6 5.6 6.24 5.24 6.904 4.916 C8.232 4.268 9.656 3.764 11.048 3.372 C12.44 2.98 13.8 2.7 15 2.5",
      "h":"M5 16 C8 12 2 10 5 6 C5.6 5.2 6.28 4.54 7.016 3.992 C8.488 2.896 10.184 2.248 11.912 1.824 C13.64 1.4 15.4 1.2 17 1",
      "c":"M5 16 C8 12 2 10 5 6 C5.6 5 6.32 4.16 7.12 3.4544 C8.72 2.0432 10.64 1.1696 12.56 0.6288 C14.48 0.088 16.4 -0.12 18 -0.2"
    },
    {
      "d":"M6.904 4.916 C6.90454 4.81297 6.5551 4.61585 6.358 4.608 C6.46666 4.77263 6.8161 4.96975 6.904 4.916 Z",
      "h":"M7.016 3.992 C7.14113 3.20149 5.19425 2.10325 3.974 2.276 C4.45727 3.40971 6.40415 4.50795 7.016 3.992 Z",
      "c":"M7.12 3.4544 C7.29932 2.40742 4.80332 0.99942 3.22 1.2544 C3.82068 2.74138 6.31668 4.14938 7.12 3.4544 Z"
    },
    {
      "d":"M11.048 3.372 C11.14283 3.34118 11.18763 3.0007 11.118 2.84 C11.00917 2.97722 10.96437 3.3177 11.048 3.372 Z",
      "h":"M11.912 1.824 C12.68679 1.68472 12.93639 -0.21224 12.302 -1.14 C11.44921 -0.40792 11.19961 1.48904 11.912 1.824 Z",
      "c":"M12.56 0.6288 C13.59145 0.45525 13.91145 -1.97675 13.06 -3.1712 C11.92855 -2.23765 11.60855 0.19435 12.56 0.6288 Z"
    },
    {
      "d":"M15 2.5 C15.03213 2.59995 15.45325 2.69851 15.658 2.654 C15.49427 2.52325 15.07315 2.42469 15 2.5 Z",
      "h":"M17 1 C17.12237 1.79891 19.46861 2.34803 20.666 1.858 C19.81043 0.88749 17.46419 0.33837 17 1 Z",
      "c":"M18 -0.2 C18.14812 0.86169 21.15612 1.56569 22.7 0.9 C21.61188 -0.38169 18.60388 -1.08569 18 -0.2 Z"
    }
  ],
  "ink":[
    {
      "d":"M5 22 L5 3.3 Q5 2 6.5 2 L19 2 C19 6 19 12 19 22 C16.8 20 14.3 18 12 16 L5 22 Z",
      "h":"M5 22 L5 3.3 Q5 2 6.5 2 L19 2 C19 6 19 12 19 22 C16.8 20 14.3 18 12 16 L5 22 Z",
      "c":"M5 22 L5 3.3 Q5 2 6.5 2 L19 2 C17 12 18 21 32 13 C26 25 17 23 12 16 L5 22 Z"
    },
    {
      "d":"M12 16 C16 20 17 21 19 22 C19 16 19 8 19 2",
      "h":"M12 16 C16 20 17 21 19 22 C19 16 19 8 19 2",
      "c":"M12 16 C18 24 26 23 32 13 C23 22 17 17 19 2"
    },
    {
      "d":"M5 22 C8 19 10 17 12 16 C12.5 15.5 13 15 13.5 14.5",
      "h":"M5 22 C8 19 10 17 12 16 C12.5 14.5 14 13 13.5 11",
      "c":"M5 22 C8 19 10 17 12 16 C18 24 26 21.5 32 13"
    }
  ],
  "frost":[
    {
      "d":"M5 23 L5 4 L6.2 2.8 L17.8 2.8 L19 4 L19 23 L12 17 Z",
      "h":"M5 23 L5 4 L6.2 2.8 L17.8 2.8 L19 4 L19 23 L12 17 Z",
      "c":"M5 23 L5 4 L6.2 2.8 L17.8 2.8 L19 4 L19 23 L12 17 Z"
    },
    {
      "d":"M6 3 L12 10 L19 23",
      "h":"M6 3 L12.1 10.1 L19 23",
      "c":"M6 3 L12.2 10.3 L19 23"
    },
    {
      "d":"M18 3 L12 10 L5 23",
      "h":"M18 3 L12.1 10.1 L5 23",
      "c":"M18 3 L12.2 10.3 L5 23"
    },
    {
      "d":"M19 6 L19 10 L19 14 Z",
      "h":"M19 6 L18.8 10 L19 14 Z",
      "c":"M19 6 L15.7 10 L19 14 Z"
    }
  ],
  "ember":[
    {
      "d":"M5 22 L5 5 C5 3 6.6 2 8.5 2 L16 2 C18 2 19.5 3.5 19.5 6 C19.5 12 19.5 18 19.5 23 C16.7 21 14.3 18 12 16 L5 22 Z",
      "h":"M5 22 L5 5 C5 3 6.6 2 8.5 2 L16 2 C18 2 19.5 3.5 19.5 6 C19.5 12 19.5 18 19.5 23 C16.7 21 14.3 18 12 16 L5 22 Z",
      "c":"M5 22 L5 5 C5 3 6.6 2 8.5 2 L16 2 C18 2 19.5 3.5 19.5 6 C19 16 24 24 32 20 C25 26 17 24 12 16 L5 22 Z"
    },
    {
      "d":"M5 22 C10 17 15.5 12 17 8 C18 5.5 17 3 15.5 2",
      "h":"M5 22 C10 17 16.5 12 17.5 8 C18.8 5.5 17 3 15.5 2",
      "c":"M5 22 C10 17 15.5 12 17 8 C18.7 5.5 17 3 15.5 2"
    },
    {
      "d":"M16.8 8.5 C14.5 14 14 18.5 19.5 23 C19.5 18 19.5 12 19.5 6",
      "h":"M16.8 8.5 C15 13 11.8 16 19.5 23 C19.5 18 19.5 12 19.5 6",
      "c":"M16.8 8.5 C11 19 19.5 27 32 20 C22 24 17 17 19.5 6"
    }
  ]
};
  const morph=(d,h,c,role,extra={})=>({...rigid(d,role),h,c,...extra});
  const rootSeam=(parts,parent,child,root)=>{
    const values=(parts[parent].d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number);
    const point=values.findIndex((n,i)=>i%2===0&&n===root[0]&&values[i+1]===root[1]);
    if(point<0)throw Error('Leaf root is missing from its parent contour');
    (parts[child].seams??=[]).push({part:parent,point:0,other:point});
  };
  function bookmarks(id){
    const p=authoredBookmarks[id].map(a=>({...a,role:'bookmark',rate:1,t:still,o:[12,12]}));
    if(id==='ribbon'){
      p[2].h='M12 16 C16 21 22 25 27 21 C25 18.5 22.5 18 21 17';
      p[3].h='M19 5 C19 9 18.5 15 21 17 C24 18 25 16 27 21';
      p[4]=morph('M19 16 C19 18 19 20 19 22 C19 20 19 18 19 16 Z','M21 17 C24 18 25 16 27 21 C25 18.5 22.5 18 21 17 Z','M23 18 C26 18 26 5 32 14 C30 11.2 26 18 23 18 Z','return-face');
      p[2].occludedBy=[4];p[3].occludedBy=[4];
    }
    if(id==='silk'){
      p.push(morph('M5 6 C5 10 5 16 5 20 C5 16 5 10 5 6 Z','M4 7 C4 11 4 16 4 20 C9 17 8.5 10 4 7 Z','M4.5 6 C4.5 10 6 14 4.5 18 C11 16 9.5 10 4.5 6 Z','left-return-face'));
      p.push(morph('M19 6 C19 10 19 16 19 20 C19 16 19 10 19 6 Z','M20 7 C20 11 20 16 20 20 C15 17 15.5 10 20 7 Z','M19.5 6 C19.5 10 18 14 19.5 18 C13 16 14.5 10 19.5 6 Z','right-return-face'));
      p[0].occludedBy=[1,2];
    }
    if(id==='ink'){
      p[0].h='M5 22 L5 3.3 Q5 2 6.5 2 L19 2 C19 7 19 21 27 17 C21 23 14.3 18 12 16 L5 22 Z';
      p[1].h='M12 16 C16 21 23 23 27 17 C22 18 19 8 19 2';
      p[2]=morph('M12 16 C14.3 18 16.8 20 19 22 C17 21 16 20 12 16 Z','M12 16 C14.3 18 21 23 27 17 C23 23 16 21 12 16 Z','M12 16 C17 23 26 25 32 13 C26 23 18 24 12 16 Z','return-face');
      p[0].occludedBy=[2];p[1].occludedBy=[2];
    }
    if(id==='frost'){
      p[1].h='M6 3 L11.6 11 L19 23';p[1].c='M6 3 L10.8 12.2 L19 23';
      p[2].h='M18 3 L11.6 11 L5 23';p[2].c='M18 3 L10.8 12.2 L5 23';
      p[3].h='M19 6 L14.5 10 L19 14 Z';p[3].c='M19 6 L11 10 L19 14 Z';
      p.push(morph('M19 6 L19 10 L19 14 Z','M19 6 L23 10 L19 14 Z','M19 6 L25 10 L19 14 Z','facet-return-face'));
      p[0].occludedBy=[3,4];p[1].occludedBy=[3,4];p[2].occludedBy=[3,4];
    }
    if(id==='ember'){
      p[0].h='M5 22 L5 5 C5 3 6.6 2 8.5 2 L16 2 C18 2 19.5 3.5 19.5 6 C19.5 12 20 22 27 21 C21 25 14.3 18 12 16 L5 22 Z';
      p[2].h='M16.8 8.5 C13.5 15 18 26 27 21 C22 21 19.5 12 19.5 6';
      for(const state of ['d','h','c'])p[2][state]+=' Z';
      p[0].occludedBy=[2];p[1].occludedBy=[2];
    }
    if(id==='ivy'){
      p[1].h='M5 21 L11.5 15 C7.70096 11.41987 12.03109 8.91987 11.39711 5.8218 C15.76314 10.518 15.03109 14.11603 11.5 15';
      for(const state of ['d','h','c'])p[0][state]=p[0][state].replace('M5 22 L5 6','M5 22 L5 21 L5 16 L5 6');
      p[0].occludedBy=[3,4,5];p[2].occludedBy=[3,4,5];
    }
    return p;
  }
  function back(id,art){
    const t=[T(),T(-.8),T(-1.8)],p=art.map((d,i)=>rigid(d,i?'leaf':'arrow',t));
    const tail={
      plain:['C14 13.4 18.5 15.1 21.3 18.9 C20.5 11.2 15.5 8.1 8.4 9.8','C14 12 20 11 23 13.5 C20 7 15.5 7 8.4 9.8','C15 11.3 21 9.8 24 9.6 C20 5.8 14.4 7 8.4 9.8'],
      silk:['C15.6 8.3 20.5 11.7 21 18.2 C17.9 14.9 13.7 13.6 9.2 14.6','C16 6.8 21 8.5 22 14.2 C18.5 11.4 13.7 13.6 9.2 14.6','C16.8 5.8 22 6.8 23.5 9.4 C19.4 9.5 14 13.2 9.2 14.6'],
      sharp:['C15.2 7.6 19.8 10.9 22 17.2 C17.2 13.2 12.8 12.9 8.3 14.1','C15.8 6.3 21.5 8.2 23 13.2 C17.8 10.7 12.8 12.9 8.3 14.1','C16.2 5 22 5.8 24 9.5 C18.4 9.5 13 12.6 8.3 14.1']
    };
    if(id==='frost'){
      p[0].h=p[0].d.replace('L19.6 9 L24.2 15','L19.6 7.3 L24.2 11.8');
      p[0].c=p[0].d.replace('L19.6 9 L24.2 15','L17.6 5.5 L23 7.2');
      p.push(morph('M11.5 15 L24.2 15 L24.2 15 L11.5 15 Z','M11.5 15 L24.2 11.8 L21.4 14.8 L11.5 15 Z','M11.5 15 L23 7.2 L20 12 L11.5 15 Z','return-face',{t}));
    }else{
      const v=tail[id==='silk'?'silk':id==='ink'||id==='ember'?'sharp':'plain'];p[0].h=p[0].d.replace(v[0],v[1]);p[0].c=p[0].d.replace(v[0],v[2]);
      const faces={
        plain:['M8.4 14.2 C14 13.4 18.5 15.1 21.3 18.9 C18.5 15.1 14 13.4 8.4 14.2 Z','M8.4 14.2 C14 12 20 11 23 13.5 C19.7 10.3 15 10.7 8.4 14.2 Z','M8.4 14.2 C15 11.3 21 9.8 24 9.6 C21 7.7 15 9.2 8.4 14.2 Z'],
        silk:['M9.2 14.6 C13.7 13.6 17.9 14.9 21 18.2 C17.9 14.9 13.7 13.6 9.2 14.6 Z','M9.2 14.6 C13.7 13.6 18.5 11.4 22 14.2 C19 9.5 14 11.3 9.2 14.6 Z','M9.2 14.6 C14 13.2 19.4 9.5 23.5 9.4 C20 7.7 14.5 10.9 9.2 14.6 Z'],
        sharp:['M8.3 14.1 C12.8 12.9 17.2 13.2 22 17.2 C17.2 13.2 12.8 12.9 8.3 14.1 Z','M8.3 14.1 C12.8 12.9 17.8 10.7 23 13.2 C19 9.3 13.8 10.5 8.3 14.1 Z','M8.3 14.1 C13 12.6 18.4 9.5 24 9.5 C19.5 7.6 14 10.1 8.3 14.1 Z']
      };
      if(id!=='ivy'){const face=faces[id==='silk'?'silk':id==='ink'||id==='ember'?'sharp':'plain'];p.push(morph(...face,'return-face',{t}));}
    }
    if(p.at(-1).role==='return-face')p[0].occludedBy=[p.length-1];
    if(id==='ivy'){
      p[1].o=[15,13];p[1].t=[T(),T(-.8,0,-28,.9),T(-1.8,0,-52,.8)];
      p.push(rigid('M8.4 14.2 Q11.8 12.9 15 13','leaf-stem',t));
      rootSeam(p,2,1,[15,13]);rootSeam(p,0,2,[8.4,14.2]);
    }
    return p;
  }
  function reload(id){
    const circle=(x,y,r)=>`M${x+r} ${y} C${x+r} ${y+r*.55228475} ${x+r*.55228475} ${y+r} ${x} ${y+r} C${x-r*.55228475} ${y+r} ${x-r} ${y+r*.55228475} ${x-r} ${y} C${x-r} ${y-r*.55228475} ${x-r*.55228475} ${y-r} ${x} ${y-r} C${x+r*.55228475} ${y-r} ${x+r} ${y-r*.55228475} ${x+r} ${y} Z`;
    const beats={hover:[[0,'prepare'],[190,'hover']],click:[[0,'prepare'],[220,'click'],[820,'release']],leave:[[0,'release'],[220,'rest']]};
    const staged=(p,prepare={base:0},release={base:1},schedule=beats)=>({...p,beats:schedule,poses:{prepare,release}});
    const p=[];
    function winding(name,r,start,direction,width,span,head,prepareSpan){
      const shared={track:{ellipse:[12,12,r,r,0]},start,direction,wrap:true,phase:[0,0,0],span,anchor:[0,0],heading:0};
      const follow=(part,mode)=>staged({...part,o:[0,0],attach:name,flow:{...shared,mode,...(mode==='trail'?{width,taper:1}:{})},w:.78},{base:0,span:prepareSpan});
      const band=p.length;p.push(follow(rigid('M0 0 Z','winding-material'),'trail'));
      const tip=p.length;p.push(follow(morph(...head,'material-end'),'head'));
      p[band].occludedBy=[tip];return {band,tip,follow};
    }
    if(id==='ribbon'){
      p.push(staged({...rigid('M7 7 Q12 4 17 7 M7 17 Q12 20 17 17 M7 7 L7 9 L7 11 L7 17 M17 7 L17 17','spool-cheeks'),w:.7}));
      p.push(staged({...rigid(circle(12,12,1.4),'spindle'),w:.65}));
      const rig=winding('ribbon-wrap',8,-.25,1,2.1,[.2,.48,.8],[
        'M0 -1.05 L2.8 -1.05 L2.8 1.05 L0 1.05 Z',
        'M0 -1.05 L2.3 -1.05 L2.8 .8 L0 1.05 Z',
        'M0 -1.05 L1.2 -.75 L1.2 .75 L0 1.05 Z'
      ],.15);
      const fold=p.length;p.push(rig.follow(morph('M0 -1.05 L2.8 -1.05 L2.8 -1.05 L0 -1.05 Z','M0 -1.05 L2.3 -1.05 L2.8 .8 L0 -1.05 Z','M0 -1.05 L1.2 -.75 L1.2 .75 L0 -1.05 Z','clasp-return-face'),'head'));
      p[rig.tip].occludedBy=[fold];
      p[fold].seams=[{part:rig.tip,point:0,other:0},{part:rig.tip,point:2,other:2}];
      p.push(staged({...rigid('M7 9 L5.6 8 L4.4 8.4 L4.2 10 L7 11','spool-lock'),w:.75,occludedBy:[rig.band,rig.tip,fold]}));
      rootSeam(p,0,5,[7,9]);
    }
    if(id==='silk'){
      p.push(staged({...rigid('M8.6 8.6 C6.7 10.5 6.7 13.5 8.6 15.4 M15.4 8.6 C17.3 10.5 17.3 13.5 15.4 15.4','threading-ring'),w:.65}));
      [[8,-.25,1,1.25,[.16,.4,.64],.12],[6.4,.25,-1,1.25,[.48,.28,.11],.53]].forEach(([r,start,direction,width,span,prep],i)=>{
        const rig=winding(`silk-sash-${i}`,r,start,direction,width,span,[
          'M0 -.625 C1 -.8 2 -.5 2.3 .1 C1.8 .7 .9 .8 0 .625 Z',
          'M0 -.625 C1 -1.6 2.7 -.9 2.6 .6 C1.8 1.2 .8 1 0 .625 Z',
          'M0 -.625 C.6 -1.4 1.6 -.5 1.2 .7 C.6 1 .4 .8 0 .625 Z'
        ],prep);
        const fold=p.length;p.push(rig.follow(morph('M0 -.625 C1 -.8 2 -.5 2.3 .1 C1.5 -.3 .6 -.4 0 -.625 Z','M0 -.625 C1 -1.6 2.7 -.9 2.6 .6 C1.7 -.2 .6 -.4 0 -.625 Z','M0 -.625 C.6 -1.4 1.6 -.5 1.2 .7 C.7 .1 .4 -.3 0 -.625 Z','sash-return-face'),'head'));
        p[rig.tip].occludedBy=[fold];
        p[fold].seams=[{part:rig.tip,point:0,other:0},{part:rig.tip,point:6,other:6}];
      });
    }
    if(id==='ivy'){
      const rig=winding('growing-vine',8,-.25,1,.75,[.47,.64,.81],[
        'M0 -.375 C1 -1.6 2.4 -1.3 2.6 0 C1.6 .6 .7 .7 0 .375 Z',
        'M0 -.375 C1 -2.4 3.2 -1.6 2.8 .2 C1.6 1 .7 .7 0 .375 Z',
        'M0 -.375 C.7 -1.5 1.8 -1.1 2.2 .1 C1.3 .9 .6 .7 0 .375 Z'
      ],.44);
      [.075,.24,.405].forEach((offset,i)=>[-1,1].forEach(side=>{
        const leaf=(width,length)=>`M0 0 C${width} ${side*length*.15} ${width*.9} ${side*length*.8} 0 ${side*length} C${-width*.7} ${side*length*.7} ${-width*.65} ${side*length*.15} 0 0 Z`;
        const j=p.length,flow={track:{ellipse:[12,12,8,8,0]},mode:'head',start:-.25+offset,phase:[0,0,0],anchor:[0,0],heading:0};
        p.push(staged({...morph(leaf(.22,1.5),leaf(.85,2.5),leaf(1.6,3.15),'rooted-leaf'),o:[0,0],flow,w:.7},{base:0},{base:1},{hover:[[0,'prepare'],[140+i*110,'hover']],click:[[0,'prepare'],[150+i*150,'click'],[900,'release']],leave:[[0,'release'],[220,'rest']]}));
        p[rig.band].occludedBy.push(j);
      }));
    }
    if(id==='ink'){
      const rig=winding('ink-stroke',8,-.25,1,.7,[.25,.48,.78],[
        'M0 0 L-2.4 -1.55 L-4.3 -.75 L-4.3 .75 L-2.4 1.55 Z',
        'M0 0 L-2.4 -1.55 L-4.3 -.75 L-4.3 .75 L-2.4 1.55 Z',
        'M0 0 L-2.4 -1.55 L-4.3 -.75 L-4.3 .75 L-2.4 1.55 Z'
      ],.25);
      p.push(rig.follow({...rigid('M0 0 L-3.2 0','nib-slit'),w:.55},'head'));
      p.push(rig.follow(morph('M-4.3 -.75 L-6.6 -.75 L-6.6 .75 L-4.3 .75 Z','M-4.3 -.75 L-5.6 -.75 L-5.6 .75 L-4.3 .75 Z','M-4.3 -.75 L-6.6 -.75 L-6.6 .75 L-4.3 .75 Z','ink-reservoir'),'head'));
      p[2].seams=[{part:1,point:0,other:0}];p[3].seams=[{part:1,point:0,other:4},{part:1,point:6,other:6}];
      p.push(staged({...rigid('M10.5 10.4 Q12 9.5 13.5 10.4 L13.5 14 Q12 15 10.5 14 Z','ink-well'),w:.75}, {base:0}, {base:0}));
    }
    if(id==='frost'){
      const point=(x,y,r)=>{const a=r*Math.PI/180;return [+(12+(x-12)*Math.cos(a)-(y-12)*Math.sin(a)).toFixed(5),+(12+(x-12)*Math.sin(a)+(y-12)*Math.cos(a)).toFixed(5)];};
      const blade='M12 4 C16 4 19 5.5 21 8 L17 12 C16 8 13 7 12 4 Z';
      const rotate=(d,r)=>{let i=0;const nums=(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)||[]).map(Number),out=[];for(let j=0;j<nums.length;j+=2)out.push(...point(nums[j],nums[j+1],r));return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,()=>out[i++]);};
      for(let i=0;i<6;i++){
        const origin=point(12,4,i*60),pair=i%3,schedule={hover:[[0,'prepare'],[140+pair*100,'hover']],click:[[0,'prepare'],[180+pair*110,'click'],[900,'release']],leave:[[0,'release'],[220,'rest']]};
        p.push(staged({...rigid(rotate(blade,i*60),'iris-blade',[T(),T(0,0,18),T(0,0,38)],origin),w:.8},{base:0},{base:1},schedule));
      }
      for(let i=0;i<6;i++)p[i].occludedBy=Array.from({length:5-i},(_,j)=>i+j+1);
      delete p[5].occludedBy;
      for(let i=0;i<6;i++){const origin=point(12,4,i*60),pin=p.length;p.push(staged({...rigid(`M${origin[0]} ${origin[1]} L${origin[0]} ${origin[1]}`,'iris-pivot'),w:1.5}));p[i].seams=[{part:pin,point:0,other:0}];}
    }
    if(id==='ember'){
      const shapes=[
        'M0 0 C1.2 -2.1 4 -2.5 6 -.5 C4.3 -.5 4.1 1 3 2.7 C4.2 1.8 4.9 2.8 4.7 4.2 C2.7 2.6 -.4 2.2 0 0 Z',
        'M0 0 C1.2 -2.7 4.5 -2.7 6.3 -.8 C4.5 -.4 3.4 1.2 3.1 3 C4.4 2.1 4.4 3 4.1 4.7 C2.7 3.1 -.7 2.1 0 0 Z',
        'M0 0 C1 -1.5 3.5 -1.5 4.8 -.2 C3.4 -.3 2.4 .8 2.5 2.4 C3.4 1.6 3.8 2.5 3.3 3.7 C1.8 2.5 -.6 1.7 0 0 Z'
      ];
      const folds=[
        'M0 0 C1.2 -2.1 4 -2.5 6 -.5 C3.8 -1.3 1.7 -.4 0 0 Z',
        'M0 0 C1.2 -2.7 4.5 -2.7 6.3 -.8 C3.8 -1.6 1.4 .3 0 0 Z',
        'M0 0 C1 -1.5 3.5 -1.5 4.8 -.2 C3.8 .6 1.4 -.2 0 0 Z'
      ];
      [[0,.08,.28],[0,.045,.2],[0,.115,.36]].forEach((phase,i)=>{
        p.push(staged({...morph(...shapes,'circling-flame'),o:[0,0],rate:[1,.88,1.12][i],w:.8,flow:{track:{ellipse:[12,12,7.7,7.7,0]},mode:'head',start:-.25+i/3,phase,anchor:[0,0],heading:0}}, {base:0,phase:0}, {base:1}, {hover:[[0,'prepare'],[130+i*100,'hover']],click:[[0,'prepare'],[160+i*120,'click'],[900,'release']],leave:[[0,'release'],[220,'rest']]}));
        const outer=p.length-1;p.push({...p[outer],...morph(...folds,'flame-return-face'),o:[0,0],rate:p[outer].rate,w:.62,seams:[{part:outer,point:0,other:0},{part:outer,point:6,other:6}]});
        p[outer].occludedBy=[outer+1,...[2,4].filter(j=>j>outer)];
        if(outer<4)p[outer+1].occludedBy=[2,4].filter(j=>j>outer);
      });
    }
    return p;
  }
  function download(id,art){
    const p=art.map((d,i)=>i===0?rigid(d,'arrow',[T(),T(0,.6),T(0,4.1)]):rigid(d,i===1?'tray':'leaf'));
    if(id==='ivy'){
      p[1].h='M1 15 C3 13 6 22 12 22 C18 22 21 13 23 15 M1 15 C0.73333 19 3.04444 21.66667 6.39259 22.11111 C8.06667 22.33333 10 22 12 21 C14 22 15.93333 22.33333 17.60741 22.11111 C20.95556 21.66667 23.26667 19 23 15';
      p[1].c='M1 15 C5 18 6 23 12 22 C18 23 19 18 23 15 M1 15 C0.73333 19 3.04444 21.66667 6.39259 22.11111 C8.06667 22.33333 10 22 12 21 C14 22 15.93333 22.33333 17.60741 22.11111 C20.95556 21.66667 23.26667 19 23 15';
      p[2].o=[6.39259, 22.11111];p[2].t=[T(),T(0,0,-22,.78),T(0,0,32,.9)];p[3].o=[17.60741, 22.11111];p[3].t=[T(),T(0,0,22,.78),T(0,0,-32,.9)];
    }else{
      p[1].h='M1.6 13.8 C1.6 12.4 3.8 12.4 3.8 13.8 L4 17 C4 18 5.2 18.5 6.2 18.5 L17.8 18.5 C18.8 18.5 20 18 20 17 L20.2 13.8 C20.2 12.4 22.4 12.4 22.4 13.8 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z';
      p[1].c='M2.5 19 C2.5 19 4.5 19 4.5 19 L4.5 19 C4.5 19.8 5.2 20 6.2 20 L17.8 20 C18.8 20 19.5 19.8 19.5 19 L19.5 19 C19.5 19 21.5 19 21.5 19 L21.5 19 C21.5 21 20.1 22 18.2 22 L5.8 22 C3.9 22 2.5 21 2.5 19 Z';
    }
    if(id==='ivy'){
      // The existing leaves catch the arrow; no extra line grows across the calyx.
      p.splice(2,2,...p.slice(2).flatMap(a=>{const [outline,vein]=a.d.split(' Z M');return [{...a,d:outline+' Z',h:outline+' Z',c:outline+' Z'},{...a,d:'M'+vein,h:'M'+vein,c:'M'+vein,role:'leaf-vein'}];}));
      p[0].occludedBy=[2,4];p[1].occludedBy=[2,4];
      rootSeam(p,1,2,p[2].o);rootSeam(p,1,4,p[4].o);
    }else{
      const catches={
        ribbon:[
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L4.5 17 C4.5 20 4.8 21 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L-.6 12.4 C3.5 14 6 18 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L8 18.3 C8 21 7 22.4 5.8 22 Z'
        ],
        silk:[
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C2.5 16 4.5 15 4.5 17 C4.5 20 4.8 21 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C-1 15 -1 10 1 11.4 C5 13 6.5 18 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C4 15 8 15.5 8.8 17.6 C9.5 21 7 23 5.8 22 Z'
        ],
        ink:[
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L4.5 17 L5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L.3 12.8 L5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L8.3 18.7 L5.8 22 Z'
        ],
        frost:[
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L3.6 16.5 L4.5 17 L5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L-.7 12.5 L2 14 L5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 L8.8 17.4 L9 20 L5.8 22 Z'
        ],
        ember:[
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C3 18 4 16 4.5 17 C4 19 5 21 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C-1 17 -1 12 .4 11.8 C1 15 5.5 16 5.8 22 Z',
          'M5.8 22 C3.9 22 2.5 21 2.5 19 C5 17 7.4 18 8.8 15.8 C9.8 20 7.4 22.8 5.8 22 Z'
        ]
      }[id];
      const mirror=d=>{let n=0;return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,v=>n++%2?v:24-Number(v));};
      p.push(morph(...catches,'left-catch'),morph(...catches.map(mirror),'right-catch'));
      p[0].occludedBy=[1,2,3];p[1].occludedBy=[2,3];
      rootSeam(p,1,2,[5.8,22]);rootSeam(p,1,3,[18.2,22]);
    }
    return p;
  }
  function history(id,art){
    const p=[rigid(art[0],'frame'),rigid(art[1],'inner-track')];
    p.push({...rigid('M12 5.5 L12 12','minute'),turn:-360,hoverTurn:.08});
    p.push({...rigid('M12 12 L16.7 13.6','hour'),turn:-30,hoverTurn:.08});
    if(id==='ivy'){
      p.push(rigid(art[3],'leaf',[T(),T(0,0,-12,.82),T(0,0,-25,.6)],[3.37037,6.96296]),rigid(art[4],'leaf',[T(),T(0,0,10,.82),T(0,0,22,.6)],[13.6165,21.8685]));
      rootSeam(p,0,4,p[4].o);rootSeam(p,0,5,p[5].o);
    }
    return p;
  }
  function library(id,art){
    // Shelf volumes stay intact; Ink instead presents a front-facing cover and page block.
    const moves={
      ribbon:[[T(),T(-.25,0,-4),T(-.5,0,-8)],[T(),T(0,-.7,2),T(0,-1.5,4)],[T(),T(0,0,4),T(0,0,8)]],
      silk:[[T(),T(0,0,-3),T(0,0,-6)],[T(),T(0,-1.3,-2),T(.2,-2.6,-4)],[T(),T(0,0,3),T(0,0,6)]],
      ivy:[[T(),T(-.3,0,4),T(-.6,0,7)],[T(),T(-.3,0,4),T(-.6,0,7)],[T(),T(0,0,4),T(0,0,8)]],
      ink:[[T(),T(-.7),T(-2.8)],still,[T(),T(0,0,4),T(0,0,8)]],
      frost:[[T(),T(0,-.8),T(0,-1.8)],[T(),T(0,.8),T(0,1.7)],[T(),T(0,-.4),T(0,-1)]],
      ember:[[T(),T(0,0,-5),T(0,0,-10)],[T(),T(0,-.5,3),T(0,-1,6)],[T(),T(0,0,5),T(0,0,10)]]
    }[id],origins=id==='ivy'?[[9,22],[9,22],[20,22]]:[[4.75,22],[11.75,22],[20,22]];
    const p=art.slice(0,3).map((d,i)=>rigid(d,'book',moves[i],origins[i],`book-${i}`));
    if(id==='ivy')p.push(rigid(art[3],'bridge-vine',moves[0],origins[0],'book-0'),rigid(art[4],'leaf',moves[2],origins[2],'book-2'));
    if(id==='ink'){
      // This volume faces forward at rest: narrow binding, full cover, and visible fore-edge.
      const hinge=[9.9,1.6],coverMotion=[T(),T(0,0,0,.55),T(0,0,0,-.85)];
      p[1]=rigid('M9.9 1.6 L14 1.6 Q14.5 1.6 14.5 2.1 L14.5 22 L9.9 22 Z','cover',coverMotion,hinge,'ink-cover');
      p.push({...rigid('M9 1.6 L9.9 1.6 L9.9 22 L9 22 Z','binding'),w:.65});
      p.push(rigid('M9.9 1.6 L14.5 1.6 L14.5 22 L9.9 22 Z','page',[T(),T(0,0,0,.84),T(0,0,0,.2)],hinge));
      p.push({...rigid('M9.9 1.6 L14.5 1.6 L15.4 2.5 L15.4 21.1 L14.5 22 L9.9 22 Z','page-block'),w:.7});
      p.push({...rigid('M11 14.8 L11.8 9.2 L13.4 8 L12.6 13.6 Z M11 14.8 L12.2 11','cover-mark',coverMotion,hinge,'ink-cover'),w:.65,opacity:[1,1,0]});
      p.push({...rigid('M14.5 1.6 L14.5 22','fore-edge'),w:.7});
      p[0].occludedBy=[1];p[4].occludedBy=[1];p[5].occludedBy=[1,4];p[7].occludedBy=[1,4];
      p[1].seams=[{part:3,point:0,other:2},{part:3,point:10,other:4}];
      p[4].seams=[{part:3,point:0,other:2},{part:3,point:6,other:4}];
    }
    return p;
  }
  function choreograph(id,key,parts){
    if(key==='reload')return parts;
    const beats={hover:[[0,'prepare'],[180,'hover']],click:[[0,'prepare'],[190,'click'],[580,'release']],leave:[[0,'release'],[200,'rest']]};
    parts.forEach(p=>{p.beats=beats;p.poses={prepare:{base:0},release:{base:1}};});
    if(key==='back')parts.forEach(p=>p.poses.prepare={base:1,t:[-.25,...(p.t?.[1]||T()).slice(1)]});
    if(key==='download'){
      parts.forEach(p=>p.poses.prepare={base:1});
      parts[0].poses.prepare={base:0,t:T(0,-.9)};
    }
    if(key==='bookmark'){
      if(id==='ribbon'||id==='ember')parts[1].poses.prepare={base:1};
      if(id==='ivy')parts[1].poses.prepare={base:2};
      if(id==='ink')parts.forEach(p=>p.poses.prepare={base:1});
      if(id==='frost')parts[3].poses.prepare={base:1};
      if(id==='silk'){
        parts[0].poses.prepare={base:0,d:'M5.5 20 C5.5 16 5.5 10 5.5 6 C5.5 3.6 7 2 9 2 L15 2 C17 2 18.5 3.6 18.5 6 C18.5 10 18.5 16 18.5 20 C18.5 23 17.6 22.5 16 21 C14.5 19.5 13 18.3 12 17.3 L8 21 C6.4 22.5 5.5 23 5.5 20 Z'};
        parts[1].poses.prepare={base:0,d:'M5.5 6 C5.5 10 5.5 16 5.5 20 C6.2 16 6.2 10 5.5 6 Z'};
        parts[2].poses.prepare={base:0,d:'M18.5 6 C18.5 10 18.5 16 18.5 20 C17.8 16 17.8 10 18.5 6 Z'};
      }
    }
    if(key==='history'&&id==='ivy'){
      parts[4].poses.prepare={base:2};parts[5].poses.prepare={base:1};
      parts[4].poses.release={base:0};parts[5].poses.release={base:0};
    }
    if(key==='library'){
      const leading={ribbon:[0],silk:[0,2],ivy:[0,1,3],ink:[0,2],frost:[0],ember:[1]}[id];
      leading.forEach(i=>parts[i].poses.prepare={base:1});
    }
    return parts;
  }
  // Only explicit endpoints retained in every pose become seam constraints.
  function seams(parts){
    const re=/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g;
    const endpoints=d=>{let n=0;return(d.match(/[MLCQZ][^MLCQZ]*/g)||[]).flatMap(s=>{const count=(s.match(re)||[]).length;n+=count;return count?[n-2]:[];});};
    const values=p=>[p.d,p.h||p.d,p.c||p.d].map(d=>(d.match(re)||[]).map(Number));
    for(let a=0;a<parts.length;a++)for(let b=a+1;b<parts.length;b++){
      const pa=parts[a],pb=parts[b];if(pa.flow||pb.flow)continue;if(JSON.stringify([pa.t,pa.o,pa.rate])!==JSON.stringify([pb.t,pb.o,pb.rate])||pa.turn!==pb.turn)continue;
      const x=values(pa),y=values(pb);
      for(const i of endpoints(pa.d))for(const j of endpoints(pb.d))if(x.every((v,s)=>v[i]===y[s][j]&&v[i+1]===y[s][j+1]))(pa.seams??=[]).push({part:b,point:i,other:j});
    }
    return parts;
  }
  const materials={ribbon:'Ribbon winds onto a spool and its clasp folds shut; broad catches and shared-edge folds receive each action.',silk:'Opposing sashes wind and unwrap around a ring; soft return faces fold into open catches.',ivy:'A circular vine extends as rooted leaf pairs unfold; attached leaves catch the descending arrow.',ink:'A nib deposits a circular stroke while its reservoir compresses; peeling surfaces retain their shared edges.',frost:'Six faceted shutters close in opposite pairs; angular catches fold over a foreshortened receiver.',ember:'Three flame tongues chase separate circular sectors; their attached inner folds and catches curl in sequence.'};
  motionThemes.push(...Object.entries(contours).map(([id,art])=>{
    const demo=seams(choreograph(id,'bookmark',bookmarks(id))),icon=(key,parts)=>seams(choreograph(id,key,parts));
    return {id,stroke:1.05,cap:id==='ink'||id==='frost'?'butt':'round',join:id==='ink'||id==='frost'?'miter':'round',iconViewBoxes:{bookmark:'-5 -4 38 32',reload:'-2 -2 28 28'},note:materials[id],icons:{back:icon('back',back(id,art.back)),reload:icon('reload',reload(id)),download:icon('download',download(id,art.download)),bookmark:demo,history:icon('history',history(id,art.history)),library:icon('library',library(id,art.library))},demo};
  }));
})();
