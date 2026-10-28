import base64
from pathlib import Path

from fontTools.ttLib import TTFont

from backend.service import ProcessingError


EXTENSIONS = {'.ttf', '.otf'}
GLYPH_LIMIT = 20000
FONT_DATA_LIMIT = 32 * 1024 * 1024

# name table IDs edited by the metadata panel, keyed by the field name the UI uses.
NAME_IDS = {
    'copyright': 0, 'family': 1, 'subfamily': 2, 'unique_id': 3, 'full_name': 4, 'version': 5,
    'postscript_name': 6, 'trademark': 7, 'manufacturer': 8, 'designer': 9, 'description': 10,
    'license': 13,
}


def check_font(source):
    source = Path(source)
    if not source.is_file() or source.suffix.lower() not in EXTENSIONS:
        raise ProcessingError('font.file', path=str(source))
    return source


def font_data(source):
    source = check_font(source)
    if source.stat().st_size > FONT_DATA_LIMIT:
        raise ProcessingError('font.size')
    return {'data': base64.b64encode(source.read_bytes()).decode('ascii')}


def glyphs(source):
    source = check_font(source)
    font = TTFont(source)
    try:
        cmap = font.getBestCmap() or {}
        metrics = font['hmtx'].metrics if 'hmtx' in font else {}
        codes = {}
        for codepoint, name in sorted(cmap.items()):
            codes.setdefault(name, codepoint)
        # Mapped glyphs come first so the display limit only cuts unmapped ones.
        mapped = [{'codepoint': codepoint, 'name': name, 'advance': metrics.get(name, (0, 0))[0]} for codepoint, name in sorted(cmap.items())]
        unmapped = [{'codepoint': None, 'name': name, 'advance': metrics.get(name, (0, 0))[0]} for name in font.getGlyphOrder() if name not in codes]
        items = mapped + unmapped
        return {'glyphs': items[:GLYPH_LIMIT], 'total': len(cmap), 'glyph_count': len(items),
                'truncated': len(items) > GLYPH_LIMIT, 'units_per_em': font['head'].unitsPerEm}
    finally:
        font.close()


# Unicode blocks reported as coverage. The keys are translated by the UI.
COVERAGE_BLOCKS = [
    ('basic_latin', 0x0020, 0x007F), ('latin_1', 0x0080, 0x00FF), ('latin_ext_a', 0x0100, 0x017F),
    ('latin_ext_b', 0x0180, 0x024F), ('greek', 0x0370, 0x03FF), ('cyrillic', 0x0400, 0x04FF),
    ('hebrew', 0x0590, 0x05FF), ('arabic', 0x0600, 0x06FF), ('general_punctuation', 0x2000, 0x206F),
    ('math_operators', 0x2200, 0x22FF), ('hiragana_katakana', 0x3040, 0x30FF),
    ('cjk_unified', 0x4E00, 0x9FFF), ('hangul_syllables', 0xAC00, 0xD7AF),
]


def metrics(source):
    source = check_font(source)
    font = TTFont(source)
    try:
        cmap = font.getBestCmap() or {}
        os2 = font['OS/2'] if 'OS/2' in font else None
        hhea = font['hhea']
        coverage = [key for key, start, end in COVERAGE_BLOCKS if any(start <= code <= end for code in cmap)]
        return {
            'glyph_count': len(font.getGlyphOrder()), 'unicode_count': len(cmap),
            'units_per_em': font['head'].unitsPerEm, 'ascender': hhea.ascent, 'descender': hhea.descent,
            'x_height': getattr(os2, 'sxHeight', 0) or 0, 'cap_height': getattr(os2, 'sCapHeight', 0) or 0,
            'bytes': source.stat().st_size, 'coverage': coverage,
        }
    finally:
        font.close()


def names(source):
    source = check_font(source)
    font = TTFont(source)
    try:
        table = font['name']
        return {key: (table.getDebugName(name_id) or '') for key, name_id in NAME_IDS.items()}
    finally:
        font.close()


def save_names(source, destination, fields):
    source = check_font(source)
    destination = Path(destination)
    font = TTFont(source)
    try:
        table = font['name']
        for key, name_id in NAME_IDS.items():
            if key not in fields:
                continue
            value = str(fields[key]).strip()
            # Remove existing records for this ID, then write Windows and Mac records when a value is given.
            table.names = [record for record in table.names if record.nameID != name_id]
            if value:
                table.setName(value, name_id, 3, 1, 0x409)
                table.setName(value, name_id, 1, 0, 0)
        destination.parent.mkdir(parents=True, exist_ok=True)
        font.save(destination)
    finally:
        font.close()
    return {'output': str(destination), 'output_size': destination.stat().st_size}
