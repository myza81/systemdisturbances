
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

import comtrade
from disturbances.parsers.comtrade_parser import parse_comtrade

def check_files():
    media_dir = r'd:\myIjat\Dojo\disturbances\backend\media\disturbances\auxiliary'
    if not os.path.exists(media_dir):
        print(f"Media dir not found: {media_dir}")
        return

    for f in os.listdir(media_dir):
        if f.lower().endswith('.cfg'):
            cfg_path = os.path.join(media_dir, f)
            dat_path = cfg_path.replace('.CFG', '.DAT').replace('.cfg', '.dat')
            
            if not os.path.exists(dat_path):
                print(f"DAT not found for {f}")
                continue
                
            print(f"Testing {f}...")
            try:
                class MockFile:
                    def __init__(self, path, mode='rb'):
                        self.path = path
                        self.mode = mode
                    def read(self):
                        with open(self.path, self.mode) as f:
                            return f.read()
                
                cfg_file = MockFile(cfg_path)
                dat_file = MockFile(dat_path)
                result = parse_comtrade(cfg_file, dat_file)
                print(f"  SUCCESS: {result['station']}")
            except Exception as e:
                print(f"  FAILED: {str(e)}")
                import traceback
                traceback.print_exc()

if __name__ == "__main__":
    check_files()
