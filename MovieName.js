import mongoose from 'mongoose';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = '8356350231:AAHu0NJetbTPhvWB8Qx_vUSotyqJO7B_PB8';
const CHANNEL_ID = '-1003389377874';

const bot = new Telegraf(BOT_TOKEN);

// 🎬 Movie schema
const movieSchema = new mongoose.Schema({
  name: { type: String, required: true },
  caption: { type: String },
  poster: { type: Object },
  files: { type: Array },
});
const Movie = mongoose.model('Movie', movieSchema);

// 💬 List message schema
const listMessageSchema = new mongoose.Schema({
  order: Number,
  messageId: Number,
});
const ListMessage = mongoose.model('ListMessage', listMessageSchema);

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
async function exportMovieNamesToTelegram() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    const movies = await Movie.find({}, 'name').sort({ _id: 1 });
    if (movies.length === 0) {
      console.log('⚠️ No movies found in DB');
      return;
    }

    console.log(`📦 Total movies to send: ${movies.length}`);

    const movieTexts = movies.map((movie, i) => {
      const encoded = Buffer.from(movie.name, 'utf-8').toString('base64');
      const safeName = escapeHtml(movie.name);
      return `<b>${i + 1}. ${safeName} → <a href="https://t.me/lord_fourth_movie5_bot?start=${encoded}">Click Here</a></b>`;
    });

    const chunkSize = 35;
    const messages = [];
    for (let i = 0; i < movieTexts.length; i += chunkSize) {
      const chunk = movieTexts.slice(i, i + chunkSize);
      messages.push(chunk.join('\n\n'));
    }

    console.log(`📨 Total message chunks: ${messages.length}`);

    const existingMessages = await ListMessage.find().sort({ order: 1 });

    for (const [index, msg] of messages.entries()) {
      const header =
        index === 0
          ? '🎬 <b>Movie List</b>\n\n'
          : `🎬 <b>Movie List Continued (${index + 1})</b>\n\n`;

      const text = header + msg;

      if (existingMessages[index]) {
        // 🔁 Update existing message
        try {
          await bot.telegram.editMessageText(
            CHANNEL_ID,
            existingMessages[index].messageId,
            undefined,
            text,
            {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            },
          );
          console.log(`✏️ Updated message ${index + 1}`);
        } catch (err) {
          console.error(`⚠️ Edit failed for ${index + 1}: ${err.message}`);
        }
      } else {
        // 🆕 Send new message
        try {
          const sent = await bot.telegram.sendMessage(CHANNEL_ID, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
          await ListMessage.create({
            order: index + 1,
            messageId: sent.message_id,
          });
          console.log(`✅ Sent new message ${index + 1}`);
        } catch (err) {
          console.error(`❌ Failed to send ${index + 1}: ${err.message}`);
        }
      }

      await new Promise((r) => setTimeout(r, 1000)); // avoid flood
    }

    // 🗑️ If extra old messages exist, delete them
    if (existingMessages.length > messages.length) {
      const toDelete = existingMessages.slice(messages.length);
      for (const msg of toDelete) {
        try {
          await bot.telegram.deleteMessage(CHANNEL_ID, msg.messageId);
          await ListMessage.deleteOne({ _id: msg._id });
          console.log(`🗑️ Deleted old message order ${msg.order}`);
        } catch {
          console.warn(`⚠️ Failed to delete old message ${msg.order}`);
        }
      }
    }

    console.log('📤 Movie list synced successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
  }
}

exportMovieNamesToTelegram();
