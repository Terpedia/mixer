"""Import exact matches from Terpedia's structure-resolved Terokit supplier leads."""
import csv
import json
import sys
from uuid import NAMESPACE_URL, uuid5
from pathlib import Path

groups = {}
with open(sys.argv[1], newline='') as source:
    for row in csv.DictReader(source):
        if row['match_mode'] != 'exact_full_inchikey':
            continue
        name = row['compound_names']
        key = (name, row['matched_inchikey'])
        groups.setdefault(key, set()).add((row['terokit_id'], row['vendor'], row['vendor_code'], row['website']))
docs = Path(__file__).resolve().parents[1] / 'docs'
suppliers = {}
records = []
for (name, inchikey), listings in sorted(groups.items()):
    offers = set()
    for _, vendor, code, website in sorted(listings):
        supplier_id = str(uuid5(NAMESPACE_URL, 'https://terpedia.com/suppliers/' + vendor.strip().casefold()))
        entity = suppliers.setdefault(supplier_id, dict(id=supplier_id, name=vendor, websites=[]))
        if website.startswith('www.'):
            website = 'https://' + website
        if website.startswith(('http://', 'https://')) and website not in entity['websites']:
            entity['websites'].append(website)
        offers.add((supplier_id, code))
    records.append(dict(name=name, inchikey=inchikey, listings=[
        dict(supplierId=s, code=c) for s, c in sorted(offers)
    ]))
for filename, data in [('isolates', records), ('suppliers', sorted(suppliers.values(), key=lambda s: s['name'].casefold()))]:
    (docs / (filename + '.json')).write_text(json.dumps(data, ensure_ascii=False))
print(len(suppliers), 'suppliers')
