// Build Revision: Kuzo-Casino-v3.0 (Prefix: *)
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
    SeparatorSpacingSize
} = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Kuzo Casino v3.0 Active!\n');
}).listen(PORT, '0.0.0.0', () => console.log(`HTTP Kuzo Casino actif sur ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '*';
const CURRENCY = '🪙';
const SUPER_OWNER_ID = '1166445202148442112';
const SUPER_OWNER_HANDLES = new Set(['graveuhq', 'k2l', '77jc']);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'kuzo-casino-data.json');
const activeBlackjacks = new Map();

const DEFAULT_CRYPTOS = {
    BTC: { name: 'Bitcoin', price: 68500, history: [64200, 65100, 64800, 66700, 67900, 68500] },
    ETH: { name: 'Ethereum', price: 3450, history: [3180, 3240, 3210, 3320, 3390, 3450] },
    KZO: { name: 'Kuzo Coin', price: 1250, history: [820, 910, 980, 1050, 1180, 1250] },
    SOL: { name: 'Solana', price: 215, history: [185, 192, 189, 201, 208, 215] }
};

let db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)) };

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
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
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
        }
    } catch (e) {
        console.error('Erreur chargement:', e.message);
    }
}

loadData();

function getUser(userId, discordUser = null) {
    if (!db.users[userId]) {
        db.users[userId] = {
            username: discordUser ? (discordUser.globalName || discordUser.username) : `Joueur_${userId.slice(-4)}`,
            cash: 2500,
            bank: 1000,
            crypto: { BTC: 0, ETH: 0, KZO: 0, SOL: 0 },
            company: null,
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: { work: 0, daily: 0, crime: 0, rob: 0, hack: 0 }
        };
        saveData();
    }
    const u = db.users[userId];
    if (discordUser) u.username = discordUser.globalName || discordUser.username || u.username;
    if (!u.username) u.username = `Joueur_${userId.slice(-4)}`;
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, KZO: 0, SOL: 0 };
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0 };
    return u;
}

function parseBetAmount(rawArg, maxVal) {
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

// --- Police bitmap 5x7 ASCII nette pour écrire directement dans l'image PNG ---
const FONT_5X7 = {
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'B': ['11110','10001','10001','11110','10001','10001','11110'],
    'C': ['01111','10000','10000','10000','10000','10000','01111'],
    'D': ['11100','10010','10001','10001','10001','10010','11100'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'F': ['11111','10000','10000','11110','10000','10000','10000'],
    'G': ['01111','10000','10000','10111','10001','10001','01111'],
    'H': ['10001','10001','10001','11111','10001','10001','10001'],
    'I': ['11111','00100','00100','00100','00100','00100','11111'],
    'J': ['00111','00010','00010','00010','10010','10010','01100'],
    'K': ['10001','10010','10100','11000','10100','10010','10001'],
    'L': ['10000','10000','10000','10000','10000','10000','11111'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
    'N': ['10001','11001','10101','10011','10001','10001','10001'],
    'O': ['01110','10001','10001','10001','10001','10001','01110'],
    'P': ['11110','10001','10001','11110','10000','10000','10000'],
    'Q': ['01110','10001','10001','10001','10101','10010','01101'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'S': ['01111','10000','10000','01110','00001','00001','11110'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    'U': ['10001','10001','10001','10001','10001','10001','01110'],
    'V': ['10001','10001','10001','10001','10001','01010','00100'],
    'W': ['10001','10001','10001','10101','10101','11011','10001'],
    'X': ['10001','10001','01010','00100','01010','10001','10001'],
    'Y': ['10001','10001','01010','00100','00100','00100','00100'],
    'Z': ['11111','00001','00010','00100','01000','10000','11111'],
    '0': ['01110','10011','10101','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00110','01000','10000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','11110','00001','00001','10001','01110'],
    '6': ['01110','10000','11110','10001','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00001','01110'],
    ':': ['00000','00100','00100','00000','00100','00100','00000'],
    '.': ['00000','00000','00000','00000','00000','01100','01100'],
    ',': ['00000','00000','00000','00000','00110','00110','00100'],
    '-': ['00000','00000','00000','11111','00000','00000','00000'],
    '+': ['00000','00100','00100','11111','00100','00100','00000'],
    '/': ['00001','00010','00100','01000','10000','00000','00000'],
    '|': ['00100','00100','00100','00100','00100','00100','00100'],
    '[': ['01110','01000','01000','01000','01000','01000','01110'],
    ']': ['01110','00010','00010','00010','00010','00010','01110'],
    '(': ['00010','00100','01000','01000','01000','00100','00010'],
    ')': ['01000','00100','00010','00010','00010','00100','01000'],
    '#': ['01010','11111','01010','01010','11111','01010','00000'],
    '%': ['11001','11010','00100','01000','10110','10011','00000'],
    '!': ['00100','00100','00100','00100','00100','00000','00100'],
    '?': ['01110','10001','00010','00100','00100','00000','00100'],
    '_': ['00000','00000','00000','00000','00000','00000','11111'],
    ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

function normalizeAscii(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9:.,+\-/|()\[\]#%! ?_]/g, ' ');
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

class KuzoPng {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.buf = Buffer.alloc(w * h * 4);
    }

    px(x, y, r, g, b, a = 255) {
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
        const idx = (iy * this.w + ix) * 4;
        const al = a / 255;
        if (al >= 0.999) {
            this.buf[idx] = r; this.buf[idx + 1] = g; this.buf[idx + 2] = b; this.buf[idx + 3] = 255;
        } else {
            const inv = 1 - al;
            this.buf[idx] = Math.min(255, Math.round(r * al + this.buf[idx] * inv));
            this.buf[idx + 1] = Math.min(255, Math.round(g * al + this.buf[idx + 1] * inv));
            this.buf[idx + 2] = Math.min(255, Math.round(b * al + this.buf[idx + 2] * inv));
            this.buf[idx + 3] = Math.max(this.buf[idx + 3], a);
        }
    }

    rect(x, y, w, h, r, g, b, a = 255) {
        const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(this.w - 1, Math.floor(x + w)), y1 = Math.min(this.h - 1, Math.floor(y + h));
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) this.px(px, py, r, g, b, a);
    }

    border(x, y, w, h, t, r, g, b, a = 255) {
        this.rect(x, y, w, t, r, g, b, a);
        this.rect(x, y + h - t, w, t, r, g, b, a);
        this.rect(x, y, t, h, r, g, b, a);
        this.rect(x + w - t, y, t, h, r, g, b, a);
    }

    circle(cx, cy, rad, r, g, b, a = 255) {
        const r2 = rad * rad;
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                if (dx * dx + dy * dy <= r2) this.px(cx + dx, cy + dy, r, g, b, a);
            }
        }
    }

    line(x0, y0, x1, y1, t, r, g, b, a = 255) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        const half = Math.floor(t / 2);
        for (let i = 0; i <= steps; i++) {
            const p = i / steps;
            this.rect(x0 + (x1 - x0) * p - half, y0 + (y1 - y0) * p - half, t, t, r, g, b, a);
        }
    }

    text(str, x, y, scale, r, g, b, a = 255) {
        const clean = normalizeAscii(str);
        const adv = 6 * scale;
        for (let i = 0; i < clean.length; i++) {
            const glyph = FONT_5X7[clean[i]] || FONT_5X7[' '];
            const gx = x + i * adv;
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 5; col++) {
                    if (glyph[row][col] === '1') {
                        this.rect(gx + col * scale, y + row * scale, scale, scale, r, g, b, a);
                    }
                }
            }
        }
    }

    blueBg() {
        for (let y = 0; y < this.h; y++) {
            const ty = y / this.h;
            for (let x = 0; x < this.w; x++) {
                const tx = x / this.w;
                let r = Math.round(4 + tx * 10 + ty * 5);
                let g = Math.round(16 + tx * 42 + ty * 28);
                let b = Math.round(52 + tx * 88 + ty * 45);
                const dx = (x - this.w * 0.85) / (this.w * 0.45);
                const dy = (y - this.h * 0.15) / (this.h * 0.55);
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 1) {
                    const gl = (1 - d) * 0.34;
                    r = Math.min(255, Math.round(r + 56 * gl));
                    g = Math.min(255, Math.round(g + 189 * gl));
                    b = Math.min(255, Math.round(b + 248 * gl));
                }
                this.px(x, y, r, g, b, 255);
            }
        }
        this.border(14, 14, this.w - 28, this.h - 28, 3, 56, 189, 248, 220);
        this.text('KUZO CASINO', 32, 26, 2, 56, 189, 248, 255);
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
function renderWalletPng(username, cash, bank, extra = '') {
    const c = new KuzoPng(720, 280);
    c.blueBg();
    c.text(`JOUEUR: ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text('PORTEFEUILLE & BANQUE', 32, 54, 3, 255, 255, 255, 255);

    c.rect(32, 92, 206, 118, 7, 26, 62, 230);
    c.border(32, 92, 206, 118, 2, 56, 189, 248, 230);
    c.text('CASH', 46, 106, 2, 125, 211, 252, 255);
    c.text(`${Math.floor(cash).toLocaleString('fr-FR')} PTS`, 46, 144, 2, 255, 255, 255, 255);

    c.rect(256, 92, 206, 118, 7, 26, 62, 230);
    c.border(256, 92, 206, 118, 2, 96, 165, 250, 230);
    c.text('BANQUE', 270, 106, 2, 147, 197, 253, 255);
    c.text(`${Math.floor(bank).toLocaleString('fr-FR')} PTS`, 270, 144, 2, 255, 255, 255, 255);

    c.rect(480, 92, 208, 118, 7, 26, 62, 230);
    c.border(480, 92, 208, 118, 2, 34, 211, 238, 230);
    c.text('TOTAL', 494, 106, 2, 103, 232, 249, 255);
    c.text(`${Math.floor(cash + bank).toLocaleString('fr-FR')} PTS`, 494, 144, 2, 255, 255, 255, 255);

    c.text(extra || 'KUZO BANK SYSTEM', 32, 232, 2, 186, 230, 253, 255);
    return c.toAttachment('kuzo-wallet.png');
}

function renderBlackjackPng(username, bet, pCards, pVal, dCards, dVal, statusText) {
    const c = new KuzoPng(720, 300);
    c.blueBg();
    c.text(`BLACKJACK - ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(`MISE: ${bet.toLocaleString('fr-FR')} PTS`, 32, 54, 3, 255, 255, 255, 255);

    // Cartes joueur
    c.text(`TA MAIN (${pVal})`, 32, 96, 2, 125, 211, 252, 255);
    pCards.slice(0, 5).forEach((card, i) => {
        const cx = 32 + i * 74;
        c.rect(cx, 118, 62, 82, 240, 249, 255, 255);
        c.border(cx, 118, 62, 82, 2, 14, 165, 233, 255);
        c.text(card, cx + 8, 148, 2, 8, 30, 68, 255);
    });

    // Cartes croupier
    c.text(`CROUPIER (${dVal})`, 430, 96, 2, 125, 211, 252, 255);
    dCards.slice(0, 4).forEach((card, i) => {
        const cx = 430 + i * 66;
        c.rect(cx, 118, 56, 82, 15, 45, 95, 255);
        c.border(cx, 118, 56, 82, 2, 125, 211, 252, 255);
        c.text(card, cx + 7, 148, 2, 224, 242, 254, 255);
    });

    c.text(statusText, 32, 235, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-blackjack.png');
}

function renderRoulettePng(username, num, color, bet, statusText) {
    const c = new KuzoPng(720, 280);
    c.blueBg();
    c.text(`ROULETTE - ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(`NUMERO ${num} (${color.toUpperCase()})`, 32, 54, 3, 255, 255, 255, 255);

    // Roue visuelle à gauche
    c.circle(130, 160, 68, 12, 38, 82, 255);
    c.circle(130, 160, 52, 56, 189, 248, 255);
    c.circle(130, 160, 28, 6, 20, 48, 255);
    c.text(`${num}`, 116, 150, 3, 255, 255, 255, 255);

    c.rect(235, 98, 450, 114, 7, 26, 62, 230);
    c.border(235, 98, 450, 114, 2, 56, 189, 248, 230);
    c.text(`MISE: ${bet.toLocaleString('fr-FR')} PTS`, 255, 116, 2, 125, 211, 252, 255);
    c.text(statusText, 255, 156, 2, 255, 255, 255, 255);

    return c.toAttachment('kuzo-roulette.png');
}

function renderSlotsPng(username, reels, bet, statusText) {
    const c = new KuzoPng(720, 280);
    c.blueBg();
    c.text(`SLOTS - ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(`MISE: ${bet.toLocaleString('fr-FR')} PTS`, 32, 54, 3, 255, 255, 255, 255);

    const labels = reels.map(sym => {
        if (sym === '💎') return 'GEM';
        if (sym === '💠') return 'BLU';
        if (sym === '🪙') return 'COI';
        if (sym === '⚡') return 'ZAP';
        return 'HOT';
    });

    labels.forEach((lbl, i) => {
        const rx = 56 + i * 165;
        c.rect(rx, 96, 136, 104, 8, 30, 72, 240);
        c.border(rx, 96, 136, 104, 3, 56, 189, 248, 255);
        c.text(lbl, rx + 34, 134, 3, 224, 242, 254, 255);
    });

    c.text(statusText, 32, 228, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-slots.png');
}

function renderSmallGamePng(gameName, username, line1, line2) {
    const c = new KuzoPng(720, 250);
    c.blueBg();
    c.text(`${gameName} - ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(line1, 32, 62, 3, 255, 255, 255, 255);
    c.rect(32, 112, 656, 86, 7, 26, 62, 230);
    c.border(32, 112, 656, 86, 2, 56, 189, 248, 230);
    c.text(line2, 50, 144, 2, 186, 230, 253, 255);
    return c.toAttachment('kuzo-game.png');
}
function renderCompanyPng(username, comp, pending) {
    const c = new KuzoPng(720, 300);
    c.blueBg();
    c.text(`ENTREPRISE - ${username}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(`${comp.name} (NIV.${comp.level})`, 32, 54, 3, 255, 255, 255, 255);

    c.rect(28, 222, 664, 4, 56, 189, 248, 220);
    const count = Math.min(5, Math.max(1, comp.level));
    const slotW = 620 / count;
    for (let i = 0; i < count; i++) {
        const bw = Math.min(96, Math.floor(slotW * 0.7));
        const bx = Math.round(50 + i * slotW + (slotW - bw) / 2);
        const bh = Math.round(58 + ((i + comp.level) % 4) * 18);
        const by = 222 - bh;
        c.rect(bx, by, bw, bh, 12, 42, 98, 240);
        c.border(bx, by, bw, bh, 2, 56, 189, 248, 255);
        for (let wy = by + 10; wy < 210; wy += 16) {
            for (let wx = bx + 10; wx < bx + bw - 14; wx += 18) {
                c.rect(wx, wy, 8, 7, 186, 230, 253, 220);
            }
        }
    }

    c.text(`REVENU: ${comp.incomePerHour}/H  |  A RECOLTER: ${pending} PTS`, 32, 242, 2, 224, 242, 254, 255);
    return c.toAttachment('kuzo-company.png');
}

function renderCryptoPng(symbol, name, price, history, userQty) {
    const c = new KuzoPng(720, 300);
    c.blueBg();
    c.text(`${symbol} - ${name}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(`COURS: ${price.toLocaleString('fr-FR')} PTS`, 32, 54, 3, 255, 255, 255, 255);

    const gx = 36, gy = 92, gw = 648, gh = 148;
    c.rect(gx, gy, gw, gh, 5, 18, 44, 235);
    c.border(gx, gy, gw, gh, 2, 56, 189, 248, 200);

    const vals = history.length > 1 ? history : [price, price];
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const span = Math.max(1, maxV - minV);
    const pts = vals.map((v, i) => ({
        x: gx + 18 + (i / (vals.length - 1)) * (gw - 36),
        y: gy + gh - 20 - ((v - minV) / span) * (gh - 40)
    }));

    for (let i = 0; i < pts.length - 1; i++) {
        c.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 4, 56, 189, 248, 255);
    }
    for (const p of pts) {
        c.circle(p.x, p.y, 4, 224, 242, 254, 255);
    }

    c.text(`SOLDE: ${userQty} ${symbol}  |  MIN: ${minV}  MAX: ${maxV}`, 36, 256, 2, 186, 230, 253, 255);
    return c.toAttachment('kuzo-crypto.png');
}

function renderHackPng(attackerName, targetName, ok, amount) {
    const c = new KuzoPng(720, 270);
    c.blueBg();
    c.text(`INTRUSION - ${attackerName}`, 220, 26, 2, 224, 242, 254, 255);
    c.text(ok ? `BREACH REUSSIE: +${amount} PTS` : `TRACE DETECTEE: -${amount} PTS`, 32, 56, 3, 255, 255, 255, 255);

    c.rect(32, 104, 656, 116, 6, 22, 52, 235);
    c.border(32, 104, 656, 116, 2, ok ? 34 : 248, ok ? 211 : 113, ok ? 238 : 113, 240);
    c.text(`CIBLE: ${targetName}`, 52, 126, 2, 125, 211, 252, 255);
    c.text(ok ? `VOL EFFECTUE: ${amount} PTS` : `PENALITE FIREWALL: ${amount} PTS`, 52, 166, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-hack.png');
}

function renderLeaderboardPng(entries) {
    const c = new KuzoPng(720, 320);
    c.blueBg();
    c.text('TOP JOUEURS', 220, 26, 2, 224, 242, 254, 255);
    c.text('CLASSEMENT FORTUNE', 32, 54, 3, 255, 255, 255, 255);

    const top = entries.slice(0, 6);
    if (top.length === 0) {
        c.text('AUCUN JOUEUR ENREGISTRE', 32, 118, 2, 186, 230, 253, 255);
    } else {
        top.forEach((e, idx) => {
            const y = 96 + idx * 34;
            c.text(`#${idx + 1} ${e.name} - ${Math.floor(e.total).toLocaleString('fr-FR')} PTS`, 32, y, 2, 224, 242, 254, 255);
        });
    }
    return c.toAttachment('kuzo-leaderboard.png');
}
function buildContainerV2({ title, body, footer }) {
    return new ContainerBuilder()
        .setAccentColor(0x0ea5e9)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${title}\n${body}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footer || 'Kuzo Casino • Préfixe *'}`)
        );
}

// Envoie uniquement l'image (sans texte embed) quand attachment est fourni
async function replyImageOnly(message, attachment, components = []) {
    return message.reply({
        files: [attachment],
        components,
        allowedMentions: { parse: [] }
    });
}

// Container v2 pour commandes utilitaires / admin / erreurs
async function replyContainer(message, { title, body, footer }) {
    const container = buildContainerV2({ title, body, footer });
    return message.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        allowedMentions: { parse: [] }
    });
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const u = getUser(target.id, target);
    const att = renderWalletPng(u.username, u.cash, u.bank, u.company ? `ENTREPRISE: ${u.company.name}` : 'SANS ENTREPRISE');
    return replyImageOnly(message, att);
}

async function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseBetAmount(args[0], u.cash);
    if (!amt || u.cash < amt) return replyContainer(message, { title: '🏦 DÉPÔT', body: 'Utilisation : `*deposit <montant|all>`' });
    u.cash -= amt;
    u.bank += amt;
    saveData();
    return replyImageOnly(message, renderWalletPng(u.username, u.cash, u.bank, `DEPOT: +${amt} PTS`));
}

async function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseBetAmount(args[0], u.bank);
    if (!amt || u.bank < amt) return replyContainer(message, { title: '🏦 RETRAIT', body: 'Utilisation : `*withdraw <montant|all>`' });
    u.bank -= amt;
    u.cash += amt;
    saveData();
    return replyImageOnly(message, renderWalletPng(u.username, u.cash, u.bank, `RETRAIT: +${amt} PTS`));
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.work < cd) {
        return replyContainer(message, { title: '💼 TRAVAIL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    }
    u.cooldowns.work = now;
    const gain = Math.floor(Math.random() * 900) + 450;
    u.cash += gain;
    saveData();
    return replyImageOnly(message, renderSmallGamePng('WORK', u.username, `SALAIRE: +${gain} PTS`, `CASH ACTUEL: ${u.cash} PTS`));
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) {
        return replyContainer(message, { title: '🎁 DAILY', body: `⏳ Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    }
    u.cooldowns.daily = now;
    const gain = 2500;
    u.cash += gain;
    saveData();
    return replyImageOnly(message, renderSmallGamePng('DAILY', u.username, `BONUS: +${gain} PTS`, `CASH ACTUEL: ${u.cash} PTS`));
}

async function handleCrime(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 20 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) {
        return replyContainer(message, { title: '🕵️ CRIME', body: `⏳ Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    }
    u.cooldowns.crime = now;
    const ok = Math.random() < 0.55;
    const amt = ok ? Math.floor(Math.random() * 1400) + 600 : Math.min(u.cash, 700);
    if (ok) u.cash += amt; else u.cash -= amt;
    saveData();
    return replyImageOnly(message, renderSmallGamePng('CRIME', u.username, ok ? `COUP REUSSI: +${amt} PTS` : `AMENDE: -${amt} PTS`, `CASH: ${u.cash} PTS`));
}

async function handleRob(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyContainer(message, { title: '🔫 VOL', body: 'Utilisation : `*rob <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyContainer(message, { title: '🔫 VOL BLOQUÉ', body: '🛡️ Impossible de voler le Super Owner.' });
    }
    const now = Date.now(), cd = 35 * 60 * 1000;
    if (now - atk.cooldowns.rob < cd) {
        return replyContainer(message, { title: '🔫 VOL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - atk.cooldowns.rob))}**.` });
    }
    atk.cooldowns.rob = now;
    const def = getUser(target.id, target);
    if (def.cash < 200) return replyContainer(message, { title: '🔫 VOL', body: '❌ La cible n\'a pas assez de cash.' });
    const ok = Math.random() < 0.45;
    const amt = ok ? Math.min(def.cash, Math.max(200, Math.floor(def.cash * 0.25))) : Math.min(atk.cash, 500);
    if (ok) { def.cash -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, renderSmallGamePng('ROB', atk.username, ok ? `VOLE ${amt} PTS A ${def.username}` : `RATE: -${amt} PTS`, `CASH: ${atk.cash} PTS`));
}

async function handleCompany(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'info').toLowerCase();

    if (sub === 'create') {
        if (u.company) return replyContainer(message, { title: '🏢 ENTREPRISE', body: `Tu as déjà **${u.company.name}**.` });
        const cost = 5000;
        const name = args.slice(1).join(' ').trim() || 'KuzoCorp';
        if (u.cash < cost) return replyContainer(message, { title: '🏢 ENTREPRISE', body: `❌ Coût : **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.company = { name, level: 1, incomePerHour: 600, lastCollect: Date.now() };
        saveData();
        return replyImageOnly(message, renderCompanyPng(u.username, u.company, 0));
    }

    if (!u.company) return replyContainer(message, { title: '🏢 ENTREPRISE', body: 'Utilise `*company create <nom>` (5 000 🪙).' });
    const pending = Math.floor(Math.min(24, (Date.now() - (u.company.lastCollect || Date.now())) / 3600000) * u.company.incomePerHour);

    if (sub === 'collect') {
        u.company.lastCollect = Date.now();
        u.cash += pending;
        saveData();
        return replyImageOnly(message, renderCompanyPng(u.username, u.company, 0));
    }

    if (sub === 'upgrade') {
        const upCost = u.company.level * 4000;
        if (u.cash < upCost) return replyContainer(message, { title: '🏢 UPGRADE', body: `❌ Il faut **${formatMoney(upCost)}**.` });
        u.cash += pending - upCost;
        u.company.level += 1;
        u.company.incomePerHour += 550;
        u.company.lastCollect = Date.now();
        saveData();
        return replyImageOnly(message, renderCompanyPng(u.username, u.company, 0));
    }

    return replyImageOnly(message, renderCompanyPng(u.username, u.company, pending));
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'KZO').toLowerCase();

    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase();
        const amt = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0) return replyContainer(message, { title: '📈 CRYPTO', body: 'Utilisation : `*crypto buy <BTC|ETH|KZO|SOL> <qté>`' });
        const cost = Math.ceil(amt * c.price);
        if (u.cash < cost) return replyContainer(message, { title: '📈 CRYPTO', body: `❌ Il faut **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.crypto[sym] = (u.crypto[sym] || 0) + amt;
        saveData();
        return replyImageOnly(message, renderCryptoPng(sym, c.name, c.price, c.history, u.crypto[sym]));
    }

    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amt = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0 || (u.crypto[sym] || 0) < amount) {
            return replyContainer(message, { title: '📉 CRYPTO', body: 'Utilisation : `*crypto sell <BTC|ETH|KZO|SOL> <qté>`' });
        }
        const gain = Math.floor(amt * c.price);
        u.crypto[sym] -= amt;
        u.cash += gain;
        saveData();
        return replyImageOnly(message, renderCryptoPng(sym, c.name, c.price, c.history, u.crypto[sym]));
    }

    const sym = db.cryptos[sub.toUpperCase()] ? sub.toUpperCase() : 'KZO';
    const c = db.cryptos[sym];
    return replyImageOnly(message, renderCryptoPng(sym, c.name, c.price, c.history, u.crypto[sym] || 0));
}

async function handleHack(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyContainer(message, { title: '💻 HACK', body: 'Utilisation : `*hack <@membre>`' });
    }
    if (isSuperOwner(target)) return replyContainer(message, { title: '💻 HACK BLOQUÉ', body: '🛡️ Impossible de hacker le Super Owner.' });
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - atk.cooldowns.hack < cd) {
        return replyContainer(message, { title: '💻 HACK', body: `⏳ Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.hack))}**.` });
    }
    atk.cooldowns.hack = now;
    const def = getUser(target.id, target);
    const ok = Math.random() < 0.48 && def.cash >= 200;
    const amt = ok ? Math.min(def.cash, Math.max(250, Math.floor(def.cash * 0.2))) : Math.min(atk.cash, 450);
    if (ok) { def.cash -= amt; atk.cash += amt; atk.stats.hacksSuccess += 1; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, renderHackPng(atk.username, def.username, ok, amt));
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
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🃏 BLACKJACK', body: 'Utilisation : `*blackjack <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet; saveData();

    const pCards = [drawCard(), drawCard()];
    const dCards = [drawCard(), drawCard()];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
    );
    const att = renderBlackjackPng(u.username, bet, pCards, handValue(pCards), [dCards[0], '??'], '?', 'EN COURS');
    const sent = await replyImageOnly(message, att, [row]);
    activeBlackjacks.set(sent.id, { userId: message.author.id, bet, pCards, dCards });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id, message.author);
    const ch = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    const valid = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];
    if (!valid.includes(ch) || !bet || u.cash < bet) return replyContainer(message, { title: '🎡 ROULETTE', body: 'Utilisation : `*roulette <rouge|noir|vert|pair|impair> <mise|all>`' });

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
    return replyImageOnly(message, renderRoulettePng(u.username, num, color, bet, win > 0 ? `GAGNE: +${win} PTS` : `PERDU: -${bet} PTS`));
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎰 SLOTS', body: 'Utilisation : `*slots <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'];
    const r = [0,1,2].map(() => syms[Math.floor(Math.random() * syms.length)]);
    const mult = (r[0] === r[1] && r[1] === r[2]) ? (r[0] === '💎' ? 10 : 5) : ((r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? 1.5 : 0);
    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, renderSlotsPng(u.username, r, bet, win > 0 ? `GAIN: +${win} PTS` : `PERTE: -${bet} PTS`));
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id, message.author);
    const side = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet || u.cash < bet) return replyContainer(message, { title: '🪙 COINFLIP', body: 'Utilisation : `*coinflip <pile|face> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const out = Math.random() < 0.5 ? 'pile' : 'face';
    const won = out === side;
    if (won) { u.cash += bet * 2; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, renderSmallGamePng('COINFLIP', u.username, `PIECE: ${out.toUpperCase()}`, won ? `GAGNE: +${bet * 2} PTS` : `PERDU: -${bet} PTS`));
}

async function handleDice(message, args) {
    const u = getUser(message.author.id, message.author);
    const guess = parseInt(args[0], 10);
    const bet = parseBetAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet || u.cash < bet) return replyContainer(message, { title: '🎲 DICE', body: 'Utilisation : `*dice <1-6> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = roll === guess;
    if (won) { u.cash += bet * 5; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, renderSmallGamePng('DICE', u.username, `DE: ${roll} (CHOIX ${guess})`, won ? `GAGNE: +${bet * 5} PTS` : `PERDU: -${bet} PTS`));
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🚀 CRASH', body: 'Utilisation : `*crash <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.8).toFixed(2));
    const targetMult = Number((1.1 + Math.random() * 1.9).toFixed(2));
    const won = crashAt >= targetMult;
    const pay = won ? Math.floor(bet * targetMult) : 0;
    if (won) { u.cash += pay; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, renderSmallGamePng('CRASH', u.username, `X${targetMult} VS CRASH X${crashAt}`, won ? `ENCAISSE: +${pay} PTS` : `CRASH: -${bet} PTS`));
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const game = activeBlackjacks.get(interaction.message.id);
    if (!game || interaction.user.id !== game.userId) return;
    const u = getUser(game.userId, interaction.user);
    let finished = false, status = 'EN COURS';

    if (interaction.customId === 'bj_hit') {
        game.pCards.push(drawCard());
        const pv = handValue(game.pCards);
        if (pv > 21) { finished = true; u.stats.losses += 1; status = `BUST (${pv}) -${game.bet}`; }
        else if (pv === 21) {
            finished = true;
            while (handValue(game.dCards) < 17) game.dCards.push(drawCard());
            const dv = handValue(game.dCards);
            if (dv === 21) { u.cash += game.bet; status = 'EGALITE 21'; }
            else { u.cash += game.bet * 2; u.stats.wins += 1; status = `21 WIN +${game.bet * 2}`; }
        }
    } else if (interaction.customId === 'bj_stand') {
        finished = true;
        while (handValue(game.dCards) < 17) game.dCards.push(drawCard());
        const pv = handValue(game.pCards), dv = handValue(game.dCards);
        if (dv > 21 || pv > dv) { u.cash += game.bet * 2; u.stats.wins += 1; status = `WIN ${pv} VS ${dv}`; }
        else if (pv === dv) { u.cash += game.bet; status = `EGALITE ${pv} VS ${dv}`; }
        else { u.stats.losses += 1; status = `PERDU ${pv} VS ${dv}`; }
    }
    saveData();
    if (finished) activeBlackjacks.delete(interaction.message.id);
    const att = renderBlackjackPng(u.username, game.bet, game.pCards, handValue(game.pCards), finished ? game.dCards : [game.dCards[0], '??'], finished ? handValue(game.dCards) : '?', status);
    await interaction.update({ files: [att], components: finished ? [] : interaction.message.components }).catch(() => {});
});

client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    getUser(message.author.id, message.author);
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = (args.shift() || '').toLowerCase();

    if (cmd === 'reseteconomy') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)) };
        saveData();
        return replyContainer(message, { title: '♻️ RESET OK', body: 'Économie réinitialisée.' });
    }
    if (cmd === 'setmoney') {
        if (!isSuperOwner(message.author)) return replyContainer(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        const target = message.mentions.users.first();
        const amt = parseInt(args[1], 10);
        if (!target || isNaN(amt) || amt < 0) return replyContainer(message, { title: '💰 SETMONEY', body: 'Utilisation : `*setmoney <@membre> <montant>`' });
        const u = getUser(target.id, target);
        u.cash = amt; saveData();
        return replyContainer(message, { title: '💰 SETMONEY', body: `Cash de **${u.username}** : **${formatMoney(amt)}**.` });
    }
    if (cmd === 'pay') {
        const s = getUser(message.author.id, message.author);
        const t = message.mentions.users.first();
        const amt = parseBetAmount(args[1], s.cash);
        if (!t || t.bot || t.id === message.author.id || !amt || s.cash < amt) return replyContainer(message, { title: '💸 PAY', body: 'Utilisation : `*pay <@membre> <montant|all>`' });
        const r = getUser(t.id, t);
        s.cash -= amt; r.cash += amt; saveData();
        return replyContainer(message, { title: '💸 PAY', body: `Envoyé **${formatMoney(amt)}** à **${r.username}**.` });
    }
    if (cmd === 'help') {
        return replyContainer(message, {
            title: '💠 KUZO CASINO • AIDE',
            body: [
                '**Économie :** `*balance` • `*deposit <all|n>` • `*withdraw <all|n>` • `*work` • `*daily` • `*crime` • `*rob <@m>` • `*pay <@m> <all|n>`',
                '**Gamble (`all` OK) :** `*bj <all|n>` • `*roulette <rouge|noir|vert|pair|impair> <all|n>` • `*slots <all|n>` • `*coinflip <pile|face> <all|n>` • `*dice <1-6> <all|n>` • `*crash <all|n>`',
                '**Business / Crypto / Hack :** `*company [create|collect|upgrade]` • `*crypto [SYM|buy|sell]` • `*hack <@m>` • `*lb`',
                '**Owner :** `*reseteconomy` • `*setmoney <@m> <n>`'
            ].join('\n')
        });
    }

    if (cmd === 'balance' || cmd === 'bal') return handleBalance(message);
    if (cmd === 'deposit' || cmd === 'dep') return handleDeposit(message, args);
    if (cmd === 'withdraw' || cmd === 'with') return handleWithdraw(message, args);
    if (cmd === 'work') return handleWork(message);
    if (cmd === 'daily') return handleDaily(message);
    if (cmd === 'crime') return handleCrime(message);
    if (cmd === 'rob') return handleRob(message);
    if (cmd === 'blackjack' || cmd === 'bj') return handleBlackjack(message, args);
    if (cmd === 'roulette' || cmd === 'rl') return handleRoulette(message, args);
    if (cmd === 'slots' || cmd === 'slot') return handleSlots(message, args);
    if (cmd === 'coinflip' || cmd === 'cf') return handleCoinflip(message, args);
    if (cmd === 'dice') return handleDice(message, args);
    if (cmd === 'crash') return handleCrash(message, args);
    if (cmd === 'company' || cmd === 'entreprise') return handleCompany(message, args);
    if (cmd === 'crypto' || cmd === 'bourse') return handleCrypto(message, args);
    if (cmd === 'hack') return handleHack(message);
    if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
        const entries = Object.entries(db.users)
            .map(([id, u]) => ({ name: u.username || `Joueur_${id.slice(-4)}`, total: (u.cash || 0) + (u.bank || 0) }))
            .sort((a, b) => b.total - a.total);
        return replyImageOnly(message, renderLeaderboardPng(entries));
    }
});

client.on('ready', () => console.log(`Kuzo Casino prêt : ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
