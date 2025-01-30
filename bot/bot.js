// bot/bot.js
import 'dotenv/config';
import { Client, GatewayIntentBits, SlashCommandBuilder, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import os from 'os';
import cors from 'cors';
import axios from 'axios';
import naturalCompare from 'natural-compare';

// ======================
// INITIALIZATION
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.Token_hh;
const CLIENT_ID = process.env.CLIENT_ID;
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Validate essential environment variables
if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

// Discord client configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ======================
// TEMPORARY FILE MANAGEMENT
// ======================
const activeUploads = new Map();

const createTempDir = async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-'));
    activeUploads.set(tempDir, true);
    return tempDir;
};

const cleanupSystem = async () => {
    console.log('\n🧹 Starting system cleanup...');
    for (const [dir] of activeUploads) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            console.log(`✔️ Cleared temporary directory: ${dir}`);
        } catch (error) {
            console.error(`❌ Failed to clean ${dir}:`, error.message);
        }
    }
    activeUploads.clear();
};

// ======================
// EXPRESS SERVER CONFIG
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

// ======================
// DISCORD SLASH COMMANDS
// ======================
const commands = [
    new SlashCommandBuilder()
        .setName('bda')
        .setDescription('Get bot configuration link'),
    new SlashCommandBuilder()
        .setName('channel_id')
        .setDescription('Get channel ID')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Target channel')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('arise')
        .setDescription('Wake up the bot from standby'),
    new SlashCommandBuilder()
        .setName('from_youtube')
        .setDescription('Import YouTube playlist videos')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube playlist URL')
                .setRequired(true)
        )
].map(command => command.toJSON());

// ======================
// COMMAND REGISTRATION
// ======================
const registerCommands = async () => {
    try {
        console.log('🔁 Registering application commands...');
        await new REST({ version: '10' }).setToken(TOKEN)
            .put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Successfully registered commands!');
    } catch (error) {
        console.error('❌ Command registration failed:', error);
        process.exit(1);
    }
};

// ======================
// BOT EVENT HANDLERS
// ======================
client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    registerCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    try {
        const { commandName, options } = interaction;

        switch(commandName) {
            case 'arise':
                await interaction.reply(
                    client.isReady ? 
                    '⚡ Ready! Use `/bda` to start' : 
                    '💤 Warming up...'
                );
                break;

            case 'bda':
                await interaction.reply(
                    `🔗 Configuration Dashboard: ${process.env.WEBPAGE_URL}`
                );
                break;

            case 'channel_id':
                const channel = options.getChannel('channel');
                await interaction.reply(`📡 Channel ID: \`${channel.id}\``);
                break;

            case 'from_youtube':
                await handleYouTubeRequest(interaction, options);
                break;
        }
    } catch (error) {
        console.error('❌ Command error:', error);
        await interaction.reply({ 
            content: '⚠️ Error executing command', 
            ephemeral: true 
        });
    }
});

// ======================
// FILE UPLOAD ENDPOINT
// ======================
app.post('/upload-media', async (req, res) => {
    let tempDir;
    try {
        tempDir = await createTempDir();
        
        // Configure multer for temporary storage
        const storage = multer.diskStorage({
            destination: tempDir,
            filename: (_, file, cb) => {
                cb(null, file.originalname);
            }
        });

        const upload = multer({
            storage,
            limits: { fileSize: MAX_FILE_SIZE }
        }).array('mediaFiles');

        // Process file upload
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Validate channels
        const { uploadChannel, resultChannel } = req.body;
        if (!uploadChannel || !resultChannel) {
            throw new Error('Missing channel IDs');
        }

        const uploadChannelObj = await client.channels.fetch(uploadChannel);
        const resultChannelObj = await client.channels.fetch(resultChannel);

        if (!uploadChannelObj?.isTextBased() || !resultChannelObj?.isTextBased()) {
            throw new Error('Invalid channel IDs');
        }

        // Process uploaded files
        const files = await fs.readdir(tempDir);
        const uploadedFiles = await Promise.all(
            files.map(async (filename) => {
                const filePath = path.join(tempDir, filename);
                const message = await uploadChannelObj.send({ files: [filePath] });
                return {
                    name: filename,
                    url: message.attachments.first().url
                };
            })
        );

        // Prepare and send results
        const textContent = uploadedFiles
            .sort((a, b) => naturalCompare(a.name, b.name))
            .map(file => `${file.name}: ${file.url}`)
            .join('\n');

        if (textContent.length > 1900) {
            await resultChannelObj.send({
                content: '📁 Uploaded files:',
                files: [{
                    attachment: Buffer.from(textContent),
                    name: `uploads-${Date.now()}.txt`
                }]
            });
        } else {
            await resultChannelObj.send(`📬 Uploads:\n${textContent}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: error.message || 'Upload failed' });
    } finally {
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
                activeUploads.delete(tempDir);
            } catch (error) {
                console.error('❌ Temporary directory cleanup failed:', error);
            }
        }
    }
});

// ======================
// YOUTUBE INTEGRATION
// ======================
async function handleYouTubeRequest(interaction, options) {
    await interaction.deferReply();
    
    try {
        if (!YT_API_KEY) throw new Error('YouTube API not configured');
        
        const playlistUrl = options.getString('url');
        const playlistId = extractPlaylistId(playlistUrl);
        const videos = await fetchPlaylistVideos(playlistId);
        
        if (videos.length === 0) {
            await interaction.editReply('❌ No videos found in this playlist');
            return;
        }

        const formatted = formatVideos(videos);
        await sendYouTubeResults(interaction, formatted);
        
    } catch (error) {
        await interaction.editReply(`❌ Error: ${error.message}`);
    }
}

function extractPlaylistId(url) {
    const regex = /[&?]list=([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    if (!match) throw new Error('Invalid YouTube playlist URL');
    return match[1];
}

async function fetchPlaylistVideos(playlistId) {
    let videos = [];
    let nextPageToken = null;

    do {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet',
                playlistId,
                maxResults: 50,
                key: YT_API_KEY,
                pageToken: nextPageToken
            }
        });

        nextPageToken = response.data.nextPageToken;
        videos.push(...response.data.items.map(item => ({
            title: item.snippet.title,
            id: item.snippet.resourceId.videoId
        })));

    } while (nextPageToken);

    return videos;
}

function formatVideos(videos) {
    return videos
        .sort((a, b) => naturalCompare(a.title, b.title))
        .map(video => ({
            content: `${video.title}: https://youtu.be/${video.id}`,
            length: video.title.length + video.id.length + 6
        }));
}

async function sendYouTubeResults(interaction, formatted) {
    let output = '';
    const MAX_LENGTH = 1900;

    for (const video of formatted) {
        if (output.length + video.length > MAX_LENGTH) {
            await interaction.channel.send(output);
            output = '';
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        output += `${video.content}\n`;
    }

    if (output.length > 0) {
        await interaction.channel.send(output);
    }

    await interaction.editReply(`✅ Successfully imported ${formatted.length} videos!`);
}

// ======================
// SERVER MANAGEMENT
// ======================
process.on('SIGINT', async () => {
    console.log('\n🔴 Received SIGINT - Shutting down gracefully');
    await cleanupSystem();
    client.destroy();
    process.exit();
});

process.on('SIGTERM', async () => {
    console.log('\n🔴 Received SIGTERM - Terminating process');
    await cleanupSystem();
    client.destroy();
    process.exit();
});

app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    client.login(TOKEN)
        .then(() => console.log('🔗 Connecting to Discord...'))
        .catch(error => {
            console.error('❌ Discord login failed:', error);
            process.exit(1);
        });
});