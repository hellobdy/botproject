const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');
const { createAdminServer } = require('./adminServer');

// ───────── CONFIGURATION ─────────
const BOT_TOKEN = '9080473114:AAGkJD4CeZjjmY1KXW0Cm9BhRQB8J51J6NU';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const DEFAULT_GEMINI_KEY = Buffer.from('QVEuQWI4Uk42S05SdXpmTUVqMHAwSnZIbTZzTFMyc1JYT2Y4Wmd4UktyVy1BN0lkUDdjNmc=', 'base64').toString('utf8');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───────── DYNAMIC DESKTOP & DOWNLOADS DIRECTORY (WORKS ON ANY LAPTOP / PC) ─────────
function getDesktopDirs() {
  const dirs = new Set();
  if (process.env.DESKTOP_DIR && fs.existsSync(process.env.DESKTOP_DIR)) {
    dirs.add(process.env.DESKTOP_DIR);
  }
  // 1. OneDrive Desktop (Prioritize for Windows 10/11 where OneDrive Desktop is the active visible screen)
  const oneDriveDesktop = path.join(os.homedir(), 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktop)) dirs.add(oneDriveDesktop);

  if (process.env.USERPROFILE) {
    const upOneDrive = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
    if (fs.existsSync(upOneDrive)) dirs.add(upOneDrive);
  }

  // 2. Standard user Desktop
  const userDesktop = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(userDesktop)) dirs.add(userDesktop);

  if (process.env.USERPROFILE) {
    const upDesktop = path.join(process.env.USERPROFILE, 'Desktop');
    if (fs.existsSync(upDesktop)) dirs.add(upDesktop);
  }

  if (dirs.size === 0) dirs.add(userDesktop);
  return Array.from(dirs);
}

function getDesktopDir() {
  const dirs = getDesktopDirs();
  return dirs[0];
}

function getDownloadsDir() {
  if (process.env.DOWNLOADS_DIR && fs.existsSync(process.env.DOWNLOADS_DIR)) {
    return process.env.DOWNLOADS_DIR;
  }
  const userDownloads = path.join(os.homedir(), 'Downloads');
  if (fs.existsSync(userDownloads)) {
    return userDownloads;
  }
  const fallbackDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

// Session store for users: chatId -> Session object
const sessions = new Map();
let isProcessing = false;

// ───────── FULL STATES LIST (MATCHING SARATHI PORTAL) ─────────
const ALL_STATES = [
  'Andaman and Nicobar',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep(UT)',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Pondicherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'UT of DNH and DD',
  'Uttarakhand',
  'Uttar Pradesh',
  'West Bengal'
];

function getStateKeyboard() {
  const rows = [];
  for (let i = 0; i < ALL_STATES.length; i += 2) {
    const row = [
      { text: ALL_STATES[i], callback_data: `state:${ALL_STATES[i]}` }
    ];
    if (i + 1 < ALL_STATES.length) {
      row.push({ text: ALL_STATES[i + 1], callback_data: `state:${ALL_STATES[i + 1]}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

// ───────── NATIVE TELEGRAM API HELPERS (ROCK SOLID, NO ECONNRESET) ─────────
async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      if (attempt === 3) console.error('❌ Telegram sendMessage error:', err.message);
      await sleep(1000);
    }
  }
  return null;
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    const res = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text })
    });
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function sendTelegramPhoto(chatId, photoBuffer, caption, filename = 'captcha.png') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const formData = new globalThis.FormData();
      formData.append('chat_id', chatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      formData.append(
        'photo',
        new Blob([photoBuffer], { type: filename.endsWith('.png') ? 'image/png' : 'image/jpeg' }),
        filename
      );

      const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        console.log('   ✅ Photo successfully sent to Telegram!');
        return data;
      } else {
        console.error('❌ Telegram sendPhoto rejection:', data.description);
      }
    } catch (err) {
      console.error(`❌ sendPhoto attempt ${attempt}/3 failed (${err.message}), retrying...`);
      await sleep(1000);
    }
  }
  return null;
}

// ───────── GEMINI AI CAPTCHA SOLVER ─────────
// ───────── HUMAN CAPTCHA RESOLUTION VIA TELEGRAM ─────────
let activeCaptchaResolver = null;
let activeCaptchaChatId = null;
let lastActiveChatId = '8246537527';
let isBotRunning = false;

try {
  const allRecs = db.getAll();
  const lastUser = allRecs.find(x => x.chatId && x.chatId !== 'TERMINAL');
  if (lastUser && lastUser.chatId) {
    lastActiveChatId = String(lastUser.chatId);
  }
} catch (_) {}

async function requestCaptchaFromUser(chatId, capBuffer, attempt = 1) {
  const targetChatId = chatId || lastActiveChatId || '8246537527';

  const caption = attempt === 1
    ? `📸 <b>Step 1 Verification Code</b>\n\nKripya is photo ka captcha likh kar reply karein:`
    : `⚠️ <b>Incorrect Captcha (Attempt ${attempt}/5)</b>\n\nNaya captcha refresh hua hai. Kripya sahi captcha likh kar reply karein:`;

  console.log(`\n📲 Sending Step 1 captcha image to Telegram (Chat: ${targetChatId})...`);
  if (targetChatId) {
    await sendTelegramPhoto(targetChatId, capBuffer, caption, 'step1_captcha.png').catch((e) => {
      console.error('Failed to send photo to Telegram:', e.message);
    });
  }

  console.log('⏳ Waiting for captcha answer from Telegram (or type in terminal)...');

  return new Promise((resolve) => {
    let timeoutId = null;

    const cleanupAndResolve = (answer) => {
      if (timeoutId) clearTimeout(timeoutId);
      activeCaptchaResolver = null;
      activeCaptchaChatId = null;
      resolve(answer);
    };

    activeCaptchaResolver = cleanupAndResolve;
    activeCaptchaChatId = targetChatId;

    // Timeout after 120 seconds if no answer
    timeoutId = setTimeout(() => {
      if (activeCaptchaResolver === cleanupAndResolve) {
        console.warn('⚠️ Captcha input timed out after 120 seconds.');
        cleanupAndResolve(null);
      }
    }, 120000);

    // Terminal fallback input (if run interactively in terminal)
    if (process.stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('👉 Terminal Captcha Input (ya Telegram pe reply karein): ', (answer) => {
        rl.close();
        if (activeCaptchaResolver === cleanupAndResolve) {
          const cleaned = (answer || '').trim();
          console.log(`✅ Terminal captcha input received: "${cleaned}"`);
          cleanupAndResolve(cleaned);
        }
      });
    }
  });
}

async function solveCaptchaWithGemini(photoBufferOrBase64) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    console.error('❌ Gemini API key is missing! Please paste your Gemini API key in bot.js at GEMINI_API_KEY.');
    return null;
  }

  const base64Data = Buffer.isBuffer(photoBufferOrBase64) ? photoBufferOrBase64.toString('base64') : photoBufferOrBase64;
  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'image/png',
              data: base64Data
            }
          },
          {
            text: 'Transcribe the alphanumeric characters from this distorted graphic banner. Maintain exact uppercase and lowercase.\nRules:\n- Output ONLY the characters without spaces, punctuation, or explanation.\n- Differentiate carefully between: 0 (zero) vs O/o, 1 vs l/I, 5 vs S/s, 8 vs B, 9 vs g, 2 vs Z.'
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1000
    }
  };

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      console.log(`🤖 Requesting Gemini AI (${model}) to decode security verification image...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) {
        console.warn(`⚠️ Model ${model} unavailable (${data.error.message}), trying backup model...`);
        continue;
      }

      // Extract text safely from parts (skipping thinking parts)
      let candidateText = '';
      const candidate = data?.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const p of candidate.content.parts) {
          if (!p.thought && p.text) {
            candidateText += ' ' + p.text;
          }
        }
        if (!candidateText.trim()) {
          const lastPart = candidate.content.parts[candidate.content.parts.length - 1];
          candidateText = lastPart?.text || '';
        }
      }

      // Extract the code directly
      const codeMatch = candidateText.match(/\b([A-Za-z0-9]{4,8})\b/);
      const cleaned = codeMatch ? codeMatch[1] : candidateText.replace(/[^a-zA-Z0-9]/g, '');

      if (cleaned.length >= 4) {
        console.log(`✅ Gemini AI (${model}) decoded code successfully: "${cleaned}"`);
        return cleaned;
      }
      console.warn(`⚠️ Model ${model} returned unexpected text: "${candidateText.trim()}", trying backup model...`);
    } catch (err) {
      console.warn(`⚠️ Network issue on ${model}: ${err.message}, trying backup model...`);
    }
  }
  return null;
}

// ───────── SMART 1-MESSAGE PARSER (STATE, APP NO, DOB) ─────────
const STATE_ALIASES = {
  'up': 'Uttar Pradesh',
  'uttar pradesh': 'Uttar Pradesh',
  'od': 'Odisha',
  'or': 'Odisha',
  'odisha': 'Odisha',
  'orissa': 'Odisha',
  'dl': 'Delhi',
  'delhi': 'Delhi',
  'br': 'Bihar',
  'bihar': 'Bihar',
  'rj': 'Rajasthan',
  'rajasthan': 'Rajasthan',
  'mh': 'Maharashtra',
  'maharashtra': 'Maharashtra',
  'mp': 'Madhya Pradesh',
  'madhya pradesh': 'Madhya Pradesh',
  'hr': 'Haryana',
  'haryana': 'Haryana',
  'pb': 'Punjab',
  'punjab': 'Punjab',
  'uk': 'Uttarakhand',
  'uttarakhand': 'Uttarakhand',
  'ua': 'Uttarakhand',
  'wb': 'West Bengal',
  'west bengal': 'West Bengal',
  'jh': 'Jharkhand',
  'jharkhand': 'Jharkhand',
  'ch': 'Chandigarh',
  'chandigarh': 'Chandigarh',
  'cg': 'Chhattisgarh',
  'chhattisgarh': 'Chhattisgarh',
  'gj': 'Gujarat',
  'gujarat': 'Gujarat',
  'hp': 'Himachal Pradesh',
  'himachal pradesh': 'Himachal Pradesh',
  'jk': 'Jammu and Kashmir',
  'jammu and kashmir': 'Jammu and Kashmir',
  'ka': 'Karnataka',
  'karnataka': 'Karnataka',
  'kl': 'Kerala',
  'kerala': 'Kerala',
  'ap': 'Andhra Pradesh',
  'andhra pradesh': 'Andhra Pradesh',
  'ts': 'Telangana',
  'tg': 'Telangana',
  'telangana': 'Telangana',
  'tn': 'Tamil Nadu',
  'tamil nadu': 'Tamil Nadu',
  'as': 'Assam',
  'assam': 'Assam',
  'ga': 'Goa',
  'goa': 'Goa'
};

function parseSingleLineInput(text) {
  if (!text || typeof text !== 'string') return null;
  const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

  // 1. Match DOB (DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY)
  const dobMatch = cleanText.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19\d{2}|20\d{2})\b/);
  if (!dobMatch) return null;

  const rawDay = dobMatch[1].padStart(2, '0');
  const rawMonth = dobMatch[2].padStart(2, '0');
  const rawYear = dobMatch[3];
  const dob = `${rawDay}-${rawMonth}-${rawYear}`;

  // 2. Remove DOB from text to avoid false positive with App No
  const textWithoutDob = cleanText.replace(dobMatch[0], ' ');

  // 3. Match Application Number (6 to 14 numeric digits)
  const appMatch = textWithoutDob.match(/\b(\d{6,14})\b/);
  if (!appMatch) return null;
  const appNo = appMatch[1];

  // 4. Match State
  const textWithoutApp = textWithoutDob.replace(appMatch[0], ' ');
  const cleanedStateSearch = textWithoutApp.toLowerCase().replace(/[,\-_|/\\]+/g, ' ').replace(/\s+/g, ' ').trim();

  let matchedState = null;
  let matchedKey = null;
  const words = cleanedStateSearch.split(' ');
  for (const word of words) {
    if (STATE_ALIASES[word]) {
      matchedState = STATE_ALIASES[word];
      matchedKey = word;
      break;
    }
  }

  if (!matchedState) {
    for (const [key, val] of Object.entries(STATE_ALIASES)) {
      if (cleanedStateSearch.includes(key)) {
        matchedState = val;
        matchedKey = key;
        break;
      }
    }
  }

  if (!matchedState) {
    for (const s of ALL_STATES) {
      if (cleanedStateSearch.includes(s.toLowerCase())) {
        matchedState = s;
        matchedKey = s.toLowerCase();
        break;
      }
    }
  }

  if (!matchedState) return null;

  // 5. Extract Password and RTO Code
  let remainder = textWithoutApp;
  if (matchedKey) {
    remainder = remainder.replace(new RegExp(`\\b${matchedKey}\\b`, 'i'), ' ');
  }
  if (matchedState) {
    remainder = remainder.replace(new RegExp(matchedState, 'i'), ' ');
  }

  let rtoCode = '';
  // Check if RTO code exists in remainder (e.g. AS04, UP78, OD10, DL04, etc.)
  const rtoMatch = remainder.match(/\b([A-Za-z]{2}\s*\d{1,2})\b/);
  if (rtoMatch) {
    rtoCode = rtoMatch[1].replace(/\s+/g, '').toUpperCase();
    remainder = remainder.replace(rtoMatch[0], ' ');
  }

  remainder = remainder.replace(/^[,\-|/\\:\s]+|[,\-|/\\:\s]+$/g, '').trim();
  let password = remainder || '';

  // If rtoCode not given in line, derive from state if possible
  if (!rtoCode) {
    rtoCode = deriveRtoCode('', '', matchedState) || '';
  }

  return { state: matchedState, appNo, dob, password, rtoCode };
}



// ───────── RTO CODE DERIVATION HELPER ─────────
const KNOWN_RTO_MAP = {
  // Assam
  'GUWAHATI': 'AS01', 'KAMRUP METRO': 'AS01', 'DISPUR': 'AS01',
  'NAGAON': 'AS02', 'NOWGONG': 'AS02',
  'JORHAT': 'AS03',
  'SIVSAGAR': 'AS04', 'SIVASAGAR': 'AS04', 'SIBSAGAR': 'AS04',
  'GOLAGHAT': 'AS05',
  'DIBRUGARH': 'AS06',
  'LAKHIMPUR': 'AS07', 'NORTH LAKHIMPUR': 'AS07',
  'HAFLONG': 'AS08', 'DIMA HASAO': 'AS08', 'NORTH CACHAR': 'AS08',
  'DIPHU': 'AS09', 'KARBI ANGLONG': 'AS09',
  'KARIMGANJ': 'AS10',
  'CACHAR': 'AS11', 'SILCHAR': 'AS11',
  'TEZPUR': 'AS12', 'SONITPUR': 'AS12',
  'DARRANG': 'AS13', 'MANGALDAI': 'AS13', 'MANGALDOI': 'AS13',
  'NALBARI': 'AS14',
  'BARPETA': 'AS15',
  'KOKRAJHAR': 'AS16',
  'DHUBRI': 'AS17',
  'GOALPARA': 'AS18',
  'BONGAIGAON': 'AS19',
  'ASTC': 'AS20',
  'MARIGAON': 'AS21', 'MORIGAON': 'AS21',
  'DHEMAJI': 'AS22',
  'TINSUKIA': 'AS23',
  'HAILAKANDI': 'AS24',
  'KAMRUP RURAL': 'AS25', 'BAIHATA CHARIALI': 'AS25',
  'CHIRANG': 'AS26', 'KAJALGAON': 'AS26',
  'UDALGURI': 'AS27',
  'BAKSA': 'AS28', 'MUSHALPUR': 'AS28',
  'MAJULI': 'AS29', 'GARMUR': 'AS29',
  'BISWANATH': 'AS30', 'BISWANATH CHARIALI': 'AS30',
  'CHARAIDEO': 'AS31', 'SONARI': 'AS31',
  'HOJAI': 'AS32', 'SANKARDEV NAGAR': 'AS32',
  'SOUTH SALMARA': 'AS33', 'MANKACHAR': 'AS33', 'HATSINGIMARI': 'AS33',
  'BAJALI': 'AS34', 'PATHSALA': 'AS34',
  'TAMULPUR': 'AS35',

  // Odisha
  'BALASORE': 'OD01', 'BALESHWAR': 'OD01',
  'BHUBANESWAR': 'OD02', 'BHUBANESHWAR': 'OD02',
  'BOLANGIR': 'OD03', 'BALANGIR': 'OD03',
  'CHANDIKHOLE': 'OD04', 'CHANDIKHOL': 'OD04',
  'CUTTACK': 'OD05',
  'DHENKANAL': 'OD06',
  'GANJAM': 'OD07', 'BERHAMPUR': 'OD07', 'BRAHMAPUR': 'OD07', 'CHHATRAPUR': 'OD07',
  'KALAHANDI': 'OD08', 'BHAWANIPATNA': 'OD08',
  'KEONJHAR': 'OD09', 'KENDUJHAR': 'OD09',
  'KORAPUT': 'OD10', 'JEYPORE': 'OD10',
  'MAYURBHANJ': 'OD11', 'BARIPADA': 'OD11',
  'PHULBANI': 'OD12', 'KANDHAMAL': 'OD12',
  'PURI': 'OD13',
  'ROURKELA': 'OD14',
  'SAMBALPUR': 'OD15',
  'SUNDARGARH': 'OD16', 'SUNDERGARH': 'OD16',
  'BARGARH': 'OD17', 'BARAGARH': 'OD17',
  'RAYAGADA': 'OD18',
  'ANGUL': 'OD19', 'ANUGUL': 'OD19',
  'GAJAPATI': 'OD20', 'PARALAKHEMUNDI': 'OD20',
  'JAGATSINGHPUR': 'OD21',
  'BHADRAK': 'OD22',
  'JHARSUGUDA': 'OD23',
  'NABARANGPUR': 'OD24', 'NAWARANGPUR': 'OD24',
  'NAYAGARH': 'OD25',
  'NUAPADA': 'OD26',
  'BOUDH': 'OD27', 'BAUDA': 'OD27',
  'DEOGARH': 'OD28', 'DEBAGARH': 'OD28',
  'KENDRAPARA': 'OD29',
  'MALKANGIRI': 'OD30',
  'SONEPUR': 'OD31', 'SUBARNAPUR': 'OD31',
  'BHANJANAGAR': 'OD32',
  'KHORDHA': 'OD33', 'KHORDA': 'OD33',
  'JAJPUR': 'OD34',
  'TALCHER': 'OD35',

  // Uttar Pradesh
  'KANPUR': 'UP78', 'KANPUR NAGAR': 'UP78', 'KANPUR DEHAT': 'UP77',
  'LUCKNOW': 'UP32',
  'AGRA': 'UP80',
  'VARANASI': 'UP65',
  'PRAYAGRAJ': 'UP70', 'ALLAHABAD': 'UP70',
  'BAREILLY': 'UP25',
  'MEERUT': 'UP15',
  'GHAZIABAD': 'UP14',
  'NOIDA': 'UP16', 'GREATER NOIDA': 'UP16', 'GAUTAM BUDDHA NAGAR': 'UP16',
  'GORAKHPUR': 'UP53',
  'ALIGARH': 'UP81',
  'MATHURA': 'UP85',
  'JHANSI': 'UP93',
  'MORADABAD': 'UP21',
  'FAIZABAD': 'UP42', 'AYODHYA': 'UP42',
  'SAHARANPUR': 'UP11',
  'MUZAFFARNAGAR': 'UP12',
  'BULANDSHAHR': 'UP13',
  'BAGHPAT': 'UP17',
  'SHAMLI': 'UP19',
  'BIJNOR': 'UP20',
  'RAMPUR': 'UP22',
  'AMROHA': 'UP23',
  'BUDAUN': 'UP24', 'BADAUN': 'UP24',
  'PILIBHIT': 'UP26',
  'SHAHJAHANPUR': 'UP27',
  'HARDOI': 'UP30',
  'LAKHIMPUR KHERI': 'UP31', 'KHERI': 'UP31',
  'RAEBARELI': 'UP33',
  'SITAPUR': 'UP34',
  'UNNAO': 'UP35',
  'AMETHI': 'UP36',
  'HAPUR': 'UP37',
  'SAMBHAL': 'UP38',
  'BAHRAICH': 'UP40',
  'BARABANKI': 'UP41',
  'GONDA': 'UP43',
  'SULTANPUR': 'UP44',
  'AMBEDKAR NAGAR': 'UP45',
  'SHRAVASTI': 'UP46',
  'BALRAMPUR': 'UP47',
  'AZAMGARH': 'UP50',
  'BASTI': 'UP51',
  'DEORIA': 'UP52',
  'MAU': 'UP54',
  'SIDDHARTH NAGAR': 'UP55',
  'MAHARAJGANJ': 'UP56',
  'KUSHINAGAR': 'UP57',
  'SANT KABIR NAGAR': 'UP58',
  'BALLIA': 'UP60',
  'GHAZIPUR': 'UP61',
  'JAUNPUR': 'UP62',
  'MIRZAPUR': 'UP63',
  'SONBHADRA': 'UP64',
  'BHADOHI': 'UP66',
  'CHANDAULI': 'UP67',
  'FATEHPUR': 'UP71',
  'PRATAPGARH': 'UP72',
  'KAUSHAMBI': 'UP73',
  'KANNAUJ': 'UP74',
  'ETAWAH': 'UP75',
  'FARRUKHABAD': 'UP76',
  'AURAIYA': 'UP79',
  'ETAH': 'UP82',
  'FIROZABAD': 'UP83',
  'MAINPURI': 'UP84',
  'HATHRAS': 'UP86',
  'KASGANJ': 'UP87',
  'BANDA': 'UP90',
  'HAMIRPUR': 'UP91',
  'JALAUN': 'UP92', 'ORAI': 'UP92',
  'LALITPUR': 'UP94',
  'MAHOBA': 'UP95',
  'CHITRAKOOT': 'UP96',

  // Bihar
  'PATNA': 'BR01',
  'GAYA': 'BR02',
  'BHOJPUR': 'BR03', 'ARRAH': 'BR03', 'ARA': 'BR03',
  'CHAPRA': 'BR04', 'SARAN': 'BR04',
  'MOTIHARI': 'BR05', 'EAST CHAMPARAN': 'BR05',
  'MUZAFFARPUR': 'BR06',
  'DARBHANGA': 'BR07',
  'MUNGER': 'BR08', 'MONGHYR': 'BR08',
  'BEGUSARAI': 'BR09',
  'BHAGALPUR': 'BR10',
  'PURNEA': 'BR11', 'PURNIA': 'BR11',
  'SAHARSA': 'BR19',
  'NALANDA': 'BR21', 'BIHAR SHARIF': 'BR21',
  'BETTIAH': 'BR22', 'WEST CHAMPARAN': 'BR22',
  'ROHTAS': 'BR24', 'SASARAM': 'BR24', 'DEHRI': 'BR24',
  'JEHANABAD': 'BR25',
  'AURANGABAD': 'BR26',
  'NAWADA': 'BR27',
  'GOPALGANJ': 'BR28',
  'SIWAN': 'BR29',
  'SITAMARHI': 'BR30',
  'VAISHALI': 'BR31', 'HAJIPUR': 'BR31',
  'MADHUBANI': 'BR32',
  'SAMASTIPUR': 'BR33',
  'KHAGARIA': 'BR34',
  'KISHANGANJ': 'BR37',
  'ARARIA': 'BR38',
  'KATIHAR': 'BR39',
  'MADHEPURA': 'BR43',
  'BUXAR': 'BR44',
  'KAIMUR': 'BR45', 'BHABUA': 'BR45',
  'JAMUI': 'BR46',
  'SUPAUL': 'BR50',
  'BANKA': 'BR51',
  'SHEIKHPURA': 'BR52',
  'LAKHISARAI': 'BR53',
  'SHEOHAR': 'BR55',
  'ARWAL': 'BR56',

  // Delhi
  'MALL ROAD': 'DL01', 'NORTH DELHI': 'DL01',
  'IP DEPOT': 'DL02', 'NEW DELHI': 'DL02',
  'SHEIKH SARAI': 'DL03', 'SOUTH DELHI': 'DL03',
  'JANAKPURI': 'DL04', 'WEST DELHI': 'DL04',
  'LONI ROAD': 'DL05', 'NORTH EAST DELHI': 'DL05',
  'SARAI KALE KHAN': 'DL06', 'CENTRAL DELHI': 'DL06',
  'MAYUR VIHAR': 'DL07', 'EAST DELHI': 'DL07',
  'WAZIRPUR': 'DL08', 'NORTH WEST DELHI': 'DL08',
  'PALAM': 'DL09', 'SOUTH WEST DELHI': 'DL09',
  'RAJA GARDEN': 'DL10',
  'ROHINI': 'DL11',
  'VASANT VIHAR': 'DL12',
  'SURAJMAL VIHAR': 'DL13',

  // Rajasthan (Complete)
  'AJMER': 'RJ01',
  'ALWAR': 'RJ02',
  'BANSWARA': 'RJ03',
  'BARMER': 'RJ04',
  'BHARATPUR': 'RJ05',
  'BHILWARA': 'RJ06',
  'BIKANER': 'RJ07',
  'BUNDI': 'RJ08',
  'CHITTORGARH': 'RJ09', 'CHITTOR': 'RJ09',
  'CHURU': 'RJ10',
  'DHOLPUR': 'RJ11',
  'DUNGARPUR': 'RJ12',
  'SRI GANGANAGAR': 'RJ13', 'GANGANAGAR': 'RJ13',
  'JAIPUR': 'RJ14', 'JAIPUR SOUTH': 'RJ14', 'JAIPUR NORTH': 'RJ45',
  'JAISALMER': 'RJ15',
  'JALORE': 'RJ16',
  'JHALAWAR': 'RJ17',
  'JHUNJHUNU': 'RJ18',
  'JODHPUR': 'RJ19',
  'KOTA': 'RJ20',
  'NAGAUR': 'RJ21',
  'PALI': 'RJ22',
  'SIKAR': 'RJ23',
  'SIROHI': 'RJ24',
  'SAWAI MADHOPUR': 'RJ25',
  'TONK': 'RJ26',
  'UDAIPUR': 'RJ27',
  'BARAN': 'RJ28',
  'DAUSA': 'RJ29',
  'RAJSAMAND': 'RJ30',
  'HANUMANGARH': 'RJ31',
  'KOTPUTLI': 'RJ32',
  'RAMGANJMANDI': 'RJ33',
  'KARAULI': 'RJ34',
  'PRATAPGARH': 'RJ35',
  'BEAWAR': 'RJ36',
  'DIDWANA': 'RJ37',
  'ABU ROAD': 'RJ38',
  'BALOTRA': 'RJ39',
  'BHIWADI': 'RJ40',
  'CHOMU': 'RJ41',
  'KISHANGARH': 'RJ42',
  'PHALODI': 'RJ43',
  'SUJANGARH': 'RJ44',
  'BHINMAL': 'RJ46',
  'KEKRI': 'RJ48',
  'NOKHA': 'RJ49',
  'SHAHJAHANPUR': 'RJ51',

  // Jammu and Kashmir
  'SRINAGAR': 'JK01',
  'JAMMU': 'JK02',
  'ANANTNAG': 'JK03',
  'BUDGAM': 'JK04', 'BADGAM': 'JK04',
  'BARAMULLA': 'JK05', 'BARAMULA': 'JK05',
  'DODA': 'JK06',
  'KATHUA': 'JK08',
  'KUPWARA': 'JK09',
  'RAJOURI': 'JK11',
  'POONCH': 'JK12',
  'PULWAMA': 'JK13',
  'UDHAMPUR': 'JK14',
  'BANDIPORA': 'JK15', 'BANDIPORE': 'JK15',
  'GANDERBAL': 'JK16',
  'KULGAM': 'JK17',
  'KISHTWAR': 'JK18',
  'RAMBAN': 'JK19',
  'REASI': 'JK20',
  'SAMBA': 'JK21',
  'SHOPIAN': 'JK22',

  // Ladakh
  'LEH': 'LA01', 'LADAKH': 'LA01',
  'KARGIL': 'LA02',

  // Punjab
  'AMRITSAR': 'PB02',
  'BATHINDA': 'PB03', 'BHATINDA': 'PB03',
  'FARIDKOT': 'PB04',
  'FEROZEPUR': 'PB05', 'FIROZPUR': 'PB05',
  'GURDASPUR': 'PB06',
  'HOSHIARPUR': 'PB07',
  'JALANDHAR': 'PB08',
  'KAPURTHALA': 'PB09',
  'LUDHIANA': 'PB10',
  'PATIALA': 'PB11',
  'RUPNAGAR': 'PB12', 'ROPAR': 'PB12',
  'SANGRUR': 'PB13',
  'BARNALA': 'PB19',
  'FAZILKA': 'PB22',
  'FATEHGARH SAHIB': 'PB23',
  'MOGA': 'PB29',
  'MUKTSAR': 'PB30', 'SRI MUKTSAR SAHIB': 'PB30',
  'MANSA': 'PB31',
  'NAWANSHAHR': 'PB32', 'SBS NAGAR': 'PB32',
  'PATHANKOT': 'PB35',
  'TARN TARAN': 'PB46',
  'MOHALI': 'PB65', 'SAS NAGAR': 'PB65',
  'MALERKOTLA': 'PB88',

  // Chandigarh
  'CHANDIGARH': 'CH01',

  // Haryana
  'AMBALA': 'HR01',
  'YAMUNANAGAR': 'HR02', 'JAGADHRI': 'HR02',
  'PANCHKULA': 'HR03',
  'NARAINGARH': 'HR04',
  'KARNAL': 'HR05',
  'PANIPAT': 'HR06',
  'KURUKSHETRA': 'HR07',
  'KAITHAL': 'HR08',
  'GUHLA': 'HR09',
  'SONIPAT': 'HR10', 'SONEPAT': 'HR10',
  'GOHANA': 'HR11',
  'ROHTAK': 'HR12',
  'BAHADURGARH': 'HR13',
  'JHAJJAR': 'HR14',
  'MEHAM': 'HR15',
  'BHIWANI': 'HR16',
  'TOSHAM': 'HR17',
  'LOHARU': 'HR18',
  'CHARKHI DADRI': 'HR19',
  'HISAR': 'HR20', 'HISSAR': 'HR20',
  'HANSI': 'HR21',
  'FATEHABAD': 'HR22',
  'TOHANA': 'HR23',
  'SIRSA': 'HR24',
  'DABWALI': 'HR25',
  'GURGAON': 'HR26', 'GURUGRAM': 'HR26',
  'NUH': 'HR27', 'MEWAT': 'HR27',
  'FEROZEPUR JHIRKA': 'HR28',
  'BALLABGARH': 'HR29',
  'PALWAL': 'HR30',
  'JIND': 'HR31',
  'NARWANA': 'HR32',
  'SAFIDON': 'HR33',
  'MAHENDRAGARH': 'HR34', 'MOHINDERGARH': 'HR34',
  'NARNAUL': 'HR35',
  'REWARI': 'HR36',
  'FARIDABAD': 'HR51',

  // Himachal Pradesh
  'SHIMLA': 'HP01', 'SHIMLA URBAN': 'HP01', 'SHIMLA RURAL': 'HP02',
  'DHARAMSHALA': 'HP02', 'DHARAMSALA': 'HP02',
  'MANDI': 'HP03',
  'KANGRA': 'HP04',
  'KULLU': 'HP05',
  'HAMIRPUR HP': 'HP06',
  'UNA': 'HP07',
  'BILASPUR HP': 'HP08',
  'SOLAN': 'HP09',
  'SIRMAUR': 'HP10', 'NAHAN': 'HP10',
  'CHAMBA': 'HP11',
  'KINNAUR': 'HP12', 'RECKONG PEO': 'HP12',
  'LAHAUL': 'HP13', 'SPITI': 'HP13', 'KEYLONG': 'HP13',
  'PALAMPUR': 'HP37',
  'BADDI': 'HP93',

  // Uttarakhand
  'ALMORA': 'UK01',
  'BAGESHWAR': 'UK02',
  'CHAMPAWAT': 'UK03',
  'NAINITAL': 'UK04', 'HALDWANI': 'UK04',
  'PITHORAGARH': 'UK05',
  'UDHAM SINGH NAGAR': 'UK06', 'RUDRAPUR': 'UK06',
  'DEHRADUN': 'UK07',
  'HARIDWAR': 'UK08',
  'TEHRI': 'UK09', 'NEW TEHRI': 'UK09',
  'UTTARKASHI': 'UK10',
  'CHAMOLI': 'UK11', 'GOPESHWAR': 'UK11',
  'PAURI': 'UK12', 'GARHWAL': 'UK12',
  'RUDRAPRAYAG': 'UK13',
  'RISHIKESH': 'UK14',
  'KOTDWAR': 'UK15',
  'ROORKEE': 'UK17',
  'KASHIPUR': 'UK18',
  'RAMNAGAR': 'UK19',

  // Maharashtra
  'MUMBAI CENTRAL': 'MH01', 'TARDEO': 'MH01', 'MUMBAI': 'MH01',
  'MUMBAI WEST': 'MH02', 'ANDHERI': 'MH02',
  'MUMBAI EAST': 'MH03', 'WADALA': 'MH03',
  'THANE': 'MH04',
  'KALYAN': 'MH05',
  'PEN': 'MH06', 'RAIGAD': 'MH06',
  'SINDHUDURG': 'MH07',
  'RATNAGIRI': 'MH08',
  'KOLHAPUR': 'MH09',
  'SANGLI': 'MH10',
  'SATARA': 'MH11',
  'PUNE': 'MH12',
  'SOLAPUR': 'MH13',
  'PIMPRI': 'MH14', 'CHINCHWAD': 'MH14',
  'NASHIK': 'MH15',
  'AHMEDNAGAR': 'MH16',
  'SHRIRAMPUR': 'MH17',
  'DHULE': 'MH18',
  'JALGAON': 'MH19',
  'AURANGABAD': 'MH20', 'SAMBHAJINAGAR': 'MH20', 'CHHATRAPATI SAMBHAJINAGAR': 'MH20',
  'JALNA': 'MH21',
  'PARBHANI': 'MH22',
  'BEED': 'MH23',
  'LATUR': 'MH24',
  'OSMANABAD': 'MH25', 'DHARASHIV': 'MH25',
  'NANDED': 'MH26',
  'AMRAVATI': 'MH27',
  'BULDHANA': 'MH28',
  'YAVATMAL': 'MH29',
  'AKOLA': 'MH30',
  'NAGPUR': 'MH31', 'NAGPUR EAST': 'MH49',
  'WARDHA': 'MH32',
  'GADCHIROLI': 'MH33',
  'CHANDRAPUR': 'MH34',
  'GONDIA': 'MH35',
  'BHANDARA': 'MH36',
  'WASHIM': 'MH37',
  'HINGOLI': 'MH38',
  'NANDURBAR': 'MH39',
  'VASHI': 'MH43', 'NAVI MUMBAI': 'MH43',
  'PANVEL': 'MH46',
  'BORIVALI': 'MH47',
  'VASAI': 'MH48',

  // Gujarat
  'AHMEDABAD': 'GJ01', 'AHMEDABAD EAST': 'GJ27', 'AHMEDABAD RURAL': 'GJ38',
  'MEHSANA': 'GJ02',
  'RAJKOT': 'GJ03',
  'BHAVNAGAR': 'GJ04',
  'SURAT': 'GJ05',
  'VADODARA': 'GJ06',
  'KHEDA': 'GJ07', 'NADIAD': 'GJ07',
  'BANASKANTHA': 'GJ08', 'PALANPUR': 'GJ08',
  'SABARKANTHA': 'GJ09', 'HIMMATNAGAR': 'GJ09',
  'JAMNAGAR': 'GJ10',
  'JUNAGADH': 'GJ11',
  'KUTCH': 'GJ12', 'BHUJ': 'GJ12',
  'SURENDRANAGAR': 'GJ13',
  'AMRELI': 'GJ14',
  'VALSAD': 'GJ15',
  'BHARUCH': 'GJ16',
  'PANCHMAHAL': 'GJ17', 'GODHRA': 'GJ17',
  'GANDHINAGAR': 'GJ18',
  'BARDOLI': 'GJ19',
  'DAHOD': 'GJ20',
  'NAVSARI': 'GJ21',
  'NARMADA': 'GJ22', 'RAJPIPLA': 'GJ22',
  'ANAND': 'GJ23',
  'PATAN': 'GJ24',
  'PORBANDAR': 'GJ25',
  'TAPI': 'GJ26', 'VYARA': 'GJ26',
  'DANG': 'GJ30', 'AHWA': 'GJ30',
  'ARVALLI': 'GJ31', 'MODASA': 'GJ31',
  'GIR SOMNATH': 'GJ32', 'VERAVAL': 'GJ32',
  'BOTAD': 'GJ33',
  'CHHOTA UDEPUR': 'GJ34',
  'MAHISAGAR': 'GJ35', 'LUNAWADA': 'GJ35',
  'MORBI': 'GJ36',
  'DEVBHUMI DWARKA': 'GJ37', 'KHAMBHALIA': 'GJ37',

  // Madhya Pradesh
  'BHOPAL': 'MP04',
  'HOSHANGABAD': 'MP05', 'NARMADAPURAM': 'MP05',
  'GWALIOR': 'MP07',
  'GUNA': 'MP08',
  'INDORE': 'MP09',
  'KHARGONE': 'MP10',
  'KHANDWA': 'MP12',
  'UJJAIN': 'MP13',
  'MANDSAUR': 'MP14',
  'SAGAR': 'MP15',
  'CHHATARPUR': 'MP16',
  'REWA': 'MP17',
  'SHAHDOL': 'MP18',
  'SATNA': 'MP19',
  'JABALPUR': 'MP20',
  'KATNI': 'MP21',
  'SEONI': 'MP22',
  'CHHINDWARA': 'MP28',
  'SHIVPURI': 'MP33',
  'TIKAMGARH': 'MP36',
  'SEHORE': 'MP37',
  'RAJGARH': 'MP39',
  'VIDISHA': 'MP40',
  'DEWAS': 'MP41',
  'RATLAM': 'MP43',
  'BETUL': 'MP48',
  'BALAGHAT': 'MP50',

  // West Bengal
  'KOLKATA': 'WB01', 'BELTALA': 'WB02', 'SALT LAKE': 'WB03',
  'HOWRAH': 'WB11', 'ULUBERIA': 'WB13',
  'HOOGHLY': 'WB15', 'CHINSURAH': 'WB15', 'ARAMBAGH': 'WB17',
  'ALIPORE': 'WB22', 'BARRACKPORE': 'WB24', 'BARASAT': 'WB25',
  'TAMLUK': 'WB29', 'HALDIA': 'WB30',
  'MIDNAPORE': 'WB33', 'MEDINIPUR': 'WB33', 'KHARAGPUR': 'WB34',
  'ASANSOL': 'WB38', 'DURGAPUR': 'WB39',
  'BURDWAN': 'WB41', 'BARDHAMAN': 'WB41',
  'BIRBHUM': 'WB53', 'SURI': 'WB53', 'BOLPUR': 'WB54',
  'PURULIA': 'WB55',
  'MURSHIDABAD': 'WB57', 'BERHAMPORE': 'WB57',
  'BALURGHAT': 'WB61', 'DAKSHIN DINAJPUR': 'WB61',
  'COOCH BEHAR': 'WB63',
  'MALDA': 'WB65',
  'BANKURA': 'WB67',
  'ALIPURDUAR': 'WB69',
  'JALPAIGURI': 'WB71',
  'SILIGURI': 'WB73',
  'DARJEELING': 'WB77',

  // Jharkhand
  'RANCHI': 'JH01',
  'HAZARIBAGH': 'JH02',
  'DALTONGANJ': 'JH03', 'PALAMU': 'JH03', 'MEDININAGAR': 'JH03',
  'DUMKA': 'JH04',
  'JAMSHEDPUR': 'JH05', 'EAST SINGHBHUM': 'JH05',
  'CHAIBASA': 'JH06', 'WEST SINGHBHUM': 'JH06',
  'GUMLA': 'JH07',
  'LOHARDAGA': 'JH08',
  'BOKARO': 'JH09',
  'DHANBAD': 'JH10',
  'GIRIDIH': 'JH11',
  'KODERMA': 'JH12',
  'CHATRA': 'JH13',
  'DEOGHAR': 'JH15',
  'PAKUR': 'JH16',
  'GODDA': 'JH17',
  'SAHIBGANJ': 'JH18',
  'LATEHAR': 'JH19',
  'SIMDEGA': 'JH20',
  'JAMTARA': 'JH21',
  'SARAIKELA': 'JH22',
  'KHUNTI': 'JH23',
  'RAMGARH': 'JH24',

  // Chhattisgarh
  'RAIPUR': 'CG04',
  'DHAMTARI': 'CG05',
  'MAHASAMUND': 'CG06',
  'DURG': 'CG07', 'BHILAI': 'CG07',
  'RAJNANDGAON': 'CG08',
  'KAWARDHA': 'CG09', 'KABIRDHAM': 'CG09',
  'BILASPUR CG': 'CG10',
  'JANJGIR': 'CG11', 'CHAMPA': 'CG11',
  'KORBA': 'CG12',
  'RAIGARH': 'CG13',
  'JASHPUR': 'CG14',
  'SURGUJA': 'CG15', 'AMBIKAPUR': 'CG15',
  'KOREA': 'CG16', 'BAIKUNTHPUR': 'CG16',
  'BASTAR': 'CG17', 'JAGDALPUR': 'CG17',
  'DANTEWADA': 'CG18',
  'KANKER': 'CG19',

  // Karnataka
  'BANGALORE': 'KA01', 'BENGALURU': 'KA01', 'KORAMANGALA': 'KA01',
  'RAJAJINAGAR': 'KA02',
  'INDIRANAGAR': 'KA03',
  'YESHWANTHPUR': 'KA04',
  'JAYANAGAR': 'KA05',
  'TUMKUR': 'KA06', 'TUMAKURU': 'KA06',
  'KOLAR': 'KA07',
  'SHIMOGA': 'KA14', 'SHIVAMOGGA': 'KA14',
  'DAVANGERE': 'KA17',
  'MYSORE': 'KA09', 'MYSURU': 'KA09',
  'MANGALORE': 'KA19', 'MANGALURU': 'KA19',
  'UDUPI': 'KA20',
  'BELGAUM': 'KA22', 'BELAGAVI': 'KA22',
  'HUBLI': 'KA25', 'DHARWAD': 'KA25',
  'GULBARGA': 'KA32', 'KALABURAGI': 'KA32',
  'BELLARY': 'KA34', 'BALLARI': 'KA34',
  'ELECTRONIC CITY': 'KA51',
  'YELAHANKA': 'KA50',

  // Kerala
  'THIRUVANANTHAPURAM': 'KL01', 'TRIVANDRUM': 'KL01',
  'KOLLAM': 'KL02',
  'PATHANAMTHITTA': 'KL03',
  'ALAPPUZHA': 'KL04',
  'KOTTAYAM': 'KL05',
  'IDUKKI': 'KL06',
  'ERNAKULAM': 'KL07', 'KOCHI': 'KL07',
  'THRISSUR': 'KL08',
  'PALAKKAD': 'KL09',
  'MALAPPURAM': 'KL10',
  'KOZHIKODE': 'KL11', 'CALICUT': 'KL11',
  'WAYANAD': 'KL12',
  'KANNUR': 'KL13',
  'KASARAGOD': 'KL14',

  // Tamil Nadu
  'CHENNAI': 'TN01', 'CHENNAI CENTRAL': 'TN01',
  'CHENNAI NORTH': 'TN03', 'CHENNAI SOUTH': 'TN07', 'CHENNAI WEST': 'TN09',
  'COIMBATORE': 'TN37',
  'MADURAI': 'TN58',
  'TIRUCHIRAPPALLI': 'TN45', 'TRICHY': 'TN45',
  'SALEM': 'TN27',
  'TIRUNELVELI': 'TN72',
  'ERODE': 'TN33',
  'VELLORE': 'TN23',
  'TIRUPPUR': 'TN39',
  'THANJAVUR': 'TN49',
  'DINDIGUL': 'TN57',
  'KANCHEEPURAM': 'TN21',

  // Telangana
  'HYDERABAD': 'TS09', 'SECUNDERABAD': 'TS10',
  'RANGA REDDY': 'TS07',
  'MEDCHAL': 'TS08',
  'WARANGAL': 'TS03',
  'KARIMNAGAR': 'TS02',
  'KHAMMAM': 'TS04',
  'NIZAMABAD': 'TS16',
  'NALGONDA': 'TS05',
  'MAHABUBNAGAR': 'TS06',

  // Andhra Pradesh
  'VISAKHAPATNAM': 'AP31', 'VIZAG': 'AP31',
  'VIJAYAWADA': 'AP16',
  'GUNTUR': 'AP07',
  'TIRUPATI': 'AP03',
  'KURNOOL': 'AP21',
  'NELLORE': 'AP26',
  'KAKINADA': 'AP05',
  'RAJAHMUNDRY': 'AP05',
  'ANANTAPUR': 'AP02',
  'KADAPA': 'AP04',

  // Goa
  'PANAJI': 'GA01', 'NORTH GOA': 'GA01',
  'MARGAO': 'GA02', 'SOUTH GOA': 'GA02',
  'MAPUSA': 'GA03',
  'BICHOLIM': 'GA04',
  'PONDA': 'GA05',
  'VASCO': 'GA06',

  // Puducherry
  'PUDUCHERRY': 'PY01', 'PONDICHERRY': 'PY01',
  'OULGARET': 'PY02', 'KARAIKAL': 'PY02',
  'MAHE': 'PY03',
  'YANAM': 'PY04',

  // Sikkim
  'GANGTOK': 'SK01',
  'GAYZING': 'SK02',
  'MANGAN': 'SK03',
  'JORETHANG': 'SK04',

  // Tripura
  'AGARTALA': 'TR01',
  'DHARMANAGAR': 'TR02',
  'UDAIPUR TRIPURA': 'TR03',
  'KAILASHAHAR': 'TR04',
  'AMBASSA': 'TR05',
  'KHOWAI': 'TR06',
  'BISHALGARH': 'TR07',
  'SANTIRBAZAR': 'TR08',

  // Manipur
  'IMPHAL': 'MN01',
  'CHURACHANDPUR': 'MN02',
  'THOUBAL': 'MN04',
  'BISHNUPUR': 'MN05',
  'UKHRUL': 'MN07',

  // Meghalaya
  'SHILLONG': 'ML05',
  'JOWAI': 'ML04',
  'TURA': 'ML08',
  'NONGSTOIN': 'ML06',
  'WILLIAMNAGAR': 'ML07',

  // Mizoram
  'AIZAWL': 'MZ01',
  'LUNGLEI': 'MZ02',
  'SAIHA': 'MZ03',
  'CHAMPHAI': 'MZ04',
  'KOLASIB': 'MZ05',
  'SERCHHIP': 'MZ06',
  'LAWNGTLAI': 'MZ07',
  'MAMIT': 'MZ08',

  // Nagaland
  'KOHIMA': 'NL01',
  'MOKOKCHUNG': 'NL02',
  'TUENSANG': 'NL03',
  'MON': 'NL04',
  'WOKHA': 'NL05',
  'ZUNHEBOTO': 'NL06',
  'DIMAPUR': 'NL07',
  'PHEK': 'NL08',

  // Arunachal Pradesh
  'ITANAGAR': 'AR01', 'NAHARLAGUN': 'AR01',
  'PASIGHAT': 'AR09',
  'TEZU': 'AR11',
  'TAWANG': 'AR10',
  'ZIRO': 'AR03',
  'BOMDILA': 'AR04',

  // Andaman and Nicobar
  'PORT BLAIR': 'AN01', 'ANDAMAN': 'AN01', 'CAR NICOBAR': 'AN02',

  // DNH and DD
  'SILVASSA': 'DN01', 'DADRA': 'DN01',
  'DAMAN': 'DD01',
  'DIU': 'DD02'
};

const STATE_CODE_PREFIX = {
  'andaman and nicobar': 'AN', 'andaman': 'AN', 'an': 'AN',
  'andhra pradesh': 'AP', 'andhra': 'AP', 'ap': 'AP',
  'arunachal pradesh': 'AR', 'arunachal': 'AR', 'ar': 'AR',
  'assam': 'AS', 'as': 'AS',
  'bihar': 'BR', 'br': 'BR',
  'chandigarh': 'CH', 'ch': 'CH',
  'chhattisgarh': 'CG', 'chhatisgarh': 'CG', 'cg': 'CG',
  'delhi': 'DL', 'nct of delhi': 'DL', 'dl': 'DL',
  'goa': 'GA', 'ga': 'GA',
  'gujarat': 'GJ', 'gj': 'GJ',
  'haryana': 'HR', 'hr': 'HR',
  'himachal pradesh': 'HP', 'himachal': 'HP', 'hp': 'HP',
  'jammu and kashmir': 'JK', 'jammu & kashmir': 'JK', 'jammu': 'JK', 'kashmir': 'JK', 'j&k': 'JK', 'jk': 'JK',
  'jharkhand': 'JH', 'jh': 'JH',
  'karnataka': 'KA', 'ka': 'KA',
  'kerala': 'KL', 'kl': 'KL',
  'ladakh': 'LA', 'la': 'LA',
  'lakshadweep': 'LD', 'lakshadweep(ut)': 'LD', 'ld': 'LD',
  'madhya pradesh': 'MP', 'mp': 'MP',
  'maharashtra': 'MH', 'mh': 'MH',
  'manipur': 'MN', 'mn': 'MN',
  'meghalaya': 'ML', 'ml': 'ML',
  'mizoram': 'MZ', 'mz': 'MZ',
  'nagaland': 'NL', 'nl': 'NL',
  'odisha': 'OD', 'orissa': 'OD', 'od': 'OD', 'or': 'OD',
  'pondicherry': 'PY', 'puducherry': 'PY', 'py': 'PY',
  'punjab': 'PB', 'pb': 'PB',
  'rajasthan': 'RJ', 'rj': 'RJ',
  'sikkim': 'SK', 'sk': 'SK',
  'tamil nadu': 'TN', 'tamilnadu': 'TN', 'tn': 'TN',
  'telangana': 'TS', 'ts': 'TS', 'tg': 'TS',
  'tripura': 'TR', 'tr': 'TR',
  'ut of dnh and dd': 'DD', 'daman and diu': 'DD', 'dadra and nagar haveli': 'DN', 'dd': 'DD', 'dn': 'DN',
  'uttarakhand': 'UK', 'uttaranchal': 'UK', 'uk': 'UK', 'ua': 'UK',
  'uttar pradesh': 'UP', 'up': 'UP',
  'west bengal': 'WB', 'wb': 'WB'
};

const STATE_DEFAULT_RTO = {
  'AN': 'AN01',
  'AP': 'AP01',
  'AR': 'AR01',
  'AS': 'AS04',
  'BR': 'BR01',
  'CG': 'CG04',
  'CH': 'CH01',
  'DD': 'DD01',
  'DL': 'DL04',
  'DN': 'DN01',
  'GA': 'GA01',
  'GJ': 'GJ01',
  'HP': 'HP01',
  'HR': 'HR01',
  'JH': 'JH01',
  'JK': 'JK01',
  'KA': 'KA01',
  'KL': 'KL01',
  'LA': 'LA01',
  'LD': 'LD01',
  'MH': 'MH01',
  'ML': 'ML05',
  'MN': 'MN01',
  'MP': 'MP04',
  'MZ': 'MZ01',
  'NL': 'NL01',
  'OD': 'OD10',
  'PB': 'PB02',
  'PY': 'PY01',
  'RJ': 'RJ14',
  'SK': 'SK01',
  'TN': 'TN01',
  'TR': 'TR01',
  'TS': 'TS09',
  'UK': 'UK07',
  'UP': 'UP78',
  'WB': 'WB01'
};

function getStateCodePrefix(state) {
  if (!state) return null;
  const s = String(state).toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  if (STATE_CODE_PREFIX[s]) return STATE_CODE_PREFIX[s];
  const upper = String(state).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  for (const [k, v] of Object.entries(STATE_CODE_PREFIX)) {
    if (s.includes(k) || k.includes(s)) return v;
  }
  return null;
}

function deriveRtoCode(llNo, rtoName, state) {
  const statePrefix = getStateCodePrefix(state);

  // 1. Direct extraction from Learner Licence Number (e.g. "OD10 /0009446/2026", "JK02/...")
  if (llNo) {
    const cleanLl = String(llNo).trim();
    const m = cleanLl.match(/\b([A-Za-z]{2})\s*[-/]?\s*(\d{1,3})\b/);
    if (m) {
      return (m[1].toUpperCase() + m[2].padStart(2, '0'));
    }
  }

  // 2. Lookup by RTO Name from map (e.g. "ARTO, BARAMULLA" -> "JK05", "DTO, SIVSAGAR" -> "AS04")
  if (rtoName) {
    const rawUpper = String(rtoName).toUpperCase();
    const cleanRto = rawUpper.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if RTO name already contains an RTO code like "OD10", "AS04", "JK05", "UP78"
    const directCodeMatch = cleanRto.match(/\b([A-Z]{2})\s*(\d{1,3})\b/);
    if (directCodeMatch) {
      return directCodeMatch[1] + directCodeMatch[2].padStart(2, '0');
    }

    // Strip common prefixes
    const strippedRto = cleanRto
      .replace(/^(?:DTO|RTO|ARTO|ZO|OFFICE|DISTRICT TRANSPORT OFFICE|REGIONAL TRANSPORT OFFICE|ASSISTANT REGIONAL TRANSPORT OFFICE)\s+/, '')
      .trim();

    // Priority A: If state prefix is known, strictly match ONLY within this state!
    if (statePrefix) {
      if (KNOWN_RTO_MAP[strippedRto] && KNOWN_RTO_MAP[strippedRto].startsWith(statePrefix)) {
        return KNOWN_RTO_MAP[strippedRto];
      }
      if (KNOWN_RTO_MAP[cleanRto] && KNOWN_RTO_MAP[cleanRto].startsWith(statePrefix)) {
        return KNOWN_RTO_MAP[cleanRto];
      }

      for (const [key, code] of Object.entries(KNOWN_RTO_MAP)) {
        if (code.startsWith(statePrefix)) {
          if (cleanRto.includes(key) || strippedRto.includes(key) || key.includes(strippedRto)) {
            return code;
          }
        }
      }

      const words = strippedRto.split(' ').filter(w => w.length >= 3);
      for (const w of words) {
        for (const [key, code] of Object.entries(KNOWN_RTO_MAP)) {
          if (code.startsWith(statePrefix)) {
            if (key === w || key.split(' ').includes(w)) {
              return code;
            }
          }
        }
      }

      // If state was specified and none of its districts matched, return this state's default RTO!
      if (STATE_DEFAULT_RTO[statePrefix]) {
        return STATE_DEFAULT_RTO[statePrefix];
      }
    } else {
      // Direct match with stripped string
      if (KNOWN_RTO_MAP[strippedRto]) {
        return KNOWN_RTO_MAP[strippedRto];
      }
      if (KNOWN_RTO_MAP[cleanRto]) {
        return KNOWN_RTO_MAP[cleanRto];
      }
      for (const [key, code] of Object.entries(KNOWN_RTO_MAP)) {
        if (cleanRto.includes(key) || strippedRto.includes(key)) {
          return code;
        }
      }
    }
  }

  // 3. Fallback based on State (Never default to AS04 for non-Assam states!)
  if (statePrefix && STATE_DEFAULT_RTO[statePrefix]) {
    return STATE_DEFAULT_RTO[statePrefix];
  }

  return 'AS04';
}

// ───────── ASYNC AI-ASSISTED RTO CODE RESOLVER ─────────
async function resolveRtoCode(llNo, rtoName, state) {
  const localCode = deriveRtoCode(llNo, rtoName, state);

  // Check if localCode is high confidence (direct hit or LL hit)
  if (localCode) {
    if (llNo && String(llNo).includes(localCode)) return localCode;
    if (rtoName) {
      const rawUpper = String(rtoName).toUpperCase();
      const hasDirectHit = Object.entries(KNOWN_RTO_MAP).some(([k, code]) => code === localCode && rawUpper.includes(k));
      if (hasDirectHit) return localCode;
    }
  }

  // If local derivation only gave a default state fallback and RTO name was provided, consult Gemini AI for exact code
  if (rtoName && GEMINI_API_KEY && GEMINI_API_KEY !== 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    try {
      console.log(`🤖 Consulting Gemini AI for exact RTO code: State="${state}", RTO="${rtoName}"...`);
      const prompt = `Identify the exact 4-character Indian RTO code (format: 2 uppercase letters followed by 2 digits, e.g. JK05, RJ14, UP78, MH12, PB02) for the following RTO office:\nState: ${state || 'India'}\nRTO Office: ${rtoName}\nOutput ONLY the 4-character code (nothing else).`;

      const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
      for (const model of candidateModels) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.0, maxOutputTokens: 20 }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
            const m = text?.match(/\b([A-Z]{2}\d{2})\b/);
            if (m) {
              console.log(`✅ Gemini AI (${model}) resolved RTO Code: "${m[1]}" for "${rtoName}" [${state}]`);
              return m[1];
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn(`⚠️ AI RTO lookup note: ${e.message}`);
    }
  }

  return localCode || 'AS04';
}

// ───────── STEP 2: AUTOFILL & MOCK TRIGGER VIA OBSCURA FILES CHROME ─────────
async function executeStage2(state, appNo, dob, userPassword, derivedRtoCode, subId, chatId) {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 STEP 2: TRIGGERING OBSCURA FILES CHROME (PYTHON BOT)...');
  console.log(`   State          : ${state}`);
  console.log(`   Application No : ${appNo}`);
  console.log(`   DOB            : ${dob}`);
  console.log(`   Password       : ${userPassword}`);
  console.log(`   RTO Code       : ${derivedRtoCode}`);
  console.log('='.repeat(60) + '\n');

  const pythonScript = path.join(__dirname, 'scripts', 'bot.py');
  const targetChatId = (chatId && chatId !== 'TERMINAL') ? String(chatId) : String(lastActiveChatId || '8246537527');

  const pyArgs = [
    pythonScript,
    state || 'Assam',
    appNo,
    dob,
    userPassword || '17760G',
    derivedRtoCode || 'AS04',
    targetChatId
  ];

  console.log(`   Executing: python "${pythonScript}" "${state || 'Assam'}" "${appNo}" "${dob}" "${userPassword || '17760G'}" "${derivedRtoCode || 'AS04'}" "${targetChatId}"\n`);

  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const reqFile = path.join(DATA_DIR, 'step2_captcha_req.json');
  const resFile = path.join(DATA_DIR, 'step2_captcha_res.json');

  // Clean old bridge files before starting
  try { if (fs.existsSync(reqFile)) fs.unlinkSync(reqFile); } catch (_) {}
  try { if (fs.existsSync(resFile)) fs.unlinkSync(resFile); } catch (_) {}

  let bridgeActive = true;
  const bridgeLoop = async () => {
    while (bridgeActive) {
      try {
        if (fs.existsSync(reqFile)) {
          let reqData = null;
          try {
            const raw = fs.readFileSync(reqFile, 'utf8');
            reqData = JSON.parse(raw);
          } catch (_) {}

          if (reqData && reqData.status === 'PENDING') {
            reqData.status = 'PROCESSING';
            try {
              fs.writeFileSync(reqFile, JSON.stringify(reqData));
            } catch (_) {}

            console.log(`\n📲 Step 2 Captcha Request from Python (Attempt ${reqData.attempt || 1})!`);
            let imgBuffer = null;
            const imgPath = reqData.imagePath || path.join(DATA_DIR, 'step2_captcha.png');
            if (fs.existsSync(imgPath)) {
              imgBuffer = fs.readFileSync(imgPath);
            }

            if (imgBuffer && targetChatId) {
              const attempt = reqData.attempt || 1;
              const caption = attempt === 1
                ? `📸 <b>Step 2 (Sarathi Mock) Verification Code</b>\n\nKripya is photo ka captcha likh kar reply karein:`
                : `⚠️ <b>Incorrect Captcha (Attempt ${attempt}/5)</b>\n\nNaya captcha refresh hua hai. Kripya sahi captcha likh kar reply karein:`;

              console.log(`📲 Sending Step 2 captcha photo to Telegram (Chat: ${targetChatId})...`);
              await sendTelegramPhoto(targetChatId, imgBuffer, caption, 'step2_captcha.png').catch((e) => {
                console.error('Failed to send Step 2 photo to Telegram:', e.message);
              });

              await new Promise((resolveCaptcha) => {
                let finished = false;
                const timer = setTimeout(() => {
                  if (!finished) {
                    finished = true;
                    activeCaptchaResolver = null;
                    activeCaptchaChatId = null;
                    console.warn('⚠️ Step 2 Captcha timed out on Telegram after 120s.');
                    resolveCaptcha(null);
                  }
                }, 120000);

                activeCaptchaChatId = targetChatId;
                activeCaptchaResolver = (ans) => {
                  if (!finished) {
                    finished = true;
                    clearTimeout(timer);
                    activeCaptchaResolver = null;
                    activeCaptchaChatId = null;
                    try {
                      fs.writeFileSync(resFile, JSON.stringify({
                        status: 'DONE',
                        captcha: (ans || '').trim(),
                        timestamp: Date.now()
                      }));
                      if (fs.existsSync(reqFile)) fs.unlinkSync(reqFile);
                    } catch (e) {
                      console.error('Error writing resFile:', e.message);
                    }
                    resolveCaptcha(ans);
                  }
                };
              });
            }
          }
        }
      } catch (err) {
        // ignore concurrency errors
      }
      await sleep(250);
    }
  };

  const bridgePromise = bridgeLoop();

  const { spawn } = require('child_process');
  await new Promise((resolve) => {
    const pyProc = spawn('python', pyArgs, {
      cwd: path.dirname(pythonScript),
      stdio: 'inherit',
      env: {
        ...process.env,
        RUN_FROM_NODE: '1',
        TELEGRAM_CHAT_ID: targetChatId
      }
    });
    pyProc.on('close', (code) => {
      console.log(`\n🤖 Step 2 finished with exit code ${code}`);
      resolve();
    });
    pyProc.on('error', (err) => {
      console.error(`❌ Python launch error: ${err.message}`);
      resolve();
    });
  });

  bridgeActive = false;
  await bridgePromise.catch(() => {});
  try { if (fs.existsSync(reqFile)) fs.unlinkSync(reqFile); } catch (_) {}
  try { if (fs.existsSync(resFile)) fs.unlinkSync(resFile); } catch (_) {}

  if (subId) {
    db.update(subId, {
      status: 'COMPLETED'
    });
  }

  if (targetChatId) {
    await sendTelegramMessage(
      targetChatId,
      `🎉 <b>Photo Upload Complete!</b>\n\n` +
      `Obscura Files Chrome me aapka form fill ho gaya hai, RTO mock captcha trigger ho gaya hai aur <b>Photo (Photo_${appNo}.jpg)</b> upload ho chuki hai!\n\n` +
      `👉 Ab aap Camera aur FaceAuth aage manually complete karein.`
    );
  }

  console.log('🎉 Step 2 Complete!\n');
}

// ───────── WORKFLOW TOGGLES ─────────
// Set to true to bypass Stage 1 (photo download) and test Stage 2 directly
const SKIP_STAGE_1 = false;
// Set to false: only Step 1 runs (photo download & details save), Step 2 is disabled
const ENABLE_STAGE_2 = false;

async function runSarathiSearch(chatId, userName, state, appNo, dob, password = '', rtoCodeOverride = '', subId = null) {
  isProcessing = true;

  console.log(`\n🚀 Starting Search: State=${state}, App=${appNo}, DOB=${dob}, Password=${password}, RTO=${rtoCodeOverride}`);

  if (SKIP_STAGE_1) {
    console.log('⚡ [DEV TESTING] Stage 1 (Photo download) paused as requested. Directly executing Stage 2...');
    
    let derivedRtoCode = rtoCodeOverride || '';
    if (!derivedRtoCode || derivedRtoCode === '—') {
      if (subId) {
        const rec = db.getById(subId);
        if (rec && rec.rtoCode && rec.rtoCode !== '—') derivedRtoCode = rec.rtoCode;
      }
    }
    if (!derivedRtoCode || derivedRtoCode === '—') {
      derivedRtoCode = await resolveRtoCode('', '', state);
    }

    let userPassword = password || '17760G';

    if (subId) {
      db.update(subId, {
        status: 'PROCESSING_STAGE_2',
        rtoCode: derivedRtoCode,
        password: userPassword
      });
    }

    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `⚡ <b>Stage 1 Paused (Testing Mode)</b>\n\n` +
        `Directly launching <b>Obscura Files Chrome (Stage 2)</b>:\n` +
        `• <b>Application No:</b> <code>${appNo}</code>\n` +
        `• <b>DOB:</b> <code>${dob}</code>\n` +
        `• <b>RTO Code:</b> <code>${derivedRtoCode}</code>\n` +
        `• <b>Password:</b> <code>${userPassword}</code>\n\n` +
        `🚀 Chrome launching now...`
      );
    }

    try {
      await executeStage2(state, appNo, dob, userPassword, derivedRtoCode, subId, chatId);
    } catch (err) {
      console.error('❌ Stage 2 Error:', err);
    } finally {
      isProcessing = false;
      sessions.delete(chatId);
    }
    return;
  }

  let browser = null;
  let context = null;

  try {
    console.log('🌐 Starting Stage 1: Live Portal Lookup (Photo & RTO Details)...');
    
    browser = await chromium.launch({
      headless: false,
      slowMo: 60
    });

    context = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();

    // 1. Open State Selection
    console.log('1️⃣ Opening State Selection page...');
    await page.goto('https://sarathi.parivahan.gov.in/sarathiservice/stateSelection.do', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(1500);

    // 2. Dismiss initial popup
    console.log('2️⃣ Dismissing initial popup...');
    await page.keyboard.press('Escape');
    await sleep(1500);

    // 3. Select state
    console.log(`3️⃣ Selecting State: "${state}"...`);
    const stateSelect = page.locator('select').first();
    await stateSelect.waitFor({ state: 'visible', timeout: 15000 });
    try {
      await stateSelect.selectOption({ label: state });
    } catch (_) {
      const selected = await page.evaluate((targetState) => {
        const select = document.querySelector('select');
        if (!select) return false;
        const options = Array.from(select.options);
        const match = options.find(o => o.text.trim().toLowerCase() === targetState.toLowerCase() || o.text.trim().toLowerCase().includes(targetState.toLowerCase()));
        if (match) {
          select.value = match.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, state);
      if (!selected) {
        await stateSelect.selectOption({ index: 1 });
      }
    }
    await sleep(3500);

    // 4. Dismiss secondary popup (cut / close modal)
    console.log('4️⃣ Dismissing secondary modal (Cut popup)...');
    const closeBtn = page.locator('#contactless_statepopup .popupclose, #contactless_statepopup button[data-dismiss="modal"], .popupclose').first();
    if (await closeBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await closeBtn.click({ force: true });
    } else {
      await page.evaluate(() => {
        const el = document.querySelector('#contactless_statepopup .popupclose') || document.querySelector('.popupclose') || document.querySelector('[data-dismiss="modal"]');
        if (el) el.click();
      });
    }
    await page.keyboard.press('Escape');
    await sleep(2000);

    // 5. Navbar "Others" (cut karne ke baad Others pe click)
    console.log('5️⃣ Navigating to Others menu...');
    const othersNav = page.locator('li.nav-item.dropdown:has(a[href*="relatedAppln.do"]) > a, a.nav-link:has-text("Others")').first();
    await othersNav.waitFor({ state: 'visible', timeout: 15000 });
    await othersNav.click({ force: true });
    await sleep(1000);

    // 6. "Search Related Applications"
    console.log('6️⃣ Opening Search Related Applications...');
    const searchRelatedLink = page.locator('a[href*="relatedAppln.do"]').first();
    try {
      if (await searchRelatedLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          searchRelatedLink.click({ force: true })
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          page.evaluate(() => {
            const link = document.querySelector('a[href*="relatedAppln.do"]');
            if (link) link.click();
            else window.location.href = 'relatedAppln.do';
          })
        ]);
      }
    } catch (_) {
      await page.goto('https://sarathi.parivahan.gov.in/sarathiservice/relatedAppln.do', { waitUntil: 'domcontentloaded' });
    }
    await sleep(2000);

    // 7. Search Criteria -> Appl No
    console.log('7️⃣ Selecting Appl No...');
    const searchCriteria = page.locator('#AppRelation');
    await searchCriteria.waitFor({ state: 'visible', timeout: 10000 });
    await searchCriteria.selectOption('Appl No');
    await sleep(800);

    // 8. Application Number
    console.log(`8️⃣ Entering Application Number: ${appNo}`);
    const appNumInput = page.locator('#applNum');
    await appNumInput.fill(appNo);
    await sleep(500);

    // 9. Date of Birth
    console.log(`9️⃣ Entering Date of Birth: ${dob}`);
    const dobInput = page.locator('#dateOfBirth');
    await dobInput.fill(dob);
    await sleep(1000);

    // 10. Human Captcha Resolution via Telegram (User solves, bot enters & submits)
    let solvedSuccessfully = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`🔟 Capturing security code image (#capimg) - Attempt ${attempt}/5...`);
      const capImg = page.locator('#capimg');
      await capImg.waitFor({ state: 'visible', timeout: 10000 });
      await sleep(400);

      let capBuffer = null;
      try {
        const box = await capImg.boundingBox();
        if (box) {
          const viewport = page.viewportSize() || { width: 1280, height: 800 };
          const padX = 80;
          const padY = 40;
          const x = Math.max(0, Math.floor(box.x - padX));
          const y = Math.max(0, Math.floor(box.y - padY));
          const width = Math.min(viewport.width - x, Math.ceil(box.width + padX * 2));
          const height = Math.min(viewport.height - y, Math.ceil(box.height + padY * 2));
          capBuffer = await page.screenshot({ clip: { x, y, width, height } });
        }
      } catch (boxErr) {
        console.warn('⚠️ Padded captcha capture fallback:', boxErr.message);
      }
      if (!capBuffer) {
        capBuffer = await capImg.screenshot();
      }

      console.log(`📲 Requesting captcha from Telegram user...`);
      const solution = await requestCaptchaFromUser(chatId, capBuffer, attempt);

      if (!solution) {
        console.log(`⚠️ Captcha input empty or timed out on attempt ${attempt}/5. Retrying with fresh code...`);
        const refreshBtn = page.locator('#reload, a[onclick*="refresh" i], img[title*="Refresh" i]').first();
        if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await refreshBtn.click();
          await sleep(2000);
        }
        continue;
      }

      console.log(`✍️ Automatically entering code into portal: "${solution}"`);
      const capInput = page.locator('#captxt');
      await capInput.fill(solution);
      await sleep(500);

      // Submit
      console.log('🚀 Submitting form...');
      const submitBtn = page.locator('#submit, input[type="submit"]').first();
      await submitBtn.click();
      await sleep(3500);

      // Check if applicant details or "Show Photo & Sign" button appeared
      const showPhotoBtn = page.locator('button:has-text("Show Photo & Sign"), input[value*="Show Photo" i], a:has-text("Show Photo & Sign"), .btn:has-text("Show Photo")').first();
      const hasResults = await showPhotoBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasResults) {
        console.log('   ✅ Application details loaded successfully!');
        if (chatId || lastActiveChatId) {
          await sendTelegramMessage(chatId || lastActiveChatId, '🎉 <b>Step 1 Captcha Matched!</b>\nApplication details & photo successfully loaded.');
        }
        solvedSuccessfully = true;
        break;
      }

      // Check if error popup / invalid captcha alert appeared
      const errorAlert = page.locator('.alert-danger, .errorMsg, font[color="red"], #errorMsg').first();
      const hasError = await errorAlert.isVisible({ timeout: 1500 }).catch(() => false);
      if (hasError || attempt < 5) {
        console.log(`⚠️ Code not accepted by portal. Retrying with fresh code (attempt ${attempt}/5)...`);
        const refreshBtn = page.locator('#reload, a[onclick*="refresh" i], img[title*="Refresh" i]').first();
        if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await refreshBtn.click();
          await sleep(2000);
        }
        continue;
      }

      solvedSuccessfully = true;
      break;
    }

    if (!solvedSuccessfully) {
      console.log('⚠️ Verification code could not be completed automatically.');
      if (subId) {
        db.update(subId, {
          status: 'FAILED',
          errorMessage: 'Automatic verification code failed or GEMINI_API_KEY missing'
        });
      }
      if (chatId) {
        await sendTelegramMessage(chatId, '❌ <b>Step 1 Error:</b> Security verification code could not be solved automatically. Please try again.');
      }
      return;
    }

    // 11. Wait for applicant details
    console.log('⏳ Waiting for application details to render...');
    await sleep(3000);
    await page.waitForLoadState('networkidle').catch(() => {});

    // 12. Click "Show Photo & Sign" button
    console.log('🖼️ Checking "Show Photo & Sign" button...');
    const showPhotoBtn = page.locator('button:has-text("Show Photo & Sign"), input[value*="Show Photo" i], a:has-text("Show Photo & Sign"), .btn:has-text("Show Photo")').first();
    if (await showPhotoBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      console.log('   ✅ Clicking "Show Photo & Sign"...');
      await showPhotoBtn.click();
      await sleep(2500);
    }

    // Wait for the #images container to become visible
    await page.waitForSelector('#images', { state: 'visible', timeout: 6000 }).catch(() => {});

    // 13. Extract Applicant Details (with robust table and cell parsing)
    const applicantInfo = await page.evaluate(() => {
      const res = {
        name: '',
        fatherName: '',
        rto: '',
        llNo: ''
      };

      const isLabel = str => {
        if (!str) return true;
        const s = str.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase();
        return /^(?:name|father|husband|guardian|relation|rto|rto\s*name|appl|appl\s*no|appl\s*date|dob|date\s*of\s*birth|learner\s*licence\s*number|driving\s*licence\s*number|licence\s*number)(?:['’]s)?(?:\s*name)?\s*:?$/i.test(s);
      };

      const cleanVal = v => (v || '').replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

      // Tier 1: Check table rows (TR) and columns (TD/TH) directly
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => cleanVal(c.textContent));
        for (let i = 0; i < cells.length - 1; i++) {
          const lbl = cells[i];
          const val = cells[i + 1];

          if (!res.name && /^name\s*:?$/i.test(lbl) && !isLabel(val)) {
            res.name = val;
          }
          if (!res.fatherName && /^(?:father|husband|guardian|relation)(?:['’]s)?(?:\s*\/\s*husband(?:['’]s)?)?\s*name\s*:?$/i.test(lbl) && !isLabel(val)) {
            res.fatherName = val;
          }
          if (!res.rto && /^rto(?:\s*name)?\s*:?$/i.test(lbl) && !isLabel(val)) {
            res.rto = val;
          }
          if (!res.llNo && /^(?:learner|driving)?\s*licence\s*number\s*:?$/i.test(lbl) && !isLabel(val)) {
            res.llNo = val;
          }
        }
      }

      // Tier 2: Check all TD elements for combined "Label: Value" format
      if (!res.name || !res.fatherName || !res.rto || !res.llNo) {
        const allCells = Array.from(document.querySelectorAll('td, th, div, p, span'));
        for (const el of allCells) {
          const txt = cleanVal(el.textContent);
          if (!txt) continue;

          if (!res.name && /(?:^|[^a-z])Name\s*[:\-]\s*(.+)$/i.test(txt) && !/(?:father|husband|guardian|rto)/i.test(txt)) {
            const m = txt.match(/(?:^|[^a-z])Name\s*[:\-]\s*(.+)$/i);
            if (m && m[1]) {
              const v = cleanVal(m[1].split(/(?:DOB|Father|Husband|Guardian|RTO|Appl|Licence|Date)/i)[0]);
              if (!isLabel(v)) res.name = v;
            }
          }

          if (!res.fatherName && /(?:father|husband|guardian|relation)(?:['’]s)?(?:\s*\/\s*husband(?:['’]s)?)?\s*name\s*[:\-]\s*(.+)$/i.test(txt)) {
            const m = txt.match(/(?:father|husband|guardian|relation)(?:['’]s)?(?:\s*\/\s*husband(?:['’]s)?)?\s*name\s*[:\-]\s*(.+)$/i);
            if (m && m[1]) {
              const v = cleanVal(m[1].split(/(?:DOB|RTO|Name|Appl|Licence|Date)/i)[0]);
              if (!isLabel(v)) res.fatherName = v;
            }
          }

          if (!res.rto && /RTO(?:\s*Name)?\s*[:\-]\s*(.+)$/i.test(txt)) {
            const m = txt.match(/RTO(?:\s*Name)?\s*[:\-]\s*(.+)$/i);
            if (m && m[1]) {
              const v = cleanVal(m[1].split(/(?:DOB|Father|Husband|Name|Appl|Licence|Date)/i)[0]);
              if (!isLabel(v)) res.rto = v;
            }
          }

          if (!res.llNo && /Licence\s*Number\s*[:\-]\s*(.+)$/i.test(txt)) {
            const m = txt.match(/Licence\s*Number\s*[:\-]\s*(.+)$/i);
            if (m && m[1]) {
              const v = cleanVal(m[1].split(/(?:DOB|Father|Husband|Name|Appl|Date)/i)[0]);
              if (!isLabel(v)) res.llNo = v;
            }
          }
        }
      }

      // Final safety cleanup: ensure no labels ever slip through
      if (isLabel(res.name)) res.name = '';
      if (isLabel(res.fatherName)) res.fatherName = '';
      if (isLabel(res.rto)) res.rto = '';
      if (isLabel(res.llNo)) res.llNo = '';

      return res;
    });

    const derivedRtoCode = await resolveRtoCode(applicantInfo.llNo, applicantInfo.rto, state);
    console.log(`👤 Extracted Details: Name="${applicantInfo.name}", Father="${applicantInfo.fatherName}", RTO="${applicantInfo.rto}", RTO Code="${derivedRtoCode}", LL="${applicantInfo.llNo}"`);

    // 14. Extract Photo from #images
    console.log('🔍 Extracting original photo from #images...');
    const photoImg = page.locator('#images img').first();
    let photoBuffer = null;
    let photoBase64 = null;

    try {
      await photoImg.waitFor({ state: 'visible', timeout: 5000 });
      const photoSrc = await photoImg.getAttribute('src');

      if (photoSrc && photoSrc.startsWith('data:image')) {
        console.log('   ✅ Extracted pure Base64 Photo successfully!');
        const base64Data = photoSrc.replace(/^data:image\/\w+;base64,/, '');
        photoBuffer = Buffer.from(base64Data, 'base64');
        photoBase64 = base64Data;
      } else {
        console.log('   ℹ️ Capturing element snapshot of photo...');
        photoBuffer = await photoImg.screenshot();
        photoBase64 = photoBuffer.toString('base64');
      }
    } catch (e) {
      console.log('   ⚠️ Photo extraction fallback:', e.message);
    }

    // 15. Save Photo directly to Desktop (all detected Desktop folders) and backup to Downloads
    const photoFileName = `Photo_${appNo}.jpg`;
    const desktopDirs = getDesktopDirs();
    const downloadsDir = getDownloadsDir();
    const primaryDesktop = getDesktopDir();
    const targetPhotoPath = path.join(primaryDesktop, photoFileName);
    const backupPhotoPath = path.join(downloadsDir, photoFileName);

    if (photoBuffer) {
      // Save directly to ALL Desktop locations (OneDrive Desktop + Standard Desktop)
      for (const dDir of desktopDirs) {
        try {
          const dPath = path.join(dDir, photoFileName);
          fs.writeFileSync(dPath, photoBuffer);
          console.log(`💾 ✅ PHOTO SAVED DIRECTLY TO DESKTOP: ${dPath}`);
        } catch (err) {
          console.warn(`⚠️ Desktop save notice (${dDir}):`, err.message);
        }
      }

      // Also save backup copy in Downloads
      try {
        fs.writeFileSync(backupPhotoPath, photoBuffer);
        console.log(`💾 ✅ Photo backup copy saved in Downloads: ${backupPhotoPath}`);
      } catch (_) {}

      if (subId) {
        db.update(subId, {
          status: 'SUCCESS',
          applicantName: applicantInfo.name,
          fatherName: applicantInfo.fatherName,
          rtoName: applicantInfo.rto,
          rtoCode: derivedRtoCode,
          licenceNo: applicantInfo.llNo,
          photoPath: targetPhotoPath,
          photoBase64: photoBase64
        });
        console.log(`📋 Admin record updated to SUCCESS: ${subId} (RTO: "${applicantInfo.rto}", Code: "${derivedRtoCode}")`);
      }

      if (chatId) {
        const msg = `✅ <b>Applicant Details Extracted!</b>\n\n` +
          `👤 <b>Name:</b> ${applicantInfo.name || '—'}\n` +
          `👨 <b>Father:</b> ${applicantInfo.fatherName || '—'}\n` +
          `🏢 <b>RTO Office:</b> ${applicantInfo.rto || '—'}\n` +
          `🏷️ <b>RTO Code:</b> <code>${derivedRtoCode || '—'}</code>\n\n` +
          `🖥️ <b>Photo Saved directly on Desktop:</b> <code>${photoFileName}</code>\n\n` +
          `🎉 <b>Process Complete!</b>`;
        await sendTelegramPhoto(chatId, photoBuffer, msg, photoFileName).catch(() => {});
      }
    } else {
      if (subId) {
        db.update(subId, {
          status: 'FAILED',
          applicantName: applicantInfo.name,
          fatherName: applicantInfo.fatherName,
          rtoName: applicantInfo.rto,
          rtoCode: derivedRtoCode,
          licenceNo: applicantInfo.llNo,
          errorMessage: 'Photo element could not be extracted'
        });
      }
    }

    console.log('🎉 Step 1 Complete: Photo & Applicant Details Extracted & Saved to Downloads!');

    // Close Step 1 browser cleanly
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    console.log('🔒 Step 1 browser closed cleanly.');

    if (ENABLE_STAGE_2) {
      // ───────── STEP 2: AUTOFILL & MOCK TRIGGER ON OBSCURA FILES CHROME ─────────
      let userPassword = password;
      if (!userPassword && subId) {
        const rec = db.getById(subId);
        if (rec && rec.password) userPassword = rec.password;
      }
      if (!userPassword) userPassword = '17760G';

      let finalRtoCode = derivedRtoCode;
      if (!finalRtoCode || finalRtoCode === '—') {
        finalRtoCode = await resolveRtoCode('', applicantInfo.rto, state);
      }

      await executeStage2(state, appNo, dob, userPassword, finalRtoCode, subId, chatId);
    } else {
      console.log('🏁 Step 1 finished! (Step 2 is disabled). Photo successfully saved to Downloads.\n');
    }

  } catch (err) {
    console.error('❌ Error during process:', err);
    if (subId) {
      db.update(subId, {
        status: 'FAILED',
        errorMessage: err.message
      });
    }
  } finally {
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    isProcessing = false;
    sessions.delete(chatId);
    // Kept open so user can see and work with the screen!
  }
}

// ───────── MAIN TELEGRAM POLLING LOOP ─────────
async function startBot() {
  if (isBotRunning) return;
  isBotRunning = true;

  console.log('🤖 Professional Telegram Bot Service Running...');
  console.log(`   Token: ${BOT_TOKEN.substring(0, 15)}...`);
  console.log(`   Local Desktop Folder:   ${getDesktopDir()}`);
  console.log(`   Local Downloads Folder: ${getDownloadsDir()}`);
  
  // Launch Admin Dashboard Server
  createAdminServer();
  
  console.log('   Ready for messages! Press Ctrl+C to stop.\n');

  let offset = 0;

  // Clear previous updates
  try {
    const initRes = await fetch(`${TELEGRAM_API}/getUpdates?timeout=1`);
    const initData = await initRes.json();
    if (initData.result && initData.result.length > 0) {
      offset = initData.result[initData.result.length - 1].update_id + 1;
    }
  } catch (_) {}

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=10`);
      const data = await res.json();
      const updates = data.result || [];

      for (const update of updates) {
        offset = update.update_id + 1;

        // 1. Handle Inline State Selection (Step-by-step fallback)
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = String(cb.message.chat.id);
          const callbackData = cb.data;

          await answerCallbackQuery(cb.id);

          if (callbackData.startsWith('state:')) {
            const selectedState = callbackData.replace('state:', '');
            const cbUserName = cb.from?.username ? `@${cb.from.username}` : (cb.from?.first_name || 'Customer');
            console.log(`📍 User [${cbUserName} (${chatId})] selected State: "${selectedState}"`);

            sessions.set(chatId, {
              step: 'AWAITING_APP_NO',
              state: selectedState,
              userName: cbUserName
            });

            await sendTelegramMessage(
              chatId,
              `✅ <b>State Selected:</b> ${selectedState}\n\n` +
              `Please enter your <b>Application Number</b> to continue:`
            );
          }
          continue;
        }

        // 2. Handle Text Messages
        if (!update.message || !update.message.text) continue;

        const chatId = String(update.message.chat.id);
        const text = update.message.text.trim();
        const userName = update.message.from?.username ? `@${update.message.from.username}` : (update.message.from?.first_name || 'Customer');

        lastActiveChatId = chatId;

        // Check 0: Is the bot waiting for a Captcha answer from Telegram (Step 1 or Step 2)?
        if (activeCaptchaResolver && (!activeCaptchaChatId || activeCaptchaChatId === chatId)) {
          const resolver = activeCaptchaResolver;
          activeCaptchaResolver = null;
          activeCaptchaChatId = null;
          console.log(`\n🎯 Captcha received from Telegram [${userName} (${chatId})]: "${text}"`);
          await sendTelegramMessage(chatId, `✅ Captcha received: <code>${text}</code>\nSubmitting...`);
          resolver(text);
          continue;
        }

        console.log(`📩 Message from [${userName} (${chatId})]: "${text}"`);

        // Check A: Smart 1-Message Input (e.g. "RJ 5104276426 10-07-1994 JNSRNM")
        const singleLineData = parseSingleLineInput(text);
        if (singleLineData) {
          const { state, appNo, dob, password, rtoCode } = singleLineData;
          console.log(`🎯 1-Line Input parsed from [${userName}]: State="${state}", AppNo="${appNo}", DOB="${dob}", Password="${password ? '***' : 'None'}"`);

          // If password was NOT provided in the line, ask for password to complete
          if (!password) {
            sessions.set(chatId, {
              step: 'AWAITING_PASSWORD',
              state,
              appNo,
              dob,
              userName
            });

            await sendTelegramMessage(
              chatId,
              `✅ <b>Details Received:</b>\n` +
              `📍 <b>State:</b> ${state}\n` +
              `🔢 <b>Application No:</b> <code>${appNo}</code>\n` +
              `📅 <b>DOB:</b> <code>${dob}</code>\n\n` +
              `Please enter your <b>Password</b> to complete your submission:`
            );
            continue;
          }

          // Customer immediately receives Submission Successful — Customer role is complete!
          await sendTelegramMessage(chatId, '✅ <b>Submission Successful</b>\n\nStarting automated processing in background...');

          // Log in Admin Database (with plaintext password & rtoCode if known)
          const record = db.create({
            chatId,
            userName,
            state,
            appNo,
            dob,
            password,
            rtoCode: rtoCode || '—'
          });
          console.log(`📋 Admin record logged: ${record.id} [${state} - ${appNo}]`);

          // Background auto-process
          runSarathiSearch(chatId, userName, state, appNo, dob, password, rtoCode, record.id);
          continue;
        }

        // Check B: Handle /start
        if (text.startsWith('/start')) {
          sessions.delete(chatId);
          const welcomeText = (
            `Welcome to <b>Sarathi Licence & Application Services</b>, ${userName}.\n\n` +
            `💡 <b>Quickest Method:</b> Send your 4 details in 1 message:\n` +
            `<code>RJ 5104276426 10-07-1994 JNSRNM</code>\n` +
            `<i>(Format: State ApplicationNumber DOB Password)</i>\n\n` +
            `Or select your <b>State</b> below to proceed step-by-step:`
          );
          await sendTelegramMessage(chatId, welcomeText, getStateKeyboard());
          continue;
        }

        // Check C: User entering Application Number (Step-by-step mode)
        const userSession = sessions.get(chatId);
        if (userSession && userSession.step === 'AWAITING_APP_NO') {
          if (!/^\d{5,}$/.test(text)) {
            await sendTelegramMessage(
              chatId,
              `⚠️ <b>Invalid Application Number</b>\n\n` +
              `Please enter a valid numeric Application Number:`
            );
            continue;
          }

          userSession.appNo = text;
          userSession.step = 'AWAITING_DOB';
          console.log(`🔢 App No saved for ${chatId}: ${text}`);

          await sendTelegramMessage(
            chatId,
            `Application Number: <code>${text}</code>\n\n` +
            `Please enter your <b>Date of Birth (DOB)</b>\n` +
            `Format: <b>DD-MM-YYYY</b> <i>(e.g., 10-07-1994)</i>:`
          );
          continue;
        }

        // Check D: User entering Date of Birth (Step-by-step mode)
        if (userSession && userSession.step === 'AWAITING_DOB') {
          if (!/^\d{2}[-/.]\d{2}[-/.]\d{4}$/.test(text)) {
            await sendTelegramMessage(
              chatId,
              `⚠️ <b>Invalid Date Format</b>\n\n` +
              `Please enter your Date of Birth in <b>DD-MM-YYYY</b> format <i>(e.g., 10-07-1994)</i>:`
            );
            continue;
          }

          const formattedDob = text.replace(/[/.]/g, '-');
          userSession.dob = formattedDob;
          userSession.step = 'AWAITING_PASSWORD';
          console.log(`📅 DOB saved for ${chatId}: ${formattedDob}`);

          // Directly ask for Password (RTO Code is extracted automatically in Step 1)
          await sendTelegramMessage(
            chatId,
            `Date of Birth: <code>${formattedDob}</code>\n\n` +
            `Please enter your <b>Password</b> to complete your submission:`
          );
          continue;
        }

        // Check E: User entering Password (Step-by-step mode)
        if (userSession && userSession.step === 'AWAITING_PASSWORD') {
          const password = text;
          const userDisplayName = userSession.userName || userName;
          const { state, appNo, dob } = userSession;
          sessions.delete(chatId);

          console.log(`🔑 Password received for ${chatId}`);

          // Customer immediately receives Submission Successful
          await sendTelegramMessage(chatId, '✅ <b>Submission Successful</b>\n\nStarting automated processing in background...');

          // Immediately log submission to Database with plaintext password
          const record = db.create({
            chatId,
            userName: userDisplayName,
            state,
            appNo,
            dob,
            password,
            rtoCode: '—'
          });
          console.log(`📋 Admin record logged with password: ${record.id} [${state} - ${appNo}]`);

          // Background auto-process
          runSarathiSearch(chatId, userDisplayName, state, appNo, dob, password, '', record.id);
          continue;
        }

        // Check F: Fallback message
        await sendTelegramMessage(
          chatId,
          `💡 <b>Quick Submit:</b> Send your 4 details in 1 message:\n` +
          `<code>RJ 5104276426 10-07-1994 JNSRNM</code>\n` +
          `<i>(State ApplicationNumber DOB Password)</i>\n\n` +
          `Or send <b>/start</b> to begin step-by-step.`
        );
      }
    } catch (e) {
      await sleep(1500);
    }
  }
}

// ───────── MAIN RUNNER (TERMINAL CLI ARGS OR TELEGRAM BOT) ─────────
async function main() {
  // Always start Telegram bot in background so it can listen for commands and user captcha responses
  startBot().catch(err => console.error('Telegram bot polling error:', err));

  const cliArgs = process.argv.slice(2);
  if (cliArgs.length > 0) {
    const cliText = cliArgs.join(' ');
    const parsed = parseSingleLineInput(cliText);
    if (parsed) {
      console.log('\n' + '='.repeat(60));
      console.log('⚡ DIRECT TERMINAL EXECUTION (WITH TELEGRAM CAPTCHA INTEGRATION)');
      console.log('='.repeat(60));
      console.log(`• State:           ${parsed.state}`);
      console.log(`• Application No:  ${parsed.appNo}`);
      console.log(`• DOB:             ${parsed.dob}`);
      console.log(`• Password:        ${parsed.password}`);
      console.log(`• RTO Code:        ${parsed.rtoCode || '(Extracted in Step 1)'}`);
      console.log(`• Telegram Target: ${lastActiveChatId || 'Waiting for user'}`);
      console.log('='.repeat(60) + '\n');

      const record = db.create({
        chatId: lastActiveChatId || 'TERMINAL',
        userName: 'TerminalUser',
        state: parsed.state,
        appNo: parsed.appNo,
        dob: parsed.dob,
        password: parsed.password,
        rtoCode: parsed.rtoCode || '—'
      });

      await runSarathiSearch(lastActiveChatId, 'TerminalUser', parsed.state, parsed.appNo, parsed.dob, parsed.password, parsed.rtoCode, record.id);
      console.log('\n🟢 Process completed! (Telegram bot still active in background, press Ctrl+C to exit)');
      return;
    } else {
      console.warn('\n⚠️ Could not parse command line arguments.');
      console.warn('👉 Expected format: node bot.js RJ 5104276426 10-07-1994 JNSRNM');
      console.warn('Starting Telegram Bot polling instead...\n');
    }
  }
}

main();
