// ==UserScript==
// @name         Face Auth Status
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Face authentication script - runs instantly after button click
// @author       You
// @match        *://*/*
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Function to find and attach event to submit button
    function setupButtonListener() {
        // Find button with value="Submit" and class containing "btn"
        const submitButton = document.querySelector('input[type="button"][value="Submit"].btn');

        if (submitButton) {
            console.log("✅ Submit button found, attaching listener...");

            // Store original onclick function
            const originalOnClick = submitButton.onclick;

            // Override onclick
            submitButton.onclick = function(event) {
                // Call original function first
                if (originalOnClick) {
                    originalOnClick.call(this, event);
                }

                // Run instantly - no delay
                console.log("⚡ Running face auth script instantly...");
                runFaceAuthScript();
            };

            return true;
        }
        return false;
    }

    // SHA-256 function
    async function hashSHA256(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // Main face auth function
    async function runFaceAuthScript() {
        console.log("🚀 Running Face Auth Script...");

        // Get input values
        const llappln = document.querySelector('[name="llappln"]')?.value || "";
        const entcaptxt = document.querySelector('[name="entcaptxt"]')?.value || "";

        if (!llappln || !entcaptxt) {
            console.error("❌ llappln ya entcaptxt empty hai ya mil nahi raha.");
            return;
        }

        // Log values
        console.log("📝 Application No:", llappln);
        console.log("📝 Captcha:", entcaptxt);

        // Concatenate
        const faceAuthString = llappln + entcaptxt;
        console.log("🔹 Combined String:", faceAuthString);

        // Generate hash
        const faceAuthStatus = await hashSHA256(faceAuthString);
        console.log("🔐 Generated Hash:", faceAuthStatus);

        // jQuery check
        if (typeof $ === "undefined") {
            console.error("❌ jQuery loaded nahi hai.");
            return;
        }

        // AJAX request
        $.ajax({
            type: "POST",
            url: "faceAuthStatus.do",
            data: {
                faceAuthStatus: faceAuthStatus
            },
            dataType: "json",
            success: function (response) {
                console.log("✅ Success:", response);
            },
            error: function (xhr, status, error) {
                console.log("❌ Error Status:", status);
                console.log("❌ Error Message:", error);
                console.log("❌ Full Response:", xhr.responseText);
            }
        });
    }

    // Check for button immediately and also watch for dynamic content
    if (!setupButtonListener()) {
        console.log("Button not found yet, watching for changes...");

        // Use MutationObserver to watch for button being added
        const observer = new MutationObserver(function(mutations) {
            if (setupButtonListener()) {
                observer.disconnect(); // Stop watching once button is found
                console.log("Button found and listener attached!");
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

})();