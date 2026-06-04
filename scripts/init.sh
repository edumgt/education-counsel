#!/bin/sh
set -e

EXISTS=$(python3 -c "
import os
from qdrant_client import QdrantClient
try:
    c = QdrantClient(url=os.environ.get('QDRANT_URL', 'http://qdrant:6333'))
    cols = [x.name for x in c.get_collections().collections]
    print('yes' if 'career_all' in cols else 'no')
except Exception as e:
    print('no')
")

if [ "$EXISTS" = "yes" ]; then
  echo "[init] career_all collection already exists — skipping ingest."
  exit 0
fi

echo "[init] career_all not found — starting ingest..."
python /scripts/normalize.py --data-root /DATA_ROOT --out-dir /data
python /scripts/index_qdrant.py --docs /data/documents.jsonl
echo "[init] ingest complete."
