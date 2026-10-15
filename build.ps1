$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -c "import sys; print(sys.executable)"
python -m pip install -r requirements.txt pyinstaller
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
python -m PyInstaller --noconfirm --clean --distpath dist --workpath build SpineSlim.spec
if ($LASTEXITCODE -ne 0) { throw "Packaging failed" }
python package_release.py
if ($LASTEXITCODE -ne 0) { throw "Release archive creation failed" }
