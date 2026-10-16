import base64
import json
import math
import re
import shutil
import subprocess
import tempfile
import time
import uuid
import wave
from pathlib import Path, PurePosixPath

from backend.service import ProcessingError, Service, collect_files
from tool_manager import inspect_tools


EXTENSIONS = {'.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.opus', '.aiff', '.aif', '.wma'}


class AudioService(Service):
    def encoder(self):
        path = inspect_tools(self.options.get('application_dir', str(Path.cwd())), self.options.get('tools', {})).get('ffmpeg')
        if not path:
            raise ProcessingError('audio.ffmpeg')
        return path

    def probe(self, path):
        path = Path(path).resolve()
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            raise ProcessingError('audio.file', path=str(path))
        result = subprocess.run([self.encoder(), '-hide_banner', '-nostdin', '-i', str(path)],
                                capture_output=True, timeout=20, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        detail = result.stderr.decode('utf-8', errors='replace')
        duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', detail)
        stream = re.search(r'Audio: ([^,]+), (\d+) Hz, ([^,\r\n]+)', detail)
        if not duration or not stream:
            raise ProcessingError('audio.file', path=str(path))
        seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
        if not 0 < seconds <= 7200:
            raise ProcessingError('audio.duration')
        return {'path': str(path), 'name': path.name, 'duration': seconds, 'bytes': path.stat().st_size,
                'codec': stream[1], 'rate': int(stream[2]), 'channels': stream[3]}

    def scan(self):
        self.encoder()
        found = {}
        for value in self.options.get('paths', []):
            root = Path(value).resolve()
            for path in collect_files(root) if root.is_dir() else [root]:
                if path.suffix.lower() in EXTENSIONS:
                    found[str(path.resolve())] = (path, path.relative_to(root).as_posix() if root.is_dir() else path.name)
                    if len(found) > 500:
                        raise ProcessingError('audio.limit')
        files, errors = [], []
        for path, name in found.values():
            try:
                item = self.probe(path)
                item['name'] = name
                files.append(item)
            except ProcessingError:
                errors.append(str(path))
        return {'files': files, 'errors': errors}

    def preview(self):
        source = self.probe(self.options.get('path', ''))
        with tempfile.TemporaryDirectory(prefix='spineslim-audio-preview-') as folder:
            target = Path(folder) / 'preview.mp3'
            self.run([self.encoder(), '-v', 'error', '-nostdin', '-i', source['path'], '-t', '600',
                      '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', str(target)], timeout=120)
            return {'data': base64.b64encode(target.read_bytes()).decode('ascii'), 'limited': source['duration'] > 600}

    def number(self, value, minimum, maximum):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ProcessingError('audio.options')
        return value

    def encode(self, arguments, duration, base, span, filename):
        self.check_cancel()
        with tempfile.TemporaryDirectory(prefix='spineslim-audio-progress-') as folder, tempfile.TemporaryFile() as errors:
            progress_path = Path(folder) / 'progress'
            command = [self.encoder(), '-hide_banner', '-v', 'error', '-nostdin', '-nostats', '-progress', 'pipe:1', *map(str, arguments)]
            with progress_path.open('wb') as writer:
                child = subprocess.Popen(command, stdout=writer, stderr=errors, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            started = time.monotonic()
            try:
                while child.poll() is None:
                    self.check_cancel()
                    if time.monotonic() - started > 7200:
                        raise ProcessingError('tool_timeout', tool='FFmpeg')
                    values = re.findall(rb'out_time_us=(\d+)', progress_path.read_bytes())
                    fraction = min(.99, int(values[-1]) / 1_000_000 / max(duration, .01)) if values else 0
                    self.emit('progress', 'audio.processing', completed=base + span * fraction, total=100, file=filename)
                    time.sleep(.15)
                self.check_cancel()
                if child.returncode:
                    errors.seek(0)
                    raise ProcessingError('tool_failed', tool='FFmpeg', code=child.returncode, detail=errors.read(16000).decode('utf-8', errors='replace'))
                self.emit('progress', 'audio.processing', completed=base + span, total=100, file=filename)
            finally:
                if child.poll() is None:
                    child.kill()
                child.wait()

    def process(self):
        options = self.options
        clips = options.get('clips', [])
        mode, extension = options.get('operation'), options.get('audio_format')
        if mode not in ('batch', 'merge', 'sprite') or extension not in ('mp3', 'ogg', 'wav') or not 1 <= len(clips) <= 500:
            raise ProcessingError('audio.options')
        rate, channels = options.get('rate', 44100), options.get('channels', 2)
        if rate not in (22050, 44100, 48000) or channels not in (1, 2):
            raise ProcessingError('audio.options')
        quality = self.number(options.get('quality', 4), 0, 9)
        bitrate = options.get('bitrate', 128)
        if bitrate not in (64, 96, 128, 160, 192, 256, 320) or options.get('encoding', 'vbr') not in ('vbr', 'cbr'):
            raise ProcessingError('audio.options')
        gap = self.number(options.get('gap', .1), 0, 10) if mode == 'sprite' else 0
        target = Path(options.get('target', '')).resolve()
        if not options.get('target') or not target.is_dir():
            raise ProcessingError('invalid_paths')
        prepared, names, total_duration = [], set(), 0
        for clip in clips:
            self.check_cancel()
            info = self.probe(clip.get('path', ''))
            start = self.number(clip.get('start', 0), 0, info['duration'])
            end = self.number(clip.get('end', info['duration']), 0, info['duration'] + .02)
            duration = end - start
            if duration <= 0:
                raise ProcessingError('audio.options')
            fade_in = self.number(clip.get('fade_in', 0), 0, duration)
            fade_out = self.number(clip.get('fade_out', 0), 0, duration)
            name = PurePosixPath(str(clip.get('name', info['name'])).replace('\\', '/')).with_suffix('')
            if name.is_absolute() or any(part in ('..', '.') or ':' in part for part in name.parts) or not name.parts or name.as_posix().casefold() in names:
                raise ProcessingError('audio.names')
            names.add(name.as_posix().casefold())
            total_duration += duration + gap
            prepared.append((info, name, start, duration, fade_in, fade_out))
        if total_duration > 7200:
            raise ProcessingError('audio.duration')
        destination = target / ('SpineSlim-audio-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
        temporary = Path(tempfile.mkdtemp(prefix='.spineslim-audio-', dir=target))
        try:
            work, result = temporary / 'work', temporary / 'result'
            work.mkdir()
            result.mkdir()
            normalized = []
            for index, (info, name, start, duration, fade_in, fade_out) in enumerate(prepared):
                output = work / f'{index}.wav'
                filters = ['asetpts=PTS-STARTPTS']
                if fade_in:
                    filters.append(f'afade=t=in:st=0:d={fade_in}')
                if fade_out:
                    filters.append(f'afade=t=out:st={max(0, duration - fade_out)}:d={fade_out}')
                self.encode(['-ss', start, '-i', info['path'], '-t', duration, '-map', '0:a:0', '-vn', '-af', ','.join(filters),
                             '-ar', rate, '-ac', channels, '-c:a', 'pcm_s16le', output], duration, index / len(clips) * 65, 65 / len(clips), info['name'])
                with wave.open(str(output), 'rb') as audio:
                    frames = audio.getnframes()
                if not frames:
                    raise ProcessingError('audio.file', path=info['path'])
                normalized.append((output, name, frames))
            codec = ['-c:a', {'mp3': 'libmp3lame', 'ogg': 'libvorbis', 'wav': 'pcm_s16le'}[extension]]
            if extension != 'wav':
                codec += ['-q:a', str(quality)] if options.get('encoding', 'vbr') == 'vbr' else ['-b:a', f'{bitrate}k']
            offsets, offset = {}, 0
            if mode != 'batch':
                joined = work / 'joined.wav'
                with wave.open(str(joined), 'wb') as output:
                    output.setparams((channels, 2, rate, 0, 'NONE', 'not compressed'))
                    for index, (source, name, frames) in enumerate(normalized):
                        offsets[name.as_posix()] = (offset / rate, (offset + frames) / rate)
                        with wave.open(str(source), 'rb') as audio:
                            while chunk := audio.readframes(65536):
                                self.check_cancel()
                                output.writeframesraw(chunk)
                        offset += frames
                        if gap and index < len(normalized) - 1:
                            silence = round(gap * rate)
                            output.writeframesraw(b'\0' * silence * channels * 2)
                            offset += silence
                normalized = [(joined, PurePosixPath('audio'), offset)]
            for index, (source, name, frames) in enumerate(normalized):
                output = result / (name.as_posix() + '.' + extension)
                output.parent.mkdir(parents=True, exist_ok=True)
                self.encode(['-i', source, '-map_metadata', '-1', *codec, output], frames / rate,
                            65 + index / len(normalized) * 34, 34 / len(normalized), output.name)
            if mode == 'sprite':
                resource = 'audio.' + extension
                howler = {'src': [resource], 'sprite': {name: [round(start * 1000, 3), round((end - start) * 1000, 3)] for name, (start, end) in offsets.items()}}
                phaser = {'resources': [resource], 'spritemap': {name: {'start': start, 'end': end, 'loop': False} for name, (start, end) in offsets.items()}}
                (result / 'audio.howler.json').write_text(json.dumps(howler, ensure_ascii=False, indent=2), encoding='utf-8')
                (result / 'audio.phaser.json').write_text(json.dumps(phaser, ensure_ascii=False, indent=2), encoding='utf-8')
            report = {'operation': mode, 'format': extension, 'input_bytes': sum(item[0]['bytes'] for item in prepared),
                      'output_bytes': sum(path.stat().st_size for path in result.rglob('*') if path.is_file()), 'clips': len(clips)}
            (result / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
            self.check_cancel()
            self.emit('stage', 'committing', completed=99, total=100)
            result.rename(destination)
            self.emit('result', 'audio.report', **report)
            self.emit('progress', 'audio.processing', completed=100, total=100)
            return destination
        finally:
            shutil.rmtree(temporary, ignore_errors=True)
