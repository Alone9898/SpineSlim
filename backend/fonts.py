from PIL import Image


def build_font(source, destination):
    aliases = {"dot": ".", "comma": ",", "colon": ":", "space": " ", "。": ".", "．": ".", "：": ":", "空格": " ", "／": "/", "＼": "\\", "＊": "*", "？": "?", "＂": '"', "＜": "<", "＞": ">", "｜": "|", "，": ","}
    glyphs = {}
    for path in sorted(source.glob("*.png")):
        key = path.stem.split("_", 1)[1] if path.stem.lower().startswith("winnum") and "_" in path.stem else path.stem
        char = aliases.get(key, key)
        if key.startswith("U+"):
            char = chr(int(key[2:], 16))
        if len(char) != 1:
            continue
        if char in glyphs:
            raise ValueError(f"Duplicate glyph: {char}")
        with Image.open(path) as image:
            glyphs[char] = image.convert("RGBA")
    if not glyphs:
        raise ValueError(f"No glyphs found: {source.name}")
    width = sum(image.width for image in glyphs.values())
    height = max(image.height for image in glyphs.values())
    atlas = Image.new("RGBA", (width, height))
    destination.mkdir(exist_ok=True)
    name = source.name
    lines = [f'info face="{name}" size={height} unicode=1',
             f'common lineHeight={height} base={int(height * .8)} scaleW={width} scaleH={height} pages=1 packed=0',
             f'page id=0 file="{name}.png"', f'chars count={len(glyphs)}']
    offset = 0
    for char, image in sorted(glyphs.items(), key=lambda item: ord(item[0])):
        atlas.paste(image, (offset, 0))
        lines.append(f'char id={ord(char)} x={offset} y=0 width={image.width} height={image.height} xoffset=0 yoffset=0 xadvance={image.width} page=0 chnl=15')
        offset += image.width
        image.close()
    atlas.save(destination / f"{name}.png")
    (destination / f"{name}.fnt").write_text("\n".join(lines) + "\n", encoding="utf-8")
