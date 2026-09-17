export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ ok: false });
  return response.status(200).json({
    ok: true,
    service: 'rich-message-mini-app',
    richMessage: true,
    sendDirect: true,
    database: false,
    redis: false,
  });
}
