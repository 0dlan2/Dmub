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
import axios from 'axios';
import naturalCompare from 'natural-compare';
import os from 'os';

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
// FILE SYSTEM INITIALIZATION
// ======================
const UPLOAD_DIR = path.join(os.tmpdir(), 'discord-uploads');

try {
    if (fs.existsSync(UPLOAD_DIR)) {
        fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
        console.log('🗑️  Deleted old uploads directory');
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('📂 Created fresh uploads directory at:', UPLOAD_DIR);
} catch (error) {
    console.error('❌ Failed to initialize upload directory:', error);
    process.exit(1);
}

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
    dest: UPLOAD_DIR,
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

(async () => {
    try {
        console.log('🔁 Registering commands...');
        
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        
        const GUILD_ID = process.env.TEST_GUILD_ID;
        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log('✅ Guild-specific commands registered!');
        }

        console.log('✅ Global commands registered!');
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

        const textContent = uploadedFiles
            .sort((a, b) => naturalCompare(a.name, b.name))
            .map(file => `${file.name}: ${file.url}`)
            .join('\n');

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
