
// Build Revision: Kuzo-Casino-v2.2-Visuals (Prefix: *)
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
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
    res.end('Kuzo Casino Operational v2.2!\n');
}).listen(PORT, '0.0.0.0', () => console.log(`Serveur HTTP Kuzo Casino actif sur le port ${PORT}`));

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

let db = {
    users: {},
    cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS))
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
    if (discordUser) {
        u.username = discordUser.globalName || discordUser.username || u.username;
    }
    if (!u.username) u.username = `Joueur_${userId.slice(-4)}`;
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, KZO: 0, SOL: 0 };
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0 };
    return u;
}

function parseBetAmount(rawArg, maxCash) {
    if (!rawArg) return null;
    if (rawArg.toLowerCase() === 'all') {
        return maxCash > 0 ? Math.floor(maxCash) : null;
    }
    const n = parseInt(rawArg, 10);
    if (isNaN(n) || n <= 0) return null;
    return n;
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

// --- Encodeur PNG pur en Node.js (aucune dépendance externe) ---
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

class BluePngCanvas {
    constructor(width, height) {
        this.w = width;
        this.h = height;
        this.buf = Buffer.alloc(width * height * 4);
    }

    setPixel(x, y, r, g, b, a = 255) {
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
        const idx = (iy * this.w + ix) * 4;
        const alpha = a / 255;
        if (alpha >= 0.999) {
            this.buf[idx] = r;
            this.buf[idx + 1] = g;
            this.buf[idx + 2] = b;
            this.buf[idx + 3] = 255;
        } else {
            const inv = 1 - alpha;
            this.buf[idx] = Math.min(255, Math.round(r * alpha + this.buf[idx] * inv));
            this.buf[idx + 1] = Math.min(255, Math.round(g * alpha + this.buf[idx + 1] * inv));
            this.buf[idx + 2] = Math.min(255, Math.round(b * alpha + this.buf[idx + 2] * inv));
            this.buf[idx + 3] = Math.max(this.buf[idx + 3], a);
        }
    }

    fillBlueTheme() {
        for (let y = 0; y < this.h; y++) {
            const ty = y / this.h;
            for (let x = 0; x < this.w; x++) {
                const tx = x / this.w;
                let r = Math.round(4 + tx * 10 + ty * 6);
                let g = Math.round(18 + tx * 45 + ty * 32);
                let b = Math.round(58 + tx * 92 + ty * 50);

                const dx = (x - this.w * 0.82) / (this.w * 0.42);
                const dy = (y - this.h * 0.18) / (this.h * 0.55);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) {
                    const glow = (1 - dist) * 0.36;
                    r = Math.min(255, Math.round(r + 56 * glow));
                    g = Math.min(255, Math.round(g + 189 * glow));
                    b = Math.min(255, Math.round(b + 248 * glow));
                }

                if (x % 32 === 0 || y % 32 === 0) {
                    r = Math.min(255, r + 8);
                    g = Math.min(255, g + 22);
                    b = Math.min(255, b + 36);
                }

                this.setPixel(x, y, r, g, b, 255);
            }
        }
    }

    fillRect(x, y, w, h, r, g, b, a = 255) {
        const x0 = Math.max(0, Math.floor(x));
        const y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(this.w - 1, Math.floor(x + w));
        const y1 = Math.min(this.h - 1, Math.floor(y + h));
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                this.setPixel(px, py, r, g, b, a);
            }
        }
    }

    drawRectOutline(x, y, w, h, thickness, r, g, b, a = 255) {
        this.fillRect(x, y, w, thickness, r, g, b, a);
        this.fillRect(x, y + h - thickness, w, thickness, r, g, b, a);
        this.fillRect(x, y, thickness, h, r, g, b, a);
        this.fillRect(x + w - thickness, y, thickness, h, r, g, b, a);
    }

    drawLine(x0, y0, x1, y1, thickness, r, g, b, a = 255) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        const half = Math.floor(thickness / 2);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = x0 + (x1 - x0) * t;
            const py = y0 + (y1 - y0) * t;
            this.fillRect(px - half, py - half, thickness, thickness, r, g, b, a);
        }
    }

    encodePng() {
        const stride = this.w * 4;
        const raw = Buffer.alloc((stride + 1) * this.h);
        for (let y = 0; y < this.h; y++) {
            const rowStart = y * (stride + 1);
            raw[rowStart] = 0;
            this.buf.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
        }
        const compressed = zlib.deflateSync(raw, { level: 6 });
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(this.w, 0);
        ihdr.writeUInt32BE(this.h, 4);
        ihdr[8] = 8;
        ihdr[9] = 6;
        ihdr[10] = 0;
        ihdr[11] = 0;
        ihdr[12] = 0;

        const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        return Buffer.concat([
            signature,
            makeChunk('IHDR', ihdr),
            makeChunk('IDAT', compressed),
            makeChunk('IEND', Buffer.alloc(0))
        ]);
    }
}

function createBlueScenePng(ratios = [0.6, 0.4, 0.8]) {
    const c = new BluePngCanvas(640, 200);
    c.fillBlueTheme();
    c.drawRectOutline(12, 12, 616, 176, 3, 56, 189, 248, 220);

    // Sol / ligne d'horizon bleue
    c.fillRect(28, 162, 584, 4, 56, 189, 248, 180);

    ratios.slice(0, 3).forEach((ratio, i) => {
        const bx = 42 + i * 192;
        const clamped = Math.max(0.15, Math.min(1, ratio));
        const bh = Math.round(35 + clamped * 85);
        const by = 162 - bh;
        const bw = 156;

        c.fillRect(bx, by, bw, bh, 12, 42, 96, 230);
        c.drawRectOutline(bx, by, bw, bh, 2, 56, 189, 248, 235);

        // Fenêtres lumineuses
        for (let wy = by + 12; wy < 148; wy += 18) {
            for (let wx = bx + 14; wx < bx + bw - 22; wx += 26) {
                c.fillRect(wx, wy, 12, 8, 125, 211, 252, 210);
            }
        }
    });

    return new AttachmentBuilder(c.encodePng(), { name: 'kuzo-scene.png' });
}

function createCompanyBuildingsPng(level = 1, pendingRatio = 0.4) {
    const c = new BluePngCanvas(640, 220);
    c.fillBlueTheme();
    c.drawRectOutline(12, 12, 616, 196, 3, 56, 189, 248, 220);

    // Sol de la zone d'entreprise
    c.fillRect(26, 184, 588, 5, 56, 189, 248, 200);

    const numBuildings = Math.min(5, Math.max(1, level));
    const spacing = 540 / numBuildings;

    for (let i = 0; i < numBuildings; i++) {
        const bw = Math.min(92, Math.floor(spacing * 0.72));
        const bx = Math.round(50 + i * spacing + (spacing - bw) / 2);
        const hFactor = Math.min(1, 0.42 + ((i + level) % 4) * 0.16 + pendingRatio * 0.15);
        const bh = Math.round(55 + hFactor * 85);
        const by = 184 - bh;

        // Tour / bâtiment bleu cyber
        c.fillRect(bx, by, bw, bh, 10, 38, 90, 235);
        c.drawRectOutline(bx, by, bw, bh, 2, 56, 189, 248, 240);

        // Toit / antenne
        c.fillRect(bx + Math.floor(bw / 2) - 2, by - 14, 4, 14, 125, 211, 252, 255);

        // Grille de fenêtres
        for (let wy = by + 10; wy < 172; wy += 16) {
            for (let wx = bx + 10; wx < bx + bw - 16; wx += 18) {
                c.fillRect(wx, wy, 9, 7, 186, 230, 253, 225);
            }
        }
    }

    return new AttachmentBuilder(c.encodePng(), { name: 'kuzo-company.png' });
}

function createCryptoGraphPng(history = []) {
    const c = new BluePngCanvas(640, 220);
    c.fillBlueTheme();
    c.drawRectOutline(12, 12, 616, 196, 3, 56, 189, 248, 220);

    const gx = 32, gy = 30, gw = 576, gh = 160;
    c.fillRect(gx, gy, gw, gh, 6, 20, 48, 220);
    c.drawRectOutline(gx, gy, gw, gh, 2, 56, 189, 248, 170);

    const vals = history.length > 1 ? history : [100, 110, 105, 120];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(1, maxV - minV);

    const pts = vals.map((v, idx) => ({
        x: gx + 16 + (idx / (vals.length - 1)) * (gw - 32),
        y: gy + gh - 18 - ((v - minV) / span) * (gh - 36)
    }));

    for (let i = 0; i < pts.length - 1; i++) {
        c.drawLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 4, 56, 189, 248, 255);
    }
    for (const p of pts) {
        c.fillRect(p.x - 4, p.y - 4, 8, 8, 224, 242, 254, 255);
    }

    return new AttachmentBuilder(c.encodePng(), { name: 'kuzo-crypto.png' });
}

setInterval(() => {
    for (const sym of Object.keys(db.cryptos)) {
        const c = db.cryptos[sym];
        const delta = (Math.random() * 0.14) - 0.068;
        c.price = Math.max(10, Math.round(c.price * (1 + delta)));
        c.history.push(c.price);
        if (c.history.length > 16) c.history.shift();
    }
    saveData();
}, 120000);
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

// Quand il y a une image : on affiche l'Embed avec l'image directement (remplace le texte) pour qu'elle s'affiche toujours dans le chat
async function replyKuzo(message, { title, body, attachment, footer, components = [], imageOnly = false }) {
    if (attachment) {
        const visualEmbed = new EmbedBuilder()
            .setColor('#0ea5e9')
            .setTitle(title)
            .setImage(`attachment://${attachment.name}`)
            .setFooter({ text: footer || 'Kuzo Casino • Préfixe *' });

        if (!imageOnly && body) {
            visualEmbed.setDescription(body);
        }

        return message.reply({
            embeds: [visualEmbed],
            files: [attachment],
            components,
            allowedMentions: { parse: [] }
        });
    }

    const container = buildContainerV2({ title, body, footer });
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container, ...components],
        allowedMentions: { parse: [] }
    };

    try {
        return await message.reply(payload);
    } catch (e) {
        const embed = new EmbedBuilder()
            .setColor('#0ea5e9')
            .setTitle(title)
            .setDescription(body)
            .setFooter({ text: footer || 'Kuzo Casino • Préfixe *' });
        return message.reply({
            embeds: [embed],
            components,
            allowedMentions: { parse: [] }
        });
    }
}
function drawCard() {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠', '♥', '♦', '♣'];
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
    if (!bet) {
        return replyKuzo(message, { title: '🃏 BLACKJACK', body: 'Utilisation : `*blackjack <mise|all>` ou `*bj <mise|all>`' });
    }
    if (u.cash < bet) {
        return replyKuzo(message, { title: '🃏 BLACKJACK', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });
    }

    u.cash -= bet;
    u.stats.wagered += bet;
    saveData();

    const playerCards = [drawCard(), drawCard()];
    const dealerCards = [drawCard(), drawCard()];
    const pVal = handValue(playerCards);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
    );

    const png = createBlueScenePng([pVal / 21, 0.5, u.cash / Math.max(1, u.cash + bet)]);

    const sent = await replyKuzo(message, {
        title: `🃏 BLACKJACK • Mise ${formatMoney(bet)} • Main ${playerCards.join(' ')} (${pVal}) • Croupier ${dealerCards[0]} [?]`,
        attachment: png,
        imageOnly: true,
        components: [row]
    });

    activeBlackjacks.set(sent.id, { userId: message.author.id, bet, playerCards, dealerCards });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id, message.author);
    const choiceRaw = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    const valid = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];

    if (!valid.includes(choiceRaw) || !bet) {
        return replyKuzo(message, { title: '🎡 ROULETTE', body: 'Utilisation : `*roulette <rouge|noir|vert|pair|impair> <mise|all>`' });
    }
    if (u.cash < bet) {
        return replyKuzo(message, { title: '🎡 ROULETTE', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });
    }

    u.cash -= bet;
    u.stats.wagered += bet;

    const num = Math.floor(Math.random() * 37);
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir');

    const norm = ['rouge', 'red'].includes(choiceRaw) ? 'rouge'
        : ['noir', 'black'].includes(choiceRaw) ? 'noir'
        : ['vert', 'green'].includes(choiceRaw) ? 'vert'
        : ['pair', 'even'].includes(choiceRaw) ? 'pair' : 'impair';

    const parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');

    let mult = 0;
    if (norm === 'vert' && color === 'vert') mult = 14;
    else if (norm === color || norm === parity) mult = 2;

    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const png = createBlueScenePng([num / 36, win > 0 ? 1 : 0.2, u.cash / Math.max(1, u.cash + bet)]);

    return replyKuzo(message, {
        title: `🎡 ROULETTE • ${num} (${color.toUpperCase()}) • ${win > 0 ? `+${formatMoney(win)}` : `-${formatMoney(bet)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet) return replyKuzo(message, { title: '🎰 SLOTS', body: 'Utilisation : `*slots <mise|all>`' });
    if (u.cash < bet) return replyKuzo(message, { title: '🎰 SLOTS', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'];
    const r = [0, 1, 2].map(() => syms[Math.floor(Math.random() * syms.length)]);

    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === '💎' ? 10 : 5;
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;

    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const png = createBlueScenePng([mult / 10, win > 0 ? 0.9 : 0.25, u.cash / Math.max(1, u.cash + bet)]);

    return replyKuzo(message, {
        title: `🎰 SLOTS • [ ${r.join(' | ')} ] • ${win > 0 ? `+${formatMoney(win)}` : `-${formatMoney(bet)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id, message.author);
    const side = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet) {
        return replyKuzo(message, { title: '🪙 COINFLIP', body: 'Utilisation : `*coinflip <pile|face> <mise|all>`' });
    }
    if (u.cash < bet) return replyKuzo(message, { title: '🪙 COINFLIP', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const outcome = Math.random() < 0.5 ? 'pile' : 'face';
    const won = outcome === side;
    if (won) { u.cash += bet * 2; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const png = createBlueScenePng([won ? 1 : 0.25, 0.55, u.cash / Math.max(1, u.cash + bet)]);

    return replyKuzo(message, {
        title: `🪙 COINFLIP • ${outcome.toUpperCase()} • ${won ? `+${formatMoney(bet * 2)}` : `-${formatMoney(bet)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleDice(message, args) {
    const u = getUser(message.author.id, message.author);
    const guess = parseInt(args[0], 10);
    const bet = parseBetAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet) {
        return replyKuzo(message, { title: '🎲 DICE', body: 'Utilisation : `*dice <1-6> <mise|all>`' });
    }
    if (u.cash < bet) return replyKuzo(message, { title: '🎲 DICE', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = roll === guess;
    const win = won ? bet * 5 : 0;
    if (won) { u.cash += win; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const png = createBlueScenePng([roll / 6, won ? 1 : 0.2, u.cash / Math.max(1, u.cash + bet)]);

    return replyKuzo(message, {
        title: `🎲 DICE • Dé ${roll} (Choix ${guess}) • ${won ? `+${formatMoney(win)}` : `-${formatMoney(bet)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet) return replyKuzo(message, { title: '🚀 CRASH', body: 'Utilisation : `*crash <mise|all>`' });
    if (u.cash < bet) return replyKuzo(message, { title: '🚀 CRASH', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.8).toFixed(2));
    const targetMult = Number((1.1 + Math.random() * 1.9).toFixed(2));
    const won = crashAt >= targetMult;
    const payout = won ? Math.floor(bet * targetMult) : 0;

    if (won) { u.cash += payout; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const png = createBlueScenePng([Math.min(1, targetMult / 3), Math.min(1, crashAt / 3), u.cash / Math.max(1, u.cash + bet)]);

    return replyKuzo(message, {
        title: `🚀 CRASH • x${targetMult} (Crash x${crashAt}) • ${won ? `+${formatMoney(payout)}` : `-${formatMoney(bet)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const data = getUser(target.id, target);
    const total = data.cash + data.bank;
    const png = createBlueScenePng([
        data.cash / Math.max(1, total),
        data.bank / Math.max(1, total),
        1
    ]);

    return replyKuzo(message, {
        title: `💳 ${data.username} • Cash ${formatMoney(data.cash)} • Banque ${formatMoney(data.bank)} • Total ${formatMoney(total)}`,
        attachment: png,
        imageOnly: true
    });
}

function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author);
    const amount = parseBetAmount(args[0], u.cash);
    if (!amount || u.cash < amount) {
        return replyKuzo(message, { title: '🏦 DÉPÔT', body: 'Utilisation : `*deposit <montant|all>`' });
    }
    u.cash -= amount;
    u.bank += amount;
    saveData();
    return replyKuzo(message, { title: '🏦 DÉPÔT', body: `Déposé **${formatMoney(amount)}** en banque.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}` });
}

function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author);
    const amount = parseBetAmount(args[0], u.bank);
    if (!amount || u.bank < amount) {
        return replyKuzo(message, { title: '🏦 RETRAIT', body: 'Utilisation : `*withdraw <montant|all>`' });
    }
    u.bank -= amount;
    u.cash += amount;
    saveData();
    return replyKuzo(message, { title: '🏦 RETRAIT', body: `Retiré **${formatMoney(amount)}** en cash.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}` });
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.work < cd) {
        return replyKuzo(message, { title: '💼 TRAVAIL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    }
    u.cooldowns.work = now;
    const gain = Math.floor(Math.random() * 900) + 450;
    u.cash += gain;
    saveData();
    const png = createBlueScenePng([0.75, 0.5, 0.9]);
    return replyKuzo(message, {
        title: `💼 TRAVAIL • +${formatMoney(gain)} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) {
        return replyKuzo(message, { title: '🎁 DAILY', body: `⏳ Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    }
    u.cooldowns.daily = now;
    const gain = 2500;
    u.cash += gain;
    saveData();
    const png = createBlueScenePng([0.9, 0.65, 1]);
    return replyKuzo(message, {
        title: `🎁 DAILY • +${formatMoney(gain)} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleCrime(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 20 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) {
        return replyKuzo(message, { title: '🕵️ CRIME', body: `⏳ Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    }
    u.cooldowns.crime = now;
    const ok = Math.random() < 0.55;
    const amt = ok ? Math.floor(Math.random() * 1400) + 600 : Math.min(u.cash, 700);
    if (ok) u.cash += amt;
    else u.cash -= amt;
    saveData();
    const png = createBlueScenePng([ok ? 0.95 : 0.2, 0.6, ok ? 1 : 0.3]);
    return replyKuzo(message, {
        title: `🕵️ CRIME • ${ok ? `+${formatMoney(amt)}` : `-${formatMoney(amt)}`} • Cash ${formatMoney(u.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleRob(message) {
    const attacker = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyKuzo(message, { title: '🔫 VOL', body: 'Utilisation : `*rob <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyKuzo(message, { title: '🔫 VOL BLOQUÉ', body: '🛡️ Impossible de voler le Super Owner.' });
    }
    const now = Date.now(), cd = 35 * 60 * 1000;
    if (now - attacker.cooldowns.rob < cd) {
        return replyKuzo(message, { title: '🔫 VOL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - attacker.cooldowns.rob))}**.` });
    }
    attacker.cooldowns.rob = now;
    const victim = getUser(target.id, target);
    if (victim.cash < 200) {
        return replyKuzo(message, { title: '🔫 VOL', body: '❌ La cible n\'a pas assez de cash.' });
    }
    const ok = Math.random() < 0.45;
    const amt = ok ? Math.min(victim.cash, Math.max(200, Math.floor(victim.cash * 0.25))) : Math.min(attacker.cash, 500);
    if (ok) {
        victim.cash -= amt;
        attacker.cash += amt;
    } else {
        attacker.cash -= amt;
    }
    saveData();
    const png = createBlueScenePng([ok ? 0.9 : 0.2, 0.5, ok ? 1 : 0.3]);
    return replyKuzo(message, {
        title: `🔫 VOL • ${ok ? `+${formatMoney(amt)} sur ${victim.username}` : `-${formatMoney(amt)}`} • Cash ${formatMoney(attacker.cash)}`,
        attachment: png,
        imageOnly: true
    });
}

function handlePay(message, args) {
    const sender = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    const amount = parseBetAmount(args[1], sender.cash);
    if (!target || target.bot || target.id === message.author.id || !amount || sender.cash < amount) {
        return replyKuzo(message, { title: '💸 PAY', body: 'Utilisation : `*pay <@membre> <montant|all>`' });
    }
    const receiver = getUser(target.id, target);
    sender.cash -= amount;
    receiver.cash += amount;
    saveData();
    return replyKuzo(message, { title: '💸 VIREMENT', body: `Envoyé **${formatMoney(amount)}** à **${receiver.username}**.` });
}

async function handleCompany(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'info').toLowerCase();

    if (sub === 'create') {
        if (u.company) return replyKuzo(message, { title: '🏢 ENTREPRISE', body: `Tu as déjà **${u.company.name}**.` });
        const cost = 5000;
        const name = args.slice(1).join(' ').trim() || 'KuzoCorp';
        if (u.cash < cost) return replyKuzo(message, { title: '🏢 ENTREPRISE', body: `❌ Coût de création : **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.company = { name, level: 1, incomePerHour: 600, lastCollect: Date.now() };
        saveData();
        const png = createCompanyBuildingsPng(1, 0.2);
        return replyKuzo(message, {
            title: `🏢 ${name} • Niv. 1 • 600 🪙/h`,
            attachment: png,
            imageOnly: true
        });
    }

    if (!u.company) {
        return replyKuzo(message, { title: '🏢 ENTREPRISE', body: 'Aucune entreprise. Utilise `*company create <nom>` (5 000 🪙).' });
    }

    const pending = Math.floor(Math.min(24, (Date.now() - (u.company.lastCollect || Date.now())) / 3600000) * u.company.incomePerHour);

    if (sub === 'collect') {
        u.company.lastCollect = Date.now();
        u.cash += pending;
        saveData();
        const png = createCompanyBuildingsPng(u.company.level, 0.1);
        return replyKuzo(message, {
            title: `🏢 ${u.company.name} • Récolté +${formatMoney(pending)} • Cash ${formatMoney(u.cash)}`,
            attachment: png,
            imageOnly: true
        });
    }

    if (sub === 'upgrade') {
        const upCost = u.company.level * 4000;
        if (u.cash < upCost) return replyKuzo(message, { title: '🏢 UPGRADE', body: `❌ Il faut **${formatMoney(upCost)}** en cash.` });
        u.cash += pending - upCost;
        u.company.level += 1;
        u.company.incomePerHour += 550;
        u.company.lastCollect = Date.now();
        saveData();
        const png = createCompanyBuildingsPng(u.company.level, 0.3);
        return replyKuzo(message, {
            title: `🏢 ${u.company.name} • Niv. ${u.company.level} • ${formatMoney(u.company.incomePerHour)}/h`,
            attachment: png,
            imageOnly: true
        });
    }

    const png = createCompanyBuildingsPng(u.company.level, Math.min(1, pending / 3000));
    return replyKuzo(message, {
        title: `🏢 ${u.company.name} • Niv. ${u.company.level} • ${formatMoney(u.company.incomePerHour)}/h • À récolter ${formatMoney(pending)}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id, message.author);
    const sub = (args[0] || 'market').toLowerCase();

    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0) return replyKuzo(message, { title: '📈 CRYPTO', body: 'Utilisation : `*crypto buy <BTC|ETH|KZO|SOL> <qté>`' });
        const cost = Math.ceil(amount * c.price);
        if (u.cash < cost) return replyKuzo(message, { title: '📈 CRYPTO', body: `❌ Il faut **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.crypto[sym] = (u.crypto[sym] || 0) + amount;
        saveData();
        const png = createCryptoGraphPng(c.history);
        return replyKuzo(message, {
            title: `📈 ACHAT ${amount} ${sym} • ${formatMoney(cost)} • Solde ${u.crypto[sym]} ${sym}`,
            attachment: png,
            imageOnly: true
        });
    }

    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0 || (u.crypto[sym] || 0) < amount) {
            return replyKuzo(message, { title: '📉 CRYPTO', body: 'Utilisation : `*crypto sell <BTC|ETH|KZO|SOL> <qté>`' });
        }
        const gain = Math.floor(amount * c.price);
        u.crypto[sym] -= amount;
        u.cash += gain;
        saveData();
        const png = createCryptoGraphPng(c.history);
        return replyKuzo(message, {
            title: `📉 VENTE ${amount} ${sym} • +${formatMoney(gain)} • Cash ${formatMoney(u.cash)}`,
            attachment: png,
            imageOnly: true
        });
    }

    const sym = db.cryptos[sub.toUpperCase()] ? sub.toUpperCase() : 'KZO';
    const c = db.cryptos[sym];
    const png = createCryptoGraphPng(c.history);
    const resume = Object.entries(db.cryptos)
        .map(([k, v]) => `${k}: ${v.price.toLocaleString('fr-FR')} 🪙 (${u.crypto[k] || 0})`)
        .join(' • ');

    return replyKuzo(message, {
        title: `📊 ${sym} ${formatMoney(c.price)} • ${resume}`,
        attachment: png,
        imageOnly: true
    });
}

async function handleHack(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyKuzo(message, { title: '💻 HACK', body: 'Utilisation : `*hack <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyKuzo(message, { title: '💻 HACK BLOQUÉ', body: '🛡️ Impossible de hacker le Super Owner.' });
    }
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - atk.cooldowns.hack < cd) {
        return replyKuzo(message, { title: '💻 HACK', body: `⏳ Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.hack))}**.` });
    }
    atk.cooldowns.hack = now;
    const def = getUser(target.id, target);
    const ok = Math.random() < 0.48 && def.cash >= 200;
    const png = createBlueScenePng([ok ? 0.95 : 0.2, 0.7, ok ? 1 : 0.3]);

    if (ok) {
        const stolen = Math.min(def.cash, Math.max(250, Math.floor(def.cash * 0.2)));
        def.cash -= stolen;
        atk.cash += stolen;
        atk.stats.hacksSuccess += 1;
        saveData();
        return replyKuzo(message, {
            title: `💻 HACK RÉUSSI • +${formatMoney(stolen)} sur ${def.username} • Cash ${formatMoney(atk.cash)}`,
            attachment: png,
            imageOnly: true
        });
    } else {
        const fine = Math.min(atk.cash, 450);
        atk.cash -= fine;
        saveData();
        return replyKuzo(message, {
            title: `🚨 HACK ÉCHOUÉ • -${formatMoney(fine)} • Cash ${formatMoney(atk.cash)}`,
            attachment: png,
            imageOnly: true
        });
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const game = activeBlackjacks.get(interaction.message.id);
    if (!game) return;
    if (interaction.user.id !== game.userId) {
        return interaction.reply({ content: 'Ce blackjack ne t\'appartient pas.', ephemeral: true }).catch(() => {});
    }

    const u = getUser(game.userId, interaction.user);
    let finished = false, status = '';

    if (interaction.customId === 'bj_hit') {
        game.playerCards.push(drawCard());
        const pVal = handValue(game.playerCards);
        if (pVal > 21) {
            finished = true;
            u.stats.losses += 1;
            status = `Bust (${pVal}) • -${formatMoney(game.bet)}`;
        } else if (pVal === 21) {
            finished = true;
            while (handValue(game.dealerCards) < 17) game.dealerCards.push(drawCard());
            const dVal = handValue(game.dealerCards);
            if (dVal === 21) {
                u.cash += game.bet;
                status = `Égalité 21 • Remboursé`;
            } else {
                const win = game.bet * 2;
                u.cash += win;
                u.stats.wins += 1;
                status = `21 Gagnant • +${formatMoney(win)}`;
            }
        }
    } else if (interaction.customId === 'bj_stand') {
        finished = true;
        while (handValue(game.dealerCards) < 17) {
            game.dealerCards.push(drawCard());
        }
        const pVal = handValue(game.playerCards);
        const dVal = handValue(game.dealerCards);
        if (dVal > 21 || pVal > dVal) {
            const win = game.bet * 2;
            u.cash += win;
            u.stats.wins += 1;
            status = `Victoire (${pVal} vs ${dVal}) • +${formatMoney(win)}`;
        } else if (pVal === dVal) {
            u.cash += game.bet;
            status = `Égalité (${pVal} vs ${dVal}) • Remboursé`;
        } else {
            u.stats.losses += 1;
            status = `Perdu (${pVal} vs ${dVal}) • -${formatMoney(game.bet)}`;
        }
    }

    saveData();
    const pVal = handValue(game.playerCards);
    const dVal = handValue(game.dealerCards);
    const png = createBlueScenePng([pVal / 21, dVal / 21, u.cash / Math.max(1, u.cash + game.bet)]);

    const embed = new EmbedBuilder()
        .setColor('#0ea5e9')
        .setTitle(finished
            ? `🃏 BJ FIN • Main ${game.playerCards.join(' ')} (${pVal}) vs Croupier ${game.dealerCards.join(' ')} (${dVal}) • ${status} • Cash ${formatMoney(u.cash)}`
            : `🃏 BJ • Mise ${formatMoney(game.bet)} • Main ${game.playerCards.join(' ')} (${pVal}) • Croupier ${game.dealerCards[0]} [?]`)
        .setImage('attachment://kuzo-scene.png')
        .setFooter({ text: 'Kuzo Casino • Préfixe *' });

    if (finished) activeBlackjacks.delete(interaction.message.id);

    await interaction.update({
        embeds: [embed],
        files: [png],
        components: finished ? [] : [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
            )
        ]
    }).catch(() => {});
});

client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    getUser(message.author.id, message.author);

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = (args.shift() || '').toLowerCase();

    if (command === 'reseteconomy') {
        if (!isSuperOwner(message.author)) {
            return replyKuzo(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        }
        db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)) };
        saveData();
        return replyKuzo(message, { title: '♻️ ÉCONOMIE RESET', body: 'Toute l\'économie a été réinitialisée.' });
    }

    if (command === 'setmoney') {
        if (!isSuperOwner(message.author)) {
            return replyKuzo(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        }
        const target = message.mentions.users.first();
        const amt = parseInt(args[1], 10);
        if (!target || isNaN(amt) || amt < 0) {
            return replyKuzo(message, { title: '💰 SETMONEY', body: 'Utilisation : `*setmoney <@membre> <montant>`' });
        }
        const u = getUser(target.id, target);
        u.cash = amt;
        saveData();
        return replyKuzo(message, { title: '💰 SETMONEY', body: `Cash de **${u.username}** défini sur **${formatMoney(amt)}**.` });
    }

    if (command === 'help') {
        const body = [
            '**💰 Économie**',
            '`*balance [@membre]` • `*deposit <montant|all>` • `*withdraw <montant|all>` • `*work` • `*daily` • `*crime` • `*rob <@membre>` • `*pay <@membre> <montant|all>`',
            '',
            '**🎰 Gamble (`all` supporté)**',
            '`*blackjack <mise|all>` (`*bj`) • `*roulette <rouge|noir|vert|pair|impair> <mise|all>` (`*rl`) • `*slots <mise|all>` (`*slot`) • `*coinflip <pile|face> <mise|all>` (`*cf`) • `*dice <1-6> <mise|all>` • `*crash <mise|all>`',
            '',
            '**🏢 Entreprise, 📈 Crypto & 💻 Hack**',
            '`*company create <nom>` • `*company collect` • `*company upgrade`',
            '`*crypto [SYM]` • `*crypto buy <SYM> <qté>` • `*crypto sell <SYM> <qté>`',
            '`*hack <@membre>` • `*leaderboard` (`*lb`)',
            '',
            '**👑 Super Owner**',
            '`*reseteconomy` • `*setmoney <@membre> <montant>`'
        ].join('\n');

        return replyKuzo(message, { title: '💠 KUZ0 CASINO • MENU D\'AIDE', body });
    }

    if (command === 'balance' || command === 'bal') return handleBalance(message);
    if (command === 'deposit' || command === 'dep') return handleDeposit(message, args);
    if (command === 'withdraw' || command === 'with') return handleWithdraw(message, args);
    if (command === 'work') return handleWork(message);
    if (command === 'daily') return handleDaily(message);
    if (command === 'crime') return handleCrime(message);
    if (command === 'rob') return handleRob(message);
    if (command === 'pay') return handlePay(message, args);

    if (command === 'blackjack' || command === 'bj') return handleBlackjack(message, args);
    if (command === 'roulette' || command === 'rl') return handleRoulette(message, args);
    if (command === 'slots' || command === 'slot') return handleSlots(message, args);
    if (command === 'coinflip' || command === 'cf') return handleCoinflip(message, args);
    if (command === 'dice') return handleDice(message, args);
    if (command === 'crash') return handleCrash(message, args);

    if (command === 'company' || command === 'entreprise') return handleCompany(message, args);
    if (command === 'crypto' || command === 'bourse') return handleCrypto(message, args);
    if (command === 'hack') return handleHack(message);

    if (command === 'leaderboard' || command === 'lb' || command === 'top') {
        const entries = Object.entries(db.users)
            .map(([id, u]) => ({
                id,
                name: u.username || `Joueur_${id.slice(-4)}`,
                total: (u.cash || 0) + (u.bank || 0)
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const top3Ratios = entries.slice(0, 3).map(e => {
            const maxVal = Math.max(1, entries[0]?.total || 1);
            return e.total / maxVal;
        });

        const lbSummary = entries.length > 0
            ? entries.map((e, i) => `#${i + 1} ${e.name} — ${formatMoney(e.total)}`).join(' • ')
            : 'Aucun joueur enregistré';

        const png = createBlueScenePng(top3Ratios.length ? top3Ratios : [1, 0.7, 0.4]);

        return replyKuzo(message, {
            title: `🏆 CLASSEMENT • ${lbSummary}`,
            attachment: png,
            imageOnly: true
        });
    }
});

client.on('ready', () => {
    console.log(`Kuzo Casino prêt : ${client.user.tag} (Préfixe ${PREFIX})`);
});

client.login(process.env.DISCORD_TOKEN);
