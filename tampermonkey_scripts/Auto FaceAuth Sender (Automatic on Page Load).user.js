// ==UserScript==
// @name         Auto FaceAuth Sender (Automatic on Page Load)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Automatically sends applimg as CapPho when page loads (for https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do)
// @author       You
// @match        https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log("🚀 Auto FaceAuth Sender loaded - waiting for applimg...");

    // Function to send FaceAuth data
    async function sendFaceAuth() {
        console.log("🔄 Attempting to send FaceAuth data automatically...");

        // Check if applimg is available
        if (typeof window.applimg === 'undefined' || !window.applimg) {
            console.log("⏳ applimg not available yet, waiting 2 seconds...");
            setTimeout(sendFaceAuth, 2000);
            return;
        }

        const applno = document.getElementById('llappln')?.value || '';
        const rtocode = document.getElementById('rtocode')?.value || '';
        const capPho = window.applimg;

        if (!applno || !rtocode || !capPho) {
            alert("❌ Missing one or more required fields");
            console.log({ applno, rtocode, capPhoLen: capPho?.length });
            return;
        }

        try {
            console.log("📤 Sending FaceAuth data...");
            const data = new URLSearchParams();
            data.append("applno", applno);
            data.append("rtocode", rtocode);
            data.append("faceres", "1");
            data.append("CapPho", capPho);

            const response = await fetch("/sarathiservice/saveFaceAuthData.do", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept-Language": "en-US,en;q=0.9",
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "*/*",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Origin": "https://sarathi.parivahan.gov.in",
                    "Referer": "https://sarathi.parivahan.gov.in/sarathiservice/stallexamaction.do",
                },
                body: data.toString()
            });

            const json = await response.json();
            console.log("✅ Server Response:", json);

            // Webpage pe response show karna
            let old = document.getElementById("customResponseBox");
            if (old) old.remove();

            const pre = document.createElement("pre");
            pre.id = "customResponseBox";
            pre.style.position = "fixed";
            pre.style.bottom = "20px";
            pre.style.right = "20px";
            pre.style.maxHeight = "300px";
            pre.style.overflow = "auto";
            pre.style.background = "#111";
            pre.style.color = "#0f0";
            pre.style.padding = "10px";
            pre.style.zIndex = 99999;
            pre.style.border = "2px solid #0f0";
            pre.innerText = JSON.stringify(json, null, 2);
            document.body.appendChild(pre);

            // ✅ Success alert - exactly like before
            alert("✅ FaceAuth request sent successfully!");

        } catch (err) {
            console.error("❌ Error during Face Auth Request:", err);
            // ❌ Error alert - exactly like before
            alert("❌ Error sending request. Check console for details.");
        }
    }

    // Start the process when page loads
    window.addEventListener('load', () => {
        console.log("📄 Page loaded, starting FaceAuth process...");
        setTimeout(sendFaceAuth, 1000);
    });

    // Also try immediately if DOM is already loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log("📄 DOM already ready, starting FaceAuth process...");
        setTimeout(sendFaceAuth, 1000);
    }

})();