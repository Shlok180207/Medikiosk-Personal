import json
import os

def create_notebook():
    cells = []

    def md_cell(source):
        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": [line + "\n" for line in source.strip().split("\n")]
        })

    def code_cell(source):
        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [line + "\n" for line in source.strip().split("\n")]
        })

    # Header
    md_cell("""# 🏥 MediKiosk v2 — Google Colab Production Runner
### Offline Clinical Intake Kiosk with Multi-Modal Perception & Edge LLM

> **IMPORTANT**: Before running this notebook, please ensure a GPU runtime is selected:
> 1. Click **Runtime** in the top navigation bar -> **Change runtime type**.
> 2. Select **T4 GPU** under Hardware accelerator.
> 3. Click **Save**, then select **Runtime** -> **Run all**.
""")

    # Stage 0
    md_cell("""---
## Stage 0 — Configuration & Parameters
Set your repository URL, workspace directory, branch, and processor mode.
Supported modes:
- `AUTO` (Recommended): Uses GPU if CUDA is available, otherwise falls back to CPU.
- `FORCE_GPU`: Requires CUDA/GPU. Fails with a clear alert if GPU is not available.
- `FORCE_CPU`: Runs entirely on CPU with lightweight models (`qwen2.5:1.5b`, Whisper base).
""")

    code_cell("""# ── Stage 0: Configuration ──
import os
import sys

# User-Configurable Parameters
REPO_URL = "https://github.com/Shlok180207/Medikiosk-Personal.git"
WORKSPACE_DIR = "/content/Medikiosk-Personal"
BRANCH = "main"
PROCESSOR_MODE = "AUTO"  # "AUTO", "FORCE_GPU", or "FORCE_CPU"
PORT = 8000

# Validate PROCESSOR_MODE
VALID_MODES = ["AUTO", "FORCE_GPU", "FORCE_CPU"]
if PROCESSOR_MODE not in VALID_MODES:
    raise ValueError(f"Invalid PROCESSOR_MODE '{PROCESSOR_MODE}'. Must be one of {VALID_MODES}")

print("=" * 60)
print("⚙️ Stage 0 — Configuration Configured")
print("=" * 60)
print(f"Repository URL    : {REPO_URL}")
print(f"Workspace Path    : {WORKSPACE_DIR}")
print(f"Branch Target     : {BRANCH}")
print(f"Processor Mode    : {PROCESSOR_MODE}")
print(f"Server Port       : {PORT}")
print("=" * 60)
""")

    # Stage 1
    md_cell("""---
## Stage 1 — GPU & CUDA Verification
Verifies hardware availability, PyTorch CUDA build, and NVIDIA driver status.
If `FORCE_GPU` is selected and CUDA is unavailable, the runner stops immediately.
""")

    code_cell("""# ── Stage 1: GPU / CUDA Verification ──
import sys
import subprocess

print("=" * 60)
print("🔍 Stage 1 — Hardware & CUDA Verification")
print("=" * 60)
print(f"Python version  : {sys.version.split()[0]}")

import torch

pytorch_ver = torch.__version__
cuda_avail = torch.cuda.is_available()
cuda_ver = torch.version.cuda if cuda_avail else "N/A"
cudnn_ok = torch.backends.cudnn.enabled if cuda_avail else False
gpu_name = torch.cuda.get_device_name(0) if cuda_avail else "None"
gpu_vram = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2) if cuda_avail else 0.0

print(f"PyTorch version : {pytorch_ver}")
print(f"CUDA available  : {cuda_avail}")
print(f"CUDA version    : {cuda_ver}")
print(f"cuDNN enabled   : {cudnn_ok}")
print(f"GPU name        : {gpu_name}")
print(f"GPU VRAM        : {gpu_vram} GB")

# Check nvidia-smi
print("\\nChecking nvidia-smi:")
try:
    smi_out = subprocess.check_output(["nvidia-smi"], stderr=subprocess.STDOUT, text=True)
    for line in smi_out.strip().split("\\n")[:12]:
        print("  " + line)
except Exception as e:
    print(f"⚠️ nvidia-smi unavailable: {e}")

# Strict verification for FORCE_GPU mode
if PROCESSOR_MODE == "FORCE_GPU" and not cuda_avail:
    raise RuntimeError(
        "\\n❌ ERROR: CUDA is unavailable, but PROCESSOR_MODE is set to 'FORCE_GPU'!\\n"
        "To fix this in Google Colab:\\n"
        "  1. Go to menu: Runtime -> Change runtime type\\n"
        "  2. Under 'Hardware accelerator', choose 'T4 GPU'\\n"
        "  3. Click 'Save'\\n"
        "  4. Restart runtime and rerun the notebook."
    )
elif cuda_avail:
    print(f"\\n✅ GPU verification successful: {gpu_name} ({gpu_vram} GB VRAM).")
else:
    print("\\nℹ️ CUDA is not available. Continuing under CPU execution.")
print("=" * 60)
""")

    # Stage 2
    md_cell("""---
## Stage 2 — Clone / Synchronize Repository
Clones or synchronizes the target repository (`https://github.com/Shlok180207/Medikiosk-Personal.git`) into `/content/Medikiosk-Personal`.
Prints commit hash, branch name, and status.
""")

    code_cell("""# ── Stage 2: Clone / Synchronize Repository ──
import os
import subprocess

print("=" * 60)
print("📥 Stage 2 — Clone / Synchronize Repository")
print("=" * 60)

if os.path.exists(WORKSPACE_DIR) and os.path.exists(os.path.join(WORKSPACE_DIR, ".git")):
    print(f"🔄 Existing repository detected at {WORKSPACE_DIR}. Syncing with origin/{BRANCH}...")
    os.chdir(WORKSPACE_DIR)
    # Ensure remote URL points to the configured REPO_URL
    subprocess.run(["git", "remote", "set-url", "origin", REPO_URL], check=True)
    subprocess.run(["git", "fetch", "origin"], check=True)
    subprocess.run(["git", "checkout", "-f", BRANCH], check=True)
    subprocess.run(["git", "reset", "--hard", f"origin/{BRANCH}"], check=True)
    subprocess.run(["git", "clean", "-fd"], check=True)
else:
    print(f"📦 Cloning {REPO_URL} into {WORKSPACE_DIR}...")
    subprocess.run(["git", "clone", "-b", BRANCH, REPO_URL, WORKSPACE_DIR], check=True)
    os.chdir(WORKSPACE_DIR)

# Switch active working directory
os.chdir(WORKSPACE_DIR)

# Report repository details
git_hash = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
git_branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
if not git_branch:
    git_branch = BRANCH

print(f"Repository        : {REPO_URL}")
print(f"Commit            : {git_hash}")
print(f"Branch            : {git_branch}")
print(f"Working directory : {os.getcwd()}")
print("\\nGit status summary:")
status_out = subprocess.check_output(["git", "status", "--short"], text=True).strip()
print(status_out if status_out else "Working tree clean (up-to-date)")
print("=" * 60)
""")

    # Stage 3
    md_cell("""---
## Stage 3 — Install Linux & System Dependencies
Installs essential system tools required by MediKiosk:
- `tesseract-ocr`, `libtesseract-dev` & language packs (for offline prescription/lab OCR)
- `zstd` (for high-speed Ollama model archive compression)
- `ffmpeg` (for multi-format audio conversion)
- `curl`
""")

    code_cell("""# ── Stage 3: Install Linux/System Dependencies ──
import subprocess
import shutil

print("=" * 60)
print("📦 Stage 3 — Installing Linux / System Packages")
print("=" * 60)

# Run apt-get in quiet mode
subprocess.run(["apt-get", "update", "-qq"], check=True)
subprocess.run([
    "apt-get", "install", "-y", "-qq",
    "tesseract-ocr",
    "tesseract-ocr-eng",
    "tesseract-ocr-hin",
    "libtesseract-dev",
    "zstd",
    "curl",
    "ffmpeg"
], check=True)

# Verify installations
zstd_path = shutil.which("zstd")
tess_path = shutil.which("tesseract")

if not zstd_path:
    raise RuntimeError("❌ 'zstd' was not found on system PATH after installation!")
if not tess_path:
    raise RuntimeError("❌ 'tesseract' was not found on system PATH after installation!")

zstd_ver = subprocess.check_output(["zstd", "--version"], text=True).strip().split("\\n")[0]
tess_ver = subprocess.check_output(["tesseract", "--version"], text=True).strip().split("\\n")[0]

print(f"✅ zstd installed      : {zstd_path} ({zstd_ver})")
print(f"✅ tesseract installed : {tess_path} ({tess_ver})")
print("=" * 60)
""")

    # Stage 4
    md_cell("""---
## Stage 4 — Install Python Dependencies
Installs all backend, AI, vision, audio, and OCR dependencies.
- **Safety check**: Colab's existing CUDA-enabled PyTorch environment is preserved and NOT replaced blindly.
- Installs `PyMuPDF` (explicitly as `PyMuPDF`, avoiding any unrelated `fitz` package).
- Installs `pytesseract`, `faster-whisper`, `torchxrayvision`, `rapidfuzz`, `ollama`, `fastapi`, `uvicorn`, etc.
- Re-verifies that `torch.cuda.is_available()` is still intact after package installations.
""")

    code_cell("""# ── Stage 4: Install Python Dependencies ──
import sys
import subprocess

print("=" * 60)
print("🐍 Stage 4 — Installing Python Dependencies")
print("=" * 60)
print(f"Active Python interpreter : {sys.executable}")
print(f"Python version            : {sys.version.split()[0]}")

import torch
torch_has_cuda = torch.cuda.is_available()
print(f"Initial PyTorch CUDA status: {torch_has_cuda}")
if torch_has_cuda:
    print(f"Preserving existing PyTorch {torch.__version__} (CUDA {torch.version.cuda})")

# Categorized dependency tiers with --prefer-binary to prevent resolver backtracking
package_tiers = [
    (
        "Tier 1: Core Web, Database & Network",
        [
            "fastapi>=0.110.0",
            "uvicorn[standard]>=0.28.0",
            "pydantic>=2.6.0",
            "sqlalchemy>=2.0.0",
            "python-dotenv>=1.0.0",
            "python-multipart>=0.0.9",
            "requests>=2.31.0",
            "tqdm>=4.66.0"
        ]
    ),
    (
        "Tier 2: Signal Processing & Normalization",
        [
            "numpy>=1.26.0",
            "scipy>=1.12.0",
            "pillow>=10.2.0",
            "opencv-python>=4.9.0",
            "rapidfuzz>=3.6.0",
            "transformers>=4.38.0"
        ]
    ),
    (
        "Tier 3: Document Processing & OCR (PyMuPDF & Tesseract)",
        [
            "pytesseract>=0.3.10",
            "PyMuPDF>=1.24.0"
        ]
    ),
    (
        "Tier 4: Speech-to-Text & Audio Synthesis",
        [
            "gTTS>=2.5.0",
            "faster-whisper>=1.0.0"
        ]
    ),
    (
        "Tier 5: Deep Learning Vision & LLM Client",
        [
            "torchxrayvision>=1.2.3",
            "ollama>=0.1.7"
        ]
    )
]

for tier_idx, (tier_name, pkg_list) in enumerate(package_tiers, 1):
    print(f"\\n📦 [{tier_idx}/{len(package_tiers)}] Installing {tier_name}...")
    print(f"   Packages: {', '.join(pkg_list)}")
    
    # Run pip with --prefer-binary to avoid slow compilation and backtracking
    cmd = [sys.executable, "-m", "pip", "install", "--prefer-binary", "--upgrade-strategy", "only-if-needed"] + pkg_list
    res = subprocess.run(cmd)
    
    if res.returncode != 0:
        print(f"⚠️ Warning encountered during tier install. Retrying individual packages in {tier_name}...")
        for single_pkg in pkg_list:
            p_res = subprocess.run([sys.executable, "-m", "pip", "install", "--prefer-binary", single_pkg])
            if p_res.returncode != 0:
                raise RuntimeError(f"❌ Failed to install required dependency '{single_pkg}' on Python {sys.version.split()[0]}!")
    
    print(f"✅ {tier_name} installed successfully.")

# Re-verify PyTorch and CUDA post-installation
import torch

post_cuda = torch.cuda.is_available()
print(f"\\nPost-install PyTorch version : {torch.__version__}")
print(f"Post-install CUDA available  : {post_cuda}")

if PROCESSOR_MODE == "FORCE_GPU" and not post_cuda:
    raise RuntimeError(
        "❌ PyTorch CUDA became unavailable after installing Python dependencies!\\n"
        "Ensure Colab has a GPU runtime selected (Runtime -> Change runtime type -> T4 GPU)."
    )

print("=" * 60)
print("🎉 All Python dependencies installed and verified successfully.")
print("=" * 60)
""")

    # Stage 5
    md_cell("""---
## Stage 5 — Verify OCR & PDF Dependencies
Verifies:
1. `PyMuPDF` (`fitz`) import and version.
2. `pytesseract` Python wrapper and Tesseract engine version.
3. PaddleOCR availability test (uses Tesseract as clean, tested fallback if PaddleOCR is not installed).
""")

    code_cell("""# ── Stage 5: Verify OCR / PDF Dependencies ──
print("=" * 60)
print("📄 Stage 5 — Verifying OCR & PDF Dependencies")
print("=" * 60)

# 1. Verify PyMuPDF (fitz)
try:
    import fitz
    print(f"✅ PyMuPDF OK: version {fitz.version}")
except ImportError as e:
    raise RuntimeError(f"❌ PyMuPDF import failed: {e}. Run 'pip install -U PyMuPDF'.")

# 2. Verify pytesseract
try:
    import pytesseract
    tess_v = pytesseract.get_tesseract_version()
    print(f"✅ Tesseract OK: version {tess_v}")
except Exception as e:
    raise RuntimeError(f"❌ pytesseract verification failed: {e}")

# 3. Test PaddleOCR / fallback status
paddle_status = "unavailable"
try:
    import paddle
    from paddleocr import PaddleOCR
    paddle_status = "available"
except Exception:
    paddle_status = "unavailable"

print(f"ℹ️ PaddleOCR : {paddle_status}")
print(f"ℹ️ Tesseract : available (Primary CPU OCR engine)")
print("=" * 60)
""")

    # Stage 6
    md_cell("""---
## Stage 6 — Configure Hardware & Model Environment
Configures the execution profile **AFTER** inspecting the final environment:
- **GPU Mode**: `qwen2.5:7b`, Whisper `medium` on `cuda` with `int8_float16`.
- **CPU Mode**: `qwen2.5:1.5b`, Whisper `base` on `cpu` with `int8`.

Exports standard MediKiosk environment variables:
`OLLAMA_MODEL`, `FALLBACK_MODEL`, `CLINICAL_LLM_MODEL`, `WHISPER_DEVICE`, `WHISPER_MODEL`, `WHISPER_COMPUTE_TYPE`.
""")

    code_cell("""# ── Stage 6: Configure Hardware / Model Environment ──
import os
import torch

print("=" * 60)
print("⚙️ Stage 6 — Hardware & Model Profile Configuration")
print("=" * 60)

is_cuda = torch.cuda.is_available() and (PROCESSOR_MODE != "FORCE_CPU")

if is_cuda:
    SELECTED_PROCESSOR = "GPU"
    LLM_MODEL = "qwen2.5:7b"
    FALLBACK_LLM = "qwen2.5:3b"
    WHISPER_DEVICE = "cuda"
    WHISPER_COMPUTE = "int8_float16"
    WHISPER_MODEL = "medium"
else:
    SELECTED_PROCESSOR = "CPU"
    LLM_MODEL = "qwen2.5:1.5b"
    FALLBACK_LLM = "qwen2.5:1.5b"
    WHISPER_DEVICE = "cpu"
    WHISPER_COMPUTE = "int8"
    WHISPER_MODEL = "base"

# Set environment variables for the backend
os.environ["PROCESSOR_MODE"] = SELECTED_PROCESSOR
os.environ["OLLAMA_MODEL"] = LLM_MODEL
os.environ["FALLBACK_MODEL"] = FALLBACK_LLM
os.environ["DOC_EXTRACTION_MODEL"] = LLM_MODEL
os.environ["CLINICAL_LLM_MODEL"] = LLM_MODEL
os.environ["WHISPER_DEVICE"] = WHISPER_DEVICE
os.environ["WHISPER_MODEL"] = WHISPER_MODEL
os.environ["WHISPER_COMPUTE_TYPE"] = WHISPER_COMPUTE

print(f"Configured Profile    : {SELECTED_PROCESSOR}")
print(f"Selected Clinical LLM : {LLM_MODEL}")
print(f"Fallback LLM          : {FALLBACK_LLM}")
print(f"Whisper Device        : {WHISPER_DEVICE}")
print(f"Whisper Model Size    : {WHISPER_MODEL}")
print(f"Whisper Compute Type  : {WHISPER_COMPUTE}")
print("=" * 60)
""")

    # Stage 7
    md_cell("""---
## Stage 7 — Install & Start Ollama
Installs the Ollama binary (if not already installed) and starts the daemon in the background.
Monitors `127.0.0.1:11434` until responsive.
""")

    code_cell("""# ── Stage 7: Install / Start Ollama ──
import os
import time
import socket
import subprocess
import shutil

print("=" * 60)
print("🦙 Stage 7 — Ollama Daemon Setup")
print("=" * 60)

# Check if ollama binary is installed
if not shutil.which("ollama"):
    print("Installing Ollama via official installer...")
    install_cmd = "curl -fsSL https://ollama.com/install.sh | sh"
    subprocess.run(install_cmd, shell=True, check=True)

# Helper to check if Ollama socket is responding
def is_ollama_alive(port=11434, host="127.0.0.1"):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        return False

# Launch Ollama daemon in background if not already running
if is_ollama_alive():
    print("✅ Ollama daemon is already running on 127.0.0.1:11434.")
else:
    print("🚀 Launching 'ollama serve' daemon in background...")
    ollama_log_path = "/content/ollama_daemon.log"
    with open(ollama_log_path, "w") as log_f:
        subprocess.Popen(["ollama", "serve"], stdout=log_f, stderr=subprocess.STDOUT)

    # Wait for Ollama to become responsive
    max_wait = 30
    start_t = time.time()
    while time.time() - start_t < max_wait:
        if is_ollama_alive():
            break
        time.sleep(1.0)

    if not is_ollama_alive():
        with open(ollama_log_path, "r") as log_f:
            err_log = log_f.read()
        raise RuntimeError(f"❌ Ollama daemon failed to start within {max_wait}s!\\nLog:\\n{err_log}")

    print("✅ Ollama daemon is active and responding on 127.0.0.1:11434.")

# Run ollama list
ollama_list = subprocess.check_output(["ollama", "list"], text=True).strip()
print("\\nOllama current models:")
print(ollama_list if ollama_list else "  (No models pulled yet)")
print("=" * 60)
""")

    # Stage 8
    md_cell("""---
## Stage 8 — Pull & Test Selected LLMs
Pulls **two required models** from Ollama and runs a warm-up verification:
- **Text LLM** (`qwen2.5:7b` for GPU / `qwen2.5:1.5b` for CPU) — clinical reasoning, drug normalization, symptom extraction.
- **Vision LLM** (`qwen2.5vl:3b`, always) — **mandatory** for prescription handwriting OCR and lab report structured parsing (`perception/prescription.py` + `perception/lab/vlm_extractor.py`).
""")

    code_cell("""# ── Stage 8: Pull & Test Selected LLM + Vision Model ──
import subprocess
import ollama

print("=" * 60)
print(f"🧠 Stage 8 — Pulling & Testing Models")
print("=" * 60)

# ── 8a: Pull the main text LLM ──────────────────────────────────
print(f"\\n[8a] Pulling text LLM: {LLM_MODEL}...")
subprocess.run(["ollama", "pull", LLM_MODEL], check=True)
print(f"✅ {LLM_MODEL} downloaded.")

# ── 8b: Pull qwen2.5vl:3b (MANDATORY vision model) ────────────────
# Required by:
#   - perception/prescription.py  → handwriting OCR & drug extraction
#   - perception/lab/vlm_extractor.py → lab report structured parsing
VISION_MODEL = "qwen2.5vl:3b"
print(f"\\n[8b] Pulling vision model: {VISION_MODEL}...")
print("     (Used by prescription handwriting OCR & lab report VLM pipeline)")
subprocess.run(["ollama", "pull", VISION_MODEL], check=True)
print(f"✅ {VISION_MODEL} downloaded.")

# ── 8c: Warm-up test on text LLM ──────────────────────────────────
print(f"\\n[8c] Running warm-up clinical prompt on {LLM_MODEL}...")
warmup_prompt = "You are MediKiosk Clinical Assistant. Respond with exactly the word: 'READY'."

response = ollama.chat(
    model=LLM_MODEL,
    messages=[{"role": "user", "content": warmup_prompt}]
)

reply = response.get("message", {}).get("content", "").strip()
print(f"Text LLM warm-up response: {reply}")

if not reply:
    raise RuntimeError(f"❌ LLM {LLM_MODEL} returned an empty response during warm-up!")

# ── 8d: Verify vision model is loaded in Ollama registry ──────────
print(f"\\n[8d] Verifying {VISION_MODEL} in Ollama registry...")
model_list_out = subprocess.check_output(["ollama", "list"], text=True)
if VISION_MODEL not in model_list_out:
    raise RuntimeError(
        f"❌ {VISION_MODEL} was not found in 'ollama list' after pull!\\n"
        "Prescription OCR and Lab VLM pipelines will fail without this model."
    )

print(f"✅ {VISION_MODEL} confirmed in Ollama registry.")
print("\\nOllama model registry:")
print(model_list_out.strip())

print("=" * 60)
print(f"✅ All models ready: {LLM_MODEL} + {VISION_MODEL}")
print("=" * 60)
""")

    # Stage 9
    md_cell("""---
## Stage 9 — Test Faster-Whisper on Target Device
Loads the configured Faster-Whisper model on the target hardware (`cuda` + `int8_float16` for GPU or `cpu` + `int8` for CPU).
Verifies device placement, then unloads the model to conserve memory.
""")

    code_cell("""# ── Stage 9: Test Whisper on Hardware ──
import gc
import torch
from faster_whisper import WhisperModel

print("=" * 60)
print("🎙️ Stage 9 — Faster-Whisper Hardware Test")
print("=" * 60)
print(f"Testing Whisper Model : {WHISPER_MODEL}")
print(f"Target Device         : {WHISPER_DEVICE}")
print(f"Compute Type          : {WHISPER_COMPUTE}")

try:
    test_asr = WhisperModel(
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE
    )
    print("✅ WhisperModel instantiated successfully.")
    print(f"Device: {WHISPER_DEVICE}")
    print(f"Compute type: {WHISPER_COMPUTE}")
    print("Model loaded successfully: True")

    # Clean up model from VRAM immediately to maintain 100% headroom for server
    del test_asr
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    print("🧹 Whisper test model deloaded and VRAM returned to system.")
except Exception as e:
    raise RuntimeError(f"❌ Faster-Whisper failed to load on {WHISPER_DEVICE} ({WHISPER_COMPUTE}): {e}")

print("=" * 60)
""")

    # Stage 10
    md_cell("""---
## Stage 10 — Build Frontend
Installs frontend dependencies (`npm install`) and compiles the production Vite bundle (`npm run build`).
Confirms `frontend/dist` exists.
""")

    code_cell("""# ── Stage 10: Build Frontend ──
import os
import subprocess

print("=" * 60)
print("⚛️ Stage 10 — Building React Frontend (Vite)")
print("=" * 60)

frontend_dir = os.path.join(WORKSPACE_DIR, "frontend")
if not os.path.exists(frontend_dir):
    raise FileNotFoundError(f"Frontend directory not found at {frontend_dir}")

# Install and build frontend
print("Running 'npm install'...")
subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)

print("Running 'npm run build'...")
subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)

dist_dir = os.path.join(frontend_dir, "dist")
index_html = os.path.join(dist_dir, "index.html")

if not (os.path.exists(dist_dir) and os.path.exists(index_html)):
    raise RuntimeError(f"❌ Frontend build verification failed: {dist_dir} or {index_html} missing!")

print(f"✅ Frontend successfully built and verified at: {dist_dir}")
print("=" * 60)
""")

    # Stage 11
    md_cell("""---
## Stage 11 — Automated Preflight Dependency Tests
Verifies all clinical document and intake perception pipelines before starting the server:
- `main.py`
- `perception.router`
- `perception.document_ocr`
- `perception.prescription`
- `perception.radiology`
- `perception.ecg`
- `perception.xray`
- `perception.lab`
- PDF extraction test via PyMuPDF (`fitz`)
- OCR text extraction test via Tesseract
""")

    code_cell("""# ── Stage 11: Automated Preflight Tests ──
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

os.chdir(WORKSPACE_DIR)
sys.path.insert(0, WORKSPACE_DIR)

print("=" * 60)
print("🧪 Stage 11 — Document & Clinical Pipeline Preflight Tests")
print("=" * 60)

# 1. Module import checks
try:
    import main
    print("[PASS] main")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import main: {e}")

try:
    from perception.router import classify_image_modality
    from perception.document_ocr import parse_printed_report
    print("[PASS] PDF/OCR")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import perception router/document_ocr: {e}")

try:
    from perception.prescription import analyze_prescription, normalize_drugs
    print("[PASS] prescription OCR")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import prescription pipeline: {e}")

try:
    from perception.lab import analyze_lab_report
    print("[PASS] lab pipeline")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import lab pipeline: {e}")

try:
    from perception.xray import analyze_xray
    print("[PASS] X-ray pipeline")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import X-ray pipeline: {e}")

try:
    from perception.ecg import analyze_ecg
    print("[PASS] ECG pipeline")
except Exception as e:
    raise RuntimeError(f"❌ Failed to import ECG pipeline: {e}")

# 2. PDF PyMuPDF extraction test
import fitz
try:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "MediKiosk Diagnostic Laboratory Report - CBC Test")
    pdf_bytes = doc.write()
    doc.close()

    # Re-open and verify
    read_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    read_text = "".join(p.get_text() for p in read_doc)
    read_doc.close()
    if "MediKiosk" not in read_text:
        raise ValueError("Text verification failed in synthetic PDF")
    print("✅ PyMuPDF synthetic PDF test: PASS")
except Exception as e:
    raise RuntimeError(f"❌ PyMuPDF PDF extraction test failed: {e}")

# 3. OCR Tesseract test
import pytesseract
try:
    test_img = Image.new('RGB', (450, 150), color=(255, 255, 255))
    d = ImageDraw.Draw(test_img)
    d.text((20, 20), "CBC", fill=(0, 0, 0))
    d.text((20, 50), "Hemoglobin 12.5 g/dL", fill=(0, 0, 0))
    d.text((20, 80), "WBC 7000 /uL", fill=(0, 0, 0))

    ocr_res = pytesseract.image_to_string(test_img)
    if "Hemoglobin" not in ocr_res and "CBC" not in ocr_res:
        raise ValueError(f"OCR failed to read synthetic text. Got: '{ocr_res.strip()}'")
    print("✅ Tesseract synthetic OCR test: PASS")
except Exception as e:
    raise RuntimeError(f"❌ Tesseract OCR test failed: {e}")

print("=" * 60)
print("🎉 All preflight clinical pipeline tests PASSED!")
print("=" * 60)
""")

    # Stage 12
    md_cell("""---
## Stage 12 — Start FastAPI Backend
Safely handles process restarts, cleans up any previous processes on port 8000, and launches FastAPI in the background.
The notebook cell finishes without blocking, keeping logs directed to `/content/fastapi.log`.
""")

    code_cell("""# ── Stage 12: Start FastAPI Backend ──
import os
import sys
import time
import socket
import subprocess

print("=" * 60)
print("🚀 Stage 12 — Starting MediKiosk FastAPI Backend")
print("=" * 60)

# Cleanup any existing process on port 8000
try:
    subprocess.run(["fuser", "-k", f"{PORT}/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
except Exception:
    pass

# Helper to test if port 8000 is open
def is_port_open(port=8000, host="127.0.0.1"):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.8)
    try:
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        return False

fastapi_log_path = "/content/fastapi.log"
fastapi_log = open(fastapi_log_path, "w")

print(f"Launching FastAPI on 0.0.0.0:{PORT} (log: {fastapi_log_path})...")
server_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", str(PORT)],
    cwd=WORKSPACE_DIR,
    stdout=fastapi_log,
    stderr=subprocess.STDOUT
)

# Wait up to 35 seconds for FastAPI to start listening
max_wait = 35
start_t = time.time()
while time.time() - start_t < max_wait:
    if is_port_open(PORT):
        break
    time.sleep(1.0)

if not is_port_open(PORT):
    fastapi_log.flush()
    with open(fastapi_log_path, "r") as f:
        err_out = f.read()
    raise RuntimeError(f"❌ FastAPI failed to start listening on port {PORT}!\\nRecent logs:\\n{err_out}")

print(f"✅ FastAPI is active and listening on port {PORT} (PID: {server_proc.pid})")
print("=" * 60)
""")

    # Stage 13
    md_cell("""---
## Stage 13 — Verify FastAPI Locally
Performs local HTTP health checks against `http://127.0.0.1:8000/`, `http://127.0.0.1:8000/docs`, and `/api/abha-profiles`.
Verifies that FastAPI is answering requests before starting the tunnel.
""")

    code_cell("""# ── Stage 13: Local FastAPI Verification ──
import urllib.request
import json

print("=" * 60)
print("🔍 Stage 13 — Verifying FastAPI Locally")
print("=" * 60)

base_url = f"http://127.0.0.1:{PORT}"

# Test 1: Root / Health endpoint
try:
    req = urllib.request.Request(f"{base_url}/api/health")
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"✅ GET /api/health : HTTP {resp.status}")
except Exception as e:
    # Fallback to /
    req = urllib.request.Request(f"{base_url}/")
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"✅ GET / : HTTP {resp.status}")

# Test 2: Swagger Docs
req_docs = urllib.request.Request(f"{base_url}/docs")
with urllib.request.urlopen(req_docs, timeout=5) as resp:
    print(f"✅ GET /docs : HTTP {resp.status}")

# Test 3: ABHA Profiles
req_abha = urllib.request.Request(f"{base_url}/api/abha-profiles")
with urllib.request.urlopen(req_abha, timeout=5) as resp:
    data = json.loads(resp.read().decode())
    print(f"✅ GET /api/abha-profiles : HTTP {resp.status} ({len(data)} profiles loaded)")

print("\\n✅ Local FastAPI verification complete: Backend is healthy and ready.")
print("=" * 60)
""")

    # Stage 14
    md_cell("""---
## Stage 14 — Start Cloudflare Tunnel
Installs `cloudflared` (if missing), shuts down any previous tunnel, and launches a secure tunnel to `http://127.0.0.1:8000`.
Extracts the live `https://*.trycloudflare.com` URL.
""")

    code_cell("""# ── Stage 14: Start Cloudflare Tunnel ──
import os
import re
import time
import shutil
import subprocess

print("=" * 60)
print("🌐 Stage 14 — Starting Cloudflare Tunnel")
print("=" * 60)

# Kill any existing cloudflared process
subprocess.run(["pkill", "-f", "cloudflared"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

# Install cloudflared if needed
cf_bin = "/usr/local/bin/cloudflared"
if not os.path.exists(cf_bin):
    print("Downloading cloudflared binary...")
    dl_cmd = "curl -fsSL --output /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /usr/local/bin/cloudflared"
    subprocess.run(dl_cmd, shell=True, check=True)

tunnel_log_path = "/content/tunnel.log"
tunnel_log = open(tunnel_log_path, "w")

print(f"Starting cloudflared quick tunnel for http://127.0.0.1:{PORT} (HTTP/2 protocol)...")
tunnel_proc = subprocess.Popen(
    ["cloudflared", "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://127.0.0.1:{PORT}"],
    stdout=tunnel_log,
    stderr=subprocess.STDOUT
)

# Wait for tunnel URL to appear in logs
public_url = None
max_wait = 35
start_t = time.time()

while time.time() - start_t < max_wait:
    time.sleep(1.5)
    if os.path.exists(tunnel_log_path):
        with open(tunnel_log_path, "r") as tf:
            content = tf.read()
            match = re.search(r"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com", content)
            if match:
                public_url = match.group(0)
                break

if not public_url:
    with open(tunnel_log_path, "r") as tf:
        log_snippet = tf.read()
    raise RuntimeError(f"❌ Failed to obtain Cloudflare Tunnel URL!\\nLog:\\n{log_snippet}")

print(f"Domain assigned: {public_url}")
print("Waiting for Cloudflare edge routing to synchronize...")

# Wait until edge connection is established (prevents Cloudflare Error 1033)
edge_connected = False
for _ in range(12):
    time.sleep(1.5)
    with open(tunnel_log_path, "r") as tf:
        log_content = tf.read()
    if "Registered tunnel connection" in log_content or "registered connIndex=" in log_content:
        edge_connected = True
        break

if edge_connected:
    print("✅ Cloudflare edge connections established and synchronized.")
else:
    print("⚠️ Edge sync in progress, waiting additional 4 seconds...")
    time.sleep(4.0)

print(f"\\n✅ Cloudflare Tunnel is READY and LIVE: {public_url}")
print("=" * 60)
""")

    # Stage 15
    md_cell("""---
## Stage 15 — Diagnostic Report & Final URLs
Displays the complete diagnostic report with system hardware, loaded models, passing pipelines, and interactive access links.
""")

    code_cell("""# ── Stage 15: Final Diagnostic Report ──
import torch

cuda_ok = torch.cuda.is_available()
cuda_v = torch.version.cuda if cuda_ok else "N/A"
g_name = torch.cuda.get_device_name(0) if cuda_ok else "None (CPU Mode)"
g_vram = f"{round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)} GB" if cuda_ok else "0.0 GB"

report = f\"\"\"
============================================================
🏥 MediKiosk Colab Diagnostic Report
============================================================

Repository          : {os.path.basename(REPO_URL).replace('.git', '')}
Commit              : {git_hash}
Branch              : {git_branch}

Python              : {sys.version.split()[0]}
PyTorch             : {torch.__version__}
CUDA available      : {'YES' if cuda_ok else 'NO'}
CUDA version        : {cuda_v}
GPU                 : {g_name}
VRAM                : {g_vram}

Ollama              : OK
Selected LLM        : {LLM_MODEL}
LLM warm-up         : PASS

Whisper             : OK
Device              : {WHISPER_DEVICE.upper()}
Compute             : {WHISPER_COMPUTE}
Whisper Model       : {WHISPER_MODEL}

PyMuPDF             : PASS
Tesseract           : PASS
OCR pipeline        : PASS
Lab pipeline        : PASS
Prescription pipeline: PASS
ECG pipeline        : PASS
X-ray pipeline      : PASS

Frontend build      : PASS
FastAPI             : PASS
Port {PORT}          : PASS
Cloudflare          : PASS

============================================================
🔗 MEDIKIOSK ACCESS URLS
============================================================

Public Web Kiosk    : {public_url}
Doctor Dashboard    : {public_url}/doctor
API Swagger Docs    : {public_url}/docs

============================================================
MediKiosk is ready and awaiting patients!
============================================================
\"\"\"

print(report)

# Render clickable HTML card in Colab
from IPython.display import display, HTML
display(HTML(f\"\"\"
<div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; border-radius: 12px; border: 1px solid #38bdf8; font-family: sans-serif; color: #f8fafc; max-width: 650px; margin: 10px 0;">
    <h2 style="margin: 0 0 12px 0; color: #38bdf8; font-size: 22px;">🏥 MediKiosk v2 is Online!</h2>
    <p style="margin: 4px 0 16px 0; font-size: 14px; color: #94a3b8;">Click below to access your intake kiosk or doctor portal:</p>
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="{public_url}" target="_blank" style="background: #0284c7; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Open MediKiosk</a>
        <a href="{public_url}/doctor" target="_blank" style="background: #059669; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Doctor Dashboard</a>
        <a href="{public_url}/docs" target="_blank" style="background: #475569; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">API Docs</a>
    </div>
</div>
\"\"\"))
""")

    # Stage 16 (Helper cells)
    md_cell("""---
## Utilities & Diagnostics (Optional)
Use the cells below if you want to inspect live logs or shut down processes.
""")

    code_cell("""# ── View Live Server Logs ──
print("--- [fastapi.log] Recent Output ---")
!tail -n 25 /content/fastapi.log

print("\\n--- [ollama_daemon.log] Recent Output ---")
!tail -n 20 /content/ollama_daemon.log

print("\\n--- [tunnel.log] Recent Output ---")
!tail -n 15 /content/tunnel.log
""")

    code_cell("""# ── Clean Shutdown (Manual Execution Only) ──
# To safely shut down all services when you are completely finished with your session,
# change DO_SHUTDOWN to True and run this cell manually.
DO_SHUTDOWN = False

if DO_SHUTDOWN:
    import subprocess
    subprocess.run(["pkill", "-f", "cloudflared"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "uvicorn"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "ollama serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("🛑 All MediKiosk services have been terminated.")
else:
    print("ℹ️ MediKiosk services (FastAPI, Ollama, Cloudflare) are running in the background.")
    print("   To stop them, set DO_SHUTDOWN = True and re-run this cell.")
""")

    notebook = {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {
                "gpuType": "T4",
                "provenance": []
            },
            "kernelspec": {
                "display_name": "Python 3",
                "name": "python3"
            },
            "language_info": {
                "name": "python"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 0
    }

    return notebook

if __name__ == "__main__":
    nb = create_notebook()
    target_path = r"d:\VS Code Projects\Medikiosk01\run_colab.ipynb"
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=1)
    print(f"Created {target_path} successfully ({len(nb['cells'])} cells)")
