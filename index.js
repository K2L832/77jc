// Build Revision: Kuzo-Casino-v4.0-Smooth (Prefix: *)
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
    res.end('Kuzo Casino v4.0 Active!\n');
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

// --- Police lissée 5x7 avec adoucissement des bords (anti-aliasing léger) ---
const GLYPHS = {
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

function cleanLabel(s) {
    return String(s || '')
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

class SmoothKuzoCanvas {
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

    // Rectangle à coins arrondis avec bord lissé
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

                const dist = Math.hypot(px - cx, py - cy);
                if (dist <= maxR) {
                    const edge = maxR - dist;
                    const alpha = edge < 1.2 ? a * Math.max(0, edge / 1.2) : a;
                    this.px(px, py, r, g, b, alpha);
                }
            }
        }
    }

    // Contour arrondi propre
    roundBorder(x, y, w, h, rad, thickness, r, g, b, a = 255) {
        const maxR = Math.min(rad, w / 2, h / 2);
        const innerR = Math.max(0, maxR - thickness);
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

                const inX = px >= x + thickness && px <= x + w - thickness;
                const inY = py >= y + thickness && py <= y + h - thickness;
                let icx = px;
                if (px < x + thickness + innerR) icx = x + thickness + innerR;
                else if (px > x + w - thickness - innerR) icx = x + w - thickness - innerR;
                let icy = py;
                if (py < y + thickness + innerR) icy = y + thickness + innerR;
                else if (py > y + h - thickness - innerR) icy = y + h - thickness - innerR;
                const id = (inX && inY) ? Math.hypot(px - icx, py - icy) : 999;

                if (od <= maxR + 0.6 && id >= innerR - 0.6) {
                    const outFade = Math.min(1, Math.max(0, (maxR + 0.6 - od) / 1.2));
                    const inFade = (inX && inY) ? Math.min(1, Math.max(0, (id - (innerR - 0.6)) / 1.2)) : 1;
                    this.px(px, py, r, g, b, a * Math.min(outFade, inFade));
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
                    const fade = Math.min(1, Math.max(0, (rad + 0.7 - d) / 1.4));
                    this.px(px, py, r, g, b, a * fade);
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

    // Texte adouci avec léger halo doux autour des traits
    text(str, x, y, scale, r, g, b, a = 255) {
        const clean = cleanLabel(str);
        const adv = 6 * scale;
        for (let i = 0; i < clean.length; i++) {
            const glyph = GLYPHS[clean[i]] || GLYPHS[' '];
            const gx = x + i * adv;
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 5; col++) {
                    if (glyph[row][col] === '1') {
                        const px = gx + col * scale;
                        const py = y + row * scale;
                        // Halo doux 1px autour pour lisser les escaliers
                        this.roundRect(px - 1, py - 1, scale + 2, scale + 2, 1.5, r, g, b, Math.round(a * 0.22));
                        this.roundRect(px, py, scale, scale, 1.2, r, g, b, a);
                    }
                }
            }
        }
    }

    blueFrame(accentRgb = [56, 189, 248]) {
        const [ar, ag, ab] = accentRgb;
        for (let y = 0; y < this.h; y++) {
            const ty = y / this.h;
            for (let x = 0; x < this.w; x++) {
                const tx = x / this.w;
                let r = Math.round(6 + tx * 14 + ty * 8);
                let g = Math.round(22 + tx * 52 + ty * 34);
                let b = Math.round(64 + tx * 98 + ty * 48);

                const d1 = Math.hypot((x - this.w * 0.85) / (this.w * 0.45), (y - this.h * 0.16) / (this.h * 0.55));
                if (d1 < 1) {
                    const f = (1 - d1) * 0.35;
                    r = Math.min(255, Math.round(r + ar * f));
                    g = Math.min(255, Math.round(g + ag * f));
                    b = Math.min(255, Math.round(b + ab * f));
                }
                this.px(x, y, r, g, b, 255);
            }
        }

        // Cadre principal bien arrondi + badge Kuzo Casino en haut à gauche
        this.roundRect(14, 14, this.w - 28, this.h - 28, 24, 10, 32, 76, 185);
        this.roundBorder(14, 14, this.w - 28, this.h - 28, 24, 3, ar, ag, ab, 225);
        this.roundRect(30, 24, 174, 28, 12, ar, ag, ab, 55);
        this.roundBorder(30, 24, 174, 28, 12, 1.5, ar, ag, ab, 210);
        this.text('KUZO CASINO', 42, 32, 2, 240, 249, 255, 255);
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
    const c = new SmoothKuzoCanvas(740, 295);
    c.blueFrame([56, 189, 248]);
    c.text(username, 222, 32, 2, 186, 230, 253, 255);
    c.text('PORTEFEUILLE & BANQUE', 32, 66, 3, 255, 255, 255, 255);

    const panels = [
        { title: 'CASH', val: `${Math.floor(cash).toLocaleString('fr-FR')} PTS`, col: [52, 211, 153] },
        { title: 'BANQUE', val: `${Math.floor(bank).toLocaleString('fr-FR')} PTS`, col: [96, 165, 250] },
        { title: 'TOTAL', val: `${Math.floor(cash + bank).toLocaleString('fr-FR')} PTS`, col: [34, 211, 238] }
    ];

    panels.forEach((p, i) => {
        const px = 32 + i * 228;
        const py = 112;
        c.roundRect(px, py, 212, 118, 18, 8, 28, 68, 220);
        c.roundBorder(px, py, 212, 118, 18, 2.5, p.col[0], p.col[1], p.col[2], 235);
        c.roundRect(px + 14, py + 96, 184, 8, 4, p.col[0], p.col[1], p.col[2], 210);
        c.text(p.title, px + 16, py + 18, 2, p.col[0], p.col[1], p.col[2], 255);
        c.text(p.val, px + 16, py + 52, 2, 255, 255, 255, 255);
    });

    c.text(extra || 'KUZO BANK', 32, 248, 2, 186, 230, 253, 255);
    return c.toAttachment('kuzo-wallet.png');
}

function renderBlackjackPng(username, bet, pCards, pVal, dCards, dVal, statusText) {
    const c = new SmoothKuzoCanvas(740, 310);
    c.blueFrame([56, 189, 248]);
    c.text(`${username} - MISE ${bet.toLocaleString('fr-FR')}`, 222, 32, 2, 186, 230, 253, 255);
    c.text('BLACKJACK TABLE', 32, 66, 3, 255, 255, 255, 255);

    c.text(`TOI (${pVal})`, 32, 112, 2, 52, 211, 153, 255);
    pCards.slice(0, 5).forEach((card, i) => {
        const cx = 32 + i * 74;
        c.roundRect(cx, 134, 62, 86, 12, 240, 249, 255, 255);
        c.roundBorder(cx, 134, 62, 86, 12, 2.5, 56, 189, 248, 255);
        c.text(card, cx + 10, 168, 2, 10, 32, 72, 255);
    });

    c.text(`CROUPIER (${dVal})`, 436, 112, 2, 251, 191, 36, 255);
    dCards.slice(0, 4).forEach((card, i) => {
        const cx = 436 + i * 68;
        c.roundRect(cx, 134, 58, 86, 12, 16, 48, 102, 255);
        c.roundBorder(cx, 134, 58, 86, 12, 2.5, 251, 191, 36, 240);
        c.text(card, cx + 9, 168, 2, 254, 243, 199, 255);
    });

    c.roundRect(32, 242, 676, 36, 12, 8, 28, 68, 220);
    c.text(statusText, 46, 252, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-blackjack.png');
}

function renderRoulettePng(username, num, color, bet, statusText) {
    const accent = color === 'rouge' ? [248, 113, 113] : color === 'vert' ? [52, 211, 153] : [96, 165, 250];
    const c = new SmoothKuzoCanvas(740, 295);
    c.blueFrame(accent);
    c.text(username, 222, 32, 2, 186, 230, 253, 255);
    c.text(`ROULETTE - ${num} (${color.toUpperCase()})`, 32, 66, 3, 255, 255, 255, 255);

    c.circle(132, 174, 70, accent[0], accent[1], accent[2], 235);
    c.circle(132, 174, 54, 8, 26, 62, 255);
    c.text(`${num}`, 114, 162, 3, 255, 255, 255, 255);

    c.roundRect(236, 112, 470, 124, 18, 8, 28, 68, 220);
    c.roundBorder(236, 112, 470, 124, 18, 2.5, accent[0], accent[1], accent[2], 230);
    c.text(`MISE: ${bet.toLocaleString('fr-FR')} PTS`, 256, 134, 2, 186, 230, 253, 255);
    c.text(statusText, 256, 176, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-roulette.png');
}

function renderSlotsPng(username, reels, bet, statusText) {
    const c = new SmoothKuzoCanvas(740, 295);
    c.blueFrame([167, 139, 250]);
    c.text(username, 222, 32, 2, 186, 230, 253, 255);
    c.text(`SLOTS - MISE ${bet.toLocaleString('fr-FR')}`, 32, 66, 3, 255, 255, 255, 255);

    const mapLabel = { '💎': 'GEM', '💠': 'BLU', '🪙': 'COI', '⚡': 'ZAP', '🔥': 'HOT' };
    const colors = [[56, 189, 248], [52, 211, 153], [251, 191, 36]];

    reels.forEach((sym, i) => {
        const rx = 56 + i * 218;
        const col = colors[i % colors.length];
        c.roundRect(rx, 110, 192, 112, 18, 8, 28, 68, 230);
        c.roundBorder(rx, 110, 192, 112, 18, 2.5, col[0], col[1], col[2], 240);
        c.text(mapLabel[sym] || 'WIN', rx + 58, 152, 3, 255, 255, 255, 255);
    });

    c.text(statusText, 32, 246, 2, 224, 242, 254, 255);
    return c.toAttachment('kuzo-slots.png');
}
function renderActionCardPng(badge, username, headline, subline, accentRgb = [56, 189, 248]) {
    const c = new SmoothKuzoCanvas(740, 265);
    c.blueFrame(accentRgb);
    c.text(`${badge} - ${username}`, 222, 32, 2, 186, 230, 253, 255);
    c.text(headline, 32, 68, 3, 255, 255, 255, 255);

    c.roundRect(32, 116, 676, 102, 18, 8, 28, 68, 220);
    c.roundBorder(32, 116, 676, 102, 18, 2.5, accentRgb[0], accentRgb[1], accentRgb[2], 235);
    c.text(subline, 52, 154, 2, 224, 242, 254, 255);
    return c.toAttachment('kuzo-action.png');
}

function renderCompanyPng(username, comp, pending) {
    const c = new SmoothKuzoCanvas(740, 310);
    c.blueFrame([52, 211, 153]);
    c.text(username, 222, 32, 2, 186, 230, 253, 255);
    c.text(`${comp.name} (NIV.${comp.level})`, 32, 66, 3, 255, 255, 255, 255);

    c.roundRect(28, 232, 684, 5, 2, 52, 211, 153, 220);
    const count = Math.min(5, Math.max(1, comp.level));
    const slotW = 640 / count;
    for (let i = 0; i < count; i++) {
        const bw = Math.min(96, Math.floor(slotW * 0.72));
        const bx = Math.round(50 + i * slotW + (slotW - bw) / 2);
        const bh = Math.round(56 + ((i + comp.level) % 4) * 18);
        const by = 232 - bh;
        c.roundRect(bx, by, bw, bh, 12, 12, 46, 98, 240);
        c.roundBorder(bx, by, bw, bh, 12, 2, 56, 189, 248, 255);
        for (let wy = by + 10; wy < 218; wy += 16) {
            for (let wx = bx + 10; wx < bx + bw - 14; wx += 18) {
                c.roundRect(wx, wy, 8, 7, 2, 186, 230, 253, 225);
            }
        }
    }

    c.text(`${comp.incomePerHour}/H  |  A RECOLTER: ${pending} PTS`, 32, 252, 2, 224, 242, 254, 255);
    return c.toAttachment('kuzo-company.png');
}

function renderCryptoPng(symbol, name, price, history, userQty) {
    const c = new SmoothKuzoCanvas(740, 310);
    c.blueFrame([34, 211, 238]);
    c.text(`${symbol} - ${name}`, 222, 32, 2, 186, 230, 253, 255);
    c.text(`COURS: ${price.toLocaleString('fr-FR')} PTS`, 32, 66, 3, 255, 255, 255, 255);

    const gx = 32, gy = 108, gw = 676, gh = 142;
    c.roundRect(gx, gy, gw, gh, 16, 6, 22, 54, 235);
    c.roundBorder(gx, gy, gw, gh, 16, 2, 34, 211, 238, 210);

    const vals = history.length > 1 ? history : [price, price];
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const span = Math.max(1, maxV - minV);
    const pts = vals.map((v, i) => ({
        x: gx + 20 + (i / (vals.length - 1)) * (gw - 40),
        y: gy + gh - 20 - ((v - minV) / span) * (gh - 40)
    }));

    for (let i = 0; i < pts.length - 1; i++) {
        c.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 4, 34, 211, 238, 255);
    }
    for (const p of pts) {
        c.circle(p.x, p.y, 5, 224, 242, 254, 255);
    }

    c.text(`SOLDE: ${userQty} ${symbol}  |  MIN: ${minV}  MAX: ${maxV}`, 32, 266, 2, 186, 230, 253, 255);
    return c.toAttachment('kuzo-crypto.png');
}

function renderHackPng(attackerName, targetName, ok, amount) {
    const col = ok ? [52, 211, 153] : [248, 113, 113];
    const c = new SmoothKuzoCanvas(740, 280);
    c.blueFrame(col);
    c.text(`HACK - ${attackerName}`, 222, 32, 2, 186, 230, 253, 255);
    c.text(ok ? `BREACH REUSSIE +${amount}` : `TRACE DETECTEE -${amount}`, 32, 66, 3, 255, 255, 255, 255);

    c.roundRect(32, 114, 676, 122, 18, 8, 28, 68, 230);
    c.roundBorder(32, 114, 676, 122, 18, 2.5, col[0], col[1], col[2], 240);
    c.text(`CIBLE: ${targetName}`, 52, 138, 2, 186, 230, 253, 255);
    c.text(ok ? `BUTIN VOLE: ${amount} PTS` : `PENALITE: -${amount} PTS`, 52, 182, 2, 255, 255, 255, 255);
    return c.toAttachment('kuzo-hack.png');
}

function renderLeaderboardPng(entries) {
    const c = new SmoothKuzoCanvas(740, 330);
    c.blueFrame([251, 191, 36]);
    c.text('TOP FORTUNES', 222, 32, 2, 254, 243, 199, 255);
    c.text('CLASSEMENT KUZO', 32, 66, 3, 255, 255, 255, 255);

    const top = entries.slice(0, 5);
    const medals = [[251, 191, 36], [186, 230, 253], [251, 146, 60], [96, 165, 250], [52, 211, 153]];
    if (top.length === 0) {
        c.text('AUCUN JOUEUR', 32, 130, 2, 186, 230, 253, 255);
    } else {
        top.forEach((e, idx) => {
            const y = 110 + idx * 38;
            const col = medals[idx] || [186, 230, 253];
            c.roundRect(32, y - 4, 676, 30, 10, 8, 28, 68, 190);
            c.text(`#${idx + 1} ${e.name} - ${Math.floor(e.total).toLocaleString('fr-FR')} PTS`, 46, y + 4, 2, col[0], col[1], col[2], 255);
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
            title: '💠 KUZO CASINO • ÉCONOMIE & BANQUE',
            body: [
                '💳 `*balance [@membre]` — Carte cash, banque & total',
                '🏦 `*deposit <montant|all>` — Déposer en banque',
                '🏧 `*withdraw <montant|all>` — Retirer en cash',
                '💼 `*work` • 🎁 `*daily` • 🕵️ `*crime` • 🔫 `*rob <@membre>`',
                '💸 `*pay <@membre> <montant|all>` — Envoyer des coins'
            ].join('\n')
        };
    }
    if (tab === 'gamble') {
        return {
            title: '🎰 KUZO CASINO • JEUX GAMBLE (`all` OK)',
            body: [
                '🃏 `*blackjack <mise|all>` (`*bj`) — Table interactive',
                '🎡 `*roulette <rouge|noir|vert|pair|impair> <mise|all>` (`*rl`)',
                '🎰 `*slots <mise|all>` (`*slot`) — 3 rouleaux multiplicateurs',
                '🪙 `*coinflip <pile|face> <mise|all>` (`*cf`) — x2',
                '🎲 `*dice <1-6> <mise|all>` — Jackpot x5',
                '🚀 `*crash <mise|all>` — Multiplicateur & crash'
            ].join('\n')
        };
    }
    if (tab === 'biz') {
        return {
            title: '🏢 KUZO CASINO • ENTREPRISE, CRYPTO & HACK',
            body: [
                '🏢 `*company [create <nom>|collect|upgrade]` — Bâtiments & revenus/h',
                '📈 `*crypto [SYM|buy <SYM> <qté>|sell <SYM> <qté>]` — Graphique live',
                '💻 `*hack <@membre>` — Intrusion & vol de cash',
                '🏆 `*leaderboard` (`*lb`) — Classement des pseudos'
            ].join('\n')
        };
    }
    if (tab === 'owner') {
        return {
            title: '👑 KUZO CASINO • SUPER OWNER',
            body: [
                '♻️ `*reseteconomy` — Réinitialiser toute l\'économie',
                '💰 `*setmoney <@membre> <montant>` — Définir le cash d\'un joueur'
            ].join('\n')
        };
    }
    return {
        title: '💠 KUZO CASINO • MENU PRINCIPAL',
        body: [
            '✨ Clique sur les boutons ci-dessous pour naviguer par catégorie :',
            '',
            '💰 **Économie** : `*balance` • `*deposit` • `*withdraw` • `*work` • `*daily` • `*crime` • `*rob` • `*pay`',
            '🎰 **Gamble (`all` OK)** : `*bj` • `*roulette` • `*slots` • `*coinflip` • `*dice` • `*crash`',
            '🏢 **Business / Crypto / Hack** : `*company` • `*crypto` • `*hack` • `*lb`',
            '👑 **Owner** : `*reseteconomy` • `*setmoney`'
        ].join('\n')
    };
}

function helpButtons(activeTab = 'all') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_eco').setLabel('Économie').setStyle(activeTab === 'eco' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_gamble').setLabel('Gamble').setStyle(activeTab === 'gamble' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_biz').setLabel('Business & Crypto').setStyle(activeTab === 'biz' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_owner').setLabel('Owner').setStyle(activeTab === 'owner' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const u = getUser(target.id, target);
    const extra = u.company ? `ENTREPRISE: ${u.company.name} (NIV.${u.company.level})` : 'AUCUNE ENTREPRISE';
    return replyImageOnly(message, renderWalletPng(u.username, u.cash, u.bank, extra));
}

async function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseBetAmount(args[0], u.cash);
    if (!amt || u.cash < amt) return replyContainer(message, { title: '🏦 DÉPÔT', body: 'Utilisation : `*deposit <montant|all>`' });
    u.cash -= amt; u.bank += amt; saveData();
    return replyImageOnly(message, renderWalletPng(u.username, u.cash, u.bank, `DEPOT BANQUE: +${amt} PTS`));
}

async function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseBetAmount(args[0], u.bank);
    if (!amt || u.bank < amt) return replyContainer(message, { title: '🏧 RETRAIT', body: 'Utilisation : `*withdraw <montant|all>`' });
    u.bank -= amt; u.cash += amt; saveData();
    return replyImageOnly(message, renderWalletPng(u.username, u.cash, u.bank, `RETRAIT CASH: +${amt} PTS`));
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.work < cd) {
        return replyContainer(message, { title: '💼 TRAVAIL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    }
    u.cooldowns.work = now;
    const gain = Math.floor(Math.random() * 900) + 450;
    u.cash += gain; saveData();
    return replyImageOnly(message, renderActionCardPng('WORK', u.username, `SALAIRE: +${gain} PTS`, `CASH ACTUEL: ${u.cash.toLocaleString('fr-FR')} PTS`, [52, 211, 153]));
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) {
        return replyContainer(message, { title: '🎁 DAILY', body: `⏳ Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    }
    u.cooldowns.daily = now;
    const gain = 2500;
    u.cash += gain; saveData();
    return replyImageOnly(message, renderActionCardPng('DAILY', u.username, `BONUS: +${gain} PTS`, `CASH ACTUEL: ${u.cash.toLocaleString('fr-FR')} PTS`, [251, 191, 36]));
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
    return replyImageOnly(message, renderActionCardPng('CRIME', u.username, ok ? `COUP REUSSI +${amt}` : `AMENDE -${amt}`, `CASH: ${u.cash.toLocaleString('fr-FR')} PTS`, ok ? [52, 211, 153] : [248, 113, 113]));
}

async function handleRob(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyContainer(message, { title: '🔫 VOL', body: 'Utilisation : `*rob <@membre>`' });
    }
    if (isSuperOwner(target)) return replyContainer(message, { title: '🔫 VOL BLOQUÉ', body: '🛡️ Impossible de voler le Super Owner.' });
    const now = Date.now(), cd = 35 * 60 * 1000;
    if (now - atk.cooldowns.rob < cd) {
        return replyContainer(message, { title: '🔫 VOL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - atk.cooldowns.rob))}**.` });
    }
    atk.cooldowns.rob = now;
    const def = getUser(target.id, target);
    if (def.cash < 200) return replyContainer(message, { title: '🔫 VOL', body: '❌ Cible trop pauvre.' });
    const ok = Math.random() < 0.45;
    const amt = ok ? Math.min(def.cash, Math.max(200, Math.floor(def.cash * 0.25))) : Math.min(atk.cash, 500);
    if (ok) { def.cash -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, renderActionCardPng('ROB', atk.username, ok ? `VOLE ${amt} A ${def.username}` : `RATE -${amt}`, `CASH: ${atk.cash.toLocaleString('fr-FR')} PTS`, ok ? [52, 211, 153] : [248, 113, 113]));
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
        u.cash += pending; saveData();
        return replyImageOnly(message, renderCompanyPng(u.username, u.company, 0));
    }

    if (sub === 'upgrade') {
        const upCost = u.company.level * 4000;
        if (u.cash < upCost) return replyContainer(message, { title: '🏢 UPGRADE', body: `❌ Il faut **${formatMoney(upCost)}**.` });
        u.cash += pending - upCost;
        u.company.level += 1;
        u.company.incomePerHour += 550;
        u.company.lastCollect = Date.now(); saveData();
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
        u.crypto[sym] = (u.crypto[sym] || 0) + amt; saveData();
        return replyImageOnly(message, renderCryptoPng(sym, c.name, c.price, c.history, u.crypto[sym]));
    }

    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amt = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amt) || amt <= 0 || (u.crypto[sym] || 0) < amt) {
            return replyContainer(message, { title: '📉 CRYPTO', body: 'Utilisation : `*crypto sell <BTC|ETH|KZO|SOL> <qté>`' });
        }
        const gain = Math.floor(amt * c.price);
        u.crypto[sym] -= amt; u.cash += gain; saveData();
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
    return replyImageOnly(message, renderActionCardPng('COINFLIP', u.username, `PIECE: ${out.toUpperCase()}`, won ? `GAGNE: +${bet * 2} PTS` : `PERDU: -${bet} PTS`, won ? [52, 211, 153] : [248, 113, 113]));
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
    return replyImageOnly(message, renderActionCardPng('DICE', u.username, `DE: ${roll} (CHOIX ${guess})`, won ? `JACKPOT X5: +${bet * 5} PTS` : `PERDU: -${bet} PTS`, won ? [251, 191, 36] : [96, 165, 250]));
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
    return replyImageOnly(message, renderActionCardPng('CRASH', u.username, `X${targetMult} VS CRASH X${crashAt}`, won ? `ENCAISSE: +${pay} PTS` : `CRASH: -${bet} PTS`, won ? [34, 211, 238] : [248, 113, 113]));
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('help_')) {
        const tab = interaction.customId.replace('help_', '');
        const sec = getHelpSection(tab);
        const container = buildContainerV2({ title: sec.title, body: sec.body });
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [container, helpButtons(tab)]
        }).catch(() => {});
    }

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

client.on('ready', () => console.log(`Kuzo Casino v4.0 prêt : ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
