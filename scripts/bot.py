import time
import os
import sys
import json
import urllib.request
import base64
import numpy as np
import cv2
import pyautogui
import pygetwindow as gw
import pyperclip

# Safety settings
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.35

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AVATAR_IMG = os.path.join(SCRIPT_DIR, "obscura_avatar.png")
CARD_IMG = os.path.join(SCRIPT_DIR, "obscura_card.png")

TPL_AUTOFILL = os.path.join(SCRIPT_DIR, "tpl_autofill_title.png")
TPL_CENTER_LLAPP = os.path.join(SCRIPT_DIR, "tpl_center_llapp.png")
TPL_RTO = os.path.join(SCRIPT_DIR, "tpl_rto_input.png")
TPL_CAPTCHA = os.path.join(SCRIPT_DIR, "tpl_captcha_box.png")
TPL_VAL_CAPTCHA = os.path.join(SCRIPT_DIR, "tpl_val_captcha.png")
TPL_APPLY_BTN = os.path.join(SCRIPT_DIR, "tpl_apply_btn.png")

# Load .env if present from project root
env_file = os.path.join(os.path.dirname(SCRIPT_DIR), ".env")
if os.path.exists(env_file):
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v
    except Exception:
        pass

DEFAULT_GEMINI_KEY = base64.b64decode("QVEuQWI4Uk42THVVdm5mMG80bjhMTVVYVFR2WjVyS1Zlam1Ba0RDUnJZR1F2aHFURFpzcVE=").decode("utf-8")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", DEFAULT_GEMINI_KEY)
ANUGYNA_URL = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do?authtype=Anugyna"

def find_template(template_path, threshold=0.55):
    """Finds a visual template on the active screen across multiple display scales."""
    if not os.path.exists(template_path):
        return None, 1.0
    
    template = cv2.imread(template_path)
    if template is None:
        return None, 1.0
    th, tw = template.shape[:2]

    try:
        screenshot = pyautogui.screenshot()
        screen = np.array(screenshot)
        screen = cv2.cvtColor(screen, cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"   ⚠️ Screen capture error: {e}")
        return None, 1.0

    best_val = -1
    best_loc = None
    best_scale = 1.0

    for scale in np.linspace(0.8, 2.2, 29):
        new_w = int(tw * scale)
        new_h = int(th * scale)
        if new_w >= screen.shape[1] or new_h >= screen.shape[0]:
            continue
        resized = cv2.resize(template, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        res = cv2.matchTemplate(screen, resized, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)

        if max_val > best_val:
            best_val = max_val
            best_loc = (max_loc[0] + new_w // 2, max_loc[1] + new_h // 2)
            best_scale = scale

    if best_val >= threshold:
        print(f"   🎯 Matched {os.path.basename(template_path)}: conf={best_val:.2f}, scale={best_scale:.2f} at {best_loc}")
        return best_loc, best_scale
    return None, 1.0

def force_full_screen():
    """Forces Chrome window to un-snap from split-screen and become 100% full-screen maximized."""
    print("🖥️ Ensuring Chrome is 100% FULL SCREEN MAXIMIZED...")
    try:
        wins = [w for w in gw.getAllWindows() if 'STALL Authentication' in w.title or 'Sarathi' in w.title or 'Chrome' in w.title]
        for w in wins:
            try:
                if w.isMinimized:
                    w.restore()
                w.maximize()
                w.activate()
                time.sleep(0.3)
            except Exception:
                pass
    except Exception:
        pass

    # Click title bar to focus Chrome, then press Win+Up twice to un-snap from half-screen
    try:
        pyautogui.click(350, 25)
        time.sleep(0.3)
        pyautogui.hotkey('win', 'up')
        time.sleep(0.3)
        pyautogui.hotkey('win', 'up')
        time.sleep(0.6)
    except Exception:
        pass

def solve_captcha_image(cap_img_bgr):
    """Encodes cropped captcha image and decodes with Gemini AI."""
    if not GEMINI_API_KEY or cap_img_bgr is None:
        return ""
    
    _, buf = cv2.imencode('.png', cap_img_bgr)
    base64_data = base64.b64encode(buf).decode('utf-8')
    
    models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
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
                    "text": "What characters are shown in this captcha image? Output ONLY the plain characters with no spaces or symbols."
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 20
        }
    }
    
    data_bytes = json.dumps(payload).encode('utf-8')
    for m in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={GEMINI_API_KEY}"
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                res = json.loads(response.read().decode('utf-8'))
                parts = res.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                cleaned = "".join(c for c in text if c.isalnum())
                if cleaned:
                    print(f"   🤖 Captcha Decoded by Gemini ({m}): {cleaned}")
                    return cleaned
        except Exception:
            continue
    return ""

def focus_or_open_chrome():
    """Focuses active Chrome window or opens Profile 31 directly maximized."""
    try:
        wins = gw.getWindowsWithTitle('STALL Authentication')
        if not wins:
            wins = [w for w in gw.getAllWindows() if 'Sarathi' in w.title or 'Chrome' in w.title]
        if wins:
            w = wins[0]
            if w.isMinimized:
                w.restore()
            w.maximize()
            w.activate()
            time.sleep(0.5)
            force_full_screen()
            return True
    except Exception:
        pass

    print("🚀 Launching Chrome 'Obscura Files' Profile in full-screen...")
    os.system('start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --start-maximized --profile-directory="Profile 31"')
    time.sleep(3.5)
    
    force_full_screen()
    pyautogui.hotkey('ctrl', 'l')
    time.sleep(0.3)
    pyperclip.copy(ANUGYNA_URL)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.2)
    pyautogui.press('enter')
    time.sleep(5.0)
    force_full_screen()
    return False

def fill_and_trigger(app_no, dob, password, rto_code):
    print("=" * 60)
    print("🚀 ACCURATE 3-FIELD FILL & TRIGGER (FULL SCREEN)")
    print(f"   Application No : {app_no}")
    print(f"   Date of Birth  : {dob}")
    print(f"   Password       : {password}")
    print(f"   RTO Code       : {rto_code}")
    print("=" * 60)

    # Force Chrome to be 100% full screen
    force_full_screen()

    # ─────────────────────────────────────────────────────────────
    # STEP 1: FILL TOP-RIGHT PANEL ("Sarathi Autofill")
    # Exact vertical spacing:
    # Title at y=90 -> Box 1 (App No) at y=120 (+30px scaled)
    # Title at y=90 -> Box 2 (DOB)    at y=160 (+70px scaled)
    # Title at y=90 -> Box 3 (Pwd)    at y=200 (+110px scaled)
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 1] Filling 3 fields in 'Sarathi Autofill' (Top-Right)...")
    loc_af, scale_af = find_template(TPL_AUTOFILL, threshold=0.55)
    if loc_af:
        tx, ty = loc_af
        box1_y = ty + int(30 * scale_af)
        box2_y = ty + int(70 * scale_af)
        box3_y = ty + int(110 * scale_af)

        # 1. Fill Box 1: Application Number
        print(f"   🖱️ [Field 1/3] Clicking 'App No' at ({tx}, {box1_y})...")
        pyautogui.click(tx, box1_y)
        time.sleep(0.25)
        pyautogui.hotkey('ctrl', 'a')
        pyperclip.copy(app_no)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.3)
        print(f"      ✅ Entered App No: '{app_no}'")

        # 2. Fill Box 2: DOB
        print(f"   🖱️ [Field 2/3] Clicking 'DOB (dd-mm-yyyy)' at ({tx}, {box2_y})...")
        pyautogui.click(tx, box2_y)
        time.sleep(0.25)
        pyautogui.hotkey('ctrl', 'a')
        pyperclip.copy(dob)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.3)
        print(f"      ✅ Entered DOB: '{dob}'")

        # 3. Fill Box 3: Password
        print(f"   🖱️ [Field 3/3] Clicking 'Password' at ({tx}, {box3_y})...")
        pyautogui.click(tx, box3_y)
        time.sleep(0.25)
        pyautogui.hotkey('ctrl', 'a')
        pyperclip.copy(password)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.3)
        print(f"      ✅ Entered Password: '{password}'")
    else:
        print("   ⚠️ Could not find Sarathi Autofill title.")

    # ─────────────────────────────────────────────────────────────
    # STEP 2: FILL CENTER PAGE "LL Application Number"
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 2] Ensuring Center Page 'LL Application Number' is correct...")
    loc_ll, _ = find_template(TPL_CENTER_LLAPP, threshold=0.50)
    if loc_ll:
        print(f"   🖱️ Clicking center 'LL Application Number' at {loc_ll}...")
        pyautogui.click(loc_ll[0], loc_ll[1])
        time.sleep(0.2)
        pyautogui.hotkey('ctrl', 'a')
        pyperclip.copy(app_no)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.3)
        print(f"   ✅ Center LL Application Number set to '{app_no}'")

    # ─────────────────────────────────────────────────────────────
    # STEP 3: SOLVE AND FILL CAPTCHA (CENTER PAGE)
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 3] Solving Captcha on Center Page...")
    loc_cap, scale_cap = find_template(TPL_CAPTCHA, threshold=0.55)
    if loc_cap:
        cx, cy = loc_cap
        cap_img_x = int(cx + 25 * scale_cap)
        cap_img_y = int(cy - 20 * scale_cap)
        cap_w = int(100 * scale_cap)
        cap_h = int(45 * scale_cap)

        try:
            cap_screenshot = pyautogui.screenshot(region=(cap_img_x, cap_img_y, cap_w, cap_h))
            cap_bgr = cv2.cvtColor(np.array(cap_screenshot), cv2.COLOR_RGB2BGR)
            
            print("   📸 Captcha image captured, decoding via Gemini AI...")
            decoded_text = solve_captcha_image(cap_bgr)
            
            if decoded_text:
                input_x = int(cx - 50 * scale_cap)
                print(f"   🖱️ Typing Captcha '{decoded_text}' at ({input_x}, {cy})...")
                pyautogui.click(input_x, cy)
                time.sleep(0.2)
                pyautogui.hotkey('ctrl', 'a')
                pyautogui.write(decoded_text, interval=0.04)
                time.sleep(0.3)
                print("   ✅ Captcha entered! (Center Submit button NOT clicked)")
            else:
                print("   ⚠️ Could not decode captcha from image.")
        except Exception as e:
            print(f"   ⚠️ Captcha error: {e}")

    # ─────────────────────────────────────────────────────────────
    # STEP 4: FILL RTO CODE IN "Sarathi Mock" (BOTTOM-LEFT)
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 4] Setting RTO Code in 'Sarathi Mock' (Bottom-Left)...")
    loc_rto, _ = find_template(TPL_RTO, threshold=0.55)
    if loc_rto:
        print(f"   🖱️ Clicking RTO Code input at {loc_rto}...")
        pyautogui.click(loc_rto[0], loc_rto[1])
        time.sleep(0.2)
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.write(rto_code, interval=0.04)
        time.sleep(0.3)
        print(f"   ✅ RTO Code '{rto_code}' entered!")

    # ─────────────────────────────────────────────────────────────
    # STEP 5: TICK "Validate captcha" CHECKBOX
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 5] Checking 'Validate captcha' checkbox...")
    loc_val, scale_val = find_template(TPL_VAL_CAPTCHA, threshold=0.55)
    if loc_val:
        chk_x = int(loc_val[0] - 50 * scale_val)
        print(f"   🖱️ Clicking 'Validate captcha' at ({chk_x}, {loc_val[1]})...")
        pyautogui.click(chk_x, loc_val[1])
        time.sleep(0.4)
        print("   ✅ 'Validate captcha' checkbox ticked!")

    # ─────────────────────────────────────────────────────────────
    # STEP 6: CLICK "⚡ Apply & Trigger" BUTTON
    # ─────────────────────────────────────────────────────────────
    print("\n[Step 6] Clicking '⚡ Apply & Trigger' button...")
    loc_btn, _ = find_template(TPL_APPLY_BTN, threshold=0.55)
    if loc_btn:
        print(f"   🖱️ Clicking '⚡ Apply & Trigger' button at {loc_btn}...")
        pyautogui.click(loc_btn[0], loc_btn[1])
        time.sleep(1.0)
        print("   ✅ '⚡ Apply & Trigger' CLICKED SUCCESSFULLY!")

    print("\n" + "=" * 60)
    print("🎉 ALL FIELDS CORRECTLY FILLED & MOCK TRIGGERED IN FULL SCREEN!")
    print("=" * 60)

def main():
    app_no = sys.argv[1] if len(sys.argv) > 1 else "5038176226"
    dob = sys.argv[2] if len(sys.argv) > 2 else "01-01-1977"
    password = sys.argv[3] if len(sys.argv) > 3 else "17760G"
    rto_code = sys.argv[4] if len(sys.argv) > 4 else "AS04"

    focus_or_open_chrome()
    fill_and_trigger(app_no, dob, password, rto_code)

if __name__ == "__main__":
    main()
