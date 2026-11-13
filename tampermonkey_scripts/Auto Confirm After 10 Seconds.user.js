// ==UserScript==
// @name         Auto Confirm After 10 Seconds
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto click Confirm button after 10 seconds
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function tryClick() {
        let btn = document.getElementById("confirmbut");

        if (btn) {
            // Agar disabled hai to enable karo
            btn.disabled = false;

            console.log("✅ Confirm button found, clicking...");
            btn.click();
        } else {
            console.log("⏳ Button not found, retrying...");
            setTimeout(tryClick, 1000);
        }
    }

    // 10 second wait
    setTimeout(tryClick, 10000);

})();