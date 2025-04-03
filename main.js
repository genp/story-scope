const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1000,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      contextIsolation: false,
      nodeIntegration: true,
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// === OpenAI API call via dynamic import of fetch ===
ipcMain.handle('fetch-genre-and-authors', async (event, text) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'No OpenAI API key provided.';

  const prompt = `You are a literary analyst. Given the following excerpt of creative writing, determine the most likely genre. Be specific (e.g., "psychological horror", "space opera"). Also, recommend 3 authors or specific books that share a similar style or tone.

TEXT:
"""
${text}
"""

GENRE AND RECOMMENDATIONS:`;

  try {
    const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a literary expert and genre analyst." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    });

    const data = await response.json();
    console.log('OpenAI API raw response:', data);
return data.choices?.[0]?.message?.content || `Unexpected response:\n${JSON.stringify(data, null, 2)}`;

  } catch (err) {
    console.error('OpenAI fetch error:', err);
    return 'Error retrieving genre and similar authors.';
  }
});
