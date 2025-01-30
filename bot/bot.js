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
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// YouTube API config
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ======================
// DYNAMIC TEMP DIR HANDLING
// ======================
const createTempDir = () => path.join(os.tmpdir(), `upload-${Date.now()}`);
let activeTempDirs = new Set();

const cleanupTempDirs = async () => {
    for (const dir of activeTempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up temp directory: ${dir}`);
        } catch (error) {
            console.error(`❌ Failed to clean ${dir}:`, error);
        }
    }
    activeTempDirs.clear();
};

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
    new SlashCommandBuilder().setName('arise').setDescription('Wake up the bot'),
    new SlashCommandBuilder()
        .setName('from_youtube')
        .setDescription('Import YouTube playlist videos')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube playlist URL')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ======================
// SERVER SETUP
// ======================
(async () => {
    try {
        console.log('🔁 Registering commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error('❌ Command registration failed:', error);
        process.exit(1);
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

            case 'from_youtube':
                const playlistUrl = options.getString('url');
                await interaction.deferReply();

                try {
                    const playlistId = extractPlaylistId(playlistUrl);
                    const videos = await fetchPlaylistVideos(playlistId);

                    if (videos.length === 0) {
                        await interaction.editReply('❌ No videos found in this playlist');
                        return;
                    }

                    const formatted = formatVideos(videos);
                    await sendResults(interaction, formatted);

                } catch (error) {
                    await interaction.editReply(`❌ Error: ${error.message}`);
                }
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
app.post('/upload-media', async (req, res) => {
    const tempDir = createTempDir();
    activeTempDirs.add(tempDir);

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

    try {
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const { uploadChannel, resultChannel } = req.body;

        if (!uploadChannel || !resultChannel) {
            throw new Error('Missing channel IDs');
        }

        const uploadChannelObj = await client.channels.fetch(uploadChannel);
        const resultChannelObj = await client.channels.fetch(resultChannel);

        if (!uploadChannelObj?.isTextBased() || !resultChannelObj?.isTextBased()) {
            throw new Error('Invalid channel IDs');
        }

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

        const textContent = uploadedFiles
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(file => `${file.name}: ${file.url}`)
            .join('\n');

        if (textContent.length > 1900) {
            const fileName = `uploads-${Date.now()}.txt`;
            await resultChannelObj.send({
                content: '📁 Uploaded files:',
                files: [{
                    attachment: Buffer.from(textContent),
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
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        activeTempDirs.delete(tempDir);
    }
});

// ======================
// SERVER MANAGEMENT
// ======================
process.on('SIGINT', async () => {
    console.log('\n🔴 Shutting down...');
    await cleanupTempDirs();
    client.destroy();
    process.exit();
});

process.on('SIGTERM', async () => {
    console.log('\n🔴 Termination signal received');
    await cleanupTempDirs();
    client.destroy();
    process.exit();
});

app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    client.login(TOKEN)
        .then(() => console.log('🔗 Connecting to Discord...'))
        .catch(error => {
            console.error('❌ Login failed:', error);
            process.exit(1);
        });
});

// ======================
// YOUTUBE UTILITY METHODS
// ======================
function extractPlaylistId(url) {
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        throw new Error('Not a YouTube URL');
    }
    const regex = /[&?]list=([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    if (!match) throw new Error('Invalid playlist URL');
    return match[1];
}

async function fetchPlaylistVideos(playlistId) {
    let videos = [];
    let nextPageToken = null;

    do {
        const params = {
            part: 'snippet',
            playlistId,
            maxResults: 50,
            key: YT_API_KEY
        };

        try {
            const response = await axios.get(YT_API_URL, { params })
                .catch(async error => {
                    if (error.response?.status === 429) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        return axios.get(YT_API_URL, { params });
                    }
                    throw error;
                });

            if (response.data.error) {
                throw new Error(`YouTube API: ${response.data.error.message}`);
            }

            nextPageToken = response.data.nextPageToken;

            videos.push(...response.data.items.map(item => ({
                title: item.snippet.title,
                id: item.snippet.resourceId.videoId
            })));

        } catch (error) {
            throw new Error(`Error fetching playlist: ${error.message}`);
        }

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

async function sendResults(interaction, formatted) {
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

    await interaction.editReply(`✅ Found ${formatted.length} videos!`);
}
