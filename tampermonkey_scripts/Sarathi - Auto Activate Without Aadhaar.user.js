// ==UserScript==
// @name         Sarathi - Auto Activate Without Aadhaar
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically activates "Without Aadhaar" option on Sarathi
// @author       You
// @match        https://sarathi.parivahan.gov.in/sarathiservice/submitMobUpdForm.do
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*mob*.do
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*ekyc*.do
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 WITHOUT AADHAAR AUTO-ACTIVATE - LOADED');

    // ============================================
    // 1. ACTIVATE WITHOUT AADHAAR OPTION
    // ============================================
    function activateWithoutAadhaar() {
        console.log('🔄 Activating Without Aadhaar option...');

        // Find and select "Without Aadhaar" radio button
        var noAadhaarRadio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');

        if (noAadhaarRadio) {
            noAadhaarRadio.disabled = false;
            noAadhaarRadio.removeAttribute('disabled');
            noAadhaarRadio.click();
            noAadhaarRadio.checked = true;
            console.log('✅ Without Aadhaar Radio Button Selected');
        } else {
            // Try alternate selector
            var altRadio = document.querySelector('input[name="aadhaarHoldingType"]');
            if (altRadio) {
                altRadio.disabled = false;
                altRadio.removeAttribute('disabled');
                console.log('✅ Aadhaar holding type enabled');
            }
            console.log('⚠️ Without Aadhaar radio button not found');
        }

        // Enable all fields
        document.querySelectorAll('input, select, textarea').forEach(function(el) {
            el.disabled = false;
            el.removeAttribute('disabled');
            el.removeAttribute('readonly');
        });

        // Remove required attributes
        document.querySelectorAll('[required]').forEach(function(el) {
            el.removeAttribute('required');
        });

        // Show hidden sections
        var hiddenDivs = document.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [hidden]');
        hiddenDivs.forEach(function(div) {
            var text = div.innerText || '';
            if (text.toLowerCase().includes('aadhaar') ||
                text.toLowerCase().includes('without') ||
                text.toLowerCase().includes('alternate')) {
                div.style.display = '';
                div.style.visibility = 'visible';
                div.removeAttribute('hidden');
                console.log('✅ Shown hidden div');
            }
        });

        console.log('✅ Without Aadhaar activation complete');
    }

    // ============================================
    // 2. SHOW STATUS INDICATOR
    // ============================================
    function showStatus() {
        var statusDiv = document.getElementById('withoutAadhaarStatus');
        if (statusDiv) return;

        statusDiv = document.createElement('div');
        statusDiv.id = 'withoutAadhaarStatus';
        statusDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: #28a745;
            color: white;
            border-radius: 10px;
            font-weight: bold;
            z-index: 99999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-size: 13px;
            border: 2px solid #1e7e34;
            text-align: center;
            max-width: 280px;
            font-family: Arial, sans-serif;
        `;
        statusDiv.innerHTML = '✅ Without Aadhaar Active<br><span style="font-size:11px;color:#d4edda;">OTP se authenticate karein</span>';
        document.body.appendChild(statusDiv);
        console.log('✅ Status indicator added');
    }

    // ============================================
    // 3. WATCH FOR PAGE CHANGES
    // ============================================
    function setupObserver() {
        var observer = new MutationObserver(function() {
            // Re-activate if needed
            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
            if (radio && radio.disabled) {
                console.log('🔄 Radio was disabled, re-activating...');
                activateWithoutAadhaar();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'style']
        });
        console.log('✅ Page observer setup complete');
    }

    // ============================================
    // 4. AUTO SUBMIT ON OTP (Optional)
    // ============================================
    function setupOTPAutoSubmit() {
        var otpField = document.querySelector('input[name="otpNumberSarathi"], input[id="otpNumberSarathi"]');
        if (otpField) {
            otpField.addEventListener('input', function() {
                if (this.value.length === 6) {
                    console.log('🔑 OTP Entered: ' + this.value);
                    console.log('🚀 Auto-submitting with Without Aadhaar...');

                    setTimeout(function() {
                        var form = document.querySelector('form');
                        if (form) {
                            // Enable all fields
                            document.querySelectorAll('input, select, textarea').forEach(function(el) {
                                el.disabled = false;
                                el.removeAttribute('disabled');
                                el.removeAttribute('readonly');
                            });
                            document.querySelectorAll('[required]').forEach(function(el) {
                                el.removeAttribute('required');
                            });
                            form.setAttribute('novalidate', 'novalidate');
                            form.noValidate = true;

                            // Ensure Without Aadhaar is selected
                            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
                            if (radio) {
                                radio.checked = true;
                            }

                            console.log('📤 Submitting form without Aadhaar...');
                            form.submit();
                        }
                    }, 1500);
                }
            });
            console.log('✅ OTP auto-submit setup complete');
        }
    }

    // ============================================
    // 5. MAIN EXECUTION
    // ============================================
    function init() {
        console.log('🚀 WITHOUT AADHAAR AUTO-ACTIVATE - INITIALIZING');

        // Wait for page to load
        setTimeout(function() {
            activateWithoutAadhaar();
            showStatus();
            setupObserver();

            // Setup OTP auto-submit after a delay
            setTimeout(setupOTPAutoSubmit, 1000);

            console.log('✅ WITHOUT AADHAAR AUTO-ACTIVATE - READY');
            console.log('📌 OTP daalte hi auto-submit ho jayega');
        }, 1000);
    }

    // Start
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // ============================================
    // 6. MANUAL COMMANDS
    // ============================================
    window.forceWithoutAadhaar = function() {
        console.log('🚀 Manual force Without Aadhaar...');
        activateWithoutAadhaar();
        var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
        if (radio) {
            radio.checked = true;
        }
        console.log('✅ Without Aadhaar forced');
    };

    window.quickSubmit = function() {
        console.log('🚀 Quick submit without Aadhaar...');
        var form = document.querySelector('form');
        if (form) {
            document.querySelectorAll('input, select, textarea').forEach(function(el) {
                el.disabled = false;
                el.removeAttribute('disabled');
                el.removeAttribute('readonly');
            });
            document.querySelectorAll('[required]').forEach(function(el) {
                el.removeAttribute('required');
            });
            form.setAttribute('novalidate', 'novalidate');
            form.noValidate = true;

            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
            if (radio) {
                radio.checked = true;
            }

            form.submit();
            console.log('✅ Form submitted without Aadhaar');
        }
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 Commands:');
    console.log('  forceWithoutAadhaar() - Force Without Aadhaar');
    console.log('  quickSubmit()         - Quick submit form');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

})();// ==UserScript==
// @name         Sarathi - Auto Activate Without Aadhaar
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically activates "Without Aadhaar" option on Sarathi
// @author       You
// @match        https://sarathi.parivahan.gov.in/sarathiservice/submitMobUpdForm.do
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*mob*.do
// @match        https://sarathi.parivahan.gov.in/sarathiservice/*ekyc*.do
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 WITHOUT AADHAAR AUTO-ACTIVATE - LOADED');

    // ============================================
    // 1. ACTIVATE WITHOUT AADHAAR OPTION
    // ============================================
    function activateWithoutAadhaar() {
        console.log('🔄 Activating Without Aadhaar option...');

        // Find and select "Without Aadhaar" radio button
        var noAadhaarRadio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');

        if (noAadhaarRadio) {
            noAadhaarRadio.disabled = false;
            noAadhaarRadio.removeAttribute('disabled');
            noAadhaarRadio.click();
            noAadhaarRadio.checked = true;
            console.log('✅ Without Aadhaar Radio Button Selected');
        } else {
            // Try alternate selector
            var altRadio = document.querySelector('input[name="aadhaarHoldingType"]');
            if (altRadio) {
                altRadio.disabled = false;
                altRadio.removeAttribute('disabled');
                console.log('✅ Aadhaar holding type enabled');
            }
            console.log('⚠️ Without Aadhaar radio button not found');
        }

        // Enable all fields
        document.querySelectorAll('input, select, textarea').forEach(function(el) {
            el.disabled = false;
            el.removeAttribute('disabled');
            el.removeAttribute('readonly');
        });

        // Remove required attributes
        document.querySelectorAll('[required]').forEach(function(el) {
            el.removeAttribute('required');
        });

        // Show hidden sections
        var hiddenDivs = document.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [hidden]');
        hiddenDivs.forEach(function(div) {
            var text = div.innerText || '';
            if (text.toLowerCase().includes('aadhaar') ||
                text.toLowerCase().includes('without') ||
                text.toLowerCase().includes('alternate')) {
                div.style.display = '';
                div.style.visibility = 'visible';
                div.removeAttribute('hidden');
                console.log('✅ Shown hidden div');
            }
        });

        console.log('✅ Without Aadhaar activation complete');
    }

    // ============================================
    // 2. SHOW STATUS INDICATOR
    // ============================================
    function showStatus() {
        var statusDiv = document.getElementById('withoutAadhaarStatus');
        if (statusDiv) return;

        statusDiv = document.createElement('div');
        statusDiv.id = 'withoutAadhaarStatus';
        statusDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: #28a745;
            color: white;
            border-radius: 10px;
            font-weight: bold;
            z-index: 99999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-size: 13px;
            border: 2px solid #1e7e34;
            text-align: center;
            max-width: 280px;
            font-family: Arial, sans-serif;
        `;
        statusDiv.innerHTML = '✅ Without Aadhaar Active<br><span style="font-size:11px;color:#d4edda;">OTP se authenticate karein</span>';
        document.body.appendChild(statusDiv);
        console.log('✅ Status indicator added');
    }

    // ============================================
    // 3. WATCH FOR PAGE CHANGES
    // ============================================
    function setupObserver() {
        var observer = new MutationObserver(function() {
            // Re-activate if needed
            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
            if (radio && radio.disabled) {
                console.log('🔄 Radio was disabled, re-activating...');
                activateWithoutAadhaar();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'style']
        });
        console.log('✅ Page observer setup complete');
    }

    // ============================================
    // 4. AUTO SUBMIT ON OTP (Optional)
    // ============================================
    function setupOTPAutoSubmit() {
        var otpField = document.querySelector('input[name="otpNumberSarathi"], input[id="otpNumberSarathi"]');
        if (otpField) {
            otpField.addEventListener('input', function() {
                if (this.value.length === 6) {
                    console.log('🔑 OTP Entered: ' + this.value);
                    console.log('🚀 Auto-submitting with Without Aadhaar...');

                    setTimeout(function() {
                        var form = document.querySelector('form');
                        if (form) {
                            // Enable all fields
                            document.querySelectorAll('input, select, textarea').forEach(function(el) {
                                el.disabled = false;
                                el.removeAttribute('disabled');
                                el.removeAttribute('readonly');
                            });
                            document.querySelectorAll('[required]').forEach(function(el) {
                                el.removeAttribute('required');
                            });
                            form.setAttribute('novalidate', 'novalidate');
                            form.noValidate = true;

                            // Ensure Without Aadhaar is selected
                            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
                            if (radio) {
                                radio.checked = true;
                            }

                            console.log('📤 Submitting form without Aadhaar...');
                            form.submit();
                        }
                    }, 1500);
                }
            });
            console.log('✅ OTP auto-submit setup complete');
        }
    }

    // ============================================
    // 5. MAIN EXECUTION
    // ============================================
    function init() {
        console.log('🚀 WITHOUT AADHAAR AUTO-ACTIVATE - INITIALIZING');

        // Wait for page to load
        setTimeout(function() {
            activateWithoutAadhaar();
            showStatus();
            setupObserver();

            // Setup OTP auto-submit after a delay
            setTimeout(setupOTPAutoSubmit, 1000);

            console.log('✅ WITHOUT AADHAAR AUTO-ACTIVATE - READY');
            console.log('📌 OTP daalte hi auto-submit ho jayega');
        }, 1000);
    }

    // Start
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // ============================================
    // 6. MANUAL COMMANDS
    // ============================================
    window.forceWithoutAadhaar = function() {
        console.log('🚀 Manual force Without Aadhaar...');
        activateWithoutAadhaar();
        var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
        if (radio) {
            radio.checked = true;
        }
        console.log('✅ Without Aadhaar forced');
    };

    window.quickSubmit = function() {
        console.log('🚀 Quick submit without Aadhaar...');
        var form = document.querySelector('form');
        if (form) {
            document.querySelectorAll('input, select, textarea').forEach(function(el) {
                el.disabled = false;
                el.removeAttribute('disabled');
                el.removeAttribute('readonly');
            });
            document.querySelectorAll('[required]').forEach(function(el) {
                el.removeAttribute('required');
            });
            form.setAttribute('novalidate', 'novalidate');
            form.noValidate = true;

            var radio = document.querySelector('input[name="aadhaarHoldingType"][value="0"]');
            if (radio) {
                radio.checked = true;
            }

            form.submit();
            console.log('✅ Form submitted without Aadhaar');
        }
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 Commands:');
    console.log('  forceWithoutAadhaar() - Force Without Aadhaar');
    console.log('  quickSubmit()         - Quick submit form');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

})();