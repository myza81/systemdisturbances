from django.db import models


class DisturbanceRecord(models.Model):
    SOURCE_CHOICES = [
        ('COMTRADE', 'COMTRADE'),
        ('CSV', 'CSV'),
        ('EXCEL', 'Excel'),
        ('PSSE', 'PSS/E RAW'),
    ]
    source_type = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='COMTRADE')
    name = models.CharField(max_length=255, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    file_hash = models.CharField(max_length=64, unique=True, null=True, blank=True)

    # Parsed waveform data stored as JSON
    data_payload = models.JSONField(null=True, blank=True)

    # Derived metadata for fast access by the frontend
    trigger_time = models.FloatField(null=True, blank=True,
        help_text="Seconds from record start to trigger event. Frontend centers time axis at this point.")
    sample_rate = models.FloatField(null=True, blank=True,
        help_text="Sampling rate in Hz.")
    nominal_frequency = models.FloatField(default=50.0,
        help_text="Nominal system frequency (50 or 60 Hz).")

    # Per-channel user configuration (label, color, scale, visibility)
    channel_config = models.JSONField(null=True, blank=True,
        help_text="User-side overrides: {channel_name: {label, color, scale, unit, visible}}")

    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(null=True, blank=True)

    def __str__(self):
        return f"{self.name or self.original_filename or 'Disturbance'} ({self.source_type})"


class AppSettings(models.Model):
    """
    Global / per-installation settings key-value store.
    Used for phase colors, default scaling, theme preferences.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Setting: {self.key}"