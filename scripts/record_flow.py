import time
import os
import sys
import json
import pyautogui
from pynput import mouse, keyboard

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "debug_recording")
os.makedirs(OUTPUT_DIR, exist_ok=True)

actions = []
recording = True
step_num = 0
last_click_time = 0

def on_click(x, y, button, pressed):
    global step_num, recording, last_click_time
    if not recording or not pressed:
        return

    # Debounce very fast duplicate events
    now = time.time()
    if now - last_click_time < 0.15:
        return
    last_click_time = now

    step_num += 1
    btn_name = "left" if button == mouse.Button.left else "right"
    
    # Save full screenshot and local crop
    try:
        shot = pyautogui.screenshot()
        shot_path = os.path.join(OUTPUT_DIR, f"step_{step_num:02d}_full.png")
        shot.save(shot_path)

        # 300x150 crop around click
        w, h = shot.size
        crop_x1 = max(0, x - 150)
        crop_y1 = max(0, y - 75)
        crop_x2 = min(w, x + 150)
        crop_y2 = min(h, y + 75)
        crop_img = shot.crop((crop_x1, crop_y1, crop_x2, crop_y2))
        crop_path = os.path.join(OUTPUT_DIR, f"step_{step_num:02d}_crop.png")
        crop_img.save(crop_path)
    except Exception as e:
        shot_path = None
        crop_path = None

    action = {
        "step": step_num,
        "type": "click",
        "button": btn_name,
        "x": x,
        "y": y,
        "time": round(now, 2),
        "screenshot": os.path.basename(shot_path) if shot_path else None,
        "crop": os.path.basename(crop_path) if crop_path else None
    }
    actions.append(action)
    print(f"👉 Step {step_num:02d}: Click at ({x}, {y}) [{btn_name}] -> Saved screenshot")

def on_press(key):
    global recording
    if key == keyboard.Key.esc:
        print("\n🛑 Stop key (ESC) pressed! Recording complete.")
        recording = False
        return False

def main():
    print("=" * 60)
    print("🎥 FLOW RECORDER (MANUAL ACTION CAPTURE)")
    print("=" * 60)
    print("📌 Ye tool aapke clicks aur unke exact screenshots capture karega.")
    print("💡 Steps:")
    print("   1. Script start hone ke baad apni Chrome window samne rakhein.")
    print("   2. Manually jo jo click/enter karna hai karein (Captcha, OK, Upload etc.).")
    print("   3. Jab complete ho jaye, keyboard par 'ESC' dabayein.")
    print("=" * 60)
    print("⏳ 3 seconds me recording shuru ho rahi hai... Chrome khol lijiye!")
    
    for i in range(3, 0, -1):
        print(f"   ⏱️ {i}...")
        time.sleep(1.0)
    
    print("\n🟢 RECORDING ACTIVE! Chrome me click karna shuru karein (Band karne ke liye ESC dabayein):\n")

    m_listener = mouse.Listener(on_click=on_click)
    k_listener = keyboard.Listener(on_press=on_press)

    m_listener.start()
    k_listener.start()

    k_listener.join()
    m_listener.stop()

    summary_file = os.path.join(OUTPUT_DIR, "flow.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(actions, f, indent=2)

    print("\n" + "=" * 60)
    print(f"🎉 Recording saved! Total steps: {len(actions)}")
    print(f"📁 Folder: {OUTPUT_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    main()
