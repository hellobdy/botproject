// ==UserScript==

// @name         Enable capphto1 Button

// @namespace    http://tampermonkey.net/

// @version      1.0

// @description  Enables the capphto1 button automatically

// @match        *://*/*

// @grant        none

// ==/UserScript==

(function() {

    'use strict';

    function enableButton() {

        const button = document.getElementById('capphto1');

        if (button) {

            button.disabled = false;

            button.removeAttribute('disabled');

            console.log('capphto1 button enabled.');

        }

    }

    // Run after page loads

    window.addEventListener('load', enableButton);

    // Optional: also observe DOM changes in case button loads later

    const observer = new MutationObserver(enableButton);

    observer.observe(document.body, { childList: true, subtree: true });

})();