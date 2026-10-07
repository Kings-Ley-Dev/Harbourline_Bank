import mongoose from 'mongoose';
import { config } from './config.js';

// Cache the connection across serverless invocations (Vercel reuses warm containers).
const cache = globalThis.__mongoose || (globalThis.__mongoose = { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    mongoose.set('strictQuery', true);
    cache.promise = mongoose
      .connect(config.mongoUri, { bufferCommands: false, serverSelectionTimeoutMS: 8000, maxPoolSize: 10 })
      .then((m) => m)
      .catch((e) => {
        cache.promise = null;
        throw e;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
