"""Import the official NEPA/UNICAMP workbook using Python's standard library."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/'
file = ROOT / 'data-sources/taco.xlsx'
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
# Erros de digitação da planilha oficial, conferidos na aba de ácidos graxos (AGtaco3):
# a célula B620 da aba principal traz "L" para o alimento 540, que é a Feijoada.
NAME_FIXES = {'540': 'Feijoada'}
foods, excluded = [], []
with zipfile.ZipFile(file) as archive:
    strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    rows = ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:row', ns)
    category = ''
    for row in rows:
        cells = {}
        for cell in row:
            value = cell.find('s:v', ns)
            if value is None:
                continue
            cells[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
        code = cells.get('A', '')
        if not code.isdigit():
            # O cabeçalho "Número do Alimento" se repete a cada página e não é categoria.
            if code and 'B' not in cells and not code.startswith('Número'):
                category = code
            continue
        trace = []
        values = []
        for column in ['D', 'F', 'I', 'G']:
            value = cells.get(column, '')
            if value.strip().lower() == 'tr':
                trace.append(column)
                values.append(0)
            else:
                try:
                    values.append(round(float(value), 3))
                except ValueError:
                    values.append(None)
        if any(v is None or v < 0 for v in values):
            excluded.append({'code': code, 'name': cells.get('B'), 'reason': 'Composição energética ou macro não numérico / negativo.'})
            continue
        foods.append({'id': f'taco-{code}', 'name': NAME_FIXES.get(code, cells['B']), 'category': category,
                      'caloriesPer100g': values[0], 'proteinPer100g': values[1], 'carbsPer100g': values[2], 'fatPer100g': values[3],
                      'source': f'TACO, 4ª edição, NEPA/UNICAMP (2011), alimento {code}', 'sourceUrl': SOURCE,
                      **({'note': 'Um ou mais macronutrientes classificados como traços (Tr) foram aproximados para zero no cálculo.'} if trace else {})})
assert len(foods) > 500 and len({f['id'] for f in foods}) == len(foods)
(ROOT / 'src/data/foods.json').write_text(json.dumps(foods, ensure_ascii=False, indent=2), encoding='utf-8')
(ROOT / 'data-sources/taco-metadata.json').write_text(json.dumps({'sourceUrl': SOURCE, 'edition': '4ª edição, 2011', 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'importedFoods': len(foods), 'excluded': excluded, 'rules': 'Composição por 100 g. Valores arredondados a três casas decimais; Tr aproximado a zero e identificado por alimento. Valores ausentes/NA não são convertidos em zero.'}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Imported {len(foods)} foods; excluded {len(excluded)}.')
