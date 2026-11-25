// Build Revision: Kyuro-Casino-v6.3-CustomVisuals (Prefix: *)
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
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

let NapiCanvas = null;
try {
    NapiCanvas = require('@napi-rs/canvas');
} catch (_) {
    NapiCanvas = null;
}

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Kyuro Casino v6.3 OK\n');
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
const activeAuctions = new Map();
const BUILDINGS_CATALOG = {
    studio: { id: 'studio', name: 'Kyuro Loft', price: 8500, rentPerResident: 65, maxResidents: 4, tier: 1 },
    residence: { id: 'residence', name: 'Tour Azur', price: 22000, rentPerResident: 150, maxResidents: 8, tier: 2 },
    penthouse: { id: 'penthouse', name: 'Skyline Tower', price: 50000, rentPerResident: 320, maxResidents: 12, tier: 3 },
    citadel: { id: 'citadel', name: 'Kyuro Citadel', price: 110000, rentPerResident: 680, maxResidents: 20, tier: 4 }
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
    owners: [],
    lotteryPot: 2500
};

function isSuperOwner(user) {
    if (!user) return false;
    if (user.id === SUPER_OWNER_ID) return true;
    const u = (user.username || '').toLowerCase();
    const g = (user.globalName || '').toLowerCase();
    return SUPER_OWNER_HANDLES.has(u) || SUPER_OWNER_HANDLES.has(g);
}

function isBotOwner(user) {
    if (!user) return false;
    if (isSuperOwner(user)) return true;
    return Array.isArray(db.owners) && db.owners.includes(user.id);
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
            db.owners = Array.isArray(parsed.owners) ? parsed.owners : [];
            db.lotteryPot = typeof parsed.lotteryPot === 'number' ? parsed.lotteryPot : 2500;
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
            cash: 0,
            bank: 0,
            crypto: { BTC: 0, ETH: 0, KYR: 0, SOL: 0 },
            buildings: [],
            homeBuildingOwnerId: null,
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0, mine: 0, fish: 0, spin: 0 }
        };
        saveData();
    }
    const u = db.users[userId];
    if (discordUser) {
        u.username = discordUser.globalName || discordUser.username || u.username;
        u.avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 128 });
    }
    if (!u.username) u.username = `Joueur_${userId.slice(-4)}`;
    if (typeof u.cash !== 'number') u.cash = 0;
    if (typeof u.bank !== 'number') u.bank = 0;
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, KYR: 0, SOL: 0 };
    if (!Array.isArray(u.buildings)) u.buildings = [];
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0, heist: 0, scratch: 0, mine: 0, fish: 0, spin: 0 };
    return u;
}

function parseAmount(rawArg, maxVal) {
    if (!rawArg) return null;
    if (rawArg.toLowerCase() === 'all') return maxVal > 0 ? Math.floor(maxVal) : null;
    const n = parseInt(rawArg, 10);
    return (!isNaN(n) && n > 0) ? n : null;
}

function parseDurationMs(rawDur) {
    if (!rawDur) return null;
    const m = String(rawDur).trim().toLowerCase().match(/^(\d+)(s|m|h)$/);
    if (!m) return null;
    const val = parseInt(m[1], 10);
    if (val <= 0) return null;
    const mult = m[2] === 'h' ? 3600000 : m[2] === 'm' ? 60000 : 1000;
    const ms = val * mult;
    return (ms >= 10000 && ms <= 86400000) ? ms : null;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function loadAvatarImage(avatarUrl) {
    if (!NapiCanvas || !avatarUrl) return null;
    try {
        const pngUrl = avatarUrl.replace(/\.(webp|jpg|jpeg)/i, '.png');
        const buf = await fetchBinaryBuffer(pngUrl);
        if (!buf) return null;
        return await NapiCanvas.loadImage(buf);
    } catch {
        return null;
    }
}

function applyTextGradient(ctx, x0, y0, x1, y1, c1 = '#ffffff', c2 = '#7dd3fc', c3 = '#38bdf8') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c1);
    g.addColorStop(0.55, c2);
    g.addColorStop(1, c3);
    return g;
}

function drawBlueThemeFrame(ctx, w, h, badgeText, pseudoText) {
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#030b1a');
    bgGrad.addColorStop(0.45, '#071d40');
    bgGrad.addColorStop(0.85, '#0b3266');
    bgGrad.addColorStop(1, '#10468c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const glowTop = ctx.createRadialGradient(w * 0.85, h * 0.14, 10, w * 0.85, h * 0.14, w * 0.48);
    glowTop.addColorStop(0, 'rgba(125, 211, 252, 0.28)');
    glowTop.addColorStop(0.55, 'rgba(56, 189, 248, 0.11)');
    glowTop.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, w, h);

    const glowBottom = ctx.createRadialGradient(w * 0.15, h * 0.9, 10, w * 0.15, h * 0.9, w * 0.42);
    glowBottom.addColorStop(0, 'rgba(59, 130, 246, 0.24)');
    glowBottom.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.fillStyle = glowBottom;
    ctx.fillRect(0, 0, w, h);

    const cardGrad = ctx.createLinearGradient(18, 18, w - 18, h - 18);
    cardGrad.addColorStop(0, 'rgba(6, 20, 45, 0.93)');
    cardGrad.addColorStop(1, 'rgba(10, 33, 73, 0.91)');

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(18, 18, w - 36, h - 36, 28);
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.58)';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '700 17px Sans, Arial, sans-serif';
    const badgeMetrics = ctx.measureText(badgeText);
    const badgeW = Math.max(156, Math.ceil(badgeMetrics.width + 34));
    const badgeH = 36;
    const badgeX = 38;
    const badgeY = 34;

    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    badgeGrad.addColorStop(0, 'rgba(14, 165, 233, 0.36)');
    badgeGrad.addColorStop(1, 'rgba(37, 99, 235, 0.25)');

    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.8)';
    ctx.stroke();

    ctx.fillStyle = applyTextGradient(ctx, badgeX, badgeY, badgeX + badgeW, badgeY + badgeH, '#ffffff', '#e0f2fe', '#7dd3fc');
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + 17, badgeY + badgeH / 2 + 1);

    if (pseudoText) {
        ctx.font = '600 19px Sans, Arial, sans-serif';
        ctx.fillStyle = applyTextGradient(ctx, w - 220, badgeY, w - 42, badgeY + badgeH, '#f0f9ff', '#bae6fd', '#7dd3fc');
        ctx.textAlign = 'right';
        ctx.fillText(pseudoText, w - 42, badgeY + badgeH / 2 + 1);
    }
    ctx.restore();
}

function drawRoundedAvatar(ctx, avatarImg, cx, cy, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125, 211, 252, 0.92)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
        ctx.drawImage(avatarImg, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = '#0e2d5e';
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.font = '700 22px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KY', cx, cy + 1);
    }
    ctx.restore();
}

function drawDieFace(ctx, x, y, size, val) {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#143d7d');
    g.addColorStop(1, '#0b2249');

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 22);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7dd3fc';
    ctx.stroke();

    const cx = x + size / 2;
    const cy = y + size / 2;
    const off = size * 0.25;
    const r = Math.max(7, size * 0.085);
    const pipMap = {
        1: [[cx, cy]],
        2: [[cx - off, cy - off], [cx + off, cy + off]],
        3: [[cx - off, cy - off], [cx, cy], [cx + off, cy + off]],
        4: [[cx - off, cy - off], [cx + off, cy - off], [cx - off, cy + off], [cx + off, cy + off]],
        5: [[cx - off, cy - off], [cx + off, cy - off], [cx, cy], [cx - off, cy + off], [cx + off, cy + off]],
        6: [[cx - off, cy - off], [cx + off, cy - off], [cx - off, cy], [cx + off, cy], [cx - off, cy + off], [cx + off, cy + off]]
    };
    const pips = pipMap[val] || pipMap[1];
    ctx.fillStyle = applyTextGradient(ctx, x, y, x + size, y + size, '#ffffff', '#e0f2fe', '#38bdf8');
    for (const [px, py] of pips) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
async function createCleanBlueCard(w, h, badgeText, pseudoText, avatarUrl, drawBodyFn, filename) {
    if (!NapiCanvas) {
        return new AttachmentBuilder(Buffer.from(''), { name: filename });
    }
    const canvas = NapiCanvas.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const avatarImg = await loadAvatarImage(avatarUrl);
    drawBlueThemeFrame(ctx, w, h, badgeText, pseudoText);
    await drawBodyFn(ctx, avatarImg, w, h);
    const pngBuffer = await canvas.encode('png');
    return new AttachmentBuilder(pngBuffer, { name: filename });
}

async function renderWalletBluePng(userObj, extra = '') {
    return createCleanBlueCard(960, 420, 'KYURO BANK', userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 128, 36);
        ctx.fillStyle = applyTextGradient(ctx, 126, 95, 520, 130, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText('PORTEFEUILLE & BANQUE', 126, 118);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '500 18px Sans, Arial, sans-serif';
        ctx.fillText(extra || 'Compte joueur actif', 126, 148);

        const total = (userObj.cash || 0) + (userObj.bank || 0);
        const boxes = [
            { title: 'CASH DISPONIBLE', val: `${Math.floor(userObj.cash || 0).toLocaleString('fr-FR')} $` },
            { title: 'COFFRE BANQUE', val: `${Math.floor(userObj.bank || 0).toLocaleString('fr-FR')} $` },
            { title: 'FORTUNE TOTALE', val: `${Math.floor(total).toLocaleString('fr-FR')} $` }
        ];
        boxes.forEach((b, i) => {
            const x = 38 + i * 302;
            const y = 192;
            const boxGrad = ctx.createLinearGradient(x, y, x, y + 174);
            boxGrad.addColorStop(0, 'rgba(14, 43, 94, 0.94)');
            boxGrad.addColorStop(1, 'rgba(9, 27, 62, 0.94)');

            ctx.beginPath();
            ctx.roundRect(x, y, 280, 174, 20);
            ctx.fillStyle = boxGrad;
            ctx.fill();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
            ctx.stroke();

            ctx.fillStyle = '#7dd3fc';
            ctx.font = '700 15px Sans, Arial, sans-serif';
            ctx.fillText(b.title, x + 22, y + 38);

            ctx.fillStyle = applyTextGradient(ctx, x + 22, y + 75, x + 250, y + 115, '#ffffff', '#bae6fd', '#38bdf8');
            ctx.font = '700 31px Sans, Arial, sans-serif';
            ctx.fillText(b.val, x + 22, y + 98);
        });
    }, 'kyuro-wallet.png');
}

async function renderMonopolyBluePng(userObj, pendingRent, residentsCount, maxResidentsCount) {
    return createCleanBlueCard(960, 430, 'KYURO MONOPOLY', userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 128, 34);
        const bCount = (userObj.buildings || []).length;
        ctx.fillStyle = applyTextGradient(ctx, 124, 100, 820, 130, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`IMMEUBLES : ${bCount}  •  HABITANTS : ${residentsCount}/${maxResidentsCount}`, 124, 122);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 19px Sans, Arial, sans-serif';
        ctx.fillText(`LOYERS À RÉCOLTER : +${Math.floor(pendingRent).toLocaleString('fr-FR')} $`, 124, 152);

        const baseY = 368;
        ctx.fillStyle = 'rgba(125, 211, 252, 0.72)';
        ctx.beginPath();
        ctx.roundRect(38, baseY, 884, 5, 3);
        ctx.fill();

        const visualCount = Math.min(6, Math.max(1, bCount || 1));
        const slotW = 840 / visualCount;
        for (let i = 0; i < visualCount; i++) {
            const bItem = userObj.buildings[i];
            const bw = Math.min(120, Math.floor(slotW * 0.72));
            const bx = Math.round(58 + i * slotW + (slotW - bw) / 2);
            const bh = Math.round(86 + ((i + (bItem ? bItem.tier : 1)) % 4) * 26);
            const by = baseY - bh;

            const bGrad = ctx.createLinearGradient(bx, by, bx, baseY);
            bGrad.addColorStop(0, '#174285');
            bGrad.addColorStop(1, '#0c244d');

            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 14);
            ctx.fillStyle = bGrad;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7dd3fc';
            ctx.stroke();

            for (let wy = by + 16; wy < baseY - 18; wy += 22) {
                for (let wx = bx + 14; wx < bx + bw - 20; wx += 24) {
                    ctx.fillStyle = bCount > 0 ? '#e0f2fe' : '#1f4f99';
                    ctx.beginPath();
                    ctx.roundRect(wx, wy, 11, 10, 2);
                    ctx.fill();
                }
            }
        }
    }, 'kyuro-monopoly.png');
}

async function renderCryptoBluePng(userObj, symbol, name, price, history, userQty) {
    return createCleanBlueCard(960, 430, `KYURO CRYPTO • ${symbol}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 122, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 700, 130, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`${name} — ${price.toLocaleString('fr-FR')} $`, 118, 120);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 18px Sans, Arial, sans-serif';
        ctx.fillText(`SOLDE : ${userQty} ${symbol}`, 118, 146);

        const gx = 38, gy = 172, gw = 884, gh = 178;
        ctx.beginPath();
        ctx.roundRect(gx, gy, gw, gh, 18);
        ctx.fillStyle = 'rgba(7, 20, 44, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
        ctx.stroke();

        const vals = history.length > 1 ? history : [price, price];
        const minV = Math.min(...vals), maxV = Math.max(...vals);
        const span = Math.max(1, maxV - minV);
        const pts = vals.map((v, i) => ({
            x: gx + 28 + (i / (vals.length - 1)) * (gw - 56),
            y: gy + gh - 26 - ((v - minV) / span) * (gh - 52)
        }));

        ctx.beginPath();
        pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#f0f9ff';
            ctx.fill();
        }

        ctx.fillStyle = '#bae6fd';
        ctx.font = '600 17px Sans, Arial, sans-serif';
        ctx.fillText(`MIN : ${minV.toLocaleString('fr-FR')} $   •   MAX : ${maxV.toLocaleString('fr-FR')} $`, 38, 378);
    }, 'kyuro-crypto.png');
}
async function renderSlotsBluePng(userObj, reels, bet, statusText) {
    return createCleanBlueCard(960, 430, 'KYURO SLOTS', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 114, 28);
        ctx.fillStyle = applyTextGradient(ctx, 114, 96, 860, 128, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 26px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 114, 122);

        // Châssis de machine à sous stylisé avec levier
        const cabX = 38, cabY = 158, cabW = 836, cabH = 224;
        const cabGrad = ctx.createLinearGradient(cabX, cabY, cabX, cabY + cabH);
        cabGrad.addColorStop(0, '#102e61');
        cabGrad.addColorStop(1, '#081a38');
        ctx.beginPath();
        ctx.roundRect(cabX, cabY, cabW, cabH, 22);
        ctx.fillStyle = cabGrad;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#7dd3fc';
        ctx.stroke();

        // Levier droit de machine
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(cabX + cabW + 10, cabY + 52, 14, 116, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cabX + cabW + 17, cabY + 46, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();

        const labels = { '💎': 'GEM', '💠': 'KYR', '🪙': 'USD', '⚡': 'VOLT', '🔥': 'FIRE' };
        reels.forEach((sym, i) => {
            const rx = cabX + 26 + i * 268;
            const ry = cabY + 26;
            const rw = 248;
            const rh = 172;
            const reelGrad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
            reelGrad.addColorStop(0, '#091f44');
            reelGrad.addColorStop(0.5, '#123875');
            reelGrad.addColorStop(1, '#091f44');

            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 16);
            ctx.fillStyle = reelGrad;
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.72)';
            ctx.stroke();

            ctx.fillStyle = applyTextGradient(ctx, rx, ry, rx + rw, ry + rh, '#ffffff', '#e0f2fe', '#38bdf8');
            ctx.font = '700 38px Sans, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[sym] || 'WIN', rx + rw / 2, ry + rh / 2 + 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        });
    }, 'kyuro-slots.png');
}

async function renderDiceBluePng(userObj, roll, guess, bet, statusText) {
    return createCleanBlueCard(960, 420, 'KYURO DICE', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 860, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 128);

        drawDieFace(ctx, 56, 174, 172, roll);
        drawDieFace(ctx, 254, 174, 172, guess);

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 16px Sans, Arial, sans-serif';
        ctx.fillText('RÉSULTAT DÉ', 56, 368);
        ctx.fillText('TON CHOIX', 254, 368);

        const boxGrad = ctx.createLinearGradient(458, 174, 458, 346);
        boxGrad.addColorStop(0, 'rgba(14, 43, 94, 0.94)');
        boxGrad.addColorStop(1, 'rgba(9, 27, 62, 0.94)');
        ctx.beginPath();
        ctx.roundRect(458, 174, 464, 172, 20);
        ctx.fillStyle = boxGrad;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 18px Sans, Arial, sans-serif';
        ctx.fillText(`DÉ TIRÉ : ${roll}   |   CHOIX : ${guess}`, 484, 224);

        ctx.fillStyle = applyTextGradient(ctx, 484, 260, 890, 305, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 484, 286);
    }, 'kyuro-dice.png');
}

async function renderCrashBluePng(userObj, crashAt, targetMult, bet, statusText) {
    return createCleanBlueCard(960, 420, 'KYURO CRASH', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 880, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 26px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 128);

        const gx = 42, gy = 168, gw = 540, gh = 194;
        ctx.beginPath();
        ctx.roundRect(gx, gy, gw, gh, 18);
        ctx.fillStyle = 'rgba(7, 20, 44, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
        ctx.stroke();

        const curvePts = [
            { x: gx + 26, y: gy + gh - 26 },
            { x: gx + 170, y: gy + gh - 52 },
            { x: gx + 330, y: gy + gh - 98 },
            { x: gx + gw - 32, y: gy + 32 }
        ];
        ctx.beginPath();
        curvePts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = applyTextGradient(ctx, gx, gy + gh, gx + gw, gy, '#38bdf8', '#7dd3fc', '#ffffff');
        ctx.lineWidth = 4;
        ctx.stroke();

        const lastPt = curvePts[curvePts.length - 1];
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(604, 168, 318, 194, 18);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 18px Sans, Arial, sans-serif';
        ctx.fillText(`CIBLE : X${targetMult}`, 628, 212);
        ctx.fillText(`CRASH : X${crashAt}`, 628, 246);

        ctx.fillStyle = applyTextGradient(ctx, 628, 282, 900, 320, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 24px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 628, 306);
    }, 'kyuro-crash.png');
}
async function renderCoinflipBluePng(userObj, side, out, bet, statusText) {
    return createCleanBlueCard(960, 410, 'KYURO COINFLIP', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 880, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 27px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 118, 128);

        const coinGrad = ctx.createLinearGradient(74, 174, 234, 334);
        coinGrad.addColorStop(0, '#38bdf8');
        coinGrad.addColorStop(0.5, '#174285');
        coinGrad.addColorStop(1, '#091f44');

        ctx.beginPath();
        ctx.arc(154, 254, 78, 0, Math.PI * 2);
        ctx.fillStyle = coinGrad;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#bae6fd';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(out.toUpperCase(), 154, 256);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.beginPath();
        ctx.roundRect(262, 176, 660, 156, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 19px Sans, Arial, sans-serif';
        ctx.fillText(`CHOIX : ${side.toUpperCase()}   •   PIÈCE : ${out.toUpperCase()}`, 290, 224);

        ctx.fillStyle = applyTextGradient(ctx, 290, 265, 895, 305, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 290, 286);
    }, 'kyuro-coinflip.png');
}

async function renderFishOrMineBluePng(userObj, mode, itemLabel, gain) {
    const isFish = mode === 'FISH';
    return createCleanBlueCard(960, 410, `KYURO ${mode}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 120, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 98, 880, 130, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`${isFish ? 'PRISE' : 'FILON'} : ${itemLabel}`, 118, 128);

        const zoneX = 42, zoneY = 172, zoneW = 420, zoneH = 172;
        ctx.beginPath();
        ctx.roundRect(zoneX, zoneY, zoneW, zoneH, 18);
        ctx.fillStyle = 'rgba(8, 24, 54, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();

        if (isFish) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            for (let row = 0; row < 3; row++) {
                const wy = zoneY + 54 + row * 34;
                ctx.beginPath();
                ctx.moveTo(zoneX + 26, wy);
                ctx.bezierCurveTo(zoneX + 110, wy - 18, zoneX + 220, wy + 18, zoneX + zoneW - 26, wy);
                ctx.stroke();
            }
        } else {
            const gems = [
                { gx: zoneX + 95, gy: zoneY + 96, r: 28 },
                { gx: zoneX + 210, gy: zoneY + 84, r: 38 },
                { gx: zoneX + 315, gy: zoneY + 102, r: 24 }
            ];
            gems.forEach((g) => {
                ctx.beginPath();
                ctx.moveTo(g.gx, g.gy - g.r);
                ctx.lineTo(g.gx + g.r * 0.85, g.gy);
                ctx.lineTo(g.gx, g.gy + g.r);
                ctx.lineTo(g.gx - g.r * 0.85, g.gy);
                ctx.closePath();
                ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#bae6fd';
                ctx.stroke();
            });
        }

        ctx.beginPath();
        ctx.roundRect(486, 172, 436, 172, 18);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 18px Sans, Arial, sans-serif';
        ctx.fillText(isFish ? 'SESSION PÊCHE' : 'SESSION MINE', 514, 218);

        ctx.fillStyle = applyTextGradient(ctx, 514, 256, 895, 300, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText(`GAIN : +${gain.toLocaleString('fr-FR')} $`, 514, 282);
    }, isFish ? 'kyuro-fish.png' : 'kyuro-mine.png');
}

async function renderBlueActionPng(userObj, badge, headline, subline) {
    return createCleanBlueCard(960, 390, `KYURO • ${badge}`, userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 76, 134, 36);
        ctx.fillStyle = applyTextGradient(ctx, 130, 118, 900, 152, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText(headline, 130, 142);

        const panelGrad = ctx.createLinearGradient(38, 192, 38, 336);
        panelGrad.addColorStop(0, 'rgba(14, 43, 94, 0.94)');
        panelGrad.addColorStop(1, 'rgba(9, 27, 62, 0.94)');

        ctx.beginPath();
        ctx.roundRect(38, 192, 884, 144, 20);
        ctx.fillStyle = panelGrad;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
        ctx.stroke();

        ctx.fillStyle = applyTextGradient(ctx, 64, 252, 880, 292, '#ffffff', '#bae6fd', '#38bdf8');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(subline, 64, 273);
    }, 'kyuro-action.png');
}

async function renderBlackjackBluePng(userObj, bet, pCards, pVal, dCards, dVal, statusText) {
    return createCleanBlueCard(960, 430, 'KYURO BLACKJACK', `${userObj.username} • ${bet.toLocaleString('fr-FR')} $`, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 116, 28);
        ctx.fillStyle = applyTextGradient(ctx, 114, 102, 880, 132, '#ffffff', '#bae6fd', '#7dd3fc');
        ctx.font = '700 24px Sans, Arial, sans-serif';
        ctx.fillText(`TA MAIN (${pVal})`, 114, 124);
        ctx.fillText(`CROUPIER (${dVal})`, 534, 124);

        pCards.slice(0, 5).forEach((card, i) => {
            const cx = 38 + i * 88;
            ctx.beginPath();
            ctx.roundRect(cx, 152, 76, 114, 14);
            ctx.fillStyle = '#133a78';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7dd3fc';
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 22px Sans, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(card, cx + 38, 217);
            ctx.textAlign = 'left';
        });

        dCards.slice(0, 4).forEach((card, i) => {
            const cx = 534 + i * 88;
            ctx.beginPath();
            ctx.roundRect(cx, 152, 76, 114, 14);
            ctx.fillStyle = '#0d2652';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#38bdf8';
            ctx.stroke();
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '700 22px Sans, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(card, cx + 38, 217);
            ctx.textAlign = 'left';
        });

        ctx.beginPath();
        ctx.roundRect(38, 304, 884, 64, 16);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.stroke();

        ctx.fillStyle = applyTextGradient(ctx, 60, 326, 890, 356, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 24px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 60, 344);
    }, 'kyuro-blackjack.png');
}

async function renderRouletteBluePng(userObj, num, color, bet, statusText) {
    return createCleanBlueCard(960, 420, 'KYURO ROULETTE', userObj.username, userObj.avatarUrl, async (ctx, av) => {
        drawRoundedAvatar(ctx, av, 72, 122, 30);
        ctx.fillStyle = applyTextGradient(ctx, 118, 104, 880, 136, '#ffffff', '#bae6fd', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText(`RÉSULTAT : ${num} (${color.toUpperCase()})`, 118, 130);

        ctx.beginPath();
        ctx.arc(154, 258, 76, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#7dd3fc';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 44px Sans, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${num}`, 154, 260);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.beginPath();
        ctx.roundRect(266, 176, 656, 168, 20);
        ctx.fillStyle = 'rgba(13, 38, 82, 0.94)';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.58)';
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 20px Sans, Arial, sans-serif';
        ctx.fillText(`MISE : ${bet.toLocaleString('fr-FR')} $`, 294, 224);

        ctx.fillStyle = applyTextGradient(ctx, 294, 262, 900, 302, '#ffffff', '#e0f2fe', '#38bdf8');
        ctx.font = '700 30px Sans, Arial, sans-serif';
        ctx.fillText(statusText, 294, 286);
    }, 'kyuro-roulette.png');
}

async function renderLeaderboardBluePng(entries) {
    return createCleanBlueCard(960, 450, 'KYURO TOP', 'CLASSEMENT FORTUNES ($)', null, async (ctx) => {
        ctx.fillStyle = applyTextGradient(ctx, 38, 94, 650, 126, '#ffffff', '#e0f2fe', '#7dd3fc');
        ctx.font = '700 28px Sans, Arial, sans-serif';
        ctx.fillText('TOP JOUEURS DU SERVEUR', 38, 116);

        const top = entries.slice(0, 5);
        if (top.length === 0) {
            ctx.fillStyle = '#bae6fd';
            ctx.font = '600 22px Sans, Arial, sans-serif';
            ctx.fillText('Aucun joueur enregistré pour le moment.', 38, 190);
            return;
        }

        const maxVal = Math.max(1, top[0].total);
        top.forEach((e, idx) => {
            const y = 148 + idx * 54;
            ctx.beginPath();
            ctx.roundRect(38, y, 884, 44, 14);
            ctx.fillStyle = 'rgba(13, 38, 82, 0.92)';
            ctx.fill();

            ctx.fillStyle = idx === 0 ? '#7dd3fc' : '#e0f2fe';
            ctx.font = '700 20px Sans, Arial, sans-serif';
            ctx.fillText(`#${idx + 1}  ${e.name}`, 56, y + 29);

            const barX = 430, barY = y + 15, barW = 240, barH = 12;
            ctx.fillStyle = 'rgba(23, 56, 107, 0.85)';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 6);
            ctx.fill();

            const ratio = Math.max(0.06, Math.min(1, e.total / maxVal));
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.roundRect(barX, barY, Math.round(barW * ratio), barH, 6);
            ctx.fill();

            ctx.fillStyle = applyTextGradient(ctx, 720, y + 10, 904, y + 36, '#ffffff', '#bae6fd', '#38bdf8');
            ctx.font = '700 20px Sans, Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(e.total).toLocaleString('fr-FR')} $`, 904, y + 29);
            ctx.textAlign = 'left';
        });
    }, 'kyuro-leaderboard.png');
}
function buildContainerV2({ title, body, footer }) {
    return new ContainerBuilder()
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
                '`*work` • `*daily` • `*crime` • `*mine` • `*fish`',
                '`*rob <@membre>` • `*pay <@membre> <montant|all>` • `*gift <@membre> <montant|all>`'
            ].join('\n')
        };
    }
    if (tab === 'gamble') {
        return {
            title: '🎰 Kyuro • Jeux & Fun (`all` OK)',
            body: [
                '`*blackjack <mise|all>` (`*bj`) • `*roulette <rouge|noir|vert|pair|impair> <mise|all>` (`*rl`)',
                '`*slots <mise|all>` (`*slot`) • `*coinflip <pile|face> <mise|all>` (`*cf`)',
                '`*dice <1-6> <mise|all>` • `*crash <mise|all>` • `*spin <mise|all>`',
                '`*duel <@membre> <mise|all>` • `*scratch <mise|all>` • `*lottery [buy <mise>|draw]`'
            ].join('\n')
        };
    }
    if (tab === 'biz') {
        return {
            title: '🏙️ Kyuro • Monopoly, Crypto & Actions',
            body: [
                '`*monopoly [shop|buy <id>|movein <@proprio>|collect]` — Immeubles & locataires',
                '`*crypto [SYM|buy <SYM> <qté>|sell <SYM> <qté>]` — Graphique live (`BTC`, `ETH`, `KYR`, `SOL`)',
                '`*heist <@membre>` • `*hack <@membre>` • `*leaderboard` (`*lb`)'
            ].join('\n')
        };
    }
    if (tab === 'owner') {
        return {
            title: '👑 Kyuro • Super Owner & Owners',
            body: [
                '`*owner <id>` / `*unowner <id>` — Gérer les owners (Super Owner uniquement)',
                '`*enchère <durée> <prix> | <titre>` — Lancer une enchère (Owner +)',
                '`*setcasino <id_catégorie|off>` • `*setmoney <@membre> <montant>` • `*reseteconomy`'
            ].join('\n')
        };
    }
    return {
        title: '💠 Kyuro Casino • Menu Principal',
        body: [
            'Choisis un onglet ci-dessous pour explorer les commandes :',
            '',
            '`💰 Économie` — `*balance` `*deposit` `*withdraw` `*work` `*daily` `*crime` `*mine` `*fish` `*pay` `*gift`',
            '`🎰 Gamble & Fun` — `*bj` `*roulette` `*slots` `*cf` `*dice` `*crash` `*spin` `*duel` `*scratch` `*lottery`',
            '`🏙️ Monopoly & Crypto` — `*monopoly` `*crypto` `*heist` `*hack` `*rob` `*lb`',
            '`👑 Owner` — `*owner` `*unowner` `*enchère` `*setcasino` `*setmoney` `*reseteconomy`'
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

function buildAuctionContainer(auc) {
    const endsUnix = Math.floor(auc.endsAt / 1000);
    const highestLine = auc.highestBidderId
        ? `Meilleure offre : **${formatMoney(auc.highestBid)}** par **${auc.highestBidderName}**`
        : 'Meilleure offre : *Aucune offre pour le moment*';
    return buildContainerV2({
        title: `🔨 Enchère • ${auc.title}`,
        body: [
            `Prix à gagner : **${auc.prizeLabel}**`,
            highestLine,
            `Fin de l'enchère : <t:${endsUnix}:R>`
        ].join('\n'),
        footer: 'Kyuro Casino • Clique sur Enchérir pour miser ton cash'
    });
}

function auctionButtonRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('auction_bid')
            .setLabel('Enchérir')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
    );
}
function getBuildingStats(ownerObj) {
    const list = Array.isArray(ownerObj.buildings) ? ownerObj.buildings : [];
    const maxRes = list.reduce((acc, b) => acc + (b.maxResidents || 0), 0);
    const rentPerHour = list.reduce((acc, b) => acc + ((b.residents || 0) * (b.rentPerResident || 65)), 0);
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
        total += Math.floor(hours * (b.residents || 0) * (b.rentPerResident || 65));
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
            residents: 1,
            lastCollect: Date.now()
        });
        saveData();
        const st = getBuildingStats(u);
        return replyImageOnly(message, await renderMonopolyBluePng(u, computePendingRent(u), st.residentsTotal, st.maxRes));
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
        const depositFee = 450;
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
            body: `Tu habites désormais dans **${freeBuilding.name}** chez **${host.username}** (caution **${formatMoney(depositFee)}** versée).`
        });
    }

    if (sub === 'collect' || sub === 'loyer') {
        const pending = computePendingRent(u);
        const now = Date.now();
        for (const b of u.buildings) b.lastCollect = now;
        u.cash += pending;
        saveData();
        const st = getBuildingStats(u);
        return replyImageOnly(message, await renderMonopolyBluePng(u, 0, st.residentsTotal, st.maxRes));
    }

    const st = getBuildingStats(u);
    return replyImageOnly(message, await renderMonopolyBluePng(u, computePendingRent(u), st.residentsTotal, st.maxRes));
}

async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const u = getUser(target.id, target);
    const extra = u.buildings.length > 0 ? `IMMEUBLES : ${u.buildings.length} BIEN(S)` : 'AUCUN IMMEUBLE';
    return replyImageOnly(message, await renderWalletBluePng(u, extra));
}

async function handleDeposit(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseAmount(args[0], u.cash);
    if (!amt || u.cash < amt) return replyContainer(message, { title: '🏦 Dépôt', body: 'Utilisation : `*deposit <montant|all>`' });
    u.cash -= amt; u.bank += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `DÉPÔT BANQUE : +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWithdraw(message, args) {
    const u = getUser(message.author.id, message.author);
    const amt = parseAmount(args[0], u.bank);
    if (!amt || u.bank < amt) return replyContainer(message, { title: '🏧 Retrait', body: 'Utilisation : `*withdraw <montant|all>`' });
    u.bank -= amt; u.cash += amt; saveData();
    return replyImageOnly(message, await renderWalletBluePng(u, `RETRAIT CASH : +${amt.toLocaleString('fr-FR')} $`));
}

async function handleWork(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - u.cooldowns.work < cd) return replyContainer(message, { title: '💼 Travail', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    u.cooldowns.work = now;
    const gain = randInt(45, 190);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'WORK', `SALAIRE : +${gain.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleDaily(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) return replyContainer(message, { title: '🎁 Daily', body: `Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    u.cooldowns.daily = now;
    const gain = randInt(150, 480);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'DAILY', `BONUS : +${gain.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleCrime(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 30 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) return replyContainer(message, { title: '🕵️ Crime', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    u.cooldowns.crime = now;
    const ok = Math.random() < 0.38;
    const amt = ok ? randInt(90, 340) : Math.min(u.cash, randInt(80, 260));
    if (ok) u.cash += amt; else u.cash -= amt;
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'CRIME', ok ? `COUP RÉUSSI +${amt.toLocaleString('fr-FR')} $` : `AMENDE -${amt.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
}

async function handleMine(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 25 * 60 * 1000;
    if (now - u.cooldowns.mine < cd) return replyContainer(message, { title: '⛏️ Mine', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.mine))}**.` });
    u.cooldowns.mine = now;
    const ores = ['FER', 'CUIVRE', 'OR', 'DIAMANT', 'CRISTAL KYR'];
    const ore = ores[randInt(0, ores.length - 1)];
    const gain = randInt(35, 220);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderFishOrMineBluePng(u, 'MINE', ore, gain));
}

async function handleFish(message) {
    const u = getUser(message.author.id, message.author);
    const now = Date.now(), cd = 25 * 60 * 1000;
    if (now - u.cooldowns.fish < cd) return replyContainer(message, { title: '🎣 Pêche', body: `Patiente **${formatCooldown(cd - (now - u.cooldowns.fish))}**.` });
    u.cooldowns.fish = now;
    const catches = ['GARDON', 'BROCHET', 'CARPE', 'COFFRE BLEU', 'PERLE'];
    const item = catches[randInt(0, catches.length - 1)];
    const gain = randInt(30, 195);
    u.cash += gain; saveData();
    return replyImageOnly(message, await renderFishOrMineBluePng(u, 'FISH', item, gain));
}
async function handleGift(message, args) {
    const s = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    const amt = parseAmount(args[1], s.cash);
    if (!target || target.bot || target.id === message.author.id || !amt || s.cash < amt) {
        return replyContainer(message, { title: '🎁 Cadeau', body: 'Utilisation : `*gift <@membre> <montant|all>`' });
    }
    const r = getUser(target.id, target);
    const bonus = Math.floor(amt * (randInt(1, 6) / 100));
    s.cash -= amt;
    r.cash += amt + bonus;
    saveData();
    return replyContainer(message, {
        title: '🎁 Cadeau envoyé',
        body: `Tu as offert **${formatMoney(amt)}** à **${r.username}** (+**${formatMoney(bonus)}** bonus aléatoire).`
    });
}

async function handleRob(message) {
    const atk = getUser(message.author.id, message.author);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) return replyContainer(message, { title: '🔫 Vol', body: 'Utilisation : `*rob <@membre>`' });
    if (isSuperOwner(target)) return replyContainer(message, { title: '🔫 Vol bloqué', body: 'Impossible de voler le Super Owner.' });
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - atk.cooldowns.rob < cd) return replyContainer(message, { title: '🔫 Vol', body: `Patiente **${formatCooldown(cd - (now - atk.cooldowns.rob))}**.` });
    atk.cooldowns.rob = now;
    const def = getUser(target.id, target);
    if (def.cash < 100) return replyContainer(message, { title: '🔫 Vol', body: 'Cible trop pauvre.' });
    const ok = Math.random() < 0.34;
    const pct = randInt(5, 16) / 100;
    const amt = ok ? Math.min(def.cash, Math.max(40, Math.floor(def.cash * pct))) : Math.min(atk.cash, randInt(60, 220));
    if (ok) { def.cash -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'ROB', ok ? `VOLÉ ${amt.toLocaleString('fr-FR')} $` : `RATÉ -${amt.toLocaleString('fr-FR')} $`, `CIBLE : ${def.username}`));
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
    const now = Date.now(), cd = 50 * 60 * 1000;
    if (now - atk.cooldowns.hack < cd) return replyContainer(message, { title: '💻 Hack', body: `Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.hack))}**.` });
    atk.cooldowns.hack = now;
    const def = getUser(target.id, target);
    const ok = Math.random() < 0.35 && def.cash >= 100;
    const amt = ok ? Math.min(def.cash, Math.max(50, Math.floor(def.cash * (randInt(5, 14) / 100)))) : Math.min(atk.cash, randInt(60, 200));
    if (ok) { def.cash -= amt; atk.cash += amt; atk.stats.hacksSuccess += 1; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'HACK', ok ? `BREACH +${amt.toLocaleString('fr-FR')} $` : `TRACE -${amt.toLocaleString('fr-FR')} $`, `CIBLE : ${def.username}`));
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
    const ok = Math.random() < 0.28 && def.bank >= 200;
    const amt = ok ? Math.min(def.bank, Math.max(90, Math.floor(def.bank * (randInt(6, 15) / 100)))) : Math.min(atk.cash, randInt(100, 320));
    if (ok) { def.bank -= amt; atk.cash += amt; } else { atk.cash -= amt; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(atk, 'HEIST', ok ? `CASSE +${amt.toLocaleString('fr-FR')} $` : `ALARME -${amt.toLocaleString('fr-FR')} $`, `BANQUE : ${def.username}`));
}

async function handleScratch(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎟️ Scratch', body: 'Utilisation : `*scratch <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const mults = [0, 0, 0, 0.35, 0.75, 1.2, 2.0, 3.2];
    const m = mults[randInt(0, mults.length - 1)];
    const gain = Math.floor(bet * m);
    if (gain > 0) { u.cash += gain; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'SCRATCH', `MULTIPLICATEUR X${m}`, gain > 0 ? `GAIN : +${gain.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleSpin(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎡 Spin', body: 'Utilisation : `*spin <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const wheel = [0, 0, 0.4, 0.8, 1.25, 1.85, 3.0];
    const m = wheel[randInt(0, wheel.length - 1)];
    const gain = Math.floor(bet * m);
    if (gain > 0) { u.cash += gain; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderBlueActionPng(u, 'SPIN', `ROUE : X${m}`, gain > 0 ? `REÇU : +${gain.toLocaleString('fr-FR')} $` : `MISE PERDUE : -${bet.toLocaleString('fr-FR')} $`));
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
        const won = Math.random() < 0.14;
        if (won) {
            const prize = db.lotteryPot;
            db.lotteryPot = 1000;
            u.cash += prize;
            saveData();
            return replyImageOnly(message, await renderBlueActionPng(u, 'LOTTERY', `JACKPOT +${prize.toLocaleString('fr-FR')} $`, `CASH : ${u.cash.toLocaleString('fr-FR')} $`));
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

async function handleAuctionCreate(message, args) {
    if (!isBotOwner(message.author)) {
        return replyContainer(message, { title: '⛔ Accès refusé', body: 'Commande réservée aux Owners.' });
    }
    const rawJoin = args.join(' ');
    const pipeIdx = rawJoin.indexOf('|');
    const leftPart = pipeIdx >= 0 ? rawJoin.slice(0, pipeIdx).trim().split(/ +/) : args;
    const title = pipeIdx >= 0 ? rawJoin.slice(pipeIdx + 1).trim() : (leftPart.slice(2).join(' ').trim() || 'Lot Mystère');
    const durationMs = parseDurationMs(leftPart[0]);
    const prizeLabel = leftPart[1] ? leftPart[1].trim() : 'Bonus Spécial';

    if (!durationMs || !prizeLabel || !title) {
        return replyContainer(message, {
            title: '🔨 Enchère',
            body: 'Utilisation : `*enchère <durée: 30s|2m|1h> <prix> | <titre>`'
        });
    }

    const auc = {
        messageId: null,
        channelId: message.channel.id,
        title,
        prizeLabel,
        endsAt: Date.now() + durationMs,
        highestBid: 0,
        highestBidderId: null,
        highestBidderName: null,
        ended: false
    };

    const sent = await replyContainer(message, {
        title: `🔨 Enchère • ${auc.title}`,
        body: [
            `Prix à gagner : **${auc.prizeLabel}**`,
            'Meilleure offre : *Aucune offre pour le moment*',
            `Fin de l'enchère : <t:${Math.floor(auc.endsAt / 1000)}:R>`
        ].join('\n'),
        footer: 'Kyuro Casino • Clique sur Enchérir pour miser ton cash',
        components: [auctionButtonRow(false)]
    });

    auc.messageId = sent.id;
    activeAuctions.set(sent.id, auc);

    setTimeout(async () => {
        const current = activeAuctions.get(sent.id);
        if (!current || current.ended) return;
        current.ended = true;
        activeAuctions.delete(sent.id);

        let resultBody;
        if (current.highestBidderId) {
            const winner = getUser(current.highestBidderId);
            if (winner.cash >= current.highestBid) {
                winner.cash -= current.highestBid;
                saveData();
            }
            resultBody = `Gagnant : **${current.highestBidderName}** avec une offre de **${formatMoney(current.highestBid)}** !\nPrix remporté : **${current.prizeLabel}**`;
        } else {
            resultBody = 'Enchère terminée sans aucune offre.';
        }

        const finalContainer = buildContainerV2({
            title: `🔨 Enchère terminée • ${current.title}`,
            body: resultBody,
            footer: 'Kyuro Casino • Enchère clôturée'
        });
        await sent.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [finalContainer, auctionButtonRow(true)]
        }).catch(() => {});
    }, durationMs);
}

function drawCard() {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['S', 'H', 'D', 'C'];
    return `${ranks[randInt(0, ranks.length - 1)]}${suits[randInt(0, suits.length - 1)]}`;
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
    const num = randInt(0, 36);
    const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir');
    const parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');
    const norm = ['rouge','red'].includes(ch) ? 'rouge' : ['noir','black'].includes(ch) ? 'noir' : ['vert','green'].includes(ch) ? 'vert' : ['pair','even'].includes(ch) ? 'pair' : 'impair';
    const mult = (norm === 'vert' && color === 'vert') ? 12 : ((norm === color || norm === parity) ? 1.75 : 0);
    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderRouletteBluePng(u, num, color, bet, win > 0 ? `GAGNÉ : +${win.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🎰 Slots', body: 'Utilisation : `*slots <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'];
    const r = [0,1,2].map(() => syms[randInt(0, syms.length - 1)]);
    const mult = (r[0] === r[1] && r[1] === r[2]) ? (r[0] === '💎' ? 7 : 3.5) : ((r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? 1.15 : 0);
    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderSlotsBluePng(u, r, bet, win > 0 ? `GAIN : +${win.toLocaleString('fr-FR')} $` : `PERTE : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id, message.author);
    const side = (args[0] || '').toLowerCase();
    const bet = parseAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet || u.cash < bet) return replyContainer(message, { title: '🪙 Coinflip', body: 'Utilisation : `*coinflip <pile|face> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const out = Math.random() < 0.5 ? 'pile' : 'face';
    const won = out === side;
    const payout = Math.floor(bet * 1.8);
    if (won) { u.cash += payout; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderCoinflipBluePng(u, side, out, bet, won ? `GAGNÉ : +${payout.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleDice(message, args) {
    const u = getUser(message.author.id, message.author);
    const guess = parseInt(args[0], 10);
    const bet = parseAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet || u.cash < bet) return replyContainer(message, { title: '🎲 Dice', body: 'Utilisation : `*dice <1-6> <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const roll = randInt(1, 6);
    const won = roll === guess;
    const payout = Math.floor(bet * 3.6);
    if (won) { u.cash += payout; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderDiceBluePng(u, roll, guess, bet, won ? `JACKPOT : +${payout.toLocaleString('fr-FR')} $` : `PERDU : -${bet.toLocaleString('fr-FR')} $`));
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id, message.author);
    const bet = parseAmount(args[0], u.cash);
    if (!bet || u.cash < bet) return replyContainer(message, { title: '🚀 Crash', body: 'Utilisation : `*crash <mise|all>`' });
    u.cash -= bet; u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.2).toFixed(2));
    const targetMult = Number((1.1 + Math.random() * 1.5).toFixed(2));
    const won = crashAt >= targetMult;
    const pay = won ? Math.floor(bet * targetMult) : 0;
    if (won) { u.cash += pay; u.stats.wins += 1; } else { u.stats.losses += 1; }
    saveData();
    return replyImageOnly(message, await renderCrashBluePng(u, crashAt, targetMult, bet, won ? `ENCAISSÉ : +${pay.toLocaleString('fr-FR')} $` : `CRASH : -${bet.toLocaleString('fr-FR')} $`));
}

client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('auction_modal_')) {
        const msgId = interaction.customId.replace('auction_modal_', '');
        const auc = activeAuctions.get(msgId);
        if (!auc || auc.ended || Date.now() >= auc.endsAt) {
            return interaction.reply({ content: 'Cette enchère est terminée.', flags: MessageFlags.Ephemer                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const rawVal = interaction.fields.getTextInputValue('bid_amount').trim();
        const u = getUser(interaction.user.id, interaction.user);
        const bid = parseAmount(rawVal, u.cash);
        const minRequired = auc.highestBid + 1;
        if (!bid || bid < minRequired) {
            return interaction.reply({
                content: `Offre invalide. Entre un montant supérieur à **${formatMoney(auc.highestBid)}** (minimum **${formatMoney(minRequired)}**).`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        if (u.cash < bid) {
            return interaction.reply({
                content: `Tu n'as pas assez de cash (**${formatMoney(u.cash)}** disponibles).`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        auc.highestBid = bid;
        auc.highestBidderId = interaction.user.id;
        auc.highestBidderName = u.username;

        await interaction.message.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [buildAuctionContainer(auc), auctionButtonRow(false)]
        }).catch(() => {});

        return interaction.reply({
            content: `Offre de **${formatMoney(bid)}** enregistrée sur **${auc.title}**.`,
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'auction_bid') {
        const auc = activeAuctions.get(interaction.message.id);
        if (!auc || auc.ended || Date.now() >= auc.endsAt) {
            return interaction.reply({ content: 'Cette enchère est terminée.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const modal = new ModalBuilder()
            .setCustomId(`auction_modal_${interaction.message.id}`)
            .setTitle(`Enchérir • ${auc.title.slice(0, 32)}`);
        const input = new TextInputBuilder()
            .setCustomId('bid_amount')
            .setLabel(`Montant (actuel : ${auc.highestBid} $)`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Ex: ${Math.max(50, auc.highestBid + 50)}`)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal).catch(() => {});
    }

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
        const winAmt = Math.floor(duel.bet * 0.9);
        if (p1Wins) { p1.cash += winAmt; p2.cash -= duel.bet; p1.stats.wins += 1; p2.stats.losses += 1; }
        else { p2.cash += winAmt; p1.cash -= duel.bet; p2.stats.wins += 1; p1.stats.losses += 1; }
        saveData();
        const winner = p1Wins ? p1 : p2;
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [buildContainerV2({ title: '⚔️ Résultat du duel', body: `Victoire de **${winner.username}** (+**${formatMoney(winAmt)}**) !` })]
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
            if (dv === 21) { u.cash += game.bet; status = 'ÉGALITÉ 21'; }
            else { const pay = Math.floor(game.bet * 1.8); u.cash += pay; u.stats.wins += 1; status = `21 WIN +${pay} $`; }
        }
    } else if (interaction.customId === 'bj_stand') {
        finished = true;
        while (handValue(game.dCards) < 17) game.dCards.push(drawCard());
        const pv = handValue(game.pCards), dv = handValue(game.dCards);
        if (dv > 21 || pv > dv) { const pay = Math.floor(game.bet * 1.8); u.cash += pay; u.stats.wins += 1; status = `WIN ${pv} VS ${dv} +${pay} $`; }
        else if (pv === dv) { u.cash += game.bet; status = `ÉGALITÉ ${pv} VS ${dv}`; }
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

    if (cmd === 'owner' || cmd === 'unowner') {
        if (!isSuperOwner(message.author)) {
            return replyContainer(message, { title: '⛔ Accès refusé', body: 'Seul le Super Owner peut gérer les owners.' });
        }
        const targetId = (message.mentions.users.first()?.id || args[0] || '').replace(/[<@!>]/g, '').trim();
        if (!targetId) {
            return replyContainer(message, { title: '👑 Owners', body: `Utilisation : \`*${cmd} <id>\`` });
        }
        if (!Array.isArray(db.owners)) db.owners = [];
        if (cmd === 'owner') {
            if (!db.owners.includes(targetId)) {
                db.owners.push(targetId);
                saveData();
            }
            return replyContainer(message, { title: '👑 Owner ajouté', body: `L'utilisateur **${targetId}** est désormais Owner.` });
        } else {
            db.owners = db.owners.filter((id) => id !== targetId);
            saveData();
            return replyContainer(message, { title: '👑 Owner retiré', body: `L'utilisateur **${targetId}** n'est plus Owner.` });
        }
    }

    if (!isAllowedCasinoChannel(message)) return;
    getUser(message.author.id, message.author);

    if (cmd === 'enchère' || cmd === 'enchere') {
        return handleAuctionCreate(message, args);
    }
    if (cmd === 'reseteconomy') {
        if (!isBotOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé aux Owners.' });
        db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)), casinoCategories: db.casinoCategories || {}, owners: db.owners || [], lotteryPot: 2500 };
        saveData();
        return replyContainer(message, { title: '♻️ Reset OK', body: 'Économie réinitialisée à **0 $**.' });
    }
    if (cmd === 'setmoney') {
        if (!isBotOwner(message.author)) return replyContainer(message, { title: '⛔ Accès refusé', body: 'Réservé aux Owners.' });
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
    if (cmd === 'mine') return handleMine(message);
    if (cmd === 'fish') return handleFish(message);
    if (cmd === 'gift') return handleGift(message, args);
    if (cmd === 'rob') return handleRob(message);
    if (cmd === 'monopoly' || cmd === 'immo' || cmd === 'company') return handleMonopoly(message, args);
    if (cmd === 'crypto' || cmd === 'bourse') return handleCrypto(message, args);
    if (cmd === 'hack') return handleHack(message);
    if (cmd === 'heist') return handleHeist(message);
    if (cmd === 'scratch') return handleScratch(message, args);
    if (cmd === 'spin') return handleSpin(message, args);
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

setInterval(() => {
    for (const sym of Object.keys(db.cryptos)) {
        const c = db.cryptos[sym];
        const delta = 1 + ((Math.random() - 0.5) * 0.09);
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

client.once('clientReady', () => console.log(`Kyuro Casino v6.3 prêt : ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
