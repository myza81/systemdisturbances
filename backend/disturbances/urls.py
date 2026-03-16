from django.urls import path
from . import views

urlpatterns = [
    # Disturbance CRUD
    path('all/', views.list_disturbances, name='list-disturbances'),
    path('<int:pk>/', views.get_disturbance_detail, name='disturbance-detail'),
    path('<int:pk>/delete/', views.delete_disturbance, name='delete-disturbance'),
    path('upload/', views.upload_disturbance, name='upload-disturbance'),
    path('scan/', views.scan_disturbance, name='scan-disturbance'),

    # Waveform data (paginated) and RMS
    path('<int:pk>/waveform/', views.get_waveform, name='disturbance-waveform'),
    path('<int:pk>/rms/', views.get_rms, name='disturbance-rms'),

    # Stage 1: metadata/window/sample (viewport-based)
    path('<int:pk>/metadata/', views.get_disturbance_metadata, name='disturbance-metadata'),
    path('<int:pk>/window/', views.get_waveform_window, name='disturbance-window'),
    path('<int:pk>/sample/', views.get_waveform_sample, name='disturbance-sample'),

    # Channel metadata & per-record settings
    path('<int:pk>/channels/', views.get_channels, name='disturbance-channels'),
    path('<int:pk>/channel-config/', views.update_channel_config, name='disturbance-channel-config'),
]
