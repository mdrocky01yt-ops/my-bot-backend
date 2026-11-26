import { neon } from '@neondatabase/serverless';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const sql = neon(env.DATABASE_URL);

    try {
      // ১. ভিডিও লিস্ট আনা
      if (url.pathname === "/api/videos" && request.method === "GET") {
        const videos = await sql`SELECT * FROM videos ORDER BY id DESC`;
        return new Response(JSON.stringify(videos), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ২. নতুন ভিডিও যোগ করা
      if (url.pathname === "/api/add-video" && request.method === "POST") {
        const body = await request.json();
        if (body.password !== "admin123") {
          return new Response(JSON.stringify({ error: "ভুল পাসওয়ার্ড!" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await sql`INSERT INTO videos (title, thumbnail_url, file_id, views) VALUES (${body.title}, ${body.thumbnail}, ${body.file_id}, ${body.views})`;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ৩. টোকেন তৈরি করা (ইউজার অটোমেটিক সেভ হবে)
      if (url.pathname === "/api/unlock-video" && request.method === "POST") {
        const { userId, videoId } = await request.json();
        
        // Foreign Key Error এড়াতে আগে ইউজারকে ডাটাবেসে যোগ করা
        await sql`INSERT INTO users (id, first_name) VALUES (${userId}, 'User') ON CONFLICT (id) DO NOTHING`;

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
        
        await sql`INSERT INTO tokens (user_id, video_id, token, expires_at) VALUES (${userId}, ${videoId}, ${token}, ${expiresAt})`;
        
        return new Response(JSON.stringify({ success: true, botLink: `https://t.me/FileStorage_bd_bot?start=${token}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ৪. টেলিগ্রাম বটের ওয়েবহুক (মেইন এবং স্টোরেজ বট)
      if (request.method === "POST") {
        const update = await request.json();
        
        if (update.message && update.message.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          const firstName = update.message.from.first_name || "বন্ধু";

          // স্টোরেজ বটের কমান্ড (/start TOKEN)
          if (text.startsWith('/start ')) {
            const token = text.split(' ')[1];
            
            const tokenRes = await sql`SELECT video_id FROM tokens WHERE token = ${token} AND used = false AND expires_at > NOW()`;
            
            if (tokenRes.length > 0) {
              const videoId = tokenRes[0].video_id;
              const videoRes = await sql`SELECT file_id FROM videos WHERE id = ${videoId}`;
              
              if (videoRes.length > 0) {
                const fileId = videoRes[0].file_id;
                await fetch(`https://api.telegram.org/bot${env.STORAGE_BOT_TOKEN}/sendVideo`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, video: fileId, caption: "ভিডিওটি ৩০ মিনিট পর মুছে যাবে।" })
                });
                await sql`UPDATE tokens SET used = true WHERE token = ${token}`;
              }
            } else {
              await fetch(`https://api.telegram.org/bot${env.STORAGE_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: "টোকেনটি অবৈধ অথবা মেয়াদোত্তীর্ণ! দয়া করে আবার অ্যাড দেখুন।" })
              });
            }
          } 
          // মেইন বটের /start কমান্ড
          else if (text === "/start") {
            const appUrl = "https://my-telegram-app-7s8.pages.dev";
            await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: `স্বাগতম ${firstName}!\n\nভিডিও দেখতে এবং আনলক করতে নিচের বাটনে ক্লিক করুন।`,
                reply_markup: { inline_keyboard: [[{ text: "🎮 Open App", web_app: { url: appUrl } }]] }
              })
            });
          }
        }
        return new Response("OK");
      }
      
      return new Response("Bot is running!", { headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
