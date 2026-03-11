from rest_framework import serializers
from .models import DisturbanceRecord


class DisturbanceUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisturbanceRecord
        fields = [
            'id', 'name', 'source_type', 'original_filename',
            'file_size', 'file_hash', 'timestamp',
            'data_payload', 'metadata',
            'trigger_time', 'sample_rate', 'nominal_frequency', 'channel_config',
        ]
        read_only_fields = ['file_hash', 'file_size', 'original_filename', 'timestamp']