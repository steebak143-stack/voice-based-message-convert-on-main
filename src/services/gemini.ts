import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeAudio(base64Audio: string, mimeType: string) {
  const model = "gemini-3-flash-preview";
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: mimeType,
              },
            },
            {
              text: "Please transcribe this voice message accurately. If there are multiple speakers, label them. If the audio is unclear, provide your best guess.",
            },
          ],
        },
      ],
    });

    return response.text || "No transcription available.";
  } catch (error) {
    console.error("Transcription error:", error);
    return "Error transcribing audio.";
  }
}

export async function summarizeMessage(transcription: string) {
  const model = "gemini-3-flash-preview";
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Summarize this voice message transcription in one short sentence: "${transcription}"`,
            },
          ],
        },
      ],
    });

    return response.text || "No summary available.";
  } catch (error) {
    console.error("Summarization error:", error);
    return "Error summarizing message.";
  }
}
