import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from disturbances.models import DisturbanceRecord

try:
    r = DisturbanceRecord.objects.get(pk=5)
    print(f"ID: {r.id}")
    print(f"Name: {r.name}")
    print(f"Payload Exists: {bool(r.data_payload)}")
    if r.data_payload:
        time_len = len(r.data_payload.get('time', []))
        print(f"Time samples: {time_len}")
        print(f"Keys: {list(r.data_payload.keys())}")
        if time_len == 0:
            print("WARNING: Time array is empty")
    else:
        print("WARNING: Payload is None")
except DisturbanceRecord.DoesNotExist:
    print("ERROR: Record #5 does not exist")
except Exception as e:
    print(f"ERROR: {str(e)}")
