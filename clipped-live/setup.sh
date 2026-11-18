#!/usr/bin/env bash
# One-time setup in a fresh cloud container (idempotent).
set -e
pip install -q yt-dlp faster-whisper numpy 2>&1 | grep -v "Running pip as the 'root'" || true
fc-list | grep -qi "DejaVu Sans" || (apt-get update -qq && apt-get install -y -qq fonts-dejavu-core)
python3 -c "
from faster_whisper import WhisperModel
for m in ('base.en', 'small.en'): WhisperModel(m, device='cpu', compute_type='int8')
print('setup ok')" 2>&1 | grep -v -i warning
