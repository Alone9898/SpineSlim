def parse_atlas_pages(text):
    """Return page image names from a Spine atlas.

    A page header is the first non-empty line of a block, followed by page
    metadata. Older atlases may omit `size:`.
    """
    lines = text.splitlines()
    pages = []
    expect_page = True
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            expect_page = True
            continue
        if expect_page:
            following = lines[index + 1].strip() if index + 1 < len(lines) else ""
            if stripped.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".basis")) and following.startswith(("size:", "format:", "filter:", "repeat:", "pma:", "scale:")):
                pages.append(stripped)
            expect_page = False
    return pages
