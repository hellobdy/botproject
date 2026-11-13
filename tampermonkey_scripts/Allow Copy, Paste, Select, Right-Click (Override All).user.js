// ==UserScript==
// @name         Allow Copy, Paste, Select, Right-Click (Override All)
// @namespace    http://tampermonkey.net/
// @version      v7.0
// @description  Bypass copy-paste, selection, right-click restrictions on any website
// @author       mohan.devx
// @match        https://sarathi.parivahan.gov.in/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    window.reload = null;
    // --- 1. Stop websites from blocking events ---
    const events = [
        'copy','cut','paste','contextmenu','select','selectstart','mousedown','mouseup',
        'keydown','keypress','keyup','dragstart'
    ];

    events.forEach(event => {
        window.addEventListener(event, function(e) {
            e.stopPropagation();
        }, true);
    });

    // --- 2. Force CSS to allow selection & pointer events ---
    const css = `
        * {
            -webkit-user-select: text !important;
            user-select: text !important;
            pointer-events: auto !important;
        }
    `;

    const style = document.createElement("style");
    style.innerHTML = css;
    document.documentElement.appendChild(style);

    // --- 3. Remove inline "on..." event blockers ---
    const removeInlineBlocks = () => {
        document.querySelectorAll('*').forEach(el => {
            ['oncopy','onpaste','oncut','oncontextmenu','onselectstart','onkeydown']
                .forEach(attr => el[attr] = null);
        });
    };

    // Run once DOM is ready
    document.addEventListener('DOMContentLoaded', removeInlineBlocks);
})();