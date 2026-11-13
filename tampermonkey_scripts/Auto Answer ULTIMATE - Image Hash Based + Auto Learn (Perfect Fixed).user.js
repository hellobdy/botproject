// ==UserScript==
// @name         Auto Answer ULTIMATE - Image Hash Based + Auto Learn (Perfect Fixed)
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  🔥 100% Accurate - Fixed Option Selection & Event Listeners
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const JSON_URL = "https://raw.githubusercontent.com/parmarprashant2122-sketch/maaonline/main/QA.json";

    // Advanced data structures
    const DB_IMAGES = new Map(); // hash => { choiceId, originalData }
    let dbLoaded = false;
    let processedQuestions = new Set();

    // ============== LOCAL STORAGE FOR AUTO-LEARN ==============
    const LEARNED_ANSWERS = new Map(); // hash => choiceId

    // Load learned answers from localStorage
    try {
        const saved = localStorage.getItem('LEARNED_ANSWERS');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(key => {
                LEARNED_ANSWERS.set(key, parsed[key]);
            });
            console.log(`📚 Local Storage થી ${LEARNED_ANSWERS.size} જવાબો લોડ થયા.`);
        }
    } catch(e) {
        console.log("હજુ સુધી કોઈ જવાબો સેવ નથી થયા.");
    }

    // Save learned answers to localStorage
    function saveLearnedAnswers() {
        try {
            const obj = {};
            LEARNED_ANSWERS.forEach((value, key) => {
                obj[key] = value;
            });
            localStorage.setItem('LEARNED_ANSWERS', JSON.stringify(obj));
            console.log("💾 બ્રાઉઝર મેમરી (LocalStorage) માં ડેટા સક્સેસફુલી સેવ થયો!");
        } catch(e) {
            console.error("❌ સેવ કરવામાં પ્રોબ્લેમ આવ્યો:", e);
        }
    }

    // ============== CAPTURE MANUAL ANSWERS ==============
    async function captureManualAnswer() {
        const qImg = getCurrentQuestionImage();
        if (!qImg) return;

        if (!qImg.complete) {
            await new Promise(r => { qImg.onload = r; setTimeout(r, 1000); });
        }

        const hash = getImageHashFromPage(qImg);
        if (!hash) return;

        // કયો ઓપ્શન સિલેક્ટ કર્યો છે તે શોધો
        const radios = document.querySelectorAll('input[type="radio"]');
        let selectedRadio = null;
        let selectedIndex = -1;

        for (let i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                selectedRadio = radios[i];
                selectedIndex = i;
                break;
            }
        }

        if (!selectedRadio) return;

        // Choice ID નક્કી કરવાનું મજબૂત લોજીક (પ્રાધાન્ય: ID -> Value -> Index)
        let choiceId = null;
        if (selectedRadio.id) {
            choiceId = selectedRadio.id;
        } else if (selectedRadio.value) {
            choiceId = selectedRadio.value;
        } else {
            choiceId = "idx-" + selectedIndex; // ક્રમ આધારિત સેવિંગ
        }

        if (choiceId && hash) {
            if (LEARNED_ANSWERS.get(hash) === choiceId) return;

            LEARNED_ANSWERS.set(hash, choiceId);
            saveLearnedAnswers();
            console.log(`🎯 નવો પ્રશ્ન શીખ્યો: Hash ${hash} → Option ID/Index: ${choiceId}`);

            DB_IMAGES.set(hash, {
                choiceId: choiceId,
                index: DB_IMAGES.size,
                originalHtml: "Learned from manual answer",
                verified: true
            });
        }
    }

    // ---------- IMPROVED HASH FUNCTION ----------
    function simpleHash(str) {
        if (!str) return null;
        let hash = 0;
        const utf8 = unescape(encodeURIComponent(str));
        for (let i = 0; i < utf8.length; i++) {
            const char = utf8.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // ---------- EXTRACT IMAGE DATA FROM HTML ==============
    function extractImageDataFromHTML(html) {
        if (!html) return null;
        try {
            let match = html.match(/src=["']data:image\/[^;]+;base64,([^"']+)["']/i);
            if (match && match[1]) {
                return { type: 'base64', data: match[1].replace(/[^A-Za-z0-9+/=]/g, '') };
            }
            match = html.match(/src=["']([^"']+\.(jpg|jpeg|png|gif|webp))["']/i);
            if (match && match[1]) { return { type: 'url', data: match[1] }; }
            match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (match && match[1]) { return { type: 'unknown', data: match[1] }; }
        } catch (e) {}
        return null;
    }

    // ---------- EXTRACT CHOICE FROM HTML ==============
    function extractChoiceFromHTML(html) {
        if (!html) return null;
        try {
            // જો ડાયરેક્ટ choice="1" જેવું ફોર્મેટ હોય (જેવું exportLearned માં બને છે)
            let directMatch = html.match(/choice=["']([^"']+)["']/i);
            if (directMatch) return directMatch[1];

            const asciiOnly = html.replace(/[^\x00-\x7F]/g, '');
            let match = asciiOnly.match(/(choice[0-9]+)/i);
            if (match) return match[1].toLowerCase();
            match = asciiOnly.match(/(option[0-9]+)/i);
            if (match) return match[1].toLowerCase();

            // જો ફક્ત આંકડો હોય
            match = asciiOnly.match(/\b([0-9]+)\b/);
            if (match) return match[1];
        } catch (e) {}
        return null;
    }

    // ---------- LOAD AND INDEX DATABASE ----------
    console.log("📦 GitHub QA ડેટાબેઝ લોડ થઈ રહ્યો છે...");

    fetch(JSON_URL)
        .then(r => r.json())
        .then(data => {
            let onlineCount = 0;
            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    const imgData = extractImageDataFromHTML(item.q);
                    const choiceId = extractChoiceFromHTML(item.a);
                    if (imgData && choiceId) {
                        const hash = simpleHash(imgData.data);
                        if (hash) {
                            DB_IMAGES.set(hash, {
                                choiceId: choiceId,
                                index: index,
                                originalHtml: item.q.substring(0, 200),
                                verified: false
                            });
                            onlineCount++;
                        }
                    }
                });
            }
            console.log(`🌐 GitHub પરથી ${onlineCount} પ્રશ્નો લોડ થયા.`);
            mergeLocalAndDB();
        })
        .catch(err => {
            console.error("❌ GitHub ડેટા લોડ ન થયો, લોકલ ડેટા ચાલુ રહેશે.");
            mergeLocalAndDB();
        });

    function mergeLocalAndDB() {
        LEARNED_ANSWERS.forEach((choiceId, hash) => {
            DB_IMAGES.set(hash, {
                choiceId: choiceId,
                index: DB_IMAGES.size,
                originalHtml: "Learned from manual answer",
                verified: true
            });
        });
        dbLoaded = true;
        console.log(`✅ ડેટાબેઝ રેડી! ટોટલ ${DB_IMAGES.size} પ્રશ્નો મેમરીમાં સેટ છે.`);
    }

    // ---------- GET CURRENT QUESTION IMAGE ----------
    function getCurrentQuestionImage() {
        const selectors = [
            "img[name='qframe']", "img[name*='question' i]", "img[name*='q' i]",
            "img[src*='base64']", "img.question-image", "img.question",
            "#questionImage", ".questionImg", "img[alt*='question' i]",
            "img[class*='question' i]", "img[data-testid*='question' i]"
        ];
        for (let selector of selectors) {
            try {
                const img = document.querySelector(selector);
                if (img && img.src) return img;
            } catch (e) {}
        }
        return null;
    }

    // ---------- GET IMAGE HASH FROM PAGE ----------
    function getImageHashFromPage(img) {
        if (!img || !img.src) return null;
        try {
            if (img.src.includes('base64,')) {
                const base64 = img.src.split('base64,')[1];
                if (base64) {
                    return simpleHash(base64.replace(/[^A-Za-z0-9+/=]/g, ''));
                }
            }
            return simpleHash(img.src);
        } catch (e) {
            return null;
        }
    }

    // ---------- FIXED EXACT OPTION FINDER ----------
    function findExactOption(choiceId) {
        if (!choiceId) return null;

        const radios = document.querySelectorAll('input[type="radio"]');
        if (radios.length === 0) return null;

        // 1. જો આપણું પોતાનું ઇન્ડેક્સ ફોર્મેટ હોય (idx-0, idx-1...)
        if (typeof choiceId === 'string' && choiceId.startsWith('idx-')) {
            const idx = parseInt(choiceId.replace('idx-', ''));
            if (!isNaN(idx) && radios[idx]) return radios[idx];
        }

        // 2. Exact ID Match
        let el = document.getElementById(choiceId);
        if (el && el.type === 'radio') return el;

        // 3. By Value Match
        el = document.querySelector(`input[type="radio"][value="${choiceId}"]`);
        if (el) return el;

        // 4. ક્રમ આધારિત મેચિંગ (જો ડેટાબેઝમાં ફક્ત 1, 2, 3, 4 લખેલું આવ્યું હોય)
        const numericId = parseInt(choiceId);
        if (!isNaN(numericId)) {
            // 1-બાઝડ ચેક (દા.ત. choiceId = "1" એટલે પહેલો રેડિયો)
            if (numericId >= 1 && radios.length >= numericId) {
                return radios[numericId - 1];
            }
            // 0-બાઝડ ચેક (દા.ત. choiceId = "0" એટલે પહેલો રેડિયો)
            if (numericId >= 0 && radios.length > numericId) {
                return radios[numericId];
            }
        }

        return null;
    }

    // ---------- MAIN SOLVE FUNCTION ----------
    async function solveWithHash() {
        if (!dbLoaded) return;

        const qImg = getCurrentQuestionImage();
        if (!qImg) return;

        if (!qImg.complete) {
            await new Promise(r => { qImg.onload = r; setTimeout(r, 1000); });
        }

        const hash = getImageHashFromPage(qImg);
        if (!hash) return;

        if (processedQuestions.has(hash)) return;

        const dbEntry = DB_IMAGES.get(hash);
        if (!dbEntry) return;

        console.log(`🎯 મેચ મળી ગયો! ઓટો-સિલેક્ટ થાય છે Option/ID: ${dbEntry.choiceId}`);

        const option = findExactOption(dbEntry.choiceId);
        if (!option) {
            console.log("❌ ઓપ્શન રેડિયો બટન પેજ પર મળ્યું નહીં અથવા આઈડી મેચ ન થઈ.");
            return;
        }

        try {
            // Visual feedback (ગ્રીન કલર હાઈલાઈટ)
            option.style.outline = "3px solid #00ff00";
            option.style.outlineOffset = "3px";

            option.checked = true;
            option.click();
            option.dispatchEvent(new Event('change', { bubbles: true }));

            processedQuestions.add(hash);

            setTimeout(() => {
                option.style.outline = "";
            }, 1500);

        } catch (e) {
            console.error("ઓટો-ક્લિક ફેલ ગયું:", e);
        }
    }

    // ---------- OBSERVER & TIMERS ----------
    let timeoutId = null;
    const observer = new MutationObserver(() => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { solveWithHash(); }, 200);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });

    setInterval(() => { solveWithHash(); }, 1500);

    // ============== EVENT LISTENERS FOR LEARNING (FIXED CASE) ==============
    document.addEventListener('click', function(e) {
        if (e.target && e.target.type === 'radio') {
            setTimeout(captureManualAnswer, 200);
        }
    }, true);

    document.addEventListener('change', function(e) {
        if (e.target && e.target.type === 'radio') {
            setTimeout(captureManualAnswer, 200);
        }
    }, true);

    // Manual Export (F12 Console માં exportLearned() લખવું)
    window.exportLearned = function() {
        const arr = [];
        LEARNED_ANSWERS.forEach((value, key) => {
            arr.push({
                "q": `<img src="data:image/png;base64,${key}">`,
                "a": `choice="${value}"`
            });
        });
        console.log("📤 નીચેનો ડેટા કોપી કરીને GitHub ની QA.json ફાઈલમાં પેસ્ટ કરો:");
        console.log(JSON.stringify(arr, null, 2));
        return arr;
    };

    console.log("🚀 Auto Answer સ્ક્રિપ્ટ પરફેક્ટ રીપેર થઈ ગઈ છે! ટેસ્ટ આપવાનું શરૂ કરો.");
})();