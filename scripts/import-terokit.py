"""Import exact matches from Terpedia's structure-resolved Terokit supplier leads."""
import csv
import json
import sys
from pathlib import Path

groups = {}
with open(sys.argv[1], newline='') as source:
    for row in csv.DictReader(source):
        if row['match_mode'] != 'exact_full_inchikey':
            continue
        name = row['compound_names']
        key = (name, row['matched_inchikey'])
        groups.setdefault(key, set()).add((row['terokit_id'], row['vendor'], row['vendor_code']))
records = [
    dict(name=name, inchikey=inchikey, listings=sorted(listings))
    for (name, inchikey), listings in sorted(groups.items())
]
Path(__file__).resolve().parents[1].joinpath('docs/isolates.json').write_text(json.dumps(records, ensure_ascii=False))
print(len(records), 'identities')
