# AGENTS.md — MediKiosk v2 Agent Instructions & Operational Memory

This workspace contains **MediKiosk v2** (SIH 2026), an offline edge-AI clinical intake kiosk.
Refer to [PROJECT_MEMORY.md](file:///c:/Users/hp/OneDrive/Desktop/folders/sih/PROJECT_MEMORY.md) for full architectural maps and endpoint line ranges.

## 🚀 Performance & Memory Rules (STRICT)

1. **Avoid Context Window Bloat**:
   - `main.py` is ~2,836 lines (153 KB). **NEVER view the whole file**.
   - Always refer to [PROJECT_MEMORY.md](file:///c:/Users/hp/OneDrive/Desktop/folders/sih/PROJECT_MEMORY.md) section 2 for the exact line ranges.
   - Use `view_file` with explicit `StartLine` and `EndLine` (<= 120 lines at a time).

2. **Backend Services & Ports**:
   - **FastAPI**: `http://localhost:8000` (`uvicorn.run(app, host="0.0.0.0", port=8000)`)
   - **Frontend**: `http://localhost:5173` (Vite dev server)
   - **Ollama / llama.cpp**: `http://127.0.0.1:11434` or `http://127.0.0.1:8080` (runs `qwen2.5:7b`)
   - **Perception**: 100% CPU-bound (TorchXRayVision, OpenCV ECG, Sauvola + RapidFuzz)

3. **Database**:
   - SQLite DB: `medikiosk_v2.db`
   - Tables: `PatientRecord`, `VisitHistory`

4. **Frontend Structure**:
   - Routes: Defined in `frontend/src/App.jsx`
   - Patient flow: `Landing` -> `LanguageSelect` -> `PatientID` -> `Consent` -> `ClinicalMode` -> `Kiosk` -> `DocumentScan` -> `RedFlag` / `Specialty` -> `Providers` -> `Summary` -> `PatientFinal`
   - Doctor dashboard: `Dashboard.jsx` at `/doctor`
   - Translations: `frontend/src/utils/translations.js`

5. **Editing Strategy**:
   - Prefer surgical changes via `replace_file_content`.
   - When modifying frontend components, retain styling consistency (`frontend/src/index.css`).
   - Keep answers concise and direct to ensure fast streaming and avoid network timeouts.

6. **Git Remote & Target Repository (STRICT)**:
   - Primary remote: `origin` points to `https://github.com/Shlok180207/Medikiosk-Personal.git`.
   - **NEVER commit or push to Medikiosk01**.
   - **ALWAYS commit and push to Medikiosk-Personal**.
