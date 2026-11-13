
// ==UserScript==
// @name         	Authentication Handler
// @namespace    MasterTechnology
// @version      1.0
// @description  Automatically select Odisha State on Sarathi
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_STATE = 'ODISHA';

    function selectOdisha() {
        const selects = document.querySelectorAll('select');

        for (const select of selects) {
            const option = [...select.options].find(opt =>
                opt.textContent.trim().toUpperCase() === TARGET_STATE ||
                opt.value.toUpperCase() === TARGET_STATE
            );

            if (option && select.value !== option.value) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', {
                    bubbles: true
                }));
                console.log('Master Technology: Odisha Selected');
                return true;
            }
        }
        return false;
    }

    selectOdisha();

    const observer = new MutationObserver(selectOdisha);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      2026-11-09
// @description  try to take over the world!
// @author       You
// @match        https://*/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Your code here...
})();