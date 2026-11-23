// Force update to trigger build
import { neon } from '@neondatabase/serverless';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ১. ভিডিও লিস্ট আনার এপিআই (মিনি অ্যাপের জন্য)
    if (url.pathname === "/api/videos" && request.method === "GET") {
      try {
        const sql = neon(env.DATABASE_URL);
        const videos = await sql`SELECT * FROM videos ORDER BY id DESC`;
        return new Response(JSON.stringify(videos), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ২. টেলিগ্রাম বটের ওয়েবহুক
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message && update.message.text === "/start") {
          const chatId = update.message.chat.id;
          const firstName = update.message.from.first_name || "বন্ধু"; 
          const botToken = env.BOT_TOKEN; 
          const appUrl = "https://my-telegram-app-7s8.pages.dev"; 
          
          const responseText = `স্বাগতম ${firstName}!\n\nভিডিও দেখতে এবং আনলক করতে নিচের বাটনে ক্লিক করুন।`;
          
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: responseText,
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🎮 Open App", web_app: { url: appUrl } }]
                ]
              }
            })
          });
        }
        return new Response("OK");
      } catch (e) {
        return new Response("Error", { status: 500 });
      }
    }
    
    return new Response("Bot is running!");
  }
};
