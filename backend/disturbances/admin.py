from django.contrib import admin
from .models import DisturbanceRecord, AppSettings

@admin.register(DisturbanceRecord)
class DisturbanceRecordAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'source_type', 'sample_rate', 'nominal_frequency', 'timestamp']
    list_filter = ['source_type']
    search_fields = ['name', 'original_filename']

@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ['key', 'updated_at']
