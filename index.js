const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const http = require('http');

// Serveur HTTP pour Render (maintient le Web Service actif 24/7)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DMAll Bot Operational!\n');
}).listen(PORT, () => console.log(`Serveur HTTP actif sur le port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // INDISPENSABLE pour récupérer la liste des membres
    ]
});

const PREFIX = '!';

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} !`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Commande !dmall
    if (message.content.startsWith(`${PREFIX}dmall`)) {
        // Vérification des permissions (Administrateur requis)
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Cette commande est strictement réservée aux administrateurs.");
        }

        await message.reply("💬 **[DMAll]** Veuillez envoyer dans ce salon le message que vous souhaitez diffuser à tous les membres.\n*Vous pouvez utiliser `{mention}` pour mentionner l'utilisateur. Vous avez 60 secondes.*");

        // Collecteur pour récupérer le message de l'admin
        const filter = m => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async m => {
            const messageTemplate = m.content;
            
            // Confirmation du lancement
            const initialEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🚀 Diffusion DMAll en cours...')
                .setDescription('Récupération des membres du serveur en cours...')
                .addFields(
                    { name: '👥 Total membres', value: 'Calcul...', inline: true },
                    { name: '✅ Envoyés', value: '0', inline: true },
                    { name: '❌ Erreurs (MPs fermés)', value: '0', inline: true },
                    { name: '📊 Progression', value: '0%', inline: true }
                )
                .setFooter({ text: `Demandé par ${message.author.tag}` });

            const statusMsg = await message.channel.send({ embeds: [initialEmbed] });

            try {
                // Forcer la mise en cache / récupération de tous les membres
                await message.guild.members.fetch();
                const members = message.guild.members.cache.filter(member => !member.user.bot); // Exclure les bots
                const totalMembers = members.size;

                let successCount = 0;
                let failCount = 0;
                let processed = 0;

                for (const [id, member] of members) {
                    try {
                        // Personnalisation du message avec le pseudo ou la mention
                        const finalMessage = messageTemplate
                            .replace(/\{mention\}/g, `<@${member.id}>`)
                            .replace(/\{name\}/g, member.user.username);

                        await member.send(finalMessage);
                        successCount++;
                    } catch (err) {
                        // Erreur typique : MP fermés, bloque le bot, etc.
                        failCount++;
                    }

                    processed++;
                    const percent = Math.round((processed / totalMembers) * 100);

                    // Mise à jour de l'embed toutes les 5 personnes ou à la fin pour éviter le rate limit de l'API Discord
                    if (processed % 5 === 0 || processed === totalMembers) {
                        const updateEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('🚀 Diffusion DMAll en cours...')
                            .setDescription(`Message en cours d'envoi...\n\n**Modèle :** \`${messageTemplate}\``)
                            .addFields(
                                { name: '👥 Total membres', value: `${totalMembers}`, inline: true },
                                { name: '✅ Envoyés', value: `${successCount}`, inline: true },
                                { name: '❌ Erreurs (MPs fermés)', value: `${failCount}`, inline: true },
                                { name: '📊 Progression', value: `${percent}% (${processed}/${totalMembers})`, inline: false }
                            )
                            .setFooter({ text: `Demandé par ${message.author.tag}` });

                        await statusMsg.edit({ embeds: [updateEmbed] }).catch(() => {});
                    }

                    // ⚠️ Délai de sécurité anti-spam / anti-ban de 1 seconde entre chaque MP
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Embed final de fin
                const finalEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Diffusion DMAll Terminée !')
                    .setDescription('Le message a été diffusé à l\'ensemble des membres éligibles.')
                    .addFields(
                        { name: '👥 Total cibles', value: `${totalMembers}`, inline: true },
                        { name: '✅ Succès', value: `${successCount}`, inline: true },
                        { name: '❌ Échecs (MPs fermés)', value: `${failCount}`, inline: true }
                    )
                    .setFooter({ text: `Terminé pour ${message.author.tag}` });

                await statusMsg.edit({ embeds: [finalEmbed] });

            } catch (error) {
                console.error(error);
                message.channel.send("❌ Une erreur critique est survenue lors de la récupération des membres.");
            }
        });

        collector.on('ignore', collected => {
            // Si l'utilisateur tape autre chose
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                message.channel.send("⌛ Temps écoulé. La commande DMAll a été annulée (pas de message fourni).");
            }
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
