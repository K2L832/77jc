
// Build Revision: Kyuro-Casino-v6.0-Fun (Prefix: *)
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ChannelType
} = require('discord.js');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Kyuro Casino v6.0 OK\n');
}).listen(PORT, '0.0.0.0', () => console.log(`HTTP actif sur le port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '*';
const CURRENCY = '$';
const SUPER_OWNER_ID = '1166445202148442112';
const SUPER_OWNER_HANDLES = new Set(['graveuhq', 'k2l', '77jc']);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'kyuro-casino-data.json');
const activeBlackjacks = new Map();
const activeDuels = new Map();

const BUILDINGS_CATALOG = {
    studio: { id: 'studio', name: 'Kyuro Loft', price: 4500, rentPerResident: 180, maxResidents: 4, tier: 1 },
    residence: { id: 'residence', name: 'Tour Azur', price: 12000, rentPerResident: 420, maxResidents: 8, tier: 2 },
    penthouse: { id: 'penthouse', name: 'Skyline Tower', price: 28000, rentPerResident: 950, maxResidents: 12, tier: 3 },
    citadel: { id: 'citadel', name: 'Kyuro Citadel', price: 65000, rentPerResident: 2100, maxResidents: 20, tier: 4 }
};

const DEFAULT_CRYPTOS = {
    BTC: { name: 'Bitcoin', price: 68500, history: [64200, 65100, 64800, 66700, 67900, 68500] },
    ETH: { name: 'Ethereum', price: 3450, history: [3180, 3240, 3210, 3320, 3390, 3450] },
    KYR: { name: 'Kyuro Coin', price: 1250, history: [820, 910, 980, 1050, 1180, 1250] },
    SOL: { name: 'Solana', price: 215, history: [185, 192, 189, 201, 208, 215] }
};

let db = {
    users: {},
    cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)),
    casinoCategories: {},
    lotteryPot: 15000
};

function isSuperOwner(user) {
    if (!user) return false;
    if (user.id === SUPER_OWNER_ID) return true;
    const u = (user.username || '').toLowerCase();
    const g = (user.globalName || '').toLowerCase();
    return SUPER_OWNER_HANDLES.has(u) || SUPER_OWNER_HANDLES.has(g);
}

function saveData() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmpFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
        fs.renameSync(tmpFile, DATA_FILE);
    } catch (e) {
        console.error('Erreur sauvegarde:', e.message);
    }
}

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object') {
            db.users = parsed.users || {};
            db.cryptos = parsed.cryptos && Object.keys(parsed.cryptos).length > 0
                ? parsed.cryptos
                : JSON.parse(JSON.stringify(DEFAULT_CRYPTOS));
            db.casinoCategories = parsed.casinoCategories && typeof parsed.casinoCategories === 'object'
                ? parsed.casinoCategories
                : {};
            db.lotteryPot = typeof parsed.lotteryPot === 'number' ? parsed.lotteryPot : 15000;
        }
    } catch (e) {
        console.error('Erreur chargement:', e.message);
    }
}

loadData();

function getGuildCasinoCategory(guildId) {
    if (!guildId || !db.casinoCategories) return null;
    return db.casinoCategories[guildId] || null;
}

function setGuildCasinoCategory(guildId, categoryId) {
    if (!db.casinoCategories || typeof db.casinoCategories !== 'object') {
        db.casinoCategories = {};
    }
    if (!categoryId) delete db.casinoCategories[guildId];
    else db.casinoCategories[guildId] = categoryId;
    saveData();
}

function isAllowedCasinoChannel(message) {
    if (!message.guild || !message.channel) return false;
    const allowedCatId = getGuildCasinoCategory(message.guild.id);
    if (!allowedCatId) return true;
    return message.channel.parentId === allowedCatId;
}

async function resolveCategoryIdFromInput(message, rawArg) {
    const cleaned = (rawArg || '').replace(/[<#>]/g, '').trim();
    if (cleaned) {
        const fetched = await message.guild.channels.fetch(cleaned).catch(() => null);
        if (fetched) {
            if (fetched.type === ChannelType.GuildCategory) return fetched.id;
            if (fetched.parentId) return fetched.parentId;
        }
    }
    return message.channel.parentId || null;
}

function getUser(userId, discordUser = null) {
    if (!db.users[userId]) {
        db.users[userId] = {
            username: discordUser ? (discordUser.globalName || discordUser.username) : `Joueur_${userId.slice(-4)}`,
            avatarUrl: discordUser ? discordUser.displayAvatarURL({ extension: 'png', size: 128 }) : null,
            cash: 3000,
            bank: 1500,
            crypto: { BTC: 0, ETH: 0, KYR: 0, SOL: 0 },
            buildings: [],
            homeBuildingOwnerId: null,
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0 }
        };
        saveData();
    }
    const u = db.users[userId];
    if (discordUser) {
        u.username = discordUser.globalName || discordUser.username || u.username;
        u.avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 128 });
    }
    if (!u.username) u.username = `Joueur_${userId.slice(-4)}`;
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, KYR: 0, SOL: 0 };
    if (!Array.isArray(u.buildings)) u.buildings = [];
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0 };
    return u;
}

function parseAmount(rawArg, maxVal) {
    if (!rawArg) return null;
    if (rawArg.toLowerCase() === 'all') return maxVal > 0 ? Math.floor(maxVal) : null;
    const n = parseInt(rawArg, 10);
    return (!isNaN(n) && n > 0) ? n : null;
}

function formatMoney(v) {
    return `${Math.floor(v).toLocaleString('fr-FR')} ${CURRENCY}`;
}

function formatCooldown(ms) {
    const sec = Math.ceil(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
// --- Glyphes 7x9 nets avec lissage anti-aliasing ---
const GLYPHS_7X9 = {
    'A': ['0011100','0100010','1000001','1000001','1111111','1000001','1000001','1000001','1000001'],
    'B': ['1111110','1000001','1000001','1111110','1000001','1000001','1000001','1000001','1111110'],
    'C': ['0011110','0100001','1000000','1000000','1000000','1000000','1000000','0100001','0011110'],
    'D': ['1111100','1000010','1000001','1000001','1000001','1000001','1000001','1000010','1111100'],
    'E': ['1111111','1000000','1000000','1000000','1111110','1000000','1000000','1000000','1111111'],
    'F': ['1111111','1000000','1000000','1000000','1111110','1000000','1000000','1000000','1000000'],
    'G': ['0011110','0100001','1000000','1000000','1000111','1000001','1000001','0100001','0011110'],
    'H': ['1000001','1000001','1000001','1000001','1111111','1000001','1000001','1000001','1000001'],
    'I': ['0111110','0001000','0001000','0001000','0001000','0001000','0001000','0001000','0111110'],
    'J': ['0001111','0000010','0000010','0000010','0000010','1000010','1000010','0100100','0011000'],
    'K': ['1000010','1000100','1001000','1010000','1100000','1010000','1001000','1000100','1000010'],
    'L': ['1000000','1000000','1000000','1000000','1000000','1000000','1000000','1000000','1111111'],
    'M': ['1000001','1100011','1010101','1010101','1001001','1000001','1000001','1000001','1000001'],
    'N': ['1000001','1100001','1010001','1001001','1000101','1000011','1000001','1000001','1000001'],
    'O': ['0011100','0100010','1000001','1000001','1000001','1000001','1000001','0100010','0011100'],
    'P': ['1111110','1000001','1000001','1000001','1111110','1000000','1000000','1000000','1000000'],
    'Q': ['0011100','0100010','1000001','1000001','1000001','1001001','1000101','0100010','0011101'],
    'R': ['1111110','1000001','1000001','1000001','1111110','1001000','1000100','1000010','1000001'],
    'S': ['0011110','0100001','1000000','0100000','0011100','0000010','0000001','1000001','0111110'],
    'T': ['1111111','0001000','0001000','0001000','0001000','0001000','0001000','0001000','0001000'],
    'U': ['1000001','1000001','1000001','1000001','1000001','1000001','1000001','0100010','0011100'],
    'V': ['1000001','1000001','1000001','0100010','0100010','0010100','0010100','0001000','0001000'],
    'W': ['1000001','1000001','1000001','0100010','1001001','1010101','1010101','1100011','1000001'],
    'X': ['1000001','0100010','0010100','0001000','0001000','0010100','0100010','1000001','1000001'],
    'Y': ['1000001','0100010','0010100','0001000','0001000','0001000','0001000','0001000','0001000'],
    'Z': ['1111111','0000010','0000100','0001000','0010000','0100000','1000000','1000000','1111111'],
    '0': ['0011100','0100010','1000101','1001001','1010001','1000001','1000001','0100010','0011100'],
    '1': ['0001000','0011000','0101000','0001000','0001000','0001000','0001000','0001000','0111110'],
    '2': ['0011100','0100010','1000001','0000010','0001100','0010000','0100000','1000000','1111111'],
    '3': ['0111110','1000001','0000001','0001110','0000001','0000001','0000001','1000001','0111110'],
    '4': ['0000100','0001100','0010100','0100100','1000100','1111111','0000100','0000100','0000100'],
    '5': ['1111111','1000000','1000000','1111110','0000001','0000001','0000001','1000001','0111110'],
    '6': ['0011110','0100000','1000000','1111110','1000001','1000001','1000001','0100010','0011100'],
    '7': ['1111111','1000001','0000010','0000100','0001000','0010000','0010000','0010000','0010000'],
    '8': ['0011100','0100010','1000010','0011100','0100010','1000001','1000001','0100010','0011100'],
    '9': ['0011100','0100010','1000001','1000001','0111111','0000001','0000001','0000010','0111100'],
    '$': ['0001000','0011110','0101000','0011100','0001110','0001010','0111100','0001000','0001000'],
    ':': ['0000000','0001100','0001100','0000000','0000000','0001100','0001100','0000000','0000000'],
    '.': ['0000000','0000000','0000000','0000000','0000000','0000000','0001100','0001100','0000000'],
    ',': ['0000000','0000000','0000000','0000000','0000000','0000000','0001100','0001100','0011000'],
    '-': ['0000000','0000000','0000000','0000000','0111110','0000000','0000000','0000000','0000000'],
    '+': ['0000000','0000000','0001000','0001000','0111110','0001000','0001000','0000000','0000000'],
    '/': ['0000010','0000100','0000100','0001000','0010000','0010000','0100000','0100000','0000000'],
    '|': ['0001000','0001000','0001000','0001000','0001000','0001000','0001000','0001000','0001000'],
    '[': ['0011110','0010000','0010000','0010000','0010000','0010000','0010000','0010000','0011110'],
    ']': ['0111100','0000100','0000100','0000100','0000100','0000100','0000100','0000100','0111100'],
    '(': ['0000100','0001000','0010000','0010000','0010000','0010000','0010000','0001000','0000100'],
    ')': ['0010000','0001000','0000100','0000100','0000100','0000100','0000100','0001000','0010000'],
    '#': ['0010100','0010100','1111111','0010100','0010100','1111111','0010100','0010100','0000000'],
    '%': ['1100010','1100100','0001000','0010000','0100110','1000110','0000000','0000000','0000000'],
    '!': ['0001100','0001100','0001100','0001100','0001100','0001100','0000000','0001100','0001100'],
    '?': ['0011100','0100010','0000010','0000100','0001000','0001000','0000000','0001000','0000000'],
    '_': ['0000000','0000000','0000000','0000000','0000000','0000000','0000000','0000000','1111111'],
    ' ': ['0000000','0000000','0000000','0000000','0000000','0000000','0000000','0000000','0000000']
};

function cleanStr(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9$:.,+\-/|()\[\]#%! ?_]/g, ' ');
}

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function fetchBinaryBuffer(url, maxRedirects = 3) {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return resolve(null);
        const mod = url.startsWith('https://') ? https : http;
        const req = mod.get(url, { timeout: 2500 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
                return resolve(fetchBinaryBuffer(res.headers.location, maxRedirects - 1));
            }
            if (res.statusCode !== 200) return resolve(null);
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

// Décodeur PNG minimal pour incruster la PP (avatar) dans le canvas bleu
function decodeSimplePngRgba(buf) {
    try {
        if (!buf || buf.length < 33) return null;
        const sig = '89504e470d0a1a0a';
        if (buf.subarray(0, 8).toString('hex') !== sig) return null;
        let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
        const idatChunks = [];
        while (pos + 12 <= buf.length) {
            const len = buf.readUInt32BE(pos);
            const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
            const data = buf.subarray(pos + 8, pos + 8 + len);
            pos += 12 + len;
            if (type === 'IHDR' && len >= 13) {
                w = data.readUInt32BE(0);
                h = data.readUInt32BE(4);
                bitDepth = data[8];
                colorType = data[9];
            } else if (type === 'IDAT') {
                idatChunks.push(data);
            } else if (type === 'IEND') {
                break;
            }
        }
        if (!w || !h || w > 512 || h > 512 || bitDepth !== 8) return null;
        const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
        if (!channels) return null;
        const raw = zlib.inflateSync(Buffer.concat(idatChunks));
        const stride = w * channels;
        const out = Buffer.alloc(w * h * 4);
        const prev = Buffer.alloc(stride);
        const paeth = (a, b, c) => {
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        };
        for (let y = 0; y < h; y++) {
            const lineStart = y * (stride + 1);
            const filter = raw[lineStart];
            const cur = Buffer.alloc(stride);
            for (let i = 0; i < stride; i++) {
                const x = raw[lineStart + 1 + i];
                const a = i >= channels ? cur[i - channels] : 0;
                const b = prev[i];
                const c = i >= channels ? prev[i - channels] : 0;
                if (filter === 0) cur[i] = x;
                else if (filter === 1) cur[i] = (x + a) & 0xff;
                else if (filter === 2) cur[i] = (x + b) & 0xff;
                else if (filter === 3) cur[i] = (x + ((a + b) >> 1)) & 0xff;
                else if (filter === 4) cur[i] = (x + paeth(a, b, c)) & 0xff;
                else cur[i] = x;
            }
            for (let x = 0; x < w; x++) {
                const sIdx = x * channels;
                const dIdx = (y * w + x) * 4;
                out[dIdx] = cur[sIdx];
                out[dIdx + 1] = cur[sIdx + 1];
                out[dIdx + 2] = cur[sIdx + 2];
                out[dIdx + 3] = channels === 4 ? cur[sIdx + 3] : 255;
            }
            cur.copy(prev);
        }
        return { w, h, rgba: out };
    } catch {
        return null;
    }
}

class KyuroBlueCanvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.buf = Buffer.alloc(w * h * 4);
    }

    px(x, y, r, g, b, a = 255) {
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
        const idx = (iy * this.w + ix) * 4;
        const al = Math.max(0, Math.min(1, a / 255));
        if (al >= 0.999) {
            this.buf[idx] = r; this.buf[idx + 1] = g; this.buf[idx + 2] = b; this.buf[idx + 3] = 255;
        } else {
            const inv = 1 - al;
            this.buf[idx] = Math.min(255, Math.round(r * al + this.buf[idx] * inv));
            this.buf[idx + 1] = Math.min(255, Math.round(g * al + this.buf[idx + 1] * inv));
            this.buf[idx + 2] = Math.min(255, Math.round(b * al + this.buf[idx + 2] * inv));
            this.buf[idx + 3] = Math.max(this.buf[idx + 3], Math.round(a));
        }
    }

    roundRect(x, y, w, h, rad, r, g, b, a = 255) {
        const maxR = Math.min(rad, w / 2, h / 2);
        const x0 = Math.max(0, Math.floor(x));
        const y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(this.w - 1, Math.ceil(x + w));
        const y1 = Math.min(this.h - 1, Math.ceil(y + h));
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                let cx = px;
                if (px < x + maxR) cx = x + maxR;
                else if (px > x + w - maxR) cx = x + w - maxR;
                let cy = py;
                if (py < y + maxR) cy = y + maxR;
                else if (py > y + h - maxR) cy = y + h - maxR;
                const d = Math.hypot(px - cx, py - cy);
                if (d <= maxR + 0.65) {
                    const fade = Math.min(1, Math.max(0, (maxR + 0.65 - d) / 1.3));
                    this.px(px, py, r, g, b, a * fade);
                }
            }
        }
    }

    roundBorder(x, y, w, h, rad, t, r, g, b, a = 255) {
        const maxR = Math.min(rad, w / 2, h / 2);
        const innerR = Math.max(0, maxR - t);
        const x0 = Math.max(0, Math.floor(x - 1));
        const y0 = Math.max(0, Math.floor(y - 1));
        const x1 = Math.min(this.w - 1, Math.ceil(x + w + 1));
        const y1 = Math.min(this.h - 1, Math.ceil(y + h + 1));
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                let ocx = px;
                if (px < x + maxR) ocx = x + maxR;
                else if (px > x + w - maxR) ocx = x + w - maxR;
                let ocy = py;
                if (py < y + maxR) ocy = y + maxR;
                else if (py > y + h - maxR) ocy = y + h - maxR;
                const od = Math.hypot(px - ocx, py - ocy);

                const inX = px >= x + t && px <= x + w - t;
                const inY = py >= y + t && py <= y + h - t;
                let icx = px;
                if (px < x + t + innerR) icx = x + t + innerR;
                else if (px > x + w - t - innerR) icx = x + w - t - innerR;
                let icy = py;
                if (py < y + t + innerR) icy = y + t + innerR;
                else if (py > y + h - t - innerR) icy = y + h - t - innerR;
                const id = (inX && inY) ? Math.hypot(px - icx, py - icy) : 999;

                if (od <= maxR + 0.65 && id >= innerR - 0.65) {
                    const outF = Math.min(1, Math.max(0, (maxR + 0.65 - od) / 1.3));
                    const inF = (inX && inY) ? Math.min(1, Math.max(0, (id - (innerR - 0.65)) / 1.3)) : 1;
                    this.px(px, py, r, g, b, a * Math.min(outF, inF));
                }
            }
        }
    }

    circle(cx, cy, rad, r, g, b, a = 255) {
        const x0 = Math.max(0, Math.floor(cx - rad - 1));
        const y0 = Math.max(0, Math.floor(cy - rad - 1));
        const x1 = Math.min(this.w - 1, Math.ceil(cx + rad + 1));
        const y1 = Math.min(this.h - 1, Math.ceil(cy + rad + 1));
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                const d = Math.hypot(px - cx, py - cy);
                if (d <= rad + 0.7) {
                    const f = Math.min(1, Math.max(0, (rad + 0.7 - d) / 1.4));
                    this.px(px, py, r, g, b, a * f);
                }
            }
        }
    }

    line(x0, y0, x1, y1, t, r, g, b, a = 255) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        const rad = Math.max(1, t / 2);
        for (let i = 0; i <= steps; i++) {
            const p = i / steps;
            this.circle(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, rad, r, g, b, a);
        }
    }

    // Typographie propre et continue sans effet « points espacés »
    text(str, x, y, scale, r, g, b, a = 255) {
        const clean = cleanStr(str);
        const step = 8 * scale;
        for (let i = 0; i < clean.length; i++) {
            const glyph = GLYPHS_7X9[clean[i]] || GLYPHS_7X9[' '];
            const gx = x + i * step;
            for (let row = 0; row < 9; row++) {
                for (let col = 0; col < 7; col++) {
                    if (glyph[row][col] === '1') {
                        const px0 = gx + col * scale;
                        const py0 = y + row * scale;
                        // Fusionne les segments horizontaux adjacents pour un trait continu
                        let spanW = scale;
                        while (col + 1 < 7 && glyph[row][col + 1] === '1') {
                            col++;
                            spanW += scale;
                        }
                        this.roundRect(px0, py0, spanW + (scale > 2 ? 0.5 : 0), scale + (scale > 2 ? 0.5 : 0), Math.max(1, scale * 0.25), r, g, b, a);
                    }
                }
            }
        }
    }

    // Dessine la PP circulaire dans le card bleu
    drawAvatarCircle(avatarData, cx, cy, radius) {
        this.circle(cx, cy, radius + 3, 96, 165, 250, 255);
        this.circle(cx, cy, radius, 15, 35, 72, 255);
        if (!avatarData || !avatarData.rgba) {
            this.text('KY', cx - 16, cy - 9, 2, 186, 230, 253, 255);
            return;
        }
        const { w, h, rgba } = avatarData;
        const x0 = Math.max(0, Math.floor(cx - radius));
        const y0 = Math.max(0, Math.floor(cy - radius));
        const x1 = Math.min(this.w - 1, Math.ceil(cx + radius));
        const y1 = Math.min(this.h - 1, Math.ceil(cy + radius));
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                const dist = Math.hypot(px - cx, py - cy);
                if (dist > radius + 0.6) continue;
                const edgeAlpha = Math.min(1, Math.max(0, (radius + 0.6 - dist) / 1.2));
                const u = ((px - (cx - radius)) / (radius * 2)) * (w - 1);
                const v = ((py - (cy - radius)) / (radius * 2)) * (h - 1);
                const sx = Math.max(0, Math.min(w - 1, Math.round(u)));
                const sy = Math.max(0, Math.min(h - 1, Math.round(v)));
                const idx = (sy * w + sx) * 4;
                const srcA = (rgba[idx + 3] / 255) * edgeAlpha;
                if (srcA > 0.01) {
                    this.px(px, py, rgba[idx], rgba[idx + 1], rgba[idx + 2], srcA * 255);
                }
            }
        }
    }

    // Thème bleu profond unifié Kyuro
    blueCardBg(titleLabel = 'KYURO CASINO') {
        for (let y = 0; y < this.h; y++) {
            const ty = y / this.h;
            for (let x = 0; x < this.w; x++) {
                const tx = x / this.w;
                let r = Math.round(5 + tx * 8 + ty * 4);
                let g = Math.round(18 + tx * 28 + ty * 16);
                let b = Math.round(44 + tx * 56 + ty * 34);
                const glow = Math.hypot((x - this.w * 0.85) / (this.w * 0.45), (y - this.h * 0.2) / (this.h * 0.55));
                if (glow < 1) {
                    const k = (1 - glow) * 0.24;
                    r = Math.min(255, Math.round(r + 56 * k));
                    g = Math.min(255, Math.round(g + 189 * k));
                    b = Math.min(255, Math.round(b + 248 * k));
                }
                this.px(x, y, r, g, b, 255);
            }
        }
        this.roundRect(16, 16, this.w - 32, this.h - 32, 26, 8, 22, 52, 225);
        this.roundBorder(16, 16, this.w - 32, this.h - 32, 26, 2.5, 56, 189, 248, 215);
        this.roundRect(36, 28, 215, 34, 12, 14, 165, 233, 60);
        this.roundBorder(36, 28, 215, 34, 12, 1.5, 56, 189, 248, 220);
        this.text(titleLabel, 50, 36, 2, 224, 242, 254, 255);
    }

    toAttachment(filename) {
        const stride = this.w * 4;
        const raw = Buffer.alloc((stride + 1) * this.h);
        for (let y = 0; y < this.h; y++) {
            const rs = y * (stride + 1);
            raw[rs] = 0;
            this.buf.copy(raw, rs + 1, y * stride, (y + 1) * stride);
        }
        const comp = zlib.deflateSync(raw, { level: 6 });
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
        ihdr[8] = 8; ihdr[9] = 6;
        const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        return new AttachmentBuilder(
            Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', comp), makeChunk('IEND', Buffer.alloc(0))]),
            { name: filename }
        );
    }
}
async function getAvatarDecoded(avatarUrl) {
    if (!avatarUrl) return null;
    const pngUrl = avatarUrl.includes('?') ? avatarUrl.replace(/\.(webp|jpg|jpeg)/i, '.png') : avatarUrl.replace(/\.(webp|jpg|jpeg)/i, '.png');
    const buf = await fetchBinaryBuffer(pngUrl);
    return decodeSimplePngRgba(buf);
}

async function renderWalletBluePng(userObj, extra = '') {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 420);
    c.blueCardBg('KYURO BANK');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(userObj.username, 324, 36, 2, 186, 230, 253, 255);
    c.text('PORTEFEUILLE & BANQUE', 36, 88, 3, 255, 255, 255, 255);

    const totalAssets = (userObj.cash || 0) + (userObj.bank || 0);
    const cards = [
        { label: 'CASH DISPONIBLE', val: `${Math.floor(userObj.cash || 0).toLocaleString('fr-FR')} $` },
        { label: 'COFFRE BANQUE', val: `${Math.floor(userObj.bank || 0).toLocaleString('fr-FR')} $` },
        { label: 'FORTUNE TOTALE', val: `${Math.floor(totalAssets).toLocaleString('fr-FR')} $` }
    ];

    cards.forEach((item, i) => {
        const x = 36 + i * 304;
        const y = 144;
        c.roundRect(x, y, 280, 174, 20, 7, 20, 48, 240);
        c.roundBorder(x, y, 280, 174, 20, 2, 56, 189, 248, 220);
        c.roundRect(x + 18, y + 148, 244, 7, 3, 56, 189, 248, 230);
        c.text(item.label, x + 18, y + 22, 2, 125, 211, 252, 255);
        c.text(item.val, x + 18, y + 76, 3, 255, 255, 255, 255);
    });

    c.text(extra || 'KYURO ECONOMY', 36, 352, 2, 186, 230, 253, 255);
    return c.toAttachment('kyuro-wallet.png');
}

async function renderMonopolyBluePng(userObj, pendingRent, residentsCount, maxResidentsCount) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 430);
    c.blueCardBg('KYURO MONOPOLY');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(userObj.username, 324, 36, 2, 186, 230, 253, 255);

    const bCount = (userObj.buildings || []).length;
    c.text(`IMMEUBLES: ${bCount}  |  LOCATAIRES: ${residentsCount}/${maxResidentsCount}`, 36, 88, 3, 255, 255, 255, 255);

    c.roundRect(36, 326, 888, 5, 2, 56, 189, 248, 220);
    const visualCount = Math.min(6, Math.max(1, bCount || 1));
    const slotW = 840 / visualCount;
    for (let i = 0; i < visualCount; i++) {
        const bItem = userObj.buildings[i];
        const bw = Math.min(118, Math.floor(slotW * 0.72));
        const bx = Math.round(60 + i * slotW + (slotW - bw) / 2);
        const bh = Math.round(78 + ((i + (bItem ? bItem.tier : 1)) % 4) * 24);
        const by = 326 - bh;
        c.roundRect(bx, by, bw, bh, 14, 10, 28, 66, 245);
        c.roundBorder(bx, by, bw, bh, 14, 2, 56, 189, 248, 235);
        for (let wy = by + 12; wy < 308; wy += 20) {
            for (let wx = bx + 12; wx < bx + bw - 18; wx += 22) {
                const lit = bCount > 0;
                c.roundRect(wx, wy, 10, 8, 2, lit ? 125 : 30, lit ? 211 : 64, lit ? 252 : 120, 220);
            }
        }
    }

    c.text(`LOYERS A ENCAISSER: +${Math.floor(pendingRent).toLocaleString('fr-FR')} $`, 36, 354, 2, 125, 211, 252, 255);
    return c.toAttachment('kyuro-monopoly.png');
}

async function renderCryptoBluePng(userObj, symbol, name, price, history, userQty) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 430);
    c.blueCardBg('KYURO CRYPTO');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(`${userObj.username} • ${symbol}`, 324, 36, 2, 186, 230, 253, 255);
    c.text(`${name.toUpperCase()} - ${price.toLocaleString('fr-FR')} $`, 36, 88, 3, 255, 255, 255, 255);

    const gx = 36, gy = 140, gw = 888, gh = 186;
    c.roundRect(gx, gy, gw, gh, 18, 6, 16, 40, 245);
    c.roundBorder(gx, gy, gw, gh, 18, 2, 56, 189, 248, 220);

    const vals = history.length > 1 ? history : [price, price];
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const span = Math.max(1, maxV - minV);
    const pts = vals.map((v, i) => ({
        x: gx + 26 + (i / (vals.length - 1)) * (gw - 52),
        y: gy + gh - 26 - ((v - minV) / span) * (gh - 52)
    }));

    for (let i = 0; i < pts.length - 1; i++) {
        c.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 4, 56, 189, 248, 255);
    }
    for (const p of pts) {
        c.circle(p.x, p.y, 5, 224, 242, 254, 255);
    }

    c.text(`PORTEFEUILLE: ${userQty} ${symbol}  |  MIN ${minV.toLocaleString('fr-FR')} $  MAX ${maxV.toLocaleString('fr-FR')} $`, 36, 354, 2, 186, 230, 253, 255);
    return c.toAttachment('kyuro-crypto.png');
}
async function renderBlueActionPng(userObj, badge, headline, subline) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 390);
    c.blueCardBg(`KYURO ${badge}`);
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(userObj.username, 324, 36, 2, 186, 230, 253, 255);
    c.text(headline, 36, 92, 3, 255, 255, 255, 255);

    c.roundRect(36, 156, 888, 158, 20, 7, 20, 48, 240);
    c.roundBorder(36, 156, 888, 158, 20, 2, 56, 189, 248, 225);
    c.text(subline, 60, 220, 3, 224, 242, 254, 255);
    return c.toAttachment('kyuro-action.png');
}

async function renderBlackjackBluePng(userObj, bet, pCards, pVal, dCards, dVal, statusText) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 430);
    c.blueCardBg('KYURO BLACKJACK');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(`${userObj.username} - MISE ${bet.toLocaleString('fr-FR')} $`, 324, 36, 2, 186, 230, 253, 255);
    c.text('TABLE VIP BLEUE', 36, 88, 3, 255, 255, 255, 255);

    c.text(`TA MAIN (${pVal})`, 36, 144, 2, 125, 211, 252, 255);
    pCards.slice(0, 5).forEach((card, i) => {
        const cx = 36 + i * 88;
        c.roundRect(cx, 174, 76, 114, 14, 12, 32, 74, 245);
        c.roundBorder(cx, 174, 76, 114, 14, 2, 56, 189, 248, 245);
        c.text(card, cx + 14, 222, 2, 255, 255, 255, 255);
    });

    c.text(`CROUPIER (${dVal})`, 536, 144, 2, 186, 230, 253, 255);
    dCards.slice(0, 4).forEach((card, i) => {
        const cx = 536 + i * 88;
        c.roundRect(cx, 174, 76, 114, 14, 9, 24, 56, 245);
        c.roundBorder(cx, 174, 76, 114, 14, 2, 96, 165, 250, 235);
        c.text(card, cx + 14, 222, 2, 224, 242, 254, 255);
    });

    c.roundRect(36, 324, 888, 54, 14, 7, 20, 48, 240);
    c.roundBorder(36, 324, 888, 54, 14, 2, 56, 189, 248, 210);
    c.text(statusText, 56, 341, 2, 255, 255, 255, 255);
    return c.toAttachment('kyuro-blackjack.png');
}

async function renderRouletteBluePng(userObj, num, color, bet, statusText) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 420);
    c.blueCardBg('KYURO ROULETTE');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(userObj.username, 324, 36, 2, 186, 230, 253, 255);
    c.text(`NUMERO ${num} (${color.toUpperCase()})`, 36, 88, 3, 255, 255, 255, 255);

    c.circle(158, 234, 94, 56, 189, 248, 230);
    c.circle(158, 234, 74, 7, 20, 48, 255);
    c.text(`${num}`, num >= 10 ? 130 : 144, 218, 4, 255, 255, 255, 255);

    c.roundRect(296, 150, 628, 170, 20, 7, 20, 48, 240);
    c.roundBorder(296, 150, 628, 170, 20, 2, 56, 189, 248, 225);
    c.text(`MISE: ${bet.toLocaleString('fr-FR')} $`, 322, 182, 2, 125, 211, 252, 255);
    c.text(statusText, 322, 240, 3, 255, 255, 255, 255);
    return c.toAttachment('kyuro-roulette.png');
}

async function renderSlotsBluePng(userObj, reels, bet, statusText) {
    const avatar = await getAvatarDecoded(userObj.avatarUrl);
    const c = new KyuroBlueCanvas(960, 420);
    c.blueCardBg('KYURO SLOTS');
    c.drawAvatarCircle(avatar, 290, 45, 22);
    c.text(`${userObj.username} - MISE ${bet.toLocaleString('fr-FR')} $`, 324, 36, 2, 186, 230, 253, 255);
    c.text('MACHINE A SOUS BLEUE', 36, 88, 3, 255, 255, 255, 255);

    const labels = { '💎': 'GEM', '💠': 'BLU', '🪙': 'USD', '⚡': 'ZAP', '🔥': 'HOT' };
    reels.forEach((sym, i) => {
        const x = 56 + i * 292;
        c.roundRect(x, 146, 264, 162, 20, 7, 20, 48, 245);
        c.roundBorder(x, 146, 264, 162, 20, 2, 56, 189, 248, 235);
        c.text(labels[sym] || 'WIN', x + 78, 210, 4, 255, 255, 255, 255);
    });

    c.text(statusText, 36, 344, 2, 224, 242, 254, 255);
    return c.toAttachment('kyuro-slots.png');
}

async function renderLeaderboardBluePng(entries) {
    const c = new KyuroBlueCanvas(960, 440);
    c.blueCardBg('KYURO TOP');
    c.text('CLASSEMENT FORTUNES ($)', 36, 88, 3, 255, 255, 255, 255);

    const top = entries.slice(0, 5);
    if (top.length === 0) {
        c.text('AUCUN JOUEUR ENREGISTRE', 36, 172, 2, 186, 230, 253, 255);
    } else {
        top.forEach((e, idx) => {
            const y = 146 + idx * 48;
            c.roundRect(36, y - 6, 888, 38, 12, 7, 20, 48, 235);
            c.roundBorder(36, y - 6, 888, 38, 12, 1.5, 56, 189, 248, 180);
            c.text(`#${idx + 1} ${e.name} - ${Math.floor(e.total).toLocaleString('fr-FR')} $`, 54, y + 4, 2, idx === 0 ? 224 : 186, idx === 0 ? 242 : 230, 254, 255);
        });
    }
    return c.toAttachment('kyuro-leaderboard.png');
}
// Embed / Container V2 gris foncé moderne style carte Discord
function buildContainerV2({ title, body, footer }) {
    return new ContainerBuilder()
        .setAccentColor(0x313338)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}\n${body}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footer || 'Kyuro Casino • Préfixe *'}`)
        );
}

async function replyImageOnly(message, attachment, components = []) {
    return message.reply({
        files: [attachment],
        components,
        allowedMentions: { parse: [] }
    });
}

async function replyContainer(message, { title, body, footer, components = [] }) {
    const container = buildContainerV2({ title, body, footer });
    return message.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [container, ...components],
        allowedMentions: { parse: [] }
    });
}

function getHelpSection(tab = 'all') {
    if (tab === 'eco') {
        return {
            title: '💠 Kyuro • Économie & Banque',
            body: [
                '`*balance [@membre]` — Solde cash, banque & fortune',
                '`*deposit <montant|all>` — Déposer en banque',
                '`*withdraw <montant|all>` — Retirer en cash',
                '`*work` • `*daily` • `*crime` • `*rob <@membre>` • `*pay <@membre> <montant|all>`'
            ].join('\n')
        };
    }
    if (tab === 'gamble') {
        return {
            title: '🎰 Kyuro • Jeux & Fun (`all` OK)',
            body: [
                '`*blackjack <mise|all>` (`*bj`) — Table interactive',
                '`*roulette <rouge|noir|vert|pair|impair> <mise|all>` (`*rl`)',
                '`*slots <mise|all>` (`*slot`) • `*coinflip <pile|face> <mise|all>` (`*cf`)',
                '`*dice <1-6> <mise|all>` • `*crash <mise|all>`',
                '`*duel <@membre> <mise|all>` • `*scratch <mise|all>` • `*lottery [buy <mise>|draw]`'
            ].join('\n')
        };
    }
    if (tab === 'biz') {
        return {
            title: '🏙️ Kyuro • Monopoly, Crypto & Hack',
            body: [
                '`*monopoly [shop|buy <id>|movein <@proprio>|collect]` — Immeubles & locataires en `$`',
                '`*crypto [SYM|buy <SYM> <qté>|sell <SYM> <qté>]` — Graphique live (`BTC`, `ETH`, `KYR`, `SOL`)',
                '`*heist <@membre>` — Braquage risqué • `*hack <@membre>` • `*leaderboard` (`*lb`)'
            ].join('\n')
        };
    }
    if (tab === 'owner') {
        return {
            title: '👑 Kyuro • Super Owner',
            body: [
                '`*setcasino <id_catégorie|off>` — Restreindre le bot à une catégorie et ses salons',
                '`*setmoney <@membre> <montant>` — Définir le cash d\'un joueur',
                '`*reseteconomy` — Réinitialiser l\'économie'
            ].join('\n')
        };
    }
    return {
        title: '💠 Kyuro Casino • Menu Principal',
        body: [
            'Choisis une catégorie ci-dessous pour voir les commandes :',
            '',
            '`💰 Économie` — `*balance` `*deposit` `*withdraw` `*work` `*daily` `*crime` `*rob` `*pay`',
            '`🎰 Gamble & Fun` — `*bj` `*roulette` `*slots` `*cf` `*dice` `*crash` `*duel` `*scratch` `*lottery`',
            '`🏙️ Monopoly & Crypto` — `*monopoly` `*crypto` `*heist` `*hack` `*lb`',
            '`👑 Owner` — `*setcasino` `*setmoney` `*reseteconomy`'
        ].join('\n')
    };
}

function helpButtons(activeTab = 'all') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_eco').setLabel('Économie').setStyle(activeTab === 'eco' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_gamble').setLabel('Gamble & Fun').setStyle(activeTab === 'gamble' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_biz').setLabel('Monopoly & Crypto').setStyle(activeTab === 'biz' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_owner').setLabel('Owner').setStyle(activeTab === 'owner' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
}

function getBuildingStats(ownerObj) {
    const list = Array.isArray(ownerObj.buildings) ? ownerObj.buildings : [];
    const maxRes = list.reduce((acc, b) => acc + (b.maxResidents || 0), 0);
    const rentPerHour = list.reduce((acc, b) => acc + ((b.residents || 0) * (b.rentPerResident || 150)), 0);
    const residentsTotal = list.reduce((acc, b) => acc + (b.residents || 0), 0);
    return { maxRes, rentPerHour, residentsTotal };
}

function computePendingRent(ownerObj) {
    const list = Array.isArray(ownerObj.buildings) ? ownerObj.buildings : [];
    if (list.length === 0) return 0;
    const now = Date.now();
    let total = 0;
    for (const b of list) {
        const last = b.lastCollect || now;
        const hours = Math.min(24, Math.max(0, (now - last) / 3600000));
        total += Math.floor(hours * (b.residents || 0) * (b.rentPerResident || 150));
    }
    return total;
}

async function handleMonopoly(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'info').toLowerCase();

    if (sub === 'shop' || sub === 'list') {
        const lines = Object.values(BUILDINGS_CATALOG).map(
            (b) => `• **${b.name}** (` + '`' + b.id + '`' + `) — **${formatMoney(b.price)}** • **${formatMoney(b.rentPerResident)}/h** par habitant (max **${b.maxResidents}** hab.)`
        );
        return replyContainer(message, {
            title: '🏙️ Kyuro Monopoly • Catalogue',
            body: `${lines.join('\n')}\n\nAchète avec \`*monopoly buy <id>\` ou emménage chez un joueur avec \`*monopoly movein <@proprio>\`.`
        });
    }

    if (sub === 'buy') {
        const bKey = (args[1] || '').toLowerCase();
        const tpl = BUILDINGS_CATALOG[bKey];
        if (!tpl) {
            return replyContainer(message, {
                title: '🏙️ Kyuro Monopoly',
                body: 'ID inconnu (`studio`, `residence`, `penthouse`, `citadel`). Utilise `*monopoly shop`.'
            });
        }
        if (u.cash < tpl.price) {
            return replyContainer(message, {
                title: '🏙️ Fonds insuffisants',
                body: `Il te faut **${formatMoney(tpl.price)}** en cash pour acheter **${tpl.name}**.`
            });
        }
        u.cash -= tpl.price;
        u.buildings.push({
            id: tpl.id,
            name: tpl.name,
            tier: tpl.tier,
            rentPerResident: tpl.rentPerResident,
            maxResidents: tpl.maxResidents,
            residents: 1, // 1 résident initial s'installe dès l'achat
            lastCollect: Date.now()
        });
        saveData();
        const st = getBuildingStats(u);
        const att = await renderMonopolyBluePng(u, computePendingRent(u), st.residentsTotal, st.maxRes);
        return replyImageOnly(message, att);
    }

    if (sub === 'movein' || sub === 'habiter') {
        const target = message.mentions.users.first();
        if (!target || target.bot || target.id === message.author.id) {
            return replyContainer(message, {
                title: '🏠 Emménagement',
                body: 'Mentionne un joueur qui possède un immeuble : `*monopoly movein <@membre>`'
            });
        }
        const host = getUser(target.id, target);
        const freeBuilding = host.buildings.find((b) => (b.residents || 0) < (b.maxResidents || 0));
        if (!freeBuilding) {
            return replyContainer(message, {
                title: '🏠 Immeuble complet',
                body: `**${host.username}** n'a plus de place disponible dans ses immeubles.`
            });
        }
        const depositFee = 500;
        if (u.cash < depositFee) {
            return replyContainer(message, {
                title: '🏠 Caution requise',
                body: `Il faut **${formatMoney(depositFee)}** de caution pour emménager chez **${host.username}**.`
            });
        }
        u.cash -= depositFee;
        host.cash += depositFee;
        freeBuilding.residents = (freeBuilding.residents || 0) + 1;
        u.homeBuildingOwnerId = target.id;
        saveData();
        return replyContainer(message, {
            title: '🏠 Nouveau locataire',
            body: `Tu habites désormais dans **${freeBuilding.name}** chez **${host.username}** (caution **${formatMoney(depositFee)}** versée). Chaque habitant génère des loyers en \`$\` au propriétaire.`
        });
    }

    if (sub === 'collect' || sub === 'loyer') {
        const pending = computePendingRent(u);
        const now = Date.now();
        for (const b of u.buildings) b.lastCollect = now;
        u.cash += pending;
        saveData();
        const st = getBuildingStats(u);
        const att = await renderMonopolyBluePng(u, 0, st.residentsTotal, st.maxRes);
        return replyImageOnly(message, att);
    }

    const st = getBuildingStats(u);
    const att = await renderMonopolyBluePng(u, computePendingRent(u), st.residentsTotal, st.maxRes);
    return replyImageOnly(message, att);
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const u = getUser(target.id, target);
    const extra = u.buildings.length > 0 ? `IMMEUBLES: ${u.buildings.length} BIEN(S)` : 'AUCUN IMMEUBLE';
    return replyImageOnly(message, await renderWalletBluePng(u, extra));
}

async function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseAmount(args[0], u.cash);
    if (!amt || u.cash < amt) return replyContainer(message, { title: '🏦 Dépôt', body: 'Utilisation : `*deposit <montant|all>`' });
    u.cash -= amt; u.bank += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `DEPOT BANQUE: +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseAmount(args[0], u.bank);
    if (!amt || u.bank < amt) return replyContainer(message, { title: '🏧 Retrait', body: 'Utilisation : `*withdraw <montant|all>`' });
    u.bank -= amt; u.cash += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `RETRAIT CASH: +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.work < cd) return replyContainer(message, { title: '💼 Travail', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    u.cooldowns.work = now;
    const gain = Math.floor(Math.random() * 900) + 500;
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'WORK', `SALAIRE: +${gain.toLocaleString('fr-FR')} $`, `CASH: ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) return replyContainer(message, { title: '🎁 Daily', body: `Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    u.cooldowns.daily = now;
    const gain = 3000;
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'DAILY', `BONUS: +${gain.toLocaleString('fr-FR')} $`, `CASH: ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleCrime(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 20 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) return replyContainer(message, { title: '🕵️ Crime', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    u.cooldowns.crime = now;
    const ok = Math.random() < 0.55;
    const amt = ok ? Math.floor(Math.random() * 1500) + 650 : Math.min(u.cash, 700);
    if (ok) u.cash += amt; else u.cash -= amt;
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'CRIME', ok ? `COUP REUSSI +${amt.toLocaleString('fr-FR')} $` : `AMENDE -${amt.toLocaleString('fr-FR')} $`, `CASH: ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleRob(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) return replyContainer(message, { title: '🔫 Vol', body: 'Utilisation : `*rob <@membre>`' });
    if (isSuperOwner(target)) return replyContainer(message, { title: '🔫 Vol bloqué', body: 'Impossible de voler le Super Owner.' });
    const now = Date.now(), cd = 35 * 60 * 1000;
    if (now - atk.cooldowns.rob < cd) return replyContainer(message, { title: '🔫 Vol', body: `Patiente **${formatCooldown(cd - (now - atk.cooldowns.rob))}**.` });
    atk.cooldowns.rob = now;
    const def = getUser(target.id, target);
    if (def.cash < 200) return replyContainer(message, { title: '🔫 Vol', body: 'Cible trop pauvre.' });
    const ok = Math.random() < 0.45;
    const amt = ok ? Math.min(def.cash, Math.max(200, Math.floor(def.cash * 0.25))) : Math.min(atk.cash, 500);
    if (ok) { def.cash -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'ROB', ok ? `VOLE ${amt.toLocaleString('fr-FR')} $` : `RATE -${amt.toLocaleString('fr-FR')} $`, `CASH: ${atk.cash.toLocaleString('fr-FR')} $`));
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'KYR').toLowerCase();
    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase();
        const amt = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0) return replyContainer(message, { title: '📈 Crypto', body: 'Utilisation : `*crypto buy <BTC|ETH|KYR|SOL> <qté>`' });
        const cost = Math.ceil(amt * c.price);
        if (u.cash < cost) return replyContainer(message, { title: '📈 Crypto', body: `Il faut **${formatMoney(cost)}**.` });
        u.cash -= cost; u.crypto[sym] = (u.crypto[sym] || 0) + amt; saveData();
        return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym]));
    }
    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amt = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0 || (u.crypto[sym] || 0) < amt) return replyContainer(message, { title: '📉 Crypto', body: 'Utilisation : `*crypto sell <BTC|ETH|KYR|SOL> <qté>`' });
        const gain = Math.floor(amt * c.price);
        u.crypto[sym] -= amt; u.cash += gain; saveData();
        return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym]));
    }
    const sym = db.cryptos[sub.toUpperCase()] ? sub.toUpperCase() : 'KYR';
    const c = db.cryptos[sym];
    return replyImageOnly(message, await renderCryptoBluePng(u, sym, c.name, c.price, c.history, u.crypto[sym] || 0));
}

async function handleHack(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) return replyContainer(message, { title: '💻 Hack', body: 'Utilisation : `*hack <@membre>`' });
    if (isSuperOwner(target)) return replyContainer(message, { title: '💻 Hack bloqué', body: 'Impossible de hacker le Super Owner.' });
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - atk.cooldowns.hack < cd) return replyContainer(message, { title: '💻 Hack', body: `Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.hack))}**.` });
    atk.cooldowns.hack = now;
    const def = getUser(target.id, target);
    const ok = Math.random() < 0.48 && def.cash >= 200;
    const amt = ok ? Math.min(def.cash, Math.max(250, Math.floor(def.cash * 0.2))) : Math.min(atk.cash, 450);
    if (ok) { def.cash -= amt; atk.cash += amt; atk.stats.hacksSuccess += 1; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'HACK', ok ? `BREACH +${amt.toLocaleString('fr-FR')} $` : `TRACE -${amt.toLocaleString('fr-FR')} $`, `CIBLE: ${def.username}`));
}

async function handleHeist(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) return replyContainer(message, { title: '🏦 Heist', body: 'Utilisation : `*heist <@membre>`' });
    if (isSuperOwner(target)) return replyContainer(message, { title: '🏦 Heist bloqué', body: 'Cible protégée.' });
    const now = Date.now(), cd = 60 * 60 * 1000;
    if (now - atk.cooldowns.heist < cd) return replyContainer(message, { title: '🏦 Heist', body: `Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.heist))}**.` });
    atk.cooldowns.heist = now;
    const def = getUser(target.id, target);
    const ok = Math.random() < 0.40 && def.bank >= 500;
    const amt = ok ? Math.min(def.bank, Math.max(500, Math.floor(def.bank * 0.22))) : Math.min(atk.cash, 900);
    if (ok) { def.bank -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'HEIST', ok ? `CASSE +${amt.toLocaleString('fr-FR')} $` : `ALARME -${amt.toLocaleString('fr-FR')} $`, `BANQUE: ${def.username}`));
}

async function handleScratch(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎟️ Scratch', body: 'Utilisation : `*scratch <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const mults = [0, 0, 0.5, 1, 1.5, 2, 3, 5];
    const m = mults[Math.floor(Math.random() * mults.length)];
    const gain = Math.floor(bet * m);
    if (gain > 0) { u.cash += gain; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'SCRATCH', `MULTIPLICATEUR X${m}`, gain > 0 ? `GAIN: +${gain.toLocaleString('fr-FR')} $` : `TICKET VIDE -${bet.toLocaleString('fr-FR')} $`));
}

async function handleLottery(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'info').toLowerCase();
    if (sub === 'buy') {
        const bet = parseAmount(args[1], u.cash);
        if (!bet || u.cash < bet) return replyContainer(message, { title: '🎟️ Loterie', body: 'Utilisation : `*lottery buy <mise|all>`' });
        u.cash -= bet;
        db.lotteryPot += bet;
        saveData();
        return replyContainer(message, { title: '🎟️ Ticket validé', body: `Mise **${formatMoney(bet)}** ajoutée au pot (**${formatMoney(db.lotteryPot)}**). Lance \`*lottery draw\` pour tenter le tirage.` });
    }
    if (sub === 'draw') {
        if (db.lotteryPot <= 0) return replyContainer(message, { title: '🎟️ Loterie', body: 'Le pot est vide.' });
        const won = Math.random() < 0.25;
        if (won) {
            const prize = db.lotteryPot;
            db.lotteryPot = 5000;
            u.cash += prize;
            saveData();
            return replyImageOnly(message, await renderBlueActionPng(u, 'LOTTERY', `JACKPOT +${prize.toLocaleString('fr-FR')} $`, `CASH: ${u.cash.toLocaleString('fr-FR')} $`));
        }
        saveData();
        return replyContainer(message, { title: '🎟️ Tirage manqué', body: `Pas cette fois. Pot actuel : **${formatMoney(db.lotteryPot)}**.` });
    }
    return replyContainer(message, { title: '🎟️ Kyuro Loterie', body: `Pot actuel : **${formatMoney(db.lotteryPot)}** • \`*lottery buy <mise|all>\` • \`*lottery draw\`` });
}

async function handleDuel(message, args) {
    const p1 = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    const bet = parseAmount(args[1] || args[0], p1.cash);
    if (!target || target.bot || target.id === message.author.id || !bet || p1.cash < bet) {
        return replyContainer(message, { title: '⚔️ Duel', body: 'Utilisation : `*duel <@membre> <mise|all>`' });
    }
    const p2 = getUser(target.id, target);
    if (p2.cash < bet) return replyContainer(message, { title: '⚔️ Duel', body: `**${p2.username}** n'a pas assez de cash.` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('duel_accept').setLabel('Accepter le duel').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('duel_decline').setLabel('Refuser').setStyle(ButtonStyle.Secondary)
    );
    const sent = await replyContainer(message, {
        title: '⚔️ Défi Duel',
        body: `**${p1.username}** défie **${p2.username}** pour **${formatMoney(bet)}** !`,
        components: [row]
    });
    activeDuels.set(sent.id, { p1Id: message.author.id, p2Id: target.id, bet });
}
function drawCard() {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['S', 'H', 'D', 'C'];
    return `${ranks[Math.floor(Math.random() * ranks.length)]}${suits[Math.floor(Math.random() * suits.length)]}`;
}

function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
        const r = c.slice(0, -1);
        if (r === 'A') { total += 11; aces++; }
        else if (['K', 'Q', 'J'].includes(r)) total += 10;
        else total += parseInt(r, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

async function handleBlackjack(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🃏 Blackjack', body: 'Utilisation : `*blackjack <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet; saveData();
    const pCards = [drawCard(), drawCard()], dCards = [drawCard(), drawCard()];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
    );
    const att = await renderBlackjackBluePng(u, bet, pCards, handValue(pCards), [dCards[0], '??'], '?', 'EN COURS');
    const sent = await replyImageOnly(message, att, [row]);
    activeBlackjacks.set(sent.id, { userId: message.author.id, bet, pCards, dCards });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id, message.author);
    const ch = (args[0] || '').toLowerCase();
    const bet = parseAmount(args[1], u.cash);
    const valid = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];
    if (!valid.includes(ch) || !bet || u.cash < bet) return replyContainer(message, { title: '🎡 Roulette', body: 'Utilisation : `*roulette <rouge|noir|vert|pair|impair> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const num = Math.floor(Math.random() * 37);
    const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir');
    const parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');
    const norm = ['rouge','red'].includes(ch) ? 'rouge' : ['noir','black'].includes(ch) ? 'noir' : ['vert','green'].includes(ch) ? 'vert' : ['pair','even'].includes(ch) ? 'pair' : 'impair';
    const mult = (norm === 'vert' && color === 'vert') ? 14 : ((norm === color || norm === parity) ? 2 : 0);
    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderRouletteBluePng(u, num, color, bet, win > 0 ? `GAGNE: +${win.toLocaleString('fr-FR')} $` : `PERDU: -${bet.toLocaleString('fr-FR')} $`));
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎰 Slots', body: 'Utilisation : `*slots <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'];
    const r = [0,1,2].map(() => syms[Math.floor(Math.random() * syms.length)]);
    const mult = (r[0] === r[1] && r[1] === r[2]) ? (r[0] === '💎' ? 10 : 5) : ((r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? 1.5 : 0);
    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderSlotsBluePng(u, r, bet, win > 0 ? `GAIN: +${win.toLocaleString('fr-FR')} $` : `PERTE: -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id, message.author);
    const side = (args[0] || '').toLowerCase();
    const bet = parseAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet || u.cash < bet) return replyContainer(message, { title: '🪙 Coinflip', body: 'Utilisation : `*coinflip <pile|face> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const out = Math.random() < 0.5 ? 'pile' : 'face';
    const won = out === side;
    if (won) { u.cash += bet * 2; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'COINFLIP', `PIECE: ${out.toUpperCase()}`, won ? `GAGNE: +${(bet * 2).toLocaleString('fr-FR')} $` : `PERDU: -${bet.toLocaleString('fr-FR')} $`));
}

async function handleDice(message, args) {
    const u = getUser(message.author.id, message.author);
    const guess = parseInt(args[0], 10);
    const bet = parseAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet || u.cash < bet) return replyContainer(message, { title: '🎲 Dice', body: 'Utilisation : `*dice <1-6> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = roll === guess;
    if (won) { u.cash += bet * 5; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'DICE', `DE: ${roll} (CHOIX ${guess})`, won ? `JACKPOT X5: +${(bet * 5).toLocaleString('fr-FR')} $` : `PERDU: -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🚀 Crash', body: 'Utilisation : `*crash <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.8).toFixed(2));
    const targetMult = Number((1.1 + Math.random() * 1.9).toFixed(2));
    const won = crashAt >= targetMult;
    const pay = won ? Math.floor(bet * targetMult) : 0;
    if (won) { u.cash += pay; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'CRASH', `X${targetMult} VS CRASH X${crashAt}`, won ? `ENCAISSE: +${pay.toLocaleString('fr-FR')} $` : `CRASH: -${bet.toLocaleString('fr-FR')} $`));
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('help_')) {
        const tab = interaction.customId.replace('help_', '');
        const sec = getHelpSection(tab);
        const container = buildContainerV2({ title: sec.title, body: sec.body });
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [container, helpButtons(tab)] }).catch(() => {});
    }

    const duel = activeDuels.get(interaction.message.id);
    if (duel) {
        if (interaction.user.id !== duel.p2Id) return;
        activeDuels.delete(interaction.message.id);
        const p1 = getUser(duel.p1Id);
        const p2 = getUser(duel.p2Id, interaction.user);
        if (interaction.customId === 'duel_decline') {
            return interaction.update({
                flags: MessageFlags.IsComponentsV2,
                components: [buildContainerV2({ title: '⚔️ Duel refusé', body: `**${p2.username}** a décliné le duel.` })]
            }).catch(() => {});
        }
        if (p1.cash < duel.bet || p2.cash < duel.bet) {
            return interaction.update({
                flags: MessageFlags.IsComponentsV2,
                components: [buildContainerV2({ title: '⚔️ Duel annulé', body: 'Solde insuffisant chez l\'un des joueurs.' })]
            }).catch(() => {});
        }
        const p1Wins = Math.random() < 0.5;
        if (p1Wins) { p1.cash += duel.bet; p2.cash -= duel.bet; p1.stats.wins += 1; p2.stats.losses += 1; }
        else { p2.cash += duel.bet; p1.cash -= duel.bet; p2.stats.wins += 1; p1.stats.losses += 1; }
        saveData();
        const winner = p1Wins ? p1 : p2;
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [buildContainerV2({ title: '⚔️ Résultat du duel', body: `Victoire de **${winner.username}** (+**${formatMoney(duel.bet)}**) !` })]
        }).catch(() => {});
    }

    const game = activeBlackjacks.get(interaction.message.id);
    if (!game || interaction.user.id !== game.userId) return;
    const u = getUser(game.userId, interaction.user);
    let finished = false, status = 'EN COURS';
    if (interaction.customId === 'bj_hit') {
        game.pCards.push(drawCard());
        const pv = handValue(game.pCards);
        if (pv > 21) { finished = true; u.stats.losses += 1; status = `BUST (${pv}) -${game.bet} $`; }
        else if (pv === 21) {
            finished = true;
            while (handValue(game.dCards) < 17) game.dCards.push(drawCard());
            const dv = handValue(game.dCards);
            if (dv === 21) { u.cash += game.bet; status = 'EGALITE 21'; }
            else { u.cash += game.bet * 2; u.stats.wins += 1; status = `21 WIN +${game.bet * 2} $`; }
        }
    } else if (interaction.customId === 'bj_stand') {
        finished = true;
        while (handValue(game.dCards) < 17) game.dCards.push(drawCard());
        const pv = handValue(game.pCards), dv = handValue(game.dCards);
        if (dv > 21 || pv > dv) { u.cash += game.bet * 2; u.stats.wins += 1; status = `WIN ${pv} VS ${dv} +${game.bet * 2} $`; }
        else if (pv === dv) { u.cash += game.bet; status = `EGALITE ${pv} VS ${dv}`; }
        else { u.stats.losses += 1; status = `PERDU ${pv} VS ${dv} -${game.bet} $`; }
    }
    saveData();
    if (finished) activeBlackjacks.delete(interaction.message.id);
    const att = await renderBlackjackBluePng(u, game.bet, game.pCards, handValue(game.pCards), finished ? game.dCards : [game.dCards[0], '??'], finished ? handValue(game.dCards) : '?', status);
    await interaction.update({ files: [att], components: finished ? [] : interaction.message.components }).catch(() => {});
});

client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = (args.shift() || '').toLowerCase();

    if (cmd === 'setcasino' || cmd === 'casinochannel') {
        if (!isSuperOwner(message.author)) {
            return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé au Super Owner.' });
        }
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'off' || sub === 'reset' || sub === 'clear') {
            setGuildCasinoCategory(message.guild.id, null);
            return replyContainer(message, { title: '🔓 Restriction désactivée', body: 'Kyuro Casino fonctionne dans tous les salons du serveur.' });
        }
        const categoryId = await resolveCategoryIdFromInput(message, args[0]);
        if (!categoryId) {
            return replyContainer(message, { title: '❌ Catégorie introuvable', body: 'Indique un ID de catégorie (`*setcasino <ID>`) ou lance la commande depuis un salon de la catégorie.' });
        }
        const catChannel = await message.guild.channels.fetch(categoryId).catch(() => null);
        setGuildCasinoCategory(message.guild.id, categoryId);
        return replyContainer(message, {
            title: '🎰 Catégorie configurée',
            body: `Kyuro Casino répond uniquement dans **${catChannel ? catChannel.name : categoryId}** et ses salons inclus.`
        });
    }

    if (!isAllowedCasinoChannel(message)) return;
    getUser(message.author.id, message.author);

    if (cmd === 'reseteconomy') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé au Super Owner.' });
        db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)), casinoCategories: db.casinoCategories || {}, lotteryPot: 15000 };
        saveData();
        return replyContainer(message, { title: '♻️ Reset OK', body: 'Économie réinitialisée.' });
    }
    if (cmd === 'setmoney') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé au Super Owner.' });
        const target = message.mentions.users.first();
        const amt = parseInt(args[1], 10);
        if (!target || isNaN(amt) || amt < 0) return replyContainer(message, { title: '💰 Setmoney', body: 'Utilisation : `*setmoney <@membre> <montant>`' });
        const u = getUser(target.id, target);
        u.cash = amt; saveData();
        return replyContainer(message, { title: '💰 Setmoney', body: `Cash de **${u.username}** : **${formatMoney(amt)}**.` });
    }
    if (cmd === 'pay') {
        const s = getUser(message.author.id, message.author);
        const t = message.mentions.users.first();
        const amt = parseAmount(args[1], s.cash);
        if (!t || t.bot || t.id === message.author.id || !amt || s.cash < amt) return replyContainer(message, { title: '💸 Pay', body: 'Utilisation : `*pay <@membre> <montant|all>`' });
        const r = getUser(t.id, t);
        s.cash -= amt; r.cash += amt; saveData();
        return replyContainer(message, { title: '💸 Pay', body: `Envoyé **${formatMoney(amt)}** à **${r.username}**.` });
    }
    if (cmd === 'help') {
        const sec = getHelpSection('all');
        return replyContainer(message, { title: sec.title, body: sec.body, components: [helpButtons('all')] });
    }

    if (cmd === 'balance' || cmd === 'bal') return handleBalance(message);
    if (cmd === 'deposit' || cmd === 'dep') return handleDeposit(message, args);
    if (cmd === 'withdraw' || cmd === 'with') return handleWithdraw(message, args);
    if (cmd === 'work') return handleWork(message);
    if (cmd === 'daily') return handleDaily(message);
    if (cmd === 'crime') return handleCrime(message);
    if (cmd === 'rob') return handleRob(message);
    if (cmd === 'monopoly' || cmd === 'immo' || cmd === 'company') return handleMonopoly(message, args);
    if (cmd === 'crypto' || cmd === 'bourse') return handleCrypto(message, args);
    if (cmd === 'hack') return handleHack(message);
    if (cmd === 'heist') return handleHeist(message);
    if (cmd === 'scratch') return handleScratch(message, args);
    if (cmd === 'lottery' || cmd === 'loto') return handleLottery(message, args);
    if (cmd === 'duel') return handleDuel(message, args);
    if (cmd === 'blackjack' || cmd === 'bj') return handleBlackjack(message, args);
    if (cmd === 'roulette' || cmd === 'rl') return handleRoulette(message, args);
    if (cmd === 'slots' || cmd === 'slot') return handleSlots(message, args);
    if (cmd === 'coinflip' || cmd === 'cf') return handleCoinflip(message, args);
    if (cmd === 'dice') return handleDice(message, args);
    if (cmd === 'crash') return handleCrash(message, args);
    if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
        const entries = Object.entries(db.users)
            .map(([id, u]) => ({ name: u.username || `Joueur_${id.slice(-4)}`, total: (u.cash || 0) + (u.bank || 0) }))
            .sort((a, b) => b.total - a.total);
        return replyImageOnly(message, await renderLeaderboardBluePng(entries));
    }
});

// Tick automatique léger des cours crypto toutes les 10 minutes
setInterval(() => {
    for (const sym of Object.keys(db.cryptos)) {
        const c = db.cryptos[sym];
        const delta = 1 + ((Math.random() - 0.48) * 0.08);
        c.price = Math.max(10, Math.round(c.price * delta));
        c.history = [...(c.history || []).slice(-11), c.price];
    }
    saveData();
}, 600000);

client.on('error', err => console.error('Erreur client Discord:', err.message));
client.on('shardError', err => console.error('Erreur shard Discord:', err.message));
client.on('shardDisconnect', (event, id) => {
    console.warn(`Shard ${id} déconnecté (${event?.code}). Reconnexion...`);
    if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Reconnexion:', e.message));
});

setInterval(() => {
    if (!client.isReady() && process.env.DISCORD_TOKEN) {
        console.warn('Client Discord non prêt, tentative de reconnexion...');
        client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Relance:', e.message));
    }
}, 240000);

process.on('unhandledRejection', reason => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));

client.once('clientReady', () => console.log(`Kyuro Casino v6.0 prêt : ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
