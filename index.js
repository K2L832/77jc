// Build Revision: K2L-Casino-Blue-v1.0 (Prefix: *)
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
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

let createCanvas = null;
try {
    ({ createCanvas } = require('@napi-rs/canvas'));
} catch (e) {
    try {
        ({ createCanvas } = require('canvas'));
    } catch (e2) {
        createCanvas = null;
    }
}

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Casino Blue Operational v1.0!\n');
}).listen(PORT, '0.0.0.0', () => console.log(`Serveur HTTP Casino actif sur le port ${PORT}`));

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
const DATA_FILE = path.join(DATA_DIR, 'casino-data.json');

const activeBlackjacks = new Map();

const DEFAULT_CRYPTOS = {
    BTC: { name: 'Bitcoin', price: 68500, history: [64200, 65100, 64800, 66700, 67900, 68500] },
    ETH: { name: 'Ethereum', price: 3450, history: [3180, 3240, 3210, 3320, 3390, 3450] },
    K2L: { name: 'K2L Coin', price: 1250, history: [820, 910, 980, 1050, 1180, 1250] },
    SOL: { name: 'Solana', price: 215, history: [185, 192, 189, 201, 208, 215] }
};

let db = {
    users: {},
    cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS))
};

function isSuperOwner(user) {
    if (!user) return false;
    if (user.id === SUPER_OWNER_ID) return true;
    const uname = (user.username || '').toLowerCase();
    const gname = (user.globalName || '').toLowerCase();
    return SUPER_OWNER_HANDLES.has(uname) || SUPER_OWNER_HANDLES.has(gname);
}

function saveData() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.error('Erreur sauvegarde casino-data.json:', err.message);
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
    } catch (err) {
        console.error('Erreur chargement casino-data.json:', err.message);
    }
}

loadData();

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            cash: 2500,
            bank: 1000,
            crypto: { BTC: 0, ETH: 0, K2L: 0, SOL: 0 },
            company: null, // { name, level, incomePerHour, lastCollect, balance }
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: {
                work: 0,
                daily: 0,
                crime: 0,
                rob: 0,
                hack: 0
            }
        };
        saveData();
    }
    const u = db.users[userId];
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, K2L: 0, SOL: 0 };
    if (!u.stats) u.stats = { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 };
    if (!u.cooldowns) u.cooldowns = { work: 0, daily: 0, crime: 0, rob: 0, hack: 0 };
    return u;
}

function formatMoney(amount) {
    return `${Math.floor(amount).toLocaleString('fr-FR')} ${CURRENCY}`;
}

function formatCooldown(msLeft) {
    const totalSec = Math.ceil(msLeft / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// Mise à jour périodique des cours crypto + graphique
setInterval(() => {
    for (const sym of Object.keys(db.cryptos)) {
        const c = db.cryptos[sym];
        const deltaPct = (Math.random() * 0.14) - 0.068; // -6.8% à +7.2%
        c.price = Math.max(10, Math.round(c.price * (1 + deltaPct)));
        c.history.push(c.price);
        if (c.history.length > 16) c.history.shift();
    }
    saveData();
}, 120000);
function drawBlueBackdrop(ctx, w, h, title, subtitle) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#040b1c');
    grad.addColorStop(0.5, '#091e42');
    grad.addColorStop(1, '#05132b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Halo bleu lumineux en arrière-plan
    const glow1 = ctx.createRadialGradient(w * 0.82, h * 0.18, 20, w * 0.82, h * 0.18, 340);
    glow1.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    glow1.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, w, h);

    const glow2 = ctx.createRadialGradient(w * 0.15, h * 0.88, 15, w * 0.15, h * 0.88, 280);
    glow2.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
    glow2.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, w, h);

    // Grille subtile cyber-bleu
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Carte intérieure bleutée
    ctx.fillStyle = 'rgba(15, 39, 82, 0.72)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(24, 24, w - 48, h - 48, 22);
    ctx.fill();
    ctx.stroke();

    // En-tête
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('K2L CASINO BLUE • SYSTEM', 48, 56);

    ctx.fillStyle = '#f0f9ff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(title, 48, 92);

    if (subtitle) {
        ctx.fillStyle = '#93c5fd';
        ctx.font = '17px sans-serif';
        ctx.fillText(subtitle, 48, 118);
    }
}

async function renderBalanceImage(targetUser, data) {
    if (!createCanvas) return null;
    const w = 820, h = 400;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    drawBlueBackdrop(ctx, w, h, `PORTEFEUILLE • ${targetUser.username.toUpperCase()}`, `ID: ${targetUser.id}`);

    const totalNet = data.cash + data.bank;
    const boxes = [
        { label: 'CASH DISPONIBLE', val: `${data.cash.toLocaleString('fr-FR')} 🪙`, accent: '#38bdf8' },
        { label: 'COMPTE BANCAIRE', val: `${data.bank.toLocaleString('fr-FR')} 🪙`, accent: '#60a5fa' },
        { label: 'PATRIMOINE TOTAL', val: `${totalNet.toLocaleString('fr-FR')} 🪙`, accent: '#22d3ee' }
    ];

    boxes.forEach((b, idx) => {
        const bx = 48 + idx * 244;
        const by = 150;
        ctx.fillStyle = 'rgba(7, 23, 54, 0.85)';
        ctx.strokeStyle = b.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, 228, 120, 14);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(b.label, bx + 16, by + 34);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(b.val, bx + 16, by + 76);
    });

    const compText = data.company
        ? `Entreprise : ${data.company.name} (Niv. ${data.company.level}) • Caisse : ${data.company.balance.toLocaleString('fr-FR')} 🪙`
        : 'Entreprise : Aucune (*createcompany <nom>)';

    ctx.fillStyle = '#bae6fd';
    ctx.font = '16px sans-serif';
    ctx.fillText(compText, 48, 315);
    ctx.fillText(`Victoires : ${data.stats.wins} • Défaites : ${data.stats.losses} • Hacks réussis : ${data.stats.hacksSuccess}`, 48, 344);

    return new AttachmentBuilder(await canvas.encode('png'), { name: 'balance-blue.png' });
}

async function renderCryptoChartImage(symbol, cryptoObj, userAmount) {
    if (!createCanvas) return null;
    const w = 840, h = 430;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    const hist = cryptoObj.history || [cryptoObj.price];
    const first = hist[0];
    const last = hist[hist.length - 1];
    const diffPct = first > 0 ? (((last - first) / first) * 100).toFixed(2) : '0.00';

    drawBlueBackdrop(
        ctx,
        w,
        h,
        `${cryptoObj.name.toUpperCase()} (${symbol}) • ${cryptoObj.price.toLocaleString('fr-FR')} 🪙`,
        `Variation récente : ${diffPct >= 0 ? '+' : ''}${diffPct}% • Ton solde : ${userAmount} ${symbol}`
    );

    const gx = 64, gy = 148, gw = 712, gh = 225;
    ctx.fillStyle = 'rgba(4, 15, 38, 0.78)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 12);
    ctx.fill();
    ctx.stroke();

    const minV = Math.min(...hist);
    const maxV = Math.max(...hist);
    const span = Math.max(1, maxV - minV);

    const points = hist.map((val, i) => {
        const px = gx + 20 + (i / Math.max(1, hist.length - 1)) * (gw - 40);
        const py = gy + gh - 24 - ((val - minV) / span) * (gh - 48);
        return { x: px, y: py };
    });

    // Zone remplie sous la courbe en dégradé bleu
    const areaGrad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    areaGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
    areaGrad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, gy + gh - 12);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, gy + gh - 12);
    ctx.closePath();
    ctx.fill();

    // Courbe principale
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    for (const p of points) {
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
    }

    return new AttachmentBuilder(await canvas.encode('png'), { name: `crypto-${symbol.toLowerCase()}.png` });
}

async function renderGameImage(title, subtitle, lines) {
    if (!createCanvas) return null;
    const w = 800, h = 380;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    drawBlueBackdrop(ctx, w, h, title, subtitle);

    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 21px sans-serif';
    lines.forEach((line, idx) => {
        ctx.fillText(line, 48, 175 + idx * 42);
    });

    return new AttachmentBuilder(await canvas.encode('png'), { name: 'casino-blue-card.png' });
}
function buildContainerV2({ title, body, footer }) {
    const container = new ContainerBuilder()
        .setAccentColor(0x0ea5e9)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${title}\n${body}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footer || 'K2L Casino Blue • Préfixe *'}`)
        );
    return container;
}

async function replyBlue(message, { title, body, attachment, footer, components = [] }) {
    const container = buildContainerV2({ title, body, footer });
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container, ...components]
    };
    if (attachment) {
        payload.files = [attachment];
    }
    try {
        return await message.reply(payload);
    } catch (e) {
        // Repli classique Embed + Attachment si IsComponentsV2 n'est pas supporté par la version discord.js
        const fallbackEmbed = new EmbedBuilder()
            .setColor('#0ea5e9')
            .setTitle(title)
            .setDescription(body)
            .setFooter({ text: footer || 'K2L Casino Blue • Préfixe *' });
        if (attachment) fallbackEmbed.setImage(`attachment://${attachment.name}`);
        return message.reply({
            embeds: [fallbackEmbed],
            files: attachment ? [attachment] : [],
            components
        });
    }
}
function drawCard() {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠', '♥', '♦', '♣'];
    return `${ranks[Math.floor(Math.random() * ranks.length)]}${suits[Math.floor(Math.random() * suits.length)]}`;
}

function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
        const r = c.slice(0, -1);
        if (r === 'A') {
            total += 11;
            aces++;
        } else if (['K', 'Q', 'J'].includes(r)) {
            total += 10;
        } else {
            total += parseInt(r, 10);
        }
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

async function handleBlackjack(message, args) {
    const u = getUser(message.author.id);
    const bet = parseInt(args[0], 10);
    if (isNaN(bet) || bet <= 0) {
        return replyBlue(message, {
            title: '🃏 BLACKJACK',
            body: 'Utilisation : `*blackjack <mise>` ou `*bj <mise>`'
        });
    }
    if (u.cash < bet) {
        return replyBlue(message, {
            title: '🃏 BLACKJACK',
            body: `❌ Fonds insuffisants en cash (${formatMoney(u.cash)}).`
        });
    }

    u.cash -= bet;
    u.stats.wagered += bet;
    saveData();

    const playerCards = [drawCard(), drawCard()];
    const dealerCards = [drawCard(), drawCard()];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
    );

    const img = await renderGameImage(
        'BLACKJACK TABLE • BLEU CYBER',
        `Mise : ${bet.toLocaleString('fr-FR')} 🪙`,
        [
            `Tes cartes : ${playerCards.join('  ')}  (${handValue(playerCards)})`,
            `Croupier : ${dealerCards[0]}  [?]`
        ]
    );

    const sent = await replyBlue(message, {
        title: '🃏 BLACKJACK EN COURS',
        body: `**Mise :** ${formatMoney(bet)}\n**Ta main :** \`${playerCards.join(' ')}\` (**${handValue(playerCards)}**)\n**Croupier :** \`${dealerCards[0]}\` \`[?]\``,
        attachment: img,
        components: [row]
    });

    activeBlackjacks.set(sent.id, {
        userId: message.author.id,
        bet,
        playerCards,
        dealerCards
    });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id);
    const choiceRaw = (args[0] || '').toLowerCase();
    const bet = parseInt(args[1], 10);

    const validChoices = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];
    if (!validChoices.includes(choiceRaw) || isNaN(bet) || bet <= 0) {
        return replyBlue(message, {
            title: '🎡 ROULETTE',
            body: 'Utilisation : `*roulette <rouge|noir|vert|pair|impair> <mise>`'
        });
    }
    if (u.cash < bet) {
        return replyBlue(message, {
            title: '🎡 ROULETTE',
            body: `❌ Tu n'as pas assez de cash (${formatMoney(u.cash)}).`
        });
    }

    u.cash -= bet;
    u.stats.wagered += bet;

    const num = Math.floor(Math.random() * 37); // 0 à 36
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir');
    const parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');

    const normChoice = ['rouge', 'red'].includes(choiceRaw) ? 'rouge'
        : ['noir', 'black'].includes(choiceRaw) ? 'noir'
        : ['vert', 'green'].includes(choiceRaw) ? 'vert'
        : ['pair', 'even'].includes(choiceRaw) ? 'pair' : 'impair';

    let won = false;
    let mult = 0;
    if (normChoice === 'vert' && color === 'vert') { won = true; mult = 14; }
    else if (normChoice === color) { won = true; mult = 2; }
    else if (normChoice === parity) { won = true; mult = 2; }

    const payout = won ? bet * mult : 0;
    if (won) {
        u.cash += payout;
        u.stats.wins += 1;
    } else {
        u.stats.losses += 1;
    }
    saveData();

    const img = await renderGameImage(
        `ROULETTE • NUMÉRO ${num} (${color.toUpperCase()})`,
        won ? `GAGNÉ +${payout.toLocaleString('fr-FR')} 🪙` : `PERDU -${bet.toLocaleString('fr-FR')} 🪙`,
        [
            `Résultat : ${num} • Couleur : ${color} • Parité : ${parity}`,
            `Ton pari : ${normChoice} • Nouveau cash : ${u.cash.toLocaleString('fr-FR')} 🪙`
        ]
    );

    return replyBlue(message, {
        title: won ? '🎡 ROULETTE • VICTOIRE' : '🎡 ROULETTE • DÉFAITE',
        body: `**Bille :** \`${num}\` (**${color.toUpperCase()}** / ${parity})\n**Pari :** \`${normChoice}\` • **Mise :** ${formatMoney(bet)}\n**Gain :** ${won ? `+${formatMoney(payout)}` : `-${formatMoney(bet)}`}\n**Cash :** ${formatMoney(u.cash)}`,
        attachment: img
    });
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id);
    const bet = parseInt(args[0], 10);
    if (isNaN(bet) || bet <= 0) {
        return replyBlue(message, { title: '🎰 MACHINE À SOUS', body: 'Utilisation : `*slots <mise>`' });
    }
    if (u.cash < bet) {
        return replyBlue(message, { title: '🎰 MACHINE À SOUS', body: `❌ Cash insuffisant (${formatMoney(u.cash)}).` });
    }

    u.cash -= bet;
    u.stats.wagered += bet;
    const syms = ['💎', '💠', '🪙', '⚡', '🔥'];
    const r = [0, 1, 2].map(() => syms[Math.floor(Math.random() * syms.length)]);

    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === '💎' ? 10 : 5;
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;

    const win = Math.floor(bet * mult);
    if (win > 0) {
        u.cash += win;
        u.stats.wins += 1;
    } else {
        u.stats.losses += 1;
    }
    saveData();

    const img = await renderGameImage(
        'SLOTS BLUE • JACKPOT',
        `Rouleaux : [ ${r.join(' | ')} ]`,
        [
            win > 0 ? `Gain : +${win.toLocaleString('fr-FR')} 🪙` : `Perte : -${bet.toLocaleString('fr-FR')} 🪙`,
            `Cash actuel : ${u.cash.toLocaleString('fr-FR')} 🪙`
        ]
    );

    return replyBlue(message, {
        title: '🎰 MACHINE À SOUS',
        body: `**[ ${r.join(' | ')} ]**\n${win > 0 ? `✅ Gain : **+${formatMoney(win)}**` : `❌ Perte : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`,
        attachment: img
    });
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id);
    const side = (args[0] || '').toLowerCase();
    const bet = parseInt(args[1], 10);
    if (!['pile', 'face'].includes(side) || isNaN(bet) || bet <= 0) {
        return replyBlue(message, { title: '🪙 COINFLIP', body: 'Utilisation : `*coinflip <pile|face> <mise>`' });
    }
    if (u.cash < bet) {
        return replyBlue(message, { title: '🪙 COINFLIP', body: `❌ Cash insuffisant (${formatMoney(u.cash)}).` });
    }
    u.cash -= bet;
    u.stats.wagered += bet;
    const outcome = Math.random() < 0.5 ? 'pile' : 'face';
    const won = outcome === side;
    if (won) {
        u.cash += bet * 2;
        u.stats.wins += 1;
    } else {
        u.stats.losses += 1;
    }
    saveData();

    const img = await renderGameImage(
        `COINFLIP • ${outcome.toUpperCase()}`,
        won ? `GAGNÉ +${(bet * 2).toLocaleString('fr-FR')} 🪙` : `PERDU -${bet.toLocaleString('fr-FR')} 🪙`,
        [`Choix : ${side} • Résultat : ${outcome}`, `Cash : ${u.cash.toLocaleString('fr-FR')} 🪙`]
    );

    return replyBlue(message, {
        title: '🪙 COINFLIP',
        body: `**Pièce :** \`${outcome.toUpperCase()}\` • **Choix :** \`${side}\`\n${won ? `✅ Gain : **+${formatMoney(bet * 2)}**` : `❌ Perte : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`,
        attachment: img
    });
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const data = getUser(target.id);
    const img = await renderBalanceImage(target, data);
    return replyBlue(message, {
        title: `💳 BALANCE • ${target.username}`,
        body: `**Cash :** ${formatMoney(data.cash)}\n**Banque :** ${formatMoney(data.bank)}\n**Total :** ${formatMoney(data.cash + data.bank)}`,
        attachment: img
    });
}

function handleDeposit(message, args) {
    const u = getUser(message.author.id);
    const amount = args[0]?.toLowerCase() === 'all' ? u.cash : parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0 || u.cash < amount) {
        return replyBlue(message, { title: '🏦 DÉPÔT', body: 'Utilisation : `*deposit <montant|all>`' });
    }
    u.cash -= amount;
    u.bank += amount;
    saveData();
    return replyBlue(message, {
        title: '🏦 DÉPÔT EFFECTUÉ',
        body: `Déposé **${formatMoney(amount)}** en banque.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}`
    });
}

function handleWithdraw(message, args) {
    const u = getUser(message.author.id);
    const amount = args[0]?.toLowerCase() === 'all' ? u.bank : parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0 || u.bank < amount) {
        return replyBlue(message, { title: '🏦 RETRAIT', body: 'Utilisation : `*withdraw <montant|all>`' });
    }
    u.bank -= amount;
    u.cash += amount;
    saveData();
    return replyBlue(message, {
        title: '🏦 RETRAIT EFFECTUÉ',
        body: `Retiré **${formatMoney(amount)}** vers ton cash.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}`
    });
}

function handleWork(message) {
    const u = getUser(message.author.id);
    const now = Date.now();
    const cd = 30 * 60 * 1000;
    if (now - u.cooldowns.work < cd) {
        return replyBlue(message, { title: '💼 TRAVAIL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - u.cooldowns.work))}**.` });
    }
    u.cooldowns.work = now;
    const gain = Math.floor(Math.random() * 900) + 450;
    u.cash += gain;
    saveData();
    return replyBlue(message, { title: '💼 TRAVAIL', body: `Tu as gagné **+${formatMoney(gain)}** !` });
}

function handleDaily(message) {
    const u = getUser(message.author.id);
    const now = Date.now();
    const cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) {
        return replyBlue(message, { title: '🎁 DAILY', body: `⏳ Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    }
    u.cooldowns.daily = now;
    const gain = 2500;
    u.cash += gain;
    saveData();
    return replyBlue(message, { title: '🎁 RÉCOMPENSE QUOTIDIENNE', body: `Tu as reçu **+${formatMoney(gain)}** !` });
}

function handlePay(message, args) {
    const sender = getUser(message.author.id);
    const target = message.mentions.users.first();
    const amount = parseInt(args[1], 10);
    if (!target || target.bot || target.id === message.author.id || isNaN(amount) || amount <= 0) {
        return replyBlue(message, { title: '💸 VIREMENT', body: 'Utilisation : `*pay <@membre> <montant>`' });
    }
    if (sender.cash < amount) {
        return replyBlue(message, { title: '💸 VIREMENT', body: '❌ Cash insuffisant.' });
    }
    const receiver = getUser(target.id);
    sender.cash -= amount;
    receiver.cash += amount;
    saveData();
    return replyBlue(message, {
        title: '💸 VIREMENT ENVOYÉ',
        body: `Tu as envoyé **${formatMoney(amount)}** à ${target}.`
    });
}

function getCompanyAccumulated(comp) {
    if (!comp) return 0;
    const elapsedHours = Math.min(24, (Date.now() - (comp.lastCollect || Date.now())) / 3600000);
    return Math.floor(elapsedHours * comp.incomePerHour);
}

async function handleCompany(message, args) {
    const u = getUser(message.author.id);
    const sub = (args[0] || 'info').toLowerCase();

    if (sub === 'create') {
        if (u.company) {
            return replyBlue(message, { title: '🏢 ENTREPRISE', body: `Tu possèdes déjà **${u.company.name}**.` });
        }
        const cost = 5000;
        const name = args.slice(1).join(' ').trim() || 'BlueCorp';
        if (u.cash < cost) {
            return replyBlue(message, { title: '🏢 ENTREPRISE', body: `❌ Il faut **${formatMoney(cost)}** en cash pour créer une entreprise.` });
        }
        u.cash -= cost;
        u.company = {
            name,
            level: 1,
            incomePerHour: 600,
            lastCollect: Date.now(),
            balance: 0
        };
        saveData();
        const img = await renderGameImage(`ENTREPRISE • ${name.toUpperCase()}`, 'Niveau 1 • Revenu : 600 🪙/h', ['Création réussie !', `Utilise *company collect pour récupérer les gains.`]);
        return replyBlue(message, { title: '🏢 ENTREPRISE CRÉÉE', body: `**${name}** créée pour **${formatMoney(cost)}** !`, attachment: img });
    }

    if (!u.company) {
        return replyBlue(message, { title: '🏢 ENTREPRISE', body: 'Aucune entreprise. Utilise `*company create <nom>` (coût : 5 000 🪙).' });
    }

    if (sub === 'collect') {
        const pending = getCompanyAccumulated(u.company);
        u.company.lastCollect = Date.now();
        u.cash += pending;
        saveData();
        return replyBlue(message, {
            title: '🏢 RÉCOLTE ENTREPRISE',
            body: `Tu as récolté **+${formatMoney(pending)}** de **${u.company.name}**.`
        });
    }

    if (sub === 'upgrade') {
        const upCost = u.company.level * 4000;
        if (u.cash < upCost) {
            return replyBlue(message, { title: '🏢 AMÉLIORATION', body: `❌ Il faut **${formatMoney(upCost)}** en cash pour passer niveau ${u.company.level + 1}.` });
        }
        const pending = getCompanyAccumulated(u.company);
        u.cash += pending - upCost;
        u.company.level += 1;
        u.company.incomePerHour += 550;
        u.company.lastCollect = Date.now();
        saveData();
        return replyBlue(message, {
            title: '🏢 ENTREPRISE AMÉLIORÉE',
            body: `**${u.company.name}** est maintenant niveau **${u.company.level}** (${formatMoney(u.company.incomePerHour)}/h) !`
        });
    }

    const pending = getCompanyAccumulated(u.company);
    const img = await renderGameImage(
        `ENTREPRISE • ${u.company.name.toUpperCase()}`,
        `Niveau ${u.company.level} • ${u.company.incomePerHour.toLocaleString('fr-FR')} 🪙/h`,
        [`À récolter : ${pending.toLocaleString('fr-FR')} 🪙`, 'Commandes : *company collect | *company upgrade']
    );
    return replyBlue(message, {
        title: `🏢 ${u.company.name}`,
        body: `**Niveau :** ${u.company.level}\n**Revenu horaire :** ${formatMoney(u.company.incomePerHour)}/h\n**En attente :** ${formatMoney(pending)}`,
        attachment: img
    });
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id);
    const sub = (args[0] || 'market').toLowerCase();

    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0) {
            return replyBlue(message, { title: '📈 CRYPTO ACHAT', body: 'Utilisation : `*crypto buy <BTC|ETH|K2L|SOL> <quantité>`' });
        }
        const totalCost = Math.ceil(amount * c.price);
        if (u.cash < totalCost) {
            return replyBlue(message, { title: '📈 CRYPTO ACHAT', body: `❌ Il faut **${formatMoney(totalCost)}** en cash.` });
        }
        u.cash -= totalCost;
        u.crypto[sym] = (u.crypto[sym] || 0) + amount;
        saveData();
        const chart = await renderCryptoChartImage(sym, c, u.crypto[sym]);
        return replyBlue(message, {
            title: `📈 ACHAT ${sym}`,
            body: `Acheté **${amount} ${sym}** pour **${formatMoney(totalCost)}**.`,
            attachment: chart
        });
    }

    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0 || (u.crypto[sym] || 0) < amount) {
            return replyBlue(message, { title: '📉 CRYPTO VENTE', body: 'Utilisation : `*crypto sell <BTC|ETH|K2L|SOL> <quantité>`' });
        }
        const gain = Math.floor(amount * c.price);
        u.crypto[sym] -= amount;
        u.cash += gain;
        saveData();
        const chart = await renderCryptoChartImage(sym, c, u.crypto[sym]);
        return replyBlue(message, {
            title: `📉 VENTE ${sym}`,
            body: `Vendu **${amount} ${sym}** pour **+${formatMoney(gain)}**.`,
            attachment: chart
        });
    }

    const sym = sub.toUpperCase();
    const targetSym = db.cryptos[sym] ? sym : 'K2L';
    const c = db.cryptos[targetSym];
    const chart = await renderCryptoChartImage(targetSym, c, u.crypto[targetSym] || 0);
    const listStr = Object.entries(db.cryptos)
        .map(([k, v]) => `• **${k}** (${v.name}) : **${formatMoney(v.price)}** — Ton solde : \`${u.crypto[k] || 0}\``)
        .join('\n');

    return replyBlue(message, {
        title: '📊 MARCHÉ CRYPTO BLUE',
        body: `${listStr}\n\n*Achat :* \`*crypto buy <SYM> <qté>\` • *Vente :* \`*crypto sell <SYM> <qté>\` • *Graph :* \`*crypto <SYM>\``,
        attachment: chart
    });
}

async function handleHack(message, args) {
    const attackerData = getUser(message.author.id);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyBlue(message, { title: '💻 HACK SYSTEM', body: 'Utilisation : `*hack <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyBlue(message, { title: '💻 HACK BLOQUÉ', body: '🛡️ Impossible de hacker le Super Owner.' });
    }

    const now = Date.now();
    const cd = 45 * 60 * 1000;
    if (now - attackerData.cooldowns.hack < cd) {
        return replyBlue(message, { title: '💻 HACK SYSTEM', body: `⏳ Recharge firewall : **${formatCooldown(cd - (now - attackerData.cooldowns.hack))}**.` });
    }
    attackerData.cooldowns.hack = now;

    const targetData = getUser(target.id);
    const success = Math.random() < 0.48;

    if (success && targetData.cash >= 200) {
        const stolen = Math.min(targetData.cash, Math.max(250, Math.floor(targetData.cash * (0.1 + Math.random() * 0.2))));
        targetData.cash -= stolen;
        attackerData.cash += stolen;
        attackerData.stats.hacksSuccess += 1;
        saveData();

        const img = await renderGameImage(
            'BREACH RÉUSSIE • SYSTÈME COMPROMIS',
            `Cible : ${target.username}`,
            [`Butin exfiltré : +${stolen.toLocaleString('fr-FR')} 🪙`, `Cash attaquant : ${attackerData.cash.toLocaleString('fr-FR')} 🪙`]
        );
        return replyBlue(message, {
            title: '💻 HACK RÉUSSI',
            body: `Tu as piraté **${target.username}** et volé **+${formatMoney(stolen)}** !`,
            attachment: img
        });
    } else {
        const fine = Math.min(attackerData.cash, 450);
        attackerData.cash -= fine;
        saveData();

        const img = await renderGameImage(
            'TRACE DÉTECTÉE • INTRUSION BLOQUÉE',
            `Cible : ${target.username}`,
            [`Pénalité trace : -${fine.toLocaleString('fr-FR')} 🪙`, `Cash restant : ${attackerData.cash.toLocaleString('fr-FR')} 🪙`]
        );
        return replyBlue(message, {
            title: '🚨 HACK ÉCHOUÉ',
            body: `Ta connexion a été repérée ! Tu perds **-${formatMoney(fine)}**.`,
            attachment: img
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

    const u = getUser(game.userId);
    let finished = false;
    let outcomeText = '';

    if (interaction.customId === 'bj_hit') {
        game.playerCards.push(drawCard());
        const pVal = handValue(game.playerCards);
        if (pVal > 21) {
            finished = true;
            u.stats.losses += 1;
            outcomeText = `💥 Bust (${pVal}) ! Tu perds **${formatMoney(game.bet)}**.`;
        } else if (pVal === 21) {
            finished = true;
            while (handValue(game.dealerCards) < 17) game.dealerCards.push(drawCard());
            const dVal = handValue(game.dealerCards);
            if (dVal === 21) {
                u.cash += game.bet;
                outcomeText = `🤝 Égalité à 21 ! Mise remboursée (**${formatMoney(game.bet)}**).`;
            } else {
                const win = game.bet * 2;
                u.cash += win;
                u.stats.wins += 1;
                outcomeText = `🔥 21 gagnant ! Tu remportes **+${formatMoney(win)}** !`;
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
            outcomeText = `🏆 Victoire (${pVal} vs ${dVal}) ! Gain : **+${formatMoney(win)}**.`;
        } else if (pVal === dVal) {
            u.cash += game.bet;
            outcomeText = `🤝 Égalité (${pVal} vs ${dVal}) ! Mise rendue.`;
        } else {
            u.stats.losses += 1;
            outcomeText = `❌ Croupier gagnant (${pVal} vs ${dVal}). Perdu : **${formatMoney(game.bet)}**.`;
        }
    }

    saveData();

    const pVal = handValue(game.playerCards);
    const dVal = handValue(game.dealerCards);
    const body = finished
        ? `**Ta main :** \`${game.playerCards.join(' ')}\` (**${pVal}**)\n**Croupier :** \`${game.dealerCards.join(' ')}\` (**${dVal}**)\n\n${outcomeText}\n**Cash :** ${formatMoney(u.cash)}`
        : `**Mise :** ${formatMoney(game.bet)}\n**Ta main :** \`${game.playerCards.join(' ')}\` (**${pVal}**)\n**Croupier :** \`${game.dealerCards[0]}\` \`[?]\``;

    const container = buildContainerV2({
        title: finished ? '🃏 BLACKJACK TERMINÉ' : '🃏 BLACKJACK EN COURS',
        body
    });

    if (finished) {
        activeBlackjacks.delete(interaction.message.id);
    }

    await interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: finished ? [container] : [
            container,
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

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = (args.shift() || '').toLowerCase();

    if (command === 'reseteconomy') {
        if (!isSuperOwner(message.author)) {
            return replyBlue(message, {
                title: '⛔ ACCÈS REFUSÉ',
                body: 'La commande `*reseteconomy` est strictement réservée au Super Owner (**graveuhq**).'
            });
        }
        db = {
            users: {},
            cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS))
        };
        saveData();
        return replyBlue(message, {
            title: '♻️ ÉCONOMIE RÉINITIALISÉE',
            body: 'Toutes les balances, entreprises, portefeuilles crypto et statistiques ont été remis à zéro par le Super Owner.'
        });
    }

    if (command === 'help') {
        const helpBody = [
            '**💰 Économie**',
            '`*balance [@membre]` • `*deposit <montant|all>` • `*withdraw <montant|all>` • `*work` • `*daily` • `*pay <@membre> <montant>`',
            '',
            '**🎰 Casino**',
            '`*blackjack <mise>` (`*bj`) • `*roulette <rouge|noir|vert|pair|impair> <mise>` • `*slots <mise>` • `*coinflip <pile|face> <mise>`',
            '',
            '**🏢 Entreprise, 📈 Crypto & 💻 Hack**',
            '`*company create <nom>` • `*company collect` • `*company upgrade`',
            '`*crypto [SYM]` • `*crypto buy <SYM> <qté>` • `*crypto sell <SYM> <qté>`',
            '`*hack <@membre>` • `*leaderboard` (`*lb`)',
            '',
            '**👑 Super Owner**',
            '`*reseteconomy` (réservé à `graveuhq` / ID `1166445202148442112`)'
        ].join('\n');

        return replyBlue(message, {
            title: '💠 K2L CASINO BLUE • MENU D\'AIDE',
            body: helpBody
        });
    }

    if (command === 'balance' || command === 'bal') return handleBalance(message);
    if (command === 'deposit' || command === 'dep') return handleDeposit(message, args);
    if (command === 'withdraw' || command === 'with') return handleWithdraw(message, args);
    if (command === 'work') return handleWork(message);
    if (command === 'daily') return handleDaily(message);
    if (command === 'pay') return handlePay(message, args);

    if (command === 'blackjack' || command === 'bj') return handleBlackjack(message, args);
    if (command === 'roulette' || command === 'rl') return handleRoulette(message, args);
    if (command === 'slots' || command === 'slot') return handleSlots(message, args);
    if (command === 'coinflip' || command === 'cf') return handleCoinflip(message, args);

    if (command === 'company' || command === 'entreprise') return handleCompany(message, args);
    if (command === 'crypto' || command === 'bourse') return handleCrypto(message, args);
    if (command === 'hack') return handleHack(message, args);

    if (command === 'leaderboard' || command === 'lb' || command === 'top') {
        const entries = Object.entries(db.users)
            .map(([id, u]) => ({ id, total: (u.cash || 0) + (u.bank || 0) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const text = entries.length > 0
            ? entries.map((e, i) => `**#${i + 1}** <@${e.id}> — **${formatMoney(e.total)}**`).join('\n')
            : 'Aucun joueur enregistré pour le moment.';

        const img = await renderGameImage(
            'CLASSEMENT • TOP FORTUNES',
            'Serveur Casino Blue',
            entries.slice(0, 5).map((e, i) => `#${i + 1} • ID ${e.id.slice(-4)} : ${e.total.toLocaleString('fr-FR')} 🪙`)
        );

        return replyBlue(message, {
            title: '🏆 CLASSEMENT ÉCONOMIE',
            body: text,
            attachment: img
        });
    }
});

client.on('ready', () => {
    console.log(`Casino Bot connecté en tant que ${client.user.tag} (Préfixe ${PREFIX}) !`);
});

client.login(process.env.DISCORD_TOKEN);
