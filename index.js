// Build Revision: K2L-Casino-Clean-v2.0 (Prefix: *)
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

let Resvg = null;
try {
    ({ Resvg } = require('@resvg/resvg-js'));
} catch (e) {
    Resvg = null;
}

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Casino Operational v2.0!\n');
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

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            cash: 2500,
            bank: 1000,
            crypto: { BTC: 0, ETH: 0, K2L: 0, SOL: 0 },
            company: null,
            stats: { wins: 0, losses: 0, wagered: 0, hacksSuccess: 0 },
            cooldowns: { work: 0, daily: 0, crime: 0, rob: 0, hack: 0 }
        };
        saveData();
    }
    const u = db.users[userId];
    if (!u.crypto) u.crypto = { BTC: 0, ETH: 0, K2L: 0, SOL: 0 };
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

function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildBlueCardSvg({ title, subtitle, cards = [], footerLine = '' }) {
    const w = 820, h = 360;
    const cardBoxes = cards.slice(0, 3).map((c, idx) => {
        const x = 44 + idx * 248;
        const y = 136;
        return `
            <rect x="${x}" y="${y}" width="232" height="118" rx="14" fill="#071938" stroke="#38bdf8" stroke-width="1.6"/>
            <text x="${x + 16}" y="${y + 34}" fill="#7dd3fc" font-family="sans-serif" font-size="13" font-weight="bold">${escapeXml(c.label)}</text>
            <text x="${x + 16}" y="${y + 76}" fill="#f0f9ff" font-family="sans-serif" font-size="22" font-weight="bold">${escapeXml(c.value)}</text>
        `;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#030917"/>
                <stop offset="55%" stop-color="#081e44"/>
                <stop offset="100%" stop-color="#041129"/>
            </linearGradient>
            <radialGradient id="glowBlue" cx="85%" cy="15%" r="55%">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
            </radialGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
        <rect width="${w}" height="${h}" fill="url(#glowBlue)"/>
        <rect x="22" y="22" width="${w - 44}" height="${h - 44}" rx="20" fill="#0c2654" fill-opacity="0.72" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="2"/>
        <text x="44" y="54" fill="#38bdf8" font-family="sans-serif" font-size="13" font-weight="bold" letter-spacing="1.5">K2L CASINO • BLUE EDITION</text>
        <text x="44" y="88" fill="#ffffff" font-family="sans-serif" font-size="27" font-weight="bold">${escapeXml(title)}</text>
        <text x="44" y="114" fill="#bae6fd" font-family="sans-serif" font-size="15">${escapeXml(subtitle)}</text>
        ${cardBoxes}
        <text x="44" y="302" fill="#93c5fd" font-family="sans-serif" font-size="15">${escapeXml(footerLine)}</text>
    </svg>`;
}

function buildCryptoChartSvg(symbol, cryptoObj, userAmount) {
    const w = 820, h = 380;
    const hist = cryptoObj.history && cryptoObj.history.length > 1 ? cryptoObj.history : [cryptoObj.price, cryptoObj.price];
    const minV = Math.min(...hist);
    const maxV = Math.max(...hist);
    const span = Math.max(1, maxV - minV);

    const gx = 56, gy = 132, gw = 708, gh = 185;
    const pts = hist.map((val, i) => {
        const x = gx + 16 + (i / (hist.length - 1)) * (gw - 32);
        const y = gy + gh - 20 - ((val - minV) / span) * (gh - 40);
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${gy + gh - 10} L ${pts[0].x} ${gy + gh - 10} Z`;
    const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>`).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
            <linearGradient id="cBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#030917"/>
                <stop offset="60%" stop-color="#09214a"/>
                <stop offset="100%" stop-color="#04122b"/>
            </linearGradient>
            <linearGradient id="cFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"/>
            </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#cBg)"/>
        <rect x="22" y="22" width="${w - 44}" height="${h - 44}" rx="20" fill="#0c2654" fill-opacity="0.72" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="2"/>
        <text x="44" y="54" fill="#38bdf8" font-family="sans-serif" font-size="13" font-weight="bold">MARCHÉ CRYPTO • ${escapeXml(symbol)}</text>
        <text x="44" y="88" fill="#ffffff" font-family="sans-serif" font-size="26" font-weight="bold">${escapeXml(cryptoObj.name)} (${escapeXml(symbol)}) — ${cryptoObj.price.toLocaleString('fr-FR')} 🪙</text>
        <text x="44" y="114" fill="#bae6fd" font-family="sans-serif" font-size="15">Ton solde : ${userAmount} ${escapeXml(symbol)}</text>
        <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="12" fill="#051430" stroke="#38bdf8" stroke-opacity="0.35"/>
        <path d="${areaPath}" fill="url(#cFill)"/>
        <path d="${linePath}" fill="none" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        <text x="56" y="344" fill="#93c5fd" font-family="sans-serif" font-size="14">Min : ${minV.toLocaleString('fr-FR')} 🪙   •   Max : ${maxV.toLocaleString('fr-FR')} 🪙</text>
    </svg>`;
}

function makeVisualAttachment(svgString, baseName) {
    if (Resvg) {
        try {
            const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: 820 } });
            const pngData = resvg.render().asPng();
            return new AttachmentBuilder(pngData, { name: `${baseName}.png` });
        } catch (e) {}
    }
    return new AttachmentBuilder(Buffer.from(svgString, 'utf8'), { name: `${baseName}.svg` });
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
            new TextDisplayBuilder().setContent(`-# ${footer || 'K2L Casino • Préfixe *'}`)
        );
}

async function replyBlue(message, { title, body, attachment, footer, components = [] }) {
    const container = buildContainerV2({ title, body, footer });
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container, ...components]
    };
    if (attachment) payload.files = [attachment];

    try {
        return await message.reply(payload);
    } catch (e) {
        const embed = new EmbedBuilder()
            .setColor('#0ea5e9')
            .setTitle(title)
            .setDescription(body)
            .setFooter({ text: footer || 'K2L Casino • Préfixe *' });
        if (attachment) embed.setImage(`attachment://${attachment.name}`);
        return message.reply({
            embeds: [embed],
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
    const u = getUser(message.author.id);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet) {
        return replyBlue(message, { title: '🃏 BLACKJACK', body: 'Utilisation : `*blackjack <mise|all>` ou `*bj <mise|all>`' });
    }
    if (u.cash < bet) {
        return replyBlue(message, { title: '🃏 BLACKJACK', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });
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

    const att = makeVisualAttachment(buildBlueCardSvg({
        title: `BLACKJACK • ${message.author.username.toUpperCase()}`,
        subtitle: `Mise : ${bet.toLocaleString('fr-FR')} 🪙`,
        cards: [
            { label: 'TA MAIN', value: `${playerCards.join(' ')} (${handValue(playerCards)})` },
            { label: 'CROUPIER', value: `${dealerCards[0]}  [?]` },
            { label: 'CASH RESTANT', value: `${u.cash.toLocaleString('fr-FR')} 🪙` }
        ],
        footerLine: 'Clique sur Tirer ou Rester'
    }), 'blackjack-blue');

    const sent = await replyBlue(message, {
        title: '🃏 BLACKJACK',
        body: `**Mise :** ${formatMoney(bet)}\n**Ta main :** \`${playerCards.join(' ')}\` (**${handValue(playerCards)}**)\n**Croupier :** \`${dealerCards[0]}\` \`[?]\``,
        attachment: att,
        components: [row]
    });

    activeBlackjacks.set(sent.id, { userId: message.author.id, bet, playerCards, dealerCards });
}

async function handleRoulette(message, args) {
    const u = getUser(message.author.id);
    const choiceRaw = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    const valid = ['rouge', 'red', 'noir', 'black', 'vert', 'green', 'pair', 'even', 'impair', 'odd'];

    if (!valid.includes(choiceRaw) || !bet) {
        return replyBlue(message, { title: '🎡 ROULETTE', body: 'Utilisation : `*roulette <rouge|noir|vert|pair|impair> <mise|all>`' });
    }
    if (u.cash < bet) {
        return replyBlue(message, { title: '🎡 ROULETTE', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });
    }

    u.cash -= bet;
    u.stats.wagered += bet;

    const num = Math.floor(Math.random() * 37);
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const color = num === 0 ? 'vert' : (reds.has(num) ? 'rouge' : 'noir');
    const parity = num === 0 ? 'zero' : (num % 2 === 0 ? 'pair' : 'impair');

    const norm = ['rouge', 'red'].includes(choiceRaw) ? 'rouge'
        : ['noir', 'black'].includes(choiceRaw) ? 'noir'
        : ['vert', 'green'].includes(choiceRaw) ? 'vert'
        : ['pair', 'even'].includes(choiceRaw) ? 'pair' : 'impair';

    let mult = 0;
    if (norm === 'vert' && color === 'vert') mult = 14;
    else if (norm === color || norm === parity) mult = 2;

    const win = Math.floor(bet * mult);
    if (win > 0) { u.cash += win; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    const att = makeVisualAttachment(buildBlueCardSvg({
        title: `ROULETTE • NUMÉRO ${num} (${color.toUpperCase()})`,
        subtitle: `Pari : ${norm} • Mise : ${bet.toLocaleString('fr-FR')} 🪙`,
        cards: [
            { label: 'RÉSULTAT', value: `${num} (${color})` },
            { label: 'GAIN / PERTE', value: win > 0 ? `+${win.toLocaleString('fr-FR')} 🪙` : `-${bet.toLocaleString('fr-FR')} 🪙` },
            { label: 'CASH', value: `${u.cash.toLocaleString('fr-FR')} 🪙` }
        ],
        footerLine: `Parité : ${parity}`
    }), 'roulette-blue');

    return replyBlue(message, {
        title: win > 0 ? '🎡 ROULETTE • GAGNÉ' : '🎡 ROULETTE • PERDU',
        body: `**Numéro :** \`${num}\` (**${color.toUpperCase()}** / ${parity})\n**Gain :** ${win > 0 ? `+**${formatMoney(win)}**` : `-**${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`,
        attachment: att
    });
}

async function handleSlots(message, args) {
    const u = getUser(message.author.id);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet) return replyBlue(message, { title: '🎰 SLOTS', body: 'Utilisation : `*slots <mise|all>`' });
    if (u.cash < bet) return replyBlue(message, { title: '🎰 SLOTS', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

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

    const att = makeVisualAttachment(buildBlueCardSvg({
        title: `SLOTS • [ ${r.join('  |  ')} ]`,
        subtitle: `Mise : ${bet.toLocaleString('fr-FR')} 🪙`,
        cards: [
            { label: 'ROULEAUX', value: `${r.join(' ')}` },
            { label: 'GAIN / PERTE', value: win > 0 ? `+${win.toLocaleString('fr-FR')} 🪙` : `-${bet.toLocaleString('fr-FR')} 🪙` },
            { label: 'CASH', value: `${u.cash.toLocaleString('fr-FR')} 🪙` }
        ],
        footerLine: '3 identiques = x5 (x10 💎) • 2 identiques = x1.5'
    }), 'slots-blue');

    return replyBlue(message, {
        title: '🎰 MACHINE À SOUS',
        body: `**[ ${r.join(' | ')} ]**\n${win > 0 ? `✅ Gain : **+${formatMoney(win)}**` : `❌ Perte : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`,
        attachment: att
    });
}

async function handleCoinflip(message, args) {
    const u = getUser(message.author.id);
    const side = (args[0] || '').toLowerCase();
    const bet = parseBetAmount(args[1], u.cash);
    if (!['pile', 'face'].includes(side) || !bet) {
        return replyBlue(message, { title: '🪙 COINFLIP', body: 'Utilisation : `*coinflip <pile|face> <mise|all>`' });
    }
    if (u.cash < bet) return replyBlue(message, { title: '🪙 COINFLIP', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const outcome = Math.random() < 0.5 ? 'pile' : 'face';
    const won = outcome === side;
    if (won) { u.cash += bet * 2; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    return replyBlue(message, {
        title: '🪙 COINFLIP',
        body: `**Résultat :** \`${outcome.toUpperCase()}\` • **Choix :** \`${side}\`\n${won ? `✅ Gain : **+${formatMoney(bet * 2)}**` : `❌ Perte : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`
    });
}

async function handleDice(message, args) {
    const u = getUser(message.author.id);
    const guess = parseInt(args[0], 10);
    const bet = parseBetAmount(args[1], u.cash);
    if (isNaN(guess) || guess < 1 || guess > 6 || !bet) {
        return replyBlue(message, { title: '🎲 DICE', body: 'Utilisation : `*dice <1-6> <mise|all>`' });
    }
    if (u.cash < bet) return replyBlue(message, { title: '🎲 DICE', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = roll === guess;
    const win = won ? bet * 5 : 0;
    if (won) { u.cash += win; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    return replyBlue(message, {
        title: '🎲 LANCER DE DÉ',
        body: `**Dé :** \`${roll}\` • **Ton choix :** \`${guess}\`\n${won ? `✅ Jackpot x5 : **+${formatMoney(win)}**` : `❌ Perdu : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`
    });
}

async function handleCrash(message, args) {
    const u = getUser(message.author.id);
    const bet = parseBetAmount(args[0], u.cash);
    if (!bet) return replyBlue(message, { title: '🚀 CRASH', body: 'Utilisation : `*crash <mise|all>`' });
    if (u.cash < bet) return replyBlue(message, { title: '🚀 CRASH', body: `❌ Fonds insuffisants (${formatMoney(u.cash)}).` });

    u.cash -= bet;
    u.stats.wagered += bet;
    const crashAt = Number((1 + Math.random() * 2.8).toFixed(2));
    const targetMult = Number((1.1 + Math.random() * 1.9).toFixed(2));
    const won = crashAt >= targetMult;
    const payout = won ? Math.floor(bet * targetMult) : 0;

    if (won) { u.cash += payout; u.stats.wins += 1; }
    else { u.stats.losses += 1; }
    saveData();

    return replyBlue(message, {
        title: '🚀 CRASH GAME',
        body: `**Multiplicateur encaissé :** \`x${targetMult}\` • **Crash à :** \`x${crashAt}\`\n${won ? `✅ Encaissé : **+${formatMoney(payout)}**` : `💥 Crash avant l'encaissement : **-${formatMoney(bet)}**`}\n**Cash :** ${formatMoney(u.cash)}`
    });
}
async function handleBalance(message) {
    const target = message.mentions.users.first() || message.author;
    const data = getUser(target.id);
    const att = makeVisualAttachment(buildBlueCardSvg({
        title: `BALANCE • ${target.username.toUpperCase()}`,
        subtitle: `Patrimoine : ${(data.cash + data.bank).toLocaleString('fr-FR')} 🪙`,
        cards: [
            { label: 'CASH', value: `${data.cash.toLocaleString('fr-FR')} 🪙` },
            { label: 'BANQUE', value: `${data.bank.toLocaleString('fr-FR')} 🪙` },
            { label: 'TOTAL', value: `${(data.cash + data.bank).toLocaleString('fr-FR')} 🪙` }
        ],
        footerLine: data.company ? `Entreprise : ${data.company.name} (Niv. ${data.company.level})` : 'Aucune entreprise'
    }), 'balance-blue');

    return replyBlue(message, {
        title: `💳 BALANCE • ${target.username}`,
        body: `**Cash :** ${formatMoney(data.cash)}\n**Banque :** ${formatMoney(data.bank)}\n**Total :** ${formatMoney(data.cash + data.bank)}`,
        attachment: att
    });
}

function handleDeposit(message, args) {
    const u = getUser(message.author.id);
    const amount = parseBetAmount(args[0], u.cash);
    if (!amount || u.cash < amount) {
        return replyBlue(message, { title: '🏦 DÉPÔT', body: 'Utilisation : `*deposit <montant|all>`' });
    }
    u.cash -= amount;
    u.bank += amount;
    saveData();
    return replyBlue(message, { title: '🏦 DÉPÔT', body: `Déposé **${formatMoney(amount)}** en banque.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}` });
}

function handleWithdraw(message, args) {
    const u = getUser(message.author.id);
    const amount = parseBetAmount(args[0], u.bank);
    if (!amount || u.bank < amount) {
        return replyBlue(message, { title: '🏦 RETRAIT', body: 'Utilisation : `*withdraw <montant|all>`' });
    }
    u.bank -= amount;
    u.cash += amount;
    saveData();
    return replyBlue(message, { title: '🏦 RETRAIT', body: `Retiré **${formatMoney(amount)}** en cash.\n**Cash :** ${formatMoney(u.cash)} • **Banque :** ${formatMoney(u.bank)}` });
}

function handleWork(message) {
    const u = getUser(message.author.id);
    const now = Date.now(), cd = 30 * 60 * 1000;
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
    const now = Date.now(), cd = 24 * 60 * 60 * 1000;
    if (now - u.cooldowns.daily < cd) {
        return replyBlue(message, { title: '🎁 DAILY', body: `⏳ Prochain daily dans **${formatCooldown(cd - (now - u.cooldowns.daily))}**.` });
    }
    u.cooldowns.daily = now;
    const gain = 2500;
    u.cash += gain;
    saveData();
    return replyBlue(message, { title: '🎁 DAILY', body: `Tu as reçu **+${formatMoney(gain)}** !` });
}

function handleCrime(message) {
    const u = getUser(message.author.id);
    const now = Date.now(), cd = 20 * 60 * 1000;
    if (now - u.cooldowns.crime < cd) {
        return replyBlue(message, { title: '🕵️ CRIME', body: `⏳ Patiente **${formatCooldown(cd - (now - u.cooldowns.crime))}**.` });
    }
    u.cooldowns.crime = now;
    if (Math.random() < 0.55) {
        const gain = Math.floor(Math.random() * 1400) + 600;
        u.cash += gain;
        saveData();
        return replyBlue(message, { title: '🕵️ CRIME RÉUSSI', body: `Coup réussi : **+${formatMoney(gain)}** !` });
    } else {
        const loss = Math.min(u.cash, 700);
        u.cash -= loss;
        saveData();
        return replyBlue(message, { title: '🚨 PRIS SUR LE FAIT', body: `Amende payée : **-${formatMoney(loss)}**.` });
    }
}

function handleRob(message) {
    const attacker = getUser(message.author.id);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyBlue(message, { title: '🔫 VOL', body: 'Utilisation : `*rob <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyBlue(message, { title: '🔫 VOL BLOQUÉ', body: '🛡️ Impossible de voler le Super Owner.' });
    }
    const now = Date.now(), cd = 35 * 60 * 1000;
    if (now - attacker.cooldowns.rob < cd) {
        return replyBlue(message, { title: '🔫 VOL', body: `⏳ Reviens dans **${formatCooldown(cd - (now - attacker.cooldowns.rob))}**.` });
    }
    attacker.cooldowns.rob = now;
    const victim = getUser(target.id);
    if (victim.cash < 200) {
        return replyBlue(message, { title: '🔫 VOL', body: '❌ La cible n\'a pas assez de cash.' });
    }
    if (Math.random() < 0.45) {
        const stolen = Math.min(victim.cash, Math.max(200, Math.floor(victim.cash * 0.25)));
        victim.cash -= stolen;
        attacker.cash += stolen;
        saveData();
        return replyBlue(message, { title: '🔫 VOL RÉUSSI', body: `Tu as volé **+${formatMoney(stolen)}** à **${target.username}** !` });
    } else {
        const fine = Math.min(attacker.cash, 500);
        attacker.cash -= fine;
        saveData();
        return replyBlue(message, { title: '🚨 VOL RATÉ', body: `Tu as été attrapé : **-${formatMoney(fine)}**.` });
    }
}

function handlePay(message, args) {
    const sender = getUser(message.author.id);
    const target = message.mentions.users.first();
    const amount = parseBetAmount(args[1], sender.cash);
    if (!target || target.bot || target.id === message.author.id || !amount || sender.cash < amount) {
        return replyBlue(message, { title: '💸 PAY', body: 'Utilisation : `*pay <@membre> <montant|all>`' });
    }
    const receiver = getUser(target.id);
    sender.cash -= amount;
    receiver.cash += amount;
    saveData();
    return replyBlue(message, { title: '💸 VIREMENT', body: `Envoyé **${formatMoney(amount)}** à ${target}.` });
}

async function handleCompany(message, args) {
    const u = getUser(message.author.id);
    const sub = (args[0] || 'info').toLowerCase();

    if (sub === 'create') {
        if (u.company) return replyBlue(message, { title: '🏢 ENTREPRISE', body: `Tu as déjà **${u.company.name}**.` });
        const cost = 5000;
        const name = args.slice(1).join(' ').trim() || 'BlueCorp';
        if (u.cash < cost) return replyBlue(message, { title: '🏢 ENTREPRISE', body: `❌ Coût de création : **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.company = { name, level: 1, incomePerHour: 600, lastCollect: Date.now() };
        saveData();
        return replyBlue(message, { title: '🏢 ENTREPRISE CRÉÉE', body: `**${name}** créée pour **${formatMoney(cost)}** !` });
    }

    if (!u.company) {
        return replyBlue(message, { title: '🏢 ENTREPRISE', body: 'Aucune entreprise. Utilise `*company create <nom>` (5 000 🪙).' });
    }

    const pending = Math.floor(Math.min(24, (Date.now() - (u.company.lastCollect || Date.now())) / 3600000) * u.company.incomePerHour);

    if (sub === 'collect') {
        u.company.lastCollect = Date.now();
        u.cash += pending;
        saveData();
        return replyBlue(message, { title: '🏢 RÉCOLTE', body: `Récolté **+${formatMoney(pending)}** de **${u.company.name}**.` });
    }

    if (sub === 'upgrade') {
        const upCost = u.company.level * 4000;
        if (u.cash < upCost) return replyBlue(message, { title: '🏢 UPGRADE', body: `❌ Il faut **${formatMoney(upCost)}** en cash.` });
        u.cash += pending - upCost;
        u.company.level += 1;
        u.company.incomePerHour += 550;
        u.company.lastCollect = Date.now();
        saveData();
        return replyBlue(message, { title: '🏢 UPGRADE', body: `**${u.company.name}** niveau **${u.company.level}** (${formatMoney(u.company.incomePerHour)}/h) !` });
    }

    const att = makeVisualAttachment(buildBlueCardSvg({
        title: `ENTREPRISE • ${u.company.name.toUpperCase()}`,
        subtitle: `Niveau ${u.company.level} • ${u.company.incomePerHour.toLocaleString('fr-FR')} 🪙/h`,
        cards: [
            { label: 'NIVEAU', value: `Niv. ${u.company.level}` },
            { label: 'REVENU / H', value: `${u.company.incomePerHour.toLocaleString('fr-FR')} 🪙` },
            { label: 'À RÉCOLTER', value: `${pending.toLocaleString('fr-FR')} 🪙` }
        ],
        footerLine: 'Commandes : *company collect • *company upgrade'
    }), 'company-blue');

    return replyBlue(message, {
        title: `🏢 ${u.company.name}`,
        body: `**Niveau :** ${u.company.level}\n**Revenu :** ${formatMoney(u.company.incomePerHour)}/h\n**En attente :** ${formatMoney(pending)}`,
        attachment: att
    });
}

async function handleCrypto(message, args) {
    const u = getUser(message.author.id);
    const sub = (args[0] || 'market').toLowerCase();

    if (sub === 'buy') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0) return replyBlue(message, { title: '📈 CRYPTO', body: 'Utilisation : `*crypto buy <BTC|ETH|K2L|SOL> <qté>`' });
        const cost = Math.ceil(amount * c.price);
        if (u.cash < cost) return replyBlue(message, { title: '📈 CRYPTO', body: `❌ Il faut **${formatMoney(cost)}**.` });
        u.cash -= cost;
        u.crypto[sym] = (u.crypto[sym] || 0) + amount;
        saveData();
        const att = makeVisualAttachment(buildCryptoChartSvg(sym, c, u.crypto[sym]), `crypto-${sym.toLowerCase()}`);
        return replyBlue(message, { title: `📈 ACHAT ${sym}`, body: `Acheté **${amount} ${sym}** pour **${formatMoney(cost)}**.`, attachment: att });
    }

    if (sub === 'sell') {
        const sym = (args[1] || '').toUpperCase();
        const amount = parseFloat(args[2]);
        const c = db.cryptos[sym];
        if (!c || isNaN(amount) || amount <= 0 || (u.crypto[sym] || 0) < amount) {
            return replyBlue(message, { title: '📉 CRYPTO', body: 'Utilisation : `*crypto sell <BTC|ETH|K2L|SOL> <qté>`' });
        }
        const gain = Math.floor(amount * c.price);
        u.crypto[sym] -= amount;
        u.cash += gain;
        saveData();
        const att = makeVisualAttachment(buildCryptoChartSvg(sym, c, u.crypto[sym]), `crypto-${sym.toLowerCase()}`);
        return replyBlue(message, { title: `📉 VENTE ${sym}`, body: `Vendu **${amount} ${sym}** pour **+${formatMoney(gain)}**.`, attachment: att });
    }

    const sym = db.cryptos[sub.toUpperCase()] ? sub.toUpperCase() : 'K2L';
    const c = db.cryptos[sym];
    const att = makeVisualAttachment(buildCryptoChartSvg(sym, c, u.crypto[sym] || 0), `crypto-${sym.toLowerCase()}`);
    const list = Object.entries(db.cryptos).map(([k, v]) => `• **${k}** : **${formatMoney(v.price)}** (Solde : \`${u.crypto[k] || 0}\`)`).join('\n');

    return replyBlue(message, {
        title: '📊 MARCHÉ CRYPTO',
        body: `${list}\n\n\`*crypto buy <SYM> <qté>\` • \`*crypto sell <SYM> <qté>\``,
        attachment: att
    });
}

async function handleHack(message) {
    const atk = getUser(message.author.id);
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return replyBlue(message, { title: '💻 HACK', body: 'Utilisation : `*hack <@membre>`' });
    }
    if (isSuperOwner(target)) {
        return replyBlue(message, { title: '💻 HACK BLOQUÉ', body: '🛡️ Impossible de hacker le Super Owner.' });
    }
    const now = Date.now(), cd = 45 * 60 * 1000;
    if (now - atk.cooldowns.hack < cd) {
        return replyBlue(message, { title: '💻 HACK', body: `⏳ Recharge dans **${formatCooldown(cd - (now - atk.cooldowns.hack))}**.` });
    }
    atk.cooldowns.hack = now;
    const def = getUser(target.id);

    if (Math.random() < 0.48 && def.cash >= 200) {
        const stolen = Math.min(def.cash, Math.max(250, Math.floor(def.cash * 0.2)));
        def.cash -= stolen;
        atk.cash += stolen;
        atk.stats.hacksSuccess += 1;
        saveData();
        return replyBlue(message, { title: '💻 HACK RÉUSSI', body: `Volé **+${formatMoney(stolen)}** à **${target.username}** !` });
    } else {
        const fine = Math.min(atk.cash, 450);
        atk.cash -= fine;
        saveData();
        return replyBlue(message, { title: '🚨 HACK ÉCHOUÉ', body: `Détecté ! Perte de **-${formatMoney(fine)}**.` });
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
    let finished = false, msgEnd = '';

    if (interaction.customId === 'bj_hit') {
        game.playerCards.push(drawCard());
        const pVal = handValue(game.playerCards);
        if (pVal > 21) {
            finished = true;
            u.stats.losses += 1;
            msgEnd = `💥 Bust (${pVal}) ! Perdu **${formatMoney(game.bet)}**.`;
        } else if (pVal === 21) {
            finished = true;
            while (handValue(game.dealerCards) < 17) game.dealerCards.push(drawCard());
            const dVal = handValue(game.dealerCards);
            if (dVal === 21) {
                u.cash += game.bet;
                msgEnd = `🤝 Égalité à 21 ! Mise rendue.`;
            } else {
                const win = game.bet * 2;
                u.cash += win;
                u.stats.wins += 1;
                msgEnd = `🔥 21 gagnant ! **+${formatMoney(win)}** !`;
            }
        }
    } else if (interaction.customId === 'bj_stand') {
        finished = true;
        while (handValue(game.dealerCards) < 17) game.dealerCards.push(drawCard());
        const pVal = handValue(game.playerCards);
        const dVal = handValue(game.dealerCards);
        if (dVal > 21 || pVal > dVal) {
            const win = game.bet * 2;
            u.cash += win;
            u.stats.wins += 1;
            msgEnd = `🏆 Victoire (${pVal} vs ${dVal}) ! **+${formatMoney(win)}** !`;
        } else if (pVal === dVal) {
            u.cash += game.bet;
            msgEnd = `🤝 Égalité (${pVal} vs ${dVal}) ! Mise rendue.`;
        } else {
            u.stats.losses += 1;
            msgEnd = `❌ Croupier gagne (${pVal} vs ${dVal}). Perdu **${formatMoney(game.bet)}**.`;
        }
    }

    saveData();
    const pVal = handValue(game.playerCards);
    const dVal = handValue(game.dealerCards);
    const body = finished
        ? `**Ta main :** \`${game.playerCards.join(' ')}\` (**${pVal}**)\n**Croupier :** \`${game.dealerCards.join(' ')}\` (**${dVal}**)\n\n${msgEnd}\n**Cash :** ${formatMoney(u.cash)}`
        : `**Mise :** ${formatMoney(game.bet)}\n**Ta main :** \`${game.playerCards.join(' ')}\` (**${pVal}**)\n**Croupier :** \`${game.dealerCards[0]}\` \`[?]\``;

    const container = buildContainerV2({ title: finished ? '🃏 BLACKJACK TERMINÉ' : '🃏 BLACKJACK', body });
    if (finished) activeBlackjacks.delete(interaction.message.id);

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
            return replyBlue(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        }
        db = { users: {}, cryptos: JSON.parse(JSON.stringify(DEFAULT_CRYPTOS)) };
        saveData();
        return replyBlue(message, { title: '♻️ ÉCONOMIE RESET', body: 'Toute l\'économie a été réinitialisée.' });
    }

    if (command === 'setmoney') {
        if (!isSuperOwner(message.author)) {
            return replyBlue(message, { title: '⛔ ACCÈS REFUSÉ', body: 'Réservé au Super Owner (**graveuhq**).' });
        }
        const target = message.mentions.users.first();
        const amt = parseInt(args[1], 10);
        if (!target || isNaN(amt) || amt < 0) {
            return replyBlue(message, { title: '💰 SETMONEY', body: 'Utilisation : `*setmoney <@membre> <montant>`' });
        }
        const u = getUser(target.id);
        u.cash = amt;
        saveData();
        return replyBlue(message, { title: '💰 SETMONEY', body: `Cash de **${target.username}** défini sur **${formatMoney(amt)}**.` });
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

        return replyBlue(message, { title: '💠 KUZO CASINO • MENU D\'AIDE', body });
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
            .map(([id, u]) => ({ id, total: (u.cash || 0) + (u.bank || 0) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const text = entries.length > 0
            ? entries.map((e, i) => `**#${i + 1}** <@${e.id}> — **${formatMoney(e.total)}**`).join('\n')
            : 'Aucun joueur enregistré.';

        return replyBlue(message, { title: '🏆 CLASSEMENT', body: text });
    }
});

client.on('ready', () => {
    console.log(`Casino Bot prêt : ${client.user.tag} (Préfixe ${PREFIX})`);
});

client.login(process.env.DISCORD_TOKEN);
