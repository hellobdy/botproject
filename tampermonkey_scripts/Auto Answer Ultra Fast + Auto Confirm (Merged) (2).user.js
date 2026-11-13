// ==UserScript==
// @name         Auto Answer Ultra Fast + Auto Confirm (Merged)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Auto answer + auto confirm after 10 seconds (updated JSON URL)
// @match        https://sarathi.parivahan.gov.in/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ================= AUTO ANSWER SCRIPT =================

    // *** YOUR NEW JSON URL IS USED HERE ***
    const JSON_URL = "https://raw.githubusercontent.com/dpc121/dppan-app/refs/heads/main/newfatser.json";

    const ANSWER_MAP = new Map();

    // Fetch the JSON database
    fetch(JSON_URL)
        .then(r => r.json())
        .then(data => {
            data.forEach(item => {
                const key = extractKeyFromHTML(item.q);
                const choice = extractChoice(item.a);
                if (key && choice) {
                    ANSWER_MAP.set(key, choice);
                }
            });
            console.log("⚡ QA DB Indexed:", ANSWER_MAP.size);

            // **FIX #1: Try to answer immediately once DB is loaded**
            solveFast();
        })
        .catch(err => console.error("Failed to load QA database:", err));

    function extractKeyFromHTML(html) {
        let m = html.match(/base64,([^"]+)/);
        if (!m) return null;
        return m[1].substring(0, 400);
    }

    function extractKeyFromPage(src) {
        if (!src) return null;
        return src.replace(/^data:image\/(png|jpg|jpeg);base64,/, "").substring(0, 400);
    }

    function extractChoice(html) {
        let m = html.match(/choice[0-9]/i);
        return m ? m[0] : null;
    }

    function getQImg() {
        return document.querySelector("img[name='qframe']");
    }

    function solveFast() {
        if (!ANSWER_MAP.size) return; // Wait for DB to load

        const qImg = getQImg();
        if (!qImg || !qImg.src) return;

        const key = extractKeyFromPage(qImg.src);
        if (!key) return;

        const choiceId = ANSWER_MAP.get(key);
        if (!choiceId) return;

        const opt = document.getElementById(choiceId);
        if (opt) {
            opt.click();
            console.log("⚡ Auto Solved INSTANT ->", choiceId);
        }
    }

    // Watch for new questions
    const obs = new MutationObserver(() => {
        solveFast();
    });

    obs.observe(document.body, { childList: true, subtree: true });

    // Initial attempt
    setTimeout(solveFast, 300);

    // ================= AUTO CONFIRM SCRIPT =================

    function tryClick() {
        let btn = document.getElementById("confirmbut");

        if (btn) {
            btn.disabled = false;
            console.log("✅ Confirm button found, clicking...");
            btn.click();
        } else {
            console.log("⏳ Button not found, retrying...");
            setTimeout(tryClick, 1000);
        }
    }

    setTimeout(tryClick, 22000);
})();