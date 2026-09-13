"""
MediKiosk Perception - Document OCR & Prescription Parsing Module
100% CPU-Bound: Offline OCR, Sauvola Adaptive Binarization & RapidFuzz Drug Normalization.
Zero GPU VRAM allocation.

Functions:
- parse_document_or_prescription(image_path: str, doc_type: str) -> dict
"""

import os
import re
import json
import cv2
import numpy as np
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from typing import Dict, Any, List, Optional, Tuple, Union
from perception.prescription import (
    sauvola_adaptive_threshold,
    deskew_image,
    normalize_drugs,
    load_drug_lexicon
)

def extract_text_from_pdf(pdf_input: Union[str, bytes]) -> str:
    """Extracts digital text from PDF files using PyMuPDF (fitz)."""
    try:
        import fitz
        if isinstance(pdf_input, bytes):
            doc = fitz.open(stream=pdf_input, filetype="pdf")
        else:
            doc = fitz.open(pdf_input)
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        return text
    except Exception as e:
        return ""

# Common lab test reference intervals for automatic clinical flagging
COMMON_LAB_RANGES = {
    "hemoglobin": {"name": "Hemoglobin (Hb)", "unit": "g/dL", "min": 12.0, "max": 17.5},
    "hb": {"name": "Hemoglobin (Hb)", "unit": "g/dL", "min": 12.0, "max": 17.5},
    "hgb": {"name": "Hemoglobin (Hb)", "unit": "g/dL", "min": 12.0, "max": 17.5},
    "tlc": {"name": "Total Leukocyte Count (TLC/WBC)", "unit": "10^9/L", "min": 4.0, "max": 11.0},
    "wbc": {"name": "Total Leukocyte Count (TLC/WBC)", "unit": "10^9/L", "min": 4.0, "max": 11.0},
    "platelet": {"name": "Platelet Count", "unit": "10^9/L", "min": 150.0, "max": 450.0},
    "plt": {"name": "Platelet Count", "unit": "10^9/L", "min": 150.0, "max": 450.0},
    "rbc": {"name": "Red Blood Cell Count (RBC)", "unit": "10^12/L", "min": 4.2, "max": 5.8},
    "hct": {"name": "Hematocrit / PCV", "unit": "%", "min": 36.0, "max": 50.0},
    "mcv": {"name": "Mean Corpuscular Volume (MCV)", "unit": "fL", "min": 80.0, "max": 100.0},
    "mch": {"name": "Mean Corpuscular Hemoglobin (MCH)", "unit": "pg", "min": 27.0, "max": 34.0},
    "mchc": {"name": "Mean Corpuscular Hb Conc (MCHC)", "unit": "g/dL", "min": 31.5, "max": 36.0},
    "rdw": {"name": "Red Cell Distribution Width (RDW)", "unit": "%", "min": 11.5, "max": 15.0},
    "lym": {"name": "Lymphocytes (LYM)", "unit": "%", "min": 20.0, "max": 50.0},
    "gran": {"name": "Granulocytes / Neutrophils", "unit": "%", "min": 40.0, "max": 75.0},
    "creatinine": {"name": "Serum Creatinine", "unit": "mg/dL", "min": 0.6, "max": 1.2},
    "urea": {"name": "Blood Urea", "unit": "mg/dL", "min": 15.0, "max": 45.0},
    "bilirubin": {"name": "Total Bilirubin", "unit": "mg/dL", "min": 0.2, "max": 1.2},
    "glucose": {"name": "Blood Glucose (Fasting)", "unit": "mg/dL", "min": 70.0, "max": 100.0},
    "sugar": {"name": "Blood Sugar (Random)", "unit": "mg/dL", "min": 70.0, "max": 140.0},
    "hba1c": {"name": "HbA1c", "unit": "%", "min": 4.0, "max": 5.7},
}


def clean_lab_numerical_reading(raw_str: str, min_v: float, max_v: float) -> Tuple[Optional[float], Optional[str]]:
    """
    Cleans and normalizes noisy OCR lab values (especially thermal dot-matrix printouts):
    1. Detects appended 'l' (Low) or 'h' (High) clinical flags.
    2. Recovers missing decimal points:
       - '2971' for MCHC (Ref: 31.5-36.0): Trailing '1' is misread 'l' (Low) -> strips '1' -> '297' -> '29.7' (Low).
       - '4221' for RBC (Ref: 4.2-5.8): Trailing '1' is misread 'l' (Low) -> strips '1' -> '422' -> '4.22' (Low).
       - '1261' for HGB (Ref: 12.0-17.5): Trailing '1' is misread 'l' (Low) -> strips '1' -> '126' -> '12.6' (Low).
       - '532' for RDW (Ref: 37-54): Missing decimal -> '53.2'.
    """
    if not raw_str:
        return None, None

    s = raw_str.strip()
    explicit_flag = None
    if re.search(r'[lL]$', s):
        explicit_flag = "LOW"
        s = re.sub(r'[lL]$', '', s).strip()
    elif re.search(r'[hH]$', s):
        explicit_flag = "HIGH"
        s = re.sub(r'[hH]$', '', s).strip()

    try:
        val = float(s)
    except ValueError:
        m = re.search(r'[0-9]+(?:\.[0-9]+)?', s)
        if m:
            val = float(m.group(0))
        else:
            return None, None

    # Decimal recovery
    # Case 1: Trailing '1' was misread 'l' (Low flag)
    if val > max_v * 2.5 and str(int(val)).endswith('1'):
        candidate = str(int(val))[:-1]
        for div in [10.0, 100.0, 1.0]:
            try:
                c_val = float(candidate) / div
                if 0.35 * min_v <= c_val <= 2.5 * max_v:
                    val = c_val
                    if not explicit_flag and val < min_v:
                        explicit_flag = "LOW"
                    break
            except Exception:
                pass

    # Case 2: Missing decimal point in dot-matrix printout
    if val > max_v * 2.5:
        for div in [10.0, 100.0, 1000.0]:
            c_val = val / div
            if 0.35 * min_v <= c_val <= 2.5 * max_v:
                val = c_val
                break

    return round(val, 2), explicit_flag


def run_cpu_ocr(image_path: str) -> str:
    """Executes CPU OCR via PyMuPDF (for PDFs) or PaddleOCR / pytesseract fallback."""
    if image_path.lower().endswith(".pdf"):
        text = extract_text_from_pdf(image_path)
        if text and len(text.strip()) > 30:
            return text

    # Load image
    img = cv2.imread(image_path)
    if img is None:
        return ""

    h, w = img.shape[:2]
    if w < 1500:
        scale = 1600 / w
        img = cv2.resize(img, (1600, int(h * scale)), interpolation=cv2.INTER_CUBIC)

    # Attempt PaddleOCR (CPU mode)
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False)
        result = ocr.ocr(img, cls=True)
        lines = []
        if result and result[0]:
            for item in result[0]:
                text_part = item[1][0]
                lines.append(text_part)
        extracted = "\n".join(lines)
        if len(extracted.strip()) > 10:
            return extracted
    except Exception:
        pass

    # Fallback to pytesseract with CLAHE contrast enhancement
    try:
        import pytesseract
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast = clahe.apply(gray)
        text_psm4 = pytesseract.image_to_string(contrast, config='--oem 3 --psm 4')
        text_psm3 = pytesseract.image_to_string(contrast, config='--oem 3 --psm 3')
        return text_psm4 if len(text_psm4.split('\n')) >= len(text_psm3.split('\n')) else text_psm3
    except Exception:
        pass

    return ""


def parse_printed_report(image_path: str, raw_text: str = "") -> Dict[str, Any]:
    """
    Parses printed diagnostic reports (CT/MRI/Ultrasound/Lab/PFT):
    - Isolates 'IMPRESSION:', 'FINDINGS:', and 'CONCLUSION:' sections.
    - Extracts numerical lab parameters and flags out-of-range values.
    """
    if not raw_text:
        raw_text = run_cpu_ocr(image_path)

    # 1. Extract Section Impressions (CT / MRI / Ultrasound / Biopsy)
    impression_text = ""
    findings_text = ""

    # Match Impression
    imp_match = re.search(r"(?:IMPRESSION|CONCLUSION|DIAGNOSIS|FINAL IMPRESSION)\s*[:\-]?\s*(.*?)(?=(?:RECOMMENDATION|NOTE|ADVICE|CORRELATION|$|\n\n[A-Z]))", raw_text, re.DOTALL | re.IGNORECASE)
    if imp_match:
        impression_text = imp_match.group(1).strip()
        # Clean multiple newlines
        impression_text = re.sub(r"\s+", " ", impression_text)[:500]

    # Match Findings
    find_match = re.search(r"(?:FINDINGS|OBSERVATIONS|DESCRIPTION)\s*[:\-]?\s*(.*?)(?=(?:IMPRESSION|CONCLUSION|RECOMMENDATION|$|\n\n[A-Z]))", raw_text, re.DOTALL | re.IGNORECASE)
    if find_match:
        findings_text = find_match.group(1).strip()
        findings_text = re.sub(r"\s+", " ", findings_text)[:500]

    # 2. Extract and Flag Numerical Lab Metrics
    flagged_lab_values = []
    diagnoses = []

    for key, ref in COMMON_LAB_RANGES.items():
        # Match pattern like "MCHC: 2971", "MCHC 29.7l", "HGB 1261", "Hemoglobin: 9.5"
        pattern = rf"\b(?:{key})\b\s*[:\-=]?\s*([0-9]+(?:\.[0-9]+)?[a-zA-Z]?)"
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            try:
                raw_token = match.group(1)
                val, explicit_flag = clean_lab_numerical_reading(raw_token, ref["min"], ref["max"])
                if val is not None:
                    name = ref["name"]
                    unit = ref["unit"]
                    min_v, max_v = ref["min"], ref["max"]

                    is_low = (explicit_flag == "LOW") or (val < min_v)
                    is_high = (explicit_flag == "HIGH") or (val > max_v)

                    if is_low:
                        flag_msg = f"Low {name}: {val} {unit} (Ref: {min_v}-{max_v})"
                        flagged_lab_values.append(flag_msg)
                        if "Hemoglobin" in name or key in ["hb", "hgb"]:
                            diagnoses.append("Anemia (Low Hemoglobin)")
                        elif "MCHC" in name:
                            diagnoses.append("Hypochromia (Low MCHC)")
                        elif "MCV" in name:
                            diagnoses.append("Microcytosis (Low MCV)")
                        elif "Platelet" in name or key in ["platelet", "plt"]:
                            diagnoses.append("Thrombocytopenia (Low Platelets)")
                        elif "Leukocyte" in name or key in ["wbc", "tlc"]:
                            diagnoses.append("Leukopenia")
                        elif "RBC" in name or key == "rbc":
                            diagnoses.append("Low Erythrocyte Count (RBC)")
                    elif is_high:
                        flag_msg = f"Elevated {name}: {val} {unit} (Ref: {min_v}-{max_v})"
                        flagged_lab_values.append(flag_msg)
                        if "MCV" in name:
                            diagnoses.append("Macrocytosis (Elevated MCV)")
                        elif "Leukocyte" in name or key in ["wbc", "tlc"]:
                            diagnoses.append("Leukocytosis (Suspected Active Infection / Inflammation)")
                        elif "Creatinine" in name:
                            diagnoses.append("Elevated Serum Creatinine (Renal Impairment)")
                        elif "Glucose" in name or "Sugar" in name:
                            diagnoses.append("Hyperglycemia")
                        elif "Bilirubin" in name:
                            diagnoses.append("Hyperbilirubinemia (Jaundice)")
            except Exception:
                pass

    if impression_text:
        diagnoses.insert(0, f"Clinical Impression: {impression_text[:120]}")
    elif not diagnoses:
        diagnoses.append("Printed Diagnostic Study Reviewed")

    summary = (
        f"Printed Diagnostic Report: {impression_text if impression_text else 'Structured test report processed.'} "
        f"{f'Flagged {len(flagged_lab_values)} abnormal lab parameter(s).' if flagged_lab_values else 'Parameters within normal baseline limits.'}"
    )

    dashboard_payload = {
        "document_type": "Printed Diagnostic / Lab Report",
        "modality": "document",
        "diagnoses": diagnoses,
        "medications": [],
        "flagged_values": flagged_lab_values,
        "document_date": "Report Scan",
        "summary": summary,
        "file_url": f"/{image_path}" if not image_path.startswith("/") else image_path,
        "raw_text": raw_text[:2000]
    }

    return {
        "doc_type": "PRINTED_REPORT",
        "impression": impression_text,
        "findings": findings_text,
        "flagged_lab_values": flagged_lab_values,
        "diagnoses": diagnoses,
        "raw_text": raw_text,
        "dashboard_payload": dashboard_payload
    }


def parse_handwritten_prescription(image_path: str) -> Dict[str, Any]:
    """
    Parses handwritten doctor prescription slips:
    1. Preprocessing: Sauvola adaptive thresholding heals faint ballpoint pen strokes.
    2. OCR: Runs CPU OCR.
    3. Drug Normalization: RapidFuzz matching against data/indian_drug_lexicon.json.
       Tokens with score < 80 are explicitly flagged for physician verification.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load prescription image: {image_path}")

    # Step 1: Sauvola Adaptive Binarization
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    deskewed = deskew_image(gray)
    binarized = sauvola_adaptive_threshold(deskewed, window_size=25, k=0.18)

    # Step 2: OCR on Binarized Pen Strokes
    # Save temporary binarized image for OCR pass
    temp_bin_path = f"{image_path}_sauvola.png"
    cv2.imwrite(temp_bin_path, binarized)
    try:
        raw_text = run_cpu_ocr(temp_bin_path)
    finally:
        if os.path.exists(temp_bin_path):
            try:
                os.remove(temp_bin_path)
            except Exception:
                pass

    if not raw_text:
        # Fallback to raw image OCR
        raw_text = run_cpu_ocr(image_path)

    # Step 3: RapidFuzz Drug Normalization against Indian Lexicon
    drug_items = normalize_drugs(raw_text)

    verified_meds = []
    flagged_unverified = []

    for item in drug_items:
        drug_name = item.get("drug", "")
        strength = item.get("strength", "")
        status = item.get("status", "NORMALIZED")
        score = item.get("score", 0)
        raw_tok = item.get("raw_token", "")

        med_entry = f"{drug_name} {strength}".strip()
        verified_meds.append(med_entry)

        if status == "FLAGGED_FOR_DOCTOR" or score < 80:
            flagged_unverified.append(
                f"⚠️ Unverified Rx Token: '{raw_tok}' -> Matched '{drug_name}' (Confidence: {score}%)"
            )

    diagnoses = ["Doctor Consultation Slip / Prescription"]
    summary = (
        f"Handwritten Prescription (Sauvola CPU): Identified {len(drug_items)} candidate medication(s). "
        f"{len(flagged_unverified)} token(s) flagged for physical slip verification."
    )

    dashboard_payload = {
        "document_type": "Handwritten Prescription",
        "modality": "document",
        "diagnoses": diagnoses,
        "medications": verified_meds,
        "flagged_values": flagged_unverified,
        "document_date": "Prescription Scan",
        "summary": summary,
        "file_url": f"/{image_path}" if not image_path.startswith("/") else image_path,
        "raw_text": raw_text[:2000]
    }

    return {
        "doc_type": "HANDWRITTEN_PRESCRIPTION",
        "medications": verified_meds,
        "normalized_drugs": drug_items,
        "flagged_for_doctor": flagged_unverified,
        "raw_text": raw_text,
        "dashboard_payload": dashboard_payload
    }


def parse_document_or_prescription(image_path: str, doc_type: str = "PRINTED_REPORT") -> Dict[str, Any]:
    """
    Main dispatch function:
    - doc_type in ['PRINTED_REPORT', 'HANDWRITTEN_PRESCRIPTION']
    """
    doc_upper = doc_type.upper()
    if "HANDWRITTEN" in doc_upper or "PRESCRIPTION" in doc_upper:
        return parse_handwritten_prescription(image_path)
    else:
        return parse_printed_report(image_path)
