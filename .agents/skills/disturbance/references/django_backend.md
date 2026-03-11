# Django Backend Reference

## Table of Contents
1. Settings Structure
2. Data Models
3. Parser Integration
4. API Design (Views + Serializers)
5. CORS and Dev Config
6. File Upload Handling

---

## 1. Settings Structure

```
backend/config/settings/
├── base.py      # Shared across all environments
├── local.py     # Local dev: DEBUG=True, CORS allow all, PostgreSQL local
└── production.py  # Future use
```

### base.py skeleton

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'dev-insecure-key')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'corsheaders',
    # Local
    'apps.core',
    'apps.disturbances',
    'apps.analysis',
]

AUTH_USER_MODEL = 'core.User'  # Always set even when auth is inactive

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}
```

### local.py

```python
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'powerdisturbance',
        'USER': 'pduser',
        'PASSWORD': 'pdpass',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

CORS_ALLOW_ALL_ORIGINS = True
```

Set via `DJANGO_SETTINGS_MODULE=config.settings.local` in `.env`.

---

## 2. Data Models

```python
# apps/core/models.py
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    """Auth scaffolding — inactive by default. Enable JWT when needed."""
    pass
```

```python
# apps/disturbances/models.py
import uuid
from django.db import models

class DisturbanceRecord(models.Model):
    SOURCE_TYPES = [
        ('COMTRADE', 'COMTRADE (.cfg/.dat)'),
        ('CSV', 'CSV'),
        ('EXCEL', 'Excel (.xlsx)'),
        ('PSSE', 'PSS/E RAW (.raw)'),
        ('UNKNOWN', 'Unknown'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    original_filename = models.CharField(max_length=512)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    station_name = models.CharField(max_length=256, blank=True)
    recording_start = models.DateTimeField(null=True, blank=True)
    nominal_frequency = models.FloatField(default=50.0)
    metadata = models.JSONField(default=dict)  # Extra parser-specific data
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file_path = models.CharField(max_length=1024, blank=True)

    class Meta:
        ordering = ['-uploaded_at']


class Channel(models.Model):
    CHANNEL_TYPES = [('ANALOGUE', 'Analogue'), ('DIGITAL', 'Digital')]
    PHASES = [('A', 'Phase A'), ('B', 'Phase B'), ('C', 'Phase C'),
              ('N', 'Neutral'), ('3PH', 'Three Phase'), ('NA', 'N/A')]

    record = models.ForeignKey(DisturbanceRecord, on_delete=models.CASCADE,
                               related_name='channels')
    name = models.CharField(max_length=256)
    unit = models.CharField(max_length=64, blank=True)
    channel_type = models.CharField(max_length=10, choices=CHANNEL_TYPES,
                                    default='ANALOGUE')
    phase = models.CharField(max_length=4, choices=PHASES, default='NA')
    multiplier = models.FloatField(default=1.0)  # Primary/secondary scaling
    channel_index = models.IntegerField(default=0)  # Order within record

    class Meta:
        ordering = ['channel_index']


class DataPoint(models.Model):
    """Bulk time-series storage. time_us = microseconds from record start."""
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE,
                                related_name='datapoints')
    time_us = models.BigIntegerField()  # INTEGER for performance
    value = models.FloatField()

    class Meta:
        ordering = ['time_us']
        indexes = [models.Index(fields=['channel', 'time_us'])]


class EventMarker(models.Model):
    EVENT_TYPES = [
        ('FAULT', 'Fault'),
        ('TRIP', 'Circuit Breaker Trip'),
        ('RELAY', 'Relay Operation'),
        ('UFLS', 'Under-Frequency Load Shed'),
        ('OTHER', 'Other'),
    ]
    record = models.ForeignKey(DisturbanceRecord, on_delete=models.CASCADE,
                               related_name='events')
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    time_us = models.BigIntegerField()
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=20, default='INFO')

    class Meta:
        ordering = ['time_us']
```

Bulk insert DataPoints efficiently:
```python
DataPoint.objects.bulk_create(datapoints, batch_size=5000)
```

---

## 3. Parser Integration

```python
# apps/disturbances/views.py (upload view)
from .parsers import detect_file_type, get_parser

class FileUploadView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        f = request.FILES.get('file')
        hint = request.data.get('file_type_hint')  # From frontend dropdown

        # Save to media/uploads/
        path = save_upload(f)

        # Detect or accept hint
        source_type = hint or detect_file_type(path, f.name)
        parser = get_parser(source_type)

        try:
            result = parser.parse(path, options=request.data.dict())
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        record = save_parsed_result(result, f.name, source_type, path)
        return Response(DisturbanceRecordSerializer(record).data, status=201)
```

```python
# apps/disturbances/parsers/__init__.py
def detect_file_type(path: str, filename: str) -> str:
    ext = filename.lower().rsplit('.', 1)[-1]
    if ext == 'cfg':   return 'COMTRADE'
    if ext == 'dat':   return 'COMTRADE'
    if ext == 'raw':   return 'PSSE'
    if ext == 'csv':   return 'CSV'
    if ext in ('xlsx', 'xls'): return 'EXCEL'
    return 'UNKNOWN'

def get_parser(source_type: str):
    from .comtrade_parser import ComtradeParser
    from .csv_parser import CsvParser
    from .excel_parser import ExcelParser
    from .psse_parser import PsseParser
    return {
        'COMTRADE': ComtradeParser(),
        'CSV': CsvParser(),
        'EXCEL': ExcelParser(),
        'PSSE': PsseParser(),
    }.get(source_type, CsvParser())
```

---

## 4. API Design

### Serializers

```python
# apps/disturbances/serializers.py
from rest_framework import serializers
from .models import DisturbanceRecord, Channel, DataPoint, EventMarker

class ChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Channel
        fields = ['id', 'name', 'unit', 'channel_type', 'phase', 'multiplier']

class DisturbanceRecordSerializer(serializers.ModelSerializer):
    channels = ChannelSerializer(many=True, read_only=True)
    class Meta:
        model = DisturbanceRecord
        fields = ['id', 'original_filename', 'source_type', 'station_name',
                  'recording_start', 'nominal_frequency', 'uploaded_at', 'channels']

class DataPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPoint
        fields = ['time_us', 'value']
```

### Downsampled data endpoint (LTTB)

```python
class ChannelDataView(APIView):
    def get(self, request, record_id, channel_id):
        t_start = int(request.query_params.get('t_start', 0))
        t_end = request.query_params.get('t_end')
        max_points = int(request.query_params.get('downsample', 2000))

        qs = DataPoint.objects.filter(channel_id=channel_id,
                                      time_us__gte=t_start)
        if t_end:
            qs = qs.filter(time_us__lte=int(t_end))

        points = list(qs.values_list('time_us', 'value'))
        if len(points) > max_points:
            points = lttb_downsample(points, max_points)

        return Response({'channel_id': channel_id, 'data': points})
```

### urls.py

```python
# config/urls.py
from django.urls import path, include

urlpatterns = [
    path('api/v1/', include('apps.disturbances.urls')),
    path('api/v1/analysis/', include('apps.analysis.urls')),
]

# apps/disturbances/urls.py
urlpatterns = [
    path('disturbances/', views.DisturbanceListView.as_view()),
    path('disturbances/upload/', views.FileUploadView.as_view()),
    path('disturbances/<uuid:pk>/', views.DisturbanceDetailView.as_view()),
    path('disturbances/<uuid:pk>/channels/', views.ChannelListView.as_view()),
    path('disturbances/<uuid:pk>/channels/<int:ch_id>/data/',
         views.ChannelDataView.as_view()),
    path('disturbances/<uuid:pk>/events/', views.EventListView.as_view()),
]
```

---

## 5. CORS and Dev Config

- `CORS_ALLOW_ALL_ORIGINS = True` in local.py (never in production)
- Vite proxy: add to vite.config.js:
  ```js
  server: { proxy: { '/api': 'http://localhost:8000' } }
  ```

---

## 6. LTTB Downsampling

```python
def lttb_downsample(data: list[tuple], threshold: int) -> list[tuple]:
    """Largest-Triangle-Three-Buckets downsampling for waveform display."""
    if threshold >= len(data) or threshold == 0:
        return data
    sampled = [data[0]]
    bucket_size = (len(data) - 2) / (threshold - 2)
    a = 0
    for i in range(threshold - 2):
        avg_x = avg_y = 0.0
        next_bucket_start = int((i + 1) * bucket_size) + 1
        next_bucket_end = min(int((i + 2) * bucket_size) + 1, len(data))
        avg_count = next_bucket_end - next_bucket_start
        for j in range(next_bucket_start, next_bucket_end):
            avg_x += data[j][0]
            avg_y += data[j][1]
        avg_x /= avg_count
        avg_y /= avg_count
        bucket_start = int(i * bucket_size) + 1
        bucket_end = int((i + 1) * bucket_size) + 1
        max_area = -1
        max_point = bucket_start
        for j in range(bucket_start, bucket_end):
            area = abs((data[a][0] - avg_x) * (data[j][1] - data[a][1]) -
                       (data[a][0] - data[j][0]) * (avg_y - data[a][1]))
            if area > max_area:
                max_area = area
                max_point = j
        sampled.append(data[max_point])
        a = max_point
    sampled.append(data[-1])
    return sampled
```
