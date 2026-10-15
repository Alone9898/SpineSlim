from app_runtime import APP_VERSION
from PyInstaller.utils.hooks import collect_all


dnd_datas, dnd_binaries, dnd_hiddenimports = collect_all("tkinterdnd2")

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=dnd_binaries,
    datas=dnd_datas + [("LICENSE", "."), ("THIRD_PARTY.md", ".")],
    hiddenimports=dnd_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=f"SpineSlim-{APP_VERSION}-windows-x64",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    version="version_info.txt",
    icon="NONE",
)
