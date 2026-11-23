export default {
  async fetch(request, env, ctx) {
    // গেটওয়ে চেক
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        // যদি ইউজার /start দেয়
        if (update.message && update.message.text === "/start") {
          const chatId = update.message.chat.id;
          const firstName = update.message.from.first_name;
          
          // টেলিগ্রামে মেসেজ পাঠানোর ফাংশন
          const botToken = env.BOT_TOKEN; // এটি আমরা ক্লাউডফ্লেয়ারে সেট করব
          const appUrl = "https://my-telegram-app-7s8.pages.dev"; // আপনার মিনি অ্যাপের লিংক
          
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
