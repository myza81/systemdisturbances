from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from disturbances.artifacts import write_artifact_from_payload
from disturbances.models import DisturbanceRecord


class Command(BaseCommand):
    help = (
        "Backfill disk artifacts for legacy DB-JSON waveform records. "
        "Optionally replaces legacy per-sample JSON with a lightweight payload."
    )

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Apply changes (default: dry-run).')
        parser.add_argument(
            '--purge-legacy-json',
            action='store_true',
            help='After writing artifact, replace data_payload with lightweight metadata (recommended).',
        )
        parser.add_argument('--limit', type=int, default=0, help='Process at most N records (0 = no limit).')

    def handle(self, *args, **options):
        commit = bool(options.get('commit'))
        purge = bool(options.get('purge_legacy_json'))
        limit = int(options.get('limit') or 0)

        media_root = Path(str(getattr(settings, 'MEDIA_ROOT', 'media')))
        waveforms_root = media_root / 'waveforms'

        qs = DisturbanceRecord.objects.all().order_by('id')
        if limit and limit > 0:
            qs = qs[:limit]

        processed = 0
        created = 0
        skipped = 0
        updated = 0

        for rec in qs:
            processed += 1

            meta = rec.metadata if isinstance(rec.metadata, dict) else {}
            art = meta.get('artifact') if isinstance(meta, dict) else None
            if isinstance(art, dict) and art.get('dir'):
                skipped += 1
                continue

            payload = rec.data_payload if isinstance(rec.data_payload, dict) else {}
            # Legacy payload must contain full arrays
            time_arr = payload.get('time')
            analog = payload.get('analog')
            if not isinstance(time_arr, list) or not isinstance(analog, list):
                skipped += 1
                continue
            if not time_arr:
                skipped += 1
                continue
            has_values = False
            for ch in analog:
                if isinstance(ch, dict) and isinstance(ch.get('values'), list) and ch.get('values'):
                    has_values = True
                    break
            if not has_values:
                skipped += 1
                continue

            file_hash = rec.file_hash or f"id-{rec.id}"
            artifact_dir = waveforms_root / str(file_hash)

            artifact_meta = write_artifact_from_payload(payload, artifact_dir)
            created += 1

            lightweight_payload = {
                'trigger_time': payload.get('trigger_time'),
                'sample_rate': payload.get('sample_rate'),
                'station': payload.get('station', ''),
                'device': payload.get('device', ''),
                'frequency': payload.get('frequency', 50.0),
                'analog': [
                    {'name': ch.get('name'), 'unit': ch.get('unit', ''), 'phase': ch.get('phase', '')}
                    for ch in (payload.get('analog') or [])
                    if isinstance(ch, dict)
                ],
                'digital': [
                    {'name': ch.get('name')}
                    for ch in (payload.get('digital') or [])
                    if isinstance(ch, dict)
                ],
            }

            meta = dict(meta) if isinstance(meta, dict) else {}
            meta['artifact'] = {
                'dir': str(artifact_dir),
                'format': 'npy',
                'meta': artifact_meta,
                'backfilled_from': 'db_json',
                'backfilled_at': timezone.now().isoformat(),
            }

            if purge:
                rec.data_payload = lightweight_payload
                updated += 1

            rec.metadata = meta

            if commit:
                rec.save(update_fields=['data_payload', 'metadata'])

        mode = 'COMMIT' if commit else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(
            f"[{mode}] processed={processed} created_artifacts={created} purged_json={updated} skipped={skipped}"
        ))
