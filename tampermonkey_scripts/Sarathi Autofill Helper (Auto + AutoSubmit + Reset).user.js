// ==UserScript==
// @name         Sarathi Autofill Helper (Auto + AutoSubmit + Reset)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Auto-fill Sarathi login + auto-submit after captcha entered + auto-save + reset function
// @author       You
// @match        https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function() {
    'use strict';
    console.log("⚡ Sarathi Autofill Script Started");

    //////////////////////////////
    // Floating control panel
    //////////////////////////////
    const panel = document.createElement("div");
    panel.innerHTML = `
      <div id="autofillPanel" style="
        position: fixed; top: 20px; right: 20px;
        background: white; color: black; padding: 15px;
        border: 2px solid #333; border-radius: 8px; z-index: 99999;
        width: 250px; font-family: sans-serif; font-size: 13px;">
        <h4 style="margin-top:0;">Sarathi Autofill</h4>
        <label>App No:</label><br>
        <input type="text" id="af_appNo" style="width:100%"><br><br>
        <label>DOB (dd-mm-yyyy):</label><br>
        <input type="text" id="af_dob" style="width:100%"><br><br>
        <label>Password:</label><br>
        <input type="text" id="af_pwd" style="width:100%"><br><br>
        <button id="af_reset" style="background: #ff4444; color: white; border: none; padding: 5px 8px; border-radius: 3px;">🗑️ Reset</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Load saved values
    document.getElementById("af_appNo").value = GM_getValue("appNo", "");
    document.getElementById("af_dob").value = GM_getValue("dob", "");
    document.getElementById("af_pwd").value = GM_getValue("pwd", "");

    // Auto-save function
    function autoSave() {
        GM_setValue("appNo", document.getElementById("af_appNo").value);
        GM_setValue("dob", document.getElementById("af_dob").value);
        GM_setValue("pwd", document.getElementById("af_pwd").value);
        console.log("💾 Auto-saved credentials");
    }

    // Setup auto-save on input events
    document.getElementById("af_appNo").addEventListener("input", autoSave);
    document.getElementById("af_dob").addEventListener("input", autoSave);
    document.getElementById("af_pwd").addEventListener("input", autoSave);

    // Reset button
    document.getElementById("af_reset").addEventListener("click", () => {
        // Clear panel fields
        document.getElementById("af_appNo").value = "";
        document.getElementById("af_dob").value = "";
        document.getElementById("af_pwd").value = "";

        // Clear page fields
        let appField = document.querySelector("#llappln");
        let dobField = document.querySelector("#dob");
        let pwdField = document.querySelector("input[name='pwd']");

        if(appField) appField.value = "";
        if(dobField) dobField.value = "";
        if(pwdField) pwdField.value = "";

        // Clear stored values
        GM_setValue("appNo", "");
        GM_setValue("dob", "");
        GM_setValue("pwd", "");

        console.log("🗑️ All fields reset and cleared");
        alert("🗑️ Reset complete! All fields cleared and saved.");
    });

    //////////////////////////////
    // Real-time sync function
    //////////////////////////////
    function setupRealTimeSync() {
        let appField = document.querySelector("#llappln");
        let dobField = document.querySelector("#dob");
        let pwdField = document.querySelector("input[name='pwd']");

        let panelAppNo = document.getElementById("af_appNo");
        let panelDob = document.getElementById("af_dob");
        let panelPwd = document.getElementById("af_pwd");

        if(appField && dobField && pwdField && panelAppNo && panelDob && panelPwd) {
            // Panel to Page sync
            panelAppNo.addEventListener("input", function() {
                appField.value = this.value;
            });

            panelDob.addEventListener("input", function() {
                dobField.value = this.value;
            });

            panelPwd.addEventListener("input", function() {
                pwdField.value = this.value;
            });

            // Page to Panel sync
            appField.addEventListener("input", function() {
                panelAppNo.value = this.value;
            });

            dobField.addEventListener("input", function() {
                panelDob.value = this.value;
            });

            pwdField.addEventListener("input", function() {
                panelPwd.value = this.value;
            });

            console.log("⚡ Real-time sync enabled");
            return true;
        }
        return false;
    }

    //////////////////////////////
    // Auto-fill once and setup sync
    //////////////////////////////
    let tries = 0;
    let interval = setInterval(() => {
        let appNo = GM_getValue("appNo", "");
        let dob = GM_getValue("dob", "");
        let pwd = GM_getValue("pwd", "");
        let appField = document.querySelector("#llappln");
        let dobField = document.querySelector("#dob");
        let pwdField = document.querySelector("input[name='pwd']");

        if(appField && dobField && pwdField) {
            if(appNo) appField.value = appNo;
            if(dob) dobField.value = dob;
            if(pwd) pwdField.value = pwd;
            console.log("⚡ Autofill complete:", {appNo, dob, pwd});

            // Setup real-time sync after autofill
            setupRealTimeSync();

            clearInterval(interval); // stop retrying
        }
        tries++;
        if(tries > 20) clearInterval(interval);
    }, 500);

    //////////////////////////////
    // Auto-submit after captcha
    //////////////////////////////
    function trySubmit() {
        let captcha = document.querySelector("#entcaptxt");
        let submitBtn = document.querySelector("input[value='Submit']");
        if(captcha && captcha.value.trim().length > 0 && submitBtn) {
            console.log("🚀 Auto-submitting form...");
            submitBtn.click();
        }
    }

    // Detect Enter key inside captcha field
    document.addEventListener("keydown", function(e) {
        let captcha = document.querySelector("#entcaptxt");
        if(captcha && e.key === "Enter" && document.activeElement === captcha) {
            e.preventDefault(); // stop default form submit
            setTimeout(trySubmit, 300); // small delay ensures captcha typed
        }
    });
})();