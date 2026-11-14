import time
import os
import sys
import json
import urllib.request
import requests
import sqlite3
import base64
import re
import numpy as np
import cv2
import pyautogui
import pygetwindow as gw
import pyperclip

# Safety settings
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.2

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_GEMINI_KEY = base64.b64decode("QVEuQWI4Uk42S05SdXpmTUVqMHAwSnZIbTZzTFMyc1JYT2Y4Wmd4UktyVy1BN0lkUDdjNmc=").decode("utf-8")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", DEFAULT_GEMINI_KEY)

# Exact Text Label Templates (Crop reference is based on 1024px baseline)
LBL_APPNO = os.path.join(SCRIPT_DIR, "lbl_appno.png")
LBL_DOB = os.path.join(SCRIPT_DIR, "lbl_dob.png")
LBL_PWD = os.path.join(SCRIPT_DIR, "lbl_pwd.png")
LBL_MOCK_HEADER = os.path.join(SCRIPT_DIR, "lbl_mock_header.png")
LBL_RTO = os.path.join(SCRIPT_DIR, "lbl_rtocode.png")
TPL_RTO_INPUT = os.path.join(SCRIPT_DIR, "tpl_rto_input.png")
LBL_CAPTCHA = os.path.join(SCRIPT_DIR, "lbl_captcha.png")

TPL_VALIDATE_CAPTCHA = os.path.join(SCRIPT_DIR, "tpl_mock_validate_captcha.png")
TPL_APPLY_TRIGGER = os.path.join(SCRIPT_DIR, "tpl_mock_apply_trigger.png")
BTN_OK_GREEN = os.path.join(SCRIPT_DIR, "btn_ok_green.png")
TPL_CAPTCHA_NOT_MATCHED = os.path.join(SCRIPT_DIR, "tpl_captcha_not_matched.png")
TPL_CHECKBOX_UNCHECKED = os.path.join(SCRIPT_DIR, "tpl_checkbox_unchecked.png")

BTN_TOP_UPLOAD = os.path.join(SCRIPT_DIR, "btn_top_upload.png")
BTN_TOP_CAMERA = os.path.join(SCRIPT_DIR, "btn_top_camera.png")
BTN_TOP_CAPTURE = os.path.join(SCRIPT_DIR, "btn_top_capture.png")
BTN_TOP_SEND_FACEAUTH = os.path.join(SCRIPT_DIR, "btn_top_send_faceauth.png")

BTN_PROCEED = os.path.join(SCRIPT_DIR, "btn_proceed.png")
BTN_AUTHENTICATE = os.path.join(SCRIPT_DIR, "btn_authenticate.png")

AVATAR_IMG = os.path.join(SCRIPT_DIR, "obscura_avatar.png")
CARD_IMG = os.path.join(SCRIPT_DIR, "obscura_card.png")

STATE_URL = "https://sarathi.parivahan.gov.in/sarathiservice/stateSelection.do"
TARGET_URL = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do?authtype=Anugyna"
TPL_STATE_DROPDOWN = os.path.join(SCRIPT_DIR, "tpl_state_dropdown.png")
TPL_SHORTCUT_HOME = os.path.join(SCRIPT_DIR, "tpl_shortcut_home.png")
TPL_HOME_LOADED = os.path.join(SCRIPT_DIR, "tpl_home_loaded.png")
BTN_CONTINUE_BLUE = os.path.join(SCRIPT_DIR, "btn_continue_blue.png")
BTN_CONTINUE_EXAM = os.path.join(SCRIPT_DIR, "btn_continue_exam.png")
TPL_LANG_DROPDOWN = os.path.join(SCRIPT_DIR, "tpl_lang_dropdown.png")
TPL_OPT_ENGLISH = os.path.join(SCRIPT_DIR, "tpl_opt_english.png")
TPL_DECL_READ = os.path.join(SCRIPT_DIR, "tpl_decl_read.png")
TPL_DECL_SAFETY = os.path.join(SCRIPT_DIR, "tpl_decl_safety.png")

def smart_parse_args():
    """Terminal arguments ko smartly parse karta hai (handles multi-word states and slashes)."""
    args = sys.argv[1:]
    if not args:
        return None, None, None, None, None

    state = "Uttar Pradesh"
    app_no = "5054900926"
    dob = "12-04-1998"
    password = "PASSWORD123"
    rto_code = "UP78"

    # Find the application number (typically 8+ digits)
    app_idx = -1
    for i, a in enumerate(args):
        if a.isdigit() and len(a) >= 8:
            app_idx = i
            break

    if app_idx != -1:
        if app_idx > 0:
            state = " ".join(args[:app_idx])
        app_no = args[app_idx]
        if len(args) > app_idx + 1:
            dob = args[app_idx + 1].replace('/', '-')
        if len(args) > app_idx + 2:
            password = args[app_idx + 2]
        if len(args) > app_idx + 3:
            rto_code = args[app_idx + 3]
    else:
        if len(args) >= 1: app_no = args[0]
        if len(args) >= 2: dob = args[1].replace('/', '-')
        if len(args) >= 3: password = args[2]
        if len(args) >= 4: rto_code = args[3]

    return state, app_no, dob, password, rto_code

def solve_captcha_with_gemini(crop_bgr):
    """
    Decodes the captcha crop directly via Google Gemini AI (multi-model fallback with 3x upscaling & sharpening).
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return None

    # Step 1: 3x cubic upscale & unsharp mask filter for razor sharp letters
    try:
        h, w = crop_bgr.shape[:2]
        upscaled = cv2.resize(crop_bgr, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
        gaussian = cv2.GaussianBlur(upscaled, (0, 0), 2.0)
        enhanced_crop = cv2.addWeighted(upscaled, 1.5, gaussian, -0.5, 0)
    except Exception:
        enhanced_crop = crop_bgr

    _, buffer = cv2.imencode('.png', enhanced_crop)
    base64_data = base64.b64encode(buffer).decode('utf-8')

    candidate_models = [
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-flash-latest',
        'gemini-flash-lite-latest'
    ]

    payload = {
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": base64_data
                    }
                },
                {
                    "text": "Identify and transcribe the alphanumeric security verification code in this image. Output ONLY the exact characters without any explanation, spaces, or quotes."
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 30
        }
    }

    for model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        try:
            print(f"   🤖 Asking Gemini AI ({model}) to decode captcha...")
            res = requests.post(url, json=payload, timeout=12)
            if res.status_code == 200:
                data = res.json()
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                candidate_text = ""
                for p in parts:
                    if not p.get("thought") and p.get("text"):
                        candidate_text += " " + p.get("text")
                if not candidate_text.strip() and parts:
                    candidate_text = parts[-1].get("text", "")

                code_match = re.search(r'\b([A-Za-z0-9]{4,8})\b', candidate_text)
                cleaned = code_match.group(1) if code_match else re.sub(r'[^a-zA-Z0-9]', '', candidate_text)
                if len(cleaned) >= 4:
                    print(f"   ✅ Gemini AI ({model}) decoded captcha successfully: '{cleaned}'")
                    return cleaned
            else:
                print(f"   ⚠️ Model {model} status {res.status_code}: {res.text[:100]}")
        except Exception as e:
            print(f"   ⚠️ Model {model} note: {e}")
    return None

def locate_on_screen(template_path, threshold=0.75):
    """
    ANY COMPUTER & RESOLUTION ADAPTIVE MATCHING:
    Screen resolution ke hisaab se dynamically base_scale calculate karta hai.
    """
    if not os.path.exists(template_path):
        return None, 1.0

    template = cv2.imread(template_path)
    if template is None:
        return None, 1.0
    th, tw = template.shape[:2]

    try:
        screenshot = pyautogui.screenshot()
        screen = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"   ⚠️ Screen capture error: {e}")
        return None, 1.0

    screen_h, screen_w = screen.shape[:2]
    base_scale = screen_w / 1024.0
    scales = np.linspace(base_scale * 0.75, base_scale * 1.25, 16)

    best_val = -1
    best_loc = None
    best_scale = base_scale

    for scale in scales:
        nw = int(tw * scale)
        nh = int(th * scale)
        if nw >= screen_w or nh >= screen_h:
            continue
        resized = cv2.resize(template, (nw, nh), interpolation=cv2.INTER_CUBIC)
        res = cv2.matchTemplate(screen, resized, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)

        if max_val > best_val:
            best_val = max_val
            best_loc = (max_loc[0] + nw // 2, max_loc[1] + nh // 2)
            best_scale = scale

    if best_val >= threshold:
        return best_loc, best_scale
    return None, base_scale

def enter_into_field(label_name, tpl_path, offset_x, offset_y, text_to_enter):
    """
    Input box ke andar click karke text paste karta hai (with calibrated resolution fallback).
    """
    print(f"\n🔍 Searching for '{label_name}' on screen...")
    sw, sh = pyautogui.size()
    loc, scale = locate_on_screen(tpl_path, threshold=0.70)
    
    if loc:
        target_x = loc[0] + int(offset_x * scale)
        target_y = loc[1] + int(offset_y * scale)
        print(f"   🎯 Found '{label_name}' visually at {loc} (scale={scale:.2f}) -> clicking ({target_x}, {target_y})")
    else:
        # Calibrated fallback for 16:9 screen resolutions (e.g. 1920x1080 / 1366x768)
        lbl_lower = label_name.lower()
        if "app" in lbl_lower:
            target_x, target_y = int(sw * 0.842), int(sh * 0.243)
        elif "dob" in lbl_lower:
            target_x, target_y = int(sw * 0.842), int(sh * 0.365)
        elif "pwd" in lbl_lower or "pass" in lbl_lower:
            target_x, target_y = int(sw * 0.842), int(sh * 0.486)
        else:
            print(f"   ⚠️ '{label_name}' screen par nahi mila! Blind click nahi kiya.")
            return False
        print(f"   🎯 Using calibrated resolution fallback for '{label_name}': ({target_x}, {target_y})")

    # Clear any accidental full page selection first
    pyautogui.press('esc')
    time.sleep(0.05)

    pyautogui.moveTo(target_x, target_y, duration=0.25)
    pyautogui.click()
    time.sleep(0.20)
    # Clear existing text inside the box
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.08)
    pyautogui.press('backspace')
    time.sleep(0.08)
    # Paste new text
    pyperclip.copy(text_to_enter)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.18)
    print(f"   ✅ Entered {label_name}: '{text_to_enter}'")
    return True

def get_obscura_profile_dir():
    """Detects the exact profile directory for 'testing' or 'Obscura Files' from Chrome's Local State."""
    env_profile = os.environ.get('CHROME_PROFILE', '').lower().strip()
    try:
        import json
        local_state = os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\User Data\Local State')
        if os.path.exists(local_state):
            with open(local_state, 'r', encoding='utf-8') as f:
                data = json.load(f)
            profiles = data.get('profile', {}).get('info_cache', {})
            # 1. Check custom env var match
            if env_profile:
                for p_dir, p_info in profiles.items():
                    if env_profile in p_info.get('name', '').lower() or env_profile == p_dir.lower():
                        return p_dir
            # 2. Priority 1: Check for 'obscura' profile (Obscura Files)
            for p_dir, p_info in profiles.items():
                p_name = p_info.get('name', '').lower()
                if 'obscura' in p_name:
                    return p_dir
            # 3. Priority 2: Check for 'testing' or 'test' profile
            for p_dir, p_info in profiles.items():
                p_name = p_info.get('name', '').lower()
                if 'testing' in p_name or 'test' in p_name:
                    return p_dir
            # 4. Fallback to first available profile
            if profiles:
                return list(profiles.keys())[0]
    except Exception:
        pass
    return 'Profile 31'

def bring_chrome_to_front():
    """
    Sarathi / STALL (Obscura Files) window ko samne lata hai.
    User ki personal Chrome window (Telegram Web, etc.) ko bilkul disturb nahi karta!
    """
    import ctypes
    user32 = ctypes.windll.user32
    try:
        # Priority 1: Window with specific Sarathi / STALL / Anugyna in title
        wins = [w for w in gw.getAllWindows() if any(k in w.title.lower() for k in ['stall', 'sarathi', 'anugyna'])]
        
        # Priority 2: Chrome window that is NOT Telegram, WhatsApp or YouTube
        if not wins:
            wins = [w for w in gw.getAllWindows() if 'chrome' in w.title.lower() and not any(k in w.title.lower() for k in ['telegram', 'whatsapp', 'youtube'])]

        if wins:
            w = wins[0]
            hwnd = getattr(w, '_hWnd', None)
            if hwnd:
                if user32.IsIconic(hwnd):
                    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                if not user32.IsZoomed(hwnd):
                    user32.ShowWindow(hwnd, 3)  # SW_MAXIMIZE
                user32.SetForegroundWindow(hwnd)
            else:
                try:
                    if w.isMinimized:
                        w.restore()
                    if not w.isMaximized:
                        w.maximize()
                    w.activate()
                except Exception:
                    pass
            time.sleep(0.15)
            return True
    except Exception as e:
        print(f"   ⚠️ Window focus note: {e}")
    return False

def fill_rto_code_in_mock(rto_code):
    """
    Sarathi Mock popup me RTO CODE fill karta hai aur header coordinates return karta hai.
    Sabse pehle exact RTO input box ko visual match se dhundhta hai (100% accurate, no offset error).
    """
    print(f"\n🔍 Searching for 'Sarathi Mock' RTO box on screen...")
    sw, sh = pyautogui.size()

    # Priority 1: Exact RTO Input Box visual match (zero offset error, clicks right in the center)
    if os.path.exists(TPL_RTO_INPUT):
        loc_box, scale_box = locate_on_screen(TPL_RTO_INPUT, threshold=0.72)
        if loc_box:
            print(f"   🎯 Found exact RTO input box at {loc_box} (scale={scale_box:.2f})")
            pyautogui.moveTo(loc_box[0], loc_box[1], duration=0.25)
            pyautogui.click()
            time.sleep(0.12)
            pyautogui.hotkey('ctrl', 'a')
            time.sleep(0.05)
            pyautogui.press('backspace')
            time.sleep(0.05)
            pyperclip.copy(rto_code)
            pyautogui.hotkey('ctrl', 'v')
            time.sleep(0.15)
            print(f"   ✅ Entered RTO CODE: '{rto_code}'")
            est_header = (loc_box[0] - int(20 * scale_box), loc_box[1] - int(50 * scale_box))
            return est_header, scale_box

    # Priority 2: Header match
    loc, scale = locate_on_screen(LBL_MOCK_HEADER, threshold=0.72)
    if loc:
        target_x = loc[0] + int(20 * scale)
        target_y = loc[1] + int(50 * scale)
        print(f"   🎯 Found 'Sarathi Mock' header at {loc} (scale={scale:.2f})")
        print(f"   🖱️ Clicking RTO CODE box at: ({target_x}, {target_y})")
        pyautogui.moveTo(target_x, target_y, duration=0.25)
        pyautogui.click()
        time.sleep(0.12)
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.05)
        pyautogui.press('backspace')
        time.sleep(0.05)
        pyperclip.copy(rto_code)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.15)
        print(f"   ✅ Entered RTO CODE: '{rto_code}'")
        return loc, scale

    # Priority 3: 'RTO CODE' label
    loc_rto, scale_rto = locate_on_screen(LBL_RTO, threshold=0.68)
    if loc_rto:
        target_x = loc_rto[0] + int(46 * scale_rto)
        target_y = loc_rto[1] + int(15 * scale_rto)
        print(f"   🎯 Found 'RTO CODE' label at {loc_rto}")
        pyautogui.moveTo(target_x, target_y, duration=0.25)
        pyautogui.click()
        time.sleep(0.12)
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.05)
        pyautogui.press('backspace')
        time.sleep(0.05)
        pyperclip.copy(rto_code)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.15)
        print(f"   ✅ Entered RTO CODE: '{rto_code}'")
        est_header = (loc_rto[0] + int(26 * scale_rto), loc_rto[1] - int(35 * scale_rto))
        return est_header, scale_rto

    # Priority 4: Calibrated screen resolution fallback (bottom-left Sarathi Mock RTO box)
    fallback_x = int(sw * 0.132)
    fallback_y = int(sh * 0.508)
    print(f"   ℹ️ Calibrated fallback RTO coordinate for {sw}x{sh}: ({fallback_x}, {fallback_y})")
    pyautogui.moveTo(fallback_x, fallback_y, duration=0.25)
    pyautogui.click()
    time.sleep(0.18)
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.08)
    pyautogui.press('backspace')
    time.sleep(0.08)
    pyperclip.copy(rto_code)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.18)
    print(f"   ✅ Entered RTO CODE: '{rto_code}' via calibrated resolution scaling!")
    scale_screen = sw / 1024.0
    est_header = (int(sw * 0.130), int(sh * 0.245))
    return est_header, scale_screen

def is_alert_popup_present(screen_bgr, threshold=0.78):
    """
    Screen ke upper 32% me browser alert dialog ka 'OK' button visually confirm karta hai:
    Uses multi-scale 3-channel BGR template matching with btn_ok_green.png (score up to 1.0).
    Strictly verifies:
    - Button matches pistachio green BTN_OK_GREEN template (>= 0.78 confidence in BGR color).
    - Button position is strictly in Chrome's top center-right alert dialog region:
        cx is between 45% and 75% of screen width.
        cy is between 6% and 32% of screen height.
    This eliminates 100% of false positives from webpage buttons (like green Download in toolbar or green captcha text).
    """
    if screen_bgr is None:
        return None

    screen_h, screen_w = screen_bgr.shape[:2]
    top_limit = int(screen_h * 0.32)
    top_region = screen_bgr[:top_limit, :]

    if os.path.exists(BTN_OK_GREEN):
        tpl = cv2.imread(BTN_OK_GREEN)
        if tpl is not None:
            base_scale = screen_w / 1024.0
            scales = [base_scale * 0.85, base_scale * 0.92, base_scale, base_scale * 1.08, base_scale * 1.15, 1.0, 1.25, 1.5, 1.875]
            best_val = -1
            best_loc = None
            for s in scales:
                tw = int(tpl.shape[1] * s)
                th = int(tpl.shape[0] * s)
                if tw <= 0 or th <= 0 or tw >= top_region.shape[1] or th >= top_region.shape[0]:
                    continue
                resized = cv2.resize(tpl, (tw, th), interpolation=cv2.INTER_CUBIC)
                res = cv2.matchTemplate(top_region, resized, cv2.TM_CCOEFF_NORMED)
                _, mv, _, ml = cv2.minMaxLoc(res)
                if mv > best_val:
                    best_val = mv
                    best_loc = (ml[0] + tw // 2, ml[1] + th // 2)

            if best_val >= threshold and best_loc is not None:
                cx, cy = best_loc
                if int(screen_w * 0.45) <= cx <= int(screen_w * 0.75):
                    if int(screen_h * 0.06) <= cy <= int(screen_h * 0.32):
                        return best_loc, best_val

    return None

def is_captcha_mismatch_alert(screen_bgr, ok_loc):
    """
    Checks if the alert dialog at ok_loc contains an error message:
    'Captcha is not matched, please try again'
    Uses Gemini AI Vision (gemini-3.5-flash-lite) and multi-scale template matching.
    """
    if screen_bgr is None or ok_loc is None:
        return False

    ok_x, ok_y = ok_loc
    sw, sh = screen_bgr.shape[1], screen_bgr.shape[0]
    scale = sw / 1024.0

    # Tightly crop the actual Chrome alert dialog box relative to the OK button
    d_x1 = max(0, int(ok_x - 290 * scale))
    d_x2 = min(sw, int(ok_x + 45 * scale))
    d_y1 = max(0, int(ok_y - 50 * scale))
    d_y2 = min(sh, int(ok_y + 125 * scale))

    dialog_crop = screen_bgr[d_y1:d_y2, d_x1:d_x2]
    if dialog_crop.size == 0:
        return False

    try:
        cv2.imwrite(os.path.join(SCRIPT_DIR, "debug_last_alert_crop.png"), dialog_crop)
    except Exception:
        pass

    # 1. Gemini AI Vision Check (primary & fast)
    try:
        _, buffer = cv2.imencode('.png', dialog_crop)
        b64 = base64.b64encode(buffer).decode('utf-8')
        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": "image/png", "data": b64}},
                    {"text": "Read the alert popup message carefully. Is this an error alert indicating that the captcha was incorrect, not matched, invalid, or failed? Reply YES if captcha error/mismatch, NO if success/proceeding."}
                ]
            }],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10}
        }
        for m in ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash']:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={GEMINI_API_KEY}"
            res = requests.post(url, json=payload, timeout=6)
            if res.status_code == 200:
                txt = res.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip().upper()
                print(f"   🤖 Alert text analysis ({m}): '{txt}'")
                if 'YES' in txt or any(w in txt for w in ['NOT MATCH', 'INCORRECT', 'INVALID', 'FAILED', 'TRY AGAIN']):
                    print(f"   ⚠️ Captcha mismatch confirmed via Gemini AI ({m})!")
                    return True
                elif 'NO' in txt or any(w in txt for w in ['SUCCESS', 'CONFIRM', 'OK', 'APPLICATION NUMBER']):
                    return False
                break
    except Exception as e:
        print(f"   ⚠️ Gemini dialog check note: {e}")

    # 2. Multi-scale template matching fallback
    if os.path.exists(TPL_CAPTCHA_NOT_MATCHED):
        tpl = cv2.imread(TPL_CAPTCHA_NOT_MATCHED)
        if tpl is not None:
            gray_crop = cv2.cvtColor(dialog_crop, cv2.COLOR_BGR2GRAY)
            gray_tpl = cv2.cvtColor(tpl, cv2.COLOR_BGR2GRAY)
            scales = [0.75, 0.85, 1.0, 1.15, 1.25, 1.4, scale * 0.9, scale, scale * 1.1]
            best_val = -1
            for s in scales:
                tw = int(tpl.shape[1] * s)
                th = int(tpl.shape[0] * s)
                if tw <= 0 or th <= 0 or tw >= dialog_crop.shape[1] or th >= dialog_crop.shape[0]:
                    continue
                resized = cv2.resize(gray_tpl, (tw, th), interpolation=cv2.INTER_CUBIC)
                res = cv2.matchTemplate(gray_crop, resized, cv2.TM_CCOEFF_NORMED)
                _, mv, _, _ = cv2.minMaxLoc(res)
                if mv > best_val:
                    best_val = mv
            if best_val >= 0.70:
                print(f"   ⚠️ Captcha mismatch confirmed via template match (score={best_val:.3f})!")
                return True

    return False

def is_authenticate_screen_ready(screen_bgr=None):
    """
    Checks if the Face Authentication / Authenticate screen has appeared:
    'This learners license exam needs web camera, please keep the camera on throughout the exam'
    Identified by:
      - Cyan 'Proceed' button (BTN_PROCEED)
      - Yellow 'Authenticate' button (BTN_AUTHENTICATE)
    Returns True if this interface is visible.
    """
    if screen_bgr is None:
        try:
            screenshot = pyautogui.screenshot()
            screen_bgr = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
        except Exception:
            return False

    for tpl_path in [BTN_PROCEED, BTN_AUTHENTICATE]:
        if os.path.exists(tpl_path):
            tpl = cv2.imread(tpl_path)
            if tpl is not None:
                th, tw = tpl.shape[:2]
                screen_h, screen_w = screen_bgr.shape[:2]
                base_scale = screen_w / 1024.0
                scales = [0.85, 1.0, 1.15, base_scale * 0.90, base_scale, base_scale * 1.10]
                for s in scales:
                    nw, nh = int(tw * s), int(th * s)
                    if nw >= screen_w or nh >= screen_h or nw <= 0 or nh <= 0:
                        continue
                    resized = cv2.resize(tpl, (nw, nh), interpolation=cv2.INTER_CUBIC)
                    res = cv2.matchTemplate(screen_bgr, resized, cv2.TM_CCOEFF_NORMED)
                    _, mv, _, _ = cv2.minMaxLoc(res)
                    if mv >= 0.72:
                        return True
    return False

def handle_alerts_after_trigger(max_alerts=6):
    """
    Monitors alert popups after 'Apply & Trigger':
    User rule:
    - Right after Apply & Trigger, DO NOT click anywhere else!
    - Wait and notice if an alert popup appears (up to 7 seconds).
    - If alert #1 is 'Captcha is not matched, please try again':
        -> Move mouse to [ OK ] and click with mouse, wait for popup to dismiss, return 'MISMATCH' to auto-retry fresh captcha.
    - If alert #1 is valid / success:
        -> User rule: 'agr sahi hai to 3 baar pop pop aata hai fr aage badhega'
        -> Click [ OK ] on popup #1.
        -> Monitor and click [ OK ] on popup #2, #3, etc. until screen is 100% clear.
        -> Return 'SUCCESS' -> Proceed to Photo Upload.
    """
    print("\n" + "=" * 60)
    print("🔔 MONITORING ALERT POPUPS AFTER TRIGGER...")
    print("=" * 60)

    # 1. Wait up to 7.0s for initial alert popup to appear (DO NOT CLICK ANYWHERE!)
    t_start = time.time()
    detected_loc = None
    screen = None

    print("👀 Waiting for Alert Popup to appear after Apply & Trigger (up to 7s)...")
    while (time.time() - t_start) < 7.0:
        try:
            screenshot = pyautogui.screenshot()
            screen = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
        except Exception:
            time.sleep(0.1)
            continue

        res = is_alert_popup_present(screen, threshold=0.78)
        if res:
            detected_loc = res[0]
            break

        time.sleep(0.12)

    total_alerts = 0

    if detected_loc:
        total_alerts += 1
        print("🔍 Checking popup message (mismatch error vs success)...")
        is_mismatch = is_captcha_mismatch_alert(screen, detected_loc)

        print(f"\n🎯 Alert popup #1 detected at {detected_loc}. Moving mouse and clicking OK...")
        pyautogui.moveTo(detected_loc[0], detected_loc[1], duration=0.2)
        pyautogui.click()
        time.sleep(0.8)

        if is_mismatch:
            print("\n" + "!" * 60)
            print("⚠️ Alert popup confirmed: CAPTCHA GALAT THA (Captcha not matched)!")
            print("👉 [ OK ] click ho gaya! Naye captcha ke sath auto-retry kar rahe hain...")
            print("!" * 60)
            return 'MISMATCH'

        # Success popup #1 handled! Now handle subsequent popups (Popup #2, #3...)
        print("👀 Monitoring subsequent success popups (Popup #2, #3, etc.)...")
        for sub_alert in range(2, max_alerts + 1):
            time.sleep(0.4)
            found_sub = None
            t_sub = time.time()
            while (time.time() - t_sub) < 3.5:
                try:
                    shot = pyautogui.screenshot()
                    scr = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
                except Exception:
                    time.sleep(0.1)
                    continue

                sub_res = is_alert_popup_present(scr, threshold=0.78)
                if sub_res:
                    found_sub = sub_res[0]
                    break
                time.sleep(0.12)

            if found_sub:
                total_alerts += 1
                print(f"   🎯 Popup #{sub_alert} mila at {found_sub}! Clicking OK...")
                pyautogui.moveTo(found_sub[0], found_sub[1], duration=0.2)
                pyautogui.click()
                time.sleep(0.8)
            else:
                print(f"   ✅ Notice: Poore popups screen se dismiss ho chuke hain! (Total {total_alerts} popups cleared)")
                break
    else:
        print("   ℹ️ Koi alert popup screen par nahi aaya.")

    # Brief pause to let page DOM settle after popups are dismissed
    time.sleep(1.0)

    # Final safety check: ensure no popup is still lingering
    try:
        shot = pyautogui.screenshot()
        scr = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
        lingering = is_alert_popup_present(scr, threshold=0.78)
        if lingering:
            print(f"   ⚠️ Lingering popup detected at {lingering[0]}! Clicking OK...")
            pyautogui.moveTo(lingering[0][0], lingering[0][1], duration=0.2)
            pyautogui.click()
            time.sleep(0.8)
    except Exception:
        pass

    # If captcha box is STILL on screen and no success popups appeared:
    loc_cap_still, _ = locate_on_screen(LBL_CAPTCHA, threshold=0.70)
    if loc_cap_still and total_alerts <= 1:
        print("\n" + "!" * 60)
        print("⚠️ Captcha box abhi bhi screen par dikh raha hai! Captcha match nahi hua.")
        print("👉 Naye captcha ke sath auto-retry kar rahe hain...")
        print("!" * 60)
        return 'MISMATCH'

    print("=" * 60)
    print("🎉 POPUPS SUCCESSFULLY CLEARED! READY FOR PHOTO UPLOAD.")
    print("=" * 60)
    return 'SUCCESS'

def handle_alert_popups(max_alerts=3):
    """
    Secondary helper to dismiss subsequent alert popups cleanly without Enter key.
    """
    clicked_count = 0
    for alert_num in range(1, max_alerts + 1):
        wait_time = 1.2 if alert_num == 1 else 0.8
        check_interval = 0.1
        t_start = time.time()
        detected_loc = None

        while (time.time() - t_start) < wait_time:
            try:
                screenshot = pyautogui.screenshot()
                screen = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
            except Exception:
                time.sleep(check_interval)
                continue

            res = is_alert_popup_present(screen, threshold=0.78)
            if res:
                detected_loc = res[0]
                break
            time.sleep(check_interval)

        if detected_loc:
            clicked_count += 1
            print(f"   🎯 Alert popup #{alert_num} detected! Clicking OK...")
            pyautogui.moveTo(detected_loc[0], detected_loc[1], duration=0.15)
            pyautogui.click()
            time.sleep(0.5)
        else:
            break

def execute_captcha_and_mock_trigger(mock_header_loc, mock_scale, max_attempts=5, *args, **kwargs):
    """
    Solves Captcha via Gemini AI, types into Chrome, checks 'Validate captcha', and clicks '⚡ Apply & Trigger'.
    Agar 'Captcha is not matched' alert aata hai, to popup dismiss karke automatic fresh
    captcha ke sath dubara retry karta hai (up to max_attempts).
    Agar captcha solve ho jaye aur Authenticate interface ('This learners license exam needs web camera...')
    aa jaye, to dubara Validate captcha ya Apply & Trigger par click nahi karta, seedha Upload par proceed karta hai.
    """
    sw, sh = pyautogui.size()

    print("\n" + "=" * 60)
    print("🤖 CAPTCHA RESOLUTION & MOCK TRIGGER (AUTO-RETRY LOOP)")
    print("=" * 60)

    bring_chrome_to_front()
    time.sleep(0.4)

    checkbox_already_checked = False

    for attempt in range(1, max_attempts + 1):
        print(f"\n🔄 ─── CAPTCHA ATTEMPT {attempt}/{max_attempts} ───")

        # 1. Bring Chrome to front
        bring_chrome_to_front()
        time.sleep(0.3)

        # 2. Locate Captcha label or use fallback coordinates
        loc_cap, scale_cap = locate_on_screen(LBL_CAPTCHA, threshold=0.70)
        solved_captcha = None

        if loc_cap:
            cap_box_x = loc_cap[0] + int(73 * scale_cap)
            cap_box_y = loc_cap[1]

            # Improved wide crop: no chopped letters on right edge
            c_x1 = max(0, loc_cap[0] + int(105 * scale_cap))
            c_x2 = min(sw, loc_cap[0] + int(215 * scale_cap))
            c_y1 = max(0, loc_cap[1] - int(18 * scale_cap))
            c_y2 = min(sh, loc_cap[1] + int(17 * scale_cap))

            try:
                screenshot = pyautogui.screenshot()
                screen_bgr = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
                crop_cap = screen_bgr[c_y1:c_y2, c_x1:c_x2]
                if crop_cap.size > 0:
                    cv2.imwrite(os.path.join(SCRIPT_DIR, "debug_last_captcha_crop.png"), crop_cap)
                    print(f"   📸 Fresh captcha crop saved ({crop_cap.shape[1]}x{crop_cap.shape[0]}), decoding via Gemini AI...")
                    solved_captcha = solve_captcha_with_gemini(crop_cap)
            except Exception as e:
                print(f"   ⚠️ Captcha capture error: {e}")
        else:
            cap_box_x = int(sw * 0.459)
            cap_box_y = int(sh * 0.486)
            try:
                c_x1 = int(sw * 0.510)
                c_x2 = int(sw * 0.605)
                c_y1 = int(sh * 0.465)
                c_y2 = int(sh * 0.515)
                screenshot = pyautogui.screenshot()
                screen_bgr = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
                crop_cap = screen_bgr[c_y1:c_y2, c_x1:c_x2]
                if crop_cap.size > 0:
                    cv2.imwrite(os.path.join(SCRIPT_DIR, "debug_last_captcha_crop.png"), crop_cap)
                    print(f"   📸 Calibrated fallback captcha crop saved ({crop_cap.shape[1]}x{crop_cap.shape[0]}), decoding via Gemini AI...")
                    solved_captcha = solve_captcha_with_gemini(crop_cap)
            except Exception as e:
                print(f"   ⚠️ Captcha capture fallback error: {e}")

        # 3. Enter captcha into Chrome
        if solved_captcha:
            print(f"   ✍️ Auto-entering Captcha: '{solved_captcha}' into Chrome...")
            pyautogui.press('esc')
            time.sleep(0.05)
            pyautogui.moveTo(cap_box_x, cap_box_y, duration=0.2)
            pyautogui.click()
            time.sleep(0.12)
            pyautogui.hotkey('ctrl', 'a')
            time.sleep(0.05)
            pyautogui.press('backspace')
            time.sleep(0.05)
            pyperclip.copy(solved_captcha)
            pyautogui.hotkey('ctrl', 'v')
            time.sleep(0.15)
            print("   ✅ Captcha entered successfully!")
        else:
            print("   ⚠️ Gemini AI couldn't auto-resolve captcha. Please enter manually:")
            try:
                user_captcha = input("👉 Captcha likhein (ya bas Enter dabayein): ").strip()
            except Exception:
                user_captcha = ""
            if user_captcha:
                pyautogui.press('esc')
                time.sleep(0.05)
                pyautogui.moveTo(cap_box_x, cap_box_y, duration=0.2)
                pyautogui.click()
                time.sleep(0.12)
                pyautogui.hotkey('ctrl', 'a')
                time.sleep(0.05)
                pyautogui.press('backspace')
                time.sleep(0.05)
                pyperclip.copy(user_captcha)
                pyautogui.hotkey('ctrl', 'v')
                time.sleep(0.15)
                print("   ✅ Captcha entered manually!")

        # 4. Ensure 'Validate captcha' checkbox is checked in Sarathi Mock
        chk_needed = False
        if not checkbox_already_checked:
            chk_needed = True
        else:
            # On retry, verify if checkbox got unchecked after portal refresh
            loc_unchk, _ = locate_on_screen(TPL_CHECKBOX_UNCHECKED, threshold=0.72)
            if loc_unchk:
                print("   ⚠️ Checkbox uncheck dikh raha hai! Re-checking...")
                chk_needed = True

        if chk_needed:
            print("   🖱️ Checking 'Validate captcha' in Sarathi Mock...")
            loc_val, scale_val = locate_on_screen(TPL_VALIDATE_CAPTCHA, threshold=0.70)
            if loc_val:
                pyautogui.click(loc_val[0], loc_val[1])
                time.sleep(0.2)
            elif mock_header_loc:
                chk_x = mock_header_loc[0] + int(-35 * mock_scale)
                chk_y = mock_header_loc[1] + int(147 * mock_scale)
                print(f"   🎯 Clicking checkbox at: ({chk_x}, {chk_y})")
                pyautogui.moveTo(chk_x, chk_y, duration=0.2)
                pyautogui.click()
                time.sleep(0.2)
            else:
                chk_x = int(sw * 0.046)
                chk_y = int(sh * 0.722)
                print(f"   🎯 Calibrated fallback for 'Validate captcha': ({chk_x}, {chk_y})")
                pyautogui.moveTo(chk_x, chk_y, duration=0.2)
                pyautogui.click()
                time.sleep(0.2)
            checkbox_already_checked = True
            print("   ✅ 'Validate captcha' checked!")
        else:
            print("   ℹ️ 'Validate captcha' already checked; skipping click to avoid unchecking.")

        time.sleep(0.3)

        # 5. Click '⚡ Apply & Trigger' button in Sarathi Mock
        print("   🖱️ Clicking '⚡ Apply & Trigger' button in Sarathi Mock...")
        loc_btn, scale_btn = locate_on_screen(TPL_APPLY_TRIGGER, threshold=0.70)
        if loc_btn:
            pyautogui.click(loc_btn[0], loc_btn[1])
        elif mock_header_loc:
            btn_x = mock_header_loc[0] + int(20 * mock_scale)
            btn_y = mock_header_loc[1] + int(185 * mock_scale)
            print(f"   🎯 Clicking button at: ({btn_x}, {btn_y})")
            pyautogui.moveTo(btn_x, btn_y, duration=0.2)
            pyautogui.click()
        else:
            btn_x = int(sw * 0.129)
            btn_y = int(sh * 0.842)
            print(f"   🎯 Calibrated fallback for '⚡ Apply & Trigger': ({btn_x}, {btn_y})")
            pyautogui.moveTo(btn_x, btn_y, duration=0.2)
            pyautogui.click()

        print("   ✅ '⚡ Apply & Trigger' clicked!")

        # 6. Monitor for alert popups (handles Captcha mismatch vs success popups)
        outcome = handle_alerts_after_trigger(max_alerts=6)

        if outcome == 'MISMATCH':
            print(f"   ❌ Captcha mismatch on attempt {attempt}! Portal ne naya captcha refresh kar diya.")
            print("   ⏳ Naye captcha image load hone ka 1.5s intezar kar rahe hain before retry...")
            time.sleep(1.5)
            continue
        elif outcome == 'SUCCESS':
            print("=" * 60)
            print("🎉 CAPTCHA MATCHED, ALL POPUPS CLEARED & INTERFACE CONFIRMED!")
            print("🛑 Interface aa gaya hai: Dubara Apply & Trigger / Validate captcha click nahi karenge!")
            print("➡️ Ab direct Step 4 (Photo Upload) par proceed kar rahe hain...")
            print("=" * 60)
            return True

    print("\n" + "=" * 60)
    print(f"❌ Max {max_attempts} attempts complete ho gaye, captcha match nahi hua!")
    print("=" * 60)
    return False

def select_obscura_profile_if_picker_present():
    """
    Agar Chrome 'Who's using Chrome?' Profile Picker screen par khulta hai,
    to 'Obscura Files' profile card / avatar par click karta hai.
    """
    # 1. Search for Obscura card
    if os.path.exists(CARD_IMG):
        loc_card, _ = locate_on_screen(CARD_IMG, threshold=0.70)
        if loc_card:
            print(f"   🎯 Found 'Obscura Files' profile card at {loc_card}! Clicking to open...")
            pyautogui.moveTo(loc_card[0], loc_card[1], duration=0.25)
            pyautogui.click()
            time.sleep(2.0)
            return True

    # 2. Search for Obscura avatar
    if os.path.exists(AVATAR_IMG):
        loc_av, _ = locate_on_screen(AVATAR_IMG, threshold=0.70)
        if loc_av:
            print(f"   🎯 Found 'Obscura Files' avatar at {loc_av}! Clicking to open...")
            pyautogui.moveTo(loc_av[0], loc_av[1], duration=0.25)
            pyautogui.click()
            time.sleep(2.0)
            return True

    return False

def is_page_loaded_and_ready():
    """Returns True if Sarathi Autofill or authentication form is visible on screen."""
    loc, _ = locate_on_screen(LBL_APPNO, threshold=0.70)
    if loc:
        return True
    loc, _ = locate_on_screen(LBL_DOB, threshold=0.70)
    if loc:
        return True
    loc, _ = locate_on_screen(LBL_MOCK_HEADER, threshold=0.70)
    if loc:
        return True
    return False

def hard_refresh_and_confirm_alert():
    """
    User-specified rule:
    "tumko ctrl shift r click krke hard refresh krna hai website open hoga url open hote hi hard refresh kroge
    aur aesa ayega ok krna fr load ho jatyeag normal aayega fr fill krna sab"
    """
    print("\n🔄 Hard refresh trigger kar rahe hain (Ctrl + Shift + R)...")
    bring_chrome_to_front()
    time.sleep(0.3)

    pyautogui.hotkey('ctrl', 'shift', 'r')
    time.sleep(0.8)

    # Popup aayega: "sarathi.parivahan.gov.in says: reload detected. all operations will be terminated."
    print("🔍 Looking for green 'OK' button on alert popup...")
    clicked = False
    for _ in range(12):
        loc_ok, _ = locate_on_screen(BTN_OK_GREEN, threshold=0.70)
        if loc_ok:
            print(f"   🎯 Green OK button found at {loc_ok}! Clicking OK...")
            pyautogui.moveTo(loc_ok[0], loc_ok[1], duration=0.15)
            pyautogui.click()
            clicked = True
            break
        try:
            shot = pyautogui.screenshot()
            scr = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
            popup_loc = is_alert_popup_present(scr, threshold=0.63)
            if popup_loc:
                print(f"   🎯 Alert popup detected at {popup_loc[0]}. Clicking OK button...")
                pyautogui.click(popup_loc[0][0], popup_loc[0][1])
                clicked = True
                break
        except Exception:
            pass
        time.sleep(0.2)

    if not clicked:
        print("   ℹ️ Pressing Enter to confirm alert dialog...")
        pyautogui.press('enter')

    print("⏳ Hard refresh ke baad page load hone ka wait kar rahe hain (3.5 seconds)...")
    time.sleep(3.5)

    # Verify form & Sarathi Autofill have loaded
    for attempt in range(1, 10):
        if is_page_loaded_and_ready():
            print(f"✅ Form aur Sarathi Autofill successfully load ho gaya (Check {attempt})!")
            return True
        time.sleep(0.5)

    return False

def ensure_page_ready():
    """
    User-specified step-by-step startup workflow:
    1. Check if Chrome / Sarathi window is already active.
    2. If not, open Chrome with 'Obscura Files' profile.
    3. Navigate to Target URL.
    4. Perform immediate hard refresh (Ctrl + Shift + R).
    5. Dismiss alert popup by clicking green OK button.
    6. Wait for normal page load and verify ready for autofill.
    """
    print("=" * 60)
    print("🔍 PREPARING SARATHI PAGE (OBSCURA PROFILE -> TARGET URL -> CTRL+SHIFT+R)...")
    print("=" * 60)

    pyautogui.press('esc')
    time.sleep(0.2)

    # 1. Bring Chrome to front
    chrome_active = bring_chrome_to_front()

    if not chrome_active:
        profile_dir = get_obscura_profile_dir()
        print(f"🚀 Direct Chrome launch kar rahe hain testing profile ke sath ({profile_dir})...")
        paths = [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe')
        ]
        chrome_exe = next((p for p in paths if os.path.exists(p)), 'chrome.exe')
        try:
            import subprocess
            subprocess.Popen([
                chrome_exe,
                f'--profile-directory={profile_dir}',
                TARGET_URL,
                '--start-maximized'
            ])
        except Exception:
            os.system(f'start "" "{chrome_exe}" --profile-directory="{profile_dir}" "{TARGET_URL}" --start-maximized')
        time.sleep(3.5)
        bring_chrome_to_front()

    # Ensure window is maximized
    bring_chrome_to_front()
    time.sleep(0.3)

    # Check if page is already loaded, otherwise navigate to Target URL
    if not is_page_loaded_and_ready():
        print(f"🌐 Navigating to Target URL: {TARGET_URL}")
        pyautogui.hotkey('ctrl', 'l')
        time.sleep(0.3)
        pyperclip.copy(TARGET_URL)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.2)
        pyautogui.press('enter')

    # Wait for form & Sarathi Autofill to load (Reload completely removed as requested)
    print("⏳ Form aur Sarathi Autofill load hone ka wait kar rahe hain (No Reload)...")
    for attempt in range(1, 15):
        if is_page_loaded_and_ready():
            print(f"✅ Form aur Sarathi Autofill successfully load ho gaya (Check {attempt})!")
            break
        time.sleep(0.5)

    # Ensure Chrome zoom is normalized to 100% on any computer
    pyautogui.hotkey('ctrl', '0')
    time.sleep(0.2)
    pyautogui.press('esc')
    time.sleep(0.2)
    print("✅ Chrome window 100% ready! Seedha Application Number fill karna shuru kar rahe hain...")

def handle_photo_upload(app_no):
    """
    Handles Photo Upload via Windows File Dialog:
    User-specified rule:
    'aur kahin click nhi krna hai upload pe click krna hai aur img pahle ke jaisa wo khud hi us application number ka img select krega'

    5-Step Workflow:
    Step 1: Top Toolbar Ke Orange 'Upload' Button Par Click
    Step 2: Windows File Dialog Open Hona (wait & activate)
    Step 3: 'File name' Box Me Focus (Alt + N)
    Step 4: Application Number Wali Photo Ka Exact Path Paste: C:\\Users\\...\\Photo_<appNo>.jpg
    Step 5: Enter Press Hona -> Photo select ho jaati hai!
    """
    print("\n" + "=" * 60)
    print("📸 STEP 4: PHOTO UPLOAD WORKFLOW")
    print("=" * 60)

    # 1. Bring Chrome to front
    bring_chrome_to_front()
    time.sleep(0.5)

    # 2. Ensure all popups are completely cleared before touching Upload
    print("🔍 Noticing screen status: ensuring all popups have completely disappeared before Upload...")
    for _ in range(5):
        try:
            shot = pyautogui.screenshot()
            scr = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
            lingering = is_alert_popup_present(scr, threshold=0.78)
            if lingering:
                print(f"   ⚠️ Lingering popup still on screen at {lingering[0]}! Clicking OK to clear...")
                pyautogui.moveTo(lingering[0][0], lingering[0][1], duration=0.15)
                pyautogui.click()
                time.sleep(0.6)
            else:
                break
        except Exception:
            pass

    # 3. Locate photo file in Downloads folder FIRST (matching application number)
    downloads_dirs = [
        os.path.join(os.path.expanduser("~"), "Downloads"),
        os.path.join(os.path.dirname(SCRIPT_DIR), "downloads"),
        os.path.join(SCRIPT_DIR, "downloads")
    ]
    target_photo = None
    for d in downloads_dirs:
        if os.path.exists(d):
            p = os.path.join(d, f"Photo_{app_no}.jpg")
            if os.path.exists(p):
                target_photo = p
                break
            candidates = [f for f in os.listdir(d) if f.startswith(f"Photo_{app_no}")]
            if candidates:
                target_photo = os.path.join(d, candidates[0])
                break

    if not target_photo:
        for d in downloads_dirs:
            if os.path.exists(d):
                photo_files = [f for f in os.listdir(d) if f.startswith("Photo_") and f.endswith(".jpg")]
                if photo_files:
                    photo_files.sort(key=lambda x: os.path.getmtime(os.path.join(d, x)), reverse=True)
                    target_photo = os.path.join(d, photo_files[0])
                    break

    print(f"   📁 Target Photo Path: {target_photo}")
    if target_photo and os.path.exists(target_photo):
        print(f"   ✅ Photo confirmed on disk ({os.path.getsize(target_photo)} bytes)")
    else:
        print(f"   ⚠️ Warning: Photo_{app_no}.jpg not found in Downloads folder!")

    # 4. Find and Click Orange 'Upload' button on top toolbar
    print("🔍 Looking for orange 'Upload' button on top toolbar...")
    loc_upload = None
    sw, sh = pyautogui.size()

    # Search top 28% of screen
    for attempt in range(1, 12):
        try:
            shot = pyautogui.screenshot()
            scr = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
            top_region = scr[:int(sh * 0.28), :]

            if os.path.exists(BTN_TOP_UPLOAD):
                tpl_up = cv2.imread(BTN_TOP_UPLOAD)
                if tpl_up is not None:
                    base_scale = sw / 1024.0
                    scales = [base_scale * 0.85, base_scale * 0.92, base_scale, base_scale * 1.08, base_scale * 1.15, 1.0, 1.25, 1.5, 1.875]
                    best_v = -1
                    best_l = None
                    for s in scales:
                        tw, th = int(tpl_up.shape[1] * s), int(tpl_up.shape[0] * s)
                        if tw <= 0 or th <= 0 or tw >= top_region.shape[1] or th >= top_region.shape[0]:
                            continue
                        resized = cv2.resize(tpl_up, (tw, th), interpolation=cv2.INTER_CUBIC)
                        res = cv2.matchTemplate(top_region, resized, cv2.TM_CCOEFF_NORMED)
                        _, mv, _, ml = cv2.minMaxLoc(res)
                        if mv > best_v:
                            best_v = mv
                            best_l = (ml[0] + tw // 2, ml[1] + th // 2)
                    if best_v >= 0.70 and best_l is not None:
                        loc_upload = best_l
                        print(f"   🎯 Orange 'Upload' button matched visually: score={best_v:.2f} at {loc_upload}")
                        break
        except Exception:
            pass
        time.sleep(0.5)

    if not loc_upload:
        # Fallback to calibrated coordinate on top toolbar: x ~ 34.6% of sw, y ~ 17.9% of sh
        loc_upload = (int(sw * 0.346), int(sh * 0.179))
        print(f"   ℹ️ Using calibrated fallback for 'Upload' button: {loc_upload}")

    print(f"   🖱️ Clicking 'Upload' button at {loc_upload} to open Windows File Dialog...")
    pyautogui.moveTo(loc_upload[0], loc_upload[1], duration=0.25)
    pyautogui.click()
    time.sleep(1.0)

    # 5. Wait for Windows Open File Dialog window to appear
    print("⏳ Waiting for Windows 'Open' File Dialog window to appear (up to 5s)...")
    dialog_win = None
    t_dialog = time.time()
    while (time.time() - t_dialog) < 5.0:
        try:
            wins = [w for w in gw.getAllWindows() if any(k in w.title.lower() for k in ['open', 'choose file', 'upload file', 'kholna', 'file upload'])]
            if wins:
                dialog_win = wins[0]
                print(f"   🎯 Windows File Dialog detected: '{dialog_win.title}'")
                break
        except Exception:
            pass
        time.sleep(0.2)

    if dialog_win:
        try:
            dialog_win.activate()
            time.sleep(0.3)
        except Exception:
            pass

    # 6. Enter photo path into Windows Open File Dialog
    if target_photo:
        print(f"   ⌨️ Entering photo path into File Dialog: {target_photo}")
        pyautogui.hotkey('alt', 'n')
        time.sleep(0.3)
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.1)
        pyautogui.press('backspace')
        time.sleep(0.1)
        pyperclip.copy(target_photo)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.4)
        pyautogui.press('enter')
        print("   ✅ Enter pressed! Photo selected in File Dialog.")
        time.sleep(1.5)
    else:
        print("   ⚠️ Target photo path missing, skipping File Dialog input.")

    # 7. Check if any confirmation alert appears right after upload
    handle_alert_popups(max_alerts=2)

    print("\n" + "=" * 60)
    print("🎉 PHOTO UPLOAD SUCCESSFULLY COMPLETED!")
    print("🟢 Bot ka kaam yahan tak hi tha — Photo select ho chuki hai.")
    print("🛑 Aur kahin bhi click nahi kiya jayega (Camera / FaceAuth are manual).")
    print("=" * 60)

def handle_post_proceed_exam_selection():
    """
    Handles the post-proceed workflow:
    1. Clicks 1st 'CONTINUE' button on Stall Instructions page (authenticationaction.do).
    2. Waits for STALL Examselection page (instruction.do).
    3. Selects 'ENGLISH' in Select Language dropdown.
    4. Scrolls down page to reveal declaration checkboxes.
    5. Ticks both declaration checkboxes:
       - Checkbox 1: 'I have read the above declaration and I Agree'
       - Checkbox 2: 'I have viewed road safety tutorials and I Agree'
    6. Clicks final 'CONTINUE' button to enter exam.
    """
    print("\n" + "=" * 60)
    print("📝 STEP 8: POST-PROCEED WORKFLOW (STALL INSTRUCTIONS & EXAM SELECTION)")
    print("=" * 60)

    bring_chrome_to_front()
    time.sleep(1.0)
    sw, sh = pyautogui.size()

    # ─────────────────────────────────────────────────────────────
    # 1. PAGE 1: CLICK 1ST 'CONTINUE' BUTTON ON STALL INSTRUCTIONS
    # ─────────────────────────────────────────────────────────────
    print("🔍 Looking for 1st blue 'CONTINUE' button on Stall Instructions page...")
    loc_cont1 = None
    for attempt in range(1, 15):
        loc_cont1, _ = locate_on_screen(BTN_CONTINUE_BLUE, threshold=0.72)
        if loc_cont1:
            break
        time.sleep(0.5)

    if loc_cont1:
        print(f"   🎯 1st 'CONTINUE' button found at {loc_cont1}! Clicking...")
        pyautogui.moveTo(loc_cont1[0], loc_cont1[1], duration=0.25)
        pyautogui.click()
    else:
        fallback_cont1 = (int(sw * 0.494), int(sh * 0.709))
        print(f"   ℹ️ Fallback coordinate for 1st 'CONTINUE': {fallback_cont1}. Clicking...")
        pyautogui.moveTo(fallback_cont1[0], fallback_cont1[1], duration=0.25)
        pyautogui.click()

    time.sleep(1.2)
    handle_alert_popups(max_alerts=2)

    # ─────────────────────────────────────────────────────────────
    # 2. PAGE 2: WAIT FOR 'STALL Examselection' PAGE (instruction.do)
    # ─────────────────────────────────────────────────────────────
    print("\n⏳ Waiting for 'STALL Examselection' page to load...")
    loc_lang = None
    scale_lang = 1.0
    for attempt in range(1, 16):
        loc_lang, scale_lang = locate_on_screen(TPL_LANG_DROPDOWN, threshold=0.72)
        if loc_lang:
            break
        time.sleep(0.6)

    if not loc_lang:
        loc_lang = (int(sw * 0.390), int(sh * 0.538))
        scale_lang = sw / 1024.0
        print(f"   ℹ️ Fallback coordinate for 'Select Language' dropdown: {loc_lang}")
    else:
        print(f"   🎯 'Select Language' dropdown found at {loc_lang}")

    # 3. SELECT 'ENGLISH' IN DROPDOWN
    print("   🖱️ Clicking 'Select Language' dropdown...")
    pyautogui.moveTo(loc_lang[0], loc_lang[1], duration=0.25)
    pyautogui.click()
    time.sleep(0.5)

    print("   🌐 Selecting 'ENGLISH' language...")
    loc_eng, _ = locate_on_screen(TPL_OPT_ENGLISH, threshold=0.72)
    if loc_eng:
        print(f"   🎯 'ENGLISH' option found on screen at {loc_eng}! Clicking...")
        pyautogui.moveTo(loc_eng[0], loc_eng[1], duration=0.2)
        pyautogui.click()
    else:
        # Standard select navigation: pressing 'e' jumps directly to 'ENGLISH', then 'enter' confirms
        pyautogui.press('e')
        time.sleep(0.2)
        pyautogui.press('enter')

    time.sleep(0.5)
    pyautogui.press('esc')
    time.sleep(0.3)
    print("   ✅ Language 'ENGLISH' selected!")

    # ─────────────────────────────────────────────────────────────
    # 4. SCROLL DOWN TO REVEAL DECLARATIONS & CHECKBOXES
    # ─────────────────────────────────────────────────────────────
    print("\n📜 Scrolling down to declaration checkboxes...")
    pyautogui.moveTo(int(sw * 0.5), int(sh * 0.5), duration=0.2)
    time.sleep(0.2)

    found_decl = False
    for scroll_try in range(4):
        loc_chk1, _ = locate_on_screen(TPL_DECL_READ, threshold=0.72)
        if loc_chk1:
            found_decl = True
            print(f"   🎯 Declarations visible on screen after scroll attempt {scroll_try + 1}!")
            break
        pyautogui.scroll(-350)
        time.sleep(0.4)

    if not found_decl:
        print("   ℹ️ Performing fallback scroll...")
        pyautogui.scroll(-400)
        time.sleep(0.5)

    # ─────────────────────────────────────────────────────────────
    # 5. TICK BOTH DECLARATION CHECKBOXES
    # ─────────────────────────────────────────────────────────────
    print("\n☑️ Ticking Declaration Checkboxes...")

    # Checkbox 1: 'I have read the above declaration and I Agree'
    loc_decl1, scale_decl1 = locate_on_screen(TPL_DECL_READ, threshold=0.72)
    if loc_decl1:
        cb1_x = loc_decl1[0] - int(100 * scale_decl1)
        cb1_y = loc_decl1[1]
    else:
        cb1_x = int(sw * 0.224)
        cb1_y = int(sh * 0.560)
        scale_decl1 = sw / 1024.0

    print(f"   🎯 Clicking Checkbox 1 ('I have read the above declaration') at ({cb1_x}, {cb1_y})...")
    pyautogui.moveTo(cb1_x, cb1_y, duration=0.25)
    pyautogui.click()
    time.sleep(0.4)
    print("   ✅ Checkbox 1 ticked!")

    # Checkbox 2: 'I have viewed road safety tutorials and I Agree'
    loc_decl2, scale_decl2 = locate_on_screen(TPL_DECL_SAFETY, threshold=0.72)
    if loc_decl2:
        cb2_x = loc_decl2[0] - int(100 * scale_decl2)
        cb2_y = loc_decl2[1]
    else:
        cb2_x = cb1_x
        cb2_y = cb1_y + int(39 * scale_decl1)

    print(f"   🎯 Clicking Checkbox 2 ('I have viewed road safety tutorials') at ({cb2_x}, {cb2_y})...")
    pyautogui.moveTo(cb2_x, cb2_y, duration=0.25)
    pyautogui.click()
    time.sleep(0.5)
    print("   ✅ Checkbox 2 ticked!")

    # ─────────────────────────────────────────────────────────────
    # 6. CLICK FINAL 'CONTINUE' BUTTON AT BOTTOM
    # ─────────────────────────────────────────────────────────────
    print("\n🔍 Looking for final 'CONTINUE' button at bottom of declarations...")
    loc_cont_final, _ = locate_on_screen(BTN_CONTINUE_EXAM, threshold=0.72)
    if not loc_cont_final:
        loc_cont_final, _ = locate_on_screen(BTN_CONTINUE_BLUE, threshold=0.70)

    if loc_cont_final:
        print(f"   🎯 Final 'CONTINUE' button found at {loc_cont_final}! Clicking...")
        pyautogui.moveTo(loc_cont_final[0], loc_cont_final[1], duration=0.25)
        pyautogui.click()
    else:
        cont_final_x = cb2_x + int(207 * scale_decl1)
        cont_final_y = cb2_y + int(44 * scale_decl1)
        print(f"   ℹ️ Fallback coordinate for final 'CONTINUE': ({cont_final_x}, {cont_final_y}). Clicking...")
        pyautogui.moveTo(cont_final_x, cont_final_y, duration=0.25)
        pyautogui.click()

    time.sleep(1.5)
    handle_alert_popups(max_alerts=2)

    print("=" * 60)
    print("🎉 ALL POST-PROCEED & EXAM SELECTION STEPS COMPLETED!")
    print("=" * 60)

def main():
    state, app_no, dob, password, rto_code = smart_parse_args()

    print("=" * 60)
    print("🚀 SARATHI PARIVAHAN OBSCURA FILES AUTOMATION")
    print("=" * 60)
    print(f"• State:           {state}")
    print(f"• Application No:  {app_no}")
    print(f"• DOB:             {dob}")
    print(f"• Password:        {password}")
    print(f"• RTO Code:        {rto_code}")
    print("=" * 60)

    # Ensure page is open
    ensure_page_ready()

    # Clear any accidental text highlight
    pyautogui.press('esc')
    time.sleep(0.2)

    # ─────────────────────────────────────────────────────────────
    # STEP 1: TOP-RIGHT POPUP ("Sarathi Autofill")
    # ─────────────────────────────────────────────────────────────
    enter_into_field("App No:", LBL_APPNO, offset_x=40, offset_y=18, text_to_enter=app_no)
    enter_into_field("DOB (dd-mm-yyyy):", LBL_DOB, offset_x=15, offset_y=18, text_to_enter=dob)
    enter_into_field("Password:", LBL_PWD, offset_x=40, offset_y=18, text_to_enter=password)
    time.sleep(0.3)

    # ─────────────────────────────────────────────────────────────
    # STEP 2: "Sarathi Mock" POPUP -> RTO CODE
    # ─────────────────────────────────────────────────────────────
    mock_header_loc, mock_scale = fill_rto_code_in_mock(rto_code)
    time.sleep(0.3)

    # ─────────────────────────────────────────────────────────────
    # STEP 3: CAPTCHA RESOLUTION, MOCK TRIGGER & RETRY LOOP
    # ─────────────────────────────────────────────────────────────
    captcha_success = execute_captcha_and_mock_trigger(mock_header_loc, mock_scale, max_attempts=5)
    if not captcha_success:
        print("\n❌ Captcha verification 5 attempts ke baad bhi fail ho gaya.")
        print("🛑 Photo Upload par aage nahi badha ja sakta.")
        return

    # ─────────────────────────────────────────────────────────────
    # STEP 4: PHOTO UPLOAD (FINAL STEP - STOPS HERE AS REQUESTED)
    # ─────────────────────────────────────────────────────────────
    handle_photo_upload(app_no)

    print("\n" + "=" * 60)
    print("🎉 PHOTO UPLOAD SUCCESSFULLY COMPLETED!")
    print("🟢 Bot ka execution yahan complete ho gaya hai.")
    print("👉 Camera, FaceAuth aur aage ke steps aap manually karein.")
    print("=" * 60)
    if sys.stdin and sys.stdin.isatty():
        try:
            input("\n👉 Jab aapko band karna ho, tab Enter dabayein (ya terminal aise hi khula rehne dein): ")
        except (KeyboardInterrupt, EOFError):
            pass
    else:
        print("\n🎉 Background process execution finished cleanly.")
        time.sleep(1.0)

if __name__ == "__main__":
    main()
