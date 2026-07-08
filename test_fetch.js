import fetch from 'node-fetch';

async function testFetch() {
  const redirectUri = 'http://localhost:5173/auth/google';
  const url = `http://localhost:8080/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(res.status, text);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}
testFetch();
