# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[('SpineSkeletonDataConverter.exe', '.'), ('ffmpeg.exe', '.')],
    datas=[('config.json', '.'), ('icon.ico', '.'),('ImageMagick-7.1.2-19-portable-Q16-HDRI-x64', 'ImageMagick-7.1.2-19-portable-Q16-HDRI-x64'), ('basisu.exe', '.'), ('TexturePacker/bin', 'TexturePacker/bin'), ('TexturePacker/resources', 'TexturePacker/resources'), ('bmfont1.14a', 'bmfont1.14a')],
    hiddenimports=[],
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
    name='ResManage-v1.4',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
