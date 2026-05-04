export async function onRequestGet() {
  return new Response(JSON.stringify({ version: 'v1.1.3' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
