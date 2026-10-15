import argparse
from pathlib import Path

from PIL import Image


def prepare_icon(source: Path) -> None:
    assets = Path(__file__).resolve().parent / "assets"
    assets.mkdir(exist_ok=True)
    with Image.open(source) as original:
        image = original.convert("RGBA")
        image.save(assets / "brand.png", optimize=True)
        symbol = image.crop((258, 146, 996, 884))
        symbol = symbol.resize((512, 512), Image.Resampling.LANCZOS)
        symbol.save(assets / "app-icon.png", optimize=True)
        symbol.save(
            assets / "app-icon.ico",
            sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    prepare_icon(parser.parse_args().source)
