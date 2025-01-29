require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    Routes 
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// ======================
// INITIALIZATION
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.Token_hh;
const CLIENT_ID = process.env.CLIENT_ID;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ======================
// EXPRESS CONFIGURATION
// ======================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: MAX_FILE_SIZE }
});

// ======================
// SLASH COMMANDS SETUP
// ======================
const commands = [
    new SlashCommandBuilder()
        .setName('bda')
        .setDescription('Get bot configuration link'),
    
    new SlashCommandBuilder()
        .setName('channel_id')
        .setDescription('Get a channel ID')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Target channel')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('arise')
        .setDescription('Wake up the bot from standby')
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        console.log('🔁 Registering application commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands registered successfully!');
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
})();

// ======================
// BOT STATUS MANAGEMENT
// ======================
let isReady = false;

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    isReady = true;
});

// ======================
// COMMAND HANDLING
// ======================
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    try {
        const { commandName, options } = interaction;

        switch(commandName) {
            case 'arise':
                if (isReady) {
                    await interaction.reply('⚡ Ready! Type `/bda` to start');
                } else {
                    await interaction.reply('💤 Waking up... Please wait');
                    const interval = setInterval(async () => {
                        if (isReady) {
                            clearInterval(interval);
                            await interaction.followUp('✅ Ready now!');
                        }
                    }, 5000);
                }
                break;

            case 'bda':
                await interaction.reply(`🔗 Configuration page: ${process.env.WEBPAGE_URL}`);
                break;

            case 'channel_id':
                const channel = options.getChannel('channel');
                await interaction.reply(`📡 ID for ${channel}: \`${channel.id}\``);
                break;
        }
    } catch (error) {
        console.error('❌ Command Error:', error);
        await interaction.reply({ 
            content: '⚠️ An error occurred', 
            ephemeral: true 
        });
    }
});

// ======================
// FILE UPLOAD ENDPOINT
// ======================
app.post('/upload-media', upload.array('mediaFiles'), async (req, res) => {
    try {
        const { uploadChannel, resultChannel } = req.body;
        
        if (!uploadChannel || !resultChannel) {
            return res.status(400).json({ error: 'Missing channel IDs' });
        }

        const uploadChannelObj = await client.channels.fetch(uploadChannel);
        const resultChannelObj = await client.channels.fetch(resultChannel);

        if (!uploadChannelObj?.isTextBased() || !resultChannelObj?.isTextBased()) {
            return res.status(400).json({ error: 'Invalid channel IDs' });
        }

        const uploadedFiles = await Promise.all(
            req.files.map(async file => {
                const filePath = path.join(__dirname, 'uploads', file.filename);
                const message = await uploadChannelObj.send({ files: [filePath] });
                fs.unlinkSync(filePath);
                
                return {
                    name: file.originalname,
                    url: message.attachments.first().url
                };
            })
        );

        const formattedResults = uploadedFiles
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(file => `${file.name}: ${file.url}`)
            .join('\n');

        await resultChannelObj.send(`📬 Upload Complete:\n${formattedResults}`);
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).json({ error: error.message || 'Upload failed' });
    }
});

// ======================
// SERVER START
// ======================
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    client.login(TOKEN)
        .then(() => console.log('🔗 Connecting to Discord...'))
        .catch(error => {
            console.error('❌ Login Failed:', error);
            process.exit(1);
        });
});

// ======================
// CLEANUP
// ======================
process.on('SIGINT', () => {
    console.log('\n🔴 Shutting down...');
    client.destroy();
    process.exit();
});