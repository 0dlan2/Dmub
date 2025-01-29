require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const token = process.env.Token_hh;
const clientId = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ 
  dest: path.join(__dirname, 'uploads')
});

const rest = new REST({ version: '10' }).setToken(token);

const commands = [
  new SlashCommandBuilder().setName('bda').setDescription('Get the link to configure the media bot'),
  new SlashCommandBuilder()
    .setName('channel_id')
    .setDescription('Get the ID of a mentioned channel')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('The channel you want to get the ID of').setRequired(true)
    ),
].map((command) => command.toJSON());

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'bda') {
    const webpageUrl = process.env.WEBPAGE_URL;
    await interaction.reply(`Configure the bot here: ${webpageUrl}`);
  } else if (commandName === 'channel_id') {
    const channel = options.getChannel('channel');
    await interaction.reply(`The ID of ${channel} is \`${channel.id}\``);
  }
});

app.post('/upload-media', upload.array('mediaFiles'), async (req, res) => {
  if (!req.body.uploadChannel || !req.body.resultChannel) {
    return res.status(400).send('Missing uploadChannel or resultChannel.');
  }

  const { uploadChannel, resultChannel } = req.body;

  try {
    const uploadChannelObj = await client.channels.fetch(uploadChannel);
    const resultChannelObj = await client.channels.fetch(resultChannel);

    if (!uploadChannelObj || !resultChannelObj) {
      return res.status(404).send('Invalid channel IDs.');
    }

    const uploadedLinks = [];
    for (const file of req.files) {
      const filePath = path.join(__dirname, 'uploads', file.filename);
      const sentMessage = await uploadChannelObj.send({ files: [filePath] });

      const originalFileName = file.originalname;
      const fileUrl = sentMessage.attachments.first().url;

      uploadedLinks.push({ originalFileName, fileUrl });

      fs.unlinkSync(filePath);
    }

    uploadedLinks.sort((a, b) => {
      return a.originalFileName.localeCompare(b.originalFileName);
    });

    let message = '';
    uploadedLinks.forEach((linkInfo, index) => {
      message += `${linkInfo.originalFileName}: ${linkInfo.fileUrl}\n`;
    });

    await resultChannelObj.send(message);
    res.status(200).send('Files uploaded and links sent successfully.');
  } catch (error) {
    console.error('Error handling media upload:', error);
    res.status(500).send('Error processing upload.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

client.login(token);
