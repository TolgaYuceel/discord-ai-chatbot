const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const token = process.env.TOKEN;
const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

function fileToGenerativePart(path, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(path)).toString("base64"),
            mimeType
        },
    };
}

async function RunProcess(userPrompt) {
    try {
        const prompt = `
            You are a chat bot that works on Discord and provides solutions related to software and programming. You will 
            evaluate the prompts you receive from the user according to their request and produce answers that are not too 
            long, not exceeding the maximum discord message character limit of 1500 characters. If the user asks a detailed 
            question, you can direct them to other resources with links. Be careful to follow the discord message syntax 
            when replying, I will list the ones you need to follow below. You can use emoji in your answers without 
            exaggerating too much. You also need to produce the reply in the language the user is writing in. 
            In other words, if the user writes in English, you should reply in English and if the user writes in Turkish,
            you should reply in Turkish.If you are asked for a link or if you need to provide a link about a topic, it 
            will be enough to provide the direct link: e.g. https://www.example.com

            Let me give you some information about discord syntax:
            Everything between 2 backtick characters is taken as code 
            If you type **example**: the example is bolded 
            If you type *example*: the example is italicized 
            With all this in mind, I want you to come to a conclusion, 
            User Prompt: ${userPrompt}
        `;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = await response.text();
        return text;
    } catch (error) {
        console.error('Error generating content:', error);
        throw error;
    }
}

async function RunProcessWithImage(userPrompt, filePath) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = userPrompt;

        const imageParts = [
            fileToGenerativePart(filePath, "image/png"),
        ];

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = await response.text();
        return text;
    } catch (error) {
        console.error('Error generating content:', error);
        throw error;
    }
}

async function downloadFile(url, outputPath) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

client.once('ready', () => {
    console.log('Chef is ready!');
});

client.on('messageCreate', async message => {
    if (message.content.startsWith('/prompt')) {
        const userPrompt = message.content.slice('/prompt'.length).trim();
        if (userPrompt === "") {
            return message.channel.send("Messages cannot be empty!");
        }
        try {
            if (message.attachments.size > 0) {
                message.attachments.forEach(async attachment => {
                    const fileUrl = attachment.url;
                    const filePath = path.join(__dirname, attachment.name);

                    try {
                        await downloadFile(fileUrl, filePath);

                        const result = await RunProcessWithImage(userPrompt, filePath);
                        message.channel.send(result);

                        fs.unlinkSync(filePath);
                    } catch (error) {
                        console.error(`Error downloading file: ${error.message}`);
                        message.channel.send('An error occurred while downloading the file.');
                    }
                });
            } else {
                const result = await RunProcess(userPrompt);
                message.channel.send(result);
            }
        } catch (error) {
            message.channel.send('An error occurred while processing your request.');
        }
    }

    if (message.content === "/help" || message.content === "!help" || message.content === "help") {
        message.channel.send("`---- Commands ----`\n- **/prompt <your_prompt>** \n- **/help** or **!help** or just **help**");
    }
});

client.login(token);