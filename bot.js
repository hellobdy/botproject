const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');
const { createAdminServer } = require('./adminServer');

// ───────── CONFIGURATION ─────────
const BOT_TOKEN = '9144060826:AAGZs-cpHi52lDYx5GuKkrz5xxNUAgk742c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const DEFAULT_GEMINI_KEY = Buffer.from('QVEuQWI4Uk42S05SdXpmTUVqMHAwSnZIbTZzTFMyc1JYT2Y4Wmd4UktyVy1BN0lkUDdjNmc=', 'base64').toString('utf8');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───────── DYNAMIC DOWNLOADS DIRECTORY (WORKS ON ANY LAPTOP / PC) ─────────
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
async function solveCaptchaWithGemini(photoBufferOrBase64) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    console.error('❌ Gemini API key is missing! Please paste your Gemini API key in bot.js at GEMINI_API_KEY.');
    return null;
  }

  const base64Data = Buffer.isBuffer(photoBufferOrBase64) ? photoBufferOrBase64.toString('base64') : photoBufferOrBase64;
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite'
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
            text: 'Carefully identify and transcribe the alphanumeric security verification code in this image.\nRules:\n- Maintain exact uppercase and lowercase casing.\n- Pay close attention to differentiate: 0 vs O/o, 1 vs l/I, 5 vs S/s, 8 vs B, 9 vs g, 2 vs Z.\n- Ignore distortion lines or background noise.\n- Output ONLY the exact characters without any explanation, markdown, spaces, or extra punctuation.'
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 50
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
    rtoCode = deriveRtoCode('', '', matchedState) || 'AS04';
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

  // Rajasthan
  'JAIPUR': 'RJ14', 'JAIPUR NORTH': 'RJ45',
  'ALWAR': 'RJ02',
  'BHARATPUR': 'RJ05',
  'BHILWARA': 'RJ06',
  'BIKANER': 'RJ07',
  'CHITTORGARH': 'RJ09',
  'JODHPUR': 'RJ19',
  'KOTA': 'RJ20',
  'UDAIPUR': 'RJ27'
};

const STATE_CODE_PREFIX = {
  'odisha': 'OD', 'orissa': 'OD',
  'assam': 'AS',
  'uttar pradesh': 'UP',
  'bihar': 'BR',
  'delhi': 'DL',
  'maharashtra': 'MH',
  'karnataka': 'KA',
  'rajasthan': 'RJ',
  'madhya pradesh': 'MP',
  'west bengal': 'WB',
  'punjab': 'PB',
  'haryana': 'HR',
  'gujarat': 'GJ',
  'jharkhand': 'JH',
  'chhattisgarh': 'CG',
  'uttarakhand': 'UK'
};

function deriveRtoCode(llNo, rtoName, state) {
  // 1. Direct extraction from Learner Licence Number (e.g. "OD10 /0009446/2026" or "OD-10/...")
  if (llNo) {
    const cleanLl = String(llNo).trim();
    const m = cleanLl.match(/\b([A-Za-z]{2})\s*[-/]?\s*(\d{1,3})\b/);
    if (m) {
      return (m[1].toUpperCase() + m[2].padStart(2, '0'));
    }
  }

  // 2. Lookup by RTO Name from map (e.g. "DTO,SIVSAGAR" -> "AS04", "RTO KORAPUT" -> "OD10")
  if (rtoName) {
    const rawUpper = String(rtoName).toUpperCase();
    const cleanRto = rawUpper.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if RTO name already contains an RTO code like "OD10", "AS04", "UP78"
    const directCodeMatch = cleanRto.match(/\b([A-Z]{2})\s*(\d{1,3})\b/);
    if (directCodeMatch) {
      return directCodeMatch[1] + directCodeMatch[2].padStart(2, '0');
    }

    // Strip common prefixes like DTO, RTO, ARTO, ZO, TRANSPORT OFFICE
    const strippedRto = cleanRto
      .replace(/^(?:DTO|RTO|ARTO|ZO|OFFICE|DISTRICT TRANSPORT OFFICE|REGIONAL TRANSPORT OFFICE)\s+/, '')
      .trim();

    // Direct match with stripped string
    if (KNOWN_RTO_MAP[strippedRto]) {
      return KNOWN_RTO_MAP[strippedRto];
    }

    // Direct match with clean string
    if (KNOWN_RTO_MAP[cleanRto]) {
      return KNOWN_RTO_MAP[cleanRto];
    }

    // Substring match
    for (const [key, code] of Object.entries(KNOWN_RTO_MAP)) {
      if (cleanRto.includes(key) || strippedRto.includes(key)) {
        return code;
      }
    }

    // Word-by-word match
    const words = strippedRto.split(' ').filter(w => w.length >= 3);
    for (const w of words) {
      if (KNOWN_RTO_MAP[w]) {
        return KNOWN_RTO_MAP[w];
      }
      for (const [key, code] of Object.entries(KNOWN_RTO_MAP)) {
        if (key === w || key.startsWith(w) || w.startsWith(key)) {
          return code;
        }
      }
    }
  }

  // 3. Fallback based on State
  if (state) {
    const sLower = String(state).toLowerCase().trim();
    const prefix = STATE_CODE_PREFIX[sLower];
    if (prefix) {
      if (prefix === 'AS') return 'AS04';
      if (prefix === 'UP') return 'UP78';
      if (prefix === 'RJ') return 'RJ14';
      if (prefix === 'OD') return 'OD10';
      if (prefix === 'DL') return 'DL04';
      return `${prefix}01`;
    }
  }

  return 'AS04';
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

  const pyArgs = [
    pythonScript,
    state || 'Assam',
    appNo,
    dob,
    userPassword || '17760G',
    derivedRtoCode || 'AS04'
  ];

  console.log(`   Executing: python "${pythonScript}" "${state || 'Assam'}" "${appNo}" "${dob}" "${userPassword || '17760G'}" "${derivedRtoCode || 'AS04'}"\n`);

  const { spawn } = require('child_process');
  await new Promise((resolve) => {
    const pyProc = spawn('python', pyArgs, {
      cwd: path.dirname(pythonScript),
      stdio: 'inherit'
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

  if (subId) {
    db.update(subId, {
      status: 'COMPLETED'
    });
  }

  if (chatId) {
    await sendTelegramMessage(
      chatId,
      `🎉 <b>Photo Upload Complete!</b>\n\n` +
      `Obscura Files Chrome me aapka form fill ho gaya hai, RTO mock captcha trigger ho gaya hai aur <b>Photo (Photo_${appNo}.jpg)</b> upload ho chuki hai!\n\n` +
      `👉 Ab aap Camera aur FaceAuth aage manually complete karein.`
    );
  }

  console.log('🎉 Step 2 Complete!\n');
}

// ───────── STAGE 1 TOGGLE (DEV TESTING) ─────────
// Set to true to bypass Stage 1 (photo download) and test Stage 2 directly
// Set to false to run the complete end-to-end flow with photo download
const SKIP_STAGE_1 = true;

async function runSarathiSearch(chatId, userName, state, appNo, dob, password = '', rtoCodeOverride = '', subId = null) {
  isProcessing = true;

  console.log(`\n🚀 Starting Search: State=${state}, App=${appNo}, DOB=${dob}, Password=${password}, RTO=${rtoCodeOverride}`);

  if (SKIP_STAGE_1) {
    console.log('⚡ [DEV TESTING] Stage 1 (Photo download) paused as requested. Directly executing Stage 2...');
    
    let derivedRtoCode = rtoCodeOverride || 'AS04';
    if (!derivedRtoCode || derivedRtoCode === '—') {
      if (subId) {
        const rec = db.getById(subId);
        if (rec && rec.rtoCode && rec.rtoCode !== '—') derivedRtoCode = rec.rtoCode;
      }
    }
    if (!derivedRtoCode || derivedRtoCode === '—') {
      derivedRtoCode = deriveRtoCode('', '', state) || 'AS04';
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

    // 10. Automated Captcha Resolution via Gemini AI (with auto-retry up to 5 attempts)
    let solvedSuccessfully = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`🔟 Capturing security code image (#capimg) - Attempt ${attempt}/5...`);
      const capImg = page.locator('#capimg');
      await capImg.waitFor({ state: 'visible', timeout: 10000 });

      // 3x High-Resolution Upscale & Noise Smoothing directly via Browser Canvas
      let capData = await page.evaluate(() => {
        try {
          const img = document.querySelector('#capimg');
          if (!img) return null;
          const w = img.naturalWidth || img.width || 120;
          const h = img.naturalHeight || img.height || 35;
          const scale = 3;
          const canvas = document.createElement('canvas');
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
        } catch (_) {
          return null;
        }
      });

      if (!capData) {
        const capBuffer = await capImg.screenshot();
        capData = capBuffer.toString('base64');
      }

      console.log('🤖 Auto-decoding verification code with Gemini AI (3x High-Resolution Upscaled)...');
      const solution = await solveCaptchaWithGemini(capData);

      if (!solution) {
        console.log(`⚠️ Gemini AI response issue on attempt ${attempt}/5. Retrying with fresh code...`);
        const refreshBtn = page.locator('#reload, a[onclick*="refresh" i], img[title*="Refresh" i]').first();
        if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await refreshBtn.click();
          await sleep(2000);
        }
        continue;
      }

      console.log(`✍️ Automatically entering code: "${solution}"`);
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

    const derivedRtoCode = deriveRtoCode(applicantInfo.llNo, applicantInfo.rto, state);
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

    // 15. Save Photo directly to Downloads folder
    const photoFileName = `Photo_${appNo}.jpg`;
    const downloadsDir = getDownloadsDir();
    const targetPhotoPath = path.join(downloadsDir, photoFileName);

    if (photoBuffer) {
      fs.writeFileSync(targetPhotoPath, photoBuffer);
      console.log(`💾 ✅ PHOTO SAVED TO DOWNLOADS: ${targetPhotoPath}`);

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
          `💾 <b>Photo Saved:</b> <code>${photoFileName}</code> in Downloads!\n\n` +
          `🚀 <b>Step 2:</b> Opening Obscura Files Chrome...`;
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

    // ───────── STEP 2: AUTOFILL & MOCK TRIGGER ON OBSCURA FILES CHROME ─────────
    let userPassword = password;
    if (!userPassword && subId) {
      const rec = db.getById(subId);
      if (rec && rec.password) userPassword = rec.password;
    }
    if (!userPassword) userPassword = '17760G';

    let finalRtoCode = derivedRtoCode;
    if (!finalRtoCode || finalRtoCode === '—') {
      finalRtoCode = deriveRtoCode('', applicantInfo.rto, state) || 'AS04';
    }

    await executeStage2(state, appNo, dob, userPassword, finalRtoCode, subId, chatId);

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
  console.log('🤖 Professional Telegram Bot Service Running...');
  console.log(`   Token: ${BOT_TOKEN.substring(0, 15)}...`);
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
  const cliArgs = process.argv.slice(2);
  if (cliArgs.length > 0) {
    const cliText = cliArgs.join(' ');
    const parsed = parseSingleLineInput(cliText);
    if (parsed) {
      console.log('\n' + '='.repeat(60));
      console.log('⚡ DIRECT TERMINAL EXECUTION (NO TELEGRAM NEEDED)');
      console.log('='.repeat(60));
      console.log(`• State:           ${parsed.state}`);
      console.log(`• Application No:  ${parsed.appNo}`);
      console.log(`• DOB:             ${parsed.dob}`);
      console.log(`• Password:        ${parsed.password}`);
      console.log(`• RTO Code:        ${parsed.rtoCode}`);
      console.log('='.repeat(60) + '\n');

      const record = db.create({
        chatId: 'TERMINAL',
        userName: 'TerminalUser',
        state: parsed.state,
        appNo: parsed.appNo,
        dob: parsed.dob,
        password: parsed.password,
        rtoCode: parsed.rtoCode
      });

      await runSarathiSearch(null, 'TerminalUser', parsed.state, parsed.appNo, parsed.dob, parsed.password, parsed.rtoCode, record.id);
      return;
    } else {
      console.warn('\n⚠️ Could not parse command line arguments.');
      console.warn('👉 Expected format: node bot.js Uttar Pradesh 5054900926 12-04-1998 BP53QE UP78');
      console.warn('Starting Telegram Bot polling instead...\n');
    }
  }

  startBot();
}

main();
