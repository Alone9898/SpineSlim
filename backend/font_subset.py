from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from backend.service import ProcessingError


EXTENSIONS = {'.ttf', '.otf'}


def font_info(source):
    source = Path(source)
    if not source.is_file() or source.suffix.lower() not in EXTENSIONS:
        raise ProcessingError('font.file', path=str(source))
    font = TTFont(source)
    try:
        names = font['name']
        family = names.getDebugName(1) or source.stem
        style = names.getDebugName(2) or ''
        return {'family': family, 'style': style, 'glyphs': len(font.getGlyphOrder()),
                'characters': len(font.getBestCmap() or {}), 'bytes': source.stat().st_size}
    finally:
        font.close()


def subset_font(source, destination, text, flavor=None):
    source = Path(source)
    destination = Path(destination)
    if not source.is_file() or source.suffix.lower() not in EXTENSIONS:
        raise ProcessingError('font.file', path=str(source))
    characters = sorted({char for char in text if not char.isspace()})
    if not characters:
        raise ProcessingError('font.text')

    font = TTFont(source)
    cmap = font.getBestCmap() or {}
    missing = [char for char in characters if ord(char) not in cmap]
    available = [char for char in characters if ord(char) in cmap]
    if not available:
        raise ProcessingError('font.empty')

    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = False
    selector = subset.Subsetter(options)
    selector.populate(unicodes=[ord(char) for char in available])
    selector.subset(font)

    destination.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = flavor
    font.save(destination)
    font.close()
    return {
        'output': str(destination),
        'input_size': source.stat().st_size,
        'output_size': destination.stat().st_size,
        'kept': available,
        'missing': missing,
    }
