import os
import django
import io
from django.core.files.uploadedfile import SimpleUploadedFile

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from disturbances.models import DisturbanceRecord
from disturbances.views import parse_comtrade_in_memory
from disturbances.serializers import DisturbanceUploadSerializer
from utils.hashing import calculate_file_hash

def direct_ingest():
    cfg_path = r"media\disturbances\auxiliary\Friday_06_March_2026_10.02.40.000.CFG"
    dat_path = r"media\disturbances\primary\Friday_06_March_2026_10.02.40.000.DAT"
    
    if not os.path.exists(cfg_path) or not os.path.exists(dat_path):
        # Try relative to backend
        cfg_path = os.path.join("media", "disturbances", "auxiliary", "Friday_06_March_2026_10.02.40.000.CFG")
        dat_path = os.path.join("media", "disturbances", "primary", "Friday_06_March_2026_10.02.40.000.DAT")
        
    if not os.path.exists(cfg_path):
        print(f"File {cfg_path} not found!")
        return

    with open(cfg_path, 'rb') as f:
        cfg_content = f.read()
    with open(dat_path, 'rb') as f:
        dat_content = f.read()

    cfg_file = SimpleUploadedFile(cfg_path, cfg_content)
    dat_file = SimpleUploadedFile(dat_path, dat_content)

    print("Parsing COMTRADE...")
    try:
        data_payload = parse_comtrade_in_memory(cfg_file, dat_file)
        print("Parsing successful!")
    except Exception as e:
        print(f"Parsing failed: {e}")
        return

    file_hash = calculate_file_hash(dat_file)
    
    # Delete existing if any to avoid conflict
    DisturbanceRecord.objects.filter(file_hash=file_hash).delete()
    
    record = DisturbanceRecord.objects.create(
        name="Verification Record (Direct)",
        source_type="COMTRADE",
        original_filename=dat_path,
        file_hash=file_hash,
        file_size=len(dat_content),
        data_payload=data_payload
    )
    
    print(f"Created record {record.id} with payload size {len(str(data_payload))}")

if __name__ == "__main__":
    direct_ingest()
