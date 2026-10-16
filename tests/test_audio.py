import json
import math
import shutil
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from backend.audio import AudioService
from backend.service import Cancelled, ProcessingError


@unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg is needed for audio integration tests')
class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / '素材'
        self.target = self.root / '输出'
        self.source.mkdir()
        self.target.mkdir()
        self.events = []
        self.clips = []
        for index, rate in enumerate([22050, 48000]):
            path = self.source / f'音效 {index}.wav'
            with wave.open(str(path), 'wb') as audio:
                audio.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
                audio.writeframes(b''.join(struct.pack('<h', round(10000 * math.sin(frame / rate * 440 * math.tau))) for frame in range(rate)))
            self.clips.append({'path': str(path), 'name': f'sfx/clip{index}.wav', 'start': .2, 'end': .8, 'fade_in': .1, 'fade_out': .1})

    def service(self, **options):
        return AudioService({'tools': {'ffmpeg': shutil.which('ffmpeg')}, 'target': str(self.target),
                             'clips': self.clips, 'operation': 'batch', 'audio_format': 'wav', 'rate': 44100,
                             'channels': 2, **options}, lambda kind, key, **params: self.events.append((kind, key, params)))

    def test_batch_trim_fades_structure_and_progress(self):
        output = self.service().process()
        with wave.open(str(output / 'sfx/clip0.wav'), 'rb') as audio:
            self.assertEqual(audio.getnchannels(), 2)
            self.assertEqual(audio.getframerate(), 44100)
            self.assertAlmostEqual(audio.getnframes() / 44100, .6, places=3)
            samples = struct.unpack('<' + 'h' * audio.getnframes() * 2, audio.readframes(audio.getnframes()))
            self.assertLess(max(abs(value) for value in samples[:100]), 200)
            self.assertGreater(max(abs(value) for value in samples[10000:11000]), 6500)
            self.assertLess(max(abs(value) for value in samples[-100:]), 200)
        self.assertTrue(Path(self.clips[0]['path']).exists())
        progress = [params['completed'] for kind, key, params in self.events if kind == 'progress']
        self.assertEqual(progress, sorted(progress))
        self.assertEqual(progress[-1], 100)

    def test_sprite_sample_offsets_and_gap(self):
        output = self.service(operation='sprite', gap=.25).process()
        howler = json.loads((output / 'audio.howler.json').read_text())
        phaser = json.loads((output / 'audio.phaser.json').read_text())
        self.assertEqual(howler['sprite']['sfx/clip0'], [0, 600])
        self.assertEqual(howler['sprite']['sfx/clip1'], [850, 600])
        self.assertAlmostEqual(phaser['spritemap']['sfx/clip1']['end'], 1.45)
        with wave.open(str(output / 'audio.wav'), 'rb') as audio:
            self.assertAlmostEqual(audio.getnframes() / audio.getframerate(), 1.45)
            audio.setpos(26460)
            self.assertEqual(set(audio.readframes(11025)), {0})

    def test_merge_and_lossy_formats(self):
        for extension in ['wav', 'mp3', 'ogg']:
            service = self.service(operation='merge', audio_format=extension)
            output = service.process()
            info = service.probe(output / f'audio.{extension}')
            self.assertAlmostEqual(info['duration'], 1.2, delta=.12)
            self.assertFalse((output / 'audio.howler.json').exists())

    def test_invalid_names_and_trim_do_not_publish(self):
        for change in [{'name': '../escape.wav'}, {'end': .1}, {'fade_in': 8}]:
            clips = [{**self.clips[0], **change}]
            with self.assertRaises(ProcessingError):
                self.service(clips=clips).process()
        with self.assertRaises(ProcessingError):
            self.service(clips=[self.clips[0], self.clips[0]]).process()
        self.assertEqual(list(self.target.iterdir()), [])

    def test_bitrate_mode_and_mono_resampling(self):
        service = self.service(operation='merge', audio_format='mp3', encoding='cbr', bitrate=96, channels=1, rate=22050)
        output = service.process()
        info = service.probe(output / 'audio.mp3')
        self.assertEqual(info['rate'], 22050)
        self.assertEqual(info['channels'], 'mono')

    def test_cancel_removes_partial_output(self):
        service = self.service()
        def emit(kind, key, **params):
            if kind == 'progress':
                service.cancelled.set()
        service.emit = emit
        with self.assertRaises(Cancelled):
            service.process()
        self.assertEqual(list(self.target.iterdir()), [])

    def test_scan_preview_and_corrupt_input(self):
        (self.source / 'bad.mp3').write_bytes(b'broken')
        service = self.service(paths=[str(self.source)])
        catalog = service.scan()
        self.assertEqual(len(catalog['files']), 2)
        self.assertEqual(len(catalog['errors']), 1)
        preview = self.service(path=self.clips[0]['path']).preview()
        self.assertGreater(len(preview['data']), 1000)
        self.assertFalse(preview['limited'])


if __name__ == '__main__':
    unittest.main()
