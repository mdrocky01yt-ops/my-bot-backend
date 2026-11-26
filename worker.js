export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    
    // ডাটাবেস লিংক ভেরিফাই করা
    let dbUrl = "";
    try {
      dbUrl = env.DATABASE_URL.replace('postgres://', 'https://').replace('postgresql://', 'https://');
    } catch(e) {
      return new Response(JSON.stringify({ error: "DATABASE_URL সেট করা নেই!" }), { status: 500, headers: corsHeaders });
    }

    // ১. ভিডিও লিস্ট
    if (url.pathname === "/api/videos" && request.method === "GET") {
      try {
        const response = await fetch(`${dbUrl}/sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
          body: JSON.stringify({ query: 'SELECT * FROM videos ORDER BY id DESC', params: [] })
        });
        
        const data = await response.json();
        
        // যদি Neon থেকে কোনো এরর আসে
        if (data.message || data.error) {
            return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // যদি data.rows থাকে তবে সেটা পাঠান, না থাকলে ফাঁকা লিস্ট পাঠান
        const rows = data.rows ? data.rows : [];
        return new Response(JSON.stringify(rows), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
      } catch (err) {
        // কোনো কারণে এরর হলে ফাঁকা লিস্ট পাঠান, যাতে অ্যাপ ক্র্যাশ না করে
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ২. অ্যাডমিন প্যানেল থেকে ভিডিও যোগ
    if (url.pathname === "/api/add-video" && request.method === "POST") {
      try {
        const body = await request.json();
        if (body.password !== "admin123") {
          return new Response(JSON.stringify({ error: "ভুল পাসওয়ার্ড!" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        await fetch(`${dbUrl}/sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
          body: JSON.stringify({
            query: 'INSERT INTO videos (title, thumbnail_url, file_id, views) VALUES ($1, $2, $3, $4)',
            params: [body.title, body.thumbnail, body.file_id, body.views]
          })
        });
        
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ৩. অ্যাড দেখার পর টোকেন তৈরি
    if (url.pathname === "/api/unlock-video" && request.method === "POST") {
      try {
        const { userId, videoId } = await request.json();
        const token = crypto.randomUUID(); 
        const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();

        await fetch(`${dbUrl}/sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
          body: JSON.stringify({
            query: 'INSERT INTO tokens (user_id, video_id, token, expires_at) VALUES ($1, $2, $3, $4)',
            params: [userId, videoId, token, expiresAt]
          })
        });

        return new Response(JSON.stringify({ 
          success: true, 
          botLink: `https://t.me/FileStorage_bd_bot?start=${token}` 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ৪. টেলিগ্রাম বটের ওয়েবহুক
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message && update.message.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          const firstName = update.message.from.first_name || "বন্ধু";

          // স্টোরেজ বটের কমান্ড (Deep Link: /start TOKEN)
          if (text.startsWith('/start ')) {
            const token = text.split(' ')[1];
            
            const tokenRes = await fetch(`${dbUrl}/sql`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
              body: JSON.stringify({ query: 'SELECT video_id FROM tokens WHERE token = $1 AND used = false AND expires_at > NOW()', params: [token] })
            });
            const tokenData = await tokenRes.json();
            
            if (tokenData.rows && tokenData.rows.length > 0) {
              const videoId = tokenData.rows[0].video_id;
              
              const videoRes = await fetch(`${dbUrl}/sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
                body: JSON.stringify({ query: 'SELECT file_id FROM videos WHERE id = $1', params: [videoId] })
              });
              const videoData = await videoRes.json();
              
              if (videoData.rows && videoData.rows.length > 0) {
                const fileId = videoData.rows[0].file_id;
                
                await fetch(`https://api.telegram.org/bot${env.STORAGE_BOT_TOKEN}/sendVideo`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, video: fileId, caption: "ভিডিওটি ৩০ মিনিট পর মুছে যাবে।" })
                });
                
                await fetch(`${dbUrl}/sql`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Neon-Pooler': 'true' },
                  body: JSON.stringify({ query: 'UPDATE tokens SET used = true WHERE token = $1', params: [token] })
                });
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
      } catch (e) {
        return new Response("Error", { status: 500 });
      }
    }
    return new Response("Bot is running!");
  }
};
