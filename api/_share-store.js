import { Redis } from '@upstash/redis';

const SHARE_TTL_SECONDS = 10 * 60;

let redisClient;

function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error('Redis storage is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the Vercel KV_REST_API_URL/KV_REST_API_TOKEN variables).');
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function keyFor(id) {
  return `rich-message:share:${id}`;
}

export async function createShare(document) {
  const id = crypto.randomUUID().replaceAll('-', '');
  await getRedis().set(keyFor(id), JSON.stringify(document), { ex: SHARE_TTL_SECONDS });
  return id;
}

export async function getShare(id) {
  if (!/^[a-f0-9]{32}$/i.test(id)) return null;
  const value = await getRedis().get(keyFor(id));
  if (!value) return null;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}
