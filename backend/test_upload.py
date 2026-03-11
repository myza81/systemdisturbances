import requests
import os

def test_upload():
    url = "http://localhost:8000/api/disturbances/upload/"
    
    cfg_path = "MockDisturbance.cfg"
    dat_path = "MockDisturbance.dat"
    
    if not os.path.exists(cfg_path) or not os.path.exists(dat_path):
        print("Mock files not found!")
        return
        
    files = {
        'primary_file': open(dat_path, 'rb'),
        'auxiliary_file': open(cfg_path, 'rb')
    }
    
    data = {
        'source_type': 'COMTRADE',
        'name': 'Verification Test Record'
    }
    
    try:
        response = requests.post(url, files=files, data=data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_upload()
