// bot/bot.js
import 'dotenv/config';
import { Client, GatewayIntentBits, SlashCommandBuilder, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

// ======================
// INITIALIZATION
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.Token_hh;
const CLIENT_ID = process.env.CLIENT_ID;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

app.use(cors({
    origin: [
        'https://0dlan2.github.io',
        'https://dmub-production.up.railway.app'
    ],
    methods: ['POST']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: MAX_FILE_SIZE }
});

// ======================
// DISCORD COMMANDS
// ======================
const commands = [
    new SlashCommandBuilder().setName('bda').setDescription('Get configuration link'),
    new SlashCommandBuilder()
        .setName('channel_id')
        .setDescription('Get channel ID')
        .addChannelOption(option =>
            option.setName('channel').setDescription('Target channel').setRequired(true)
        ),
    new SlashCommandBuilder().setName('arise').setDescription('Wake up the bot')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔁 Registering commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error('❌ Command registration failed:', error);
    }
})();

let isReady = false;

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    isReady = true;
});

// ======================
// CORE FUNCTIONALITY
// ======================
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    try {
        const { commandName, options } = interaction;

        switch(commandName) {
            case 'arise':
                if (isReady) {
                    await interaction.reply('⚡ Ready! Use `/bda` to start');
                } else {
                    await interaction.reply('💤 Warming up...');
                    const interval = setInterval(() => {
                        if (isReady) {
                            clearInterval(interval);
                            interaction.followUp('✅ Ready now!');
                        }
                    }, 5000);
                }
                break;

            case 'bda':
                await interaction.reply(`🔗 Config: ${process.env.WEBPAGE_URL}`);
                break;

            case 'channel_id':
                const channel = options.getChannel('channel');
                await interaction.reply(`📡 ID: \`${channel.id}\``);
                break;
        }
    } catch (error) {
        console.error('❌ Command error:', error);
        await interaction.reply({ content: '⚠️ Error executing command', ephemeral: true });
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

        // Process files
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

        // Create text content
        const textContent = uploadedFiles
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(file => `${file.name}: ${file.url}`)
            .join('\n');

        // Send as text file if over 1900 characters
        if (textContent.length > 1900) {
            const fileName = `uploads_${Date.now()}.txt`;
            const fileBuffer = Buffer.from(textContent, 'utf-8');
            
            await resultChannelObj.send({
                content: '📁 Uploaded files:',
                files: [{
                    attachment: fileBuffer,
                    name: fileName
                }]
            });
        } else {
            await resultChannelObj.send(`📬 Uploads:\n${textContent}`);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: error.message || 'Upload failed' });
    }
});

// ======================
// SERVER MANAGEMENT
// ======================
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    client.login(TOKEN)
        .then(() => console.log('🔗 Connecting to Discord...'))
        .catch(error => {
            console.error('❌ Login failed:', error);
            process.exit(1);
        });
});

process.on('SIGINT', () => {
    console.log('\n🔴 Shutting down...');
    client.destroy();
    process.exit();
});