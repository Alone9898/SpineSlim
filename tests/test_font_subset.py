import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from backend.font_subset import font_info, subset_font
from backend.service import ProcessingError


GLYPHS = ['.notdef', 'space', 'A', 'B', 'C', 'D']
ROOT = Path(__file__).resolve().parents[1]


def build_test_font(path):
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(GLYPHS)
    builder.setupCharacterMap({0x20: 'space', 0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D'})
    pen_glyphs = {}
    for name in GLYPHS:
        pen = TTGlyphPen(None)
        pen.moveTo((0, 0)); pen.lineTo((100, 0)); pen.lineTo((50, 100)); pen.closePath()
        pen_glyphs[name] = pen.glyph()
    builder.setupGlyf(pen_glyphs)
    builder.setupHorizontalMetrics({name: (500, 0) for name in GLYPHS})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({'familyName': 'SubsetTest', 'styleName': 'Regular'})
    builder.setupOS2()
    builder.setupPost()
    builder.save(path)


class FontSubsetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source.ttf'
        build_test_font(self.source)

    def cmap(self, path):
        return set(TTFont(path).getBestCmap())

    def test_keeps_only_requested_characters(self):
        target = self.root / 'out' / 'subset.ttf'
        result = subset_font(self.source, target, 'AB A')
        self.assertEqual(self.cmap(target), {0x41, 0x42})
        self.assertEqual(result['kept'], ['A', 'B'])
        self.assertEqual(result['missing'], [])
        self.assertLess(result['output_size'], result['input_size'])

    def test_reports_characters_missing_from_font(self):
        result = subset_font(self.source, self.root / 'subset.ttf', 'A中')
        self.assertEqual(result['kept'], ['A'])
        self.assertEqual(result['missing'], ['中'])

    def test_keeps_otf_extension(self):
        otf = self.root / 'source.otf'
        otf.write_bytes(self.source.read_bytes())
        target = self.root / 'subset.otf'
        subset_font(otf, target, 'C')
        self.assertTrue(target.is_file())
        self.assertEqual(self.cmap(target), {0x43})

    def test_rejects_unsupported_file(self):
        bad = self.root / 'image.png'
        bad.write_bytes(b'not a font')
        with self.assertRaises(ProcessingError) as context:
            subset_font(bad, self.root / 'out.ttf', 'A')
        self.assertEqual(context.exception.key, 'font.file')

    def test_rejects_empty_text(self):
        with self.assertRaises(ProcessingError) as context:
            subset_font(self.source, self.root / 'out.ttf', '  \n')
        self.assertEqual(context.exception.key, 'font.text')

    def test_rejects_text_without_font_glyphs(self):
        with self.assertRaises(ProcessingError) as context:
            subset_font(self.source, self.root / 'out.ttf', '中文')
        self.assertEqual(context.exception.key, 'font.empty')

    def test_writes_woff_when_requested(self):
        target = self.root / 'subset.woff'
        subset_font(self.source, target, 'AB', 'woff')
        self.assertEqual(target.read_bytes()[:4], b'wOFF')
        self.assertEqual(self.cmap(target), {0x41, 0x42})

    def test_reads_font_information(self):
        info = font_info(self.source)
        self.assertEqual(info['family'], 'SubsetTest')
        self.assertEqual(info['style'], 'Regular')
        self.assertEqual(info['glyphs'], len(GLYPHS))
        self.assertEqual(info['characters'], 5)

    def test_worker_font_info_action(self):
        request = {'protocol_version': 1, 'task_id': 'font-info', 'action': 'font_info',
                   'options': {'path': str(self.source)}}
        completed = subprocess.run([sys.executable, '-m', 'backend.worker'], input=json.dumps(request) + '\n',
                                   capture_output=True, text=True, encoding='utf-8', cwd=ROOT, timeout=60)
        events = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
        result = next(event for event in events if event['type'] == 'result')
        self.assertEqual(result['message_key'], 'font_info')
        self.assertEqual(result['params']['family'], 'SubsetTest')

    def test_worker_writes_woff_for_woff_format(self):
        output = self.root / 'woff-result'
        request = {'protocol_version': 1, 'task_id': 'font-woff', 'action': 'font_subset',
                   'options': {'path': str(self.source), 'output_dir': str(output), 'text': 'A', 'format': 'woff'}}
        completed = subprocess.run([sys.executable, '-m', 'backend.worker'], input=json.dumps(request) + '\n',
                                   capture_output=True, text=True, encoding='utf-8', cwd=ROOT, timeout=60)
        events = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
        result = next(event for event in events if event['type'] == 'result')
        self.assertEqual(Path(result['params']['output']), output / 'source-subset.woff')
        self.assertEqual((output / 'source-subset.woff').read_bytes()[:4], b'wOFF')

    def test_worker_action_writes_suffixed_file(self):
        output = self.root / 'result'
        request = {'protocol_version': 1, 'task_id': 'font-test', 'action': 'font_subset',
                   'options': {'path': str(self.source), 'output_dir': str(output), 'text': 'AB'}}
        completed = subprocess.run([sys.executable, '-m', 'backend.worker'], input=json.dumps(request) + '\n',
                                   capture_output=True, text=True, encoding='utf-8', cwd=ROOT, timeout=60)
        events = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
        result = next(event for event in events if event['type'] == 'result')
        self.assertEqual(result['message_key'], 'font_subset')
        self.assertEqual(Path(result['params']['output']), output / 'source-subset.ttf')
        self.assertEqual(self.cmap(output / 'source-subset.ttf'), {0x41, 0x42})


if __name__ == '__main__':
    unittest.main()
