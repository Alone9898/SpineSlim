import base64
import tempfile
import unittest
from pathlib import Path

from fontTools.ttLib import TTFont

from backend.font_tools import font_data, glyphs, metrics, names, save_names
from backend.service import ProcessingError
from tests.test_font_subset import GLYPHS, build_test_font


class FontToolsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source.ttf'
        build_test_font(self.source)

    def test_lists_mapped_glyphs_with_advance(self):
        result = glyphs(self.source)
        self.assertEqual(result['total'], 5)
        self.assertFalse(result['truncated'])
        by_code = {item['codepoint']: item for item in result['glyphs']}
        self.assertEqual(by_code[0x41]['name'], 'A')
        self.assertEqual(by_code[0x41]['advance'], 500)
        self.assertEqual(result['units_per_em'], 1000)
        self.assertEqual(result['glyph_count'], len(GLYPHS))
        unmapped = [item for item in result['glyphs'] if item['codepoint'] is None]
        self.assertEqual([item['name'] for item in unmapped], ['.notdef'])

    def test_reports_font_metrics_and_coverage(self):
        result = metrics(self.source)
        self.assertEqual(result['glyph_count'], len(GLYPHS))
        self.assertEqual(result['unicode_count'], 5)
        self.assertEqual(result['units_per_em'], 1000)
        self.assertEqual(result['ascender'], 800)
        self.assertEqual(result['descender'], -200)
        self.assertEqual(result['coverage'], ['basic_latin'])
        self.assertEqual(result['bytes'], self.source.stat().st_size)

    def test_reads_name_fields(self):
        result = names(self.source)
        self.assertEqual(result['family'], 'SubsetTest')
        self.assertEqual(result['subfamily'], 'Regular')
        self.assertEqual(result['copyright'], '')

    def test_saves_edited_names_to_new_file(self):
        target = self.root / 'out' / 'source-edited.ttf'
        result = save_names(self.source, target, {'family': 'Renamed Font', 'copyright': '(c) Test', 'designer': ''})
        self.assertEqual(Path(result['output']), target)
        edited = names(target)
        self.assertEqual(edited['family'], 'Renamed Font')
        self.assertEqual(edited['copyright'], '(c) Test')
        self.assertEqual(edited['subfamily'], 'Regular')
        self.assertEqual(names(self.source)['family'], 'SubsetTest')

    def test_blank_value_removes_name_record(self):
        target = self.root / 'blank.ttf'
        save_names(self.source, target, {'family': 'Keep Me', 'description': ''})
        font = TTFont(target)
        try:
            self.assertFalse([record for record in font['name'].names if record.nameID == 10])
        finally:
            font.close()

    def test_font_data_round_trips(self):
        data = base64.b64decode(font_data(self.source)['data'])
        self.assertEqual(data, self.source.read_bytes())

    def test_rejects_non_font_file(self):
        bad = self.root / 'note.txt'
        bad.write_text('hello', encoding='utf-8')
        with self.assertRaises(ProcessingError) as context:
            glyphs(bad)
        self.assertEqual(context.exception.key, 'font.file')


if __name__ == '__main__':
    unittest.main()
