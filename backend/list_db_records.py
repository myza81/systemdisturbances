
import os
import django
import sys

# Add current directory to sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from disturbances.models import DisturbanceRecord

print(f"{'ID':<5} | {'Source':<10} | {'Name':<35} | {'Ana':<3} | {'Dig':<3}")
print("-" * 75)
for r in DisturbanceRecord.objects.all().order_by('-id'):
    payload = r.data_payload or {}
    analog_count = len(payload.get('analog', []))
    digital_count = len(payload.get('digital', []))
    name = r.name or r.original_filename or "N/A"
    print(f"{r.id:<5} | {r.source_type:<10} | {name[:35]:<35} | {analog_count:<3} | {digital_count:<3}")
