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
// ES MODULE FIXES
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======================
// INITIALIZATION
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.Token_hh;
const CLIENT_ID = process.env.CLIENT_ID;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_MESSAGE_LENGTH = 2000; // Discord character limit
const MAX_FILENAME_LENGTH = 80;

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
// SLASH COMMANDS SETUP
// ======================
const commands = [
    new SlashCommandBuilder().setName('bda').setDescription('Get bot configuration link'),
    new SlashCommandBuilder()
        .setName('channel_id')
        .setDescription('Get a channel ID')
        .addChannelOption(option =>
            option.setName('channel').setDescription('Target channel').setRequired(true)
        ),
    new SlashCommandBuilder().setName('arise').setDescription('Wake up the bot from standby')
].map(command => command.toJSON());

// ======================
// BOT SETUP
// ======================
const rest = new REST({ version: '10' }).setToken(TOKEN);

try {
    console.log('🔁 Registering application commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered successfully!');
} catch (error) {
    console.error('❌ Failed to register commands:', error);
}

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

        // Validate filenames before processing
        req.files.forEach(file => {
            if (file.originalname.length > MAX_FILENAME_LENGTH) {
                throw new Error(`Filename too long: ${file.originalname} (max ${MAX_FILENAME_LENGTH} chars)`);
            }
        });

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

        // Sort files and split into message chunks
        const sortedFiles = uploadedFiles.sort((a, b) => a.name.localeCompare(b.name));
        const messageChunks = [];
        let currentChunk = [];
        let currentLength = 0;

        for (const file of sortedFiles) {
            const entry = `${file.name}: ${file.url}\n`;
            if (entry.length > MAX_MESSAGE_LENGTH) {
                throw new Error(`File entry too long: ${file.name}`);
            }

            if (currentLength + entry.length > MAX_MESSAGE_LENGTH) {
                messageChunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentLength = 0;
            }

            currentChunk.push(entry.trim());
            currentLength += entry.length;
        }

        if (currentChunk.length > 0) {
            messageChunks.push(currentChunk.join('\n'));
        }

        // Send chunked messages
        for (let i = 0; i < messageChunks.length; i++) {
            await resultChannelObj.send(
                `📬 Upload Part ${i + 1}/${messageChunks.length}:\n${messageChunks[i]}`
            );
        }

        res.json({ 
            success: true,
            totalFiles: uploadedFiles.length,
            chunksSent: messageChunks.length
        });

    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).json({ 
            error: error.message || 'Upload failed',
            details: error.response?.data || null
        });
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