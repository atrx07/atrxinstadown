export async function onRequest(context) {
  const token = context.env.APIFY_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'APIFY_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
