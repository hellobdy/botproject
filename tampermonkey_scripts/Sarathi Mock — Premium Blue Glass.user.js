// ==UserScript==
// @name         Sarathi Mock — Premium Blue Glass
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Sarathi mock — blue glass, bottom-left, aspect-locked resize, captcha + getstate flow
// @match        *://sarathi.nic.in/*
// @match        https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    const STORAGE_RTO  = 'sarathi_mock_rto';
    const STORAGE_SIZE = 'sarathi_mock_size';
    const DEFAULT_RTO  = '';
    const AUTO_RUN     = false;

    const BASE_W    = 240;
    const BASE_FS   = 10.5;
    const DEF_W     = 300;
    const DEF_H     = 375;
    const ASPECT    = DEF_W / DEF_H;
    const MIN_W     = 180;
    const MIN_H     = MIN_W / ASPECT;
    const MAX_W_CAP = 720;
    const MARGIN    = 20;

    // ================= MOCK DATA =================
    const mockResponse = [
        "A", "P", "", "KA", 0, 0, null, "KA02",
        null, null, "faceAuthReq", "AI", "10", "null",
        "watched", "resendPassword", "NoQuotaFlag",
        "proctorReq", "Y", "visit RTO", 1
    ];

    // ================= RTO HELPERS =================
    function normalizeRto(v) { return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    function isValidRto(v)   { return /^[A-Z]{2}\d{1,3}$/.test(v); }
    function applyRto(rto) {
        rto = normalizeRto(rto);
        if (!isValidRto(rto)) return false;
        mockResponse[7] = rto;
        mockResponse[3] = rto.substring(0, 2);
        try { localStorage.setItem(STORAGE_RTO, rto); } catch (e) {}
        return true;
    }
    applyRto(localStorage.getItem(STORAGE_RTO) || DEFAULT_RTO);

    // ================= MOCK FUNCTION =================
    window.mockFunction = function (data) {
        if (!Array.isArray(data) || data.length < 21) throw new Error("Invalid test fixture");
        var entcapt = sessionStorage.getItem('entcaptxt');
        try {
            $("#captcha").hide(); $("#captsubmit").hide();
            $("#dobdiv").show();  $("#pwddiv").show();
            $("#llappln").hide(); $("#applnodiv").hide();
            progressStart(); applValidate();
            document.forms["authentication"]["pwd"].focus();
            stcd = data[3]; applimg = data[13];

            if (data[0] == "smartLock") {
                document.forms["authentication"].action = "smartLockDownload.do";
                document.forms["authentication"].submit();
            }
            if (data[0] === 'firefox') {
                $("#validBrowser").show();
                document.forms["authentication"]["llappln"].value = "";
                document.forms["authentication"]["llappln"].focus();
            }
            if (data[0] == "State_is_different") {
                $("#State_is_different").show();
                $("#dobdiv").hide(); $("#pwddiv").hide();
            }
            if (data[18] === 'Y') create_hs($("#llappln").val(), 'Anugyna');

            if (data[13] == 'resendPassword' || data[15] == 'resendPassword' || data[12] == 'resendPassword') {
                $("#resend").show(); $("#resendtxt").show();
            }

            if (data[12] == 'notwatched' || data[13] == 'notwatched' || data[14] == 'notwatched') {
                document.getElementById("hidst").value = data[1];
                $("#selectDevice,#service,#applet,#sarathiButton,#otpButton,#sarthiOtp,#verifywithOTP").hide();
                $("#dobdiv,#pwddiv,#tutorial").show();
                $("#faceAuthReq,#NoFaceAuthReq,#proctorReq,#allowedInRTO,#NoExam,#scheduleDate,#completeFlow,#quotaFlag,#faceauthmaxtimeallowed,#faceauthmaxtimeallowedDL").hide();
                $("#smartLogout").show();
            }
            if (data[14] === 'quotaFlag' || data[15] === 'quotaFlag' || data[16] === 'quotaFlag') {
                document.getElementById("hidst").value = data[1];
                $("#selectDevice,#service,#applet,#sarathiButton,#otpButton,#sarthiOtp,#verifywithOTP").hide();
                $("#dobdiv,#pwddiv,#quotaFlag").show();
                $("#faceAuthReq,#proctorReq,#NoFaceAuthReq,#allowedInRTO,#NoExam,#scheduleDate,#completeFlow,#faceauthmaxtimeallowed,#faceauthmaxtimeallowedDL").hide();
                $("#smartLogout").show();
            }

            if (data[1] == 'B') {
                if (data[3] == 'DL') {
                    document.getElementById("hidst").value = data[1];
                    $("#selectDevice,#dobdiv,#service,#applet,#sarathiButton,#otpButton").hide();
                    $("#pwddiv").show();
                } else {
                    document.getElementById("hidst").value = data[1];
                    $("#selectDevice,#service,#applet,#sarathiButton,#allowedInRTO,#otpButton").hide();
                    $("#dobdiv,#pwddiv").show();
                }
                if (data[10] == "NOfaceAuthReq") $("#NoFaceAuthReq").show();
                if (data[10] == "bioAuth") { $("#NoFaceAuthReq").show(); document.getElementById("bioReq").value = "true"; }
                $("#scheduleDate").hide();

            } else if (data[1] == 'A') {
                document.getElementById("hidst").value = data[1];
                document.getElementById("addharThumbCount").value = data[4];
                document.getElementById("aadharOTP").value = data[5];
                document.getElementById("addharNumber").value = data[6];
                document.getElementById("rtocode").value = data[7];
                $("#pwddiv,#dobdiv,#service,#sarathiButton").hide();
                document.getElementById("otpButton").style.display = '';
                if (data[9] != null) document.getElementById("otpTxn").value = data[9];
                if (data[6] == null || data[5] >= 1) {
                    document.getElementById("sarathiButton").style.display = '';
                    document.getElementById("otpTxn").value = data[8];
                    document.getElementById("sarathiOtps").value = "";
                    $("#otpButton").hide();
                }

            } else if (data[1] == 'S') {
                document.getElementById("hidst").value = data[1];
                document.getElementById("addharThumbCount").value = data[4];
                document.getElementById("aadharOTP").value = data[5];
                document.getElementById("addharNumber").value = data[6];
                document.getElementById("rtocode").value = data[7];
                $("#pwddiv,#dobdiv,#service,#otpButton").hide();
                document.getElementById("sarathiButton").style.display = '';
                document.getElementById("otpTxn").value = data[8];
                document.getElementById("sarathiOtps").value = "";

            } else if (data[1] == 'N') {
                if (data[3] == 'DL') {
                    document.getElementById("hidst").value = data[1];
                    $("#selectDevice,#dobdiv,#service,#applet,#sarathiButton,#otpButton").hide();
                    $("#pwddiv").show();
                } else {
                    document.getElementById("hidst").value = data[1];
                    $("#selectDevice,#service,#applet,#sarathiButton,#otpButton,#allowedInRTO").hide();
                    $("#dobdiv,#pwddiv").show();
                }
                const scen = data[10];
                if (scen == "NOfaceAuthReq") $("#NoFaceAuthReq").show();
                else if (scen == "bioAuth") { $("#NoFaceAuthReq").show(); document.getElementById("bioReq").value = "true"; }
                else if (scen == "attemptMaxtimes") {
                    if (sessionStorage.getItem("authType") === 'Anugyna') $("#smartfaceauthmaxtimeallowedDL").show();
                    else $("#faceauthmaxtimeallowed").show();
                    $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "attemptMaxtimeDL") {
                    $("#faceauthmaxtimeallowedDL").show();
                    $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "attemptMaxtimeslot") {
                    $("#faceauthmaxtimeallowedslot").show();
                    $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "alreadyCompleted") {
                    $("#alreadyCompleted").show();
                    $("#retestApplication,#expiredApplication,#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "retestApplication") {
                    $("#retestApplication").show();
                    document.getElementById("retestApp").innerHTML = data[11];
                    $("#alreadyCompleted,#expiredApplication,#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "expiredApplication") {
                    $("#expiredApplication").show();
                    $("#alreadyCompleted,#retestApplication,#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "NoExam") {
                    if (sessionStorage.getItem("authType") === 'Anugyna') $("#NoExam").hide(); else $("#NoExam").show();
                    $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "allowedInRTO") {
                    $("#allowedInRTO").show(); $("#NoExam").hide();
                    $("#NoFaceAuthReq,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                } else if (scen == "maxLogins") {
                    $("#maxLogins").show();
                    $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate").hide();
                    $("#smartLogout").show();
                }
                $("#scheduleDate").hide();

            } else if (data[1] == 'F' || data[1] == 'P') {
                document.getElementById("rtocode").value = data[7];
                document.getElementById("scFaceAuthReqAiLib").value = data[11];
                document.getElementById("maxText").innerHTML = data[12];
                document.getElementById("maxTimes").innerHTML = data[12];

                const nextLabels = ["Upload Photo", "Capture Photo", "visit RTO"];
                for (let i = 16; i <= 19; i++) {
                    if (nextLabels.includes(data[i])) {
                        document.getElementById("nextText").innerHTML = data[i];
                        if (data[i + 1] > 0) document.getElementById("scCnt").innerHTML = data[i + 1] + " of " + data[12] + " Attempts";
                        break;
                    }
                }
                if (data[15] == "proctorReq" || data[16] == "proctorReq" || data[17] == "proctorReq") {
                    if (data[15] == "proctorReq") document.getElementById("smartExam").value = data[16];
                    else if (data[16] == "proctorReq") document.getElementById("smartExam").value = data[17];
                    else if (data[17] == "proctorReq") document.getElementById("smartExam").value = data[18];
                }
                if (data[12] == 'notwatched' || data[13] == 'notwatched' || data[14] == 'notwatched') {
                    document.getElementById("hidst").value = data[1]; $("#faceAuthReq").hide();
                }
                if (data[14] === 'quotaFlag' || data[15] === 'quotaFlag' || data[16] === 'quotaFlag') $("#faceAuthReq").hide();

                const isDL = (data[3] == 'DL');
                document.getElementById("hidst").value = data[1];
                if (isDL) {
                    $("#selectDevice,#dobdiv,#service,#applet,#sarathiButton,#otpButton,#quotaFlag,#scheduleDate").hide();
                    $("#pwddiv").show();
                } else {
                    $("#selectDevice,#service,#applet,#sarathiButton,#otpButton,#quotaFlag,#scheduleDate").hide();
                    $("#dobdiv,#pwddiv").show();
                }
                const sc = data[10];
                const hideAll = () => $("#NoFaceAuthReq,#allowedInRTO,#faceAuthReq,#proctorReq,#scheduleDate,#NoExam,#maxLogins,#completeFlow,#photoUpload,#smartphotoUpload,#capturePhoto,#alreadyCompleted,#retestApplication,#expiredApplication").hide();

                if (sc == "faceAuthReq") {
                    if (data[15] == "proctorReq" || data[16] == "proctorReq" || data[17] == "proctorReq") $("#proctorReq").show();
                    if (!isDL && sessionStorage.getItem("authType") === 'Anugyna') create_hs($("#llappln").val(), "faceAuthReq");
                    else $("#faceAuthReq").show();
                    videoload();
                } else if (sc == "attemptMaxtimes") {
                    hideAll();
                    if (sessionStorage.getItem("authType") === 'Anugyna') $("#smartfaceauthmaxtimeallowedDL").show();
                    else $("#faceauthmaxtimeallowed").show();
                    $("#smartLogout").show();
                } else if (sc == "attemptMaxtimeDL") {
                    hideAll(); $("#faceauthmaxtimeallowedDL").show(); $("#smartLogout").show();
                } else if (sc == "attemptMaxtimeslot") {
                    hideAll(); $("#faceauthmaxtimeallowedslot").show(); $("#smartLogout").show();
                } else if (sc == "alreadyCompleted") {
                    hideAll(); $("#alreadyCompleted").show(); $("#smartLogout").show();
                } else if (sc == "retestApplication") {
                    hideAll(); $("#retestApplication").show();
                    document.getElementById("retestApp").innerHTML = data[11];
                    $("#smartLogout").show();
                } else if (sc == "expiredApplication") {
                    hideAll(); $("#expiredApplication").show(); $("#smartLogout").show();
                } else if (sc == "NoExam") {
                    hideAll();
                    if (sessionStorage.getItem("authType") === 'Anugyna') $("#NoExam").hide(); else $("#NoExam").show();
                    $("#smartLogout").show();
                } else if (sc == "allowedInRTO") {
                    hideAll(); $("#allowedInRTO").show(); $("#smartLogout").show();
                } else if (sc == "maxLogins") {
                    hideAll(); $("#maxLogins").show(); $("#smartLogout").show();
                } else if (sc == "photoUpload") {
                    hideAll();
                    if (!isDL && sessionStorage.getItem("authType") === 'Anugyna') $("#smartphotoUpload").show();
                    else $("#photoUpload").show();
                    $("#smartLogout").show();
                } else if (sc == "capturePhoto") {
                    hideAll(); $("#capturePhoto").show(); $("#smartLogout").show();
                } else if (sc == "completeFlow") {
                    hideAll();
                    if (sessionStorage.getItem("authType") === 'Anugyna') $("#completeFlow").hide(); else $("#completeFlow").show();
                    $("#smartLogout").show();
                } else if (sc == "scheduleDate") {
                    hideAll(); $("#scheduleDate").show(); $("#smartLogout").show();
                } else {
                    if (sc == "NOfaceAuthReq") $("#NoFaceAuthReq").show();
                    if (sc == "bioAuth") { $("#NoFaceAuthReq").show(); document.getElementById("bioReq").value = "true"; }
                    $("#smartLogout,#scheduleDate").hide();
                }
            } else {
                $("#validAppl").show();
                document.forms["authentication"]["llappln"].value = "";
                document.forms["authentication"]["llappln"].focus();
            }

            if (window.__sarathiMockSetStatus) {
                window.__sarathiMockSetStatus('success', 'Mock executed • RTO ' + data[7]);
            }
        } catch (err) {
            console.log("mockFunction error:", err);
            if (window.__sarathiMockSetStatus) {
                window.__sarathiMockSetStatus('error', err.message || 'Mock failed');
            }
        }
    };

    // ================= CAPTCHA + GETSTATE FLOW =================
    window.validateSubmit = function () {
        var applicationNumber = document.forms["authentication"]["llappln"];
        var entcaptxt = $("#entcaptxt").val();
        sessionStorage.setItem('entcaptxt', entcaptxt);

        if (applicationNumber.value.trim() == "") {
            alert('Please Enter Application Number.');
            applicationNumber.focus();
            return false;
        }
        if (entcaptxt.trim() == "") {
            alert("Please Enter Captcha.");
            document.getElementById('entcaptxt').focus();
            return false;
        }

        if (window.__sarathiMockSetStatus) window.__sarathiMockSetStatus('warn', 'Validating captcha…');

        try {
            $.ajax({
                type: 'POST',
                url: 'getcaptcha.do',
                data: { entcaptxt: entcaptxt, llappln: applicationNumber.value.trim() },
                cache: false,
                async: false,
                dataType: 'json',
                success: function (data) {
                    if (entcaptxt === data[0]) {
                        // ✔ Captcha matched → getstate.do (404 → ignore) → mockFunction
                        if (window.__sarathiMockSetStatus) {
                            window.__sarathiMockSetStatus('warn', 'Fetching state…');
                        }

                        try {
                            $.ajax({
                                type: 'POST',
                                url: 'getstate.do',
                                data: {
                                    applno: applicationNumber.value.trim(),
                                    entcapt: entcaptxt
                                },
                                dataType: 'json',
                                timeout: 3000
                            }).always(function () {
                                // Ignore 404 / success payload — proceed to mock
                                try { window.mockFunction(mockResponse); }
                                catch (e) {
                                    console.error('[Sarathi Mock] mockFunction threw:', e);
                                    if (window.__sarathiMockSetStatus) window.__sarathiMockSetStatus('error', e.message);
                                }
                            });
                        } catch (e) {
                            // Safety net — if getstate.do throws synchronously, still run mock
                            try { window.mockFunction(mockResponse); }
                            catch (e2) {
                                console.error('[Sarathi Mock] mockFunction threw:', e2);
                                if (window.__sarathiMockSetStatus) window.__sarathiMockSetStatus('error', e2.message);
                            }
                        }
                    } else {
                        if (window.__sarathiMockSetStatus) window.__sarathiMockSetStatus('error', 'Captcha not matched');
                        document.getElementById("nextText").innerHTML = "Captcha is not matched, please try again";
                        alert("Captcha is not matched, please try again");
                        changeCaptcha();
                        document.forms["authentication"]["entcaptxt"].value = "";
                        document.forms["authentication"]["llappln"].focus();
                    }
                },
                error: function () {
                    if (window.__sarathiMockSetStatus) window.__sarathiMockSetStatus('error', 'Captcha request failed');
                    alert("Captcha is not matched, please try again");
                    changeCaptcha();
                    document.forms["authentication"]["entcaptxt"].value = "";
                    document.forms["authentication"]["llappln"].focus();
                }
            });
        } catch (err) {
            console.error('[Sarathi Mock] validateSubmit:', err);
        }
        return false;
    };

    // ================= STYLES =================
    function injectStyles() {
        if (document.getElementById('sarathi-mock-styles')) return;
        const s = document.createElement('style');
        s.id = 'sarathi-mock-styles';
        s.textContent = `
        #sarathi-mock-panel {
            position: fixed;
            left: ${MARGIN}px; top: ${MARGIN}px;
            z-index: 2147483647;
            width: ${DEF_W}px; height: ${DEF_H}px;
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif;
            font-size: ${BASE_FS}px;
            color: #f8fafc;
            border-radius: 1.4em;
            box-shadow:
                0 24px 64px -12px rgba(0, 30, 90, 0.6),
                0 8px 20px -8px rgba(0, 20, 60, 0.45),
                0 0 0 1px rgba(125, 211, 252, 0.08),
                0 0 40px -8px rgba(0, 183, 255, 0.15),
                inset 0 1px 0 rgba(180, 240, 255, 0.15),
                inset 0 0 40px rgba(0, 183, 255, 0.03);
            overflow: hidden;
            animation: sm-enter 0.45s cubic-bezier(0.16,1,0.3,1);
            box-sizing: border-box;
            user-select: none;
            -webkit-font-smoothing: antialiased;
            isolation: isolate;
        }
        #sarathi-mock-panel::before {
            content: ""; position: absolute; inset: 0; border-radius: inherit;
            z-index: -2;
            background:
                linear-gradient(340deg,
                    rgb(0 183 255 / 7%) 0%,
                    rgb(59 241 255 / 14%) 30%,
                    rgba(255, 255, 255, 0.02) 60%,
                    rgb(34 15 250 / 38%) 100%),
                linear-gradient(180deg,
                    rgb(35 97 197 / 98%),
                    rgba(15, 23, 42, 0.85));
            backdrop-filter: blur(16px) saturate(140%) brightness(1.0);
            -webkit-backdrop-filter: blur(16px) saturate(140%) brightness(1.0);
        }
        #sarathi-mock-panel::after {
            content: ""; position: absolute; inset: 0; border-radius: inherit;
            z-index: -1;
            padding: 1px;
            background: linear-gradient(160deg,
                rgba(125, 240, 255, 0.28) 0%,
                rgba(125, 240, 255, 0.06) 18%,
                rgba(255, 255, 255, 0.01) 50%,
                rgba(255, 255, 255, 0.03) 78%,
                rgba(125, 240, 255, 0.16) 100%);
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor; mask-composite: exclude;
            pointer-events: none;
        }
        #sarathi-mock-panel .sm-noise {
            position: absolute; inset: 0; border-radius: inherit;
            z-index: -1; pointer-events: none;
            opacity: 0.25; mix-blend-mode: overlay;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>");
        }
        @keyframes sm-enter { from {opacity:0;transform:translateY(16px) scale(.96)} to {opacity:1;transform:none} }
        @keyframes sm-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

        .sm-header {
            position: relative; z-index: 2;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.9em 1em 0.7em;
            cursor: grab;
            border-bottom: 1px solid rgba(180, 240, 255, 0.10);
            flex-shrink: 0;
        }
        .sm-header:active { cursor: grabbing; }
        .sm-brand { display: flex; align-items: center; gap: 0.7em; min-width: 0; }
        .sm-icon {
            width: 2em; height: 2em; border-radius: 0.7em;
            background: linear-gradient(135deg, #00c6ff 0%, #4f46e5 100%);
            display: flex; align-items: center; justify-content: center;
            font-size: 1em; line-height: 1; flex-shrink: 0;
            box-shadow:
                0 0.35em 1em -0.15em rgba(79, 70, 229, 0.65),
                0 0 0 1px rgba(125, 240, 255, 0.22),
                inset 0 1px 0 rgba(255, 255, 255, 0.4);
            position: relative;
        }
        .sm-icon::after {
            content: ""; position: absolute; inset: 0; border-radius: inherit;
            background: linear-gradient(135deg, transparent, rgba(255,255,255,0.22));
            pointer-events: none;
        }
        .sm-title-group { display: flex; flex-direction: column; gap: 0.1em; min-width: 0; }
        .sm-title {
            font-size: 0.95em; font-weight: 700; letter-spacing: 0.02em;
            color: #f8fafc; line-height: 1.15;
            text-shadow: 0 1px 2px rgba(0, 0, 20, 0.4);
        }
        .sm-subtitle {
            font-size: 0.6em; font-weight: 500; letter-spacing: 0.14em;
            text-transform: uppercase; color: rgba(205, 225, 245, 0.95);
            display: flex; align-items: center; gap: 0.5em;
            text-shadow: 0 1px 1px rgba(0, 0, 20, 0.35);
        }
        .sm-scale-badge {
            font-size: 0.95em; letter-spacing: 0.05em;
            color: #a5e8ff;
            font-family: "SF Mono", Consolas, monospace;
            padding: 0.05em 0.4em; border-radius: 0.35em;
            background: rgba(125, 211, 252, 0.14);
            border: 1px solid rgba(125, 211, 252, 0.28);
            line-height: 1.3;
        }
        .sm-min-btn {
            width: 1.7em; height: 1.7em; padding: 0;
            border-radius: 0.5em;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(180, 240, 255, 0.18);
            color: rgba(230, 240, 250, 0.9);
            font-size: 0.95em; font-weight: 500;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            line-height: 1; flex-shrink: 0;
            transition: all .18s ease;
        }
        .sm-min-btn:hover { background: rgba(125, 211, 252, 0.22); color: #fff; border-color: rgba(125, 211, 252, 0.4); }
        .sm-min-btn:active { transform: scale(.94); }

        .sm-body {
            position: relative; z-index: 2;
            min-height: 0;
            overflow-y: auto; overflow-x: hidden;
            padding: 0.2em 1em 0.4em;
            transition: opacity .25s ease;
        }
        .sm-body.sm-collapsed {
            flex: 0 0 0; padding: 0; opacity: 0;
            pointer-events: none; overflow: hidden;
        }
        .sm-body::-webkit-scrollbar { width: 0.35em; }
        .sm-body::-webkit-scrollbar-track { background: transparent; }
        .sm-body::-webkit-scrollbar-thumb {
            background: rgba(125, 211, 252, 0.3); border-radius: 0.2em;
        }
        .sm-body::-webkit-scrollbar-thumb:hover { background: rgba(125, 211, 252, 0.5); }

        .sm-field { margin-top: 0.7em; }
        .sm-label {
            display: flex; align-items: center; gap: 0.5em; padding-left: 0.1em;
            font-size: 0.68em; font-weight: 600; letter-spacing: 0.08em;
            text-transform: uppercase; color: rgba(210, 228, 245, 0.95);
            margin-bottom: 0.35em;
            text-shadow: 0 1px 2px rgba(0, 10, 30, 0.5);
        }
        .sm-badge-auto {
            font-size: 0.9em; font-weight: 700; letter-spacing: 0.08em;
            padding: 0.1em 0.5em; border-radius: 0.4em;
            background: linear-gradient(135deg, rgba(125, 211, 252, 0.2), rgba(99, 102, 241, 0.22));
            border: 1px solid rgba(125, 211, 252, 0.35);
            color: #a5e8ff;
        }
        .sm-hint {
            font-size: 0.95em; font-weight: 400; letter-spacing: 0.02em;
            text-transform: none; color: rgba(190, 215, 235, 0.75);
            font-family: "SF Mono", Consolas, monospace;
        }
        .sm-input {
            width: 100%; box-sizing: border-box; outline: none;
            padding: 0.6em 0.85em;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 0.65em; color: #ffffff;
            font-size: 0.95em; font-family: "SF Mono", Consolas, "Menlo", monospace;
            letter-spacing: 0.04em; line-height: 1.2;
            transition: all .18s ease;
            box-shadow: inset 0 1px 2px rgba(0, 0, 20, 0.3);
            text-shadow: 0 1px 1px rgba(0, 0, 20, 0.3);
        }
        .sm-input::placeholder { color: rgba(190, 210, 230, 0.55); }
        .sm-input:hover { background: rgba(255,255,255,0.11); border-color: rgba(255,255,255,0.24); }
        .sm-input:focus {
            background: rgba(255,255,255,0.13);
            border-color: rgba(0, 200, 255, 0.7);
            box-shadow:
                inset 0 1px 2px rgba(0, 0, 20, 0.3),
                0 0 0 2px rgba(0, 200, 255, 0.22),
                0 0 16px -2px rgba(0, 200, 255, 0.45);
        }
        .sm-input.sm-readonly {
            background: rgba(125, 211, 252, 0.12);
            border-color: rgba(125, 211, 252, 0.3);
            color: #b0ecff; font-weight: 700; cursor: not-allowed;
            text-shadow: 0 0 8px rgba(125, 211, 252, 0.35);
        }
        .sm-select-wrap { position: relative; }
        .sm-select {
            width: 100%; box-sizing: border-box; outline: none;
            padding: 0.6em 2.4em 0.6em 0.85em;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 0.65em; color: #ffffff;
            font-size: 0.9em; font-weight: 500; font-family: inherit;
            cursor: pointer; appearance: none; -webkit-appearance: none;
            transition: all .18s ease; line-height: 1.2;
            box-shadow: inset 0 1px 2px rgba(0, 0, 20, 0.3);
            text-shadow: 0 1px 1px rgba(0, 0, 20, 0.3);
        }
        .sm-select:hover { background: rgba(255,255,255,0.11); border-color: rgba(255,255,255,0.24); }
        .sm-select:focus {
            background: rgba(255,255,255,0.13);
            border-color: rgba(0, 200, 255, 0.7);
            box-shadow:
                inset 0 1px 2px rgba(0, 0, 20, 0.3),
                0 0 0 2px rgba(0, 200, 255, 0.22),
                0 0 16px -2px rgba(0, 200, 255, 0.45);
        }
        .sm-select option { background: #1e293b; color: #f8fafc; padding: 0.4em; }
        .sm-chevron {
            position: absolute; right: 0.85em; top: 50%;
            width: 0.9em; height: 0.9em;
            color: rgba(200, 225, 240, 0.9); pointer-events: none;
            transform: translateY(-50%); transition: transform .18s, color .18s;
        }
        .sm-select-wrap:focus-within .sm-chevron { transform: translateY(-50%) rotate(180deg); color: #7dd3fc; }

        .sm-check-row {
            margin-top: 0.7em; display: flex; align-items: center; gap: 0.6em;
            padding: 0.55em 0.75em; border-radius: 0.65em;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            cursor: pointer; transition: all .18s ease;
        }
        .sm-check-row:hover { background: rgba(255, 255, 255, 0.09); border-color: rgba(255, 255, 255, 0.2); }
        .sm-check-row input { position: absolute; opacity: 0; pointer-events: none; }
        .sm-check-box {
            width: 1.05em; height: 1.05em; flex-shrink: 0; border-radius: 0.35em;
            background: rgba(255, 255, 255, 0.08);
            border: 1.5px solid rgba(255, 255, 255, 0.25);
            display: flex; align-items: center; justify-content: center;
            transition: all .18s ease;
        }
        .sm-check-box svg { width: 0.75em; height: 0.75em; opacity: 0; transform: scale(.5); transition: all .18s; }
        .sm-check-row input:checked ~ .sm-check-box {
            background: linear-gradient(135deg, #00c6ff, #4f46e5);
            border-color: transparent;
            box-shadow: 0 0.25em 0.8em -0.15em rgba(79, 70, 229, 0.7);
        }
        .sm-check-row input:checked ~ .sm-check-box svg { opacity: 1; transform: scale(1); }
        .sm-check-label {
            font-size: 0.8em; font-weight: 500; color: rgba(230, 240, 250, 0.98);
            display: flex; flex-direction: column; gap: 0.1em; line-height: 1.25;
            text-shadow: 0 1px 1px rgba(0, 0, 20, 0.35);
            min-width: 0;
        }
        .sm-check-sub {
            font-size: 0.75em; font-weight: 400; color: rgba(190, 215, 235, 0.8);
            font-family: "SF Mono", Consolas, monospace;
        }

        .sm-footer {
            position: relative; z-index: 2; flex-shrink: 0;
            padding: 0.5em 1em 0.9em;
            padding-right: 2.4em;
        }
        .sm-footer.sm-collapsed { display: none; }

        .sm-btn {
            position: relative; width: 100%;
            padding: 0.72em 1em;
            border: none; border-radius: 0.75em; overflow: hidden; cursor: pointer;
            background: linear-gradient(135deg, #00c6ff 0%, #4f46e5 100%);
            color: #fff; font-size: 0.85em; font-weight: 700;
            font-family: inherit; letter-spacing: 0.03em; line-height: 1.2;
            transition: all .2s cubic-bezier(.4,0,.2,1);
            text-shadow: 0 1px 2px rgba(0, 20, 60, 0.4);
            box-shadow:
                0 0.5em 1.5em -0.35em rgba(79, 70, 229, 0.8),
                0 0 0 1px rgba(125, 240, 255, 0.22),
                inset 0 1px 0 rgba(255, 255, 255, 0.32);
        }
        .sm-btn::before {
            content: ""; position: absolute; inset: 0; border-radius: inherit;
            background: linear-gradient(135deg, #22d3ee 0%, #6366f1 100%);
            opacity: 0; transition: opacity .2s;
        }
        .sm-btn:hover {
            transform: translateY(-1px);
            box-shadow:
                0 0.7em 1.9em -0.35em rgba(79, 70, 229, 0.95),
                0 0 0 1px rgba(125, 240, 255, 0.35),
                0 0 20px -4px rgba(0, 200, 255, 0.55),
                inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }
        .sm-btn:hover::before { opacity: 1; }
        .sm-btn:active { transform: translateY(0); }
        .sm-btn-text { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 0.5em; }

        .sm-status {
            margin-top: 0.55em;
            display: flex; align-items: center; gap: 0.55em;
            padding: 0.45em 0.75em; border-radius: 0.55em;
            font-size: 0.72em;
            color: rgba(210, 228, 245, 0.95);
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(125, 211, 252, 0.18);
            transition: all .25s ease;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            line-height: 1.2;
            text-shadow: 0 1px 1px rgba(0, 0, 20, 0.35);
        }
        .sm-status-dot {
            width: 0.55em; height: 0.55em; border-radius: 50%; flex-shrink: 0;
            background: rgba(200, 220, 240, 0.75); transition: all .25s ease;
        }
        .sm-status.sm-success {
            background: rgba(16, 185, 129, 0.18);
            border-color: rgba(16, 185, 129, 0.5); color: #a7f3d0;
        }
        .sm-status.sm-success .sm-status-dot {
            background: #10b981; box-shadow: 0 0 0.6em rgba(16, 185, 129, 0.9);
            animation: sm-pulse 1.5s ease-in-out infinite;
        }
        .sm-status.sm-error {
            background: rgba(239, 68, 68, 0.2);
            border-color: rgba(239, 68, 68, 0.55); color: #fecaca;
        }
        .sm-status.sm-error .sm-status-dot {
            background: #ef4444; box-shadow: 0 0 0.6em rgba(239, 68, 68, 0.9);
            animation: sm-pulse 1.5s ease-in-out infinite;
        }
        .sm-status.sm-warn {
            background: rgba(245, 158, 11, 0.2);
            border-color: rgba(245, 158, 11, 0.55); color: #fde68a;
        }
        .sm-status.sm-warn .sm-status-dot {
            background: #f59e0b; box-shadow: 0 0 0.6em rgba(245, 158, 11, 0.9);
            animation: sm-pulse 1.5s ease-in-out infinite;
        }

        .sm-resize-handle {
            position: absolute;
            bottom: 0.4em; right: 0.4em;
            width: 1.5em; height: 1.5em;
            cursor: nwse-resize;
            z-index: 5;
            color: rgba(125, 211, 252, 0.5);
            transition: color .18s ease, filter .18s ease;
            display: flex; align-items: center; justify-content: center;
        }
        .sm-resize-handle:hover {
            color: #7dd3fc;
            filter: drop-shadow(0 0 6px rgba(125, 211, 252, 0.7));
        }
        .sm-resize-handle svg { width: 100%; height: 100%; display: block; }
        .sm-resize-handle.sm-hidden { display: none; }
        `;
        document.head.appendChild(s);
    }

    // ================= BUILD PANEL =================
    function buildPanel() {
        if (document.getElementById('sarathi-mock-panel')) return;
        injectStyles();

        const scenarios = [
            'faceAuthReq', 'attemptMaxtimes', 'attemptMaxtimeDL', 'attemptMaxtimeslot',
            'alreadyCompleted', 'retestApplication', 'expiredApplication', 'NoExam',
            'allowedInRTO', 'maxLogins', 'photoUpload', 'capturePhoto', 'completeFlow',
            'scheduleDate', 'NOfaceAuthReq', 'bioAuth'
        ];

        const panel = document.createElement('div');
        panel.id = 'sarathi-mock-panel';
        panel.innerHTML = `
            <div class="sm-noise"></div>
            <div class="sm-header">
                <div class="sm-brand">
                    <div class="sm-icon">🧪</div>
                    <div class="sm-title-group">
                        <div class="sm-title">Sarathi Mock</div>
                        <div class="sm-subtitle">
                            Response Editor
                            <span class="sm-scale-badge" id="sm-scale">1.0×</span>
                        </div>
                    </div>
                </div>
                <button class="sm-min-btn" title="Minimize">−</button>
            </div>
            <div class="sm-body">
                <div class="sm-field">
                    <label class="sm-label">RTO Code</label>
                    <input id="sm-rto" class="sm-input" type="text" maxlength="5" placeholder="KA02" />
                </div>
                <div class="sm-field">
                    <label class="sm-label">State Code <span class="sm-badge-auto">AUTO</span></label>
                    <input id="sm-state" class="sm-input sm-readonly" type="text" readonly />
                </div>
                <div class="sm-field">
                    <label class="sm-label">Scenario <span class="sm-hint">data[10]</span></label>
                    <div class="sm-select-wrap">
                        <select id="sm-scenario" class="sm-select">
                            ${scenarios.map(s => `<option>${s}</option>`).join('')}
                        </select>
                        <svg class="sm-chevron" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>

                <label class="sm-check-row" for="sm-require-captcha">
                    <input id="sm-require-captcha" type="checkbox" />
                    <span class="sm-check-box">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white"
                             stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </span>
                    <span class="sm-check-label">
                        Validate captcha
                        <span class="sm-check-sub">captcha → getstate → mock</span>
                    </span>
                </label>
            </div>
            <div class="sm-footer">
                <button id="sm-apply" class="sm-btn">
                    <span class="sm-btn-text">⚡ Apply &amp; Trigger</span>
                </button>
                <div id="sm-status" class="sm-status">
                    <span class="sm-status-dot"></span>
                    <span class="sm-status-text">Ready</span>
                </div>
            </div>
            <div class="sm-resize-handle" title="Resize (aspect-locked)">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor"
                     stroke-width="1.6" stroke-linecap="round">
                    <line x1="2" y1="10" x2="10" y2="2"></line>
                    <line x1="6" y1="10" x2="10" y2="6"></line>
                </svg>
            </div>
        `;
        document.body.appendChild(panel);

        const rtoInput    = panel.querySelector('#sm-rto');
        const stateInput  = panel.querySelector('#sm-state');
        const scenarioSel = panel.querySelector('#sm-scenario');
        const statusEl    = panel.querySelector('#sm-status');
        const statusTxt   = panel.querySelector('.sm-status-text');
        const bodyEl      = panel.querySelector('.sm-body');
        const footerEl    = panel.querySelector('.sm-footer');
        const minBtn      = panel.querySelector('.sm-min-btn');
        const headerEl    = panel.querySelector('.sm-header');
        const resizeEl    = panel.querySelector('.sm-resize-handle');
        const applyBtn    = panel.querySelector('#sm-apply');
        const captchaChk  = panel.querySelector('#sm-require-captcha');
        const scaleBadge  = panel.querySelector('#sm-scale');

        rtoInput.value    = mockResponse[7];
        stateInput.value  = mockResponse[3];
        scenarioSel.value = mockResponse[10];

        function setStatus(type, text) {
            statusEl.classList.remove('sm-success','sm-error','sm-warn');
            if (type) statusEl.classList.add('sm-' + type);
            statusTxt.textContent = text;
        }
        window.__sarathiMockSetStatus = setStatus;

        function applyScale(w) {
            const scale = Math.max(0.7, Math.min(2.6, w / BASE_W));
            panel.style.fontSize = (BASE_FS * scale).toFixed(2) + 'px';
            if (scaleBadge) scaleBadge.textContent = scale.toFixed(1) + '×';
        }

        let savedHeight = DEF_H;
        let minimized = false;

        (function restoreSizeAndPosition() {
            let stored = null;
            try { stored = JSON.parse(localStorage.getItem(STORAGE_SIZE) || 'null'); } catch (e) {}
            const vw = window.innerWidth, vh = window.innerHeight;
            const maxWByVp = vw - MARGIN * 2;
            const maxHByVp = vh - MARGIN * 2;
            let w = (stored && stored.w) ? stored.w : DEF_W;
            w = Math.max(MIN_W, Math.min(w, MAX_W_CAP, maxWByVp));
            let h = w / ASPECT;
            if (h > maxHByVp) { h = maxHByVp; w = h * ASPECT; }
            panel.style.width  = w + 'px';
            panel.style.height = h + 'px';
            panel.style.left   = MARGIN + 'px';
            panel.style.top    = (vh - h - MARGIN) + 'px';
            applyScale(w);
            savedHeight = h;
        })();

        minBtn.addEventListener('click', () => {
            minimized = !minimized;
            bodyEl.classList.toggle('sm-collapsed', minimized);
            footerEl.classList.toggle('sm-collapsed', minimized);
            resizeEl.classList.toggle('sm-hidden', minimized);
            if (minimized) {
                savedHeight = panel.getBoundingClientRect().height;
                panel.style.height = 'auto';
                minBtn.textContent = '+';
            } else {
                panel.style.height = savedHeight + 'px';
                minBtn.textContent = '−';
            }
        });

        rtoInput.addEventListener('input', function () {
            const v = normalizeRto(this.value);
            this.value = v;
            stateInput.value = v.length >= 2 ? v.substring(0, 2) : '';
        });

        applyBtn.addEventListener('click', () => {
            const rto = normalizeRto(rtoInput.value);
            if (!isValidRto(rto)) {
                setStatus('error', 'Invalid RTO — try KA02, DL01…');
                return;
            }
            applyRto(rto);
            mockResponse[10] = scenarioSel.value;

            if (captchaChk.checked) {
                setStatus('warn', 'Validating captcha…');
                setTimeout(() => {
                    try {
                        if (typeof window.validateSubmit === 'function') {
                            window.validateSubmit();
                        } else {
                            setStatus('error', 'validateSubmit missing');
                        }
                    } catch (e) {
                        console.error(e);
                        setStatus('error', e.message || 'Flow failed');
                    }
                }, 60);
            } else {
                setStatus('warn', 'Triggering mock…');
                setTimeout(() => {
                    try {
                        if (typeof window.mockFunction === 'function') {
                            window.mockFunction(mockResponse);
                            setStatus('success', `Mock executed • RTO ${rto}`);
                        } else {
                            setStatus('warn', 'mockFunction not found');
                        }
                    } catch (e) {
                        console.error(e);
                        setStatus('error', e.message || 'Mock failed');
                    }
                }, 60);
            }
        });

        let drag = null;
        headerEl.addEventListener('mousedown', (e) => {
            if (e.target.closest('.sm-min-btn')) return;
            const r = panel.getBoundingClientRect();
            drag = { sx: e.clientX, sy: e.clientY, sl: r.left, st: r.top };
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!drag) return;
            let x = drag.sl + e.clientX - drag.sx;
            let y = drag.st + e.clientY - drag.sy;
            x = Math.max(4, Math.min(x, window.innerWidth  - panel.offsetWidth  - 4));
            y = Math.max(4, Math.min(y, window.innerHeight - panel.offsetHeight - 4));
            panel.style.left = x + 'px';
            panel.style.top  = y + 'px';
        });
        document.addEventListener('mouseup', () => { drag = null; });

        let resize = null;
        resizeEl.addEventListener('mousedown', (e) => {
            const r = panel.getBoundingClientRect();
            resize = { sx: e.clientX, sy: e.clientY, sl: r.left, st: r.top, sw: r.width, sh: r.height };
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener('mousemove', (e) => {
            if (!resize) return;
            const dx = e.clientX - resize.sx;
            const dy = e.clientY - resize.sy;
            let w;
            if (Math.abs(dx) >= Math.abs(dy)) w = resize.sw + dx;
            else                              w = (resize.sh + dy) * ASPECT;
            const maxWByViewport = window.innerWidth - resize.sl - 4;
            w = Math.max(MIN_W, Math.min(w, MAX_W_CAP, maxWByViewport));
            let h = w / ASPECT;
            const maxHByViewport = window.innerHeight - 8;
            if (h > maxHByViewport) { h = maxHByViewport; w = h * ASPECT; }
            let top = resize.st;
            if (top + h > window.innerHeight - 4) top = window.innerHeight - h - 4;
            if (top < 4) top = 4;
            panel.style.width  = w + 'px';
            panel.style.height = h + 'px';
            panel.style.top    = top + 'px';
            panel.style.left   = resize.sl + 'px';
            applyScale(w);
        });
        document.addEventListener('mouseup', () => {
            if (!resize) return;
            resize = null;
            try {
                const r = panel.getBoundingClientRect();
                localStorage.setItem(STORAGE_SIZE, JSON.stringify({
                    w: Math.round(r.width),
                    h: Math.round(r.height)
                }));
            } catch (e) {}
            savedHeight = panel.getBoundingClientRect().height;
        });

        window.addEventListener('resize', () => {
            if (minimized) return;
            const r = panel.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            let left = r.left, top = r.top, w = r.width, h = r.height;
            const maxW = Math.max(MIN_W, vw - MARGIN * 2);
            const maxH = Math.max(MIN_H, vh - MARGIN * 2);
            if (w > maxW) { w = maxW; h = w / ASPECT; }
            if (h > maxH) { h = maxH; w = h * ASPECT; }
            if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
            if (top  + h > vh - 4) top  = Math.max(4, vh - h - 4);
            if (left < 4) left = 4;
            if (top  < 4) top  = 4;
            panel.style.left   = left + 'px';
            panel.style.top    = top  + 'px';
            panel.style.width  = w + 'px';
            panel.style.height = h + 'px';
            applyScale(w);
        });
    }

    // ================= INIT =================
    function init() {
        buildPanel();
        if (AUTO_RUN) setTimeout(() => {
            try { window.mockFunction(mockResponse); } catch (e) { console.warn(e); }
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();