// ==UserScript==
// @name         Sarathi Exam Screenshot (Riyan Final Fix) 🚀
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  Same display capture, No buttons, Original Riyan Logic
// @author       Riyan Computer Services
// @match        https://sarathi.parivahan.gov.in/sarathiservice/examselectaction.do*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. Library Load Check (Iske bina script kaam nahi karti)
    if (!window.html2canvas) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        document.head.appendChild(script);
    }

    // 2. Hindi to English Mapping (Wahi SEM jo aapne bheja)
    const hindiToEnglishMap = {
        'आवेदक का नाम': 'Applicant Name',
        'आवेदन संख्या': 'Application Number',
        'परीक्षा तिथि': 'Exam Date',
        'सफल': 'PASSED',
        'उत्तीर्ण': 'PASSED',
        'बधाई हो': '🎉 CONGRATULATIONS! 🎉',
        'आप उत्तीर्ण हुए हैं': 'YOU HAVE PASSED'
    };

    let isProcessing = false;
    let lastAppNo = "";

    // 3. Translation Function (SEM Logic)
    function convertToEnglish(doc) {
        const walk = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walk.nextNode()) {
            for (const [hindi, english] of Object.entries(hindiToEnglishMap)) {
                if (node.nodeValue.includes(hindi)) {
                    node.nodeValue = node.nodeValue.split(hindi).join(english);
                }
            }
        }
    }

    // 4. MAIN CAPTURE LOGIC
    async function startCapture() {
        if (isProcessing || !window.html2canvas) return;

        const iframe = document.getElementById('stallexam');
        if (!iframe) return;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.body) return;

        // Check if Result is out
        const text = doc.body.innerText;
        if (!text.includes('Congratulations') && !text.includes('बधाई') && !text.includes('उत्तीर्ण')) return;

        // Extract App No to avoid double screenshot
        const match = text.match(/\d{10,}/);
        const currentAppNo = match ? match[0] : "Result";
        if (currentAppNo === lastAppNo) return;

        isProcessing = true;
        lastAppNo = currentAppNo;

        // Hide Buttons (Main Page + Iframe)
        const hide = (d) => d.querySelectorAll('button, .btn, [style*="fixed"], #riyan-panel').forEach(b => b.style.opacity = '0');
        hide(document);
        hide(doc);

        // Convert Text
        convertToEnglish(doc);

        setTimeout(async () => {
            try {
                const canvas = await html2canvas(doc.body, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                // Auto Download
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `${currentAppNo}.png`;
                link.click();

                // Save for Copy Button
                window.lastScreenshot = canvas.toDataURL('image/png');
            } catch (e) { console.error(e); }

            // Restore Buttons
            const show = (d) => d.querySelectorAll('button, .btn, [style*="fixed"], #riyan-panel').forEach(b => b.style.opacity = '1');
            show(document);
            show(doc);
            isProcessing = false;
        }, 1000);
    }

    // Monitor for Result
    setInterval(startCapture, 2000);

    // Small Copy Button for Riyan Bhai
    const copyBtn = document.createElement('button');
    copyBtn.innerText = "📋 COPY";
    copyBtn.style = "position:fixed; bottom:20px; right:20px; z-index:999999; background:#007bff; color:white; border:none; border-radius:50px; padding:10px 20px; font-weight:bold; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.3);";
    copyBtn.onclick = async () => {
        if (!window.lastScreenshot) return alert("Pehle Result aane dein!");
        const resp = await fetch(window.lastScreenshot);
        const blob = await resp.blob();
        await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
        copyBtn.innerText = "✅ COPIED";
        setTimeout(() => copyBtn.innerText = "📋 COPY", 2000);
    };
    document.body.appendChild(copyBtn);

})();