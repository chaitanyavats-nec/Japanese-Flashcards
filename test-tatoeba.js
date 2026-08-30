const fetch = require('node-fetch');

async function testTatoeba() {
  const word = "犬";
  const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(word)}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data.results[0], null, 2));
}

testTatoeba().catch(console.error);
