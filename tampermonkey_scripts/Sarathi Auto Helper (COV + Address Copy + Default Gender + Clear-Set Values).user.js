// ==UserScript==
// @name         Sarathi Auto Helper (COV + Address Copy + Default Gender + Clear/Set Values)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Auto COV, auto copy address, default gender male, auto clear inputs + set mobile number
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*
// @match        https://sarathi.parivahan.gov.in/sarathiservice/newLL_displayExpiredNewLL.do*
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log("%c🚀 Sarathi Auto Helper Script Loaded", "color:green;font-weight:bold;");

    // =====================================================
    // 0️⃣ REMOVE OLD COPY-ADDRESS CHECKBOX
    // =====================================================
    const oldBox = document.querySelector('label input#copyPermToPres')?.parentElement;
    if (oldBox) {
        oldBox.remove();
        console.log("🗑️ Old copy-address checkbox removed");
    }

    // =====================================================
    // 1️⃣ VEHICLE COV CHECKBOX CREATOR
    // =====================================================
    function initCOVCheckbox() {
        const covOptions = [
            { short: "MCWG", full: "Motor Cycle with Gear(Non Transport) (MCWG)" },
            { short: "MCWOG", full: "Motor cycle without Gear (Non Transport) (MCWOG)" },
            { short: "LMV", full: "LIGHT MOTOR VEHICLE (LMV)" },
      { short: "LMV-TR", full: "LMV-TR(GOODS) (LMV-TR)" },
            { short: "eRIKSH", full: "E-RICKSHAW (eRIKSH)" },
         { short: "CRANE", full: "Others-Cranes (CRANE)" },
         { short: "LDRXCV", full: "Others-Loader/Excavator (LDRXCV)" },
         { short: "FLIFT", full: "Others-ForkliftT (FLIFT)" },
            { short: "eCART", full: "E-CART (eCART)" }
        ];

        const selectBox = document.getElementById("selectedCovsList");
        if (!selectBox) return;

        let panel = document.createElement("div");
        panel.style.padding = "10px";
        panel.style.border = "1px solid #888";
        panel.style.marginBottom = "10px";
        panel.innerHTML = "<b>Select Vehicle Class:</b><br><br>";

        covOptions.forEach(item => {
            let id = "chk_" + item.short;

            let cb = document.createElement("input");
            cb.type = "checkbox";
            cb.id = id;
            cb.value = item.full;
            cb.style.accentColor = "red";

            let lbl = document.createElement("label");
            lbl.htmlFor = id;
            lbl.innerText = " " + item.short;
            lbl.style.color = "green";
            lbl.style.fontWeight = "bold";

            cb.addEventListener("change", function () {
                if (this.checked) {
                    let op = document.createElement("option");
                    op.value = item.full;
                    op.text = item.full;
                    op.selected = true;
                    selectBox.appendChild(op);
                } else {
                    [...selectBox.options].forEach(o => {
                        if (o.value === item.full) o.remove();
                    });
                }
            });

            panel.appendChild(cb);
            panel.appendChild(lbl);
            panel.appendChild(document.createElement("br"));
        });

        selectBox.parentNode.insertBefore(panel, selectBox);
        console.log("✔ Vehicle COV checkbox panel added");
    }

    setTimeout(initCOVCheckbox, 800);

    // =====================================================
    // 2️⃣ ADDRESS COPY SYSTEM
    // =====================================================

    function safeTrigger(el) {
        if (!el) return;
        try {
            el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
            console.warn("Trigger blocked:", e.message);
        }
    }

    function copyDropdown(srcId, dstId) {
        const src = document.getElementById(srcId);
        const dst = document.getElementById(dstId);
        if (!src || !dst) return;

        const value = src.value;
        const text = src.options[src.selectedIndex]?.text || "";

        let match = Array.from(dst.options).find(x => x.value === value);

        if (!match && value && value !== "-1") {
            let o = document.createElement("option");
            o.value = value;
            o.text = text;
            dst.appendChild(o);
        }

        dst.value = value;
        safeTrigger(dst);
    }

    function copyInput(srcId, dstId) {
        const s = document.getElementById(srcId);
        const d = document.getElementById(dstId);
        if (s && d) {
            d.value = s.value;
            safeTrigger(d);
        }
    }

    function initAddressCopy() {
        const presState = document.getElementById("presState");
        const permState = document.getElementById("permState");
        if (!presState || !permState) return;

        let label = document.createElement("label");
        label.style.display = "block";
        label.style.margin = "5px 0";
        label.style.cursor = "pointer";

        let cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "copyPermToPres";

        label.appendChild(cb);
        label.appendChild(document.createTextNode("  Copy Permanent Address → Present Address"));
        presState.parentElement.prepend(label);

        cb.addEventListener("change", async () => {
            if (!cb.checked) return;

            console.log("⏳ Copying address...");

            copyDropdown("permState", "presState");
            await new Promise(r => setTimeout(r, 800));

            copyDropdown("permDistrict", "presDistrict");
            await new Promise(r => setTimeout(r, 800));

            copyDropdown("permSubDistrict", "presSubDistrict");
            await new Promise(r => setTimeout(r, 800));

            copyDropdown("permCity", "presCity");

            copyInput("permHouseNo", "presHouseNo");
            copyInput("permStreet", "presStreet");
            copyInput("permLocation", "presLocation");
            copyInput("permPinCode", "presPinCode");

            console.log("✅ Address copied successfully!");
        });

        console.log("✔ Address-copy checkbox added");
    }

    setTimeout(initAddressCopy, 1200);

    // =====================================================
    // 3️⃣ DEFAULT GENDER MALE
    // =====================================================

    function setMaleDefault() {
        const male = document.querySelector('input[type="radio"][name="gender"][value="1"]');
        if (male) {
            male.checked = true;
            male.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("👨 Auto gender selected: MALE");
        }
    }

    setTimeout(setMaleDefault, 500);

    let retry = setInterval(() => {
        const male = document.querySelector('input[type="radio"][name="gender"][value="1"]');
        if (male) {
            male.checked = true;
            male.dispatchEvent(new Event("change", { bubbles: true }));
            clearInterval(retry);
            console.log("👨 Gender re-applied after load");
        }
    }, 500);

})();

// =====================================================================
// SECOND SCRIPT MERGED: CLEAR INPUTS + SET MOBILE NUMBER
// =====================================================================

(function () {
    'use strict';

    if (sessionStorage.getItem("clear_done")) return;

    const toClear = [
        "fname","mname","lname",
        "swdfName","swdmName","swdlName",
        "presHouseNo","presStreet","presLocation","presPinCode",
        "permStreet","permLocation","permPinCode",
        "newFullName","permHouseNo"
    ];

    const toSetValue = {
        "mobileNumber": "9999958678"
    };

    function processDoc(doc) {
        let done = false;

        toClear.forEach(id => {
            const el = doc.getElementById(id);
            if (el) {
                el.value = "";
                console.log("Cleared:", id);
                done = true;
            }
        });

        Object.keys(toSetValue).forEach(id => {
            const el = doc.getElementById(id);
            if (el) {
                el.value = toSetValue[id];
                console.log("Set Value:", id, "=", toSetValue[id]);
                done = true;
            }
        });

        return done;
    }

    function scanAll() {
        let success = false;

        if (processDoc(document)) success = true;

        document.querySelectorAll("iframe").forEach(f => {
            try {
                if (f.contentDocument) {
                    if (processDoc(f.contentDocument)) success = true;
                }
            } catch (e) {}
        });

        return success;
    }

    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        console.log("⏳ Attempt:", tries);

        if (scanAll() || tries >= 30) {
            clearInterval(timer);
            sessionStorage.setItem("clear_done", "yes");
            console.log("🎯 Clear + Set Completed");
        }
    }, 400);

})();