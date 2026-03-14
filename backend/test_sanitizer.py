
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

from disturbances.parsers.comtrade_parser import parse_comtrade

# ORIGINAL MALFORMED CFG (missing A/D suffixes)
malformed_cfg = """MockDisturbance,1
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
ASCII
"""

dat_path = os.path.join(os.getcwd(), 'MockDisturbance.dat')

class MockFile:
    def __init__(self, content, is_bytes=False):
        self.content = content
        self.is_bytes = is_bytes
    def read(self):
        return self.content

try:
    with open(dat_path, 'rb') as df:
        dat_content = df.read()
    
    cfg_file = MockFile(malformed_cfg)
    dat_file = MockFile(dat_content, is_bytes=True)
    
    # This should now succeed because of in-memory sanitization!
    result = parse_comtrade(cfg_file, dat_file)
    print("SUCCESS: Sanitizer works! Malformed CFG parsed correctly.")
    print(f"Analog count: {len(result['analog'])}")
    print(f"Digital count: {len(result['digital'])}")
except Exception as e:
    print(f"FAILED: Sanitizer did not fix the issue: {str(e)}")
    import traceback
    traceback.print_exc()
