import numpy as np
import os

def generate_mock_comtrade(name="MockDisturbance"):
    # CFG Content (COMTRADE 1991)
    cfg = f"""{name},1
3,2,1
1,VA,A,V,1,0,0,0,-32768,32767
2,VB,B,V,1,0,0,0,-32768,32767
3,IA,C,A,1,0,0,0,-32768,32767
1,Trip,A,TRIP,0
50
1
1000,1000
01/01/2026,12:00:00.000000
01/01/2026,12:00:01.000000
ASCII"""
    
    # DAT Content (ASCII)
    # Index, Timestamp (us), Analog1, Analog2, Analog3, Digital1
    dat_lines = []
    for i in range(1000):
        t = int(i * 1000) # us
        v1 = int(230 * np.sin(2 * np.pi * 50 * t / 1e6))
        v2 = int(230 * np.sin(2 * np.pi * 50 * t / 1e6 - 2*np.pi/3))
        i1 = int(5 * np.sin(2 * np.pi * 50 * t / 1e6))
        d1 = 1 if i > 500 else 0
        dat_lines.append(f"{i+1},{t},{v1},{v2},{i1},{d1}")
    
    with open(f"{name}.cfg", "w") as f:
        f.write(cfg)
    with open(f"{name}.dat", "w") as f:
        f.write("\n".join(dat_lines))
    
    print(f"Generated {name}.cfg and {name}.dat")

if __name__ == "__main__":
    generate_mock_comtrade()
