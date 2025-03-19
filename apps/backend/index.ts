import express from "express";
import { S3Client } from "bun";
import cors from "cors";
import prisma from "db";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_PROMPT } from "prompt/prompts/systemPrompt"
import { pdfPrompt } from "prompt/prompts/pdfPrompt"
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware } from "./middleware";

const apiKey = Bun.env.GEMINI_API_KEY;


const app = express();
app.use(express.json());
app.use(cors());

const client = new S3Client({
    region: "auto",
    //endpoint: `https://r2.cloudflarestorage.com`,
    endpoint: `https://${Bun.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: Bun.env.S3_ACCESS_KEY,
    secretAccessKey: Bun.env.S3_SECRET_KEY,
    bucket: Bun.env.BUCKET_NAME,
});

app.options("/pre-signedUrl", (req, res) => {
    res.set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.sendStatus(200);
});

app.get("/pre-signedUrl", async (req, res) => {
    const key = `models/${Date.now()}_${Math.random()}.pdf`;

    try {
        console.log("Generating presigned URL for:", {
            bucket: Bun.env.BUCKET_NAME,
            key,
            endpoint: `https://${Bun.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
        });

        const url = client.presign(key, {
            method: "PUT",
            bucket: "test",
            expiresIn: 60 * 5,
            type: "application/pdf",
        });

        console.log("Generated URL:", url);
        res.json({ url, key, message: "File Uploaded" });
    } catch (error: any) {
        console.error("Full error:", error);
        res.status(500).json(
            { error: error?.message || "Internal Server Error" });
    }
});

app.post("/chat", authMiddleware ,  async (req, res) => {
 try {
    const userId = req.userId!
    const openai = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });

    const { message } = req.body;



    if (!message) {
        res.json({
            message: "Invalid Data"
        })
        return
    }
    await prisma.chat.create({
        data: {
            userId ,
            role: "USER", message
        }
    })

    const previousMessage = await prisma.chat.findMany({
        where: {
            userId 
        }, orderBy: {
            createdAt: "asc"
        }
    })

    const convo: ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...previousMessage.map(p => ({
            role: p.role.toLowerCase() as "user" | "assistant" | "system",
            content: p.message || ""
        })),
        { role: "user", content: message }
    ]


    console.log("reached here")
    console.log(convo)
    const response = await openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: convo
    });

    console.log(response)
    const reply = response.choices[0]?.message.content;

    await prisma.chat.create({
        data: {
            userId ,
            role: "ASSISTANT",
            message: reply || ""
        }
    });

    res.json({ reply });
    return
 } catch (error) {
    res.status(500).json({message : "Invalid data"})
 }
  
})

app.post("/pdf" , authMiddleware,   async (req, res) => {
   try {
    const userId = req.userId!
    const { pdfUrl } = req.body;
 
    const genAI = new GoogleGenerativeAI(apiKey as string);
    const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });

    console.log(pdfUrl)
    const pdfResp = await fetch(pdfUrl)
        .then((response) => response.arrayBuffer());

    const result = await model.generateContent([
        {
            inlineData: {
                data: Buffer.from(pdfResp).toString("base64"),
                mimeType: "application/pdf",
            },
        },
        `${pdfPrompt}`,
    ]);
    await prisma.chat.create({
        data: {
            userId ,
            message: result.response.text(),
            role: "ASSISTANT",
        }
    })

    console.log(result.response.text());
    res.json({ reply: result.response.text() })
   } catch (error) {
     res.status(500).json({
        message : "Error occured"
     })
   }
})

app.listen(8000, (() => { console.log("Running on port 8000") }))