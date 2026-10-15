$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -c "import sys; print(sys.executable)"
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --clean --distpath dist-current --workpath build-current ResManage.spec
